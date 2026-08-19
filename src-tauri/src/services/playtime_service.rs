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

/// Records a completed play session with start, end, and duration.
pub async fn record_finished_session(
    db: &DatabaseConnection,
    game_id: &str,
    started_at_iso: &str,
    ended_at_iso: &str,
    duration_seconds: u32,
) -> Result<i32, String> {
    let real_id = resolve_game_uuid(db, game_id).await?;
    let active = play_session::ActiveModel {
        id: sea_orm::ActiveValue::NotSet,
        game_id: Set(real_id),
        started_at: Set(started_at_iso.to_string()),
        ended_at: Set(Some(ended_at_iso.to_string())),
        duration_seconds: Set(Some(duration_seconds as i32)),
    };
    let model = active
        .insert(db)
        .await
        .map_err(|e| format!("Failed to insert finished play session: {}", e))?;
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

/// Overwrites or adjusts total playtime for a game while preserving real gameplay session history.
pub async fn set_total_playtime(db: &DatabaseConnection, game_id: &str, total_seconds: i64) -> Result<(), String> {
    use sea_orm::{ColumnTrait, QueryFilter, EntityTrait};
    use chrono::Utc;

    let real_id = resolve_game_uuid(db, game_id).await?;

    // Fetch existing play sessions
    let sessions = play_session::Entity::find()
        .filter(play_session::Column::GameId.eq(&real_id))
        .all(db)
        .await
        .map_err(|e| format!("Failed to fetch play sessions: {}", e))?;

    // Clear previous manual adjustments or historical consolidations
    play_session::Entity::delete_many()
        .filter(play_session::Column::GameId.eq(&real_id))
        .filter(
            sea_orm::Condition::any()
                .add(play_session::Column::StartedAt.eq("MANUAL_ADJUSTMENT"))
                .add(play_session::Column::StartedAt.starts_with("1970-"))
        )
        .exec(db)
        .await
        .map_err(|e| format!("Failed to clear previous manual adjustments: {}", e))?;

    // Sum remaining real gameplay sessions
    let real_total: i64 = sessions
        .iter()
        .filter(|s| s.started_at != "MANUAL_ADJUSTMENT" && !s.started_at.starts_with("1970-"))
        .map(|s| s.duration_seconds.unwrap_or(0) as i64)
        .sum();

    // If target total_seconds exceeds real session total, insert a delta session for the difference
    let adjustment_needed = total_seconds - real_total;
    if adjustment_needed > 0 {
        let now_iso = Utc::now().to_rfc3339();
        let active = play_session::ActiveModel {
            id: sea_orm::ActiveValue::NotSet,
            game_id: Set(real_id),
            started_at: Set("MANUAL_ADJUSTMENT".to_string()),
            ended_at: Set(Some(now_iso)),
            duration_seconds: Set(Some(adjustment_needed.max(0) as i32)),
        };
        active
            .insert(db)
            .await
            .map_err(|e| format!("Failed to insert manual adjustment session: {}", e))?;
    }

    Ok(())
}

/// Returns aggregated dashboard analytics.
/// Returns aggregated dashboard analytics with year and month filtering.
pub async fn get_dashboard_stats(
    db: &DatabaseConnection,
    app_data_dir: &std::path::Path,
    req_year: Option<i32>,
    req_month: Option<u32>,
) -> Result<crate::commands::playtime_commands::DashboardStats, String> {
    use sea_orm::EntityTrait;
    use crate::models::{game, play_session, image_asset};
    use chrono::{DateTime, Utc, Duration, Datelike};
    use std::collections::{HashMap, HashSet};

    let all_games = game::Entity::find()
        .all(db)
        .await
        .map_err(|e| format!("DB error loading games: {}", e))?;

    // Auto-migrate legacy 1970 sessions to current timestamp so past edits show in dashboard stats
    use sea_orm::{ColumnTrait, QueryFilter};
    let now_iso = Utc::now().to_rfc3339();
    let _ = play_session::Entity::update_many()
        .filter(play_session::Column::StartedAt.starts_with("1970-"))
        .col_expr(play_session::Column::StartedAt, sea_orm::sea_query::Expr::value(now_iso.clone()))
        .exec(db)
        .await;

    let all_sessions = play_session::Entity::find()
        .all(db)
        .await
        .map_err(|e| format!("DB error loading play_sessions: {}", e))?;

    let all_images = image_asset::Entity::find()
        .all(db)
        .await
        .unwrap_or_default();

    // Map game_id to cover/background image paths
    let mut cover_map: HashMap<String, String> = HashMap::new();
    let mut bg_map: HashMap<String, String> = HashMap::new();

    for img in all_images {
        let path = if img.file_path.starts_with("http://") || img.file_path.starts_with("https://") || img.file_path.starts_with("data:") {
            img.file_path
        } else {
            let p = std::path::Path::new(&img.file_path);
            if p.is_relative() {
                app_data_dir.join(p).to_string_lossy().into_owned()
            } else {
                img.file_path
            }
        };

        if img.asset_type == "cover" {
            cover_map.insert(img.game_id, path);
        } else if img.asset_type == "hero" || img.asset_type == "background" {
            bg_map.insert(img.game_id, path);
        }
    }

    let now = Utc::now();
    let selected_year = req_year.unwrap_or_else(|| now.year());
    let selected_month = req_month.unwrap_or_else(|| now.month());

    let month_name = match selected_month {
        1 => "Janeiro",
        2 => "Fevereiro",
        3 => "Março",
        4 => "Abril",
        5 => "Maio",
        6 => "Junho",
        7 => "Julho",
        8 => "Agosto",
        9 => "Setembro",
        10 => "Outubro",
        11 => "Novembro",
        12 => "Dezembro",
        _ => "Mês",
    };
    let selected_month_label = format!("{} de {}", month_name, selected_year);

    let week_ago = now - Duration::days(7);

    // Build available months: Include all 12 months of current and selected year + any years found in sessions
    let mut month_pairs_set: HashSet<(i32, u32)> = HashSet::new();
    for m in 1..=12 {
        month_pairs_set.insert((selected_year, m));
        month_pairs_set.insert((now.year(), m));
    }

    for s in &all_sessions {
        let is_initial = s.started_at.starts_with("1970-")
            || (s.ended_at.is_some() && s.ended_at.as_ref() == Some(&s.started_at));
        if !is_initial {
            if let Ok(dt) = DateTime::parse_from_rfc3339(&s.started_at) {
                month_pairs_set.insert((dt.year(), dt.month()));
                month_pairs_set.insert((dt.year(), 1));
                month_pairs_set.insert((dt.year(), 2));
                month_pairs_set.insert((dt.year(), 3));
                month_pairs_set.insert((dt.year(), 4));
                month_pairs_set.insert((dt.year(), 5));
                month_pairs_set.insert((dt.year(), 6));
                month_pairs_set.insert((dt.year(), 7));
                month_pairs_set.insert((dt.year(), 8));
                month_pairs_set.insert((dt.year(), 9));
                month_pairs_set.insert((dt.year(), 10));
                month_pairs_set.insert((dt.year(), 11));
                month_pairs_set.insert((dt.year(), 12));
            }
        }
    }

    let mut month_pairs: Vec<(i32, u32)> = month_pairs_set.into_iter().collect();
    month_pairs.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));

    let available_months: Vec<crate::commands::playtime_commands::MonthOption> = month_pairs
        .into_iter()
        .map(|(y, m)| {
            let m_label = match m {
                1 => "Janeiro",
                2 => "Fevereiro",
                3 => "Março",
                4 => "Abril",
                5 => "Maio",
                6 => "Junho",
                7 => "Julho",
                8 => "Agosto",
                9 => "Setembro",
                10 => "Outubro",
                11 => "Novembro",
                12 => "Dezembro",
                _ => "Mês",
            };
            crate::commands::playtime_commands::MonthOption {
                year: y,
                month: m,
                label: format!("{} de {}", m_label, y),
            }
        })
        .collect();

    // Build lookup for game records by ID and SteamAppId
    let mut id_to_game: HashMap<String, game::Model> = HashMap::new();
    for g in &all_games {
        id_to_game.insert(g.id.clone(), g.clone());
        if let Some(ref s_id) = g.steam_app_id {
            if !s_id.is_empty() {
                id_to_game.insert(s_id.clone(), g.clone());
            }
        }
    }

    struct TempMetrics {
        total_seconds: i64,
        weekly_seconds: i64,
        monthly_seconds: i64,
        session_count: usize,
        longest_session_seconds: i64,
        last_played: Option<String>,
    }

    let mut game_metrics: HashMap<String, TempMetrics> = HashMap::new();

    let mut global_total_seconds: i64 = 0;
    let mut global_weekly_seconds: i64 = 0;
    let mut global_monthly_seconds: i64 = 0;

    let mut sorted_sessions = all_sessions.clone();
    sorted_sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    let mut global_weekly_sessions_count: usize = 0;
    let mut global_monthly_sessions_count: usize = 0;

    for s in &all_sessions {
        let secs = s.duration_seconds.unwrap_or(0) as i64;
        if secs <= 0 {
            continue;
        }

        global_total_seconds += secs;

        let is_initial_imported_session = s.started_at == "STEAM_IMPORT";

        let date_to_parse = if s.started_at == "MANUAL_ADJUSTMENT" || s.started_at == "STEAM_IMPORT" {
            s.ended_at.as_deref().unwrap_or(&s.started_at)
        } else {
            &s.started_at
        };

        let parsed_start = DateTime::parse_from_rfc3339(date_to_parse)
            .map(|dt| dt.with_timezone(&Utc))
            .ok();

        let is_weekly = if is_initial_imported_session {
            false
        } else if let Some(dt) = parsed_start {
            dt >= week_ago
        } else {
            false
        };

        let is_monthly = if is_initial_imported_session {
            false
        } else if let Some(dt) = parsed_start {
            dt.year() == selected_year && dt.month() == selected_month
        } else {
            false
        };

        if is_weekly {
            global_weekly_seconds += secs;
            global_weekly_sessions_count += 1;
        }
        if is_monthly {
            global_monthly_seconds += secs;
            global_monthly_sessions_count += 1;
        }

        let real_game_id = if let Some(g) = id_to_game.get(&s.game_id) {
            g.id.clone()
        } else {
            s.game_id.clone()
        };

        let entry = game_metrics.entry(real_game_id).or_insert(TempMetrics {
            total_seconds: 0,
            weekly_seconds: 0,
            monthly_seconds: 0,
            session_count: 0,
            longest_session_seconds: 0,
            last_played: None,
        });

        entry.total_seconds += secs;
        if is_weekly {
            entry.weekly_seconds += secs;
        }
        if is_monthly {
            entry.monthly_seconds += secs;
        }
        entry.session_count += 1;
        if secs > entry.longest_session_seconds {
            entry.longest_session_seconds = secs;
        }

        let end_time = s.ended_at.as_ref().unwrap_or(&s.started_at);
        if entry.last_played.is_none() || entry.last_played.as_ref().unwrap() < end_time {
            entry.last_played = Some(end_time.clone());
        }
    }

    let mut game_stats: Vec<crate::commands::playtime_commands::GameStatsDetail> = Vec::new();
    let mut played_games_count = 0;
    let mut weekly_played_games_count = 0;
    let mut monthly_played_games_count = 0;

    for g in &all_games {
        let metrics = game_metrics.get(&g.id);
        let total_seconds = metrics.map(|m| m.total_seconds).unwrap_or(0);
        let weekly_seconds = metrics.map(|m| m.weekly_seconds).unwrap_or(0);
        let monthly_seconds = metrics.map(|m| m.monthly_seconds).unwrap_or(0);

        if total_seconds > 0 {
            played_games_count += 1;
        }
        if weekly_seconds > 0 {
            weekly_played_games_count += 1;
        }
        if monthly_seconds > 0 {
            monthly_played_games_count += 1;
        }

        let session_count = metrics.map(|m| m.session_count).unwrap_or(0);
        let longest_session_seconds = metrics.map(|m| m.longest_session_seconds).unwrap_or(0);
        let avg_session_seconds = if session_count > 0 { total_seconds / session_count as i64 } else { 0 };

        let cover_url = cover_map.get(&g.id).cloned().or_else(|| {
            g.steam_app_id.as_ref().map(|appid| {
                format!("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900.jpg", appid)
            })
        });

        let background_url = bg_map.get(&g.id).cloned().or_else(|| {
            g.steam_app_id.as_ref().map(|appid| {
                format!("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg", appid)
            })
        });

        game_stats.push(crate::commands::playtime_commands::GameStatsDetail {
            game_id: g.id.clone(),
            name: g.name.clone(),
            cover_url,
            background_url,
            total_seconds,
            total_formatted: format_playtime(total_seconds),
            weekly_seconds,
            weekly_formatted: format_playtime(weekly_seconds),
            monthly_seconds,
            monthly_formatted: format_playtime(monthly_seconds),
            session_count,
            avg_session_seconds,
            avg_session_formatted: format_playtime(avg_session_seconds),
            longest_session_seconds,
            longest_session_formatted: format_playtime(longest_session_seconds),
            last_played: metrics.and_then(|m| m.last_played.clone()).or_else(|| g.last_played.clone()),
        });
    }

    game_stats.sort_by(|a, b| b.total_seconds.cmp(&a.total_seconds));

    let mut recent_sessions: Vec<crate::commands::playtime_commands::PlaySessionDetail> = Vec::new();
    for s in sorted_sessions.iter().take(20) {
        let secs = s.duration_seconds.unwrap_or(0) as i64;
        let (game_name, cover_url) = if let Some(g) = id_to_game.get(&s.game_id) {
            let cov = cover_map.get(&g.id).cloned().or_else(|| {
                g.steam_app_id.as_ref().map(|appid| {
                    format!("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900.jpg", appid)
                })
            });
            (g.name.clone(), cov)
        } else {
            (s.game_id.clone(), None)
        };

        recent_sessions.push(crate::commands::playtime_commands::PlaySessionDetail {
            id: s.id,
            game_id: s.game_id.clone(),
            game_name,
            cover_url,
            started_at: s.started_at.clone(),
            ended_at: s.ended_at.clone(),
            duration_seconds: secs,
            formatted_duration: format_playtime(secs),
        });
    }

    let total_sess_count = all_sessions.iter().filter(|s| s.duration_seconds.unwrap_or(0) > 0).count();

    Ok(crate::commands::playtime_commands::DashboardStats {
        total_playtime_seconds: global_total_seconds,
        total_formatted: format_playtime(global_total_seconds),
        weekly_playtime_seconds: global_weekly_seconds,
        weekly_formatted: format_playtime(global_weekly_seconds),
        monthly_playtime_seconds: global_monthly_seconds,
        monthly_formatted: format_playtime(global_monthly_seconds),
        selected_year,
        selected_month,
        selected_month_label,
        available_months,
        total_sessions_count: total_sess_count,
        weekly_sessions_count: global_weekly_sessions_count,
        monthly_sessions_count: global_monthly_sessions_count,
        played_games_count,
        weekly_played_games_count,
        monthly_played_games_count,
        total_library_count: all_games.len(),
        game_stats,
        recent_sessions,
    })
}

