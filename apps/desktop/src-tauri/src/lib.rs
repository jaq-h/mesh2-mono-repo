//! Mesh Desktop - Tauri application library
//!
//! This module provides all Tauri commands for Spotify integration,
//! including OAuth authentication, playback control, and OS-level
//! now playing information.

use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::RwLock;

mod spotify;

use spotify::{
    create_now_playing_provider, is_spotify_app_running, os_control_next_track, os_control_pause,
    os_control_play, os_control_play_pause, os_control_previous_track, os_control_seek,
    os_control_set_repeat, os_control_set_shuffle, os_control_set_volume, AppSettings,
    AuthenticatedUser, CurrentlyPlaying, HybridNowPlaying, NowPlayingProvider, NowPlayingSource,
    OsNowPlaying, PlayOptions, PlaybackState, PollingInterval, RepeatMode, SpotifyClient,
    SpotifyDevice, SpotifyError, SpotifyUser,
};

// =============================================================================
// Application State
// =============================================================================

/// Shared application state managed by Tauri
pub struct AppState {
    /// Spotify API client
    spotify: SpotifyClient,
    /// OS-level now playing provider
    now_playing_provider: Arc<dyn NowPlayingProvider>,
}

impl AppState {
    fn new(client_id: String) -> Self {
        Self {
            spotify: SpotifyClient::new(client_id),
            now_playing_provider: Arc::from(create_now_playing_provider()),
        }
    }
}

// =============================================================================
// Error handling for Tauri commands
// =============================================================================

/// Convert SpotifyError to a string for Tauri command results
impl From<SpotifyError> for String {
    fn from(error: SpotifyError) -> Self {
        error.to_string()
    }
}

// =============================================================================
// Authentication Commands
// =============================================================================

/// Start the OAuth authentication flow
/// Opens the browser and waits for the callback
#[tauri::command]
async fn start_auth(state: State<'_, Arc<RwLock<AppState>>>) -> Result<AuthenticatedUser, String> {
    let state = state.read().await;
    state
        .spotify
        .authenticate()
        .await
        .map_err(|e| e.to_string())
}

/// Check if the user is authenticated
#[tauri::command]
async fn is_authenticated(state: State<'_, Arc<RwLock<AppState>>>) -> Result<bool, String> {
    let state = state.read().await;
    Ok(state.spotify.is_authenticated().await)
}

/// Try to restore authentication from stored tokens
/// This should be called on app startup before checking is_authenticated
#[tauri::command]
async fn try_restore_auth(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Option<AuthenticatedUser>, String> {
    let state = state.read().await;
    state
        .spotify
        .try_restore_auth()
        .await
        .map_err(|e| e.to_string())
}

/// Logout and clear all stored credentials
#[tauri::command]
async fn logout(state: State<'_, Arc<RwLock<AppState>>>) -> Result<(), String> {
    let state = state.read().await;
    state.spotify.logout().await;
    Ok(())
}

/// Get the current user's profile
#[tauri::command]
async fn get_user_profile(state: State<'_, Arc<RwLock<AppState>>>) -> Result<SpotifyUser, String> {
    let state = state.read().await;
    state
        .spotify
        .get_user_profile()
        .await
        .map_err(|e| e.to_string())
}

/// Refresh the access token
#[tauri::command]
async fn refresh_token(state: State<'_, Arc<RwLock<AppState>>>) -> Result<(), String> {
    let state = state.read().await;
    state
        .spotify
        .refresh_token()
        .await
        .map_err(|e| e.to_string())
}

// =============================================================================
// Playback State Commands
// =============================================================================

/// Get the current playback state
#[tauri::command]
async fn get_playback_state(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Option<PlaybackState>, String> {
    let state = state.read().await;
    state
        .spotify
        .get_playback_state()
        .await
        .map_err(|e| e.to_string())
}

/// Get the currently playing track
#[tauri::command]
async fn get_currently_playing(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Option<CurrentlyPlaying>, String> {
    let state = state.read().await;
    state
        .spotify
        .get_currently_playing()
        .await
        .map_err(|e| e.to_string())
}

// =============================================================================
// Playback Control Commands
// =============================================================================

/// Start or resume playback
#[tauri::command]
async fn play(
    state: State<'_, Arc<RwLock<AppState>>>,
    device_id: Option<String>,
    context_uri: Option<String>,
    uris: Option<Vec<String>>,
    position_ms: Option<i64>,
) -> Result<(), String> {
    let state = state.read().await;

    let options = if device_id.is_some()
        || context_uri.is_some()
        || uris.is_some()
        || position_ms.is_some()
    {
        Some(PlayOptions {
            device_id,
            context_uri,
            uris,
            offset: None,
            position_ms,
        })
    } else {
        None
    };

    state.spotify.play(options).await.map_err(|e| e.to_string())
}

/// Pause playback
#[tauri::command]
async fn pause(
    state: State<'_, Arc<RwLock<AppState>>>,
    device_id: Option<String>,
) -> Result<(), String> {
    let state = state.read().await;
    state
        .spotify
        .pause(device_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Skip to next track
#[tauri::command]
async fn next_track(
    state: State<'_, Arc<RwLock<AppState>>>,
    device_id: Option<String>,
) -> Result<(), String> {
    let state = state.read().await;
    state
        .spotify
        .next_track(device_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Skip to previous track
#[tauri::command]
async fn previous_track(
    state: State<'_, Arc<RwLock<AppState>>>,
    device_id: Option<String>,
) -> Result<(), String> {
    let state = state.read().await;
    state
        .spotify
        .previous_track(device_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Seek to position in current track
#[tauri::command]
async fn seek(
    state: State<'_, Arc<RwLock<AppState>>>,
    position_ms: i64,
    device_id: Option<String>,
) -> Result<(), String> {
    let state = state.read().await;
    state
        .spotify
        .seek(position_ms, device_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Set playback volume
#[tauri::command]
async fn set_volume(
    state: State<'_, Arc<RwLock<AppState>>>,
    volume_percent: i32,
    device_id: Option<String>,
) -> Result<(), String> {
    let state = state.read().await;
    state
        .spotify
        .set_volume(volume_percent, device_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Set shuffle state
#[tauri::command]
async fn set_shuffle(
    state: State<'_, Arc<RwLock<AppState>>>,
    shuffle: bool,
    device_id: Option<String>,
) -> Result<(), String> {
    let state = state.read().await;
    state
        .spotify
        .set_shuffle(shuffle, device_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Set repeat mode
#[tauri::command]
async fn set_repeat(
    state: State<'_, Arc<RwLock<AppState>>>,
    repeat_state: String,
    device_id: Option<String>,
) -> Result<(), String> {
    let state = state.read().await;

    let mode = match repeat_state.as_str() {
        "off" => RepeatMode::Off,
        "context" => RepeatMode::Context,
        "track" => RepeatMode::Track,
        _ => return Err(format!("Invalid repeat mode: {}", repeat_state)),
    };

    state
        .spotify
        .set_repeat(mode, device_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

// =============================================================================
// Device Commands
// =============================================================================

/// Get available devices
#[tauri::command]
async fn get_devices(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Vec<SpotifyDevice>, String> {
    let state = state.read().await;
    state.spotify.get_devices().await.map_err(|e| e.to_string())
}

/// Transfer playback to a device
#[tauri::command]
async fn transfer_playback(
    state: State<'_, Arc<RwLock<AppState>>>,
    device_id: String,
    play: bool,
) -> Result<(), String> {
    let state = state.read().await;
    state
        .spotify
        .transfer_playback(&device_id, play)
        .await
        .map_err(|e| e.to_string())
}

// =============================================================================
// Queue Commands
// =============================================================================

/// Add a track to the queue
#[tauri::command]
async fn add_to_queue(
    state: State<'_, Arc<RwLock<AppState>>>,
    uri: String,
    device_id: Option<String>,
) -> Result<(), String> {
    let state = state.read().await;
    state
        .spotify
        .add_to_queue(&uri, device_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

// =============================================================================
// OS Now Playing Commands
// =============================================================================

/// Get now playing information from the OS (e.g., from Spotify native app)
#[tauri::command]
async fn get_os_now_playing(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Option<OsNowPlaying>, String> {
    let state = state.read().await;
    Ok(state.now_playing_provider.get_now_playing().await)
}

/// Start listening for OS now playing changes
#[tauri::command]
async fn start_os_now_playing_listener(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    let state = state.read().await;
    state
        .now_playing_provider
        .start_listening()
        .await
        .map_err(|e| e)
}

/// Stop listening for OS now playing changes
#[tauri::command]
async fn stop_os_now_playing_listener(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<(), String> {
    let state = state.read().await;
    state.now_playing_provider.stop_listening().await;
    Ok(())
}

// =============================================================================
// OS-Level Playback Control Commands (for OS-only mode)
// =============================================================================

/// Check if Spotify app is running on the system
#[tauri::command]
async fn check_spotify_running() -> Result<bool, String> {
    Ok(is_spotify_app_running())
}

/// Play/resume via OS-level controls (AppleScript on macOS)
#[tauri::command]
async fn os_play() -> Result<(), String> {
    tokio::task::spawn_blocking(os_control_play)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Pause via OS-level controls
#[tauri::command]
async fn os_pause() -> Result<(), String> {
    tokio::task::spawn_blocking(os_control_pause)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Toggle play/pause via OS-level controls
#[tauri::command]
async fn os_play_pause() -> Result<(), String> {
    tokio::task::spawn_blocking(os_control_play_pause)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Next track via OS-level controls
#[tauri::command]
async fn os_next_track() -> Result<(), String> {
    tokio::task::spawn_blocking(os_control_next_track)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Previous track via OS-level controls
#[tauri::command]
async fn os_previous_track() -> Result<(), String> {
    tokio::task::spawn_blocking(os_control_previous_track)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Seek to position via OS-level controls
#[tauri::command]
async fn os_seek(position_ms: i64) -> Result<(), String> {
    tokio::task::spawn_blocking(move || os_control_seek(position_ms))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Set volume via OS-level controls
#[tauri::command]
async fn os_set_volume(volume_percent: i32) -> Result<(), String> {
    tokio::task::spawn_blocking(move || os_control_set_volume(volume_percent))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Set shuffle state via OS-level controls
#[tauri::command]
async fn os_set_shuffle(shuffle: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || os_control_set_shuffle(shuffle))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Set repeat state via OS-level controls
/// Note: On macOS, only supports on/off (not track repeat)
#[tauri::command]
async fn os_set_repeat(enabled: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || os_control_set_repeat(enabled))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

// =============================================================================
// Settings Commands
// =============================================================================

/// Get current app settings
#[tauri::command]
async fn get_settings(state: State<'_, Arc<RwLock<AppState>>>) -> Result<AppSettings, String> {
    let state = state.read().await;
    Ok(state.spotify.get_settings().await)
}

/// Update app settings
#[tauri::command]
async fn update_settings(
    app: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
    settings: AppSettings,
) -> Result<(), String> {
    let state_guard = state.read().await;
    let settings_clone = settings.clone();
    state_guard
        .spotify
        .update_settings(settings)
        .await
        .map_err(|e| e.to_string())?;

    // Emit settings-changed event to notify frontend
    let _ = app.emit("settings-changed", settings_clone);
    Ok(())
}

/// Set the now playing data source
#[tauri::command]
async fn set_now_playing_source(
    app: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
    source: NowPlayingSource,
) -> Result<(), String> {
    let state_guard = state.read().await;
    state_guard
        .spotify
        .set_now_playing_source(source)
        .await
        .map_err(|e| e.to_string())?;

    // Emit settings-changed event to notify frontend
    let settings = state_guard.spotify.get_settings().await;
    let _ = app.emit("settings-changed", settings);
    Ok(())
}

/// Set the polling interval
#[tauri::command]
async fn set_polling_interval(
    app: AppHandle,
    state: State<'_, Arc<RwLock<AppState>>>,
    interval: PollingInterval,
) -> Result<(), String> {
    let state_guard = state.read().await;
    state_guard
        .spotify
        .set_polling_interval(interval)
        .await
        .map_err(|e| e.to_string())?;

    // Emit settings-changed event to notify frontend
    let settings = state_guard.spotify.get_settings().await;
    let _ = app.emit("settings-changed", settings);
    Ok(())
}

// =============================================================================
// Hybrid Now Playing Commands
// =============================================================================

/// Get hybrid now playing data (combines OS and API based on settings)
#[tauri::command]
async fn get_hybrid_now_playing(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<HybridNowPlaying, String> {
    let state = state.read().await;
    state
        .spotify
        .get_hybrid_now_playing(state.now_playing_provider.as_ref())
        .await
        .map_err(|e| e.to_string())
}

/// Get the recommended polling interval in milliseconds (or null if disabled)
#[tauri::command]
async fn get_polling_interval_ms(
    state: State<'_, Arc<RwLock<AppState>>>,
) -> Result<Option<u64>, String> {
    let state = state.read().await;
    let settings = state.spotify.get_settings().await;
    Ok(settings.polling_interval.as_millis())
}

// =============================================================================
// Application Entry Point
// =============================================================================

/// Get the Spotify client ID from environment or use a default for development
fn get_client_id() -> String {
    std::env::var("SPOTIFY_CLIENT_ID")
        .or_else(|_| std::env::var("VITE_SPOTIFY_CLIENT_ID"))
        .unwrap_or_else(|_| {
            // Fallback to the client ID used in the backend
            // In production, this should be set via environment variable
            "4ffe11d5bc884fcdbe93a209e742e51c".to_string()
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize application state
            let client_id = get_client_id();
            log::info!(
                "Initializing Mesh Desktop with Spotify client ID: {}...",
                &client_id[..8]
            );

            let app_state = Arc::new(RwLock::new(AppState::new(client_id)));

            // Manage the state with Tauri
            // Note: Authentication restoration is now handled by the frontend
            // calling try_restore_auth on startup to avoid race conditions
            app.manage(app_state);

            // Get the main window and set focus
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Authentication
            start_auth,
            is_authenticated,
            try_restore_auth,
            logout,
            get_user_profile,
            refresh_token,
            // Playback state
            get_playback_state,
            get_currently_playing,
            // Playback controls (API-based)
            play,
            pause,
            next_track,
            previous_track,
            seek,
            set_volume,
            set_shuffle,
            set_repeat,
            // Devices
            get_devices,
            transfer_playback,
            // Queue
            add_to_queue,
            // OS Now Playing
            get_os_now_playing,
            start_os_now_playing_listener,
            stop_os_now_playing_listener,
            // OS-level Playback Controls (for OS-only mode)
            check_spotify_running,
            os_play,
            os_pause,
            os_play_pause,
            os_next_track,
            os_previous_track,
            os_seek,
            os_set_volume,
            os_set_shuffle,
            os_set_repeat,
            // Settings
            get_settings,
            update_settings,
            set_now_playing_source,
            set_polling_interval,
            // Hybrid Now Playing
            get_hybrid_now_playing,
            get_polling_interval_ms,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mesh Desktop application");
}
