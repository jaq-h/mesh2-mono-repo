// =============================================================================
// @mesh/ui - Shared React UI Components for Mesh
// =============================================================================

// =============================================================================
// Context and Hooks
// =============================================================================

export {
  SpotifyProvider,
  useSpotify,
  useSpotifyAuth,
  useSpotifyPlayback,
  useSpotifyDevices,
  type SpotifyProviderProps,
  type SpotifyContextValue,
  type SpotifyContextState,
  type SpotifyContextActions,
  type SleepMode,
} from "./context/SpotifyContext";

// =============================================================================
// Components
// =============================================================================

export {
  // NowPlaying
  NowPlaying,
  NowPlayingCompact,
  type NowPlayingProps,
  type NowPlayingCompactProps,
  // PlayerControls
  PlayerControls,
  PlayerControlsMini,
  type PlayerControlsProps,
  type PlayerControlsMiniProps,
  // DeviceSelector
  DeviceSelector,
  type DeviceSelectorProps,
  // VolumeSlider
  VolumeSlider,
  VolumeSliderCompact,
  type VolumeSliderProps,
  type VolumeSliderCompactProps,
  // Spinner
  Spinner,
  SpinnerWithText,
  SpinnerOverlay,
  InlineSpinner,
  type SpinnerProps,
  type SpinnerWithTextProps,
  type SpinnerOverlayProps,
  type InlineSpinnerProps,
} from "./components";

// =============================================================================
// Pages
// =============================================================================

export {
  LoginPage,
  type LoginPageProps,
  RedirectPage,
  type RedirectPageProps,
  PlayerPage,
  type PlayerPageProps,
} from "./pages";

// =============================================================================
// Re-export types from spotify-api for convenience
// =============================================================================

export type {
  SpotifyService,
  SpotifyUser,
  AuthenticatedUser,
  PlaybackState,
  CurrentlyPlaying,
  SpotifyDevice,
  SpotifyTrack,
  SpotifyArtist,
  SpotifyAlbum,
  SpotifyImage,
  SpotifyPlaylist,
  RepeatMode,
  PlayOptions,
  WebPlaybackTrack,
  WebPlaybackState,
  WebPlaybackPlayer,
  ApiError,
  ApiResult,
  SpotifyEvent,
  SpotifyEventListener,
} from "@mesh/spotify-api";

// =============================================================================
// Re-export utility functions
// =============================================================================

export {
  formatDuration,
  getBestImageUrl,
  formatTrackInfo,
  repeatModeToString,
  repeatModeToNumber,
  buildSpotifyApiUrl,
  buildSpotifyAccountsUrl,
  SPOTIFY_API_BASE,
  SPOTIFY_ACCOUNTS_BASE,
  SPOTIFY_SDK_URL,
  DEFAULT_SCOPES,
  SCOPES_STRING,
} from "@mesh/spotify-api";

// =============================================================================
// Styles
//
// Import styles in your app's entry point:
//
//   // Option 1: Import both CSS files directly
//   import "@mesh/ui/src/styles/index.css";
//   import "@mesh/ui/src/styles/app.css";
//
//   // Option 2: Import the combined styles module
//   import "@mesh/ui/src/styles/styles";
//
// The styles include:
//   - CSS variables for theming
//   - Base reset and typography
//   - Component styles (NowPlaying, PlayerControls, DeviceSelector, etc.)
//   - Page styles (LoginPage, RedirectPage, PlayerPage)
//   - Utility classes and animations
//
// =============================================================================
