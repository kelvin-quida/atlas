use std::path::{Path, PathBuf};
use std::time::{Instant, Duration};
use tauri::Manager;
use tokio::sync::Mutex;
use sea_orm::DatabaseConnection;
use sea_orm_migration::MigratorTrait;

// ── Sub-modules ──────────────────────────────────────────────────────────────
pub mod database;
pub mod models;
pub mod providers;
pub mod services;
pub mod commands;

// ── IGDB / Twitch credentials ─────────────────────────────────────────────────
const CLIENT_ID: &str = "tdcgkpt4ojpb1bdvmgxo0gufofipj3";
const CLIENT_SECRET: &str = "yn53jn1amldun5lfeagwjrvmvlp3br";

// ── Cached Twitch OAuth token ─────────────────────────────────────────────────
pub struct TwitchToken {
    pub access_token: String,
    pub expires_at: Instant,
}

// ── Global app state (shared across all Tauri commands via .manage()) ─────────
pub struct AppState {
    pub db: DatabaseConnection,
    pub igdb_token: Mutex<Option<TwitchToken>>,
    pub app_data_dir: PathBuf,
}

impl AppState {
    /// Returns a valid Twitch OAuth token, refreshing it if expired.
    pub async fn get_igdb_token(&self) -> Result<String, String> {
        let mut token_guard = self.igdb_token.lock().await;

        if let Some(ref token) = *token_guard {
            if Instant::now() < token.expires_at {
                return Ok(token.access_token.clone());
            }
        }

        // Fetch new token from Twitch
        let client = reqwest::Client::new();
        let response = client
            .post("https://id.twitch.tv/oauth2/token")
            .query(&[
                ("client_id", CLIENT_ID),
                ("client_secret", CLIENT_SECRET),
                ("grant_type", "client_credentials"),
            ])
            .send()
            .await
            .map_err(|e| format!("Twitch auth request failed: {}", e))?;

        #[derive(serde::Deserialize)]
        struct TokenResponse {
            access_token: String,
            expires_in: u64,
        }

        let res = response
            .json::<TokenResponse>()
            .await
            .map_err(|e| format!("Failed to parse Twitch token response: {}", e))?;

        let expires_at =
            Instant::now() + Duration::from_secs(res.expires_in.saturating_sub(60));

        let access_token = res.access_token.clone();
        *token_guard = Some(TwitchToken {
            access_token: res.access_token,
            expires_at,
        });

        Ok(access_token)
    }
}

// ── IGDB response types ───────────────────────────────────────────────────────
#[derive(serde::Deserialize)]
struct IgdbCover {
    url: Option<String>,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct IgdbGame {
    name: String,
    cover: Option<IgdbCover>,
}

// ── Legacy SteamGame type (kept for backward compat with get_installed_games) ─
#[derive(serde::Serialize, Clone)]
struct SteamGame {
    appid: String,
    name: String,
    installdir: String,
    library_path: String,
    image_url: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Steam scanning helpers
// ─────────────────────────────────────────────────────────────────────────────

fn get_steam_install_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"])
            .output()
        {
            if output.status.success() {
                if let Ok(stdout) = String::from_utf8(output.stdout) {
                    for line in stdout.lines() {
                        if line.contains("SteamPath") {
                            let parts: Vec<&str> = line.split("REG_SZ").collect();
                            if parts.len() >= 2 {
                                let path = parts[1].trim().replace("/", "\\");
                                let path_buf = PathBuf::from(path);
                                if path_buf.exists() {
                                    return Some(path_buf);
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", "HKLM\\Software\\Wow6432Node\\Valve\\Steam", "/v", "InstallPath"])
            .output()
        {
            if output.status.success() {
                if let Ok(stdout) = String::from_utf8(output.stdout) {
                    for line in stdout.lines() {
                        if line.contains("InstallPath") {
                            let parts: Vec<&str> = line.split("REG_SZ").collect();
                            if parts.len() >= 2 {
                                let path = parts[1].trim().to_string();
                                let path_buf = PathBuf::from(path);
                                if path_buf.exists() {
                                    return Some(path_buf);
                                }
                            }
                        }
                    }
                }
            }
        }

        let default_path = PathBuf::from("C:\\Program Files (x86)\\Steam");
        if default_path.exists() {
            return Some(default_path);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let paths = vec![
                format!("{}/.local/share/Steam", home),
                format!("{}/.steam/steam", home),
                format!("{}/.var/app/com.valvesoftware.Steam/.local/share/Steam", home),
            ];
            for p in paths {
                let path_buf = PathBuf::from(p);
                if path_buf.exists() {
                    return Some(path_buf);
                }
            }
        }
    }

    None
}

pub fn get_steam_libraries() -> Vec<PathBuf> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    let mut libraries = Vec::new();
    let steam_path = get_steam_install_path();
    if let Some(ref path) = steam_path {
        libraries.push(path.clone());
        let vdf_path = path.join("steamapps").join("libraryfolders.vdf");
        if vdf_path.exists() {
            if let Ok(file) = File::open(&vdf_path) {
                let reader = BufReader::new(file);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        if line.contains("\"path\"") {
                            let parts: Vec<&str> = line.split('"').collect();
                            if parts.len() >= 4 {
                                let lib_path = parts[3].replace("\\\\", "\\");
                                let path_buf = PathBuf::from(lib_path);
                                if path_buf.exists() && !libraries.contains(&path_buf) {
                                    libraries.push(path_buf);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if libraries.is_empty() {
        #[cfg(target_os = "windows")]
        {
            for p in ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam", "D:\\Steam", "E:\\Steam"] {
                let pb = PathBuf::from(p);
                if pb.exists() {
                    libraries.push(pb);
                }
            }
        }
        #[cfg(target_os = "linux")]
        {
            if let Ok(home) = std::env::var("HOME") {
                for p in [
                    format!("{}/.local/share/Steam", home),
                    format!("{}/.steam/steam", home),
                ] {
                    let pb = PathBuf::from(p);
                    if pb.exists() {
                        libraries.push(pb);
                    }
                }
            }
        }
    }

    libraries
}

pub fn get_installed_steam_appids() -> std::collections::HashSet<String> {
    let mut installed = std::collections::HashSet::new();
    for lib in get_steam_libraries() {
        let steamapps_path = lib.join("steamapps");
        if let Ok(entries) = std::fs::read_dir(&steamapps_path) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().into_owned();
                if file_name.starts_with("appmanifest_") && file_name.ends_with(".acf") {
                    let appid = file_name
                        .trim_start_matches("appmanifest_")
                        .trim_end_matches(".acf")
                        .to_string();
                    if !appid.is_empty() {
                        installed.insert(appid);
                    }
                }
            }
        }
    }
    installed
}

fn extract_acf_value(line: &str) -> Option<String> {
    let parts: Vec<&str> = line.split('"').collect();
    if parts.len() >= 4 {
        Some(parts[3].to_string())
    } else {
        None
    }
}

fn parse_acf_file(path: &Path, library_path: &Path) -> Option<SteamGame> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut appid = String::new();
    let mut name = String::new();
    let mut installdir = String::new();

    for line in reader.lines() {
        if let Ok(line) = line {
            let line = line.trim();
            if line.contains("\"appid\"") {
                appid = extract_acf_value(line)?;
            } else if line.contains("\"name\"") {
                name = extract_acf_value(line)?;
            } else if line.contains("\"installdir\"") {
                installdir = extract_acf_value(line)?;
            }
        }
    }

    if appid.is_empty() || name.is_empty() {
        return None;
    }
    if crate::services::steam_service::is_steam_tool_or_proton(&name, Some(&appid)) {
        return None;
    }

    let image_url = format!(
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900.jpg",
        appid
    );

    Some(SteamGame {
        appid,
        name,
        installdir,
        library_path: library_path.to_string_lossy().into_owned(),
        image_url,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands — legacy / platform
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_installed_games() -> Vec<SteamGame> {
    let mut games = Vec::new();
    for lib in get_steam_libraries() {
        let steamapps_path = lib.join("steamapps");
        if !steamapps_path.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&steamapps_path) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().into_owned();
                if file_name.starts_with("appmanifest_") && file_name.ends_with(".acf") {
                    if let Some(game) = parse_acf_file(&entry.path(), &lib) {
                        games.push(game);
                    }
                }
            }
        }
    }
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    games
}

#[tauri::command]
async fn launch_game(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    appid: String,
) -> Result<String, String> {
    use sea_orm::{ColumnTrait, QueryFilter, EntityTrait};
    use crate::models::game;

    let db = state.db.clone();
    let game_opt = game::Entity::find()
        .filter(
            sea_orm::Condition::any()
                .add(game::Column::SteamAppId.eq(&appid))
                .add(game::Column::Id.eq(&appid))
        )
        .one(&db)
        .await
        .ok()
        .flatten();

    let target_exe = game_opt
        .as_ref()
        .and_then(|g| g.exe_path.clone())
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| {
            game_opt.as_ref().map(|g| g.name.clone()).unwrap_or_else(|| appid.clone())
        });

    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("cmd")
            .args(["/C", &format!("start steam://run/{}", appid)])
            .status();
        match status {
            Ok(s) if s.success() => {
                services::process_monitor::start_monitoring(app, db, appid.clone(), target_exe);
                Ok(format!("Successfully launched {}", appid))
            }
            Ok(s) => Err(format!("Command exited with status code: {}", s)),
            Err(e) => Err(format!("Failed to execute command: {}", e)),
        }
    }
    #[cfg(target_os = "linux")]
    {
        let status = std::process::Command::new("xdg-open")
            .arg(format!("steam://run/{}", appid))
            .status();
        match status {
            Ok(s) if s.success() => {
                services::process_monitor::start_monitoring(app, db, appid.clone(), target_exe);
                Ok(format!("Successfully launched {}", appid))
            }
            Ok(s) => Err(format!("Command exited with status code: {}", s)),
            Err(e) => Err(format!("Failed to execute command: {}", e)),
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Unsupported platform".to_string())
    }
}

#[tauri::command]
fn is_shell_replacement_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("reg")
            .args(["query", "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon", "/v", "Shell"])
            .output();
        match output {
            Ok(out) => {
                if out.status.success() {
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    if let Ok(exe_path) = std::env::current_exe() {
                        if let Some(exe_name) = exe_path.file_name() {
                            return Ok(stdout.contains(&*exe_name.to_string_lossy()));
                        }
                    }
                    Ok(stdout.contains("tauri-app"))
                } else {
                    Ok(false)
                }
            }
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn toggle_shell_replacement(enable: bool) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        if enable {
            let current_exe = std::env::current_exe()
                .map_err(|e| format!("Failed to get current executable path: {}", e))?;
            let path_str = current_exe.to_string_lossy().to_string();
            let status = std::process::Command::new("reg")
                .args([
                    "add",
                    "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon",
                    "/v", "Shell", "/t", "REG_SZ", "/d", &path_str, "/f",
                ])
                .status()
                .map_err(|e| format!("Failed to run reg.exe: {}", e))?;
            if status.success() {
                Ok("Shell replacement enabled successfully".to_string())
            } else {
                Err("reg.exe exited with an error status".to_string())
            }
        } else {
            let status = std::process::Command::new("reg")
                .args([
                    "delete",
                    "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon",
                    "/v", "Shell", "/f",
                ])
                .status()
                .map_err(|e| format!("Failed to run reg.exe: {}", e))?;
            if status.success() {
                Ok("Shell replacement disabled successfully (restored to explorer.exe)".to_string())
            } else {
                Err("reg.exe exited with an error status".to_string())
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Registry shell replacement is only supported on Windows.".to_string())
    }
}

#[tauri::command]
fn pick_file(filter: &str, title: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let script = format!(
            r#"
            Add-Type -AssemblyName System.Windows.Forms;
            $FileBrowser = New-Object System.Windows.Forms.OpenFileDialog;
            $FileBrowser.Filter = "{}";
            $FileBrowser.Title = "{}";
            $Show = $FileBrowser.ShowDialog();
            if ($Show -eq "OK") {{ Write-Host $FileBrowser.FileName -NoNewline }}
            "#,
            filter, title
        );
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                Err("Canceled".to_string())
            } else {
                Ok(path)
            }
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
    #[cfg(target_os = "linux")]
    {
        let output = std::process::Command::new("zenity")
            .args(["--file-selection", &format!("--title={}", title)])
            .output();
        match output {
            Ok(out) if out.status.success() => {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() { Err("Canceled".to_string()) } else { Ok(path) }
            }
            _ => {
                let out2 = std::process::Command::new("kdialog")
                    .args(["--getopenfilename", ".", "*"])
                    .output();
                match out2 {
                    Ok(o) if o.status.success() => {
                        let path = String::from_utf8_lossy(&o.stdout).trim().to_string();
                        if path.is_empty() { Err("Canceled".to_string()) } else { Ok(path) }
                    }
                    _ => Err("Nenhum seletor de arquivos encontrado no Linux".to_string()),
                }
            }
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Plataforma não suportada para seleção de arquivos".to_string())
    }
}

#[tauri::command]
fn launch_custom_game(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    exe_path: &str,
    game_id: Option<String>,
) -> Result<String, String> {
    let path = Path::new(exe_path);
    if !path.exists() {
        return Err("O arquivo executável não existe no caminho especificado.".to_string());
    }
    let parent_dir = path
        .parent()
        .ok_or_else(|| "Não foi possível obter o diretório do executável.".to_string())?;

    let id = game_id.unwrap_or_else(|| exe_path.to_string());

    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "Start-Process -FilePath '{}' -WorkingDirectory '{}'",
                    path.to_string_lossy().replace('\'', "''"),
                    parent_dir.to_string_lossy().replace('\'', "''")
                ),
            ])
            .status();
        match status {
            Ok(s) if s.success() => {
                services::process_monitor::start_monitoring(app, state.db.clone(), id, exe_path.to_string());
                Ok("Jogo customizado iniciado com sucesso".to_string())
            }
            Ok(s) => Err(format!("O PowerShell retornou código de erro: {}", s)),
            Err(e) => Err(format!("Falha ao executar o comando PowerShell: {}", e)),
        }
    }
    #[cfg(target_os = "linux")]
    {
        match std::process::Command::new(path).current_dir(parent_dir).spawn() {
            Ok(_) => {
                services::process_monitor::start_monitoring(app, state.db.clone(), id, exe_path.to_string());
                Ok("Jogo customizado iniciado com sucesso".to_string())
            }
            Err(e) => Err(format!("Falha ao executar o processo: {}", e)),
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Plataforma não suportada".to_string())
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct InstalledApp {
    name: String,
    path: String,
}

#[derive(serde::Serialize, Clone, Debug)]
struct FileItem {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
fn get_installed_apps() -> Result<Vec<InstalledApp>, String> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
        $sh = New-Object -ComObject WScript.Shell
        $paths = @(
            "C:\ProgramData\Microsoft\Windows\Start Menu\Programs",
            "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
        )
        $apps = [System.Collections.Generic.List[Object]]::new()
        foreach ($p in $paths) {
            if (Test-Path $p) {
                Get-ChildItem -Path $p -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
                    try {
                        $lnk = $sh.CreateShortcut($_.FullName)
                        $target = $lnk.TargetPath
                        if ($target -and $target.EndsWith(".exe") -and (Test-Path $target)) {
                            $apps.Add(@{
                                name = $_.BaseName
                                path = $target
                            })
                        }
                    } catch {}
                }
            }
        }
        ConvertTo-Json -InputObject $apps -Compress
        "#;
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", script])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() {
                return Ok(Vec::new());
            }
            let apps: Vec<InstalledApp> = serde_json::from_str(&stdout).unwrap_or_else(|_| {
                if let Ok(single) = serde_json::from_str::<InstalledApp>(&stdout) {
                    vec![single]
                } else {
                    Vec::new()
                }
            });
            let mut unique_apps = std::collections::HashMap::new();
            for app in apps {
                unique_apps.insert(app.path.clone(), app);
            }
            let mut result: Vec<InstalledApp> = unique_apps.into_values().collect();
            result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
            Ok(result)
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![
            InstalledApp { name: "Mock Game 1".to_string(), path: "/usr/bin/mock1".to_string() },
            InstalledApp { name: "Mock Game 2".to_string(), path: "/usr/bin/mock2".to_string() },
        ])
    }
}

#[tauri::command]
fn get_drives() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let mut drives = Vec::new();
        for letter in b'A'..=b'Z' {
            let drive_path = format!("{}:\\", letter as char);
            if Path::new(&drive_path).exists() {
                drives.push(drive_path);
            }
        }
        if drives.is_empty() {
            drives.push("C:\\".to_string());
        }
        drives
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec!["/".to_string()]
    }
}

#[tauri::command]
fn list_dir_contents(path: &str, allowed_extensions: Vec<String>) -> Result<Vec<FileItem>, String> {
    let dir_path = Path::new(path);
    if !dir_path.exists() {
        return Err("Diretório não existe".to_string());
    }
    let mut items = Vec::new();
    for entry in std::fs::read_dir(dir_path).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let full_path = entry.path().to_string_lossy().into_owned();
        if name.starts_with('.') || name.starts_with('$') {
            continue;
        }
        if let Ok(ft) = entry.file_type() {
            let is_dir = ft.is_dir();
            if !is_dir && !allowed_extensions.is_empty() {
                let ext = entry.path().extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_lowercase())
                    .unwrap_or_default();
                if !allowed_extensions.contains(&ext) {
                    continue;
                }
            }
            items.push(FileItem { name, path: full_path, is_dir });
        }
    }
    items.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });
    Ok(items)
}

#[tauri::command]
fn search_files_recursive(
    root_path: &str,
    query: &str,
    allowed_extensions: Vec<String>,
) -> Result<Vec<FileItem>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    fn walk(
        dir: &Path,
        current_depth: usize,
        max_depth: usize,
        query: &str,
        allowed_exts: &[String],
        results: &mut Vec<FileItem>,
    ) {
        if current_depth > max_depth || results.len() >= 100 {
            return;
        }

        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            if results.len() >= 100 {
                break;
            }
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();

            if name.starts_with('.') || name.starts_with('$') || name == "System Volume Information" {
                continue;
            }

            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    if name.to_lowercase().contains(query) {
                        results.push(FileItem {
                            name: name.clone(),
                            path: path.to_string_lossy().into_owned(),
                            is_dir: true,
                        });
                    }
                    walk(&path, current_depth + 1, max_depth, query, allowed_exts, results);
                } else {
                    let ext = path.extension()
                        .and_then(|e| e.to_str())
                        .map(|s| s.to_lowercase())
                        .unwrap_or_default();

                    let ext_matches = allowed_exts.is_empty() || allowed_exts.contains(&ext);
                    if ext_matches && name.to_lowercase().contains(query) {
                        results.push(FileItem {
                            name,
                            path: path.to_string_lossy().into_owned(),
                            is_dir: false,
                        });
                    }
                }
            }
        }
    }

    let search_root = if root_path.is_empty() {
        #[cfg(target_os = "windows")]
        { PathBuf::from("C:\\") }
        #[cfg(not(target_os = "windows"))]
        { PathBuf::from("/") }
    } else {
        PathBuf::from(root_path)
    };

    walk(&search_root, 0, 5, &query_lower, &allowed_extensions, &mut results);

    results.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(results)
}

#[tauri::command]
fn get_parent_path(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    match p.parent() {
        Some(parent) => {
            let s = parent.to_string_lossy().into_owned();
            if s.is_empty() || s == path { Ok("".to_string()) } else { Ok(s) }
        }
        None => Ok("".to_string()),
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct MovieItem {
    pub id: String,
    pub title: String,
    pub file_name: String,
    pub path: String,
    pub extension: String,
    pub folder_path: String,
    pub size_mb: f64,
}

#[tauri::command]
fn open_path_in_system(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err("O arquivo ou pasta não existe no caminho especificado.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!("Start-Process -FilePath '{}'", p.to_string_lossy().replace('\'', "''")),
            ])
            .status();
        match status {
            Ok(s) if s.success() => Ok("Aberto com sucesso".to_string()),
            Ok(s) => Err(format!("O PowerShell retornou erro: {}", s)),
            Err(e) => Err(format!("Falha no PowerShell: {}", e)),
        }
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(path).spawn();
        Ok("Aberto com sucesso".to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Plataforma não suportada".to_string())
    }
}

#[tauri::command]
fn scan_movies_in_folder(folder_path: &str) -> Result<Vec<MovieItem>, String> {
    let root = Path::new(folder_path);
    if !root.exists() || !root.is_dir() {
        return Err("A pasta especificada não foi encontrada.".to_string());
    }

    let video_extensions = vec!["mp4", "mkv", "avi", "mov", "webm", "m4v", "ts", "flv", "wmv"];
    let mut movies = Vec::new();

    fn walk_dir(
        dir: &Path,
        root_str: &str,
        video_exts: &[&str],
        movies: &mut Vec<MovieItem>,
        depth: usize,
    ) {
        if depth > 8 || movies.len() >= 500 {
            return;
        }

        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            if movies.len() >= 500 {
                break;
            }
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();

            if name.starts_with('.') || name.starts_with('$') || name == "System Volume Information" {
                continue;
            }

            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    walk_dir(&path, root_str, video_exts, movies, depth + 1);
                } else if ft.is_file() {
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|s| s.to_lowercase())
                        .unwrap_or_default();

                    if video_exts.contains(&ext.as_str()) {
                        let full_path = path.to_string_lossy().into_owned();
                        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        let size_mb = (size_bytes as f64) / (1024.0 * 1024.0);

                        let file_stem = path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or(&name);
                        let clean_title = clean_movie_title(file_stem);

                        movies.push(MovieItem {
                            id: format!("{:x}", md5_hash(&full_path)),
                            title: clean_title,
                            file_name: name,
                            path: full_path,
                            extension: ext.to_uppercase(),
                            folder_path: root_str.to_string(),
                            size_mb: (size_mb * 100.0).round() / 100.0,
                        });
                    }
                }
            }
        }
    }

    walk_dir(root, folder_path, &video_extensions, &mut movies, 0);

    movies.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(movies)
}

fn clean_movie_title(raw: &str) -> String {
    let mut clean = raw.replace('.', " ").replace('_', " ").replace('-', " ");
    let noise = [
        "1080p", "720p", "2160p", "4k", "bluray", "web-dl", "webrip", "hdrip", "x264", "x265",
        "hevc", "aac", "dts", "dualaudio", "dublado", "legendado", "remux", "yts", "rarbg", "10bit",
    ];

    for term in noise {
        clean = clean.replace(term, "");
        let upper = term.to_uppercase();
        clean = clean.replace(&upper, "");
    }

    let result = clean.split_whitespace().collect::<Vec<_>>().join(" ");
    if result.is_empty() {
        raw.to_string()
    } else {
        result
    }
}

fn md5_hash(input: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    hasher.finish()
}

/// Searches IGDB for a game cover and returns the high-quality URL.
/// Downloads the image to disk and returns the local asset path if successful.
#[tauri::command]
async fn get_game_image_url(
    game_name: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let token = state.get_igdb_token().await?;
    let client = reqwest::Client::new();
    let escaped_name = game_name.replace('"', "\\\"");
    let body = format!("search \"{}\"; fields name, cover.url; limit 1;", escaped_name);

    let response = client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", CLIENT_ID)
        .header("Authorization", format!("Bearer {}", token))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("IGDB request failed: {}", e))?;

    let games = response
        .json::<Vec<IgdbGame>>()
        .await
        .map_err(|e| format!("Failed to parse IGDB response: {}", e))?;

    if let Some(game) = games.first() {
        if let Some(ref cover) = game.cover {
            if let Some(ref url) = cover.url {
                let mut full_url = url.clone();
                if full_url.starts_with("//") {
                    full_url = format!("https:{}", full_url);
                }
                // Use high-quality 720p instead of thumb
                full_url = full_url.replace("t_thumb", "t_720p");
                return Ok(full_url);
            }
        }
    }

    Err("Nenhuma imagem de capa encontrada para este jogo".to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube TV webview
// ─────────────────────────────────────────────────────────────────────────────

const YOUTUBE_TV_INIT_SCRIPT: &str = r#"
(function() {
    if (window.__ATLAS_TV_INJECTED) return;
    window.__ATLAS_TV_INJECTED = true;

    // Load initial stored volume (or default 1.0)
    let savedVol = parseFloat(localStorage.getItem('atlas_yt_volume'));
    if (isNaN(savedVol) || savedVol < 0 || savedVol > 1) {
        savedVol = 1.0;
    }
    let targetVolume = savedVol;

    // Enforce volume on any video element on page
    const syncVolume = () => {
        const videos = document.querySelectorAll('video');
        videos.forEach(v => {
            if (v && Math.abs(v.volume - targetVolume) > 0.01) {
                v.volume = targetVolume;
            }
        });
    };

    // Monitor DOM for volume changes & new video elements
    document.addEventListener('volumechange', (e) => {
        const v = e.target;
        if (v && v.tagName === 'VIDEO' && Math.abs(v.volume - targetVolume) > 0.01) {
            v.volume = targetVolume;
        }
    }, true);

    // Periodically enforce target volume to prevent YouTube SPA player from overriding it
    setInterval(syncVolume, 500);

    // Toast HUD overlay for volume control feedback
    let toastTimeout = null;
    const showVolumeToast = (vol) => {
        let toast = document.getElementById('atlas-yt-vol-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'atlas-yt-vol-toast';
            toast.style.cssText = `
                position: fixed;
                top: 30px;
                right: 30px;
                background: rgba(15, 15, 20, 0.85);
                color: #fff;
                font-family: system-ui, sans-serif;
                font-size: 18px;
                font-weight: 600;
                padding: 12px 20px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                z-index: 999999;
                transition: opacity 0.3s ease, transform 0.3s ease;
                display: flex;
                align-items: center;
                gap: 10px;
                pointer-events: none;
            `;
            document.body.appendChild(toast);
        }
        const pct = Math.round(vol * 100);
        const icon = pct === 0 ? '🔇' : pct < 50 ? '🔉' : '🔊';
        toast.innerHTML = `<span>${icon}</span> Volume: ${pct}%`;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';

        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
        }, 1500);
    };

    // Inject high quality display overrides
    const injectStyles = () => {
        const style = document.createElement('style');
        style.id = 'atlas-tv-sharpness';
        style.textContent = `
            html, body, #app {
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
                text-rendering: optimizeLegibility !important;
            }
            img {
                image-rendering: -webkit-optimize-contrast !important;
            }
        `;
        if (document.head) document.head.appendChild(style);
        else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    };
    injectStyles();

    function simulateKey(key, code, keyCode) {
        const target = document.activeElement || document.body;
        const opts = {
            key: key, code: code, keyCode: keyCode, which: keyCode,
            bubbles: true, cancelable: true
        };
        target.dispatchEvent(new KeyboardEvent('keydown', opts));
        target.dispatchEvent(new KeyboardEvent('keyup', opts));
    }

    window.__ATLAS_TV = function(action) {
        switch(action) {
            case 'navigate_up':    simulateKey('ArrowUp',    'ArrowUp',    38); break;
            case 'navigate_down':  simulateKey('ArrowDown',  'ArrowDown',  40); break;
            case 'navigate_left':  simulateKey('ArrowLeft',  'ArrowLeft',  37); break;
            case 'navigate_right': simulateKey('ArrowRight', 'ArrowRight', 39); break;
            case 'click':          simulateKey('Enter', 'Enter', 13); break;
            case 'back':           simulateKey('Escape', 'Escape', 27); break;
            case 'play_pause':     simulateKey(' ', 'Space', 32); break;
            case 'seek_back':      simulateKey('j', 'KeyJ', 74); break;
            case 'seek_forward':   simulateKey('l', 'KeyL', 76); break;
            case 'volume_up': {
                targetVolume = Math.min(1, Math.round((targetVolume + 0.05) * 100) / 100);
                localStorage.setItem('atlas_yt_volume', targetVolume.toString());
                syncVolume();
                showVolumeToast(targetVolume);
                break;
            }
            case 'volume_down': {
                targetVolume = Math.max(0, Math.round((targetVolume - 0.05) * 100) / 100);
                localStorage.setItem('atlas_yt_volume', targetVolume.toString());
                syncVolume();
                showVolumeToast(targetVolume);
                break;
            }
            case 'fullscreen': simulateKey('f', 'KeyF', 70); break;
        }
    };

    console.log('[Atlas] YouTube TV gamepad bridge & persistent volume injected.');
})();
"#;

#[tauri::command]
async fn open_youtube_webview(app: tauri::AppHandle) -> Result<(), String> {
    let main_window = app
        .get_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;

    if app.get_webview("youtube").is_some() {
        return Ok(());
    }

    let size = main_window.inner_size().map_err(|e| e.to_string())?;

    let webview_builder = tauri::WebviewBuilder::new(
        "youtube",
        tauri::WebviewUrl::External(tauri::Url::parse("https://www.youtube.com/tv").unwrap()),
    )
    .user_agent("Mozilla/5.0 (PS4; Leanback Shell) Cobalt/24.lts.13.1032728-gold v8/8.8.278.8-jit gles Starboard/14, SystemIntegratorName_PS4_ChipsetModelNumber_2024/FirmwareVersion (Sony, PS4, Wired)")
    .initialization_script(YOUTUBE_TV_INIT_SCRIPT)
    .auto_resize();

    main_window
        .add_child(
            webview_builder,
            tauri::PhysicalPosition::new(0, 0),
            tauri::PhysicalSize::new(size.width, size.height),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Twitch webview
// ─────────────────────────────────────────────────────────────────────────────

const TWITCH_TV_INIT_SCRIPT: &str = r#"
(function() {
    if (window.__ATLAS_TWITCH_INJECTED) return;
    window.__ATLAS_TWITCH_INJECTED = true;

    // Load initial stored volume (or default 1.0)
    let savedVol = parseFloat(localStorage.getItem('atlas_twitch_volume'));
    if (isNaN(savedVol) || savedVol < 0 || savedVol > 1) {
        savedVol = 1.0;
    }
    let targetVolume = savedVol;

    // Enforce volume on any video element on page
    const syncVolume = () => {
        const videos = document.querySelectorAll('video');
        videos.forEach(v => {
            if (v && Math.abs(v.volume - targetVolume) > 0.01) {
                v.volume = targetVolume;
            }
        });
    };

    // Monitor DOM for volume changes & new video elements
    document.addEventListener('volumechange', (e) => {
        const v = e.target;
        if (v && v.tagName === 'VIDEO' && Math.abs(v.volume - targetVolume) > 0.01) {
            v.volume = targetVolume;
        }
    }, true);

    // Periodically enforce target volume to prevent player from overriding it
    setInterval(syncVolume, 500);

    // Toast HUD overlay for volume control feedback
    let toastTimeout = null;
    const showVolumeToast = (vol) => {
        let toast = document.getElementById('atlas-twitch-vol-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'atlas-twitch-vol-toast';
            toast.style.cssText = `
                position: fixed;
                top: 30px;
                right: 30px;
                background: rgba(15, 15, 20, 0.85);
                color: #fff;
                font-family: system-ui, sans-serif;
                font-size: 18px;
                font-weight: 600;
                padding: 12px 20px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                z-index: 999999;
                transition: opacity 0.3s ease, transform 0.3s ease;
                display: flex;
                align-items: center;
                gap: 10px;
                pointer-events: none;
            `;
            document.body.appendChild(toast);
        }
        const pct = Math.round(vol * 100);
        const icon = pct === 0 ? '🔇' : pct < 50 ? '🔉' : '🔊';
        toast.innerHTML = `<span>${icon}</span> Volume: ${pct}%`;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';

        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
        }, 1500);
    };

    // 1. Inject Clean TV CSS & Single Focus Highlight
    const injectStyles = () => {
        const style = document.createElement('style');
        style.id = 'atlas-twitch-tv-engine';
        style.textContent = `
            html {
                font-size: 100% !important;
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
                text-rendering: optimizeLegibility !important;
                overflow-x: hidden !important;
                background-color: #0e0e10 !important;
            }

            /* Hide Web Banners, Cookie Consent Prompts & Popups */
            .consent-banner,
            [data-a-target="cookie-banner"],
            .tw-banner,
            #tw-cookie-banner,
            div[aria-label="Cookie Banner"] {
                display: none !important;
            }

            /* Single Active Neon Focus Highlight */
            .atlas-spatial-focused,
            a:focus-visible,
            button:focus-visible,
            input:focus-visible {
                outline: 3px solid #9146FF !important;
                outline-offset: 2px !important;
                box-shadow: 0 0 18px rgba(145, 70, 255, 0.85) !important;
                border-radius: 6px !important;
                z-index: 9999 !important;
                transition: outline 0.1s ease, box-shadow 0.1s ease !important;
            }
        `;
        if (document.head) document.head.appendChild(style);
        else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    };
    injectStyles();

    // Remove focus highlight class from all elements
    function clearSpatialFocus() {
        document.querySelectorAll('.atlas-spatial-focused').forEach(el => {
            el.classList.remove('atlas-spatial-focused');
        });
    }

    // Filter meaningful focusable cards, buttons, links and inputs
    function getFocusableElements() {
        const selector = 'a[href], button:not([disabled]), input:not([disabled]), [data-a-target="preview-card-image-link"]';
        const elements = Array.from(document.querySelectorAll(selector));
        
        return elements.filter(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width < 12 || rect.height < 12) return false;

            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

            // Avoid nested focus targets inside a parent link
            let p = el.parentElement;
            while (p && p !== document.body) {
                if (p.tagName === 'A' && p !== el) return false;
                p = p.parentElement;
            }

            return rect.bottom >= -50 && rect.top <= (window.innerHeight || document.documentElement.clientHeight) + 200;
        });
    }

    function moveSpatialFocus(direction) {
        const focusables = getFocusableElements();
        if (focusables.length === 0) return;

        let current = document.activeElement;
        if (!current || current === document.body || !document.body.contains(current) || !current.getBoundingClientRect) {
            current = focusables[0];
            if (current) {
                clearSpatialFocus();
                current.focus();
                current.classList.add('atlas-spatial-focused');
                current.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            }
            return;
        }

        const currentRect = current.getBoundingClientRect();
        const currentCenter = {
            x: currentRect.left + currentRect.width / 2,
            y: currentRect.top + currentRect.height / 2
        };

        let bestCandidate = null;
        let minDistance = Infinity;

        focusables.forEach(el => {
            if (el === current || el.contains(current) || current.contains(el)) return;
            const rect = el.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };

            const dx = center.x - currentCenter.x;
            const dy = center.y - currentCenter.y;

            let isValidDirection = false;
            let weight = 1.0;

            switch (direction) {
                case 'navigate_up':
                    isValidDirection = dy < -8;
                    weight = Math.abs(dx) * 2.2 + Math.abs(dy);
                    break;
                case 'navigate_down':
                    isValidDirection = dy > 8;
                    weight = Math.abs(dx) * 2.2 + Math.abs(dy);
                    break;
                case 'navigate_left':
                    isValidDirection = dx < -8;
                    weight = Math.abs(dx) + Math.abs(dy) * 2.2;
                    break;
                case 'navigate_right':
                    isValidDirection = dx > 8;
                    weight = Math.abs(dx) + Math.abs(dy) * 2.2;
                    break;
            }

            if (isValidDirection && weight < minDistance) {
                minDistance = weight;
                bestCandidate = el;
            }
        });

        clearSpatialFocus();

        if (bestCandidate) {
            bestCandidate.focus();
            bestCandidate.classList.add('atlas-spatial-focused');
            bestCandidate.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        } else {
            // Fallback scroll if no candidate in strict vector path
            if (direction === 'navigate_up') window.scrollBy({ top: -250, behavior: 'smooth' });
            if (direction === 'navigate_down') window.scrollBy({ top: 250, behavior: 'smooth' });
            if (direction === 'navigate_left') window.scrollBy({ left: -250, behavior: 'smooth' });
            if (direction === 'navigate_right') window.scrollBy({ left: 250, behavior: 'smooth' });
        }
    }

    function simulateKey(key, code, keyCode) {
        const target = document.activeElement || document.body;
        const opts = {
            key: key, code: code, keyCode: keyCode, which: keyCode,
            bubbles: true, cancelable: true
        };
        target.dispatchEvent(new KeyboardEvent('keydown', opts));
        target.dispatchEvent(new KeyboardEvent('keyup', opts));
    }

    window.__ATLAS_TWITCH = function(action) {
        switch(action) {
            case 'navigate_up':
            case 'navigate_down':
            case 'navigate_left':
            case 'navigate_right':
                moveSpatialFocus(action);
                break;

            case 'click':
                if (document.activeElement && document.activeElement !== document.body) {
                    document.activeElement.click();
                } else {
                    simulateKey('Enter', 'Enter', 13);
                }
                break;

            case 'back':
                clearSpatialFocus();
                simulateKey('Escape', 'Escape', 27);
                history.back();
                break;

            case 'play_pause':
                simulateKey(' ', 'Space', 32);
                const video = document.querySelector('video');
                if (video) {
                    if (video.paused) video.play();
                    else video.pause();
                }
                break;

            case 'toggle_chat': {
                const chatToggleBtn = document.querySelector('[data-a-target="right-column-toggle-button"]') || document.querySelector('button[aria-label*="Chat"]');
                if (chatToggleBtn) chatToggleBtn.click();
                break;
            }

            case 'fullscreen': {
                const video = document.querySelector('video');
                if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                } else if (video && video.requestFullscreen) {
                    video.requestFullscreen().catch(() => simulateKey('f', 'KeyF', 70));
                } else {
                    simulateKey('f', 'KeyF', 70);
                }
                break;
            }

            case 'volume_up': {
                targetVolume = Math.min(1, Math.round((targetVolume + 0.05) * 100) / 100);
                localStorage.setItem('atlas_twitch_volume', targetVolume.toString());
                syncVolume();
                showVolumeToast(targetVolume);
                break;
            }

            case 'volume_down': {
                targetVolume = Math.max(0, Math.round((targetVolume - 0.05) * 100) / 100);
                localStorage.setItem('atlas_twitch_volume', targetVolume.toString());
                syncVolume();
                showVolumeToast(targetVolume);
                break;
            }

            case 'scroll_up':
                window.scrollBy({ top: -350, behavior: 'smooth' });
                break;

            case 'scroll_down':
                window.scrollBy({ top: 350, behavior: 'smooth' });
                break;
        }
    };

    console.log('[Atlas] Twitch Spatial Navigation Refined.');
})();
"#;

#[tauri::command]
async fn open_twitch_webview(app: tauri::AppHandle) -> Result<(), String> {
    let main_window = app
        .get_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;

    if app.get_webview("twitch").is_some() {
        return Ok(());
    }

    let size = main_window.inner_size().map_err(|e| e.to_string())?;

    let webview_builder = tauri::WebviewBuilder::new(
        "twitch",
        tauri::WebviewUrl::External(tauri::Url::parse("https://www.twitch.tv").unwrap()),
    )
    .initialization_script(TWITCH_TV_INIT_SCRIPT)
    .auto_resize();

    main_window
        .add_child(
            webview_builder,
            tauri::PhysicalPosition::new(0, 0),
            tauri::PhysicalSize::new(size.width, size.height),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn twitch_gamepad_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview("twitch") {
        let js = format!(
            "if (window.__ATLAS_TWITCH) {{ window.__ATLAS_TWITCH('{}'); }}",
            action.replace('\\', "\\\\").replace('\'', "\\'")
        );
        webview.eval(&js).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn close_twitch_webview(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("twitch") {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn youtube_gamepad_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview("youtube") {
        let js = format!(
            "if (window.__ATLAS_TV) {{ window.__ATLAS_TV('{}'); }}",
            action.replace('\\', "\\\\").replace('\'', "\\'")
        );
        webview.eval(&js).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn close_youtube_webview(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("youtube") {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Backloggd webview
// ─────────────────────────────────────────────────────────────────────────────

const BACKLOGGD_INIT_SCRIPT: &str = r#"
(function() {
    if (window.__ATLAS_BACKLOGGD_INJECTED) return;
    window.__ATLAS_BACKLOGGD_INJECTED = true;

    // 1. Inject TV-friendly CSS & Focus Highlight
    const injectStyles = () => {
        const style = document.createElement('style');
        style.id = 'atlas-backloggd-tv-engine';
        style.textContent = `
            html {
                font-size: 100% !important;
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
                text-rendering: optimizeLegibility !important;
                overflow-x: hidden !important;
            }

            /* Hide cookie/consent banners */
            .consent-banner,
            .cookie-banner,
            div[aria-label="Cookie Banner"],
            #cookie-banner {
                display: none !important;
            }

            /* Active Focus Highlight */
            .atlas-spatial-focused,
            a:focus-visible,
            button:focus-visible,
            input:focus-visible {
                outline: 3px solid #5C7CFA !important;
                outline-offset: 2px !important;
                box-shadow: 0 0 18px rgba(92, 124, 250, 0.85) !important;
                border-radius: 6px !important;
                z-index: 9999 !important;
                transition: outline 0.1s ease, box-shadow 0.1s ease !important;
            }
        `;
        if (document.head) document.head.appendChild(style);
        else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    };
    injectStyles();

    function clearSpatialFocus() {
        document.querySelectorAll('.atlas-spatial-focused').forEach(el => {
            el.classList.remove('atlas-spatial-focused');
        });
    }

    function getFocusableElements() {
        const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
        const elements = Array.from(document.querySelectorAll(selector));

        return elements.filter(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width < 12 || rect.height < 12) return false;

            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

            let p = el.parentElement;
            while (p && p !== document.body) {
                if (p.tagName === 'A' && p !== el) return false;
                p = p.parentElement;
            }

            return rect.bottom >= -50 && rect.top <= (window.innerHeight || document.documentElement.clientHeight) + 200;
        });
    }

    function moveSpatialFocus(direction) {
        const focusables = getFocusableElements();
        if (focusables.length === 0) return;

        let current = document.activeElement;
        if (!current || current === document.body || !document.body.contains(current) || !current.getBoundingClientRect) {
            current = focusables[0];
            if (current) {
                clearSpatialFocus();
                current.focus();
                current.classList.add('atlas-spatial-focused');
                current.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            }
            return;
        }

        const currentRect = current.getBoundingClientRect();
        const currentCenter = {
            x: currentRect.left + currentRect.width / 2,
            y: currentRect.top + currentRect.height / 2
        };

        let bestCandidate = null;
        let minDistance = Infinity;

        focusables.forEach(el => {
            if (el === current || el.contains(current) || current.contains(el)) return;
            const rect = el.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };

            const dx = center.x - currentCenter.x;
            const dy = center.y - currentCenter.y;

            let isValidDirection = false;
            let weight = 1.0;

            switch (direction) {
                case 'navigate_up':
                    isValidDirection = dy < -8;
                    weight = Math.abs(dx) * 2.2 + Math.abs(dy);
                    break;
                case 'navigate_down':
                    isValidDirection = dy > 8;
                    weight = Math.abs(dx) * 2.2 + Math.abs(dy);
                    break;
                case 'navigate_left':
                    isValidDirection = dx < -8;
                    weight = Math.abs(dx) + Math.abs(dy) * 2.2;
                    break;
                case 'navigate_right':
                    isValidDirection = dx > 8;
                    weight = Math.abs(dx) + Math.abs(dy) * 2.2;
                    break;
            }

            if (isValidDirection && weight < minDistance) {
                minDistance = weight;
                bestCandidate = el;
            }
        });

        clearSpatialFocus();

        if (bestCandidate) {
            bestCandidate.focus();
            bestCandidate.classList.add('atlas-spatial-focused');
            bestCandidate.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        } else {
            if (direction === 'navigate_up') window.scrollBy({ top: -250, behavior: 'smooth' });
            if (direction === 'navigate_down') window.scrollBy({ top: 250, behavior: 'smooth' });
            if (direction === 'navigate_left') window.scrollBy({ left: -250, behavior: 'smooth' });
            if (direction === 'navigate_right') window.scrollBy({ left: 250, behavior: 'smooth' });
        }
    }

    function simulateKey(key, code, keyCode) {
        const target = document.activeElement || document.body;
        const opts = {
            key: key, code: code, keyCode: keyCode, which: keyCode,
            bubbles: true, cancelable: true
        };
        target.dispatchEvent(new KeyboardEvent('keydown', opts));
        target.dispatchEvent(new KeyboardEvent('keyup', opts));
    }

    window.__ATLAS_BACKLOGGD = function(action) {
        switch(action) {
            case 'navigate_up':
            case 'navigate_down':
            case 'navigate_left':
            case 'navigate_right':
                moveSpatialFocus(action);
                break;

            case 'click':
                if (document.activeElement && document.activeElement !== document.body) {
                    document.activeElement.click();
                } else {
                    simulateKey('Enter', 'Enter', 13);
                }
                break;

            case 'back':
                clearSpatialFocus();
                simulateKey('Escape', 'Escape', 27);
                history.back();
                break;

            case 'scroll_up':
                window.scrollBy({ top: -350, behavior: 'smooth' });
                break;

            case 'scroll_down':
                window.scrollBy({ top: 350, behavior: 'smooth' });
                break;
        }
    };

    console.log('[Atlas] Backloggd Spatial Navigation injected.');
})();
"#;

#[tauri::command]
async fn open_backloggd_webview(app: tauri::AppHandle) -> Result<(), String> {
    let main_window = app
        .get_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;

    if app.get_webview("backloggd").is_some() {
        return Ok(());
    }

    let size = main_window.inner_size().map_err(|e| e.to_string())?;

    let webview_builder = tauri::WebviewBuilder::new(
        "backloggd",
        tauri::WebviewUrl::External(tauri::Url::parse("https://www.backloggd.com").unwrap()),
    )
    .initialization_script(BACKLOGGD_INIT_SCRIPT)
    .auto_resize();

    main_window
        .add_child(
            webview_builder,
            tauri::PhysicalPosition::new(0, 0),
            tauri::PhysicalSize::new(size.width, size.height),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn backloggd_gamepad_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview("backloggd") {
        let js = format!(
            "if (window.__ATLAS_BACKLOGGD) {{ window.__ATLAS_BACKLOGGD('{}'); }}",
            action.replace('\\', "\\\\").replace('\'', "\\'")
        );
        webview.eval(&js).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn close_backloggd_webview(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("backloggd") {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn toggle_fullscreen(window: tauri::Window) -> Result<bool, String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    let new_state = !is_fullscreen;
    window.set_fullscreen(new_state).map_err(|e| e.to_string())?;
    Ok(new_state)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri entry point
// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Resolve the platform-specific AppData directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app_data_dir");

            // Spawn async setup (database + directory creation)
            let handle = app.handle().clone();
            let data_dir = app_data_dir.clone();

            tauri::async_runtime::block_on(async move {
                // 1. Ensure all required directories exist
                crate::services::cache_service::ensure_directories(&data_dir).await;

                // 2. Connect to SQLite
                let db_path = data_dir.join("atlas.db");
                let db = crate::database::connection::setup_database(&db_path)
                    .await
                    .expect("Failed to connect to database");

                // 3. Run all pending migrations
                crate::database::migrations::Migrator::up(&db, None)
                    .await
                    .expect("Failed to run database migrations");

                // 4. Register global state
                handle.manage(AppState {
                    db,
                    igdb_token: Mutex::new(None),
                    app_data_dir: data_dir,
                });
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Resized(size) = event {
                if window.label() == "main" {
                    if let Some(youtube) = window.get_webview("youtube") {
                        let _ = youtube.set_position(tauri::PhysicalPosition::new(0, 0));
                        let _ = youtube.set_size(tauri::PhysicalSize::new(size.width, size.height));
                    }
                    if let Some(twitch) = window.get_webview("twitch") {
                        let _ = twitch.set_position(tauri::PhysicalPosition::new(0, 0));
                        let _ = twitch.set_size(tauri::PhysicalSize::new(size.width, size.height));
                    }
                    if let Some(backloggd) = window.get_webview("backloggd") {
                        let _ = backloggd.set_position(tauri::PhysicalPosition::new(0, 0));
                        let _ = backloggd.set_size(tauri::PhysicalSize::new(size.width, size.height));
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // ── Platform / Steam commands ─────────────────────────────
            get_installed_games,
            launch_game,
            is_shell_replacement_enabled,
            toggle_shell_replacement,
            pick_file,
            launch_custom_game,
            // ── File browser commands ─────────────────────────────────
            get_installed_apps,
            get_drives,
            list_dir_contents,
            search_files_recursive,
            get_parent_path,
            open_path_in_system,
            scan_movies_in_folder,
            // ── IGDB metadata ─────────────────────────────────────────
            get_game_image_url,
            // ── Database game commands (Phase 2) ──────────────────────
            commands::game_commands::db_list_games,
            commands::game_commands::db_add_game,
            commands::game_commands::db_delete_game,
            commands::game_commands::db_update_game,
            commands::game_commands::db_migrate_from_localstorage,
            commands::game_commands::search_game_images,
            commands::game_commands::get_game_metadata,
            commands::media_commands::db_get_game_media,
            // ── Playtime tracking commands (Phase 5) ─────────────────────────────────
            commands::playtime_commands::start_play_session,
            commands::playtime_commands::end_play_session,
            commands::playtime_commands::get_game_playtime,
            commands::playtime_commands::get_all_playtimes,
            commands::playtime_commands::set_game_playtime,
            commands::playtime_commands::get_dashboard_stats,
            // ── YouTube TV & Twitch ───────────────────────────────────
            open_youtube_webview,
            close_youtube_webview,
            youtube_gamepad_action,
            open_twitch_webview,
            close_twitch_webview,
            twitch_gamepad_action,
            // ── Backloggd ─────────────────────────────────────────────
            open_backloggd_webview,
            close_backloggd_webview,
            backloggd_gamepad_action,
            toggle_fullscreen,
            // ── Steam Account / Library ───────────────────────────────
            commands::steam_commands::steam_login,
            commands::steam_commands::steam_logout,
            commands::steam_commands::steam_get_user,
            commands::steam_commands::steam_import_library,
            commands::steam_commands::get_steam_news,
            commands::steam_commands::get_steam_reviews,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
