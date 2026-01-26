//! Spotify module for the desktop app
//!
//! This module provides:
//! - Spotify API client with OAuth PKCE authentication
//! - Type definitions matching the Spotify Web API
//! - OS-level now playing integration
//! - OS-level playback control (AppleScript on macOS)

pub mod client;
pub mod os_now_playing;
pub mod types;

// Re-export commonly used items
pub use client::{SpotifyClient, SpotifyError};
pub use os_now_playing::{create_now_playing_provider, NowPlayingProvider};
pub use types::*;

// Re-export OS-level playback control functions
pub use os_now_playing::{
    is_spotify_app_running, os_control_next_track, os_control_pause, os_control_play,
    os_control_play_pause, os_control_previous_track, os_control_seek, os_control_set_repeat,
    os_control_set_shuffle, os_control_set_volume,
};
