use tauri::State;
use crate::models::game::GameDto;
use crate::services::game_service::{self, CreateGameInput};
use crate::AppState;

/// Lists all games from the database.
#[tauri::command]
pub async fn db_list_games(state: State<'_, AppState>) -> Result<Vec<GameDto>, String> {
    let db = &state.db;
    game_service::list_games(db, &state.app_data_dir).await
}

/// Adds a new game to the database.
#[tauri::command]
pub async fn db_add_game(
    state: State<'_, AppState>,
    name: String,
    exe_path: Option<String>,
    install_dir: Option<String>,
    steam_app_id: Option<String>,
    platform: Option<String>,
    cover_url: Option<String>,
) -> Result<GameDto, String> {
    let db = &state.db;
    let input = CreateGameInput {
        name,
        exe_path,
        install_dir,
        steam_app_id,
        platform,
        cover_url,
    };
    game_service::create_game(db, input, &state.app_data_dir).await
}

/// Deletes a game and all its associated records.
#[tauri::command]
pub async fn db_delete_game(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<(), String> {
    let db = &state.db;
    // Also delete cover file from disk
    crate::services::image_service::delete_cover(&game_id, &state.app_data_dir).await;
    game_service::delete_game(db, &game_id).await
}

/// Updates a game's mutable fields.
#[tauri::command]
pub async fn db_update_game(
    state: State<'_, AppState>,
    game_id: String,
    name: Option<String>,
    exe_path: Option<String>,
    cover_url: Option<String>,
    background_url: Option<String>,
    last_played: Option<String>,
) -> Result<GameDto, String> {
    let db = &state.db;
    let lp_param = last_played.map(|s| if s.trim().is_empty() { None } else { Some(s) });
    game_service::update_game(db, &game_id, name, exe_path, cover_url, background_url, lp_param, &state.app_data_dir).await
}

/// Migrates legacy games from localStorage format into SQLite.
/// Called once from the frontend on first launch if localStorage contains data.
#[tauri::command]
pub async fn db_migrate_from_localstorage(
    state: State<'_, AppState>,
    legacy_games: Vec<LegacyGame>,
) -> Result<Vec<GameDto>, String> {
    let db = &state.db;
    let mut created = Vec::new();

    for legacy in legacy_games {
        // Skip games that already look like Steam games (they'll be re-scanned)
        let platform = if legacy.is_custom.unwrap_or(true) {
            "manual".to_string()
        } else {
            "steam".to_string()
        };

        let input = CreateGameInput {
            name: legacy.name,
            exe_path: legacy.exe_path,
            install_dir: Some(legacy.installdir),
            steam_app_id: if legacy.appid.starts_with("custom_") {
                None
            } else {
                Some(legacy.appid)
            },
            platform: Some(platform),
            cover_url: if legacy.image_url.is_empty() || legacy.image_url.starts_with("https://shared.fastly.steamstatic.com") {
                None // Steam images will be resolved from appid later
            } else {
                Some(legacy.image_url)
            },
        };

        match game_service::create_game(db, input, &state.app_data_dir).await {
            Ok(dto) => created.push(dto),
            Err(e) => eprintln!("Failed to migrate game: {}", e),
        }
    }

    Ok(created)
}

/// Shape of the legacy localStorage game object
#[derive(serde::Deserialize, Debug)]
pub struct LegacyGame {
    pub appid: String,
    pub name: String,
    pub installdir: String,
    pub library_path: String,
    pub image_url: String,
    pub is_custom: Option<bool>,
    pub exe_path: Option<String>,
}

/// Searches for candidate images (cover/background) in background based on search query.
#[tauri::command]
pub async fn search_game_images(query: String, target: Option<String>) -> Result<Vec<String>, String> {
    crate::services::image_service::search_images(&query, target.as_deref()).await
}

