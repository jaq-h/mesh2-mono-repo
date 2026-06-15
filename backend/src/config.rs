use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct Config {
    // Spotify OAuth
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,

    // Database
    pub database_url: String,

    // JWT (Mesh session tokens)
    pub jwt_secret: String,

    // Server
    pub host: String,
    pub port: u16,

    // Frontend
    pub frontend_url: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Config {
            // Spotify OAuth
            client_id: std::env::var("CLIENT_ID").context("CLIENT_ID must be set")?,
            client_secret: std::env::var("CLIENT_SECRET").context("CLIENT_SECRET must be set")?,
            redirect_uri: std::env::var("REDIRECT_URI").context("REDIRECT_URI must be set")?,

            // Database
            database_url: std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?,

            // JWT (Mesh session tokens) — required, no insecure default.
            // Algorithm is fixed to HS256 in `auth.rs` (not configurable) to
            // avoid algorithm-confusion attacks.
            jwt_secret: std::env::var("JWT_SECRET").context("JWT_SECRET must be set")?,

            // Server
            host: std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .context("PORT must be a valid number")?,

            // Frontend
            frontend_url: std::env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
        })
    }

    /// Returns the Spotify token URL
    pub fn spotify_token_url(&self) -> &str {
        "https://accounts.spotify.com/api/token"
    }

    /// Returns the Spotify API base URL
    pub fn spotify_api_url(&self) -> &str {
        "https://api.spotify.com/v1"
    }

    /// Returns the required Spotify scopes
    pub fn spotify_scopes(&self) -> &str {
        "streaming user-modify-playback-state user-read-playback-state user-read-private user-read-playback-position user-top-read user-library-read user-read-currently-playing user-read-recently-played playlist-read-collaborative playlist-read-private user-follow-read"
    }
}
