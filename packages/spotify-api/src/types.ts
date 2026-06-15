// =============================================================================
// Shared Spotify API Types
// =============================================================================

/**
 * Spotify image object
 */
export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

/**
 * Spotify artist object
 */
export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
  href: string;
  external_urls: {
    spotify: string;
  };
}

/**
 * Spotify album object
 */
export interface SpotifyAlbum {
  id: string;
  name: string;
  uri: string;
  href: string;
  images: SpotifyImage[];
  release_date: string;
  artists: SpotifyArtist[];
  external_urls: {
    spotify: string;
  };
}

/**
 * Spotify track object
 */
export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  href: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  external_urls: {
    spotify: string;
  };
}

/**
 * Spotify device object
 */
export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
  supports_volume: boolean;
}

/**
 * Spotify playlist object
 */
export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  uri: string;
  href: string;
  images: SpotifyImage[];
  owner: {
    id: string;
    display_name: string;
  };
  tracks: {
    total: number;
    href: string;
  };
  public: boolean;
  collaborative: boolean;
}

// =============================================================================
// User Types
// =============================================================================

/**
 * User profile from Spotify
 */
export interface SpotifyUser {
  id: string;
  display_name: string | null;
  email?: string;
  images: SpotifyImage[];
  uri: string;
  href: string;
  external_urls: {
    spotify: string;
  };
  product?: string;
  country?: string;
}

/**
 * Authenticated user with tokens
 */
export interface AuthenticatedUser extends SpotifyUser {
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string;
}

// =============================================================================
// Playback Types
// =============================================================================

/**
 * Repeat mode options
 */
export type RepeatMode = "off" | "context" | "track";

/**
 * Current playback state
 */
export interface PlaybackState {
  device: SpotifyDevice | null;
  repeat_state: RepeatMode;
  shuffle_state: boolean;
  context: {
    type: string;
    href: string;
    external_urls: {
      spotify: string;
    };
    uri: string;
  } | null;
  timestamp: number;
  progress_ms: number | null;
  is_playing: boolean;
  item: SpotifyTrack | null;
  currently_playing_type: "track" | "episode" | "ad" | "unknown";
  actions: {
    disallows: {
      pausing?: boolean;
      resuming?: boolean;
      seeking?: boolean;
      skipping_prev?: boolean;
      skipping_next?: boolean;
      toggling_shuffle?: boolean;
      toggling_repeat_context?: boolean;
      toggling_repeat_track?: boolean;
    };
  };
}

/**
 * Currently playing response (subset of PlaybackState)
 */
export interface CurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number | null;
  item: SpotifyTrack | null;
  currently_playing_type: "track" | "episode" | "ad" | "unknown";
}

// =============================================================================
// Web Playback SDK Types (for browser)
// =============================================================================

export interface WebPlaybackTrack {
  uri: string;
  id: string;
  type: "track" | "episode" | "ad";
  media_type: "audio" | "video";
  name: string;
  is_playable: boolean;
  album: {
    uri: string;
    name: string;
    images: SpotifyImage[];
  };
  artists: Array<{
    uri: string;
    name: string;
  }>;
}

export interface WebPlaybackState {
  context: {
    uri: string | null;
    metadata: Record<string, unknown> | null;
  };
  disallows: {
    pausing?: boolean;
    peeking_next?: boolean;
    peeking_prev?: boolean;
    resuming?: boolean;
    seeking?: boolean;
    skipping_next?: boolean;
    skipping_prev?: boolean;
  };
  paused: boolean;
  position: number;
  repeat_mode: 0 | 1 | 2; // 0 = off, 1 = context, 2 = track
  shuffle: boolean;
  track_window: {
    current_track: WebPlaybackTrack;
    previous_tracks: WebPlaybackTrack[];
    next_tracks: WebPlaybackTrack[];
  };
  duration: number;
  timestamp: number;
}

export interface WebPlaybackPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, callback: (data: unknown) => void) => boolean;
  removeListener: (
    event: string,
    callback?: (data: unknown) => void,
  ) => boolean;
  getCurrentState: () => Promise<WebPlaybackState | null>;
  setName: (name: string) => Promise<void>;
  getVolume: () => Promise<number>;
  setVolume: (volume: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (position_ms: number) => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;
  activateElement: () => Promise<void>;
}

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Options for play command
 */
export interface PlayOptions {
  deviceId?: string;
  contextUri?: string;
  uris?: string[];
  offset?: { position: number } | { uri: string };
  positionMs?: number;
}

/**
 * Abstract Spotify Service Interface
 *
 * This interface defines the contract that both web and desktop
 * implementations must follow. The web version calls the Spotify API
 * directly, while the desktop version uses Tauri IPC to call Rust functions.
 */
export interface SpotifyService {
  // ===========================================================================
  // Authentication
  // ===========================================================================

  /**
   * Start the OAuth authentication flow
   * @returns Promise with user data after successful authentication
   */
  login(): Promise<AuthenticatedUser>;

  /**
   * Handle OAuth callback - exchange authorization code for tokens
   * This is used by web apps after redirect from Spotify
   * Desktop apps (Tauri) handle the full flow in login() instead
   * @param code - Authorization code from OAuth redirect
   * @param state - OAuth state param, validated against the stored value (CSRF guard)
   * @returns Promise with user data after successful token exchange
   */
  handleCallback?(code: string, state?: string): Promise<AuthenticatedUser>;

  /**
   * Log out and clear all stored credentials
   */
  logout(): Promise<void>;

  /**
   * Check if the user is currently authenticated
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Get the current user's profile
   */
  getCurrentUser(): Promise<SpotifyUser>;

  /**
   * Refresh the access token
   * @returns true if refresh was successful
   */
  refreshToken(): Promise<boolean>;

  // ===========================================================================
  // Playback State
  // ===========================================================================

  /**
   * Get the current playback state
   * @returns PlaybackState or null if nothing is playing
   */
  getPlaybackState(): Promise<PlaybackState | null>;

  /**
   * Get the currently playing track
   * @returns CurrentlyPlaying or null if nothing is playing
   */
  getCurrentlyPlaying(): Promise<CurrentlyPlaying | null>;

  // ===========================================================================
  // Playback Controls
  // ===========================================================================

  /**
   * Start or resume playback
   * @param options - Optional play options (device, context, etc.)
   */
  play(options?: PlayOptions): Promise<void>;

  /**
   * Pause playback
   * @param deviceId - Optional device ID
   */
  pause(deviceId?: string): Promise<void>;

  /**
   * Skip to next track
   * @param deviceId - Optional device ID
   */
  nextTrack(deviceId?: string): Promise<void>;

  /**
   * Skip to previous track
   * @param deviceId - Optional device ID
   */
  previousTrack(deviceId?: string): Promise<void>;

  /**
   * Seek to position in current track
   * @param positionMs - Position in milliseconds
   * @param deviceId - Optional device ID
   */
  seek(positionMs: number, deviceId?: string): Promise<void>;

  /**
   * Set playback volume
   * @param volumePercent - Volume percentage (0-100)
   * @param deviceId - Optional device ID
   */
  setVolume(volumePercent: number, deviceId?: string): Promise<void>;

  /**
   * Set shuffle state
   * @param state - Shuffle on/off
   * @param deviceId - Optional device ID
   */
  setShuffle(state: boolean, deviceId?: string): Promise<void>;

  /**
   * Set repeat mode
   * @param state - Repeat mode ('off', 'context', 'track')
   * @param deviceId - Optional device ID
   */
  setRepeat(state: RepeatMode, deviceId?: string): Promise<void>;

  // ===========================================================================
  // Devices
  // ===========================================================================

  /**
   * Get available playback devices
   */
  getDevices(): Promise<SpotifyDevice[]>;

  /**
   * Transfer playback to a specific device
   * @param deviceId - Target device ID
   * @param play - Whether to start playing immediately
   */
  transferPlayback(deviceId: string, play?: boolean): Promise<void>;

  // ===========================================================================
  // Queue
  // ===========================================================================

  /**
   * Add a track to the queue
   * @param uri - Spotify URI of the track
   * @param deviceId - Optional device ID
   */
  addToQueue(uri: string, deviceId?: string): Promise<void>;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * API error response
 */
export interface ApiError {
  error: string;
  message?: string;
  status?: number;
}

/**
 * Result type for API operations
 */
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

// =============================================================================
// Event Types (for real-time updates)
// =============================================================================

/**
 * Playback state change event
 */
export interface PlaybackChangeEvent {
  type: "playback_change";
  state: PlaybackState | null;
}

/**
 * Device change event
 */
export interface DeviceChangeEvent {
  type: "device_change";
  devices: SpotifyDevice[];
}

/**
 * Authentication state change event
 */
export interface AuthChangeEvent {
  type: "auth_change";
  isAuthenticated: boolean;
  user: SpotifyUser | null;
}

/**
 * Union of all event types
 */
export type SpotifyEvent =
  | PlaybackChangeEvent
  | DeviceChangeEvent
  | AuthChangeEvent;

/**
 * Event listener callback
 */
export type SpotifyEventListener = (event: SpotifyEvent) => void;

// =============================================================================
// Global Window Extension for Spotify SDK
// =============================================================================

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => WebPlaybackPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export {};
