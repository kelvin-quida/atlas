use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20240001_000003_create_image_assets"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ImageAssets::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ImageAssets::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(ImageAssets::GameId).text().not_null())
                    .col(ColumnDef::new(ImageAssets::AssetType).text().not_null())
                    // Relative path from app_data_dir, e.g. "assets/covers/abc.jpg"
                    .col(ColumnDef::new(ImageAssets::FilePath).text().not_null())
                    .col(ColumnDef::new(ImageAssets::SourceUrl).text().null())
                    .col(ColumnDef::new(ImageAssets::DownloadedAt).text().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(ImageAssets::Table, ImageAssets::GameId)
                            .to(Games::Table, Games::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ImageAssets::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum ImageAssets {
    Table,
    Id,
    GameId,
    AssetType,
    FilePath,
    SourceUrl,
    DownloadedAt,
}

#[derive(Iden)]
enum Games {
    Table,
    Id,
}
