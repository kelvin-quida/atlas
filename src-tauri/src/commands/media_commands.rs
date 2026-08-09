use tauri::State;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set,
};
use chrono::Utc;
use crate::models::game_media::{self, Model as GameMediaModel};
use crate::AppState;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum GameMediaDto {
    #[serde(rename = "screenshot")]
    Screenshot {
        url: String,
        #[serde(rename = "thumbnailUrl")]
        thumbnail_url: Option<String>,
        width: Option<i32>,
        height: Option<i32>,
    },
    #[serde(rename = "trailer")]
    Trailer {
        url: String,
        #[serde(rename = "thumbnailUrl")]
        thumbnail_url: Option<String>,
        duration: Option<i32>,
    },
}

#[derive(serde::Deserialize, Debug)]
struct IgdbMediaScreenshot {
    url: Option<String>,
    image_id: Option<String>,
}

#[derive(serde::Deserialize, Debug)]
struct IgdbMediaVideo {
    video_id: Option<String>,
    _name: Option<String>,
}

#[derive(serde::Deserialize, Debug)]
struct IgdbMediaGame {
    screenshots: Option<Vec<IgdbMediaScreenshot>>,
    videos: Option<Vec<IgdbMediaVideo>>,
}

fn normalize_game_name(name: &str) -> String {
    let cleaned = name
        .replace('.', " ")
        .replace('_', " ")
        .replace('-', " ");

    let mut sans_brackets = cleaned;
    if let Some(idx) = sans_brackets.find('(') {
        sans_brackets.truncate(idx);
    }
    if let Some(idx) = sans_brackets.find('[') {
        sans_brackets.truncate(idx);
    }

    let mut result = String::new();
    let mut prev_is_lower = false;
    for ch in sans_brackets.chars() {
        if prev_is_lower && ch.is_uppercase() {
            result.push(' ');
        }
        result.push(ch);
        prev_is_lower = ch.is_lowercase();
    }

    result.trim().to_string()
}

/// Retrieves the media gallery (screenshots/trailers) for a game.
/// If media is not in the database, fetches from IGDB, saves to DB, and returns it.
#[tauri::command]
pub async fn db_get_game_media(
    state: State<'_, AppState>,
    game_id: String,
    game_name: String,
) -> Result<Vec<GameMediaDto>, String> {
    let db = &state.db;

    // 1. Query SQLite for existing media
    let existing = game_media::Entity::find()
        .filter(game_media::Column::GameId.eq(&game_id))
        .order_by_asc(game_media::Column::SortOrder)
        .all(db)
        .await
        .map_err(|e| format!("DB query error: {}", e))?;

    if !existing.is_empty() {
        return Ok(existing.into_iter().map(to_dto).collect());
    }

    // 2. Fetch game from DB to check for igdb_id
    let game_model = crate::models::game::Entity::find_by_id(&game_id)
        .one(db)
        .await
        .ok()
        .flatten();

    let igdb_id = game_model.as_ref().and_then(|g| g.igdb_id);

    // 3. Fetch from IGDB
    let token = state.get_igdb_token().await?;
    let client = reqwest::Client::new();

    let body = if let Some(id) = igdb_id {
        format!(
            r#"where id = {}; fields screenshots.url, screenshots.image_id, videos.video_id, videos.name;"#,
            id
        )
    } else {
        let normalized = normalize_game_name(&game_name);
        let query_name = if normalized.is_empty() { game_name.clone() } else { normalized };
        let escaped_name = query_name.replace('"', "\\\"");
        format!(
            r#"search "{}"; fields screenshots.url, screenshots.image_id, videos.video_id, videos.name; limit 5;"#,
            escaped_name
        )
    };

    let response = client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", crate::CLIENT_ID)
        .header("Authorization", format!("Bearer {}", token))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("IGDB request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("IGDB API returned HTTP {}", response.status()));
    }

    let games = response
        .json::<Vec<IgdbMediaGame>>()
        .await
        .map_err(|e| format!("Failed to parse IGDB response: {}", e))?;

    let mut media_list = Vec::new();
    let now = Utc::now().to_rfc3339();

    // Prefer candidate with videos, or default to the first match
    let chosen_game = games
        .iter()
        .find(|g| g.videos.as_ref().map_or(false, |v| !v.is_empty()))
        .or_else(|| games.first());

    if let Some(game) = chosen_game {
        let mut sort_order = 0;

        // Process videos/trailers first so they appear first in the gallery
        if let Some(ref videos) = game.videos {
            for video in videos {
                if let Some(ref vid_id) = video.video_id {
                    let yt_url = format!("https://www.youtube.com/watch?v={}", vid_id);
                    let yt_thumb = format!("https://img.youtube.com/vi/{}/hqdefault.jpg", vid_id);
                    
                    let active = game_media::ActiveModel {
                        id: sea_orm::ActiveValue::NotSet,
                        game_id: Set(game_id.clone()),
                        media_type: Set("trailer".to_string()),
                        url: Set(yt_url),
                        thumbnail_url: Set(Some(yt_thumb)),
                        width: Set(None),
                        height: Set(None),
                        duration: Set(None),
                        sort_order: Set(sort_order),
                        source: Set(Some("igdb".to_string())),
                        created_at: Set(now.clone()),
                    };

                    let model = active.insert(db).await.map_err(|e| format!("DB insert error: {}", e))?;
                    media_list.push(to_dto(model));
                    sort_order += 1;
                }
            }
        }

        // Process screenshots
        if let Some(ref screenshots) = game.screenshots {
            for screenshot in screenshots {
                let url_opt = if let Some(ref img_id) = screenshot.image_id {
                    Some((
                        format!("https://images.igdb.com/igdb/image/upload/t_1080p/{}.jpg", img_id),
                        format!("https://images.igdb.com/igdb/image/upload/t_screenshot_med/{}.jpg", img_id)
                    ))
                } else if let Some(ref raw_url) = screenshot.url {
                    let mut clean_url = raw_url.clone();
                    if clean_url.starts_with("//") {
                        clean_url = format!("https:{}", clean_url);
                    }
                    Some((
                        clean_url.replace("t_thumb", "t_1080p"),
                        clean_url.replace("t_thumb", "t_screenshot_med")
                    ))
                } else {
                    None
                };

                if let Some((big_url, thumb_url)) = url_opt {
                    let active = game_media::ActiveModel {
                        id: sea_orm::ActiveValue::NotSet,
                        game_id: Set(game_id.clone()),
                        media_type: Set("screenshot".to_string()),
                        url: Set(big_url),
                        thumbnail_url: Set(Some(thumb_url)),
                        width: Set(None),
                        height: Set(None),
                        duration: Set(None),
                        sort_order: Set(sort_order),
                        source: Set(Some("igdb".to_string())),
                        created_at: Set(now.clone()),
                    };

                    let model = active.insert(db).await.map_err(|e| format!("DB insert error: {}", e))?;
                    media_list.push(to_dto(model));
                    sort_order += 1;
                }
            }
        }
    }

    Ok(media_list)
}

fn to_dto(model: GameMediaModel) -> GameMediaDto {
    match model.media_type.as_str() {
        "trailer" => GameMediaDto::Trailer {
            url: model.url,
            thumbnail_url: model.thumbnail_url,
            duration: model.duration,
        },
        _ => GameMediaDto::Screenshot {
            url: model.url,
            thumbnail_url: model.thumbnail_url,
            width: model.width,
            height: model.height,
        },
    }
}
