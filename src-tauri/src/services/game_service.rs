use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, DatabaseConnection,
    EntityTrait, QueryFilter, Set,
};
use chrono::Utc;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

use crate::models::{
    game::{self, ActiveModel as GameActive, GameDto},
    image_asset,
};

/// Payload sent from the frontend when adding a game
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateGameInput {
    pub name: String,
    pub exe_path: Option<String>,
    pub install_dir: Option<String>,
    pub steam_app_id: Option<String>,
    pub platform: Option<String>,
    pub cover_url: Option<String>,
}

fn resolve_cover_url(cover_url: Option<String>, app_data_dir: &std::path::Path) -> Option<String> {
    let url = cover_url?;
    if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("data:") {
        Some(url)
    } else {
        let path = std::path::Path::new(&url);
        if path.is_relative() {
            Some(app_data_dir.join(path).to_string_lossy().into_owned())
        } else {
            Some(url)
        }
    }
}

/// Deduplicates game records in SQLite database (removes entries with identical steam_app_id or name).
pub async fn deduplicate_games(db: &DatabaseConnection) -> Result<(), String> {
    let all_games = game::Entity::find()
        .all(db)
        .await
        .map_err(|e| format!("DB query error: {}", e))?;

    let mut seen_steam_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut seen_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut ids_to_delete: Vec<String> = Vec::new();

    for g in all_games {
        let name_key = g.name.trim().to_lowercase();
        let mut is_dupe = false;

        if let Some(ref steam_id) = g.steam_app_id {
            if !steam_id.trim().is_empty() {
                if seen_steam_ids.contains(steam_id) {
                    is_dupe = true;
                } else {
                    seen_steam_ids.insert(steam_id.clone());
                }
            }
        }

        if !is_dupe {
            if seen_names.contains(&name_key) {
                is_dupe = true;
            } else {
                seen_names.insert(name_key);
            }
        }

        if is_dupe {
            ids_to_delete.push(g.id);
        }
    }

    for id in ids_to_delete {
        let _ = delete_game(db, &id).await;
    }

    Ok(())
}

/// Creates a new game record in the database, or updates if already exists.
/// Returns the created or updated game as a DTO.
pub async fn create_game(
    db: &DatabaseConnection,
    input: CreateGameInput,
    app_data_dir: &std::path::Path,
) -> Result<GameDto, String> {
    let platform = input.platform.unwrap_or_else(|| "manual".to_string());
    let sort_name = normalize_sort_name(&input.name);
    let name_key = input.name.trim().to_lowercase();

    // Check if game already exists by steam_app_id or name to prevent duplicates
    let existing = if let Some(ref steam_id) = input.steam_app_id {
        if !steam_id.trim().is_empty() {
            game::Entity::find()
                .filter(game::Column::SteamAppId.eq(steam_id))
                .one(db)
                .await
                .ok()
                .flatten()
        } else {
            None
        }
    } else {
        None
    };

    let existing = match existing {
        Some(g) => Some(g),
        None => {
            let all = game::Entity::find().all(db).await.unwrap_or_default();
            all.into_iter().find(|g| g.name.trim().to_lowercase() == name_key)
        }
    };

    if let Some(existing_game) = existing {
        return update_game(
            db,
            &existing_game.id,
            Some(input.name),
            input.exe_path,
            input.cover_url,
            None,
            app_data_dir,
        )
        .await;
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let active = GameActive {
        id: Set(id.clone()),
        name: Set(input.name.clone()),
        platform: Set(platform.clone()),
        source: Set("manual".to_string()),
        exe_path: Set(input.exe_path.clone()),
        install_dir: Set(input.install_dir.clone()),
        steam_app_id: Set(input.steam_app_id.clone()),
        igdb_id: Set(None),
        added_at: Set(now.clone()),
        last_played: Set(None),
        sort_name: Set(Some(sort_name)),
    };

    active
        .insert(db)
        .await
        .map_err(|e| format!("DB insert error: {}", e))?;

    // If a cover URL was provided, persist it as an image asset
    let cover_path = if let Some(ref url) = input.cover_url {
        // Try to download; store path relative to app_data_dir
        match crate::services::image_service::download_cover(&id, url, app_data_dir).await {
            Ok(rel_path) => {
                // Record in image_assets table
                let asset = image_asset::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    game_id: Set(id.clone()),
                    asset_type: Set("cover".to_string()),
                    file_path: Set(rel_path.clone()),
                    source_url: Set(Some(url.clone())),
                    downloaded_at: Set(Utc::now().to_rfc3339()),
                };
                let _ = asset.insert(db).await;
                Some(rel_path)
            }
            Err(e) => {
                eprintln!("Failed to download cover for {}: {}", input.name, e);
                // Fall back to remote URL — still store as asset
                let asset = image_asset::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    game_id: Set(id.clone()),
                    asset_type: Set("cover".to_string()),
                    file_path: Set(url.clone()),
                    source_url: Set(Some(url.clone())),
                    downloaded_at: Set(Utc::now().to_rfc3339()),
                };
                let _ = asset.insert(db).await;
                Some(url.clone())
            }
        }
    } else {
        None
    };

    let installed_appids = crate::get_installed_steam_appids();
    let is_installed = is_game_installed(
        &platform,
        &input.exe_path,
        &input.install_dir,
        &input.steam_app_id,
        &installed_appids,
    );

    Ok(GameDto {
        id,
        name: input.name,
        platform,
        exe_path: input.exe_path,
        install_dir: input.install_dir,
        steam_app_id: input.steam_app_id,
        igdb_id: None,
        cover_url: resolve_cover_url(cover_path, app_data_dir),
        background_url: None,
        last_played: None,
        added_at: now,
        is_installed,
    })
}

fn is_game_installed(
    platform: &str,
    exe_path: &Option<String>,
    install_dir: &Option<String>,
    steam_app_id: &Option<String>,
    installed_appids: &std::collections::HashSet<String>,
) -> bool {
    if platform == "manual" {
        return true;
    }
    if let Some(ref p) = exe_path {
        if !p.trim().is_empty() {
            return true;
        }
    }
    if let Some(ref dir) = install_dir {
        if !dir.trim().is_empty() {
            return true;
        }
    }
    if let Some(ref appid) = steam_app_id {
        if installed_appids.contains(appid) {
            return true;
        }
    }
    false
}

/// Returns all games with their primary cover asset resolved.
pub async fn list_games(
    db: &DatabaseConnection,
    app_data_dir: &std::path::Path,
) -> Result<Vec<GameDto>, String> {
    // Automatically purge duplicates if any exist in the database
    let _ = deduplicate_games(db).await;

    let games = game::Entity::find()
        .find_with_related(image_asset::Entity)
        .all(db)
        .await
        .map_err(|e| format!("DB query error: {}", e))?;

    let installed_appids = crate::get_installed_steam_appids();

    let mut dtos = Vec::new();

    for (g, assets) in games {
        // Automatically purge Proton / Steam system tools from database if found
        if crate::services::steam_service::is_steam_tool_or_proton(&g.name, g.steam_app_id.as_deref()) {
            let _ = delete_game(db, &g.id).await;
            continue;
        }

        let cover = assets
            .iter()
            .find(|a| a.asset_type == "cover")
            .map(|a| a.file_path.clone());
        let background = assets
            .iter()
            .find(|a| a.asset_type == "background")
            .map(|a| a.file_path.clone());
        let is_installed = is_game_installed(
            &g.platform,
            &g.exe_path,
            &g.install_dir,
            &g.steam_app_id,
            &installed_appids,
        );
        dtos.push(GameDto {
            id: g.id,
            name: g.name,
            platform: g.platform,
            exe_path: g.exe_path,
            install_dir: g.install_dir,
            steam_app_id: g.steam_app_id,
            igdb_id: g.igdb_id,
            cover_url: resolve_cover_url(cover, app_data_dir),
            background_url: resolve_cover_url(background, app_data_dir),
            last_played: g.last_played,
            added_at: g.added_at,
            is_installed,
        });
    }

    Ok(dtos)
}

/// Deletes a game by ID (cascades to metadata, image_assets, play_sessions).
pub async fn delete_game(db: &DatabaseConnection, game_id: &str) -> Result<(), String> {
    game::Entity::delete_by_id(game_id)
        .exec(db)
        .await
        .map_err(|e| format!("DB delete error: {}", e))?;
    Ok(())
}

/// Updates name, exe_path, cover URL, and background URL for a game.
pub async fn update_game(
    db: &DatabaseConnection,
    game_id: &str,
    name: Option<String>,
    exe_path: Option<String>,
    cover_url: Option<String>,
    background_url: Option<String>,
    app_data_dir: &std::path::Path,
) -> Result<GameDto, String> {
    let existing = game::Entity::find_by_id(game_id)
        .one(db)
        .await
        .map_err(|e| format!("DB find error: {}", e))?
        .ok_or_else(|| format!("Game {} not found", game_id))?;

    let mut active: GameActive = existing.clone().into();

    if let Some(n) = name {
        active.name = Set(n.clone());
        active.sort_name = Set(Some(normalize_sort_name(&n)));
    }
    if let Some(p) = exe_path {
        active.exe_path = Set(Some(p));
    }

    let model = active
        .update(db)
        .await
        .map_err(|e| format!("DB update error: {}", e))?;

    // Handle cover update
    let cover_path = if let Some(ref url) = cover_url {
        // Remove old cover asset
        image_asset::Entity::delete_many()
            .filter(
                Condition::all()
                    .add(image_asset::Column::GameId.eq(game_id))
                    .add(image_asset::Column::AssetType.eq("cover")),
            )
            .exec(db)
            .await
            .ok();

        match crate::services::image_service::download_cover(game_id, url, app_data_dir).await {
            Ok(rel_path) => {
                let asset = image_asset::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    game_id: Set(game_id.to_string()),
                    asset_type: Set("cover".to_string()),
                    file_path: Set(rel_path.clone()),
                    source_url: Set(Some(url.clone())),
                    downloaded_at: Set(Utc::now().to_rfc3339()),
                };
                let _ = asset.insert(db).await;
                Some(rel_path)
            }
            Err(_) => {
                let asset = image_asset::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    game_id: Set(game_id.to_string()),
                    asset_type: Set("cover".to_string()),
                    file_path: Set(url.clone()),
                    source_url: Set(Some(url.clone())),
                    downloaded_at: Set(Utc::now().to_rfc3339()),
                };
                let _ = asset.insert(db).await;
                Some(url.clone())
            }
        }
    } else {
        // Return existing cover path
        image_asset::Entity::find()
            .filter(
                Condition::all()
                    .add(image_asset::Column::GameId.eq(game_id))
                    .add(image_asset::Column::AssetType.eq("cover")),
            )
            .one(db)
            .await
            .ok()
            .flatten()
            .map(|a| a.file_path)
    };

    // Handle background update
    let bg_path = if let Some(ref url) = background_url {
        // Remove old background asset
        image_asset::Entity::delete_many()
            .filter(
                Condition::all()
                    .add(image_asset::Column::GameId.eq(game_id))
                    .add(image_asset::Column::AssetType.eq("background")),
            )
            .exec(db)
            .await
            .ok();

        match crate::services::image_service::download_background(game_id, url, app_data_dir).await {
            Ok(rel_path) => {
                let asset = image_asset::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    game_id: Set(game_id.to_string()),
                    asset_type: Set("background".to_string()),
                    file_path: Set(rel_path.clone()),
                    source_url: Set(Some(url.clone())),
                    downloaded_at: Set(Utc::now().to_rfc3339()),
                };
                let _ = asset.insert(db).await;
                Some(rel_path)
            }
            Err(_) => {
                let asset = image_asset::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    game_id: Set(game_id.to_string()),
                    asset_type: Set("background".to_string()),
                    file_path: Set(url.clone()),
                    source_url: Set(Some(url.clone())),
                    downloaded_at: Set(Utc::now().to_rfc3339()),
                };
                let _ = asset.insert(db).await;
                Some(url.clone())
            }
        }
    } else {
        // Return existing background path
        image_asset::Entity::find()
            .filter(
                Condition::all()
                    .add(image_asset::Column::GameId.eq(game_id))
                    .add(image_asset::Column::AssetType.eq("background")),
            )
            .one(db)
            .await
            .ok()
            .flatten()
            .map(|a| a.file_path)
    };

    let installed_appids = crate::get_installed_steam_appids();
    let is_installed = is_game_installed(
        &model.platform,
        &model.exe_path,
        &model.install_dir,
        &model.steam_app_id,
        &installed_appids,
    );

    Ok(GameDto {
        id: model.id,
        name: model.name,
        platform: model.platform,
        exe_path: model.exe_path,
        install_dir: model.install_dir,
        steam_app_id: model.steam_app_id,
        igdb_id: model.igdb_id,
        cover_url: resolve_cover_url(cover_path, app_data_dir),
        background_url: resolve_cover_url(bg_path, app_data_dir),
        last_played: model.last_played,
        added_at: model.added_at,
        is_installed,
    })
}

/// Normalizes a name for alphabetical sorting (removes leading "The ", "A ", "An ").
fn normalize_sort_name(name: &str) -> String {
    let lower = name.to_lowercase();
    for prefix in &["the ", "a ", "an "] {
        if lower.starts_with(prefix) {
            return name[prefix.len()..].to_string();
        }
    }
    name.to_string()
}
