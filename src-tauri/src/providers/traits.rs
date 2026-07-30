use serde::{Deserialize, Serialize};

/// Unified game metadata returned from any provider (IGDB, Steam, HLTB, etc.)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub genres: Vec<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub rating: Option<f64>,
    pub cover_url: Option<String>,
    pub background_url: Option<String>,
    pub igdb_id: Option<i64>,
    pub igdb_url: Option<String>,
}

/// Any source capable of resolving game metadata by name.
///
/// Implementations: `IgdbProvider`, (future: `SteamProvider`, `HltbProvider`)
#[async_trait::async_trait]
pub trait MetadataProvider: Send + Sync {
    /// Human-readable name of the provider (e.g. "IGDB", "Steam")
    fn name(&self) -> &'static str;

    /// Fetch metadata for a game by its canonical title.
    /// Returns `None` if the game is not found.
    async fn fetch_metadata(
        &self,
        game_name: &str,
    ) -> Result<Option<GameMetadata>, String>;

    /// Fetch only the cover URL for a game by name.
    /// Default implementation calls `fetch_metadata` and extracts `cover_url`.
    async fn fetch_cover_url(&self, game_name: &str) -> Result<Option<String>, String> {
        let meta = self.fetch_metadata(game_name).await?;
        Ok(meta.and_then(|m| m.cover_url))
    }
}
