# @mesh/ui

Shared React UI components, pages, and hooks for Mesh - a Spotify remote control application.

## Overview

This package provides a unified UI layer that can be used by both web and desktop (Tauri) applications. It abstracts away platform-specific concerns by using a `SpotifyService` interface, allowing the same components to work with different data sources.

## Installation

This package is part of the Mesh monorepo. It's automatically available to other packages via pnpm workspaces:

```json
{
  "dependencies": {
    "@mesh/ui": "workspace:*"
  }
}
```

## Usage

### 1. Set Up the Provider

Wrap your app with `SpotifyProvider` and pass in your platform-specific service:

```tsx
import { SpotifyProvider } from "@mesh/ui";
import { createWebSpotifyService } from "./services/WebSpotifyService";
// or
import { createTauriSpotifyService } from "./services/TauriSpotifyService";

function App() {
  const service = useMemo(() => createWebSpotifyService(), []);

  return (
    <SpotifyProvider service={service} pollingInterval={5000}>
      <YourApp />
    </SpotifyProvider>
  );
}
```

### 2. Import Styles

In your app's entry point, import the shared styles:

```tsx
// Option 1: Import both CSS files directly
import "@mesh/ui/src/styles/index.css";
import "@mesh/ui/src/styles/app.css";

// Option 2: Import the combined styles module
import "@mesh/ui/src/styles/styles";
```

### 3. Use Components and Hooks

```tsx
import {
  LoginPage,
  PlayerPage,
  useSpotify,
  useSpotifyPlayback,
  NowPlaying,
  PlayerControls,
} from "@mesh/ui";
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Apps                                  │
│  ┌─────────────────┐         ┌─────────────────────────┐    │
│  │    Web App      │         │    Desktop App (Tauri)  │    │
│  │                 │         │                         │    │
│  │ WebSpotifyService         │ TauriSpotifyService     │    │
│  └────────┬────────┘         └───────────┬─────────────┘    │
│           │                              │                   │
│           └──────────────┬───────────────┘                   │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    @mesh/ui                            │  │
│  │                                                        │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │           SpotifyProvider (Context)             │  │  │
│  │  │         Takes SpotifyService interface          │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                          │                             │  │
│  │           ┌──────────────┼──────────────┐              │  │
│  │           ▼              ▼              ▼              │  │
│  │     ┌──────────┐   ┌──────────┐   ┌──────────┐        │  │
│  │     │  Pages   │   │Components│   │  Hooks   │        │  │
│  │     └──────────┘   └──────────┘   └──────────┘        │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  @mesh/spotify-api                     │  │
│  │         Types, SpotifyService interface, utils         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Pages

| Component | Description |
|-----------|-------------|
| `LoginPage` | OAuth login screen with customizable branding |
| `RedirectPage` | OAuth callback handler |
| `PlayerPage` | Main player interface with track info, controls, and devices |

### UI Components

| Component | Description |
|-----------|-------------|
| `NowPlaying` | Displays current track with album art and progress |
| `NowPlayingCompact` | Compact variant for headers/footers |
| `PlayerControls` | Play/pause, next, previous, shuffle, repeat buttons |
| `PlayerControlsMini` | Minimal controls (play/pause, next, prev only) |
| `DeviceSelector` | Dropdown for selecting Spotify Connect devices |
| `VolumeSlider` | Volume control with mute button |
| `VolumeSliderCompact` | Expandable compact volume control |
| `Spinner` | Loading indicator with multiple variants |

## Hooks

### `useSpotify()`

Access the full context including service, state, and all actions.

```tsx
const { service, user, isAuthenticated, playback, devices } = useSpotify();
```

### `useSpotifyAuth()`

Authentication-related state and actions only.

```tsx
const { 
  user, 
  isAuthenticated, 
  isLoading, 
  error,
  login, 
  handleCallback,
  logout, 
  refreshToken 
} = useSpotifyAuth();
```

### `useSpotifyPlayback()`

Playback state and controls.

```tsx
const {
  currentTrack,
  isPlaying,
  progress,
  duration,
  shuffle,
  repeat,
  volume,
  togglePlayback,
  nextTrack,
  previousTrack,
  seek,
  setVolume,
  setShuffle,
  setRepeat,
} = useSpotifyPlayback();
```

### `useSpotifyDevices()`

Device management.

```tsx
const {
  devices,
  activeDevice,
  isLoading,
  refresh,
  transfer,
} = useSpotifyDevices();
```

## SpotifyService Interface

Both web and desktop implementations must conform to this interface:

```typescript
interface SpotifyService {
  // Authentication
  login(): Promise<AuthenticatedUser>;
  handleCallback?(code: string): Promise<AuthenticatedUser>; // Web only
  logout(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  getCurrentUser(): Promise<SpotifyUser>;
  refreshToken(): Promise<boolean>;

  // Playback State
  getPlaybackState(): Promise<PlaybackState | null>;
  getCurrentlyPlaying(): Promise<CurrentlyPlaying | null>;

  // Playback Controls
  play(options?: PlayOptions): Promise<void>;
  pause(deviceId?: string): Promise<void>;
  nextTrack(deviceId?: string): Promise<void>;
  previousTrack(deviceId?: string): Promise<void>;
  seek(positionMs: number, deviceId?: string): Promise<void>;
  setVolume(volumePercent: number, deviceId?: string): Promise<void>;
  setShuffle(state: boolean, deviceId?: string): Promise<void>;
  setRepeat(state: RepeatMode, deviceId?: string): Promise<void>;

  // Devices
  getDevices(): Promise<SpotifyDevice[]>;
  transferPlayback(deviceId: string, play?: boolean): Promise<void>;

  // Queue
  addToQueue(uri: string, deviceId?: string): Promise<void>;
}
```

## Styling

The package includes comprehensive CSS with:

- **CSS Variables** - Easy theming via custom properties
- **Component Styles** - Styles for all UI components
- **Page Styles** - Styles for LoginPage, RedirectPage, PlayerPage
- **Utility Classes** - Common helpers like `.hidden`, `.sr-only`
- **Animations** - Spinner, fade, slide animations
- **Responsive Design** - Mobile-first breakpoints

### CSS Variables

Key variables you can override:

```css
:root {
  --color-bg-primary: #121212;
  --color-bg-secondary: #181818;
  --color-text-primary: #ffffff;
  --color-text-secondary: #b3b3b3;
  --color-spotify-green: #1db954;
  /* ... and more */
}
```

## Platform Differences

### Web App
- Uses `WebSpotifyService` with fetch API
- OAuth redirects to Spotify, then back to `/redirect`
- Uses `handleCallback()` to exchange code for tokens
- Can use Spotify Web Playback SDK for browser playback
- Uses `http://127.0.0.1:5173` (not localhost) for Spotify OAuth compatibility

### Desktop App (Tauri)
- Uses `TauriSpotifyService` with Tauri IPC
- OAuth opens browser, local server handles callback
- Full flow handled in `login()` - no separate `handleCallback`
- Playback controlled via Spotify Connect (external devices)

## Development

```bash
# From monorepo root
pnpm install

# Run web app (http://127.0.0.1:5173)
pnpm dev:web

# Run desktop app (http://127.0.0.1:1420)
pnpm dev:desktop

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## License

MIT