use sea_orm::{ActiveModelTrait, Condition, DatabaseConnection, EntityTrait, Set};
use chrono::Utc;
use crate::models::play_session;

/// Helper: resolve a game_id string (which may be a SteamAppId or UUID) to the game's primary key UUID.
async fn resolve_game_uuid(db: &DatabaseConnection, input_id: &str) -> Result<String, String> {
    use sea_orm::{ColumnTrait, QueryFilter};
    use crate::models::game;

    let found = game::Entity::find()
        .filter(
            Condition::any()
                .add(game::Column::Id.eq(input_id))
                .add(game::Column::SteamAppId.eq(input_id))
        )
        .one(db)
        .await
        .map_err(|e| format!("DB error looking up game {}: {}", input_id, e))?;

    if let Some(g) = found {
        Ok(g.id)
    } else {
        Ok(input_id.to_string())
    }
}

/// Starts a new play session for the given game.
/// Returns the session ID so it can be ended later.
pub async fn start_session(db: &DatabaseConnection, game_id: &str) -> Result<i32, String> {
    let real_id = resolve_game_uuid(db, game_id).await?;
    let now = Utc::now().to_rfc3339();
    let active = play_session::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        game_id: Set(real_id),
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
    use sea_orm::{ColumnTrait, QueryFilter};

    let real_id = resolve_game_uuid(db, game_id).await?;

    let sessions = play_session::Entity::find()
        .filter(play_session::Column::GameId.eq(&real_id))
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

/// Returns total play time for all games in the database (mapped by both UUID and SteamAppId).
pub async fn get_all_playtimes(db: &DatabaseConnection) -> Result<Vec<crate::commands::playtime_commands::PlaytimeStats>, String> {
    use sea_orm::EntityTrait;
    use crate::models::{game, play_session};
    use std::collections::HashMap;

    let all_games = game::Entity::find()
        .all(db)
        .await
        .map_err(|e| format!("DB error loading games: {}", e))?;

    let all_sessions = play_session::Entity::find()
        .all(db)
        .await
        .map_err(|e| format!("DB error loading play_sessions: {}", e))?;

    let mut game_seconds: HashMap<String, i64> = HashMap::new();
    for s in all_sessions {
        if let Some(secs) = s.duration_seconds {
            *game_seconds.entry(s.game_id).or_insert(0) += secs as i64;
        }
    }

    let mut result = Vec::new();
    for g in all_games {
        let secs = game_seconds.get(&g.id).copied().unwrap_or(0);
        let formatted = format_playtime(secs);

        result.push(crate::commands::playtime_commands::PlaytimeStats {
            game_id: g.id.clone(),
            total_seconds: secs,
            formatted: formatted.clone(),
        });

        if let Some(steam_app_id) = g.steam_app_id {
            result.push(crate::commands::playtime_commands::PlaytimeStats {
                game_id: steam_app_id,
                total_seconds: secs,
                formatted: formatted,
            });
        }
    }

    Ok(result)
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
        "Não jogado".to_string()
    }
}
