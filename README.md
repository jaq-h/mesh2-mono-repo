# Mesh - Spotify Remote Control

A cross-platform Spotify remote control application with a unified React UI for both web and desktop.

## Architecture

This is a **pnpm monorepo** with shared packages and platform-specific apps:

```
mesh/
├── packages/
│   ├── spotify-api/     # Shared TypeScript types and service interface
│   └── ui/              # Shared React components and hooks
├── apps/
│   ├── web/             # Web application (Vite + React)
│   └── desktop/         # Desktop application (Tauri + React)
└── backend/             # Rust backend API server
```

### Key Packages

#### `@mesh/spotify-api`
- TypeScript types for Spotify API responses
- `SpotifyService` interface that both web and desktop implement
- Utility functions for formatting, image selection, etc.

#### `@mesh/ui`
- `SpotifyProvider` - React context for unified state management
- `useSpotify`, `useSpotifyPlayback`, `useSpotifyDevices` - Hooks
- `NowPlaying`, `PlayerControls`, `DeviceSelector` - Shared components

### Platform Implementations

#### Web (`@mesh/web`)
- Uses `WebSpotifyService` which calls the Spotify API directly
- Authenticates via the Rust backend's PKCE OAuth flow
- Runs in any modern browser

#### Desktop (`@mesh/desktop`)
- Uses `TauriSpotifyService` which calls Rust functions via Tauri IPC
- Native performance, system tray integration
- OS media integration (reads Now Playing from macOS/Windows/Linux)

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0
- **Rust** (for backend and desktop app)
- **Spotify Developer Account** with an app configured

## Getting Started

### 1. Install Dependencies

```bash
# Install pnpm if you don't have it
npm install -g pnpm

# Install all dependencies
pnpm install
```

### 2. Build Shared Packages

```bash
# Build the shared packages first
pnpm --filter @mesh/spotify-api build
pnpm --filter @mesh/ui build
```

### 3. Configure Spotify

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create or select your app
3. Add these Redirect URIs:
   - Web: `http://localhost:5173/redirect` (or your production URL)
   - Desktop: `http://127.0.0.1:8585/callback`
4. Copy your Client ID

### 4. Environment Setup

Create `.env` files as needed:

**Web App (`apps/web/.env`):**
```env
VITE_API_BASE_URL=http://localhost:8080
VITE_APP_URL=http://localhost:5173
```

**Backend (`backend/.env`):**
```env
DATABASE_URL=postgres://localhost/mesh
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

### 5. Run Development

```bash
# Run everything in parallel
pnpm dev

# Or run individually:
pnpm dev:web      # Web app at http://localhost:5173
pnpm dev:desktop  # Desktop app with Tauri
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Run all apps in development mode |
| `pnpm dev:web` | Run web app only |
| `pnpm dev:desktop` | Run desktop app only |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | Type-check all packages |
| `pnpm clean` | Remove all build artifacts |

## How It Works

### Unified Service Interface

Both platforms implement the same `SpotifyService` interface:

```typescript
interface SpotifyService {
  // Auth
  login(): Promise<AuthenticatedUser>;
  logout(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  
  // Playback
  getPlaybackState(): Promise<PlaybackState | null>;
  play(options?: PlayOptions): Promise<void>;
  pause(): Promise<void>;
  nextTrack(): Promise<void>;
  // ... more methods
  
  // Devices
  getDevices(): Promise<SpotifyDevice[]>;
  transferPlayback(deviceId: string): Promise<void>;
}
```

### Shared React Context

The `SpotifyProvider` wraps your app and accepts a service implementation:

```tsx
// Web
import { SpotifyProvider } from '@mesh/ui';
import { WebSpotifyService } from './services/WebSpotifyService';

const service = new WebSpotifyService('http://localhost:8080');

<SpotifyProvider service={service}>
  <App />
</SpotifyProvider>

// Desktop
import { TauriSpotifyService } from './services/TauriSpotifyService';

const service = new TauriSpotifyService();

<SpotifyProvider service={service}>
  <App />
</SpotifyProvider>
```

### Using Shared Components

Components use hooks that abstract away the service implementation:

```tsx
import { useSpotifyPlayback, PlayerControls, NowPlaying } from '@mesh/ui';

function Player() {
  const { isPlaying, currentTrack } = useSpotifyPlayback();
  
  return (
    <div>
      <NowPlaying />
      <PlayerControls />
    </div>
  );
}
```

## Project Structure Details

```
mesh/
├── packages/
│   ├── spotify-api/
│   │   ├── src/
│   │   │   ├── types.ts          # All TypeScript types
│   │   │   └── index.ts          # Exports + utilities
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── ui/
│       ├── src/
│       │   ├── context/
│       │   │   └── SpotifyContext.tsx   # Provider + hooks
│       │   ├── components/
│       │   │   ├── NowPlaying.tsx
│       │   │   ├── PlayerControls.tsx
│       │   │   ├── DeviceSelector.tsx
│       │   │   └── index.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   └── WebSpotifyService.ts
│   │   │   ├── pages/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── desktop/
│       ├── src/
│       │   ├── services/
│       │   │   └── TauriSpotifyService.ts
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── src-tauri/           # Rust Tauri backend
│       │   ├── src/
│       │   ├── Cargo.toml
│       │   └── tauri.conf.json
│       ├── package.json
│       └── vite.config.ts
│
├── backend/                      # Rust API server
│   ├── src/
│   ├── migrations/
│   └── Cargo.toml
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Desktop**: Tauri 2.x (Rust)
- **Backend**: Rust, Actix-web, SQLx, PostgreSQL
- **Monorepo**: pnpm workspaces
- **API**: Spotify Web API with PKCE OAuth

## License

MIT