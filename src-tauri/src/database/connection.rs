use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr, ConnectionTrait, Statement};
use std::path::Path;

/// Opens (or creates) the SQLite database at the given path and returns a connection pool.
pub async fn setup_database(db_path: &Path) -> Result<DatabaseConnection, DbErr> {
    // Ensure the parent directory exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| DbErr::Custom(format!("Failed to create db directory: {}", e)))?;
    }

    let db_url = format!(
        "sqlite://{}?mode=rwc",
        db_path.to_string_lossy().replace('\\', "/")
    );

    let mut opt = ConnectOptions::new(db_url);
    // Limit to 1 connection for SQLite to prevent write locks during concurrent operations,
    // and set timeouts for query acquisition.
    opt.max_connections(1)
        .connect_timeout(std::time::Duration::from_secs(5))
        .acquire_timeout(std::time::Duration::from_secs(5));

    let db = Database::connect(opt).await?;

    // Enable Write-Ahead Logging (WAL) and Busy Timeout to completely prevent "database is locked" errors
    let backend = db.get_database_backend();
    let _ = db.execute(Statement::from_string(backend, "PRAGMA journal_mode=WAL;")).await;
    let _ = db.execute(Statement::from_string(backend, "PRAGMA busy_timeout=5000;")).await;

    Ok(db)
}
