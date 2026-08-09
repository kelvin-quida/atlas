use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20240001_000006_create_game_media"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(GameMedia::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(GameMedia::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(GameMedia::GameId).text().not_null())
                    .col(ColumnDef::new(GameMedia::MediaType).text().not_null())
                    .col(ColumnDef::new(GameMedia::Url).text().not_null())
                    .col(ColumnDef::new(GameMedia::ThumbnailUrl).text().null())
                    .col(ColumnDef::new(GameMedia::Width).integer().null())
                    .col(ColumnDef::new(GameMedia::Height).integer().null())
                    .col(ColumnDef::new(GameMedia::Duration).integer().null())
                    .col(ColumnDef::new(GameMedia::SortOrder).integer().not_null())
                    .col(ColumnDef::new(GameMedia::Source).text().null())
                    .col(ColumnDef::new(GameMedia::CreatedAt).text().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(GameMedia::Table, GameMedia::GameId)
                            .to(Games::Table, Games::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(GameMedia::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum GameMedia {
    Table,
    Id,
    GameId,
    #[iden = "type"]
    MediaType,
    Url,
    #[iden = "thumbnail_url"]
    ThumbnailUrl,
    Width,
    Height,
    Duration,
    #[iden = "sort_order"]
    SortOrder,
    Source,
    #[iden = "created_at"]
    CreatedAt,
}

#[derive(Iden)]
enum Games {
    Table,
    Id,
}
