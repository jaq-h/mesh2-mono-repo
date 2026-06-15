//! Spotify API adapter for handling OAuth and API calls
//!
//! This module provides functionality for:
//! - OAuth token exchange (Authorization Code with PKCE flow)
//! - Token refresh
//! - Fetching user profile data
//! - Fetching currently playing track
//! - Remote control (play, pause, skip, seek, volume, etc.)
//! - Device management

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::error::{AppError, AppResult};

// ============================================================================
// Spotify API Response Types
// ============================================================================

/// Spotify OAuth token response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub scope: Option<String>,
    pub expires_in: i64,
    pub refresh_token: Option<String>,
}

/// Spotify user profile response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyUserProfile {
    pub id: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub images: Option<Vec<SpotifyImage>>,
    pub external_urls: SpotifyExternalUrls,
    pub uri: Option<String>,
    pub href: Option<String>,
    pub country: Option<String>,
    pub product: Option<String>,
}

/// Authenticated user response for frontend - combines user profile with tokens
/// This matches the frontend's AuthenticatedUser interface
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticatedUserResponse {
    pub id: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    #[serde(default)]
    pub images: Vec<SpotifyImage>,
    pub external_urls: SpotifyExternalUrls,
    pub uri: String,
    pub href: String,
    pub country: Option<String>,
    pub product: Option<String>,
    pub access_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_expires_at: Option<String>,
}

impl AuthenticatedUserResponse {
    /// Create from SpotifyUserProfile and token response
    pub fn from_profile_and_tokens(
        profile: SpotifyUserProfile,
        tokens: &SpotifyTokenResponse,
    ) -> Self {
        // Calculate token expiration time
        let expires_at = chrono::Utc::now() + chrono::Duration::seconds(tokens.expires_in);

        Self {
            id: profile.id,
            display_name: profile.display_name,
            email: profile.email,
            images: profile.images.unwrap_or_default(),
            external_urls: profile.external_urls,
            uri: profile.uri.unwrap_or_default(),
            href: profile.href.unwrap_or_default(),
            country: profile.country,
            product: profile.product,
            access_token: tokens.access_token.clone(),
            refresh_token: tokens.refresh_token.clone(),
            token_expires_at: Some(expires_at.to_rfc3339()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyImage {
    pub url: String,
    pub height: Option<i32>,
    pub width: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyExternalUrls {
    pub spotify: String,
}

/// Spotify currently playing response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyCurrentlyPlaying {
    pub is_playing: Option<bool>,
    pub progress_ms: Option<i64>,
    pub item: Option<SpotifyTrack>,
    pub currently_playing_type: Option<String>,
    pub context: Option<SpotifyContext>,
    pub timestamp: Option<i64>,
    pub device: Option<SpotifyDevice>,
    pub shuffle_state: Option<bool>,
    pub repeat_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyTrack {
    pub id: Option<String>,
    pub name: String,
    pub artists: Option<Vec<SpotifyArtist>>,
    pub album: Option<SpotifyAlbum>,
    pub duration_ms: Option<i64>,
    pub external_urls: Option<SpotifyExternalUrls>,
    pub uri: Option<String>,
    pub preview_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyArtist {
    pub id: Option<String>,
    pub name: String,
    pub external_urls: Option<SpotifyExternalUrls>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyAlbum {
    pub id: Option<String>,
    pub name: String,
    pub images: Option<Vec<SpotifyImage>>,
    pub external_urls: Option<SpotifyExternalUrls>,
    pub release_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyContext {
    #[serde(rename = "type")]
    pub context_type: Option<String>,
    pub href: Option<String>,
    pub uri: Option<String>,
    pub external_urls: Option<SpotifyExternalUrls>,
}

/// Spotify device
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
    pub supports_volume: Option<bool>,
}

/// Spotify devices response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyDevicesResponse {
    pub devices: Vec<SpotifyDevice>,
}

/// Spotify playback state (full player state)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyPlaybackState {
    pub device: Option<SpotifyDevice>,
    pub shuffle_state: Option<bool>,
    pub repeat_state: Option<String>,
    pub timestamp: Option<i64>,
    pub context: Option<SpotifyContext>,
    pub progress_ms: Option<i64>,
    pub item: Option<SpotifyTrack>,
    pub currently_playing_type: Option<String>,
    pub is_playing: bool,
}

// ============================================================================
// Remote Control Request Types
// ============================================================================

/// Request to start playback
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlayRequest {
    /// Spotify URI of the context to play (album, artist, playlist)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_uri: Option<String>,
    /// Array of Spotify track URIs to play
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uris: Option<Vec<String>>,
    /// Position within the context to start playing
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<PlayOffset>,
    /// Position in milliseconds to start playing
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PlayOffset {
    Position { position: i32 },
    Uri { uri: String },
}

/// Request to transfer playback
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferPlaybackRequest {
    /// Device ID to transfer playback to
    pub device_ids: Vec<String>,
    /// Whether to start playing on the new device
    #[serde(skip_serializing_if = "Option::is_none")]
    pub play: Option<bool>,
}

// ============================================================================
// Spotify API Adapter
// ============================================================================

/// Spotify API adapter
pub struct SpotifyApiAdapter<'a> {
    client: &'a reqwest::Client,
    config: &'a Config,
}

impl<'a> SpotifyApiAdapter<'a> {
    /// Create a new Spotify API adapter
    pub fn new(client: &'a reqwest::Client, config: &'a Config) -> Self {
        Self { client, config }
    }

    // ========================================================================
    // Authentication Methods
    // ========================================================================

    /// Exchange authorization code for access and refresh tokens using PKCE
    pub async fn login_with_pkce(
        &self,
        code: &str,
        code_verifier: &str,
    ) -> AppResult<SpotifyTokenResponse> {
        let token_url = self.config.spotify_token_url();

        // Confidential client + PKCE: client credentials go via HTTP Basic auth,
        // the code_verifier in the body. client_id is carried by Basic auth.
        let params = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", &self.config.redirect_uri),
            ("code_verifier", code_verifier),
        ];

        let response = self
            .client
            .post(token_url)
            .basic_auth(&self.config.client_id, Some(&self.config.client_secret))
            .form(&params)
            .send()
            .await
            .map_err(|e| AppError::SpotifyAuthError(format!("Failed to exchange code: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyAuthError(format!(
                "Token exchange failed: {}",
                error_text
            )));
        }

        let token_response: SpotifyTokenResponse = response.json().await.map_err(|e| {
            AppError::SpotifyAuthError(format!("Failed to parse token response: {}", e))
        })?;

        Ok(token_response)
    }

    /// Refresh an access token using a refresh token (confidential client).
    pub async fn refresh_token(&self, refresh_token: &str) -> AppResult<SpotifyTokenResponse> {
        let token_url = self.config.spotify_token_url();

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ];

        let response = self
            .client
            .post(token_url)
            .basic_auth(&self.config.client_id, Some(&self.config.client_secret))
            .form(&params)
            .send()
            .await
            .map_err(|e| AppError::SpotifyAuthError(format!("Failed to refresh token: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyAuthError(format!(
                "Token refresh failed: {}",
                error_text
            )));
        }

        let token_response: SpotifyTokenResponse = response.json().await.map_err(|e| {
            AppError::SpotifyAuthError(format!("Failed to parse token response: {}", e))
        })?;

        Ok(token_response)
    }

    // ========================================================================
    // User Profile Methods
    // ========================================================================

    /// Get user profile data from Spotify
    pub async fn get_user_data(&self, access_token: &str) -> AppResult<SpotifyUserProfile> {
        let me_url = format!("{}/me", self.config.spotify_api_url());

        let response = self
            .client
            .get(&me_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to get user data: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to get user data ({}): {}",
                status, error_text
            )));
        }

        let user_profile: SpotifyUserProfile = response.json().await.map_err(|e| {
            AppError::SpotifyApiError(format!("Failed to parse user profile: {}", e))
        })?;

        Ok(user_profile)
    }

    // ========================================================================
    // Playback State Methods
    // ========================================================================

    /// Get the current playback state
    pub async fn get_playback_state(
        &self,
        access_token: &str,
    ) -> AppResult<Option<SpotifyPlaybackState>> {
        let player_url = format!("{}/me/player", self.config.spotify_api_url());

        let response = self
            .client
            .get(&player_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| {
                AppError::SpotifyApiError(format!("Failed to get playback state: {}", e))
            })?;

        // 204 No Content means no active device
        if response.status() == reqwest::StatusCode::NO_CONTENT {
            return Ok(None);
        }

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to get playback state ({}): {}",
                status, error_text
            )));
        }

        let playback_state: SpotifyPlaybackState = response.json().await.map_err(|e| {
            AppError::SpotifyApiError(format!("Failed to parse playback state: {}", e))
        })?;

        Ok(Some(playback_state))
    }

    /// Get currently playing track
    pub async fn currently_playing(
        &self,
        access_token: &str,
    ) -> AppResult<Option<SpotifyCurrentlyPlaying>> {
        let url = format!(
            "{}/me/player/currently-playing",
            self.config.spotify_api_url()
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| {
                AppError::SpotifyApiError(format!("Failed to get currently playing: {}", e))
            })?;

        // 204 No Content means nothing is currently playing
        if response.status() == reqwest::StatusCode::NO_CONTENT {
            return Ok(None);
        }

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to get currently playing ({}): {}",
                status, error_text
            )));
        }

        let currently_playing: SpotifyCurrentlyPlaying = response.json().await.map_err(|e| {
            AppError::SpotifyApiError(format!("Failed to parse currently playing: {}", e))
        })?;

        Ok(Some(currently_playing))
    }

    // ========================================================================
    // Device Methods
    // ========================================================================

    /// Get available devices
    pub async fn get_devices(&self, access_token: &str) -> AppResult<Vec<SpotifyDevice>> {
        let url = format!("{}/me/player/devices", self.config.spotify_api_url());

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to get devices: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to get devices ({}): {}",
                status, error_text
            )));
        }

        let devices_response: SpotifyDevicesResponse = response
            .json()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to parse devices: {}", e)))?;

        Ok(devices_response.devices)
    }

    /// Transfer playback to a device
    pub async fn transfer_playback(
        &self,
        access_token: &str,
        device_id: &str,
        play: bool,
    ) -> AppResult<()> {
        let url = format!("{}/me/player", self.config.spotify_api_url());

        let body = TransferPlaybackRequest {
            device_ids: vec![device_id.to_string()],
            play: Some(play),
        };

        let response = self
            .client
            .put(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                AppError::SpotifyApiError(format!("Failed to transfer playback: {}", e))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to transfer playback ({}): {}",
                status, error_text
            )));
        }

        Ok(())
    }

    // ========================================================================
    // Remote Control Methods
    // ========================================================================

    /// Start or resume playback
    pub async fn play(
        &self,
        access_token: &str,
        device_id: Option<&str>,
        request: Option<PlayRequest>,
    ) -> AppResult<()> {
        let mut url = format!("{}/me/player/play", self.config.spotify_api_url());
        if let Some(device_id) = device_id {
            url = format!("{}?device_id={}", url, device_id);
        }

        let mut req = self
            .client
            .put(&url)
            .header("Authorization", format!("Bearer {}", access_token));

        if let Some(body) = request {
            req = req.json(&body);
        }

        let response = req
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to start playback: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to start playback ({}): {}",
                status, error_text
            )));
        }

        Ok(())
    }

    /// Pause playback
    pub async fn pause(&self, access_token: &str, device_id: Option<&str>) -> AppResult<()> {
        let mut url = format!("{}/me/player/pause", self.config.spotify_api_url());
        if let Some(device_id) = device_id {
            url = format!("{}?device_id={}", url, device_id);
        }

        let response = self
            .client
            .put(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to pause playback: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to pause playback ({}): {}",
                status, error_text
            )));
        }

        Ok(())
    }

    /// Skip to next track
    pub async fn next(&self, access_token: &str, device_id: Option<&str>) -> AppResult<()> {
        let mut url = format!("{}/me/player/next", self.config.spotify_api_url());
        if let Some(device_id) = device_id {
            url = format!("{}?device_id={}", url, device_id);
        }

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to skip to next: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to skip to next ({}): {}",
                status, error_text
            )));
        }

        Ok(())
    }

    /// Skip to previous track
    pub async fn previous(&self, access_token: &str, device_id: Option<&str>) -> AppResult<()> {
        let mut url = format!("{}/me/player/previous", self.config.spotify_api_url());
        if let Some(device_id) = device_id {
            url = format!("{}?device_id={}", url, device_id);
        }

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to skip to previous: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to skip to previous ({}): {}",
                status, error_text
            )));
        }

        Ok(())
    }

    /// Seek to position in currently playing track
    pub async fn seek(
        &self,
        access_token: &str,
        position_ms: i64,
        device_id: Option<&str>,
    ) -> AppResult<()> {
        let mut url = format!(
            "{}/me/player/seek?position_ms={}",
            self.config.spotify_api_url(),
            position_ms
        );
        if let Some(device_id) = device_id {
            url = format!("{}&device_id={}", url, device_id);
        }

        let response = self
            .client
            .put(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to seek: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to seek ({}): {}",
                status, error_text
            )));
        }

        Ok(())
    }

    /// Set volume
    pub async fn set_volume(
        &self,
        access_token: &str,
        volume_percent: i32,
        device_id: Option<&str>,
    ) -> AppResult<()> {
        let volume = volume_percent.clamp(0, 100);
        let mut url = format!(
            "{}/me/player/volume?volume_percent={}",
            self.config.spotify_api_url(),
            volume
        );
        if let Some(device_id) = device_id {
            url = format!("{}&device_id={}", url, device_id);
        }

        let response = self
            .client
            .put(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to set volume: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to set volume ({}): {}",
                status, error_text
            )));
        }

        Ok(())
    }

    /// Set shuffle state
    pub async fn set_shuffle(
        &self,
        access_token: &str,
        state: bool,
        device_id: Option<&str>,
    ) -> AppResult<()> {
        let mut url = format!(
            "{}/me/player/shuffle?state={}",
            self.config.spotify_api_url(),
            state
        );
        if let Some(device_id) = device_id {
            url = format!("{}&device_id={}", url, device_id);
        }

        let response = self
            .client
            .put(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to set shuffle: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to set shuffle ({}): {}",
                status, error_text
            )));
        }

        Ok(())
    }

    /// Set repeat mode
    /// state: "track", "context", or "off"
    pub async fn set_repeat(
        &self,
        access_token: &str,
        state: &str,
        device_id: Option<&str>,
    ) -> AppResult<()> {
        let mut url = format!(
            "{}/me/player/repeat?state={}",
            self.config.spotify_api_url(),
            state
        );
        if let Some(device_id) = device_id {
            url = format!("{}&device_id={}", url, device_id);
        }

        let response = self
            .client
            .put(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to set repeat: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to set repeat ({}): {}",
                status, error_text
            )));
        }

        Ok(())
    }

    /// Add track to queue
    pub async fn add_to_queue(
        &self,
        access_token: &str,
        uri: &str,
        device_id: Option<&str>,
    ) -> AppResult<()> {
        let mut url = format!(
            "{}/me/player/queue?uri={}",
            self.config.spotify_api_url(),
            urlencoding::encode(uri)
        );
        if let Some(device_id) = device_id {
            url = format!("{}&device_id={}", url, device_id);
        }

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to add to queue: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to add to queue ({}): {}",
                status, error_text
            )));
        }

        Ok(())
    }

    // ========================================================================
    // Additional Data Methods
    // ========================================================================

    /// Get user's top tracks
    pub async fn get_top_tracks(
        &self,
        access_token: &str,
        time_range: Option<&str>,
        limit: Option<u32>,
    ) -> AppResult<serde_json::Value> {
        let time_range = time_range.unwrap_or("medium_term");
        let limit = limit.unwrap_or(20);

        let url = format!(
            "{}/me/top/tracks?time_range={}&limit={}",
            self.config.spotify_api_url(),
            time_range,
            limit
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to get top tracks: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to get top tracks ({}): {}",
                status, error_text
            )));
        }

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| AppError::SpotifyApiError(format!("Failed to parse top tracks: {}", e)))?;

        Ok(data)
    }

    /// Get user's recently played tracks
    pub async fn get_recently_played(
        &self,
        access_token: &str,
        limit: Option<u32>,
    ) -> AppResult<serde_json::Value> {
        let limit = limit.unwrap_or(20);

        let url = format!(
            "{}/me/player/recently-played?limit={}",
            self.config.spotify_api_url(),
            limit
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| {
                AppError::SpotifyApiError(format!("Failed to get recently played: {}", e))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyApiError(format!(
                "Failed to get recently played ({}): {}",
                status, error_text
            )));
        }

        let data: serde_json::Value = response.json().await.map_err(|e| {
            AppError::SpotifyApiError(format!("Failed to parse recently played: {}", e))
        })?;

        Ok(data)
    }
}

