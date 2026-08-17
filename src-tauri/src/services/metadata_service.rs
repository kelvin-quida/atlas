use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, DatabaseConnection,
    EntityTrait, QueryFilter, Set,
};
use chrono::Utc;
use std::path::Path;

use crate::models::{metadata as meta_model, game, image_asset};
use crate::providers::traits::{GameMetadata, MetadataProvider};
use crate::providers::steam::SteamMetadataProvider;
use crate::providers::igdb::client::IgdbProvider;
use crate::services::{cache_service, image_service};

/// Retrieves cached metadata from DB if present, or fetches via Steam Store API (primary)
/// with fallback to IGDB provider.
pub async fn get_or_fetch_game_metadata(
    db: &DatabaseConnection,
    game_id: &str,
    app_data_dir: &Path,
) -> Result<GameMetadata, String> {
    get_or_fetch_game_metadata_ext(db, game_id, app_data_dir, false).await
}

pub async fn get_or_fetch_game_metadata_ext(
    db: &DatabaseConnection,
    game_id: &str,
    _app_data_dir: &Path,
    force_refresh: bool,
) -> Result<GameMetadata, String> {
    // 1. Load game record to get title and steam_app_id (flexible lookup by ID or Steam App ID)
    let game = match game::Entity::find_by_id(game_id).one(db).await {
        Ok(Some(g)) => g,
        _ => {
            game::Entity::find()
                .filter(game::Column::SteamAppId.eq(game_id))
                .one(db)
                .await
                .ok()
                .flatten()
                .ok_or_else(|| format!("Game ID {} not found", game_id))?
        }
    };

    let target_game_id = &game.id;

    // 2. Check if metadata already exists in SQLite DB (unless force_refresh is requested)
    if !force_refresh {
        if let Ok(Some(existing)) = meta_model::Entity::find_by_id(target_game_id).one(db).await {
            let genres: Vec<String> = existing
                .genres
                .as_deref()
                .and_then(|g| serde_json::from_str(g).ok())
                .unwrap_or_default();

            // Return cached ONLY if it has core info, review_summary, AND has full community tags (>= 8 tags)
            if (existing.description.is_some() || !genres.is_empty() || existing.developer.is_some())
                && existing.review_summary.is_some()
                && genres.len() >= 8
            {
                return Ok(GameMetadata {
                    title: None,
                    description: existing.description,
                    genres,
                    developer: existing.developer,
                    publisher: existing.publisher,
                    release_date: existing.release_date,
                    rating: existing.rating,
                    review_summary: existing.review_summary,
                    cover_url: None,
                    background_url: None,
                    igdb_id: None,
                    igdb_url: existing.igdb_url,
                });
            }
        }
    }

    // 3. Primary provider: Steam Store API
    let steam_provider = SteamMetadataProvider::new();
    let appid_opt = game.steam_app_id.as_ref().cloned().or_else(|| {
        if game_id.chars().all(|c| c.is_ascii_digit()) {
            Some(game_id.to_string())
        } else {
            None
        }
    });

    let fetched_metadata = if let Some(ref appid) = appid_opt {
        if !appid.trim().is_empty() && appid.chars().all(|c| c.is_ascii_digit()) {
            match steam_provider.fetch_by_appid(appid).await {
                Ok(Some(meta)) => Some(meta),
                _ => None,
            }
        } else {
            None
        }
    } else {
        None
    };

    let fetched_metadata = match fetched_metadata {
        Some(m) => Some(m),
        None => {
            // Try steam_provider search by name
            match steam_provider.fetch_metadata(&game.name).await {
                Ok(Some(m)) => Some(m),
                _ => None,
            }
        }
    };

    // 4. Fallback provider: IGDB API
    let metadata = match fetched_metadata {
        Some(m) => m,
        None => {
            println!("[MetadataService] Steam metadata not found for '{}'. Falling back to IGDB...", game.name);
            let igdb_provider = IgdbProvider::new();
            match igdb_provider.fetch_metadata(&game.name).await {
                Ok(Some(m)) => m,
                Ok(None) | Err(_) => {
                    // Return empty metadata if both providers fail
                    GameMetadata {
                        title: Some(game.name.clone()),
                        description: Some("Nenhum metadado encontrado para este jogo.".to_string()),
                        genres: Vec::new(),
                        developer: None,
                        publisher: None,
                        release_date: None,
                        rating: None,
                        review_summary: None,
                        cover_url: None,
                        background_url: None,
                        igdb_id: None,
                        igdb_url: None,
                    }
                }
            }
        }
    };

    // 5. Save/upsert metadata into database
    let now = Utc::now().to_rfc3339();
    let genres_json = serde_json::to_string(&metadata.genres).unwrap_or_default();

    let existing = meta_model::Entity::find_by_id(target_game_id)
        .one(db)
        .await
        .ok()
        .flatten();

    if existing.is_some() {
        let active = meta_model::ActiveModel {
            game_id: Set(target_game_id.to_string()),
            description: Set(metadata.description.clone()),
            genres: Set(Some(genres_json)),
            developer: Set(metadata.developer.clone()),
            publisher: Set(metadata.publisher.clone()),
            release_date: Set(metadata.release_date.clone()),
            rating: Set(metadata.rating),
            review_summary: Set(metadata.review_summary.clone()),
            hltb_main: Set(None),
            igdb_url: Set(metadata.igdb_url.clone()),
            fetched_at: Set(now),
        };
        let _ = active.update(db).await;
    } else {
        let active = meta_model::ActiveModel {
            game_id: Set(target_game_id.to_string()),
            description: Set(metadata.description.clone()),
            genres: Set(Some(genres_json)),
            developer: Set(metadata.developer.clone()),
            publisher: Set(metadata.publisher.clone()),
            release_date: Set(metadata.release_date.clone()),
            rating: Set(metadata.rating),
            review_summary: Set(metadata.review_summary.clone()),
            hltb_main: Set(None),
            igdb_url: Set(metadata.igdb_url.clone()),
            fetched_at: Set(now),
        };
        let _ = active.insert(db).await;
    }

    Ok(metadata)
}

/// Fetches metadata for a game using any `MetadataProvider` and persists
/// the result to the database and disk.
pub async fn fetch_and_persist_metadata(
    db: &DatabaseConnection,
    provider: &dyn MetadataProvider,
    game_id: &str,
    game_name: &str,
    app_data_dir: &Path,
) -> Result<GameMetadata, String> {
    let cache_key = i64::from_str_radix(&game_id.replace('-', "")[..12.min(game_id.replace('-', "").len())], 16).unwrap_or(0);

    if let Some(cached) = cache_service::get_cached_igdb(cache_key, app_data_dir, 24).await {
        if let Ok(metadata) = serde_json::from_str::<GameMetadata>(&cached) {
            return Ok(metadata);
        }
    }

    let metadata = provider
        .fetch_metadata(game_name)
        .await?
        .ok_or_else(|| format!("No metadata found for '{}'", game_name))?;

    if let Ok(json) = serde_json::to_string(&metadata) {
        cache_service::save_cache_igdb(cache_key, &json, app_data_dir).await;
    }

    let local_cover_path = if let Some(ref cover_url) = metadata.cover_url {
        match image_service::download_cover(game_id, cover_url, app_data_dir).await {
            Ok(rel_path) => {
                let now = Utc::now().to_rfc3339();
                image_asset::Entity::delete_many()
                    .filter(
                        Condition::all()
                            .add(image_asset::Column::GameId.eq(game_id))
                            .add(image_asset::Column::AssetType.eq("cover")),
                    )
                    .exec(db)
                    .await
                    .ok();

                let asset = image_asset::ActiveModel {
                    id: sea_orm::ActiveValue::NotSet,
                    game_id: Set(game_id.to_string()),
                    asset_type: Set("cover".to_string()),
                    file_path: Set(rel_path.clone()),
                    source_url: Set(metadata.cover_url.clone()),
                    downloaded_at: Set(now),
                };
                let _ = asset.insert(db).await;

                Some(rel_path)
            }
            Err(e) => {
                eprintln!("[MetadataService] Cover download failed for {}: {}", game_name, e);
                None
            }
        }
    } else {
        None
    };

    let now = Utc::now().to_rfc3339();
    let genres_json = serde_json::to_string(&metadata.genres).unwrap_or_default();

    let existing = meta_model::Entity::find_by_id(game_id)
        .one(db)
        .await
        .ok()
        .flatten();

    if existing.is_some() {
        let active = meta_model::ActiveModel {
            game_id: Set(game_id.to_string()),
            description: Set(metadata.description.clone()),
            genres: Set(Some(genres_json)),
            developer: Set(metadata.developer.clone()),
            publisher: Set(metadata.publisher.clone()),
            release_date: Set(metadata.release_date.clone()),
            rating: Set(metadata.rating),
            review_summary: Set(metadata.review_summary.clone()),
            hltb_main: Set(None),
            igdb_url: Set(metadata.igdb_url.clone()),
            fetched_at: Set(now),
        };
        active.update(db).await.ok();
    } else {
        let active = meta_model::ActiveModel {
            game_id: Set(game_id.to_string()),
            description: Set(metadata.description.clone()),
            genres: Set(Some(genres_json)),
            developer: Set(metadata.developer.clone()),
            publisher: Set(metadata.publisher.clone()),
            release_date: Set(metadata.release_date.clone()),
            rating: Set(metadata.rating),
            review_summary: Set(metadata.review_summary.clone()),
            hltb_main: Set(None),
            igdb_url: Set(metadata.igdb_url.clone()),
            fetched_at: Set(now),
        };
        active.insert(db).await.ok();
    }

    Ok(GameMetadata {
        cover_url: local_cover_path.or(metadata.cover_url),
        ..metadata
    })
}
