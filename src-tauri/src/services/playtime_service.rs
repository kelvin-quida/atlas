use sea_orm::{ActiveModelTrait, DatabaseConnection, EntityTrait, Set};
use chrono::Utc;
use crate::models::play_session;

/// Starts a new play session for the given game.
/// Returns the session ID so it can be ended later.
pub async fn start_session(db: &DatabaseConnection, game_id: &str) -> Result<i32, String> {
    let now = Utc::now().to_rfc3339();
    let active = play_session::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        game_id: Set(game_id.to_string()),
        started_at: Set(now),
        ended_at: Set(None),
        duration_seconds: Set(None),
    };
    let model = active
        .insert(db)
        .await
        .map_err(|e| format!("Failed to start play session: {}", e))?;
    Ok(model.id)
}

/// Ends an active play session and calculates the duration in seconds.
pub async fn end_session(db: &DatabaseConnection, session_id: i32) -> Result<u32, String> {
    let session = play_session::Entity::find_by_id(session_id)
        .one(db)
        .await
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    let now = Utc::now();
    let started = chrono::DateTime::parse_from_rfc3339(&session.started_at)
        .map_err(|e| format!("Failed to parse started_at: {}", e))?
        .with_timezone(&Utc);

    let duration_secs = (now - started).num_seconds().max(0) as u32;

    let active = play_session::ActiveModel {
        id: Set(session.id),
        game_id: Set(session.game_id),
        started_at: Set(session.started_at),
        ended_at: Set(Some(now.to_rfc3339())),
        duration_seconds: Set(Some(duration_secs as i32)),
    };
    active
        .update(db)
        .await
        .map_err(|e| format!("Failed to end play session: {}", e))?;

    Ok(duration_secs)
}

/// Returns the total play time for a game in seconds across all sessions.
pub async fn get_total_playtime(db: &DatabaseConnection, game_id: &str) -> Result<i64, String> {
    use sea_orm::prelude::*;

    let sessions = play_session::Entity::find()
        .filter(play_session::Column::GameId.eq(game_id))
        .all(db)
        .await
        .map_err(|e| format!("DB error: {}", e))?;

    let total: i64 = sessions
        .iter()
        .filter_map(|s| s.duration_seconds)
        .map(|d| d as i64)
        .sum();

    Ok(total)
}

/// Returns total playtime formatted as "Xh Ym" or "Xm" for display in the UI.
pub fn format_playtime(total_seconds: i64) -> String {
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else if minutes > 0 {
        format!("{}m", minutes)
    } else {
        "< 1m".to_string()
    }
}
