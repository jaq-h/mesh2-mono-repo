//! Spotify API types for the desktop app
//! These types match the Spotify Web API responses

use serde::{Deserialize, Serialize};

// =============================================================================
// Settings Types
// =============================================================================

/// Data source for now playing information
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum NowPlayingSource {
    /// Use only the Spotify Web API (default)
    #[default]
    ApiOnly,
    /// Use only OS-level now playing data (no API polling)
    OsOnly,
    /// Use OS data primarily, fall back to API, verify same user
    Hybrid,
}

/// Polling interval presets
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PollingInterval {
    /// Disabled - no automatic polling
    Disabled,
    /// Low frequency - every 15 seconds
    Low,
    /// Medium frequency - every 10 seconds
    Medium,
    /// High frequency - every 5 seconds (default)
    High,
    /// Custom interval in milliseconds
    Custom(u64),
}

impl Default for PollingInterval {
    fn default() -> Self {
        PollingInterval::High
    }
}

impl PollingInterval {
    /// Get the interval in milliseconds, or None if disabled
    pub fn as_millis(&self) -> Option<u64> {
        match self {
            PollingInterval::Disabled => None,
            PollingInterval::Low => Some(15_000),
            PollingInterval::Medium => Some(10_000),
            PollingInterval::High => Some(5_000),
            PollingInterval::Custom(ms) => Some(*ms),
        }
    }
}

/// Application settings for the desktop app
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// Source for now playing information
    #[serde(default)]
    pub now_playing_source: NowPlayingSource,

    /// Polling interval for API requests
    #[serde(default)]
    pub polling_interval: PollingInterval,

    /// Whether to verify OS now playing matches the authenticated Spotify user
    #[serde(default = "default_verify_user")]
    pub verify_same_user: bool,

    /// The Spotify user ID to match against OS now playing (auto-detected)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_user_id: Option<String>,
}

fn default_verify_user() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            now_playing_source: NowPlayingSource::default(),
            polling_interval: PollingInterval::default(),
            verify_same_user: true,
            spotify_user_id: None,
        }
    }
}

/// Hybrid now playing state - combines API and OS data
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HybridNowPlaying {
    /// The primary now playing data to display
    #[serde(flatten)]
    pub display_data: OsNowPlaying,

    /// The source of the display data
    pub source: NowPlayingDataSource,

    /// Whether the OS data matches the authenticated user
    pub os_matches_user: bool,

    /// Last API update timestamp
    pub api_last_updated: Option<i64>,

    /// Last OS update timestamp
    pub os_last_updated: Option<i64>,
}

/// Source of the currently displayed now playing data
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum NowPlayingDataSource {
    #[default]
    None,
    Api,
    Os,
}

// =============================================================================
// Authentication Types
// =============================================================================

/// OAuth token response from Spotify
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub scope: Option<String>,
    pub expires_in: i64,
    pub refresh_token: Option<String>,
}

/// Stored authentication state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub user: Option<SpotifyUser>,
}

impl AuthState {
    pub fn is_expired(&self) -> bool {
        chrono::Utc::now() >= self.expires_at - chrono::Duration::minutes(5)
    }
}

/// PKCE parameters for OAuth flow
#[derive(Debug, Clone)]
pub struct PkceParams {
    pub code_verifier: String,
    pub code_challenge: String,
    pub state: String,
}

// =============================================================================
// User Types
// =============================================================================

/// Spotify user profile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyUser {
    pub id: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub images: Option<Vec<SpotifyImage>>,
    pub external_urls: ExternalUrls,
    pub uri: Option<String>,
    pub href: Option<String>,
    pub country: Option<String>,
    pub product: Option<String>,
}

/// Authenticated user response (includes tokens)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticatedUser {
    pub id: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    #[serde(default)]
    pub images: Vec<SpotifyImage>,
    pub external_urls: ExternalUrls,
    #[serde(default)]
    pub uri: String,
    #[serde(default)]
    pub href: String,
    pub country: Option<String>,
    pub product: Option<String>,
    pub access_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_expires_at: Option<String>,
}

impl AuthenticatedUser {
    pub fn from_user_and_tokens(user: SpotifyUser, tokens: &TokenResponse) -> Self {
        let expires_at = chrono::Utc::now() + chrono::Duration::seconds(tokens.expires_in);

        Self {
            id: user.id,
            display_name: user.display_name,
            email: user.email,
            images: user.images.unwrap_or_default(),
            external_urls: user.external_urls,
            uri: user.uri.unwrap_or_default(),
            href: user.href.unwrap_or_default(),
            country: user.country,
            product: user.product,
            access_token: tokens.access_token.clone(),
            refresh_token: tokens.refresh_token.clone(),
            token_expires_at: Some(expires_at.to_rfc3339()),
        }
    }
}

// =============================================================================
// Image Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyImage {
    pub url: String,
    pub height: Option<i32>,
    pub width: Option<i32>,
}

// =============================================================================
// External URLs
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExternalUrls {
    pub spotify: String,
}

// =============================================================================
// Artist Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyArtist {
    pub id: String,
    pub name: String,
    pub uri: String,
    pub href: String,
    pub external_urls: ExternalUrls,
}

// =============================================================================
// Album Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyAlbum {
    pub id: String,
    pub name: String,
    pub uri: String,
    pub href: String,
    pub images: Vec<SpotifyImage>,
    pub release_date: Option<String>,
    pub artists: Vec<SpotifyArtist>,
    pub external_urls: ExternalUrls,
}

// =============================================================================
// Track Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyTrack {
    pub id: String,
    pub name: String,
    pub uri: String,
    pub href: String,
    pub duration_ms: i64,
    pub artists: Vec<SpotifyArtist>,
    pub album: SpotifyAlbum,
    pub external_urls: ExternalUrls,
}

// =============================================================================
// Episode Types (for podcasts)
// =============================================================================

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyEpisode {
    pub id: String,
    pub name: String,
    pub uri: String,
    pub href: String,
    pub duration_ms: i64,
    pub images: Vec<SpotifyImage>,
    pub show: Option<SpotifyShow>,
    pub external_urls: ExternalUrls,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyShow {
    pub id: String,
    pub name: String,
    pub uri: String,
    pub href: String,
    pub images: Vec<SpotifyImage>,
    pub external_urls: ExternalUrls,
}

// =============================================================================
// Playback Item (can be track or episode)
// =============================================================================

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PlaybackItem {
    Track(SpotifyTrack),
    Episode(SpotifyEpisode),
}

#[allow(dead_code)]
impl PlaybackItem {
    pub fn id(&self) -> &str {
        match self {
            PlaybackItem::Track(t) => &t.id,
            PlaybackItem::Episode(e) => &e.id,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            PlaybackItem::Track(t) => &t.name,
            PlaybackItem::Episode(e) => &e.name,
        }
    }

    pub fn duration_ms(&self) -> i64 {
        match self {
            PlaybackItem::Track(t) => t.duration_ms,
            PlaybackItem::Episode(e) => e.duration_ms,
        }
    }

    pub fn uri(&self) -> &str {
        match self {
            PlaybackItem::Track(t) => &t.uri,
            PlaybackItem::Episode(e) => &e.uri,
        }
    }
}

// =============================================================================
// Device Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyDevice {
    pub id: Option<String>,
    pub is_active: bool,
    pub is_private_session: bool,
    pub is_restricted: bool,
    pub name: String,
    #[serde(rename = "type")]
    pub device_type: String,
    pub volume_percent: Option<i32>,
    pub supports_volume: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicesResponse {
    pub devices: Vec<SpotifyDevice>,
}

// =============================================================================
// Playback Context
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackContext {
    #[serde(rename = "type")]
    pub context_type: String,
    pub href: String,
    pub uri: String,
    pub external_urls: ExternalUrls,
}

// =============================================================================
// Playback Actions
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlaybackActions {
    #[serde(default)]
    pub disallows: PlaybackDisallows,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlaybackDisallows {
    #[serde(default)]
    pub pausing: bool,
    #[serde(default)]
    pub resuming: bool,
    #[serde(default)]
    pub seeking: bool,
    #[serde(default)]
    pub skipping_prev: bool,
    #[serde(default)]
    pub skipping_next: bool,
    #[serde(default)]
    pub toggling_shuffle: bool,
    #[serde(default)]
    pub toggling_repeat_context: bool,
    #[serde(default)]
    pub toggling_repeat_track: bool,
}

// =============================================================================
// Repeat Mode
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RepeatMode {
    Off,
    Context,
    Track,
}

impl Default for RepeatMode {
    fn default() -> Self {
        RepeatMode::Off
    }
}

impl std::fmt::Display for RepeatMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RepeatMode::Off => write!(f, "off"),
            RepeatMode::Context => write!(f, "context"),
            RepeatMode::Track => write!(f, "track"),
        }
    }
}

// =============================================================================
// Playback State
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackState {
    pub device: Option<SpotifyDevice>,
    pub repeat_state: RepeatMode,
    pub shuffle_state: bool,
    pub context: Option<PlaybackContext>,
    pub timestamp: i64,
    pub progress_ms: Option<i64>,
    pub is_playing: bool,
    pub item: Option<SpotifyTrack>,
    pub currently_playing_type: String,
    #[serde(default)]
    pub actions: PlaybackActions,
}

// =============================================================================
// Currently Playing
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentlyPlaying {
    pub is_playing: bool,
    pub progress_ms: Option<i64>,
    pub item: Option<SpotifyTrack>,
    pub currently_playing_type: String,
}

// =============================================================================
// Play Request Options
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlayOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uris: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<PlayOffset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PlayOffset {
    Position { position: i32 },
    Uri { uri: String },
}

// =============================================================================
// OS-Level Now Playing Info
// =============================================================================

/// Unified now playing info that can come from OS-level APIs
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OsNowPlaying {
    /// Track/episode title
    pub title: Option<String>,
    /// Artist name(s)
    pub artist: Option<String>,
    /// Album name
    pub album: Option<String>,
    /// Album artwork URL or data
    pub artwork_url: Option<String>,
    /// Duration in milliseconds
    pub duration_ms: Option<i64>,
    /// Current position in milliseconds
    pub position_ms: Option<i64>,
    /// Whether playback is active
    pub is_playing: bool,
    /// The app that's playing (e.g., "Spotify")
    pub app_name: Option<String>,
    /// Bundle identifier on macOS
    pub app_bundle_id: Option<String>,
    /// Spotify track URI if available (for matching)
    pub spotify_uri: Option<String>,
}

#[allow(dead_code)]
impl OsNowPlaying {
    /// Check if this appears to be from Spotify
    pub fn is_spotify(&self) -> bool {
        self.app_name.as_deref() == Some("Spotify")
            || self.app_bundle_id.as_deref() == Some("com.spotify.client")
    }

    /// Check if this matches a given track name and artist
    pub fn matches_track(&self, title: &str, artist: &str) -> bool {
        let title_matches = self
            .title
            .as_deref()
            .map(|t| t.eq_ignore_ascii_case(title))
            .unwrap_or(false);
        let artist_matches = self
            .artist
            .as_deref()
            .map(|a| a.eq_ignore_ascii_case(artist) || a.contains(artist) || artist.contains(a))
            .unwrap_or(false);
        title_matches && artist_matches
    }
}

// =============================================================================
// Error Types
// =============================================================================

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyApiError {
    pub error: SpotifyErrorDetails,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyErrorDetails {
    pub status: i32,
    pub message: String,
}
