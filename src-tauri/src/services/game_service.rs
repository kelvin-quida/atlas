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

/// Creates a new game record in the database.
/// Returns the created game as a DTO.
pub async fn create_game(
    db: &DatabaseConnection,
    input: CreateGameInput,
    app_data_dir: &std::path::Path,
) -> Result<GameDto, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let platform = input.platform.unwrap_or_else(|| "manual".to_string());
    let sort_name = normalize_sort_name(&input.name);

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

    Ok(GameDto {
        id,
        name: input.name,
        platform,
        exe_path: input.exe_path,
        install_dir: input.install_dir,
        steam_app_id: input.steam_app_id,
        igdb_id: None,
        cover_url: resolve_cover_url(cover_path, app_data_dir),
        last_played: None,
        added_at: now,
    })
}

/// Returns all games with their primary cover asset resolved.
pub async fn list_games(
    db: &DatabaseConnection,
    app_data_dir: &std::path::Path,
) -> Result<Vec<GameDto>, String> {
    let games = game::Entity::find()
        .find_with_related(image_asset::Entity)
        .all(db)
        .await
        .map_err(|e| format!("DB query error: {}", e))?;

    let dtos = games
        .into_iter()
        .map(|(g, assets)| {
            let cover = assets
                .iter()
                .find(|a| a.asset_type == "cover")
                .map(|a| a.file_path.clone());
            GameDto {
                id: g.id,
                name: g.name,
                platform: g.platform,
                exe_path: g.exe_path,
                install_dir: g.install_dir,
                steam_app_id: g.steam_app_id,
                igdb_id: g.igdb_id,
                cover_url: resolve_cover_url(cover, app_data_dir),
                last_played: g.last_played,
                added_at: g.added_at,
            }
        })
        .collect();

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

/// Updates name, exe_path, and cover URL for a game.
pub async fn update_game(
    db: &DatabaseConnection,
    game_id: &str,
    name: Option<String>,
    exe_path: Option<String>,
    cover_url: Option<String>,
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

    Ok(GameDto {
        id: model.id,
        name: model.name,
        platform: model.platform,
        exe_path: model.exe_path,
        install_dir: model.install_dir,
        steam_app_id: model.steam_app_id,
        igdb_id: model.igdb_id,
        cover_url: resolve_cover_url(cover_path, app_data_dir),
        last_played: model.last_played,
        added_at: model.added_at,
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
