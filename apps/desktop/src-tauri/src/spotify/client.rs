//! Spotify API client for the desktop app
//! Handles OAuth authentication and all Spotify API calls

use super::os_now_playing::NowPlayingProvider;
use super::types::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::Rng;
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use url::Url;

// =============================================================================
// Constants
// =============================================================================

const SPOTIFY_AUTH_URL: &str = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE: &str = "https://api.spotify.com/v1";

const OAUTH_CALLBACK_PORT: u16 = 8585;

// Default scopes for the app
const SCOPES: &[&str] = &[
    "streaming",
    "user-read-email",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-recently-played",
    "user-read-playback-position",
    "user-top-read",
    "playlist-read-collaborative",
    "playlist-read-private",
    "user-library-read",
    "user-follow-read",
];

// Keyring service name for secure token storage
const KEYRING_SERVICE: &str = "mesh-spotify-desktop";
const KEYRING_SETTINGS_KEY: &str = "app_settings";

// =============================================================================
// Errors
// =============================================================================

#[derive(Debug, thiserror::Error)]
pub enum SpotifyError {
    #[error("Not authenticated")]
    NotAuthenticated,

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Token refresh failed: {0}")]
    TokenRefreshFailed(String),

    #[error("API error ({status}): {message}")]
    ApiError { status: u16, message: String },

    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("URL parse error: {0}")]
    UrlError(#[from] url::ParseError),

    #[error("Keyring error: {0}")]
    KeyringError(String),

    #[error("OAuth callback error: {0}")]
    OAuthCallbackError(String),

    #[error("No active device")]
    NoActiveDevice,

    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for SpotifyError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, SpotifyError>;

// =============================================================================
// PKCE Helpers
// =============================================================================

impl PkceParams {
    pub fn new() -> Self {
        let code_verifier = generate_code_verifier();
        let code_challenge = generate_code_challenge(&code_verifier);
        let state = generate_state();

        Self {
            code_verifier,
            code_challenge,
            state,
        }
    }
}

fn generate_code_verifier() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..48).map(|_| rng.gen::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let result = hasher.finalize();
    URL_SAFE_NO_PAD.encode(result)
}

fn generate_state() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

// =============================================================================
// Spotify Client
// =============================================================================

pub struct SpotifyClient {
    client: Client,
    client_id: String,
    redirect_uri: String,
    auth_state: Arc<RwLock<Option<AuthState>>>,
    settings: Arc<RwLock<AppSettings>>,
}

impl SpotifyClient {
    /// Create a new Spotify client
    pub fn new(client_id: impl Into<String>) -> Self {
        let redirect_uri = format!("http://127.0.0.1:{}/callback", OAUTH_CALLBACK_PORT);

        // Try to load settings from storage (keyring first, then file fallback)
        let settings = Self::load_settings_from_storage();

        Self {
            client: Client::new(),
            client_id: client_id.into(),
            redirect_uri,
            auth_state: Arc::new(RwLock::new(None)),
            settings: Arc::new(RwLock::new(settings)),
        }
    }

    // =========================================================================
    // Settings Management
    // =========================================================================

    /// Get current settings
    pub async fn get_settings(&self) -> AppSettings {
        self.settings.read().await.clone()
    }

    /// Update settings
    pub async fn update_settings(&self, settings: AppSettings) -> Result<()> {
        *self.settings.write().await = settings.clone();
        self.save_settings_to_keyring(&settings)?;
        Ok(())
    }

    /// Update just the now playing source
    pub async fn set_now_playing_source(&self, source: NowPlayingSource) -> Result<()> {
        let mut settings = self.settings.write().await;
        settings.now_playing_source = source;
        self.save_settings_to_keyring(&settings)?;
        Ok(())
    }

    /// Update just the polling interval
    pub async fn set_polling_interval(&self, interval: PollingInterval) -> Result<()> {
        let mut settings = self.settings.write().await;
        settings.polling_interval = interval;
        self.save_settings_to_keyring(&settings)?;
        Ok(())
    }

    fn save_settings_to_keyring(&self, settings: &AppSettings) -> Result<()> {
        log::info!("Saving settings to storage");

        // Try keyring first
        let keyring_result =
            keyring::Entry::new(KEYRING_SERVICE, KEYRING_SETTINGS_KEY).and_then(|entry| {
                let json = serde_json::to_string(settings).unwrap_or_default();
                entry.set_password(&json)
            });

        match keyring_result {
            Ok(_) => {
                log::info!("Successfully saved settings to keyring");
                // Also save to file as backup
                if let Err(e) = Self::save_settings_to_file(settings) {
                    log::warn!("Failed to save backup settings file: {}", e);
                }
                Ok(())
            }
            Err(e) => {
                log::warn!(
                    "Keyring settings save failed: {}, falling back to file storage",
                    e
                );
                Self::save_settings_to_file(settings)
            }
        }
    }

    /// Get the path for file-based settings storage
    fn get_settings_file_path() -> Option<PathBuf> {
        dirs::data_local_dir().map(|dir| dir.join("mesh-spotify").join("settings.json"))
    }

    /// Save settings to file (fallback storage)
    fn save_settings_to_file(settings: &AppSettings) -> Result<()> {
        let path = Self::get_settings_file_path()
            .ok_or_else(|| SpotifyError::Other("Could not determine data directory".into()))?;

        log::info!("Saving settings to file: {:?}", path);

        // Create parent directory if needed
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                log::error!("Failed to create settings directory: {}", e);
                SpotifyError::Other(format!("Failed to create directory: {}", e))
            })?;
        }

        let json = serde_json::to_string_pretty(settings)?;
        std::fs::write(&path, &json).map_err(|e| {
            log::error!("Failed to write settings file: {}", e);
            SpotifyError::Other(format!("Failed to write settings file: {}", e))
        })?;

        log::info!("Successfully saved settings to file");
        Ok(())
    }

    /// Load settings from file (fallback storage)
    fn load_settings_from_file() -> Option<AppSettings> {
        let path = Self::get_settings_file_path()?;

        log::info!("Checking for settings file: {:?}", path);

        if !path.exists() {
            log::info!("Settings file does not exist");
            return None;
        }

        match std::fs::read_to_string(&path) {
            Ok(json) => {
                log::info!("Found settings file ({} bytes)", json.len());
                match serde_json::from_str::<AppSettings>(&json) {
                    Ok(settings) => {
                        log::info!(
                            "Successfully parsed settings file: source={:?}, polling={:?}",
                            settings.now_playing_source,
                            settings.polling_interval
                        );
                        Some(settings)
                    }
                    Err(e) => {
                        log::error!("Failed to parse settings file: {}", e);
                        None
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to read settings file: {}", e);
                None
            }
        }
    }

    /// Load settings from storage (tries keyring first, then file fallback)
    fn load_settings_from_storage() -> AppSettings {
        log::info!("Loading settings from storage");

        // Try keyring first
        let keyring_result = keyring::Entry::new(KEYRING_SERVICE, KEYRING_SETTINGS_KEY)
            .and_then(|entry| entry.get_password());

        match keyring_result {
            Ok(json) => {
                log::info!("Found settings in keyring ({} bytes)", json.len());
                match serde_json::from_str::<AppSettings>(&json) {
                    Ok(settings) => {
                        log::info!(
                            "Successfully parsed settings from keyring: source={:?}, polling={:?}",
                            settings.now_playing_source,
                            settings.polling_interval
                        );
                        return settings;
                    }
                    Err(e) => {
                        log::error!(
                            "Failed to parse keyring settings: {}, trying file fallback",
                            e
                        );
                    }
                }
            }
            Err(keyring::Error::NoEntry) => {
                log::info!("No settings found in keyring, trying file fallback");
            }
            Err(e) => {
                log::warn!("Keyring settings load failed: {}, trying file fallback", e);
            }
        }

        // Try file fallback
        if let Some(settings) = Self::load_settings_from_file() {
            return settings;
        }

        // Return defaults
        log::info!("No stored settings found, using defaults");
        AppSettings::default()
    }

    /// Try to restore authentication from secure storage
    pub async fn try_restore_auth(&self) -> Result<Option<AuthenticatedUser>> {
        match self.load_tokens_from_keyring() {
            Ok(Some(mut state)) => {
                log::info!("Found stored authentication, attempting to restore...");

                // Check if token is expired and refresh if needed
                if state.is_expired() {
                    log::info!("Stored token is expired, attempting refresh...");
                    if let Some(refresh_token) = &state.refresh_token {
                        match self.refresh_token_internal(refresh_token).await {
                            Ok(new_state) => {
                                log::info!("Token refresh successful");
                                state = new_state;
                            }
                            Err(e) => {
                                log::warn!("Failed to refresh token: {}", e);
                                self.clear_tokens_from_keyring();
                                return Ok(None);
                            }
                        }
                    } else {
                        log::warn!("No refresh token available, clearing stored auth");
                        self.clear_tokens_from_keyring();
                        return Ok(None);
                    }
                }

                // If we don't have a user stored, fetch from API
                let user = if let Some(user) = state.user.clone() {
                    log::info!(
                        "Using stored user profile: {}",
                        user.display_name.as_deref().unwrap_or(&user.id)
                    );
                    user
                } else {
                    log::info!("No stored user profile, fetching from API...");
                    match self.get_user_profile_with_token(&state.access_token).await {
                        Ok(user) => {
                            log::info!(
                                "Fetched user profile: {}",
                                user.display_name.as_deref().unwrap_or(&user.id)
                            );
                            // Update state with user and save
                            state.user = Some(user.clone());
                            if let Err(e) = self.save_tokens_to_keyring(&state) {
                                log::warn!("Failed to save updated auth state: {}", e);
                            }
                            user
                        }
                        Err(e) => {
                            log::warn!("Failed to fetch user profile: {}", e);
                            self.clear_tokens_from_keyring();
                            return Ok(None);
                        }
                    }
                };

                // Store the auth state
                let access_token = state.access_token.clone();
                let refresh_token = state.refresh_token.clone();
                *self.auth_state.write().await = Some(state);

                // Return the authenticated user
                Ok(Some(AuthenticatedUser::from_user_and_tokens(
                    user,
                    &TokenResponse {
                        access_token,
                        token_type: "Bearer".to_string(),
                        scope: None,
                        expires_in: 3600,
                        refresh_token,
                    },
                )))
            }
            Ok(None) => {
                log::info!("No stored authentication found");
                Ok(None)
            }
            Err(e) => {
                log::warn!("Failed to load tokens from keyring: {}", e);
                Ok(None)
            }
        }
    }

    /// Start the OAuth authentication flow
    /// Opens the browser and waits for the callback
    pub async fn authenticate(&self) -> Result<AuthenticatedUser> {
        let pkce = PkceParams::new();

        // Build the authorization URL
        let auth_url = self.build_auth_url(&pkce)?;

        // Open the browser
        if let Err(e) = open::that(&auth_url) {
            return Err(SpotifyError::AuthenticationFailed(format!(
                "Failed to open browser: {}",
                e
            )));
        }

        // Start local server to receive callback
        let code = self.wait_for_oauth_callback(&pkce.state).await?;

        // Exchange code for tokens
        let tokens = self
            .exchange_code_for_tokens(&code, &pkce.code_verifier)
            .await?;

        // Get user profile
        let user = self
            .get_user_profile_with_token(&tokens.access_token)
            .await?;

        // Create auth state
        let auth_state = AuthState {
            access_token: tokens.access_token.clone(),
            refresh_token: tokens.refresh_token.clone(),
            expires_at: chrono::Utc::now() + chrono::Duration::seconds(tokens.expires_in),
            user: Some(user.clone()),
        };

        // Save to keyring
        if let Err(e) = self.save_tokens_to_keyring(&auth_state) {
            log::warn!("Failed to save tokens to keyring: {}", e);
        }

        // Update internal state
        *self.auth_state.write().await = Some(auth_state);

        Ok(AuthenticatedUser::from_user_and_tokens(user, &tokens))
    }

    /// Build the Spotify authorization URL
    fn build_auth_url(&self, pkce: &PkceParams) -> Result<String> {
        let mut url = Url::parse(SPOTIFY_AUTH_URL)?;

        url.query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", &self.redirect_uri)
            .append_pair("scope", &SCOPES.join(" "))
            .append_pair("code_challenge_method", "S256")
            .append_pair("code_challenge", &pkce.code_challenge)
            .append_pair("state", &pkce.state)
            .append_pair("show_dialog", "true");

        Ok(url.to_string())
    }

    /// Wait for OAuth callback on local server
    async fn wait_for_oauth_callback(&self, expected_state: &str) -> Result<String> {
        use tiny_http::{Response, Server};

        let server = Server::http(format!("127.0.0.1:{}", OAUTH_CALLBACK_PORT))
            .map_err(|e| SpotifyError::OAuthCallbackError(e.to_string()))?;

        log::info!(
            "OAuth callback server listening on port {}",
            OAUTH_CALLBACK_PORT
        );

        // Wait for a single request (with timeout)
        let timeout = std::time::Duration::from_secs(300); // 5 minute timeout
        let start = std::time::Instant::now();

        loop {
            if start.elapsed() > timeout {
                return Err(SpotifyError::OAuthCallbackError(
                    "OAuth callback timeout".to_string(),
                ));
            }

            if let Ok(Some(request)) = server.try_recv() {
                let url = format!("http://localhost{}", request.url());
                let parsed = Url::parse(&url)?;

                // Extract query parameters
                let params: std::collections::HashMap<_, _> =
                    parsed.query_pairs().into_owned().collect();

                // Check for error
                if let Some(error) = params.get("error") {
                    let description = params
                        .get("error_description")
                        .map(|s| s.as_str())
                        .unwrap_or("Unknown error");

                    let html = format!(
                        r#"<!DOCTYPE html>
                        <html>
                        <head><title>Authentication Failed</title></head>
                        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                            <h1>❌ Authentication Failed</h1>
                            <p>{}: {}</p>
                            <p>You can close this window.</p>
                        </body>
                        </html>"#,
                        error, description
                    );

                    let response = Response::from_string(html).with_header(
                        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..])
                            .unwrap(),
                    );
                    let _ = request.respond(response);

                    return Err(SpotifyError::AuthenticationFailed(format!(
                        "{}: {}",
                        error, description
                    )));
                }

                // Verify state
                let state = params
                    .get("state")
                    .ok_or_else(|| SpotifyError::OAuthCallbackError("Missing state".to_string()))?;

                if state != expected_state {
                    return Err(SpotifyError::OAuthCallbackError(
                        "State mismatch - possible CSRF attack".to_string(),
                    ));
                }

                // Extract code
                let code = params
                    .get("code")
                    .ok_or_else(|| SpotifyError::OAuthCallbackError("Missing code".to_string()))?
                    .clone();

                // Send success response
                let html = r#"<!DOCTYPE html>
                <html>
                <head><title>Authentication Successful</title></head>
                <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #121212; color: white;">
                    <h1 style="color: #1DB954;">✓ Authentication Successful</h1>
                    <p>You can close this window and return to Mesh.</p>
                    <script>setTimeout(() => window.close(), 2000);</script>
                </body>
                </html>"#;

                let response = Response::from_string(html).with_header(
                    tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap(),
                );
                let _ = request.respond(response);

                return Ok(code);
            }

            // Small sleep to avoid busy waiting
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
    }

    /// Exchange authorization code for tokens
    async fn exchange_code_for_tokens(
        &self,
        code: &str,
        code_verifier: &str,
    ) -> Result<TokenResponse> {
        let params = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", &self.redirect_uri),
            ("client_id", &self.client_id),
            ("code_verifier", code_verifier),
        ];

        let response = self
            .client
            .post(SPOTIFY_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(SpotifyError::AuthenticationFailed(format!(
                "Token exchange failed: {}",
                error_text
            )));
        }

        let tokens: TokenResponse = response.json().await?;
        Ok(tokens)
    }

    /// Refresh the access token
    pub async fn refresh_token(&self) -> Result<()> {
        let refresh_token = {
            let state = self.auth_state.read().await;
            state
                .as_ref()
                .and_then(|s| s.refresh_token.clone())
                .ok_or(SpotifyError::NotAuthenticated)?
        };

        let new_state = self.refresh_token_internal(&refresh_token).await?;

        // Save to keyring
        if let Err(e) = self.save_tokens_to_keyring(&new_state) {
            log::warn!("Failed to save refreshed tokens to keyring: {}", e);
        }

        *self.auth_state.write().await = Some(new_state);
        Ok(())
    }

    async fn refresh_token_internal(&self, refresh_token: &str) -> Result<AuthState> {
        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", &self.client_id),
        ];

        let response = self
            .client
            .post(SPOTIFY_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(SpotifyError::TokenRefreshFailed(error_text));
        }

        let tokens: TokenResponse = response.json().await?;

        // Get user profile with new token
        let user = match self.get_user_profile_with_token(&tokens.access_token).await {
            Ok(user) => Some(user),
            Err(e) => {
                log::warn!("Failed to get user profile after refresh: {}", e);
                None
            }
        };

        Ok(AuthState {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token.or(Some(refresh_token.to_string())),
            expires_at: chrono::Utc::now() + chrono::Duration::seconds(tokens.expires_in),
            user,
        })
    }

    /// Check if authenticated
    pub async fn is_authenticated(&self) -> bool {
        self.auth_state.read().await.is_some()
    }

    /// Logout - clear all auth state
    pub async fn logout(&self) {
        *self.auth_state.write().await = None;
        self.clear_tokens_from_keyring();
    }

    /// Get the current access token, refreshing if needed
    async fn get_access_token(&self) -> Result<String> {
        {
            let state = self.auth_state.read().await;
            if let Some(state) = state.as_ref() {
                if !state.is_expired() {
                    return Ok(state.access_token.clone());
                }
            }
        }

        // Token expired or missing, try to refresh
        self.refresh_token().await?;

        let state = self.auth_state.read().await;
        state
            .as_ref()
            .map(|s| s.access_token.clone())
            .ok_or(SpotifyError::NotAuthenticated)
    }

    // =========================================================================
    // Token Storage (with file fallback for development)
    // =========================================================================

    /// Get the path for file-based token storage (fallback when keyring fails)
    fn get_token_file_path() -> Option<PathBuf> {
        dirs::data_local_dir().map(|dir| dir.join("mesh-spotify").join("auth_state.json"))
    }

    /// Save tokens to file (fallback storage)
    fn save_tokens_to_file(&self, state: &AuthState) -> Result<()> {
        let path = Self::get_token_file_path()
            .ok_or_else(|| SpotifyError::Other("Could not determine data directory".into()))?;

        log::info!("Saving tokens to file: {:?}", path);

        // Create parent directory if needed
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                log::error!("Failed to create token directory: {}", e);
                SpotifyError::Other(format!("Failed to create directory: {}", e))
            })?;
        }

        let json = serde_json::to_string_pretty(state)?;
        std::fs::write(&path, &json).map_err(|e| {
            log::error!("Failed to write token file: {}", e);
            SpotifyError::Other(format!("Failed to write token file: {}", e))
        })?;

        log::info!("Successfully saved tokens to file");
        Ok(())
    }

    /// Load tokens from file (fallback storage)
    fn load_tokens_from_file(&self) -> Result<Option<AuthState>> {
        let path = match Self::get_token_file_path() {
            Some(p) => p,
            None => return Ok(None),
        };

        log::info!("Checking for token file: {:?}", path);

        if !path.exists() {
            log::info!("Token file does not exist");
            return Ok(None);
        }

        let json = std::fs::read_to_string(&path).map_err(|e| {
            log::error!("Failed to read token file: {}", e);
            SpotifyError::Other(format!("Failed to read token file: {}", e))
        })?;

        log::info!("Found token file ({} bytes)", json.len());

        match serde_json::from_str::<AuthState>(&json) {
            Ok(state) => {
                log::info!(
                    "Successfully parsed token file, has refresh_token: {}, has user: {}",
                    state.refresh_token.is_some(),
                    state.user.is_some()
                );
                Ok(Some(state))
            }
            Err(e) => {
                log::error!("Failed to parse token file: {}", e);
                // Delete corrupted file
                let _ = std::fs::remove_file(&path);
                Ok(None)
            }
        }
    }

    /// Clear tokens from file (fallback storage)
    fn clear_tokens_from_file(&self) {
        if let Some(path) = Self::get_token_file_path() {
            if path.exists() {
                match std::fs::remove_file(&path) {
                    Ok(_) => log::info!("Successfully cleared token file"),
                    Err(e) => log::warn!("Failed to clear token file: {}", e),
                }
            }
        }
    }

    fn save_tokens_to_keyring(&self, state: &AuthState) -> Result<()> {
        log::info!(
            "Saving tokens to keyring (service: {}, key: auth_state)",
            KEYRING_SERVICE
        );

        // Try keyring first
        let keyring_result = keyring::Entry::new(KEYRING_SERVICE, "auth_state").and_then(|entry| {
            let json = serde_json::to_string(state).unwrap_or_default();
            entry.set_password(&json)
        });

        match keyring_result {
            Ok(_) => {
                log::info!("Successfully saved tokens to keyring");
                // Also save to file as backup
                if let Err(e) = self.save_tokens_to_file(state) {
                    log::warn!("Failed to save backup token file: {}", e);
                }
                Ok(())
            }
            Err(e) => {
                log::warn!("Keyring save failed: {}, falling back to file storage", e);
                // Fall back to file storage
                self.save_tokens_to_file(state)
            }
        }
    }

    fn load_tokens_from_keyring(&self) -> Result<Option<AuthState>> {
        log::info!(
            "Loading tokens from keyring (service: {}, key: auth_state)",
            KEYRING_SERVICE
        );

        // Try keyring first
        let keyring_result = keyring::Entry::new(KEYRING_SERVICE, "auth_state")
            .and_then(|entry| entry.get_password());

        match keyring_result {
            Ok(json) => {
                log::info!("Found stored tokens in keyring ({} bytes)", json.len());
                match serde_json::from_str::<AuthState>(&json) {
                    Ok(state) => {
                        log::info!(
                            "Successfully parsed stored auth state from keyring, has refresh_token: {}, has user: {}, expires_at: {}",
                            state.refresh_token.is_some(),
                            state.user.is_some(),
                            state.expires_at
                        );
                        Ok(Some(state))
                    }
                    Err(e) => {
                        log::error!(
                            "Failed to parse keyring auth state: {}, trying file fallback",
                            e
                        );
                        self.load_tokens_from_file()
                    }
                }
            }
            Err(keyring::Error::NoEntry) => {
                log::info!("No stored tokens found in keyring, trying file fallback");
                self.load_tokens_from_file()
            }
            Err(e) => {
                log::warn!("Keyring load failed: {}, trying file fallback", e);
                self.load_tokens_from_file()
            }
        }
    }

    fn clear_tokens_from_keyring(&self) {
        log::info!("Clearing tokens from all storage");

        // Clear keyring
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, "auth_state") {
            match entry.delete_credential() {
                Ok(_) => log::info!("Successfully cleared tokens from keyring"),
                Err(e) => log::warn!("Failed to clear tokens from keyring: {}", e),
            }
        }

        // Also clear file
        self.clear_tokens_from_file();
    }

    // =========================================================================
    // API Request Helpers
    // =========================================================================

    async fn api_get<T: serde::de::DeserializeOwned>(&self, endpoint: &str) -> Result<T> {
        let token = self.get_access_token().await?;
        let url = format!("{}{}", SPOTIFY_API_BASE, endpoint);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("X-Mesh-Source", "api")
            .send()
            .await?;

        self.handle_response(response).await
    }

    async fn api_get_optional<T: serde::de::DeserializeOwned>(
        &self,
        endpoint: &str,
    ) -> Result<Option<T>> {
        let token = self.get_access_token().await?;
        let url = format!("{}{}", SPOTIFY_API_BASE, endpoint);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("X-Mesh-Source", "api")
            .send()
            .await?;

        if response.status().as_u16() == 204 {
            return Ok(None);
        }

        self.handle_response(response).await.map(Some)
    }

    async fn api_put(&self, endpoint: &str, body: Option<&impl serde::Serialize>) -> Result<()> {
        let token = self.get_access_token().await?;
        let url = format!("{}{}", SPOTIFY_API_BASE, endpoint);

        let mut request = self
            .client
            .put(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("X-Mesh-Source", "api");

        if let Some(body) = body {
            request = request.json(body);
        } else {
            // Spotify API requires Content-Length header even for empty PUT requests
            request = request.header("Content-Length", "0");
        }

        let response = request.send().await?;
        self.handle_empty_response(response).await
    }

    async fn api_post(&self, endpoint: &str, body: Option<&impl serde::Serialize>) -> Result<()> {
        let token = self.get_access_token().await?;
        let url = format!("{}{}", SPOTIFY_API_BASE, endpoint);

        let mut request = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("X-Mesh-Source", "api");

        if let Some(body) = body {
            request = request.json(body);
        } else {
            // Spotify API requires Content-Length header even for empty POST requests
            request = request.header("Content-Length", "0");
        }

        let response = request.send().await?;
        self.handle_empty_response(response).await
    }

    async fn handle_response<T: serde::de::DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T> {
        let status = response.status();

        if status.is_success() {
            if status.as_u16() == 204 {
                // No content - return error since we expect a body
                return Err(SpotifyError::ApiError {
                    status: 204,
                    message: "No content".to_string(),
                });
            }
            return Ok(response.json().await?);
        }

        // Handle error response
        if status.as_u16() == 401 {
            // Try to refresh token and retry would be handled by caller
            return Err(SpotifyError::NotAuthenticated);
        }

        let error_text = response.text().await.unwrap_or_default();
        Err(SpotifyError::ApiError {
            status: status.as_u16(),
            message: error_text,
        })
    }

    async fn handle_empty_response(&self, response: reqwest::Response) -> Result<()> {
        let status = response.status();

        if status.is_success() {
            return Ok(());
        }

        if status.as_u16() == 401 {
            return Err(SpotifyError::NotAuthenticated);
        }

        let error_text = response.text().await.unwrap_or_default();
        Err(SpotifyError::ApiError {
            status: status.as_u16(),
            message: error_text,
        })
    }

    // =========================================================================
    // User Profile
    // =========================================================================

    async fn get_user_profile_with_token(&self, token: &str) -> Result<SpotifyUser> {
        let url = format!("{}/me", SPOTIFY_API_BASE);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?;

        self.handle_response(response).await
    }

    pub async fn get_user_profile(&self) -> Result<SpotifyUser> {
        self.api_get("/me").await
    }

    // =========================================================================
    // Playback State
    // =========================================================================

    pub async fn get_playback_state(&self) -> Result<Option<PlaybackState>> {
        self.api_get_optional("/me/player").await
    }

    pub async fn get_currently_playing(&self) -> Result<Option<CurrentlyPlaying>> {
        self.api_get_optional("/me/player/currently-playing").await
    }

    // =========================================================================
    // Playback Controls
    // =========================================================================

    pub async fn play(&self, options: Option<PlayOptions>) -> Result<()> {
        let mut endpoint = "/me/player/play".to_string();

        if let Some(ref opts) = options {
            if let Some(ref device_id) = opts.device_id {
                endpoint = format!("{}?device_id={}", endpoint, device_id);
            }
        }

        // Build request body (only include fields that are set)
        let body = options.and_then(|opts| {
            let mut map = serde_json::Map::new();

            if let Some(context_uri) = opts.context_uri {
                map.insert("context_uri".to_string(), serde_json::json!(context_uri));
            }
            if let Some(uris) = opts.uris {
                map.insert("uris".to_string(), serde_json::json!(uris));
            }
            if let Some(offset) = opts.offset {
                map.insert("offset".to_string(), serde_json::json!(offset));
            }
            if let Some(position_ms) = opts.position_ms {
                map.insert("position_ms".to_string(), serde_json::json!(position_ms));
            }

            if map.is_empty() {
                None
            } else {
                Some(serde_json::Value::Object(map))
            }
        });

        self.api_put(&endpoint, body.as_ref()).await
    }

    pub async fn pause(&self, device_id: Option<&str>) -> Result<()> {
        let endpoint = match device_id {
            Some(id) => format!("/me/player/pause?device_id={}", id),
            None => "/me/player/pause".to_string(),
        };
        self.api_put(&endpoint, None::<&()>).await
    }

    pub async fn next_track(&self, device_id: Option<&str>) -> Result<()> {
        let endpoint = match device_id {
            Some(id) => format!("/me/player/next?device_id={}", id),
            None => "/me/player/next".to_string(),
        };
        self.api_post(&endpoint, None::<&()>).await
    }

    pub async fn previous_track(&self, device_id: Option<&str>) -> Result<()> {
        let endpoint = match device_id {
            Some(id) => format!("/me/player/previous?device_id={}", id),
            None => "/me/player/previous".to_string(),
        };
        self.api_post(&endpoint, None::<&()>).await
    }

    pub async fn seek(&self, position_ms: i64, device_id: Option<&str>) -> Result<()> {
        let endpoint = match device_id {
            Some(id) => format!(
                "/me/player/seek?position_ms={}&device_id={}",
                position_ms, id
            ),
            None => format!("/me/player/seek?position_ms={}", position_ms),
        };
        self.api_put(&endpoint, None::<&()>).await
    }

    pub async fn set_volume(&self, volume_percent: i32, device_id: Option<&str>) -> Result<()> {
        let volume = volume_percent.clamp(0, 100);
        let endpoint = match device_id {
            Some(id) => format!(
                "/me/player/volume?volume_percent={}&device_id={}",
                volume, id
            ),
            None => format!("/me/player/volume?volume_percent={}", volume),
        };
        self.api_put(&endpoint, None::<&()>).await
    }

    pub async fn set_shuffle(&self, state: bool, device_id: Option<&str>) -> Result<()> {
        let endpoint = match device_id {
            Some(id) => format!("/me/player/shuffle?state={}&device_id={}", state, id),
            None => format!("/me/player/shuffle?state={}", state),
        };
        self.api_put(&endpoint, None::<&()>).await
    }

    pub async fn set_repeat(&self, state: RepeatMode, device_id: Option<&str>) -> Result<()> {
        let endpoint = match device_id {
            Some(id) => format!("/me/player/repeat?state={}&device_id={}", state, id),
            None => format!("/me/player/repeat?state={}", state),
        };
        self.api_put(&endpoint, None::<&()>).await
    }

    // =========================================================================
    // Devices
    // =========================================================================

    pub async fn get_devices(&self) -> Result<Vec<SpotifyDevice>> {
        let response: DevicesResponse = self.api_get("/me/player/devices").await?;
        Ok(response.devices)
    }

    pub async fn transfer_playback(&self, device_id: &str, play: bool) -> Result<()> {
        #[derive(serde::Serialize)]
        struct TransferRequest {
            device_ids: Vec<String>,
            play: bool,
        }

        let body = TransferRequest {
            device_ids: vec![device_id.to_string()],
            play,
        };

        self.api_put("/me/player", Some(&body)).await
    }

    // =========================================================================
    // Queue
    // =========================================================================

    pub async fn add_to_queue(&self, uri: &str, device_id: Option<&str>) -> Result<()> {
        let endpoint = match device_id {
            Some(id) => format!(
                "/me/player/queue?uri={}&device_id={}",
                urlencoding::encode(uri),
                id
            ),
            None => format!("/me/player/queue?uri={}", urlencoding::encode(uri)),
        };
        self.api_post(&endpoint, None::<&()>).await
    }

    // =========================================================================
    // Hybrid Now Playing
    // =========================================================================

    /// Get hybrid now playing data based on current settings
    /// This intelligently combines OS-level data with API data
    pub async fn get_hybrid_now_playing(
        &self,
        os_provider: &dyn NowPlayingProvider,
    ) -> Result<HybridNowPlaying> {
        let settings = self.settings.read().await;
        let now = chrono::Utc::now().timestamp_millis();

        match settings.now_playing_source {
            NowPlayingSource::ApiOnly => {
                // Use only API data
                let api_state = self.get_playback_state().await.ok().flatten();
                Ok(self.api_to_hybrid(api_state, now))
            }

            NowPlayingSource::OsOnly => {
                // Use only OS data, no API calls
                let os_data = os_provider.get_now_playing().await;
                let os_matches = self.verify_os_matches_user(&os_data, &settings).await;

                Ok(HybridNowPlaying {
                    display_data: os_data.unwrap_or_default(),
                    source: NowPlayingDataSource::Os,
                    os_matches_user: os_matches,
                    api_last_updated: None,
                    os_last_updated: Some(now),
                })
            }

            NowPlayingSource::Hybrid => {
                // Get OS data first (fast, local)
                let os_data = os_provider.get_now_playing().await;
                let os_matches = self.verify_os_matches_user(&os_data, &settings).await;

                // If OS data is from Spotify and matches user, use it
                if let Some(ref os) = os_data {
                    if os.is_spotify() && os_matches {
                        return Ok(HybridNowPlaying {
                            display_data: os.clone(),
                            source: NowPlayingDataSource::Os,
                            os_matches_user: true,
                            api_last_updated: None,
                            os_last_updated: Some(now),
                        });
                    }
                }

                // Fall back to API if OS data doesn't match or isn't available
                let api_state = self.get_playback_state().await.ok().flatten();
                let mut hybrid = self.api_to_hybrid(api_state, now);
                hybrid.os_matches_user = os_matches;
                Ok(hybrid)
            }
        }
    }

    /// Convert API playback state to hybrid format
    fn api_to_hybrid(&self, api_state: Option<PlaybackState>, timestamp: i64) -> HybridNowPlaying {
        match api_state {
            Some(state) => {
                let display = OsNowPlaying {
                    title: state.item.as_ref().map(|t| t.name.clone()),
                    artist: state.item.as_ref().map(|t| {
                        t.artists
                            .iter()
                            .map(|a| a.name.clone())
                            .collect::<Vec<_>>()
                            .join(", ")
                    }),
                    album: state.item.as_ref().map(|t| t.album.name.clone()),
                    artwork_url: state
                        .item
                        .as_ref()
                        .and_then(|t| t.album.images.first().map(|i| i.url.clone())),
                    duration_ms: state.item.as_ref().map(|t| t.duration_ms),
                    position_ms: state.progress_ms,
                    is_playing: state.is_playing,
                    app_name: Some("Spotify".to_string()),
                    app_bundle_id: None,
                    spotify_uri: state.item.as_ref().map(|t| t.uri.clone()),
                };

                HybridNowPlaying {
                    display_data: display,
                    source: NowPlayingDataSource::Api,
                    os_matches_user: true, // API is always the authenticated user
                    api_last_updated: Some(timestamp),
                    os_last_updated: None,
                }
            }
            None => HybridNowPlaying {
                display_data: OsNowPlaying::default(),
                source: NowPlayingDataSource::None,
                os_matches_user: false,
                api_last_updated: Some(timestamp),
                os_last_updated: None,
            },
        }
    }

    /// Verify that OS now playing data matches the authenticated Spotify user
    async fn verify_os_matches_user(
        &self,
        os_data: &Option<OsNowPlaying>,
        settings: &AppSettings,
    ) -> bool {
        // If verification is disabled, assume it matches
        if !settings.verify_same_user {
            return true;
        }

        // If no OS data, it can't match
        let os = match os_data {
            Some(os) => os,
            None => return false,
        };

        // If it's not from Spotify, it doesn't match
        if !os.is_spotify() {
            return false;
        }

        // For now, we assume if Spotify is the source on the same machine,
        // it's likely the same user. A more robust check would involve
        // comparing track URIs with the API.
        //
        // Future enhancement: compare os.spotify_uri with API track URI
        // or check if the track appears in the user's recently played.
        true
    }
}
