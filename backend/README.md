# Mesh Backend (Rust)

A Rust backend for the Mesh application, handling Spotify OAuth authorization (with PKCE), user data storage with PostgreSQL, automatic token refresh, and remote playback control.

## Tech Stack

- **Framework**: [Actix-web](https://actix.rs/) - High-performance web framework
- **Database**: PostgreSQL with [SQLx](https://github.com/launchbadge/sqlx) for type-safe queries
- **HTTP Client**: [reqwest](https://github.com/seanmonstar/reqwest) for Spotify API calls
- **Serialization**: Serde for JSON handling
- **Async Runtime**: Tokio
- **Background Tasks**: Automatic token refresh every 25 minutes

## Features

- **PKCE OAuth Flow**: Secure Spotify authentication without exposing client secrets
- **Automatic Token Refresh**: Background task refreshes all user tokens every 25 minutes
- **Remote Control**: Full playback control for any Spotify-connected device
- **Multi-Device Support**: List devices, transfer playback between devices
- **Playback Tracking**: Get currently playing track from any device

## Prerequisites

- Rust 1.70+ (install via [rustup](https://rustup.rs/))
- PostgreSQL 12+
- Spotify Developer Account with registered application

## Setup

### 1. Install SQLx CLI (for migrations)

```bash
cargo install sqlx-cli --no-default-features --features postgres
```

### 2. Create the database

```bash
createdb mesh_api_development
```

### 3. Configure environment variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Spotify OAuth credentials (from Spotify Developer Dashboard)
CLIENT_ID=your_spotify_client_id
CLIENT_SECRET=your_spotify_client_secret
REDIRECT_URI=http://localhost:3000/redirect

# Database configuration
DATABASE_URL=postgres://username:password@localhost/mesh_api_development

# JWT (Mesh session tokens) — REQUIRED, the server refuses to start without it.
# Generate one with:  openssl rand -hex 32
# The signing algorithm is fixed to HS256 in code (not configurable).
JWT_SECRET=

# Server configuration
HOST=127.0.0.1
PORT=8080

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

### 4. Run database migrations

```bash
sqlx migrate run
```

### 5. Build and run

Development mode:
```bash
cargo run
```

Production build:
```bash
cargo build --release
./target/release/mesh-backend
```

---

## API Endpoints

### Authorization

Every endpoint except `GET /api/auth` and `POST /api/login` requires a **Mesh session token**,
sent as:

```
Authorization: Bearer <mesh_token>
```

The token is returned by `POST /api/login` (field `mesh_token`) and is valid for 7 days. Identity
is taken **only** from this token — the old `?user={display_name}` query parameter and `user`
request-body field have been removed (SPEC-001). Calls without a valid token receive `401`.

### Authentication (PKCE Flow)

#### `GET /api/auth`

Returns PKCE parameters and the Spotify authorization URL.

**Response:**
```json
{
  "auth_url": "https://accounts.spotify.com/authorize?client_id=...&code_challenge=...&code_challenge_method=S256",
  "code_verifier": "random_64_character_string_store_this",
  "code_challenge": "base64_sha256_hash_of_verifier"
}
```

---

#### `POST /api/login`

Exchanges Spotify authorization code for access tokens using PKCE.

**Request Body:**
```json
{
  "code": "spotify_authorization_code_from_redirect",
  "code_verifier": "the_code_verifier_from_auth_step"
}
```

**Response:** (the Spotify profile + tokens, plus `mesh_token` for the `Authorization` header)
```json
{
  "id": "spotify_user_id",
  "display_name": "username",
  "email": "user@example.com",
  "access_token": "spotify_access_token",
  "refresh_token": "spotify_refresh_token",
  "token_expires_at": "2026-06-12T18:00:00Z",
  "mesh_token": "<jwt — send as Authorization: Bearer on every other call>"
}
```

---

### Users

#### `GET /api/users/{display_name}`

Gets the currently playing track. Requires `Authorization: Bearer <mesh_token>`, and
`{display_name}` must resolve to the authenticated user (self-only; `403`/`401` otherwise).

**Response (when playing):**
```json
{
  "is_playing": true,
  "progress_ms": 45000,
  "item": {
    "name": "Track Name",
    "artists": [{"name": "Artist Name"}],
    "album": {"name": "Album Name", "images": [...]}
  }
}
```

---

### Player / Remote Control

All player endpoints require `Authorization: Bearer <mesh_token>`. They act on the
authenticated user's Spotify account — there is no `user` parameter.

#### `GET /api/player/state`

Get full playback state including device, shuffle, repeat mode.

**Response:**
```json
{
  "is_playing": true,
  "device": {
    "id": "device_id",
    "name": "My Speaker",
    "type": "Speaker",
    "volume_percent": 50,
    "is_active": true
  },
  "shuffle_state": false,
  "repeat_state": "off",
  "progress_ms": 45000,
  "item": { ... }
}
```

---

#### `GET /api/player/currently-playing`

Get just the currently playing track.

---

#### `GET /api/player/devices`

Get all available Spotify devices.

**Response:**
```json
{
  "devices": [
    {
      "id": "device_id_1",
      "name": "MacBook Pro",
      "type": "Computer",
      "is_active": true,
      "volume_percent": 100
    },
    {
      "id": "device_id_2",
      "name": "Living Room Speaker",
      "type": "Speaker",
      "is_active": false,
      "volume_percent": 50
    }
  ]
}
```

---

#### `POST /api/player/play`

Start or resume playback.

**Request Body:**
```json
{
  "device_id": "optional_device_id",
  "context_uri": "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
  "uris": ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh"],
  "offset_position": 0,
  "position_ms": 0
}
```

---

#### `POST /api/player/pause`

Pause playback.

**Request Body:**
```json
{
  "device_id": "optional_device_id"
}
```

---

#### `POST /api/player/next`

Skip to next track.

**Request Body:**
```json
{
  "device_id": "optional_device_id"
}
```

---

#### `POST /api/player/previous`

Skip to previous track.

**Request Body:**
```json
{
  "device_id": "optional_device_id"
}
```

---

#### `POST /api/player/seek`

Seek to position in current track.

**Request Body:**
```json
{
  "device_id": "optional_device_id",
  "position_ms": 30000
}
```

---

#### `POST /api/player/volume`

Set volume (0-100).

**Request Body:**
```json
{
  "device_id": "optional_device_id",
  "volume_percent": 50
}
```

---

#### `POST /api/player/shuffle`

Set shuffle state.

**Request Body:**
```json
{
  "device_id": "optional_device_id",
  "state": true
}
```

---

#### `POST /api/player/repeat`

Set repeat mode.

**Request Body:**
```json
{
  "device_id": "optional_device_id",
  "state": "track"
}
```

Valid states: `"track"`, `"context"`, `"off"`

---

#### `POST /api/player/transfer`

Transfer playback to another device.

**Request Body:**
```json
{
  "device_id": "target_device_id",
  "play": true
}
```

---

#### `POST /api/player/queue`

Add a track to the queue.

**Request Body:**
```json
{
  "device_id": "optional_device_id",
  "uri": "spotify:track:4iV5W9uYEdYUVa79Axb7Rh"
}
```

---

## Automatic Token Refresh

The backend automatically refreshes Spotify access tokens every **25 minutes** for all users with stored refresh tokens. This ensures tokens never expire (Spotify tokens expire after 1 hour).

The refresh task:
- Runs as a background Tokio task
- Queries all users with refresh tokens
- Calls Spotify's token refresh endpoint for each user
- Updates the database with new access tokens
- Logs success/failure counts

No configuration needed - it starts automatically when the server starts.

---

## Project Structure

```
mesh/backend/
├── Cargo.toml              # Dependencies and project config
├── .env.example            # Environment variables template
├── migrations/             # SQLx database migrations
│   ├── 20240101000001_create_users.sql
│   ├── 20240101000002_create_sessions.sql
│   └── 20240101000003_create_admin_users.sql
└── src/
    ├── main.rs             # Application entry point & server setup
    ├── config.rs           # Environment configuration
    ├── error.rs            # Custom error types
    ├── models.rs           # Database models (User, Session, etc.)
    ├── spotify.rs          # Spotify API adapter (OAuth, playback, remote control)
    ├── token_refresh.rs    # Background token refresh task
    └── handlers/
        ├── mod.rs          # Handler module exports
        ├── sessions.rs     # PKCE auth flow handlers
        ├── users.rs        # User management handlers
        └── player.rs       # Remote control & playback handlers
```

---

## Development

### Running tests

```bash
cargo test
```

### Check for errors without building

```bash
cargo check
```

### Format code

```bash
cargo fmt
```

### Lint with Clippy

```bash
cargo clippy
```

---

## Testing with curl

```bash
# 1. Get PKCE auth params
curl http://localhost:8080/api/auth

# 2. Open auth_url in browser, authorize, copy code from redirect

# 3. Exchange code for user session — save the `mesh_token` from the response
curl -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"code": "YOUR_CODE", "code_verifier": "YOUR_CODE_VERIFIER"}'

# Every call below requires the Mesh session token:
TOKEN=YOUR_MESH_TOKEN

# 4. Get available devices
curl http://localhost:8080/api/player/devices -H "Authorization: Bearer $TOKEN"

# 5. Get currently playing
curl http://localhost:8080/api/player/currently-playing -H "Authorization: Bearer $TOKEN"

# 6. Play/pause
curl -X POST http://localhost:8080/api/player/play \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'

curl -X POST http://localhost:8080/api/player/pause \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'

# 7. Skip tracks
curl -X POST http://localhost:8080/api/player/next \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'

# 8. Set volume
curl -X POST http://localhost:8080/api/player/volume \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"volume_percent": 50}'
```

---

## Spotify Scopes

The application requests the following Spotify scopes:

- `streaming` - Control playback
- `user-modify-playback-state` - Play, pause, skip, seek, volume, shuffle, repeat
- `user-read-playback-state` - Read playback state and devices
- `user-read-private` - Read user's subscription details
- `user-read-playback-position` - Read playback position
- `user-top-read` - Read user's top artists and tracks
- `user-library-read` - Read user's library
- `user-read-currently-playing` - Read currently playing track
- `user-read-recently-played` - Read recently played tracks
- `playlist-read-collaborative` - Read collaborative playlists
- `playlist-read-private` - Read private playlists
- `user-follow-read` - Read followed artists/users

---

## License

MIT