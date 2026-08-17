use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20240001_000007_add_review_summary"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Metadata::Table)
                    .add_column(ColumnDef::new(Metadata::ReviewSummary).text().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Metadata::Table)
                    .drop_column(Metadata::ReviewSummary)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum Metadata {
    Table,
    #[iden = "review_summary"]
    ReviewSummary,
}
