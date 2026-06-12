// =============================================================================
// TauriSpotifyService - Desktop implementation of SpotifyService using Tauri IPC
// =============================================================================

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  SpotifyService,
  AuthenticatedUser,
  SpotifyUser,
  PlaybackState,
  CurrentlyPlaying,
  SpotifyDevice,
  RepeatMode,
  PlayOptions,
} from "@mesh/spotify-api";

// =============================================================================
// Types for Tauri Commands
// =============================================================================

/**
 * Data source for now playing information
 */
export type NowPlayingSource = "api_only" | "os_only" | "hybrid";

/**
 * Polling interval presets
 */
export type PollingInterval =
  | "disabled"
  | "low"
  | "medium"
  | "high"
  | { custom: number };

/**
 * Application settings
 */
export interface AppSettings {
  now_playing_source: NowPlayingSource;
  polling_interval: PollingInterval;
  verify_same_user: boolean;
  spotify_user_id?: string;
}

/**
 * Source of the currently displayed now playing data
 */
export type NowPlayingDataSource = "none" | "api" | "os";

/**
 * OS-level now playing information
 */
export interface OsNowPlaying {
  title?: string;
  artist?: string;
  album?: string;
  artwork_url?: string;
  duration_ms?: number;
  position_ms?: number;
  is_playing: boolean;
  app_name?: string;
  app_bundle_id?: string;
  spotify_uri?: string;
}

/**
 * Hybrid now playing state - combines API and OS data
 */
export interface HybridNowPlaying extends OsNowPlaying {
  source: NowPlayingDataSource;
  os_matches_user: boolean;
  api_last_updated?: number;
  os_last_updated?: number;
}

/**
 * Playback state as returned by Tauri backend
 */
interface TauriPlaybackState {
  device?: SpotifyDevice | null;
  repeat_state?: RepeatMode;
  shuffle_state?: boolean;
  context?: {
    type: string;
    href: string;
    external_urls: { spotify: string };
    uri: string;
  } | null;
  timestamp?: number;
  progress_ms?: number | null;
  is_playing?: boolean;
  item?: SpotifyTrack | null;
  currently_playing_type?: "track" | "episode" | "ad" | "unknown";
  actions?: {
    disallows: Record<string, boolean>;
  };
}

interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  href: string;
  duration_ms: number;
  artists: Array<{
    id: string;
    name: string;
    uri: string;
    href: string;
    external_urls: { spotify: string };
  }>;
  album: {
    id: string;
    name: string;
    uri: string;
    href: string;
    images: Array<{ url: string; height: number | null; width: number | null }>;
    release_date: string;
    artists: Array<{
      id: string;
      name: string;
      uri: string;
      href: string;
      external_urls: { spotify: string };
    }>;
    external_urls: { spotify: string };
  };
  external_urls: { spotify: string };
}

// =============================================================================
// Default settings (used before settings are loaded)
// =============================================================================

const DEFAULT_SETTINGS: AppSettings = {
  now_playing_source: "api_only",
  polling_interval: "high",
  verify_same_user: true,
};

// =============================================================================
// TauriSpotifyService Implementation
// =============================================================================

export class TauriSpotifyService implements SpotifyService {
  private eventListeners: UnlistenFn[] = [];
  private cachedSettings: AppSettings = DEFAULT_SETTINGS;
  private _settingsLoaded: boolean = false;
  private lastKnownDevice: SpotifyDevice | null = null;

  constructor() {
    // Setup event listeners for Tauri events
    this.setupEventListeners();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async setupEventListeners(): Promise<void> {
    try {
      // Listen for auth success events
      const unlistenAuth = await listen<SpotifyUser>("auth-success", () => {
        // Load settings after auth
        this.loadSettingsInBackground();
      });
      this.eventListeners.push(unlistenAuth);

      // Listen for auth restored events
      const unlistenRestored = await listen<SpotifyUser>(
        "auth-restored",
        () => {
          // Load settings after auth restore
          this.loadSettingsInBackground();
        },
      );
      this.eventListeners.push(unlistenRestored);

      // Listen for settings changed events
      const unlistenSettings = await listen<AppSettings>(
        "settings-changed",
        (event) => {
          this.cachedSettings = event.payload;
          this._settingsLoaded = true;
        },
      );
      this.eventListeners.push(unlistenSettings);
    } catch (error) {
      console.error("Failed to setup Tauri event listeners:", error);
    }
  }

  /**
   * Load settings in background without blocking
   */
  private loadSettingsInBackground(): void {
    invoke<AppSettings>("get_settings")
      .then((settings) => {
        this.cachedSettings = settings;
        this._settingsLoaded = true;
      })
      .catch((err) => {
        console.warn("Failed to load settings:", err);
      });
  }

  /**
   * Cleanup event listeners when service is destroyed
   */
  public destroy(): void {
    this.eventListeners.forEach((unlisten) => unlisten());
    this.eventListeners = [];
  }

  /**
   * Convert OS now playing data to PlaybackState format
   */
  private osDataToPlaybackState(os: OsNowPlaying): PlaybackState | null {
    if (!os.is_playing && !os.title) {
      return null;
    }

    return {
      device: this.lastKnownDevice,
      repeat_state: "off" as RepeatMode,
      shuffle_state: false,
      context: null,
      timestamp: Date.now(),
      progress_ms: os.position_ms ?? null,
      is_playing: os.is_playing,
      item: os.title
        ? {
            id: os.spotify_uri?.split(":").pop() || `os-${Date.now()}`,
            name: os.title,
            uri: os.spotify_uri || "",
            href: "",
            duration_ms: os.duration_ms || 0,
            artists: os.artist
              ? [
                  {
                    id: "",
                    name: os.artist,
                    uri: "",
                    href: "",
                    external_urls: { spotify: "" },
                  },
                ]
              : [],
            album: {
              id: "",
              name: os.album || "",
              uri: "",
              href: "",
              images: os.artwork_url
                ? [{ url: os.artwork_url, height: 300, width: 300 }]
                : [],
              release_date: "",
              artists: [],
              external_urls: { spotify: "" },
            },
            external_urls: { spotify: "" },
          }
        : null,
      currently_playing_type: "track",
      actions: { disallows: {} },
    } as PlaybackState;
  }

  // ===========================================================================
  // Settings Management
  // ===========================================================================

  /**
   * Get current app settings (uses cache, doesn't block)
   */
  async getSettings(): Promise<AppSettings> {
    // Return cached settings immediately
    // Settings are loaded in background after auth
    return this.cachedSettings;
  }

  /**
   * Force reload settings from backend
   */
  async reloadSettings(): Promise<AppSettings> {
    try {
      const settings = await invoke<AppSettings>("get_settings");
      this.cachedSettings = settings;
      this._settingsLoaded = true;
      return settings;
    } catch (error) {
      console.error("Failed to reload settings:", error);
      return this.cachedSettings;
    }
  }

  /**
   * Update app settings
   */
  async updateSettings(settings: AppSettings): Promise<void> {
    await invoke("update_settings", { settings });
    this.cachedSettings = settings;
    this._settingsLoaded = true;
  }

  /**
   * Set the now playing data source
   */
  async setNowPlayingSource(source: NowPlayingSource): Promise<void> {
    await invoke("set_now_playing_source", { source });
    this.cachedSettings = {
      ...this.cachedSettings,
      now_playing_source: source,
    };
  }

  /**
   * Set the polling interval
   */
  async setPollingInterval(interval: PollingInterval): Promise<void> {
    await invoke("set_polling_interval", { interval });
    this.cachedSettings = {
      ...this.cachedSettings,
      polling_interval: interval,
    };
  }

  /**
   * Get the recommended polling interval in milliseconds
   * Returns null if polling is disabled
   */
  async getPollingIntervalMs(): Promise<number | null> {
    return invoke<number | null>("get_polling_interval_ms");
  }

  // ===========================================================================
  // Hybrid Now Playing
  // ===========================================================================

  /**
   * Get hybrid now playing data based on current settings
   * This intelligently combines OS-level data with API data
   */
  async getHybridNowPlaying(): Promise<HybridNowPlaying> {
    return invoke<HybridNowPlaying>("get_hybrid_now_playing");
  }

  /**
   * Get now playing information from the OS (e.g., from Spotify native app)
   * This NEVER calls the Spotify Web API
   */
  async getOsNowPlaying(): Promise<OsNowPlaying | null> {
    return invoke<OsNowPlaying | null>("get_os_now_playing");
  }

  /**
   * Start listening for OS now playing changes
   */
  async startOsNowPlayingListener(): Promise<void> {
    await invoke("start_os_now_playing_listener");
  }

  /**
   * Stop listening for OS now playing changes
   */
  async stopOsNowPlayingListener(): Promise<void> {
    await invoke("stop_os_now_playing_listener");
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  async login(): Promise<AuthenticatedUser> {
    try {
      const user = await invoke<AuthenticatedUser>("start_auth");
      // Load settings after successful login
      this.loadSettingsInBackground();
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Login failed: ${message}`);
    }
  }

  /**
   * Try to restore authentication from stored refresh tokens
   * This should be called on app startup to avoid re-authentication
   * @returns The authenticated user if restoration succeeded, null otherwise
   */
  async tryRestoreAuth(): Promise<AuthenticatedUser | null> {
    try {
      const user = await invoke<AuthenticatedUser | null>("try_restore_auth");
      if (user) {
        console.log(
          "Authentication restored for user:",
          user.display_name || user.id,
        );
        // Load settings after successful restore
        this.loadSettingsInBackground();
      }
      return user;
    } catch (error) {
      console.error("Failed to restore authentication:", error);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await invoke("logout");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const result = await invoke<boolean>("is_authenticated");
      if (result && !this._settingsLoaded) {
        this.loadSettingsInBackground();
      }
      return result;
    } catch (error) {
      console.error("isAuthenticated error:", error);
      return false;
    }
  }

  async getCurrentUser(): Promise<SpotifyUser> {
    try {
      const user = await invoke<SpotifyUser>("get_user_profile");
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get user profile: ${message}`);
    }
  }

  async refreshToken(): Promise<boolean> {
    try {
      await invoke("refresh_token");
      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      return false;
    }
  }

  // ===========================================================================
  // Playback State
  // ===========================================================================

  async getPlaybackState(): Promise<PlaybackState | null> {
    try {
      const source = this.cachedSettings.now_playing_source;

      // OS-ONLY MODE: Never call Spotify API, only use local OS data
      if (source === "os_only") {
        const osData = await this.getOsNowPlaying();
        if (!osData) {
          return null;
        }
        // Diagnostic fetch for network console visibility
        fetch(`/_mesh/getPlaybackState?source=local&mode=os_only`, {
          method: "GET",
        }).catch(() => {});
        return this.osDataToPlaybackState(osData);
      }

      // HYBRID MODE: Try OS first, fall back to API
      if (source === "hybrid") {
        const osData = await this.getOsNowPlaying();
        // If OS shows Spotify is playing, use that data
        if (osData && osData.is_playing && osData.app_name === "Spotify") {
          // Diagnostic fetch for network console visibility
          fetch(`/_mesh/getPlaybackState?source=local&mode=hybrid_os`, {
            method: "GET",
          }).catch(() => {});
          return this.osDataToPlaybackState(osData);
        }
        // Otherwise fall through to API
      }

      // API-ONLY MODE or HYBRID fallback: Use Spotify Web API
      const state = await invoke<TauriPlaybackState | null>(
        "get_playback_state",
      );

      // Diagnostic fetch for network console visibility
      // fetch(
      //   `/_mesh/getPlaybackState?source=api&mode=${source === "hybrid" ? "hybrid_api_fallback" : "api_only"}`,
      //   { method: "GET" },
      // ).catch(() => {});

      if (!state) {
        return null;
      }

      if (state.device) {
        this.lastKnownDevice = state.device;
      }

      // Transform to standard PlaybackState format
      return {
        device: state.device || null,
        repeat_state: state.repeat_state || "off",
        shuffle_state: state.shuffle_state || false,
        context: state.context || null,
        timestamp: state.timestamp || Date.now(),
        progress_ms: state.progress_ms ?? null,
        is_playing: state.is_playing || false,
        item: state.item || null,
        currently_playing_type: state.currently_playing_type || "unknown",
        actions: state.actions || { disallows: {} },
      } as PlaybackState;
    } catch (error) {
      console.error("getPlaybackState error:", error);
      return null;
    }
  }

  async getCurrentlyPlaying(): Promise<CurrentlyPlaying | null> {
    try {
      const source = this.cachedSettings.now_playing_source;

      // OS-ONLY MODE: Never call Spotify API
      if (source === "os_only") {
        const osData = await this.getOsNowPlaying();
        if (!osData || (!osData.is_playing && !osData.title)) {
          return null;
        }
        const playbackState = this.osDataToPlaybackState(osData);
        if (!playbackState) return null;
        return {
          is_playing: playbackState.is_playing,
          progress_ms: playbackState.progress_ms,
          item: playbackState.item,
          currently_playing_type: playbackState.currently_playing_type,
        };
      }

      // API or HYBRID mode
      const playing = await invoke<CurrentlyPlaying | null>(
        "get_currently_playing",
      );
      return playing;
    } catch (error) {
      console.error("getCurrentlyPlaying error:", error);
      return null;
    }
  }

  // ===========================================================================
  // Playback Controls (always use API)
  // ===========================================================================

  async play(options?: PlayOptions): Promise<void> {
    try {
      await invoke("play", {
        deviceId: options?.deviceId || null,
        contextUri: options?.contextUri || null,
        uris: options?.uris || null,
        offset: options?.offset || null,
        positionMs: options?.positionMs || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Play failed: ${message}`);
    }
  }

  async pause(deviceId?: string): Promise<void> {
    try {
      await invoke("pause", { deviceId: deviceId || null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Pause failed: ${message}`);
    }
  }

  async nextTrack(deviceId?: string): Promise<void> {
    try {
      await invoke("next_track", { deviceId: deviceId || null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Next track failed: ${message}`);
    }
  }

  async previousTrack(deviceId?: string): Promise<void> {
    try {
      await invoke("previous_track", { deviceId: deviceId || null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Previous track failed: ${message}`);
    }
  }

  async seek(positionMs: number, deviceId?: string): Promise<void> {
    try {
      await invoke("seek", {
        positionMs,
        deviceId: deviceId || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Seek failed: ${message}`);
    }
  }

  async setVolume(volumePercent: number, deviceId?: string): Promise<void> {
    try {
      const rounded = Math.round(volumePercent);
      await invoke("set_volume", {
        volumePercent: rounded,
        deviceId: deviceId || null,
      });
      if (this.lastKnownDevice) {
        this.lastKnownDevice = {
          ...this.lastKnownDevice,
          volume_percent: rounded,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Set volume failed: ${message}`);
    }
  }

  async setShuffle(state: boolean, deviceId?: string): Promise<void> {
    try {
      await invoke("set_shuffle", {
        shuffle: state,
        deviceId: deviceId || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Set shuffle failed: ${message}`);
    }
  }

  async setRepeat(state: RepeatMode, deviceId?: string): Promise<void> {
    try {
      await invoke("set_repeat", {
        repeatState: state,
        deviceId: deviceId || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Set repeat failed: ${message}`);
    }
  }

  // ===========================================================================
  // Devices (always use API)
  // ===========================================================================

  async getDevices(): Promise<SpotifyDevice[]> {
    try {
      const devices = await invoke<SpotifyDevice[]>("get_devices");
      const list = devices || [];
      const active = list.find((d) => d.is_active);
      if (active) {
        this.lastKnownDevice = active;
      }
      return list;
    } catch (error) {
      console.error("getDevices error:", error);
      return [];
    }
  }

  async transferPlayback(deviceId: string, play = true): Promise<void> {
    try {
      await invoke("transfer_playback", {
        deviceId,
        play,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Transfer playback failed: ${message}`);
    }
  }

  // ===========================================================================
  // Queue (always use API)
  // ===========================================================================

  async addToQueue(uri: string, deviceId?: string): Promise<void> {
    try {
      await invoke("add_to_queue", {
        uri,
        deviceId: deviceId || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Add to queue failed: ${message}`);
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a TauriSpotifyService instance
 */
export function createTauriSpotifyService(): TauriSpotifyService {
  return new TauriSpotifyService();
}

// =============================================================================
// Default Export
// =============================================================================

export default TauriSpotifyService;
