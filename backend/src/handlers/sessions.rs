//! Sessions handler for the Spotify OAuth flow.
//!
//! Returns the public OAuth config the web client needs to build the Spotify
//! authorization URL itself. PKCE (verifier/challenge) and the `state` value are
//! generated client-side — the backend never sees the verifier until the code
//! exchange (SPEC-003).

use actix_web::{web, HttpResponse};
use serde::Serialize;

use crate::error::AppResult;
use crate::AppState;

/// Public OAuth configuration for the frontend. Contains no secrets and no PKCE
/// material.
#[derive(Debug, Serialize)]
pub struct AuthConfigResponse {
    /// Spotify application client id (public).
    pub client_id: String,
    /// Registered redirect URI the frontend must use.
    pub redirect_uri: String,
    /// Space-separated Spotify scopes to request.
    pub scopes: String,
}

/// GET /api/auth
///
/// Returns the public OAuth config. The frontend then:
/// 1. Generates a PKCE `code_verifier`/`code_challenge` and a random `state`.
/// 2. Stores the verifier + state (sessionStorage) and redirects the user to
///    Spotify's `/authorize` with the challenge + state.
/// 3. On callback, validates `state` and posts `code` + `code_verifier` to
///    `POST /api/login`.
///
/// Response:
/// ```json
/// {
///   "client_id": "…",
///   "redirect_uri": "http://127.0.0.1:5173/redirect",
///   "scopes": "streaming user-modify-playback-state …"
/// }
/// ```
pub async fn create(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let response = AuthConfigResponse {
        client_id: state.config.client_id.clone(),
        redirect_uri: state.config.redirect_uri.clone(),
        scopes: state.config.spotify_scopes().to_string(),
    };

    Ok(HttpResponse::Ok().json(response))
}
