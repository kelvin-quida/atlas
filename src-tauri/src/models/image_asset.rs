use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "image_assets")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub game_id: String,
    pub asset_type: String,  // "cover", "background", "logo", "icon"
    pub file_path: String,   // relative to app_data_dir
    pub source_url: Option<String>,
    pub downloaded_at: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::game::Entity",
        from = "Column::GameId",
        to = "super::game::Column::Id",
        on_delete = "Cascade"
    )]
    Game,
}

impl Related<super::game::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Game.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
