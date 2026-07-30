use sea_orm_migration::prelude::*;

mod m20240001_000001_create_games;
mod m20240001_000002_create_metadata;
mod m20240001_000003_create_image_assets;
mod m20240001_000004_create_play_sessions;
mod m20240001_000005_create_settings;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20240001_000001_create_games::Migration),
            Box::new(m20240001_000002_create_metadata::Migration),
            Box::new(m20240001_000003_create_image_assets::Migration),
            Box::new(m20240001_000004_create_play_sessions::Migration),
            Box::new(m20240001_000005_create_settings::Migration),
        ]
    }
}
