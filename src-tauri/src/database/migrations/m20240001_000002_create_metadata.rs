use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20240001_000002_create_metadata"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Metadata::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Metadata::GameId).text().not_null().primary_key())
                    .col(ColumnDef::new(Metadata::Description).text().null())
                    .col(ColumnDef::new(Metadata::Genres).text().null())       // JSON array
                    .col(ColumnDef::new(Metadata::Developer).text().null())
                    .col(ColumnDef::new(Metadata::Publisher).text().null())
                    .col(ColumnDef::new(Metadata::ReleaseDate).text().null())
                    .col(ColumnDef::new(Metadata::Rating).double().null())
                    .col(ColumnDef::new(Metadata::HltbMain).integer().null())  // minutes
                    .col(ColumnDef::new(Metadata::IgdbUrl).text().null())
                    .col(ColumnDef::new(Metadata::FetchedAt).text().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Metadata::Table, Metadata::GameId)
                            .to(Games::Table, Games::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Metadata::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum Metadata {
    Table,
    GameId,
    Description,
    Genres,
    Developer,
    Publisher,
    ReleaseDate,
    Rating,
    HltbMain,
    IgdbUrl,
    FetchedAt,
}

#[derive(Iden)]
enum Games {
    Table,
    Id,
}
