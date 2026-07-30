use std::path::Path;
use tokio::fs;
use reqwest::Client;

/// Downloads an image from `url` and saves it to `app_data_dir/assets/covers/{game_id}.jpg`.
/// Returns the relative path `assets/covers/{game_id}.jpg` on success.
pub async fn download_cover(
    game_id: &str,
    url: &str,
    app_data_dir: &Path,
) -> Result<String, String> {
    let covers_dir = app_data_dir.join("assets").join("covers");
    fs::create_dir_all(&covers_dir)
        .await
        .map_err(|e| format!("Failed to create covers dir: {}", e))?;

    // Resolve URL — IGDB returns protocol-relative URLs like //images.igdb.com/...
    let resolved_url = if url.starts_with("//") {
        format!("https:{}", url)
    } else {
        url.to_string()
    };

    let client = Client::new();
    let response = client
        .get(&resolved_url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {} for {}", response.status(), resolved_url));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response bytes: {}", e))?;

    // Determine extension from URL or default to jpg
    let ext = resolved_url
        .split('?')
        .next()
        .and_then(|p| p.rsplit('.').next())
        .filter(|e| ["jpg", "jpeg", "png", "webp"].contains(e))
        .unwrap_or("jpg");

    let filename = format!("{}.{}", game_id, ext);
    let file_path = covers_dir.join(&filename);

    fs::write(&file_path, &bytes)
        .await
        .map_err(|e| format!("Failed to write image file: {}", e))?;

    Ok(format!("assets/covers/{}", filename))
}

/// Returns the absolute path for a cover if it exists on disk.
pub fn get_local_cover_path(game_id: &str, app_data_dir: &Path) -> Option<std::path::PathBuf> {
    let covers_dir = app_data_dir.join("assets").join("covers");
    for ext in &["jpg", "jpeg", "png", "webp"] {
        let path = covers_dir.join(format!("{}.{}", game_id, ext));
        if path.exists() {
            return Some(path);
        }
    }
    None
}

/// Deletes a cover file from disk if it exists.
pub async fn delete_cover(game_id: &str, app_data_dir: &Path) {
    let covers_dir = app_data_dir.join("assets").join("covers");
    for ext in &["jpg", "jpeg", "png", "webp"] {
        let path = covers_dir.join(format!("{}.{}", game_id, ext));
        if path.exists() {
            let _ = fs::remove_file(&path).await;
        }
    }
}
