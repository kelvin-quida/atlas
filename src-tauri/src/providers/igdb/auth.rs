use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const CLIENT_ID: &str = "tdcgkpt4ojpb1bdvmgxo0gufofipj3";
const CLIENT_SECRET: &str = "yn53jn1amldun5lfeagwjrvmvlp3br";
const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";

#[derive(Debug)]
pub struct TwitchToken {
    pub access_token: String,
    pub expires_at: Instant,
}

/// In-memory Twitch OAuth token cache.
///
/// Wraps a `Mutex<Option<TwitchToken>>` and handles auto-renewal
/// when the current token is about to expire (60-second buffer).
pub struct TwitchAuth {
    token: Mutex<Option<TwitchToken>>,
}

impl TwitchAuth {
    pub fn new() -> Self {
        Self {
            token: Mutex::new(None),
        }
    }

    /// Returns a valid Bearer token, refreshing from Twitch if necessary.
    pub async fn get_token(&self) -> Result<String, String> {
        let mut guard = self.token.lock().await;

        // Return cached token if still valid (with 60s buffer)
        if let Some(ref t) = *guard {
            if Instant::now() < t.expires_at {
                return Ok(t.access_token.clone());
            }
        }

        // Fetch a new token from the Twitch OAuth endpoint
        let client = reqwest::Client::new();
        let response = client
            .post(TOKEN_URL)
            .query(&[
                ("client_id", CLIENT_ID),
                ("client_secret", CLIENT_SECRET),
                ("grant_type", "client_credentials"),
            ])
            .send()
            .await
            .map_err(|e| format!("Twitch auth request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Twitch auth returned HTTP {}",
                response.status()
            ));
        }

        #[derive(serde::Deserialize)]
        struct TokenResponse {
            access_token: String,
            expires_in: u64,
        }

        let body: TokenResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Twitch token response: {}", e))?;

        let access_token = body.access_token.clone();
        let expires_at =
            Instant::now() + Duration::from_secs(body.expires_in.saturating_sub(60));

        *guard = Some(TwitchToken {
            access_token: body.access_token,
            expires_at,
        });

        Ok(access_token)
    }
}

impl Default for TwitchAuth {
    fn default() -> Self {
        Self::new()
    }
}
