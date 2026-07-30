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

/// Ends a play session and records the duration.
/// Call this when the user returns to the launcher (window gains focus).
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

/// Returns the total accumulated play time for a game.
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
