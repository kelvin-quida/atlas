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

/// Downloads a background image from `url` and saves it to `app_data_dir/assets/backgrounds/{game_id}.jpg`.
/// Returns relative path `assets/backgrounds/{game_id}.jpg` on success.
pub async fn download_background(
    game_id: &str,
    url: &str,
    app_data_dir: &Path,
) -> Result<String, String> {
    let bg_dir = app_data_dir.join("assets").join("backgrounds");
    fs::create_dir_all(&bg_dir)
        .await
        .map_err(|e| format!("Failed to create backgrounds dir: {}", e))?;

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

    let ext = resolved_url
        .split('?')
        .next()
        .and_then(|p| p.rsplit('.').next())
        .filter(|e| ["jpg", "jpeg", "png", "webp"].contains(e))
        .unwrap_or("jpg");

    let filename = format!("{}.{}", game_id, ext);
    let file_path = bg_dir.join(&filename);

    fs::write(&file_path, &bytes)
        .await
        .map_err(|e| format!("Failed to write background file: {}", e))?;

    Ok(format!("assets/backgrounds/{}", filename))
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

#[derive(serde::Deserialize)]
struct DdgImageItem {
    image: Option<String>,
    thumbnail: Option<String>,
}

#[derive(serde::Deserialize)]
struct DdgResponse {
    results: Option<Vec<DdgImageItem>>,
}

fn extract_bing_images(html: &str) -> Vec<String> {
    let mut urls = Vec::new();
    
    // Look for murl&quot;:&quot;... or murl":"...
    for key in &["murl&quot;:&quot;", "murl\":\""] {
        let mut cursor = html;
        while let Some(idx) = cursor.find(key) {
            let rest = &cursor[idx + key.len()..];
            let end = rest.find(|c: char| c == '&' || c == '"' || c == '\'' || c.is_whitespace())
                .unwrap_or(rest.len());
            if end > 0 {
                let raw_url = &rest[..end];
                let clean_url = raw_url.replace("&amp;", "&").replace("%20", " ");
                if (clean_url.starts_with("http://") || clean_url.starts_with("https://")) && !urls.contains(&clean_url) {
                    urls.push(clean_url);
                }
            }
            cursor = &rest[end..];
        }
    }

    urls
}

fn extract_vqd(html: &str) -> Option<String> {
    for pattern in &["vqd=\"", "vqd='", "vqd=", "vqd: \"", "vqd: '"] {
        if let Some(idx) = html.find(pattern) {
            let rest = &html[idx + pattern.len()..];
            let end = rest.find(|c: char| c == '"' || c == '\'' || c == '&' || c == ';' || c.is_whitespace())
                .unwrap_or(rest.len());
            if end > 0 {
                return Some(rest[..end].to_string());
            }
        }
    }
    None
}

/// Searches Bing Images and DuckDuckGo for candidate images corresponding to `query`.
/// Returns a list of image URLs.
pub async fn search_images(query: &str, target: Option<&str>) -> Result<Vec<String>, String> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Client creation error: {}", e))?;

    let mut urls = Vec::new();

    let qft_filter = match target {
        Some("cover") => "+filterui:aspect-tall",
        Some("background") => "+filterui:aspect-wide",
        _ => {
            if query.to_lowercase().contains("cover") || query.to_lowercase().contains("capa") {
                "+filterui:aspect-tall"
            } else if query.to_lowercase().contains("background") || query.to_lowercase().contains("fundo") || query.to_lowercase().contains("wallpaper") {
                "+filterui:aspect-wide"
            } else {
                ""
            }
        }
    };

    // 1. Try Bing Images Async endpoint (Fast & High Quality)
    let mut params = vec![("q", query), ("first", "1"), ("count", "40")];
    if !qft_filter.is_empty() {
        params.push(("qft", qft_filter));
    }

    let bing_url = reqwest::Url::parse_with_params("https://www.bing.com/images/async", &params);
    if let Ok(u) = bing_url {
        if let Ok(res) = client.get(u).send().await {
            if let Ok(html) = res.text().await {
                let bing_results = extract_bing_images(&html);
                for img in bing_results {
                    if !urls.contains(&img) {
                        urls.push(img);
                    }
                }
            }
        }
    }

    // 2. Try DuckDuckGo Images if Bing returned fewer than 10 images
    if urls.len() < 10 {
        let ddg_aspect = match target {
            Some("cover") => ",aspect:tall,,",
            Some("background") => ",aspect:wide,,",
            _ => {
                if query.to_lowercase().contains("cover") || query.to_lowercase().contains("capa") {
                    ",aspect:tall,,"
                } else if query.to_lowercase().contains("background") || query.to_lowercase().contains("wallpaper") {
                    ",aspect:wide,,"
                } else {
                    ",,,"
                }
            }
        };

        let init_url = reqwest::Url::parse_with_params(
            "https://duckduckgo.com/",
            &[("q", query), ("iax", "images"), ("ia", "images")],
        );
        if let Ok(u) = init_url {
            if let Ok(res) = client.get(u).send().await {
                if let Ok(html) = res.text().await {
                    if let Some(vqd) = extract_vqd(&html) {
                        let api_url = reqwest::Url::parse_with_params(
                            "https://duckduckgo.com/i.js",
                            &[
                                ("l", "us-en"),
                                ("o", "json"),
                                ("q", query),
                                ("vqd", &vqd),
                                ("f", ddg_aspect),
                                ("p", "1"),
                            ],
                        );
                        if let Ok(api_u) = api_url {
                            if let Ok(api_res) = client.get(api_u).header("Referer", "https://duckduckgo.com/").send().await {
                                if let Ok(data) = api_res.json::<DdgResponse>().await {
                                    if let Some(results) = data.results {
                                        for item in results {
                                            if let Some(img) = item.image {
                                                if (img.starts_with("http://") || img.starts_with("https://")) && !urls.contains(&img) {
                                                    urls.push(img);
                                                }
                                            } else if let Some(thumb) = item.thumbnail {
                                                if (thumb.starts_with("http://") || thumb.starts_with("https://")) && !urls.contains(&thumb) {
                                                    urls.push(thumb);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(urls)
}

