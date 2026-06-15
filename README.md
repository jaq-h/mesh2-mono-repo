# Mesh - Spotify Remote Control

A cross-platform Spotify remote control with a unified React UI shared across a web app and a
native desktop app, backed by a Rust API service.

## Architecture

This is a **pnpm monorepo** with shared packages, two platform apps, and a Rust backend:

```
mesh/
├── packages/
│   ├── spotify-api/     # Shared TypeScript types + SpotifyService interface
│   └── ui/              # Shared React components, pages, and hooks
├── apps/
│   ├── web/             # Web app (Vite + React) — talks to the backend
│   └── desktop/         # Desktop app (Tauri + React + Rust)
├── backend/             # Rust API: OAuth broker, session auth, token store
└── docs/specs/          # Remediation plan + design specs (see "Documentation")
```

### How the pieces fit together

The two apps share **all** their UI (`@mesh/ui`) but authenticate very differently:

| App | Needs the backend? | Needs PostgreSQL? | Auth flow |
|-----|--------------------|-------------------|-----------|
| **Web** | **Yes** | Yes (via the backend) | Backend brokers the Spotify PKCE exchange and issues a Mesh session token |
| **Desktop** | **No** | No | Authenticates directly with Spotify using its own PKCE flow + a local callback server (`:8585`); tokens are stored in the OS keyring |

So you can run the **desktop app on its own**, but the **web app requires the backend** (and a
database) to be running.

### Key Packages

#### `@mesh/spotify-api`
- TypeScript types for Spotify API responses
- The `SpotifyService` interface that both web and desktop implement
- Utility functions (duration formatting, image selection, repeat-mode mapping, etc.)

#### `@mesh/ui`
- `SpotifyProvider` — React context for unified playback/auth/device state
- Hooks: `useSpotify`, `useSpotifyAuth`, `useSpotifyPlayback`, `useSpotifyDevices`
- Components: `NowPlaying`, `PlayerControls`, `DeviceSelector`, `VolumeSlider`, `Spinner`
- Pages: `LoginPage`, `RedirectPage`, `PlayerPage`

### Platform Implementations

#### Web (`@mesh/web`)
- Uses `WebSpotifyService`, which calls the Spotify Web API directly from the browser
- Logs in through the **backend's** PKCE OAuth flow and stores the returned Mesh session token
- During development, API calls are proxied to the backend through Vite (no CORS setup needed)

#### Desktop (`@mesh/desktop`)
- Uses `TauriSpotifyService`, which calls Rust functions over Tauri IPC
- Authenticates directly with Spotify; refresh tokens are kept in the OS keyring
- Optional OS-level "now playing" + control of the local Spotify app
  (**macOS** implemented via AppleScript; Windows/Linux are stubs — see `docs/specs/`)

### The Backend (`backend/`)

The backend is a Rust (Actix-web + SQLx/PostgreSQL) service. Its role:

1. **OAuth token broker** — keeps the Spotify `CLIENT_SECRET` server-side and performs the
   authorization-code/PKCE exchange and token refresh on behalf of the web app.
2. **Session authentication** — issues a signed **Mesh session token (JWT)** at login. Every
   identity-bearing endpoint (`/api/player/*`, `/api/users/*`, `/api/refresh`) requires
   `Authorization: Bearer <mesh_token>`; identity comes from the token, never from a request
   parameter.
3. **User + token store** — persists users (keyed on the stable Spotify id) and their tokens in
   PostgreSQL, and refreshes them on a 25-minute background cycle.
4. **Authenticated remote-control API** — play/pause/seek/volume/devices/etc. for the
   authenticated user.
5. **Planned: real-time playback relay** — a WebSocket relay so the desktop app can push OS-level
   "now playing" to the web remote (and accept control back) instead of the web app polling
   Spotify. See `docs/specs/031-realtime-playback-relay.md`.

Full backend API reference and endpoint docs live in [`backend/README.md`](backend/README.md).

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0
- **Rust** (stable) — for the backend and the desktop app
- **PostgreSQL** >= 12 — for the backend
- **Spotify Developer account** with an app configured

## Running Locally

### 1. Install dependencies

```bash
npm install -g pnpm     # if you don't have pnpm
pnpm install
```

> The shared packages (`@mesh/spotify-api`, `@mesh/ui`) are consumed directly from source via the
> workspace, so Vite/Tauri pick up changes without a separate build step in dev. Run
> `pnpm build` (or `pnpm typecheck`) when you want compiled output or a full type check.

### 2. Configure your Spotify app

In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), add **both**
redirect URIs (use `127.0.0.1`, not `localhost` — Spotify requires the loopback IP and it must
match exactly):

- Web: `http://127.0.0.1:5173/redirect`
- Desktop: `http://127.0.0.1:8585/callback`

Copy your **Client ID** (and **Client Secret** for the backend).

### 3. Backend (required for the web app)

```bash
# Create the database (migrations run automatically on startup)
createdb mesh

cp backend/.env.example backend/.env
```

Edit `backend/.env` — note the variable names are **not** `SPOTIFY_`-prefixed:

```env
CLIENT_ID=your_spotify_client_id
CLIENT_SECRET=your_spotify_client_secret
# Where Spotify sends the browser back — this is the WEB APP's /redirect route:
REDIRECT_URI=http://127.0.0.1:5173/redirect

DATABASE_URL=postgres://localhost/mesh

# REQUIRED — the server refuses to start without it. Generate one with:
#   openssl rand -hex 32
JWT_SECRET=

# Defaults shown; the web dev proxy expects the backend on :8080
HOST=127.0.0.1
PORT=8080
FRONTEND_URL=http://127.0.0.1:5173
```

Then run it:

```bash
cargo run --manifest-path backend/Cargo.toml
# backend now listening on http://127.0.0.1:8080
```

### 4. Web app

```bash
pnpm dev:web      # http://127.0.0.1:5173
```

In development, leave `VITE_API_BASE_URL` unset — `/api` requests are proxied to the backend on
`:8080` automatically (avoids CORS). Only set `VITE_API_BASE_URL` for a production deployment
where the backend is on a different origin.

### 5. Desktop app

The desktop app does not need the backend or a database. Provide your Spotify Client ID via the
environment, then run:

```bash
export SPOTIFY_CLIENT_ID=your_spotify_client_id   # also accepts VITE_SPOTIFY_CLIENT_ID
pnpm dev:desktop
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev:web` | Run the web app (Vite) at `http://127.0.0.1:5173` |
| `pnpm dev:desktop` | Run the desktop app (`tauri dev`) |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | Type-check every package |
| `pnpm clean` | Remove build artifacts and `node_modules` |
| `cargo run --manifest-path backend/Cargo.toml` | Run the backend API |

> **Note:** `pnpm dev` runs every workspace `dev` script in parallel, which now includes
> `tauri dev`. Prefer the targeted `pnpm dev:web` / `pnpm dev:desktop` commands above. (Cleaning
> up the root `dev` script is tracked in `docs/specs/023-vestigial-code-removal.md`.)

## How It Works

### Unified service interface

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

### Shared React context

`SpotifyProvider` wraps the app and accepts a service implementation:

```tsx
// Web — empty base URL uses the Vite dev proxy
import { SpotifyProvider } from '@mesh/ui';
import { createWebSpotifyService } from './services/WebSpotifyService';

const service = createWebSpotifyService('');

<SpotifyProvider service={service}>
  <App />
</SpotifyProvider>

// Desktop
import { createTauriSpotifyService } from './services/TauriSpotifyService';

const service = createTauriSpotifyService();

<SpotifyProvider service={service}>
  <App />
</SpotifyProvider>
```

### Using shared components

Components use hooks that abstract away which service is underneath:

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

## Documentation

- [`backend/README.md`](backend/README.md) — backend setup, API endpoints, auth header contract,
  Spotify scopes.
- [`docs/specs/`](docs/specs/) — the remediation plan and design specs. Start with
  [`docs/specs/README.md`](docs/specs/README.md), which indexes every spec, phases the work, and
  records the backend-role decision (Option A: auth service + remote-control API + real-time
  relay). Specs SPEC-001 and SPEC-002 (backend authentication + stable user identity) are
  implemented; the rest are planned.

## Project Structure

```
mesh/
├── packages/
│   ├── spotify-api/src/        # types.ts, index.ts (types + utilities)
│   └── ui/src/                 # context/, components/, pages/
├── apps/
│   ├── web/src/                # services/WebSpotifyService.ts, App.tsx, main.tsx
│   └── desktop/
│       ├── src/                # services/TauriSpotifyService.ts, components/, App.tsx
│       └── src-tauri/          # Rust: spotify client, OS now-playing, Tauri commands
├── backend/
│   ├── src/                    # auth.rs, config.rs, handlers/, models.rs, spotify.rs, ...
│   └── migrations/             # SQL migrations (auto-run on startup)
├── docs/specs/                 # remediation plan + specs
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Desktop:** Tauri 2.x (Rust), OS keyring for token storage
- **Backend:** Rust, Actix-web, SQLx, PostgreSQL, JWT session tokens
- **Monorepo:** pnpm workspaces
- **API:** Spotify Web API with PKCE OAuth

## License

MIT
