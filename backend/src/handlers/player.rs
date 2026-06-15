//! Player handlers for remote control and playback tracking
//!
//! Handles:
//! - GET /api/player/state - Get current playback state
//! - GET /api/player/devices - Get available devices
//! - POST /api/player/play - Start/resume playback
//! - POST /api/player/pause - Pause playback
//! - POST /api/player/next - Skip to next track
//! - POST /api/player/previous - Skip to previous track
//! - POST /api/player/seek - Seek to position
//! - POST /api/player/volume - Set volume
//! - POST /api/player/shuffle - Set shuffle state
//! - POST /api/player/repeat - Set repeat mode
//! - POST /api/player/transfer - Transfer playback to device
//! - POST /api/player/queue - Add track to queue
//!
//! Identity always comes from the Mesh session token (`AuthedUser`), never from
//! a request parameter. See SPEC-001.

use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};

use crate::auth::AuthedUser;
use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::spotify::{PlayOffset, PlayRequest, SpotifyApiAdapter};
use crate::AppState;

// ============================================================================
// Request/Response Types
// ============================================================================

/// Query/body params carrying an optional target device.
#[derive(Debug, Deserialize)]
pub struct UserQuery {
    /// Optional device ID to target
    pub device_id: Option<String>,
}

/// Request to start playback
#[derive(Debug, Deserialize)]
pub struct PlayRequestBody {
    /// Optional device ID
    pub device_id: Option<String>,
    /// Spotify URI of context (album, artist, playlist)
    pub context_uri: Option<String>,
    /// Array of track URIs to play
    pub uris: Option<Vec<String>>,
    /// Position within context to start
    pub offset_position: Option<i32>,
    /// URI to start at within context
    pub offset_uri: Option<String>,
    /// Position in ms to start track
    pub position_ms: Option<i64>,
}

/// Request to seek to position
#[derive(Debug, Deserialize)]
pub struct SeekRequest {
    pub device_id: Option<String>,
    pub position_ms: i64,
}

/// Request to set volume
#[derive(Debug, Deserialize)]
pub struct VolumeRequest {
    pub device_id: Option<String>,
    pub volume_percent: i32,
}

/// Request to set shuffle
#[derive(Debug, Deserialize)]
pub struct ShuffleRequest {
    pub device_id: Option<String>,
    pub state: bool,
}

/// Request to set repeat mode
#[derive(Debug, Deserialize)]
pub struct RepeatRequest {
    pub device_id: Option<String>,
    /// One of: "track", "context", "off"
    pub state: String,
}

/// Request to transfer playback
#[derive(Debug, Deserialize)]
pub struct TransferRequest {
    pub device_id: String,
    #[serde(default)]
    pub play: bool,
}

/// Request to add to queue
#[derive(Debug, Deserialize)]
pub struct QueueRequest {
    pub device_id: Option<String>,
    /// Spotify URI of the track to add
    pub uri: String,
}

/// Simple success response
#[derive(Debug, Serialize)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: String,
}

impl SuccessResponse {
    pub fn new(message: &str) -> Self {
        Self {
            success: true,
            message: message.to_string(),
        }
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get the authenticated user's access token from the database.
async fn get_user_token(pool: &sqlx::PgPool, user_id: i32) -> AppResult<String> {
    let user = User::find_by_id(pool, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("User {} not found", user_id)))?;

    user.access_token.ok_or_else(|| {
        AppError::Unauthorized("User has no access token. Please login again.".to_string())
    })
}

// ============================================================================
// Handlers
// ============================================================================

/// GET /api/player/state
///
/// Get current playback state for the authenticated user
pub async fn get_state(
    state: web::Data<AppState>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    let playback_state = spotify.get_playback_state(&access_token).await?;

    match playback_state {
        Some(ps) => Ok(HttpResponse::Ok().json(ps)),
        None => Ok(HttpResponse::Ok().json(serde_json::json!({
            "is_playing": false,
            "message": "No active playback"
        }))),
    }
}

/// GET /api/player/currently-playing
///
/// Get currently playing track for the authenticated user
pub async fn get_currently_playing(
    state: web::Data<AppState>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    let currently_playing = spotify.currently_playing(&access_token).await?;

    match currently_playing {
        Some(cp) => Ok(HttpResponse::Ok().json(cp)),
        None => Ok(HttpResponse::Ok().json(serde_json::json!({
            "is_playing": false,
            "message": "Nothing currently playing"
        }))),
    }
}

/// GET /api/player/devices
///
/// Get available devices for the authenticated user
pub async fn get_devices(
    state: web::Data<AppState>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    let devices = spotify.get_devices(&access_token).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "devices": devices
    })))
}

/// POST /api/player/play
///
/// Start or resume playback
pub async fn play(
    state: web::Data<AppState>,
    body: web::Json<PlayRequestBody>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    // Build play request if any options specified
    let play_request = if body.context_uri.is_some()
        || body.uris.is_some()
        || body.offset_position.is_some()
        || body.offset_uri.is_some()
        || body.position_ms.is_some()
    {
        let offset = if let Some(pos) = body.offset_position {
            Some(PlayOffset::Position { position: pos })
        } else {
            body.offset_uri
                .as_ref()
                .map(|uri| PlayOffset::Uri { uri: uri.clone() })
        };

        Some(PlayRequest {
            context_uri: body.context_uri.clone(),
            uris: body.uris.clone(),
            offset,
            position_ms: body.position_ms,
        })
    } else {
        None
    };

    spotify
        .play(&access_token, body.device_id.as_deref(), play_request)
        .await?;

    Ok(HttpResponse::Ok().json(SuccessResponse::new("Playback started")))
}

/// POST /api/player/pause
///
/// Pause playback
pub async fn pause(
    state: web::Data<AppState>,
    body: web::Json<UserQuery>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    spotify
        .pause(&access_token, body.device_id.as_deref())
        .await?;

    Ok(HttpResponse::Ok().json(SuccessResponse::new("Playback paused")))
}

/// POST /api/player/next
///
/// Skip to next track
pub async fn next(
    state: web::Data<AppState>,
    body: web::Json<UserQuery>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    spotify
        .next(&access_token, body.device_id.as_deref())
        .await?;

    Ok(HttpResponse::Ok().json(SuccessResponse::new("Skipped to next track")))
}

/// POST /api/player/previous
///
/// Skip to previous track
pub async fn previous(
    state: web::Data<AppState>,
    body: web::Json<UserQuery>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    spotify
        .previous(&access_token, body.device_id.as_deref())
        .await?;

    Ok(HttpResponse::Ok().json(SuccessResponse::new("Skipped to previous track")))
}

/// POST /api/player/seek
///
/// Seek to position in track
pub async fn seek(
    state: web::Data<AppState>,
    body: web::Json<SeekRequest>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    spotify
        .seek(&access_token, body.position_ms, body.device_id.as_deref())
        .await?;

    Ok(HttpResponse::Ok().json(SuccessResponse::new(&format!(
        "Seeked to position {}ms",
        body.position_ms
    ))))
}

/// POST /api/player/volume
///
/// Set volume (0-100)
pub async fn volume(
    state: web::Data<AppState>,
    body: web::Json<VolumeRequest>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    spotify
        .set_volume(
            &access_token,
            body.volume_percent,
            body.device_id.as_deref(),
        )
        .await?;

    Ok(HttpResponse::Ok().json(SuccessResponse::new(&format!(
        "Volume set to {}%",
        body.volume_percent.clamp(0, 100)
    ))))
}

/// POST /api/player/shuffle
///
/// Set shuffle state
pub async fn shuffle(
    state: web::Data<AppState>,
    body: web::Json<ShuffleRequest>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    spotify
        .set_shuffle(&access_token, body.state, body.device_id.as_deref())
        .await?;

    Ok(HttpResponse::Ok().json(SuccessResponse::new(&format!(
        "Shuffle {}",
        if body.state { "enabled" } else { "disabled" }
    ))))
}

/// POST /api/player/repeat
///
/// Set repeat mode ("track", "context", or "off")
pub async fn repeat(
    state: web::Data<AppState>,
    body: web::Json<RepeatRequest>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    // Validate repeat state
    let valid_states = ["track", "context", "off"];
    if !valid_states.contains(&body.state.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Invalid repeat state '{}'. Must be one of: track, context, off",
            body.state
        )));
    }

    spotify
        .set_repeat(&access_token, &body.state, body.device_id.as_deref())
        .await?;

    Ok(HttpResponse::Ok().json(SuccessResponse::new(&format!(
        "Repeat mode set to '{}'",
        body.state
    ))))
}

/// POST /api/player/transfer
///
/// Transfer playback to a device
pub async fn transfer(
    state: web::Data<AppState>,
    body: web::Json<TransferRequest>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    spotify
        .transfer_playback(&access_token, &body.device_id, body.play)
        .await?;

    Ok(HttpResponse::Ok().json(SuccessResponse::new(&format!(
        "Playback transferred to device {}",
        body.device_id
    ))))
}

/// POST /api/player/queue
///
/// Add a track to the queue
pub async fn queue(
    state: web::Data<AppState>,
    body: web::Json<QueueRequest>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    let access_token = get_user_token(&state.db, authed.user_id()).await?;
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    spotify
        .add_to_queue(&access_token, &body.uri, body.device_id.as_deref())
        .await?;

    Ok(HttpResponse::Ok().json(SuccessResponse::new(&format!(
        "Added {} to queue",
        body.uri
    ))))
}
