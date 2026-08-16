use tauri::State;
use crate::AppState;
use crate::services::steam_service::{self, SteamUserInfo, SteamImportResult};

/// Initiates Steam OpenID login flow.
/// Opens the browser, waits for callback, verifies, and stores the SteamID.
#[tauri::command]
pub async fn steam_login(state: State<'_, AppState>) -> Result<SteamUserInfo, String> {
    // Perform OpenID login
    let steam_id = steam_service::steam_openid_login().await?;

    // Save SteamID to database
    steam_service::save_steam_id(&state.db, &steam_id).await?;

    // Fetch and return user profile info
    let user_info = steam_service::get_user_info(&steam_id).await?;
    Ok(user_info)
}

/// Clears the stored Steam session.
#[tauri::command]
pub async fn steam_logout(state: State<'_, AppState>) -> Result<(), String> {
    steam_service::clear_steam_id(&state.db).await
}

/// Returns the stored Steam user info, or null if not logged in.
#[tauri::command]
pub async fn steam_get_user(state: State<'_, AppState>) -> Result<Option<SteamUserInfo>, String> {
    let steam_id = steam_service::load_steam_id(&state.db).await?;

    match steam_id {
        Some(id) => {
            match steam_service::get_user_info(&id).await {
                Ok(info) => Ok(Some(info)),
                Err(_) => {
                    // If we can't fetch profile (e.g. network error), still return basic info
                    Ok(Some(SteamUserInfo {
                        steam_id: id,
                        persona_name: "Steam User".to_string(),
                        avatar_url: String::new(),
                        profile_url: String::new(),
                    }))
                }
            }
        }
        None => Ok(None),
    }
}

/// Imports all owned games from Steam into the library.
/// Updates existing games, inserts new ones.
#[tauri::command]
pub async fn steam_import_library(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SteamImportResult, String> {
    let steam_id = steam_service::load_steam_id(&state.db).await?
        .ok_or_else(|| "Not logged in to Steam. Please login first.".to_string())?;

    steam_service::import_library(&app, &state.db, &steam_id, &state.app_data_dir).await
}

/// Fetches news and patch notes for a specific game (by AppID or Game Name for custom games)
#[tauri::command]
pub async fn get_steam_news(
    appid: String,
    game_name: Option<String>,
    count: Option<u32>,
) -> Result<Vec<steam_service::SteamNewsItem>, String> {
    let count = count.unwrap_or(5);
    steam_service::get_game_news(&appid, game_name.as_deref(), count).await
}
