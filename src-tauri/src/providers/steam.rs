use serde::Deserialize;
use std::collections::HashMap;

use crate::providers::traits::{GameMetadata, MetadataProvider};
use crate::services::steam_service::search_steam_appid_by_name;

/// Steam Store API AppDetails JSON Response Types
#[derive(Deserialize, Debug)]
struct SteamAppDetailsResponse {
    success: bool,
    data: Option<SteamAppDetailsData>,
}

#[derive(Deserialize, Debug)]
struct SteamAppDetailsData {
    name: Option<String>,
    short_description: Option<String>,
    detailed_description: Option<String>,
    header_image: Option<String>,
    background: Option<String>,
    developers: Option<Vec<String>>,
    publishers: Option<Vec<String>>,
    release_date: Option<SteamReleaseDate>,
    genres: Option<Vec<SteamGenre>>,
    metacritic: Option<SteamMetacritic>,
}

#[derive(Deserialize, Debug)]
struct SteamReleaseDate {
    coming_soon: Option<bool>,
    date: Option<String>,
}

#[derive(Deserialize, Debug)]
struct SteamGenre {
    #[allow(dead_code)]
    id: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize, Debug)]
struct SteamMetacritic {
    score: Option<f64>,
    #[allow(dead_code)]
    url: Option<String>,
}

#[derive(Deserialize, Debug)]
struct SteamAppReviewsResponse {
    success: i32,
    query_summary: Option<SteamQuerySummary>,
}

#[derive(Deserialize, Debug)]
struct SteamQuerySummary {
    review_score_desc: Option<String>,
    total_positive: Option<u64>,
    total_reviews: Option<u64>,
}

/// Metadata provider for Steam Store API.
pub struct SteamMetadataProvider;

impl SteamMetadataProvider {
    pub fn new() -> Self {
        Self
    }

    /// Fetch metadata directly using a known Steam AppID.
    pub async fn fetch_by_appid(&self, appid: &str) -> Result<Option<GameMetadata>, String> {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let url = format!(
            "https://store.steampowered.com/api/appdetails?appids={}&l=portuguese",
            appid
        );

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Steam appdetails request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Steam Store API returned HTTP {}", response.status()));
        }

        let map: HashMap<String, SteamAppDetailsResponse> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Steam appdetails JSON: {}", e))?;

        let res = match map.get(appid) {
            Some(r) if r.success => r,
            _ => return Ok(None),
        };

        let data = match res.data {
            Some(ref d) => d,
            None => return Ok(None),
        };

        // Fetch User Review Summary (e.g. "Muito positivas", "Extremamente positivas", "Neutras")
        let reviews_url = format!(
            "https://store.steampowered.com/appreviews/{}?json=1&language=all&l=portuguese",
            appid
        );

        let review_summary = if let Ok(res) = client.get(&reviews_url).send().await {
            if let Ok(rev_data) = res.json::<SteamAppReviewsResponse>().await {
                if rev_data.success == 1 {
                    if let Some(qs) = rev_data.query_summary {
                        if let Some(ref desc) = qs.review_score_desc {
                            if let (Some(pos), Some(total)) = (qs.total_positive, qs.total_reviews) {
                                if total > 0 {
                                    let pct = (pos * 100) / total;
                                    Some(format!("{} ({}%)", desc, pct))
                                } else {
                                    Some(desc.clone())
                                }
                            } else {
                                Some(desc.clone())
                            }
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        // Developer & Publisher
        let developer = data
            .developers
            .as_ref()
            .and_then(|devs| devs.first().cloned())
            .or_else(|| data.developers.as_ref().map(|devs| devs.join(", ")));

        let publisher = data
            .publishers
            .as_ref()
            .and_then(|pubs| pubs.first().cloned())
            .or_else(|| data.publishers.as_ref().map(|pubs| pubs.join(", ")));

        // Genres (Official store genres + popular community user tags)
        let mut genres: Vec<String> = data
            .genres
            .as_ref()
            .map(|list| {
                list.iter()
                    .filter_map(|g| g.description.clone())
                    .collect()
            })
            .unwrap_or_default();

        // Fetch popular user-defined tags directly from Steam store page HTML
        let store_url = format!("https://store.steampowered.com/app/{}/?l=portuguese", appid);
        if let Ok(res) = client
            .get(&store_url)
            .header("Cookie", "birthtime=0; mature_content=1")
            .send()
            .await
        {
            if let Ok(html) = res.text().await {
                let needle = "class=\"app_tag\"";
                for chunk in html.split(needle).skip(1) {
                    if let Some(gt_pos) = chunk.find('>') {
                        if let Some(close_pos) = chunk[gt_pos..].find("</a>") {
                            let tag_raw = &chunk[gt_pos + 1..gt_pos + close_pos];
                            let tag = tag_raw
                                .replace("&amp;", "&")
                                .replace("&#39;", "'")
                                .replace("&quot;", "\"")
                                .replace('\r', "")
                                .replace('\n', "")
                                .replace('\t', "")
                                .trim()
                                .to_string();
                            if !tag.is_empty()
                                && tag != "+"
                                && !genres.iter().any(|g| g.eq_ignore_ascii_case(&tag))
                            {
                                genres.push(tag);
                            }
                        }
                    }
                }
            }
        }

        // Release Date
        let release_date = data.release_date.as_ref().and_then(|rd| {
            if rd.coming_soon.unwrap_or(false) {
                Some("Em breve".to_string())
            } else {
                rd.date.clone()
            }
        });

        // Description (clean HTML tags if needed or use short_description)
        let description = data
            .short_description
            .clone()
            .or_else(|| data.detailed_description.clone());

        // Metacritic Rating
        let rating = data.metacritic.as_ref().and_then(|m| m.score);

        // High quality cover & hero background
        let cover_url = data.header_image.clone().or_else(|| {
            Some(format!(
                "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900_2x.jpg",
                appid
            ))
        });

        let background_url = data.background.clone().or_else(|| {
            Some(format!(
                "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
                appid
            ))
        });

        Ok(Some(GameMetadata {
            title: data.name.clone(),
            description,
            genres,
            developer,
            publisher,
            release_date,
            rating,
            review_summary,
            cover_url,
            background_url,
            igdb_id: None,
            igdb_url: None,
        }))
    }
}

impl Default for SteamMetadataProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl MetadataProvider for SteamMetadataProvider {
    fn name(&self) -> &'static str {
        "Steam"
    }

    async fn fetch_metadata(&self, game_name: &str) -> Result<Option<GameMetadata>, String> {
        let trimmed = game_name.trim();

        // If game_name is numeric, treat as AppID directly
        if !trimmed.is_empty() && trimmed.chars().all(|c| c.is_ascii_digit()) {
            return self.fetch_by_appid(trimmed).await;
        }

        // Search Steam Store for matching AppID
        if let Some(appid) = search_steam_appid_by_name(game_name).await {
            self.fetch_by_appid(&appid.to_string()).await
        } else {
            Ok(None)
        }
    }
}
