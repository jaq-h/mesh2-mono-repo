//! Sessions handler for Spotify OAuth flow with PKCE
//!
//! Handles the initial OAuth setup by returning PKCE parameters
//! and the Spotify authorization URL for the frontend to use.

use actix_web::{web, HttpResponse};
use serde::Serialize;

use crate::error::AppResult;
use crate::spotify::{build_auth_url_pkce, PkceParams};
use crate::AppState;

/// Response containing PKCE parameters and auth URL for the frontend
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    /// The authorization URL to redirect the user to
    pub auth_url: String,
    /// The code verifier - frontend must store this and send it back during login
    pub code_verifier: String,
    /// The code challenge (for reference, already included in auth_url)
    pub code_challenge: String,
}

/// GET /api/auth
///
/// Returns PKCE parameters and the Spotify authorization URL.
/// The frontend should:
/// 1. Store the `code_verifier` in localStorage
/// 2. Redirect the user to `auth_url`
/// 3. After Spotify redirects back with a `code`, send both `code` and `code_verifier` to POST /api/login
///
/// Response:
/// ```json
/// {
///   "auth_url": "https://accounts.spotify.com/authorize?...",
///   "code_verifier": "random_64_char_string",
///   "code_challenge": "base64_sha256_hash"
/// }
/// ```
pub async fn create(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    // Generate PKCE parameters
    let pkce = PkceParams::new();

    // Build the authorization URL with the code challenge
    let auth_url = build_auth_url_pkce(&state.config, &pkce.code_challenge);

    tracing::info!("Generated PKCE auth params for Spotify authorization");

    let response = AuthResponse {
        auth_url,
        code_verifier: pkce.code_verifier,
        code_challenge: pkce.code_challenge,
    };

    Ok(HttpResponse::Ok().json(response))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spotify::generate_code_challenge;

    #[test]
    fn test_pkce_params_generation() {
        let pkce = PkceParams::new();

        // Verify code_verifier is 64 characters
        assert_eq!(pkce.code_verifier.len(), 64);

        // Verify code_challenge is derived correctly from code_verifier
        let expected_challenge = generate_code_challenge(&pkce.code_verifier);
        assert_eq!(pkce.code_challenge, expected_challenge);
    }
}
