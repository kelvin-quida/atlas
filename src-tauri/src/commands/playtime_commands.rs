use tauri::State;
use crate::services::playtime_service;
use crate::AppState;
use serde::{Deserialize, Serialize};

/// Response containing session info after starting a session.
#[derive(Debug, Serialize, Deserialize)]
pub struct SessionStarted {
    pub session_id: i32,
}

/// Response after ending a session.
#[derive(Debug, Serialize, Deserialize)]
pub struct SessionEnded {
    pub session_id: i32,
    pub duration_seconds: u32,
    pub formatted: String,
}

/// Response for playtime query.
#[derive(Debug, Serialize, Deserialize)]
pub struct PlaytimeStats {
    pub game_id: String,
    pub total_seconds: i64,
    pub formatted: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameStatsDetail {
    pub game_id: String,
    pub name: String,
    pub cover_url: Option<String>,
    pub background_url: Option<String>,
    pub total_seconds: i64,
    pub total_formatted: String,
    pub weekly_seconds: i64,
    pub weekly_formatted: String,
    pub monthly_seconds: i64,
    pub monthly_formatted: String,
    pub session_count: usize,
    pub avg_session_seconds: i64,
    pub avg_session_formatted: String,
    pub longest_session_seconds: i64,
    pub longest_session_formatted: String,
    pub last_played: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaySessionDetail {
    pub id: i32,
    pub game_id: String,
    pub game_name: String,
    pub cover_url: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: i64,
    pub formatted_duration: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonthOption {
    pub year: i32,
    pub month: u32,
    pub label: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DashboardStats {
    pub total_playtime_seconds: i64,
    pub total_formatted: String,
    pub weekly_playtime_seconds: i64,
    pub weekly_formatted: String,
    pub monthly_playtime_seconds: i64,
    pub monthly_formatted: String,
    pub selected_year: i32,
    pub selected_month: u32,
    pub selected_month_label: String,
    pub available_months: Vec<MonthOption>,
    pub total_sessions_count: usize,
    pub weekly_sessions_count: usize,
    pub monthly_sessions_count: usize,
    pub played_games_count: usize,
    pub weekly_played_games_count: usize,
    pub monthly_played_games_count: usize,
    pub total_library_count: usize,
    pub game_stats: Vec<GameStatsDetail>,
    pub recent_sessions: Vec<PlaySessionDetail>,
}

/// Starts a new play session for the given game ID.
/// Call this right before launching the game executable.
#[tauri::command]
pub async fn start_play_session(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<SessionStarted, String> {
    let session_id = playtime_service::start_session(&state.db, &game_id).await?;
    Ok(SessionStarted { session_id })
}

/// Ends an active play session.
/// Call this when the game executable terminates.
#[tauri::command]
pub async fn end_play_session(
    state: State<'_, AppState>,
    session_id: i32,
) -> Result<SessionEnded, String> {
    let duration_seconds = playtime_service::end_session(&state.db, session_id).await?;
    let formatted = playtime_service::format_playtime(duration_seconds as i64);
    Ok(SessionEnded {
        session_id,
        duration_seconds,
        formatted,
    })
}

/// Records a completed play session with start, end, and duration.
#[tauri::command]
pub async fn record_finished_session(
    state: State<'_, AppState>,
    game_id: String,
    started_at: String,
    ended_at: String,
    duration_seconds: u32,
) -> Result<SessionStarted, String> {
    let session_id = playtime_service::record_finished_session(
        &state.db,
        &game_id,
        &started_at,
        &ended_at,
        duration_seconds,
    )
    .await?;
    Ok(SessionStarted { session_id })
}

/// Returns the total play time for a game in seconds.
#[tauri::command]
pub async fn get_game_playtime(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<PlaytimeStats, String> {
    let total_seconds = playtime_service::get_total_playtime(&state.db, &game_id).await?;
    let formatted = playtime_service::format_playtime(total_seconds);
    Ok(PlaytimeStats {
        game_id,
        total_seconds,
        formatted,
    })
}

/// Returns play time for all games.
#[tauri::command]
pub async fn get_all_playtimes(
    state: State<'_, AppState>,
) -> Result<Vec<PlaytimeStats>, String> {
    playtime_service::get_all_playtimes(&state.db).await
}

/// Overwrites total play time for a game.
#[tauri::command]
pub async fn set_game_playtime(
    state: State<'_, AppState>,
    game_id: String,
    total_seconds: i64,
) -> Result<PlaytimeStats, String> {
    playtime_service::set_total_playtime(&state.db, &game_id, total_seconds).await?;
    let formatted = playtime_service::format_playtime(total_seconds);
    Ok(PlaytimeStats {
        game_id,
        total_seconds,
        formatted,
    })
}

/// Returns comprehensive analytics data for the dashboard with optional year/month filtering.
#[tauri::command]
pub async fn get_dashboard_stats(
    state: State<'_, AppState>,
    year: Option<i32>,
    month: Option<u32>,
) -> Result<DashboardStats, String> {
    playtime_service::get_dashboard_stats(&state.db, &state.app_data_dir, year, month).await
}
