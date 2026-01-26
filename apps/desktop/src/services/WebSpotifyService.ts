// =============================================================================
// WebSpotifyService - Browser implementation of SpotifyService
// =============================================================================

import {
  type SpotifyService,
  type AuthenticatedUser,
  type SpotifyUser,
  type PlaybackState,
  type CurrentlyPlaying,
  type SpotifyDevice,
  type RepeatMode,
  type PlayOptions,
  SPOTIFY_API_BASE,
} from "@mesh/spotify-api";

// =============================================================================
// Configuration
// =============================================================================

const STORAGE_KEYS = {
  ACCESS_TOKEN: "mesh_access_token",
  REFRESH_TOKEN: "mesh_refresh_token",
  TOKEN_EXPIRES_AT: "mesh_token_expires_at",
  USER: "mesh_user",
  CODE_VERIFIER: "mesh_code_verifier",
  AUTH_STATE: "mesh_auth_state",
} as const;

// =============================================================================
// Types
// =============================================================================

interface PKCEAuthResponse {
  auth_url: string;
  code_verifier: string;
  code_challenge: string;
  state: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

// =============================================================================
// Storage Helpers
// =============================================================================

const storage = {
  get: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      console.warn("Failed to save to localStorage:", key);
    }
  },

  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  },

  getJson: <T>(key: string): T | null => {
    const value = storage.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  },

  setJson: (key: string, value: unknown): void => {
    storage.set(key, JSON.stringify(value));
  },
};

// =============================================================================
// WebSpotifyService Implementation
// =============================================================================

export class WebSpotifyService implements SpotifyService {
  private apiBaseUrl: string;
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;
  private tokenExpiresAt: number | null = null;
  private user: SpotifyUser | null = null;

  constructor(apiBaseUrl: string = "") {
    this.apiBaseUrl = apiBaseUrl;
    this.loadFromStorage();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private loadFromStorage(): void {
    this.accessToken = storage.get(STORAGE_KEYS.ACCESS_TOKEN);
    this.refreshTokenValue = storage.get(STORAGE_KEYS.REFRESH_TOKEN);
    const expiresAt = storage.get(STORAGE_KEYS.TOKEN_EXPIRES_AT);
    this.tokenExpiresAt = expiresAt ? parseInt(expiresAt, 10) : null;
    this.user = storage.getJson<SpotifyUser>(STORAGE_KEYS.USER);
  }

  private saveToStorage(user: AuthenticatedUser): void {
    storage.set(STORAGE_KEYS.ACCESS_TOKEN, user.access_token);
    if (user.refresh_token) {
      storage.set(STORAGE_KEYS.REFRESH_TOKEN, user.refresh_token);
    }
    if (user.token_expires_at) {
      const expiresAt = new Date(user.token_expires_at).getTime();
      storage.set(STORAGE_KEYS.TOKEN_EXPIRES_AT, expiresAt.toString());
      this.tokenExpiresAt = expiresAt;
    }
    storage.setJson(STORAGE_KEYS.USER, user);

    this.accessToken = user.access_token;
    this.refreshTokenValue = user.refresh_token || null;
    this.user = user;
  }

  private clearStorage(): void {
    Object.values(STORAGE_KEYS).forEach((key) => storage.remove(key));
    this.accessToken = null;
    this.refreshTokenValue = null;
    this.tokenExpiresAt = null;
    this.user = null;
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) return false;
    // Consider expired if less than 5 minutes remaining
    return Date.now() > this.tokenExpiresAt - 5 * 60 * 1000;
  }

  private async ensureValidToken(): Promise<string> {
    if (!this.accessToken) {
      throw new Error("Not authenticated");
    }

    if (this.isTokenExpired() && this.refreshTokenValue) {
      const success = await this.refreshToken();
      if (!success) {
        throw new Error("Token refresh failed");
      }
    }

    return this.accessToken;
  }

  private async apiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.apiBaseUrl}${endpoint}`;

    console.log(`[apiRequest] ${options.method || "GET"} ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });

    console.log(`[apiRequest] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[apiRequest] Error response: ${errorText}`);
      throw new Error(`API error: ${response.status} ${errorText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    // Check content-type before parsing
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error(
        `[apiRequest] Non-JSON response from ${endpoint}:`,
        text.substring(0, 100),
      );
      throw new Error(
        `Expected JSON response but got ${contentType}: ${text.substring(0, 50)}...`,
      );
    }

    try {
      const data = await response.json();
      console.log(`[apiRequest] Success:`, endpoint);
      return data;
    } catch (e) {
      const text = await response.clone().text();
      console.error(
        `[apiRequest] JSON parse error for ${endpoint}:`,
        text.substring(0, 100),
      );
      throw new Error(
        `Failed to parse JSON from ${endpoint}: ${text.substring(0, 50)}...`,
      );
    }
  }

  private async spotifyRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await this.ensureValidToken();
    const url = `${SPOTIFY_API_BASE}${endpoint}`;

    // Only include Content-Type if we have a body
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    // Only add Content-Type for requests with a body
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers as Record<string, string>),
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Try to refresh and retry once
        const refreshed = await this.refreshToken();
        if (refreshed) {
          return this.spotifyRequest(endpoint, options);
        }
        throw new Error("Unauthorized");
      }
      const errorText = await response.text();
      throw new Error(`Spotify API error: ${response.status} ${errorText}`);
    }

    // Handle empty responses (204 No Content or empty body)
    // Many Spotify player control endpoints return 204 or 200 with no body
    if (response.status === 204) {
      return {} as T;
    }

    // Check content-length for empty responses
    const contentLength = response.headers.get("content-length");
    if (contentLength === "0") {
      return {} as T;
    }

    // Check content-type before parsing
    const contentType = response.headers.get("content-type");

    // If content-type is JSON, parse it
    if (contentType && contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        // JSON parse failed - return empty object
        return {} as T;
      }
    }

    // For non-JSON or missing content-type, check if body is empty
    // Clone response first so we can read it safely
    const text = await response.text();

    // Empty body is fine for control endpoints
    if (!text || text.trim() === "") {
      return {} as T;
    }

    // Try to parse as JSON anyway (some responses might not set content-type)
    try {
      return JSON.parse(text) as T;
    } catch {
      // Not JSON and not empty - for player control endpoints this is acceptable
      // Many Spotify endpoints return empty success responses
      return {} as T;
    }
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  async login(): Promise<AuthenticatedUser> {
    // Get PKCE auth URL from backend
    const authData = await this.apiRequest<PKCEAuthResponse>("/api/auth");

    // Store PKCE verifier for callback
    storage.set(STORAGE_KEYS.CODE_VERIFIER, authData.code_verifier);
    storage.set(STORAGE_KEYS.AUTH_STATE, authData.state);

    // Redirect to Spotify authorization
    window.location.href = authData.auth_url;

    // This won't actually return - the page will redirect
    // The callback handler will complete the login
    throw new Error("Redirecting to Spotify...");
  }

  /**
   * Complete the login process after OAuth callback
   * Call this from your redirect handler with the authorization code
   */
  async handleCallback(code: string): Promise<AuthenticatedUser> {
    const codeVerifier = storage.get(STORAGE_KEYS.CODE_VERIFIER);

    if (!codeVerifier) {
      throw new Error("Missing code verifier. Please try logging in again.");
    }

    // Exchange code for tokens via backend
    const user = await this.apiRequest<AuthenticatedUser>("/api/login", {
      method: "POST",
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
      }),
    });

    // Clear PKCE data
    storage.remove(STORAGE_KEYS.CODE_VERIFIER);
    storage.remove(STORAGE_KEYS.AUTH_STATE);

    // Save auth data
    this.saveToStorage(user);

    return user;
  }

  async logout(): Promise<void> {
    // Call backend logout (optional)
    try {
      if (this.accessToken) {
        await this.apiRequest("/api/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });
      }
    } catch {
      // Ignore logout errors
    }

    this.clearStorage();
  }

  async isAuthenticated(): Promise<boolean> {
    return !!this.accessToken;
  }

  async getCurrentUser(): Promise<SpotifyUser> {
    if (this.user && !this.isTokenExpired()) {
      return this.user;
    }

    const user = await this.spotifyRequest<SpotifyUser>("/me");
    this.user = user;
    storage.setJson(STORAGE_KEYS.USER, user);
    return user;
  }

  async refreshToken(): Promise<boolean> {
    if (!this.refreshTokenValue) {
      return false;
    }

    try {
      const response = await this.apiRequest<TokenResponse>("/api/refresh", {
        method: "POST",
        body: JSON.stringify({
          refresh_token: this.refreshTokenValue,
        }),
      });

      this.accessToken = response.access_token;
      storage.set(STORAGE_KEYS.ACCESS_TOKEN, response.access_token);

      if (response.refresh_token) {
        this.refreshTokenValue = response.refresh_token;
        storage.set(STORAGE_KEYS.REFRESH_TOKEN, response.refresh_token);
      }

      if (response.expires_in) {
        this.tokenExpiresAt = Date.now() + response.expires_in * 1000;
        storage.set(
          STORAGE_KEYS.TOKEN_EXPIRES_AT,
          this.tokenExpiresAt.toString(),
        );
      }

      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      this.clearStorage();
      return false;
    }
  }

  // ===========================================================================
  // Playback State
  // ===========================================================================

  async getPlaybackState(): Promise<PlaybackState | null> {
    try {
      const state = await this.spotifyRequest<PlaybackState>("/me/player");
      return state;
    } catch (error) {
      // 204 No Content means no active playback
      if (error instanceof Error && error.message.includes("204")) {
        return null;
      }
      throw error;
    }
  }

  async getCurrentlyPlaying(): Promise<CurrentlyPlaying | null> {
    try {
      const playing = await this.spotifyRequest<CurrentlyPlaying>(
        "/me/player/currently-playing",
      );
      return playing;
    } catch (error) {
      if (error instanceof Error && error.message.includes("204")) {
        return null;
      }
      throw error;
    }
  }

  // ===========================================================================
  // Playback Controls
  // ===========================================================================

  async play(options?: PlayOptions): Promise<void> {
    const params = new URLSearchParams();
    if (options?.deviceId) {
      params.set("device_id", options.deviceId);
    }

    const query = params.toString() ? `?${params.toString()}` : "";

    const body: Record<string, unknown> = {};
    if (options?.contextUri) {
      body.context_uri = options.contextUri;
    }
    if (options?.uris) {
      body.uris = options.uris;
    }
    if (options?.offset) {
      body.offset = options.offset;
    }
    if (options?.positionMs !== undefined) {
      body.position_ms = options.positionMs;
    }

    await this.spotifyRequest(`/me/player/play${query}`, {
      method: "PUT",
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });
  }

  async pause(deviceId?: string): Promise<void> {
    const params = new URLSearchParams();
    if (deviceId) {
      params.set("device_id", deviceId);
    }
    const query = params.toString() ? `?${params.toString()}` : "";

    await this.spotifyRequest(`/me/player/pause${query}`, {
      method: "PUT",
    });
  }

  async nextTrack(deviceId?: string): Promise<void> {
    const params = new URLSearchParams();
    if (deviceId) {
      params.set("device_id", deviceId);
    }
    const query = params.toString() ? `?${params.toString()}` : "";

    await this.spotifyRequest(`/me/player/next${query}`, {
      method: "POST",
    });
  }

  async previousTrack(deviceId?: string): Promise<void> {
    const params = new URLSearchParams();
    if (deviceId) {
      params.set("device_id", deviceId);
    }
    const query = params.toString() ? `?${params.toString()}` : "";

    await this.spotifyRequest(`/me/player/previous${query}`, {
      method: "POST",
    });
  }

  async seek(positionMs: number, deviceId?: string): Promise<void> {
    const params = new URLSearchParams();
    params.set("position_ms", positionMs.toString());
    if (deviceId) {
      params.set("device_id", deviceId);
    }

    await this.spotifyRequest(`/me/player/seek?${params.toString()}`, {
      method: "PUT",
    });
  }

  async setVolume(volumePercent: number, deviceId?: string): Promise<void> {
    const params = new URLSearchParams();
    params.set("volume_percent", Math.round(volumePercent).toString());
    if (deviceId) {
      params.set("device_id", deviceId);
    }

    await this.spotifyRequest(`/me/player/volume?${params.toString()}`, {
      method: "PUT",
    });
  }

  async setShuffle(state: boolean, deviceId?: string): Promise<void> {
    const params = new URLSearchParams();
    params.set("state", state.toString());
    if (deviceId) {
      params.set("device_id", deviceId);
    }

    await this.spotifyRequest(`/me/player/shuffle?${params.toString()}`, {
      method: "PUT",
    });
  }

  async setRepeat(state: RepeatMode, deviceId?: string): Promise<void> {
    const params = new URLSearchParams();
    params.set("state", state);
    if (deviceId) {
      params.set("device_id", deviceId);
    }

    await this.spotifyRequest(`/me/player/repeat?${params.toString()}`, {
      method: "PUT",
    });
  }

  // ===========================================================================
  // Devices
  // ===========================================================================

  async getDevices(): Promise<SpotifyDevice[]> {
    const response = await this.spotifyRequest<{ devices: SpotifyDevice[] }>(
      "/me/player/devices",
    );
    return response.devices || [];
  }

  async transferPlayback(deviceId: string, play = true): Promise<void> {
    await this.spotifyRequest("/me/player", {
      method: "PUT",
      body: JSON.stringify({
        device_ids: [deviceId],
        play,
      }),
    });
  }

  // ===========================================================================
  // Queue
  // ===========================================================================

  async addToQueue(uri: string, deviceId?: string): Promise<void> {
    const params = new URLSearchParams();
    params.set("uri", uri);
    if (deviceId) {
      params.set("device_id", deviceId);
    }

    await this.spotifyRequest(`/me/player/queue?${params.toString()}`, {
      method: "POST",
    });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a WebSpotifyService instance
 * @param apiBaseUrl - Base URL for the backend API (empty string for same-origin)
 *
 * @example
 * // For development, use 127.0.0.1 (not localhost) to match Spotify OAuth redirect URIs
 * const service = createWebSpotifyService("http://127.0.0.1:8080");
 *
 * // For production or same-origin
 * const service = createWebSpotifyService();
 */
export function createWebSpotifyService(apiBaseUrl = ""): WebSpotifyService {
  return new WebSpotifyService(apiBaseUrl);
}

// =============================================================================
// Default Export
// =============================================================================

export default WebSpotifyService;
