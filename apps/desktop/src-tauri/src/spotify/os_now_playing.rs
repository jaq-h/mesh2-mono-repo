//! OS-level Now Playing integration
//!
//! This module provides integration with the operating system's now playing
//! information. On macOS, this uses the MediaRemote private framework to get
//! the currently playing track from any media app (including Spotify).
//!
//! This allows the app to show what's playing even if the user is controlling
//! Spotify from the native app rather than through our API calls.

use super::types::OsNowPlaying;
use std::sync::Arc;
use tokio::sync::RwLock;

// =============================================================================
// Cross-platform trait
// =============================================================================

#[async_trait::async_trait]
pub trait NowPlayingProvider: Send + Sync {
    /// Get the current now playing information from the OS
    async fn get_now_playing(&self) -> Option<OsNowPlaying>;

    /// Start listening for now playing changes
    async fn start_listening(&self) -> Result<(), String>;

    /// Stop listening for now playing changes
    async fn stop_listening(&self);

    /// Check if we're currently listening
    #[allow(dead_code)]
    fn is_listening(&self) -> bool;
}

// =============================================================================
// macOS Implementation
// =============================================================================

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::process::Command;

    /// macOS Now Playing provider using MediaRemote framework via AppleScript
    ///
    /// Note: The MediaRemote framework is private and requires special entitlements.
    /// For a sandboxed app, we use AppleScript to query Spotify directly, which is
    /// more reliable and doesn't require special permissions.
    pub struct MacOsNowPlayingProvider {
        is_listening: Arc<RwLock<bool>>,
        cached_state: Arc<RwLock<Option<OsNowPlaying>>>,
    }

    impl MacOsNowPlayingProvider {
        pub fn new() -> Self {
            Self {
                is_listening: Arc::new(RwLock::new(false)),
                cached_state: Arc::new(RwLock::new(None)),
            }
        }

        /// Query Spotify directly via AppleScript
        fn query_spotify_applescript() -> Option<OsNowPlaying> {
            // Check if Spotify is running
            let running_check = Command::new("osascript")
                .args([
                    "-e",
                    r#"tell application "System Events" to (name of processes) contains "Spotify""#,
                ])
                .output()
                .ok()?;

            let is_running = String::from_utf8_lossy(&running_check.stdout)
                .trim()
                .to_lowercase()
                == "true";

            if !is_running {
                return None;
            }

            // Get player state from Spotify
            let script = r#"
                tell application "Spotify"
                    if player state is playing then
                        set trackName to name of current track
                        set artistName to artist of current track
                        set albumName to album of current track
                        set trackDuration to duration of current track
                        set trackPosition to player position
                        set artworkUrl to artwork url of current track
                        return trackName & "|||" & artistName & "|||" & albumName & "|||" & (trackDuration as string) & "|||" & (trackPosition as string) & "|||" & artworkUrl & "|||playing"
                    else if player state is paused then
                        set trackName to name of current track
                        set artistName to artist of current track
                        set albumName to album of current track
                        set trackDuration to duration of current track
                        set trackPosition to player position
                        set artworkUrl to artwork url of current track
                        return trackName & "|||" & artistName & "|||" & albumName & "|||" & (trackDuration as string) & "|||" & (trackPosition as string) & "|||" & artworkUrl & "|||paused"
                    else
                        return "|||||||stopped"
                    end if
                end tell
            "#;

            let output = Command::new("osascript")
                .args(["-e", script])
                .output()
                .ok()?;

            if !output.status.success() {
                log::debug!(
                    "AppleScript query failed: {:?}",
                    String::from_utf8_lossy(&output.stderr)
                );
                return None;
            }

            let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Self::parse_applescript_result(&result)
        }

        fn parse_applescript_result(result: &str) -> Option<OsNowPlaying> {
            let parts: Vec<&str> = result.split("|||").collect();

            if parts.len() < 7 {
                return None;
            }

            let state = parts[6];
            if state == "stopped" {
                return Some(OsNowPlaying {
                    is_playing: false,
                    ..Default::default()
                });
            }

            let title = if parts[0].is_empty() {
                None
            } else {
                Some(parts[0].to_string())
            };
            let artist = if parts[1].is_empty() {
                None
            } else {
                Some(parts[1].to_string())
            };
            let album = if parts[2].is_empty() {
                None
            } else {
                Some(parts[2].to_string())
            };

            // Duration is in milliseconds from Spotify
            let duration_ms = parts[3].parse::<f64>().ok().map(|d| d as i64);

            // Position is in seconds from AppleScript
            let position_ms = parts[4].parse::<f64>().ok().map(|p| (p * 1000.0) as i64);

            let artwork_url = if parts[5].is_empty() {
                None
            } else {
                Some(parts[5].to_string())
            };

            Some(OsNowPlaying {
                title,
                artist,
                album,
                artwork_url,
                duration_ms,
                position_ms,
                is_playing: state == "playing",
                app_name: Some("Spotify".to_string()),
                app_bundle_id: Some("com.spotify.client".to_string()),
                spotify_uri: None, // AppleScript doesn't provide the URI directly
            })
        }

        /// Query now playing using the `nowplaying-cli` if available
        /// This is a fallback that works with any media app
        #[allow(dead_code)]
        fn query_nowplaying_cli() -> Option<OsNowPlaying> {
            // Try to use nowplaying-cli if installed (brew install nowplaying-cli)
            let output = Command::new("nowplaying-cli")
                .args([
                    "get",
                    "title",
                    "artist",
                    "album",
                    "duration",
                    "elapsedTime",
                    "playbackRate",
                ])
                .output()
                .ok()?;

            if !output.status.success() {
                return None;
            }

            let result = String::from_utf8_lossy(&output.stdout);
            let lines: Vec<&str> = result.lines().collect();

            if lines.len() < 6 {
                return None;
            }

            let title = if lines[0].is_empty() || lines[0] == "null" {
                None
            } else {
                Some(lines[0].to_string())
            };
            let artist = if lines[1].is_empty() || lines[1] == "null" {
                None
            } else {
                Some(lines[1].to_string())
            };
            let album = if lines[2].is_empty() || lines[2] == "null" {
                None
            } else {
                Some(lines[2].to_string())
            };
            let duration_ms = lines[3].parse::<f64>().ok().map(|d| (d * 1000.0) as i64);
            let position_ms = lines[4].parse::<f64>().ok().map(|p| (p * 1000.0) as i64);
            let playback_rate: f64 = lines[5].parse().unwrap_or(0.0);

            Some(OsNowPlaying {
                title,
                artist,
                album,
                artwork_url: None, // nowplaying-cli doesn't provide artwork URL directly
                duration_ms,
                position_ms,
                is_playing: playback_rate > 0.0,
                app_name: None,
                app_bundle_id: None,
                spotify_uri: None,
            })
        }
    }

    #[async_trait::async_trait]
    impl NowPlayingProvider for MacOsNowPlayingProvider {
        async fn get_now_playing(&self) -> Option<OsNowPlaying> {
            // Run the blocking AppleScript query in a separate thread
            tokio::task::spawn_blocking(Self::query_spotify_applescript)
                .await
                .ok()
                .flatten()
        }

        async fn start_listening(&self) -> Result<(), String> {
            let mut listening = self.is_listening.write().await;
            if *listening {
                return Ok(());
            }

            *listening = true;

            // Start a background task to poll for changes
            let is_listening = self.is_listening.clone();
            let cached_state = self.cached_state.clone();

            tokio::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(2));

                loop {
                    interval.tick().await;

                    if !*is_listening.read().await {
                        break;
                    }

                    // Query current state
                    if let Ok(Some(state)) =
                        tokio::task::spawn_blocking(Self::query_spotify_applescript).await
                    {
                        *cached_state.write().await = Some(state);
                    }
                }
            });

            Ok(())
        }

        async fn stop_listening(&self) {
            *self.is_listening.write().await = false;
        }

        fn is_listening(&self) -> bool {
            // This is a sync check, so we use try_read
            self.is_listening.try_read().map(|g| *g).unwrap_or(false)
        }
    }

    impl Default for MacOsNowPlayingProvider {
        fn default() -> Self {
            Self::new()
        }
    }

    // =========================================================================
    // Module-level OS control functions (for use by cross-platform wrappers)
    // =========================================================================

    /// Helper to run AppleScript commands
    fn run_applescript(script: &str) -> Result<(), String> {
        // First check if Spotify is running
        if !is_spotify_running() {
            return Err("Spotify is not running".to_string());
        }

        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| format!("Failed to execute AppleScript: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("AppleScript error: {}", stderr));
        }

        Ok(())
    }

    /// Check if Spotify is running
    pub fn is_spotify_running() -> bool {
        let output = Command::new("osascript")
            .args([
                "-e",
                r#"tell application "System Events" to (name of processes) contains "Spotify""#,
            ])
            .output()
            .ok();

        output
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_lowercase() == "true")
            .unwrap_or(false)
    }

    /// Control Spotify playback via AppleScript - Play/Resume
    pub fn os_play() -> Result<(), String> {
        let script = r#"tell application "Spotify" to play"#;
        run_applescript(script)
    }

    /// Control Spotify playback via AppleScript - Pause
    pub fn os_pause() -> Result<(), String> {
        let script = r#"tell application "Spotify" to pause"#;
        run_applescript(script)
    }

    /// Control Spotify playback via AppleScript - Toggle play/pause
    pub fn os_play_pause() -> Result<(), String> {
        let script = r#"tell application "Spotify" to playpause"#;
        run_applescript(script)
    }

    /// Control Spotify playback via AppleScript - Next track
    pub fn os_next_track() -> Result<(), String> {
        let script = r#"tell application "Spotify" to next track"#;
        run_applescript(script)
    }

    /// Control Spotify playback via AppleScript - Previous track
    pub fn os_previous_track() -> Result<(), String> {
        let script = r#"tell application "Spotify" to previous track"#;
        run_applescript(script)
    }

    /// Control Spotify playback via AppleScript - Set volume (0-100)
    pub fn os_set_volume(volume_percent: i32) -> Result<(), String> {
        let volume = volume_percent.clamp(0, 100);
        let script = format!(
            r#"tell application "Spotify" to set sound volume to {}"#,
            volume
        );
        run_applescript(&script)
    }

    /// Control Spotify playback via AppleScript - Seek to position
    pub fn os_seek(position_seconds: f64) -> Result<(), String> {
        let script = format!(
            r#"tell application "Spotify" to set player position to {}"#,
            position_seconds
        );
        run_applescript(&script)
    }

    /// Control Spotify playback via AppleScript - Set shuffle state
    pub fn os_set_shuffle(enabled: bool) -> Result<(), String> {
        let state = if enabled { "true" } else { "false" };
        let script = format!(
            r#"tell application "Spotify" to set shuffling to {}"#,
            state
        );
        run_applescript(&script)
    }

    /// Control Spotify playback via AppleScript - Set repeat mode
    /// Note: Spotify's AppleScript only supports "repeating" (true/false), not track repeat
    pub fn os_set_repeat(enabled: bool) -> Result<(), String> {
        let state = if enabled { "true" } else { "false" };
        let script = format!(
            r#"tell application "Spotify" to set repeating to {}"#,
            state
        );
        run_applescript(&script)
    }

    /// Get current shuffle state
    #[allow(dead_code)]
    pub fn os_get_shuffle() -> Option<bool> {
        let script = r#"tell application "Spotify" to return shuffling"#;
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let result = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_lowercase();
        Some(result == "true")
    }

    /// Get current repeat state
    #[allow(dead_code)]
    pub fn os_get_repeat() -> Option<bool> {
        let script = r#"tell application "Spotify" to return repeating"#;
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let result = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_lowercase();
        Some(result == "true")
    }

    /// Get current volume
    #[allow(dead_code)]
    pub fn os_get_volume() -> Option<i32> {
        let script = r#"tell application "Spotify" to return sound volume"#;
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<i32>()
            .ok()
    }
}

// =============================================================================
// Windows Implementation (stub)
// =============================================================================

#[cfg(target_os = "windows")]
mod windows {
    use super::*;

    /// Windows Now Playing provider using GlobalSystemMediaTransportControlsSession
    pub struct WindowsNowPlayingProvider {
        is_listening: Arc<RwLock<bool>>,
    }

    impl WindowsNowPlayingProvider {
        pub fn new() -> Self {
            Self {
                is_listening: Arc::new(RwLock::new(false)),
            }
        }
    }

    #[async_trait::async_trait]
    impl NowPlayingProvider for WindowsNowPlayingProvider {
        async fn get_now_playing(&self) -> Option<OsNowPlaying> {
            // TODO: Implement Windows GSMTC integration
            // Use windows crate with Media_Control feature
            None
        }

        async fn start_listening(&self) -> Result<(), String> {
            *self.is_listening.write().await = true;
            // TODO: Set up media session change listener
            Ok(())
        }

        async fn stop_listening(&self) {
            *self.is_listening.write().await = false;
        }

        fn is_listening(&self) -> bool {
            self.is_listening.try_read().map(|g| *g).unwrap_or(false)
        }
    }

    impl Default for WindowsNowPlayingProvider {
        fn default() -> Self {
            Self::new()
        }
    }
}

// =============================================================================
// Linux Implementation (stub)
// =============================================================================

#[cfg(target_os = "linux")]
mod linux {
    use super::*;

    /// Linux Now Playing provider using MPRIS D-Bus interface
    pub struct LinuxNowPlayingProvider {
        is_listening: Arc<RwLock<bool>>,
    }

    impl LinuxNowPlayingProvider {
        pub fn new() -> Self {
            Self {
                is_listening: Arc::new(RwLock::new(false)),
            }
        }

        async fn query_mpris() -> Option<OsNowPlaying> {
            // TODO: Implement MPRIS D-Bus query using zbus
            // Look for org.mpris.MediaPlayer2.spotify
            None
        }
    }

    #[async_trait::async_trait]
    impl NowPlayingProvider for LinuxNowPlayingProvider {
        async fn get_now_playing(&self) -> Option<OsNowPlaying> {
            Self::query_mpris().await
        }

        async fn start_listening(&self) -> Result<(), String> {
            *self.is_listening.write().await = true;
            // TODO: Set up D-Bus signal listener for PropertiesChanged
            Ok(())
        }

        async fn stop_listening(&self) {
            *self.is_listening.write().await = false;
        }

        fn is_listening(&self) -> bool {
            self.is_listening.try_read().map(|g| *g).unwrap_or(false)
        }
    }

    impl Default for LinuxNowPlayingProvider {
        fn default() -> Self {
            Self::new()
        }
    }
}

// =============================================================================
// Platform-specific exports
// =============================================================================

#[cfg(target_os = "macos")]
pub use macos::{
    is_spotify_running as macos_is_spotify_running, os_next_track as macos_os_next_track,
    os_pause as macos_os_pause, os_play as macos_os_play, os_play_pause as macos_os_play_pause,
    os_previous_track as macos_os_previous_track, os_seek as macos_os_seek,
    os_set_repeat as macos_os_set_repeat, os_set_shuffle as macos_os_set_shuffle,
    os_set_volume as macos_os_set_volume,
};

#[cfg(target_os = "windows")]
pub use windows::WindowsNowPlayingProvider as PlatformNowPlayingProvider;

#[cfg(target_os = "linux")]
pub use linux::LinuxNowPlayingProvider as PlatformNowPlayingProvider;

// =============================================================================
// Factory function
// =============================================================================

/// Create a platform-specific now playing provider
// =============================================================================
// OS-level Playback Control Functions (cross-platform)
// =============================================================================

/// Play/resume via OS-level controls
pub fn os_control_play() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_os_play()
    }
    #[cfg(target_os = "windows")]
    {
        Err("OS playback control not yet implemented for Windows".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        Err("OS playback control not yet implemented for Linux".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("OS playback control not supported on this platform".to_string())
    }
}

/// Pause via OS-level controls
pub fn os_control_pause() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_os_pause()
    }
    #[cfg(target_os = "windows")]
    {
        Err("OS playback control not yet implemented for Windows".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        Err("OS playback control not yet implemented for Linux".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("OS playback control not supported on this platform".to_string())
    }
}

/// Toggle play/pause via OS-level controls
pub fn os_control_play_pause() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_os_play_pause()
    }
    #[cfg(target_os = "windows")]
    {
        Err("OS playback control not yet implemented for Windows".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        Err("OS playback control not yet implemented for Linux".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("OS playback control not supported on this platform".to_string())
    }
}

/// Next track via OS-level controls
pub fn os_control_next_track() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_os_next_track()
    }
    #[cfg(target_os = "windows")]
    {
        Err("OS playback control not yet implemented for Windows".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        Err("OS playback control not yet implemented for Linux".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("OS playback control not supported on this platform".to_string())
    }
}

/// Previous track via OS-level controls
pub fn os_control_previous_track() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_os_previous_track()
    }
    #[cfg(target_os = "windows")]
    {
        Err("OS playback control not yet implemented for Windows".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        Err("OS playback control not yet implemented for Linux".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("OS playback control not supported on this platform".to_string())
    }
}

/// Seek to position (in milliseconds) via OS-level controls
pub fn os_control_seek(position_ms: i64) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let position_seconds = position_ms as f64 / 1000.0;
        macos_os_seek(position_seconds)
    }
    #[cfg(target_os = "windows")]
    {
        let _ = position_ms;
        Err("OS playback control not yet implemented for Windows".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let _ = position_ms;
        Err("OS playback control not yet implemented for Linux".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = position_ms;
        Err("OS playback control not supported on this platform".to_string())
    }
}

/// Set volume (0-100) via OS-level controls
pub fn os_control_set_volume(volume_percent: i32) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_os_set_volume(volume_percent)
    }
    #[cfg(target_os = "windows")]
    {
        let _ = volume_percent;
        Err("OS playback control not yet implemented for Windows".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let _ = volume_percent;
        Err("OS playback control not yet implemented for Linux".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = volume_percent;
        Err("OS playback control not supported on this platform".to_string())
    }
}

/// Set shuffle state via OS-level controls
pub fn os_control_set_shuffle(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_os_set_shuffle(enabled)
    }
    #[cfg(target_os = "windows")]
    {
        let _ = enabled;
        Err("OS playback control not yet implemented for Windows".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let _ = enabled;
        Err("OS playback control not yet implemented for Linux".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = enabled;
        Err("OS playback control not supported on this platform".to_string())
    }
}

/// Set repeat state via OS-level controls
/// Note: On macOS, only supports on/off, not track repeat
pub fn os_control_set_repeat(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_os_set_repeat(enabled)
    }
    #[cfg(target_os = "windows")]
    {
        let _ = enabled;
        Err("OS playback control not yet implemented for Windows".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let _ = enabled;
        Err("OS playback control not yet implemented for Linux".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = enabled;
        Err("OS playback control not supported on this platform".to_string())
    }
}

/// Check if Spotify app is running
pub fn is_spotify_app_running() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_is_spotify_running()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

// =============================================================================
// Provider Factory
// =============================================================================

pub fn create_now_playing_provider() -> Box<dyn NowPlayingProvider> {
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacOsNowPlayingProvider::new())
    }
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsNowPlayingProvider::new())
    }
    #[cfg(target_os = "linux")]
    {
        Box::new(linux::LinuxNowPlayingProvider::new())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        // Fallback no-op provider
        Box::new(NoOpNowPlayingProvider)
    }
}

// =============================================================================
// No-op fallback provider
// =============================================================================

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
struct NoOpNowPlayingProvider;

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
#[async_trait::async_trait]
impl NowPlayingProvider for NoOpNowPlayingProvider {
    async fn get_now_playing(&self) -> Option<OsNowPlaying> {
        None
    }

    async fn start_listening(&self) -> Result<(), String> {
        Ok(())
    }

    async fn stop_listening(&self) {}

    fn is_listening(&self) -> bool {
        false
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_provider() {
        let provider = create_now_playing_provider();
        assert!(!provider.is_listening());
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn test_macos_provider() {
        let provider = macos::MacOsNowPlayingProvider::new();

        // This might return None if Spotify isn't running
        let now_playing = provider.get_now_playing().await;
        println!("Now playing: {:?}", now_playing);
    }
}
