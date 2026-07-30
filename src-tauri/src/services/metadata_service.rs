use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, DatabaseConnection,
    EntityTrait, QueryFilter, Set,
};
use chrono::Utc;
use std::path::Path;

use crate::models::{metadata as meta_model, image_asset};
use crate::providers::traits::{GameMetadata, MetadataProvider};
use crate::services::{cache_service, image_service};

/// Fetches metadata for a game using any `MetadataProvider` and persists
/// the result to the database and disk.
///
/// - Checks the IGDB JSON cache first (24h TTL) to avoid redundant API calls.
/// - Saves the cover image to `assets/covers/` on disk.
/// - Upserts into the `metadata` table.
/// - Updates `image_assets` with the local cover path.
///
/// Returns the enriched `GameMetadata` on success.
pub async fn fetch_and_persist_metadata(
    db: &DatabaseConnection,
    provider: &dyn MetadataProvider,
    game_id: &str,
    game_name: &str,
    app_data_dir: &Path,
) -> Result<GameMetadata, String> {
    // 1. Try cache (24h TTL) — use igdb_id = 0 as key for name-based lookups
    //    We'll use the game_id as the cache filename since we don't have igdb_id yet
    let cache_key = i64::from_str_radix(&game_id.replace('-', "")[..12.min(game_id.replace('-', "").len())], 16).unwrap_or(0);

    if let Some(cached) = cache_service::get_cached_igdb(cache_key, app_data_dir, 24).await {
        if let Ok(metadata) = serde_json::from_str::<GameMetadata>(&cached) {
            return Ok(metadata);
        }
    }

    // 2. Fetch from provider
    let metadata = provider
        .fetch_metadata(game_name)
        .await?
        .ok_or_else(|| format!("No metadata found for '{}'", game_name))?;

    // 3. Cache the raw JSON
    if let Ok(json) = serde_json::to_string(&metadata) {
        cache_service::save_cache_igdb(cache_key, &json, app_data_dir).await;
    }

    // 4. Download cover to disk if available
    let local_cover_path = if let Some(ref cover_url) = metadata.cover_url {
        match image_service::download_cover(game_id, cover_url, app_data_dir).await {
            Ok(rel_path) => {
                // Upsert image asset in DB
                let now = Utc::now().to_rfc3339();

                // Remove existing cover asset for this game
                image_asset::Entity::delete_many()
                    .filter(
                        Condition::all()
                            .add(image_asset::Column::GameId.eq(game_id))
                            .add(image_asset::Column::AssetType.eq("cover")),
                    )
                    .exec(db)
                    .await
                    .ok();

                // Insert new cover asset record
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

    // 5. Upsert metadata record
    let now = Utc::now().to_rfc3339();
    let genres_json = serde_json::to_string(&metadata.genres).unwrap_or_default();

    // Check if metadata already exists
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
            hltb_main: Set(None),
            igdb_url: Set(metadata.igdb_url.clone()),
            fetched_at: Set(now),
        };
        active.insert(db).await.ok();
    }

    // 6. Return metadata enriched with local cover path (if downloaded)
    Ok(GameMetadata {
        cover_url: local_cover_path.or(metadata.cover_url),
        ..metadata
    })
}
