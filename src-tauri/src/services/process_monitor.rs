use std::path::Path;
use std::time::{Duration, Instant};
use sysinfo::{ProcessRefreshKind, RefreshKind, System};
use tauri::{AppHandle, Emitter};
use sea_orm::DatabaseConnection;
use chrono::Utc;
use serde::Serialize;
use crate::services::playtime_service;
use crate::services::game_service;

#[derive(Clone, Serialize)]
pub struct PlaytimeUpdatedPayload {
    pub game_id: String,
    pub session_seconds: u32,
    pub total_seconds: i64,
    pub formatted: String,
    pub last_played: String,
}

/// Spawns a background task to monitor a game process by executable name or path.
/// When the process exits, records session duration, updates last_played in DB, and emits event to UI.
pub fn start_monitoring(
    app: AppHandle,
    db: DatabaseConnection,
    game_id: String,
    target_exe: String,
) {
    tauri::async_runtime::spawn(async move {
        println!("[ProcessMonitor] Starting tracking for game_id: {}, target_exe: {}", game_id, target_exe);

        let start_time = Utc::now();
        let start_instant = Instant::now();

        let clean_exe_name = Path::new(&target_exe)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| target_exe.clone());

        let clean_exe_lower = clean_exe_name.to_lowercase();
        if clean_exe_lower.is_empty() {
            println!("[ProcessMonitor] Empty target executable name provided. Aborting process monitoring.");
            return;
        }

        let mut sys = System::new_with_specifics(
            RefreshKind::new().with_processes(ProcessRefreshKind::new()),
        );

        let mut found_pid: Option<sysinfo::Pid> = None;
        let detection_start = Instant::now();

        // 1. Wait up to 30 seconds for the game process to launch
        while detection_start.elapsed() < Duration::from_secs(30) {
            sys.refresh_processes_specifics(ProcessRefreshKind::new());

            for (pid, process) in sys.processes() {
                let proc_name = process.name().to_lowercase();
                let proc_exe = process
                    .exe()
                    .map(|p| p.to_string_lossy().to_lowercase())
                    .unwrap_or_default();

                if proc_name == clean_exe_lower
                    || proc_name.contains(&clean_exe_lower)
                    || proc_exe.contains(&clean_exe_lower)
                {
                    found_pid = Some(*pid);
                    println!("[ProcessMonitor] Detected game process '{}' (PID: {})", proc_name, pid);
                    break;
                }
            }

            if found_pid.is_some() {
                break;
            }

            tokio::time::sleep(Duration::from_millis(1500)).await;
        }

        let tracked_pid = match found_pid {
            Some(pid) => pid,
            None => {
                println!("[ProcessMonitor] Process '{}' not detected after 30s. Aborting background monitoring.", clean_exe_name);
                return;
            }
        };

        // 2. Poll until process exits
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            sys.refresh_processes_specifics(ProcessRefreshKind::new());

            if sys.process(tracked_pid).is_none() {
                // Double-check all processes in case PID changed or child process inherited execution
                sys.refresh_processes_specifics(ProcessRefreshKind::new());
                let still_running = sys.processes().values().any(|p| {
                    let name = p.name().to_lowercase();
                    let exe = p.exe().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
                    name == clean_exe_lower || exe.contains(&clean_exe_lower)
                });

                if !still_running {
                    println!("[ProcessMonitor] Game process for '{}' has exited.", clean_exe_name);
                    break;
                }
            }
        }

        // 3. Calculate session duration and end time
        let duration_seconds = start_instant.elapsed().as_secs() as u32;
        let ended_at_iso = Utc::now().to_rfc3339();

        println!("[ProcessMonitor] Session ended! Duration: {} seconds for {}", duration_seconds, game_id);

        // Record finished session in DB
        match playtime_service::record_finished_session(
            &db,
            &game_id,
            &start_time.to_rfc3339(),
            &ended_at_iso,
            duration_seconds,
        ).await {
            Ok(_) => println!("[ProcessMonitor] Recorded play session in DB successfully."),
            Err(e) => eprintln!("[ProcessMonitor] Failed to record play session: {}", e),
        }

        // Persist last_played timestamp in database
        if let Err(e) = game_service::touch_last_played(&db, &game_id, &ended_at_iso).await {
            eprintln!("[ProcessMonitor] Failed to update last_played timestamp: {}", e);
        }

        // Fetch updated total playtime stats
        let total_seconds = playtime_service::get_total_playtime(&db, &game_id).await.unwrap_or(0);
        let formatted = playtime_service::format_playtime(total_seconds);

        // 4. Emit event to frontend
        let payload = PlaytimeUpdatedPayload {
            game_id: game_id.clone(),
            session_seconds: duration_seconds,
            total_seconds,
            formatted,
            last_played: ended_at_iso,
        };

        if let Err(e) = app.emit("playtime-updated", payload) {
            eprintln!("[ProcessMonitor] Failed to emit playtime-updated event to UI: {}", e);
        }
    });
}
