// =============================================================================
// @mesh/spotify-api - Shared Spotify API Types and Service Interface
// =============================================================================

// Re-export all types
export * from "./types";

// =============================================================================
// Constants
// =============================================================================

/**
 * Spotify API base URL
 */
export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/**
 * Spotify Accounts base URL (for OAuth)
 */
export const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";

/**
 * Spotify Web Playback SDK script URL
 */
export const SPOTIFY_SDK_URL = "https://sdk.scdn.co/spotify-player.js";

/**
 * Default scopes required for the app
 */
export const DEFAULT_SCOPES = [
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
] as const;

/**
 * Scopes as a space-separated string
 */
export const SCOPES_STRING = DEFAULT_SCOPES.join(" ");

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Build a Spotify API URL
 */
export function buildSpotifyApiUrl(endpoint: string): string {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${SPOTIFY_API_BASE}${path}`;
}

/**
 * Build a Spotify Accounts URL
 */
export function buildSpotifyAccountsUrl(endpoint: string): string {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${SPOTIFY_ACCOUNTS_BASE}${path}`;
}

/**
 * Format milliseconds as mm:ss
 */
export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Convert repeat mode number to string
 * (Used for Web Playback SDK compatibility)
 */
export function repeatModeToString(mode: 0 | 1 | 2): "off" | "context" | "track" {
  switch (mode) {
    case 0:
      return "off";
    case 1:
      return "context";
    case 2:
      return "track";
    default:
      return "off";
  }
}

/**
 * Convert repeat mode string to number
 * (Used for Web Playback SDK compatibility)
 */
export function repeatModeToNumber(mode: "off" | "context" | "track"): 0 | 1 | 2 {
  switch (mode) {
    case "off":
      return 0;
    case "context":
      return 1;
    case "track":
      return 2;
    default:
      return 0;
  }
}

/**
 * Get the best image URL from an array of images
 * Prefers images around the target size
 */
export function getBestImageUrl(
  images: Array<{ url: string; width?: number | null; height?: number | null }>,
  targetSize: number = 300
): string | null {
  if (!images || images.length === 0) return null;

  // Find the image closest to target size
  let bestImage = images[0];
  let bestDiff = Infinity;

  for (const image of images) {
    const size = image.width || image.height || 0;
    const diff = Math.abs(size - targetSize);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestImage = image;
    }
  }

  return bestImage?.url || null;
}

/**
 * Extract track info in a display-friendly format
 */
export function formatTrackInfo(track: {
  name: string;
  artists: Array<{ name: string }>;
}): { title: string; artist: string } {
  return {
    title: track.name,
    artist: track.artists.map((a) => a.name).join(", "),
  };
}
