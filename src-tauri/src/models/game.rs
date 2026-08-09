use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// SeaORM Entity for the `games` table.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "games")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,            // UUID v4
    pub name: String,
    pub platform: String,      // "manual", "steam"
    pub source: String,        // "manual", "steam_scan"
    pub exe_path: Option<String>,
    pub install_dir: Option<String>,
    pub steam_app_id: Option<String>,
    pub igdb_id: Option<i32>,
    pub added_at: String,      // ISO 8601
    pub last_played: Option<String>,
    pub sort_name: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_one = "super::metadata::Entity")]
    Metadata,
    #[sea_orm(has_many = "super::image_asset::Entity")]
    ImageAssets,
    #[sea_orm(has_many = "super::play_session::Entity")]
    PlaySessions,
}

impl Related<super::metadata::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Metadata.def()
    }
}

impl Related<super::image_asset::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ImageAssets.def()
    }
}

impl Related<super::play_session::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::PlaySessions.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

/// DTO returned to the frontend (serialized as JSON via Tauri command).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameDto {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub exe_path: Option<String>,
    pub install_dir: Option<String>,
    pub steam_app_id: Option<String>,
    pub igdb_id: Option<i32>,
    pub cover_url: Option<String>,   // resolved at query time from image_assets
    pub background_url: Option<String>, // resolved at query time from image_assets
    pub last_played: Option<String>,
    pub added_at: String,
    pub is_installed: bool,
}
