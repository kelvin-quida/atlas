use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, DatabaseConnection,
    EntityTrait, QueryFilter, Set,
};
use chrono::Utc;
use uuid::Uuid;
use std::path::Path;

use crate::models::{
    game::{self, ActiveModel as GameActive},
    image_asset,
    play_session,
    settings,
};

// ── Steam Web API key ─────────────────────────────────────────────────────────
const STEAM_API_KEY: &str = "5D3C506D825AD8F771E62222353C9D10";

// ── Response types from Steam Web API ─────────────────────────────────────────

#[derive(serde::Deserialize, Debug)]
struct OwnedGamesResponse {
    response: OwnedGamesInner,
}

#[derive(serde::Deserialize, Debug)]
struct OwnedGamesInner {
    #[allow(dead_code)]
    game_count: Option<u32>,
    games: Option<Vec<SteamOwnedGame>>,
}

#[derive(serde::Deserialize, Debug)]
pub struct SteamOwnedGame {
    appid: u64,
    name: Option<String>,
    #[allow(dead_code)]
    img_icon_url: Option<String>,
    pub playtime_forever: Option<u64>,
}

#[derive(serde::Deserialize, Debug)]
struct SteamPlayerSummaryResponse {
    response: SteamPlayerSummaryInner,
}

#[derive(serde::Deserialize, Debug)]
struct SteamPlayerSummaryInner {
    players: Vec<SteamPlayer>,
}

#[derive(serde::Deserialize, Debug, Clone)]
pub struct SteamPlayer {
    pub steamid: String,
    pub personaname: String,
    pub avatarfull: String,
    pub profileurl: String,
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct SteamUserInfo {
    pub steam_id: String,
    pub persona_name: String,
    pub avatar_url: String,
    pub profile_url: String,
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct SteamImportResult {
    pub imported: u32,
    pub updated: u32,
    pub total: u32,
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct SteamImportProgress {
    pub current: u32,
    pub total: u32,
    pub percentage: u32,
    pub current_game: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct SteamNewsItem {
    pub gid: String,
    pub title: String,
    pub url: String,
    pub is_external_url: Option<bool>,
    pub author: String,
    pub contents: String,
    pub feedlabel: Option<String>,
    pub date: u64,
    pub feedname: Option<String>,
    pub feed_type: Option<u32>,
    pub appid: u64,
}

#[derive(serde::Deserialize, Debug)]
struct SteamNewsResponse {
    appnews: SteamAppNewsInner,
}

#[derive(serde::Deserialize, Debug)]
struct SteamAppNewsInner {
    #[allow(dead_code)]
    appid: u64,
    newsitems: Option<Vec<SteamNewsItem>>,
    #[allow(dead_code)]
    count: u32,
}

// ── OpenID 2.0 login flow ─────────────────────────────────────────────────────

/// Starts a local HTTP server, opens the Steam OpenID login page, waits for
/// callback, verifies the assertion, and returns the SteamID64.
pub async fn steam_openid_login() -> Result<String, String> {
    use std::sync::{Arc, atomic::{AtomicBool, Ordering}};

    let callback_port = 29170u16;
    let callback_url = format!("http://localhost:{}/callback", callback_port);
    let realm = format!("http://localhost:{}/", callback_port);

    // Build Steam OpenID URL
    let steam_login_url = format!(
        "https://steamcommunity.com/openid/login?\
openid.ns=http://specs.openid.net/auth/2.0\
&openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select\
&openid.identity=http://specs.openid.net/auth/2.0/identifier_select\
&openid.return_to={}\
&openid.realm={}\
&openid.mode=checkid_setup",
        urlencoding(&callback_url),
        urlencoding(&realm),
    );

    // Start the local HTTP server in a blocking thread
    let server = tiny_http::Server::http(format!("0.0.0.0:{}", callback_port))
        .map_err(|e| format!("Failed to start local HTTP server: {}", e))?;

    // Open browser
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!("Start-Process '{}'", steam_login_url.replace('\'', "''")),
            ])
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&steam_login_url)
            .spawn();
    }

    let server_arc = Arc::new(server);
    let done = Arc::new(AtomicBool::new(false));

    let server_clone = server_arc.clone();
    let done_clone = done.clone();

    // Wait for callback in a blocking thread (with 2-minute timeout)
    let handle = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let timeout = std::time::Duration::from_secs(120);
        let start = std::time::Instant::now();

        loop {
            if start.elapsed() > timeout {
                return Err("Steam login timed out (2 minutes). Please try again.".to_string());
            }

            // recv_timeout to allow checking timeout condition
            match server_clone.recv_timeout(std::time::Duration::from_secs(2)) {
                Ok(Some(request)) => {
                    let url_str = format!("http://localhost:{}{}", callback_port, request.url());

                    if let Ok(parsed) = url::Url::parse(&url_str) {
                        let params: std::collections::HashMap<String, String> =
                            parsed.query_pairs().map(|(k, v)| (k.to_string(), v.to_string())).collect();

                        if params.get("openid.mode").map(|m| m.as_str()) == Some("id_res") {
                            // Send a nice response to the browser
                            let html = r#"<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Atlas — Steam Login</title>
<style>
body { font-family: 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0;
       display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
.card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px; padding: 3rem; text-align: center; backdrop-filter: blur(10px); }
h1 { color: #66bb6a; margin-bottom: 0.5rem; }
p { color: #aaa; }
</style></head><body>
<div class="card">
<h1>✓ Login realizado com sucesso!</h1>
<p>Você pode fechar esta aba e voltar ao Atlas.</p>
</div></body></html>"#;
                            let response = tiny_http::Response::from_string(html)
                                .with_header(
                                    tiny_http::Header::from_bytes(
                                        &b"Content-Type"[..],
                                        &b"text/html; charset=utf-8"[..],
                                    ).unwrap(),
                                );
                            let _ = request.respond(response);

                            done_clone.store(true, Ordering::SeqCst);
                            return Ok(serde_json::to_string(&params).unwrap_or_default());
                        }
                    }

                    // Not our callback — respond with 404
                    let response = tiny_http::Response::from_string("Not found")
                        .with_status_code(404);
                    let _ = request.respond(response);
                }
                Ok(None) => {}
                Err(_) => {} // timeout, continue loop
            }
        }
    });

    let params_json = handle.await.map_err(|e| format!("Task join error: {}", e))??;

    // Parse params back
    let params: std::collections::HashMap<String, String> =
        serde_json::from_str(&params_json).map_err(|e| format!("JSON parse error: {}", e))?;

    // Verify the assertion with Steam
    verify_steam_openid(&params).await?;

    // Extract SteamID from claimed_id
    // Format: https://steamcommunity.com/openid/id/76561198XXXXXXXXX
    let claimed_id = params.get("openid.claimed_id")
        .ok_or_else(|| "Missing openid.claimed_id in Steam response".to_string())?;

    let steam_id = claimed_id
        .rsplit('/')
        .next()
        .ok_or_else(|| "Could not extract SteamID from claimed_id".to_string())?
        .to_string();

    if steam_id.is_empty() || !steam_id.chars().all(|c| c.is_ascii_digit()) {
        return Err(format!("Invalid SteamID extracted: {}", steam_id));
    }

    Ok(steam_id)
}

/// Verify the OpenID assertion by POSTing back to Steam
async fn verify_steam_openid(params: &std::collections::HashMap<String, String>) -> Result<(), String> {
    let client = reqwest::Client::new();

    let mut verify_params: Vec<(String, String)> = params
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    // Change mode to check_authentication
    for param in verify_params.iter_mut() {
        if param.0 == "openid.mode" {
            param.1 = "check_authentication".to_string();
        }
    }

    let response = client
        .post("https://steamcommunity.com/openid/login")
        .form(&verify_params)
        .send()
        .await
        .map_err(|e| format!("Steam verification request failed: {}", e))?;

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read Steam verification response: {}", e))?;

    if body.contains("is_valid:true") {
        Ok(())
    } else {
        Err(format!("Steam OpenID verification failed. Response: {}", body))
    }
}

/// Simple URL encoding (percent-encode)
fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

// ── Steam Web API calls ───────────────────────────────────────────────────────

/// Fetch the user's Steam profile info (name, avatar)
pub async fn get_user_info(steam_id: &str) -> Result<SteamUserInfo, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={}&steamids={}",
        STEAM_API_KEY, steam_id
    );

    let response = client.get(&url).send().await
        .map_err(|e| format!("Failed to fetch Steam profile: {}", e))?;

    let data: SteamPlayerSummaryResponse = response.json().await
        .map_err(|e| format!("Failed to parse Steam profile response: {}", e))?;

    let player = data.response.players.into_iter().next()
        .ok_or_else(|| "No player found for this SteamID".to_string())?;

    Ok(SteamUserInfo {
        steam_id: player.steamid,
        persona_name: player.personaname,
        avatar_url: player.avatarfull,
        profile_url: player.profileurl,
    })
}

/// Fetch all owned games for a Steam user
pub async fn get_owned_games(steam_id: &str) -> Result<Vec<SteamOwnedGame>, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?\
         key={}&steamid={}&include_appinfo=1&include_played_free_games=1&format=json",
        STEAM_API_KEY, steam_id
    );

    let response = client.get(&url).send().await
        .map_err(|e| format!("Failed to fetch Steam library: {}", e))?;

    let data: OwnedGamesResponse = response.json().await
        .map_err(|e| format!("Failed to parse Steam library response: {}", e))?;

    Ok(data.response.games.unwrap_or_default())
}

/// Helper: Clean game title for searching (remove trailing (PC), (Shortcut), etc.)
fn clean_search_title(title: &str) -> String {
    let mut clean = title.to_string();
    if let Some(idx) = clean.find('(') {
        clean = clean[..idx].to_string();
    }
    if let Some(idx) = clean.find('[') {
        clean = clean[..idx].to_string();
    }
    clean.trim().to_string()
}

/// Helper: Search Steam Store for an appid by game name
pub async fn search_steam_appid_by_name(name: &str) -> Option<u64> {
    let clean_name = clean_search_title(name);
    if clean_name.is_empty() {
        return None;
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    // 1. Try steamcommunity SearchApps API
    let search_apps_url = format!(
        "https://steamcommunity.com/actions/SearchApps/{}",
        urlencoding(&clean_name)
    );

    #[derive(serde::Deserialize, Debug)]
    struct SearchAppItem {
        appid: String,
    }

    if let Ok(res) = client.get(&search_apps_url).send().await {
        if let Ok(items) = res.json::<Vec<SearchAppItem>>().await {
            if let Some(first) = items.into_iter().next() {
                if let Ok(id) = first.appid.parse::<u64>() {
                    return Some(id);
                }
            }
        }
    }

    // 2. Try storesearch API with cc=US
    let store_search_url = format!(
        "https://store.steampowered.com/api/storesearch/?term={}&cc=US&l=english",
        urlencoding(&clean_name)
    );

    #[derive(serde::Deserialize, Debug)]
    struct StoreSearchItem {
        id: u64,
    }

    #[derive(serde::Deserialize, Debug)]
    struct StoreSearchResponse {
        items: Option<Vec<StoreSearchItem>>,
    }

    if let Ok(res) = client.get(&store_search_url).send().await {
        if let Ok(data) = res.json::<StoreSearchResponse>().await {
            if let Some(items) = data.items {
                if let Some(first) = items.into_iter().next() {
                    return Some(first.id);
                }
            }
        }
    }

    None
}

/// Fetch latest news and patch notes for a game by AppID or Game Name (for custom/local games)
pub async fn get_game_news(
    appid_or_id: &str,
    game_name: Option<&str>,
    count: u32,
) -> Result<Vec<SteamNewsItem>, String> {
    let trimmed = appid_or_id.trim();

    // Determine target Steam AppID: if numeric, use directly. Otherwise, search Steam Store by name.
    let target_appid = if !trimmed.is_empty() && trimmed.chars().all(|c| c.is_ascii_digit()) {
        trimmed.to_string()
    } else if let Some(name) = game_name {
        if let Some(resolved_id) = search_steam_appid_by_name(name).await {
            resolved_id.to_string()
        } else {
            return Ok(Vec::new());
        }
    } else {
        return Ok(Vec::new());
    };

    let fetch_count = count + 5;
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid={}&count={}&maxlength=0&format=json",
        target_appid, fetch_count
    );

    let response = client.get(&url).send().await
        .map_err(|e| format!("Failed to fetch Steam news: {}", e))?;

    let data: SteamNewsResponse = response.json().await
        .map_err(|e| format!("Failed to parse Steam news response: {}", e))?;

    let filtered: Vec<SteamNewsItem> = data.appnews.newsitems.unwrap_or_default()
        .into_iter()
        .filter(|item| {
            let combined = format!(
                "{} {} {} {}",
                item.url.to_lowercase(),
                item.feedname.as_deref().unwrap_or("").to_lowercase(),
                item.feedlabel.as_deref().unwrap_or("").to_lowercase(),
                item.author.to_lowercase()
            );

            !combined.contains("gamemag")
                && !combined.contains("rockpapershotgun")
                && !combined.contains("rock_paper")
                && !combined.contains("rock-paper")
                && !combined.contains("rock, paper")
                && !combined.contains("shotgun")
        })
        .take(count as usize)
        .collect();

    Ok(filtered)
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct SteamReviewItem {
    pub recommendationid: String,
    pub author_name: String,
    pub author_avatar: String,
    pub playtime_forever_hours: f64,
    pub voted_up: bool,
    pub votes_up: u32,
    pub votes_funny: u32,
    pub review_text: String,
    pub timestamp_created: u64,
    pub language: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct SteamReviewsFetchResult {
    pub reviews: Vec<SteamReviewItem>,
    pub cursor: Option<String>,
}

#[derive(serde::Deserialize, Debug)]
struct SteamReviewsListResponse {
    #[allow(dead_code)]
    success: u32,
    cursor: Option<String>,
    reviews: Option<Vec<SteamRawReview>>,
}

#[derive(serde::Deserialize, Debug)]
struct SteamRawReview {
    recommendationid: String,
    author: SteamRawReviewAuthor,
    language: String,
    review: String,
    timestamp_created: u64,
    voted_up: bool,
    votes_up: u32,
    votes_funny: u32,
}

#[derive(serde::Deserialize, Debug)]
struct SteamRawReviewAuthor {
    steamid: String,
    personaname: Option<String>,
    avatar: Option<String>,
    playtime_forever: Option<u64>,
}

/// Helper: map app language code to Steam's internal review language parameter
fn map_app_language_to_steam(lang: &str) -> String {
    let lower = lang.to_lowercase();
    if lower.contains("pt") || lower.contains("portuguese") || lower.contains("brazilian") || lower.contains("br") {
        "brazilian,portuguese".to_string()
    } else if lower.contains("es") || lower.contains("spanish") {
        "spanish,latam".to_string()
    } else if lower.contains("en") || lower.contains("english") {
        "english".to_string()
    } else if lower.contains("fr") || lower.contains("french") {
        "french".to_string()
    } else if lower.contains("de") || lower.contains("german") {
        "german".to_string()
    } else if lower.contains("ja") || lower.contains("japanese") {
        "japanese".to_string()
    } else if lower.contains("zh") || lower.contains("chinese") {
        "schinese,tchinese".to_string()
    } else {
        lower
    }
}

/// Fetch player reviews from Steam Store AppReviews API for a game (filtered by app language & cursor)
pub async fn get_game_reviews(
    appid_or_id: &str,
    game_name: Option<&str>,
    count: u32,
    language: Option<&str>,
    cursor: Option<&str>,
) -> Result<SteamReviewsFetchResult, String> {
    let trimmed = appid_or_id.trim();

    let target_appid = if !trimmed.is_empty() && trimmed.chars().all(|c| c.is_ascii_digit()) {
        trimmed.to_string()
    } else if let Some(name) = game_name {
        if let Some(resolved_id) = search_steam_appid_by_name(name).await {
            resolved_id.to_string()
        } else {
            return Ok(SteamReviewsFetchResult { reviews: Vec::new(), cursor: None });
        }
    } else {
        return Ok(SteamReviewsFetchResult { reviews: Vec::new(), cursor: None });
    };

    let fetch_count = count.clamp(1, 100);
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let target_lang = language
        .map(map_app_language_to_steam)
        .unwrap_or_else(|| "brazilian,portuguese".to_string());

    let cursor_param = cursor.unwrap_or("*");
    let encoded_cursor: String = url::form_urlencoded::byte_serialize(cursor_param.as_bytes()).collect();

    // 1. Try to fetch reviews in requested language
    let url = format!(
        "https://store.steampowered.com/appreviews/{}?json=1&language={}&l=portuguese&filter=all&review_type=all&purchase_type=all&num_per_page={}&cursor={}",
        target_appid, target_lang, fetch_count, encoded_cursor
    );

    let mut raw_reviews = Vec::new();
    let mut next_cursor = None;

    if let Ok(response) = client.get(&url).send().await {
        if let Ok(data) = response.json::<SteamReviewsListResponse>().await {
            next_cursor = data.cursor;
            raw_reviews = data.reviews.unwrap_or_default();
        }
    }

    // 2. If language-filtered reviews are empty and initial request, fallback to language=all
    if raw_reviews.is_empty() && (cursor_param == "*" || cursor.is_none()) {
        let fallback_url = format!(
            "https://store.steampowered.com/appreviews/{}?json=1&language=all&l=portuguese&filter=all&review_type=all&purchase_type=all&num_per_page={}&cursor=*",
            target_appid, fetch_count
        );
        if let Ok(response) = client.get(&fallback_url).send().await {
            if let Ok(data) = response.json::<SteamReviewsListResponse>().await {
                next_cursor = data.cursor;
                raw_reviews = data.reviews.unwrap_or_default();
            }
        }
    }

    let items: Vec<SteamReviewItem> = raw_reviews
        .into_iter()
        .map(|r| {
            let author_name = r.author.personaname.clone()
                .filter(|n| !n.trim().is_empty())
                .unwrap_or_else(|| format!("Jogador {}", &r.author.steamid[..6.min(r.author.steamid.len())]));
            let avatar = r.author.avatar.clone().map(|hash| {
                format!("https://avatars.steamstatic.com/{}_full.jpg", hash)
            }).unwrap_or_default();
            let hours = r.author.playtime_forever.unwrap_or(0) as f64 / 60.0;

            SteamReviewItem {
                recommendationid: r.recommendationid,
                author_name,
                author_avatar: avatar,
                playtime_forever_hours: (hours * 10.0).round() / 10.0,
                voted_up: r.voted_up,
                votes_up: r.votes_up,
                votes_funny: r.votes_funny,
                review_text: r.review,
                timestamp_created: r.timestamp_created,
                language: r.language,
            }
        })
        .collect();

    Ok(SteamReviewsFetchResult {
        reviews: items,
        cursor: next_cursor,
    })
}

/// Returns true if a game/app is a Steam runtime tool or Proton version (e.g. Proton 7.0, Proton Experimental, Steam Linux Runtime, Steamworks Common Redistributables, etc.).
pub fn is_steam_tool_or_proton(name: &str, appid: Option<&str>) -> bool {
    if let Some(id) = appid {
        match id {
            "228980" | "1070560" | "1391110" | "1628350" | "1803580"
            | "1458770" | "2348520" | "2805730" | "1887720" | "1580130"
            | "1245040" | "1229540" | "1113280" | "1168040" | "2180100"
            | "250820" => return true,
            _ => {}
        }
    }

    let lower = name.to_lowercase();
    let trimmed = lower.trim();

    if trimmed == "proton"
        || trimmed.contains("ge-proton")
        || trimmed.contains("proton-ge")
        || trimmed.contains("proton-tkg")
        || trimmed.contains("steam linux runtime")
        || trimmed.contains("steamworks common redistributables")
        || trimmed.contains("steam controller configs")
    {
        return true;
    }

    if trimmed.starts_with("proton") {
        let rest = trimmed["proton".len()..].trim_start();
        if rest.is_empty() {
            return true;
        }
        let first_char = rest.chars().next().unwrap_or(' ');
        if first_char.is_ascii_digit() || first_char == '(' || first_char == '-' || first_char == '.' {
            return true;
        }
        if rest.contains("experimental")
            || rest.contains("hotfix")
            || rest.contains("next")
            || rest.contains("easyanticheat")
            || rest.contains("battleye")
            || rest.contains("runtime")
            || rest.contains("container")
            || rest.contains("tool")
            || rest.contains("beta")
            || rest.contains("sdk")
        {
            return true;
        }
    }

    false
}

/// Import all owned games into the database (upsert — update existing, insert new)
pub async fn import_library(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    steam_id: &str,
    app_data_dir: &Path,
) -> Result<SteamImportResult, String> {
    use tauri::Emitter;

    let owned = get_owned_games(steam_id).await?;
    let total = owned.len() as u32;
    let mut imported = 0u32;
    let mut updated = 0u32;

    for (index, steam_game) in owned.iter().enumerate() {
        let current = (index + 1) as u32;
        let percentage = if total > 0 { (current * 100) / total } else { 100 };
        let app_id_str = steam_game.appid.to_string();
        let name = steam_game.name.clone().unwrap_or_else(|| format!("App {}", steam_game.appid));

        if is_steam_tool_or_proton(&name, Some(&app_id_str)) {
            continue;
        }

        // Emit progress event to frontend
        let _ = app.emit(
            "steam-import-progress",
            SteamImportProgress {
                current,
                total,
                percentage,
                current_game: name.clone(),
            },
        );

        // Check if game already exists by steam_app_id
        let existing = game::Entity::find()
            .filter(game::Column::SteamAppId.eq(&app_id_str))
            .one(db)
            .await
            .map_err(|e| format!("DB query error: {}", e))?;

        if let Some(existing_game) = existing {
            // Update existing game with latest data
            let mut active: GameActive = existing_game.clone().into();
            active.name = Set(name.clone());
            active.sort_name = Set(Some(normalize_sort_name(&name)));
            active.platform = Set("steam".to_string());

            active.update(db).await
                .map_err(|e| format!("DB update error: {}", e))?;

            // Download & store cover/background if missing on disk
            upsert_steam_cover(db, &existing_game.id, &app_id_str, app_data_dir).await;
            upsert_steam_background(db, &existing_game.id, &app_id_str, app_data_dir).await;
            upsert_steam_playtime(db, &existing_game.id, steam_game.playtime_forever).await;

            updated += 1;
        } else {
            // Create new game
            let id = Uuid::new_v4().to_string();
            let now = Utc::now().to_rfc3339();
            let sort_name = normalize_sort_name(&name);

            let active = GameActive {
                id: Set(id.clone()),
                name: Set(name.clone()),
                platform: Set("steam".to_string()),
                source: Set("steam_api".to_string()),
                exe_path: Set(None),
                install_dir: Set(None),
                steam_app_id: Set(Some(app_id_str.clone())),
                igdb_id: Set(None),
                added_at: Set(now),
                last_played: Set(None),
                sort_name: Set(Some(sort_name)),
            };

            if let Err(e) = active.insert(db).await {
                eprintln!("Failed to import Steam game {}: {}", name, e);
                continue;
            }

            // Download and store cover & background in assets/
            upsert_steam_cover(db, &id, &app_id_str, app_data_dir).await;
            upsert_steam_background(db, &id, &app_id_str, app_data_dir).await;
            upsert_steam_playtime(db, &id, steam_game.playtime_forever).await;

            imported += 1;
        }
    }

    Ok(SteamImportResult { imported, updated, total })
}

/// Helper: upsert imported Steam playtime as a special play_session
async fn upsert_steam_playtime(db: &DatabaseConnection, game_id: &str, playtime_forever: Option<u64>) {
    let minutes = match playtime_forever {
        Some(m) if m > 0 => m,
        _ => return,
    };
    let duration_seconds = (minutes * 60) as i32;
    println!("[Playtime Import] Game UUID: {}, playtime_forever: {} mins ({} secs)", game_id, minutes, duration_seconds);

    let existing_session = play_session::Entity::find()
        .filter(play_session::Column::GameId.eq(game_id))
        .filter(play_session::Column::StartedAt.eq("STEAM_IMPORT"))
        .one(db)
        .await;

    match existing_session {
        Ok(Some(sess)) => {
            let mut active: play_session::ActiveModel = sess.into();
            active.duration_seconds = Set(Some(duration_seconds));
            if let Err(e) = active.update(db).await {
                eprintln!("Failed to update Steam imported playtime for {}: {}", game_id, e);
            }
        }
        Ok(None) => {
            let active = play_session::ActiveModel {
                id: sea_orm::ActiveValue::NotSet,
                game_id: Set(game_id.to_string()),
                started_at: Set("STEAM_IMPORT".to_string()),
                ended_at: Set(Some("STEAM_IMPORT".to_string())),
                duration_seconds: Set(Some(duration_seconds)),
            };
            if let Err(e) = active.insert(db).await {
                eprintln!("Failed to insert Steam imported playtime for {}: {}", game_id, e);
            }
        }
        Err(e) => {
            eprintln!("Error querying play_sessions for {}: {}", game_id, e);
        }
    }
}

/// Helper: download & store Steam cover image with fallback, verifying local file existence
async fn upsert_steam_cover(db: &DatabaseConnection, game_id: &str, app_id: &str, app_data_dir: &Path) {
    // Check if valid local cover file already exists on disk
    if let Ok(existing_assets) = image_asset::Entity::find()
        .filter(
            Condition::all()
                .add(image_asset::Column::GameId.eq(game_id))
                .add(image_asset::Column::AssetType.eq("cover")),
        )
        .all(db)
        .await
    {
        for asset in existing_assets {
            let path = app_data_dir.join(&asset.file_path);
            if path.exists() {
                return; // Valid file already exists!
            } else {
                let _ = image_asset::Entity::delete_by_id(asset.id).exec(db).await;
            }
        }
    }

    let cover_url = format!(
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900_2x.jpg",
        app_id
    );
    let header_url = format!(
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg",
        app_id
    );

    let (rel_path, source_url) = match crate::services::image_service::download_cover(game_id, &cover_url, app_data_dir).await {
        Ok(path) => (path, cover_url),
        Err(_) => {
            match crate::services::image_service::download_cover(game_id, &header_url, app_data_dir).await {
                Ok(path) => (path, header_url),
                Err(e) => {
                    eprintln!("Failed to download cover for Steam app {}: {}", app_id, e);
                    return;
                }
            }
        }
    };

    let asset = image_asset::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        game_id: Set(game_id.to_string()),
        asset_type: Set("cover".to_string()),
        file_path: Set(rel_path),
        source_url: Set(Some(source_url)),
        downloaded_at: Set(Utc::now().to_rfc3339()),
    };
    let _ = asset.insert(db).await;
}

/// Helper: download & store Steam background image with fallback (library_hero -> header), verifying local file existence
async fn upsert_steam_background(db: &DatabaseConnection, game_id: &str, app_id: &str, app_data_dir: &Path) {
    // Check if valid local background file already exists on disk
    if let Ok(existing_assets) = image_asset::Entity::find()
        .filter(
            Condition::all()
                .add(image_asset::Column::GameId.eq(game_id))
                .add(image_asset::Column::AssetType.eq("background")),
        )
        .all(db)
        .await
    {
        for asset in existing_assets {
            let path = app_data_dir.join(&asset.file_path);
            if path.exists() {
                return; // Valid background file already exists!
            } else {
                let _ = image_asset::Entity::delete_by_id(asset.id).exec(db).await;
            }
        }
    }

    let hero_url = format!(
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
        app_id
    );
    let header_url = format!(
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg",
        app_id
    );

    let (rel_path, source_url) = match crate::services::image_service::download_background(game_id, &hero_url, app_data_dir).await {
        Ok(path) => (path, hero_url),
        Err(_) => {
            match crate::services::image_service::download_background(game_id, &header_url, app_data_dir).await {
                Ok(path) => (path, header_url),
                Err(e) => {
                    eprintln!("Failed to download background for Steam app {}: {}", app_id, e);
                    return;
                }
            }
        }
    };

    let asset = image_asset::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        game_id: Set(game_id.to_string()),
        asset_type: Set("background".to_string()),
        file_path: Set(rel_path),
        source_url: Set(Some(source_url)),
        downloaded_at: Set(Utc::now().to_rfc3339()),
    };
    let _ = asset.insert(db).await;
}

// ── Settings helpers (persist SteamID in DB settings table) ───────────────────

/// Save the Steam ID to the settings table
pub async fn save_steam_id(db: &DatabaseConnection, steam_id: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();

    // Try to find existing
    let existing = settings::Entity::find_by_id("steam_id")
        .one(db)
        .await
        .map_err(|e| format!("DB query error: {}", e))?;

    if let Some(_) = existing {
        let active = settings::ActiveModel {
            key: Set("steam_id".to_string()),
            value: Set(steam_id.to_string()),
            updated_at: Set(now),
        };
        active.update(db).await
            .map_err(|e| format!("DB update error: {}", e))?;
    } else {
        let active = settings::ActiveModel {
            key: Set("steam_id".to_string()),
            value: Set(steam_id.to_string()),
            updated_at: Set(now),
        };
        active.insert(db).await
            .map_err(|e| format!("DB insert error: {}", e))?;
    }

    Ok(())
}

/// Load the Steam ID from the settings table (returns None if not logged in)
pub async fn load_steam_id(db: &DatabaseConnection) -> Result<Option<String>, String> {
    let row = settings::Entity::find_by_id("steam_id")
        .one(db)
        .await
        .map_err(|e| format!("DB query error: {}", e))?;

    Ok(row.map(|r| r.value).filter(|v| !v.is_empty()))
}

/// Clear the Steam ID from the settings table
pub async fn clear_steam_id(db: &DatabaseConnection) -> Result<(), String> {
    let _ = settings::Entity::delete_by_id("steam_id")
        .exec(db)
        .await;
    Ok(())
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
