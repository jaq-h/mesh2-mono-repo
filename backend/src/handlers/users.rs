//! User handlers for authentication and user management
//!
//! Handles:
//! - POST /api/login - Exchange Spotify auth code for user session (with PKCE)
//! - POST /api/refresh - Refresh access token using refresh token
//! - GET /api/users/{display_name} - Get user's currently playing track

use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};

use crate::auth::{issue, AuthedUser};
use crate::error::{AppError, AppResult};
use crate::models::{CreateUserParams, UpdateUserParams, User, UserResponse};
use crate::spotify::{AuthenticatedUserResponse, SpotifyApiAdapter};
use crate::AppState;

/// Request body for login endpoint (PKCE flow)
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    /// The authorization code received from Spotify
    pub code: String,
    /// The PKCE code verifier (must match the code_challenge used in /api/auth)
    pub code_verifier: String,
}

/// Request body for token refresh endpoint
#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    /// The refresh token from a previous login
    pub refresh_token: String,
}

/// Response for token refresh endpoint
#[derive(Debug, Serialize)]
pub struct RefreshResponse {
    pub access_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    pub expires_in: i64,
}

/// Login response: the Spotify-profile-and-tokens payload the frontend already
/// expects (flattened to top level), plus the Mesh session token issued for
/// this user. Send it back as `Authorization: Bearer <mesh_token>`.
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    #[serde(flatten)]
    pub user: AuthenticatedUserResponse,
    pub mesh_token: String,
}

/// POST /api/login
///
/// Exchanges Spotify authorization code for access tokens using PKCE,
/// fetches user profile from Spotify, and creates/updates user in database.
///
/// Request body:
/// ```json
/// {
///   "code": "spotify_authorization_code",
///   "code_verifier": "the_pkce_code_verifier_from_auth_step"
/// }
/// ```
///
/// Returns the authenticated user with Spotify profile and tokens
/// (format matches frontend's AuthenticatedUser interface)
pub async fn create(
    state: web::Data<AppState>,
    body: web::Json<LoginRequest>,
) -> AppResult<HttpResponse> {
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    // Exchange authorization code for tokens using PKCE
    let auth_params = spotify
        .login_with_pkce(&body.code, &body.code_verifier)
        .await?;

    // Get user profile from Spotify
    let user_data = spotify.get_user_data(&auth_params.access_token).await?;

    // Extract profile image URL (first image if available)
    let img_url = user_data
        .images
        .as_ref()
        .and_then(|images| images.first())
        .map(|img| img.url.clone());

    // Build create user params
    let create_params = CreateUserParams {
        display_name: user_data
            .display_name
            .clone()
            .unwrap_or_else(|| user_data.id.clone()),
        spotify_url: user_data.external_urls.spotify.clone(),
    };

    // Find or create user in database
    let user = User::find_or_create(&state.db, &create_params).await?;

    // Update user with new tokens and profile image
    let update_params = UpdateUserParams {
        profile_img_url: img_url,
        access_token: auth_params.access_token.clone(),
        refresh_token: auth_params.refresh_token.clone().unwrap_or_default(),
    };

    let _updated_user = User::update_tokens(&state.db, user.id, &update_params).await?;

    // Issue a Mesh session JWT — identity for every subsequent authenticated call.
    let mesh_token = issue(&user, &state.config)?;

    // Return the Spotify user profile with tokens (frontend-compatible format),
    // with the Mesh session token flattened alongside.
    let response = LoginResponse {
        user: AuthenticatedUserResponse::from_profile_and_tokens(user_data, &auth_params),
        mesh_token,
    };

    Ok(HttpResponse::Ok().json(response))
}

/// POST /api/refresh
///
/// Refreshes an access token using a refresh token.
///
/// Request body:
/// ```json
/// {
///   "refresh_token": "the_refresh_token_from_login"
/// }
/// ```
///
/// Returns new access token (and possibly new refresh token)
pub async fn refresh(
    state: web::Data<AppState>,
    body: web::Json<RefreshRequest>,
    _authed: AuthedUser,
) -> AppResult<HttpResponse> {
    // Requires a valid Mesh session (the JWT outlives the Spotify access token).
    // SPEC-002 will persist the rotated refresh token using `_authed.user_id()`.
    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    // Refresh the token via Spotify API
    let token_response = spotify.refresh_token(&body.refresh_token).await?;

    let response = RefreshResponse {
        access_token: token_response.access_token,
        refresh_token: token_response.refresh_token,
        expires_in: token_response.expires_in,
    };

    Ok(HttpResponse::Ok().json(response))
}

/// Path parameters for user show endpoint
#[derive(Debug, Deserialize)]
pub struct UserPath {
    pub display_name: String,
}

/// GET /api/users/{display_name}
///
/// Gets the user by display name and returns their currently playing track from Spotify.
///
/// Returns the currently playing data from Spotify API
pub async fn show(
    state: web::Data<AppState>,
    path: web::Path<UserPath>,
    authed: AuthedUser,
) -> AppResult<HttpResponse> {
    // Find user by display name
    let user = User::find_by_display_name(&state.db, &path.display_name)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("User '{}' not found", path.display_name)))?;

    // TODO(SPEC-001): public "share my now-playing" needs an opt-in share token.
    // Until that exists, callers may only view their own playback.
    if user.id != authed.user_id() {
        return Err(AppError::Unauthorized(
            "You can only view your own playback".to_string(),
        ));
    }

    // Get access token
    let access_token = user.access_token.ok_or_else(|| {
        AppError::Unauthorized("User has no access token. Please login again.".to_string())
    })?;

    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);

    // Get currently playing from Spotify
    let now_playing = spotify.currently_playing(&access_token).await?;

    match now_playing {
        Some(playing) => Ok(HttpResponse::Ok().json(playing)),
        None => Ok(HttpResponse::Ok().json(serde_json::json!({
            "is_playing": false,
            "message": "Nothing currently playing"
        }))),
    }
}

/// GET /api/users (optional - list all users)
#[allow(dead_code)]
pub async fn index(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let users = User::all(&state.db).await?;
    let responses: Vec<UserResponse> = users.into_iter().map(|u| u.into()).collect();
    Ok(HttpResponse::Ok().json(responses))
}

/// GET /api/users/{display_name}/top-tracks (optional - get user's top tracks)
#[allow(dead_code)]
pub async fn top_tracks(
    state: web::Data<AppState>,
    path: web::Path<UserPath>,
) -> AppResult<HttpResponse> {
    let user = User::find_by_display_name(&state.db, &path.display_name)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("User '{}' not found", path.display_name)))?;

    let access_token = user.access_token.ok_or_else(|| {
        AppError::Unauthorized("User has no access token. Please login again.".to_string())
    })?;

    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);
    let top_tracks = spotify.get_top_tracks(&access_token, None, None).await?;

    Ok(HttpResponse::Ok().json(top_tracks))
}

/// GET /api/users/{display_name}/recently-played (optional - get user's recently played)
#[allow(dead_code)]
pub async fn recently_played(
    state: web::Data<AppState>,
    path: web::Path<UserPath>,
) -> AppResult<HttpResponse> {
    let user = User::find_by_display_name(&state.db, &path.display_name)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("User '{}' not found", path.display_name)))?;

    let access_token = user.access_token.ok_or_else(|| {
        AppError::Unauthorized("User has no access token. Please login again.".to_string())
    })?;

    let spotify = SpotifyApiAdapter::new(&state.http_client, &state.config);
    let recently_played = spotify.get_recently_played(&access_token, None).await?;

    Ok(HttpResponse::Ok().json(recently_played))
}
