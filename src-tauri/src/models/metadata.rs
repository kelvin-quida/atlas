use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "metadata")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub game_id: String,
    pub description: Option<String>,
    pub genres: Option<String>,      // JSON array string
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub rating: Option<f64>,
    pub hltb_main: Option<i32>,      // minutes
    pub igdb_url: Option<String>,
    pub fetched_at: String,
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
