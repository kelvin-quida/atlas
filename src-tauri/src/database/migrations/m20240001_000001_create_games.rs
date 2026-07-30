use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20240001_000001_create_games"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Games::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Games::Id).text().not_null().primary_key())
                    .col(ColumnDef::new(Games::Name).text().not_null())
                    .col(ColumnDef::new(Games::Platform).text().not_null())
                    .col(ColumnDef::new(Games::Source).text().not_null())
                    .col(ColumnDef::new(Games::ExePath).text().null())
                    .col(ColumnDef::new(Games::InstallDir).text().null())
                    .col(ColumnDef::new(Games::SteamAppId).text().null())
                    .col(ColumnDef::new(Games::IgdbId).integer().null())
                    .col(ColumnDef::new(Games::AddedAt).text().not_null())
                    .col(ColumnDef::new(Games::LastPlayed).text().null())
                    .col(ColumnDef::new(Games::SortName).text().null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .table(Games::Table)
                    .name("idx_games_sort_name")
                    .col(Games::SortName)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .table(Games::Table)
                    .name("idx_games_platform")
                    .col(Games::Platform)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .table(Games::Table)
                    .name("idx_games_last_played")
                    .col(Games::LastPlayed)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .table(Games::Table)
                    .name("idx_games_igdb_id")
                    .col(Games::IgdbId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .table(Games::Table)
                    .name("idx_games_steam_app_id")
                    .col(Games::SteamAppId)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Games::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum Games {
    Table,
    Id,
    Name,
    Platform,
    Source,
    ExePath,
    InstallDir,
    SteamAppId,
    IgdbId,
    AddedAt,
    LastPlayed,
    SortName,
}
