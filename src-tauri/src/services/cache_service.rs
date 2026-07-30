use std::path::Path;
use tokio::fs;
use chrono::{Utc, Duration};

/// Reads a cached JSON response from `cache/igdb/{igdb_id}.json`.
/// Returns `None` if the file doesn't exist or is older than `max_age_hours`.
pub async fn get_cached_igdb(igdb_id: i64, app_data_dir: &Path, max_age_hours: i64) -> Option<String> {
    let cache_path = app_data_dir
        .join("cache")
        .join("igdb")
        .join(format!("{}.json", igdb_id));

    if !cache_path.exists() {
        return None;
    }

    // Check file age
    if let Ok(metadata) = std::fs::metadata(&cache_path) {
        if let Ok(modified) = metadata.modified() {
            let age = Utc::now().signed_duration_since(
                chrono::DateTime::<Utc>::from(modified),
            );
            if age > Duration::hours(max_age_hours) {
                return None;
            }
        }
    }

    fs::read_to_string(&cache_path).await.ok()
}

/// Saves a raw IGDB JSON response to `cache/igdb/{igdb_id}.json`.
pub async fn save_cache_igdb(igdb_id: i64, data: &str, app_data_dir: &Path) {
    let cache_dir = app_data_dir.join("cache").join("igdb");
    if let Err(e) = fs::create_dir_all(&cache_dir).await {
        eprintln!("Failed to create IGDB cache dir: {}", e);
        return;
    }
    let cache_path = cache_dir.join(format!("{}.json", igdb_id));
    if let Err(e) = fs::write(&cache_path, data).await {
        eprintln!("Failed to write IGDB cache {}: {}", igdb_id, e);
    }
}

/// Ensures all required subdirectories exist under `app_data_dir`.
pub async fn ensure_directories(app_data_dir: &Path) {
    let dirs = [
        "assets/covers",
        "assets/backgrounds",
        "assets/logos",
        "assets/icons",
        "cache/igdb",
        "cache/steam",
        "logs",
    ];
    for dir in dirs {
        if let Err(e) = fs::create_dir_all(app_data_dir.join(dir)).await {
            eprintln!("Failed to create directory {}: {}", dir, e);
        }
    }
}
