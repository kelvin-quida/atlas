use super::auth::TwitchAuth;
use crate::providers::traits::{GameMetadata, MetadataProvider};

const CLIENT_ID: &str = "tdcgkpt4ojpb1bdvmgxo0gufofipj3";
const IGDB_API_URL: &str = "https://api.igdb.com/v4/games";

/// Internal IGDB API response shapes
#[derive(serde::Deserialize, Debug)]
struct IgdbCover {
    url: Option<String>,
    _image_id: Option<String>,
}

#[derive(serde::Deserialize, Debug)]
struct IgdbGenre {
    name: String,
}

#[derive(serde::Deserialize, Debug)]
struct IgdbCompany {
    name: String,
}

#[derive(serde::Deserialize, Debug)]
struct IgdbInvolvedCompany {
    company: IgdbCompany,
    developer: Option<bool>,
    publisher: Option<bool>,
}

#[derive(serde::Deserialize, Debug)]
struct IgdbGame {
    id: Option<i64>,
    name: String,
    summary: Option<String>,
    rating: Option<f64>,
    first_release_date: Option<i64>, // Unix timestamp
    cover: Option<IgdbCover>,
    genres: Option<Vec<IgdbGenre>>,
    involved_companies: Option<Vec<IgdbInvolvedCompany>>,
    url: Option<String>,
}

/// IGDB metadata provider.
/// Uses Twitch OAuth (managed by `TwitchAuth`) for authentication.
pub struct IgdbProvider {
    auth: TwitchAuth,
}

impl IgdbProvider {
    pub fn new() -> Self {
        Self {
            auth: TwitchAuth::new(),
        }
    }

    /// Resolves a cover URL to the desired quality tier.
    /// IGDB returns protocol-relative `//images.igdb.com/...` URLs.
    pub fn resolve_cover_url(url: &str, quality: &str) -> String {
        let https = if url.starts_with("//") {
            format!("https:{}", url)
        } else {
            url.to_string()
        };
        // Replace any existing quality tier (e.g. t_thumb) with the requested one
        if https.contains("/t_") {
            let segments: Vec<&str> = https.rsplitn(2, '/').collect();
            let filename = segments[0];
            let base = segments[1];
            format!("{}/{}", base, filename.replacen(
                &filename.split('_').take(2).collect::<Vec<_>>().join("_"),
                &format!("{}_{}", "t", quality),
                1,
            ))
        } else {
            https.replace("t_thumb", &format!("t_{}", quality))
        }
    }
}

impl Default for IgdbProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl MetadataProvider for IgdbProvider {
    fn name(&self) -> &'static str {
        "IGDB"
    }

    async fn fetch_metadata(&self, game_name: &str) -> Result<Option<GameMetadata>, String> {
        let token = self.auth.get_token().await?;
        let client = reqwest::Client::new();

        // Escape double-quotes in the game name
        let escaped = game_name.replace('"', "\\\"");

        // Request rich fields in a single call
        let body = format!(
            r#"search "{}"; fields id, name, summary, rating, first_release_date, cover.url, cover.image_id, genres.name, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, url; limit 1;"#,
            escaped
        );

        let response = client
            .post(IGDB_API_URL)
            .header("Client-ID", CLIENT_ID)
            .header("Authorization", format!("Bearer {}", token))
            .body(body)
            .send()
            .await
            .map_err(|e| format!("IGDB request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("IGDB API returned HTTP {}", response.status()));
        }

        let games: Vec<IgdbGame> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse IGDB response: {}", e))?;

        let game = match games.into_iter().next() {
            Some(g) => g,
            None => return Ok(None),
        };

        // Resolve cover URL to high-quality 720p
        let cover_url = game.cover.as_ref().and_then(|c| c.url.as_ref()).map(|url| {
            let https = if url.starts_with("//") {
                format!("https:{}", url)
            } else {
                url.clone()
            };
            https.replace("t_thumb", "t_720p")
        });

        // Separate developer and publisher from involved_companies
        let (developer, publisher) = if let Some(companies) = &game.involved_companies {
            let dev = companies
                .iter()
                .find(|c| c.developer.unwrap_or(false))
                .map(|c| c.company.name.clone());
            let pub_ = companies
                .iter()
                .find(|c| c.publisher.unwrap_or(false))
                .map(|c| c.company.name.clone());
            (dev, pub_)
        } else {
            (None, None)
        };

        // Convert Unix timestamp to ISO 8601 date string
        let release_date = game.first_release_date.and_then(|ts| {
            chrono::DateTime::from_timestamp(ts, 0)
        }).map(|dt| {
            dt.format("%Y-%m-%d").to_string()
        });

        let genres = game
            .genres
            .unwrap_or_default()
            .into_iter()
            .map(|g| g.name)
            .collect();

        Ok(Some(GameMetadata {
            title: Some(game.name),
            description: game.summary,
            genres,
            developer,
            publisher,
            release_date,
            rating: game.rating,
            cover_url,
            background_url: None,
            igdb_id: game.id,
            igdb_url: game.url,
        }))
    }
}
