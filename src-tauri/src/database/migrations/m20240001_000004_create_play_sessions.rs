use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20240001_000004_create_play_sessions"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(PlaySessions::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(PlaySessions::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(PlaySessions::GameId).text().not_null())
                    .col(ColumnDef::new(PlaySessions::StartedAt).text().not_null())
                    .col(ColumnDef::new(PlaySessions::EndedAt).text().null())
                    .col(ColumnDef::new(PlaySessions::DurationSeconds).integer().null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(PlaySessions::Table, PlaySessions::GameId)
                            .to(Games::Table, Games::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .table(PlaySessions::Table)
                    .name("idx_play_sessions_game_id")
                    .col(PlaySessions::GameId)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(PlaySessions::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum PlaySessions {
    Table,
    Id,
    GameId,
    StartedAt,
    EndedAt,
    DurationSeconds,
}

#[derive(Iden)]
enum Games {
    Table,
    Id,
}
