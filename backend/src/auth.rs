//! Mesh session authentication (JWT).
//!
//! Identity for every authenticated endpoint comes from a signed Mesh session
//! token issued at login — never from request parameters. See SPEC-001.

use std::future::{ready, Ready};

use actix_web::{dev::Payload, http::header, web, FromRequest, HttpRequest};
use anyhow::{Context, Result};
use chrono::Utc;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::error::AppError;
use crate::models::User;
use crate::AppState;

/// Session lifetime. The Mesh token intentionally outlives the Spotify access
/// token so `/api/refresh` still works after Spotify auth lapses.
const TOKEN_TTL_DAYS: i64 = 7;

/// Fixed signing algorithm. Hard-coded (not configurable) to avoid
/// algorithm-confusion attacks.
const ALGORITHM: Algorithm = Algorithm::HS256;

/// Claims carried by a Mesh session token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject — `users.id` (primary key).
    pub sub: i32,
    /// Spotify user id (informational; authorization uses `sub`).
    pub spotify_id: String,
    /// Issued-at (unix seconds).
    pub iat: i64,
    /// Expiry (unix seconds).
    pub exp: i64,
}

/// Issue a signed Mesh session token for a user.
pub fn issue(user: &User, config: &Config) -> Result<String> {
    let now = Utc::now();
    let exp = now + chrono::Duration::days(TOKEN_TTL_DAYS);

    let claims = Claims {
        sub: user.id,
        spotify_id: user.spotify_id.clone().unwrap_or_default(),
        iat: now.timestamp(),
        exp: exp.timestamp(),
    };

    encode(
        &Header::new(ALGORITHM),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .context("failed to encode Mesh session token")
}

/// Validate a Mesh session token, returning its claims.
///
/// Standalone (not only the extractor) so the SPEC-031 WebSocket handler can
/// authenticate the `hello` frame directly.
pub fn validate(token: &str, config: &Config) -> Result<Claims, jsonwebtoken::errors::Error> {
    let validation = Validation::new(ALGORITHM);
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &validation,
    )?;
    Ok(data.claims)
}

/// Authenticated caller, extracted from the `Authorization: Bearer <jwt>` header.
///
/// `.0` = `users.id`, `.1` = Spotify user id.
pub struct AuthedUser(pub i32, pub String);

impl AuthedUser {
    /// The acting user's primary key.
    pub fn user_id(&self) -> i32 {
        self.0
    }

    /// The acting user's Spotify id (may be empty until SPEC-002 backfills it).
    #[allow(dead_code)]
    pub fn spotify_id(&self) -> &str {
        &self.1
    }
}

impl FromRequest for AuthedUser {
    type Error = AppError;
    type Future = Ready<Result<Self, AppError>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        ready(authed_from_request(req))
    }
}

fn authed_from_request(req: &HttpRequest) -> Result<AuthedUser, AppError> {
    let state = req
        .app_data::<web::Data<AppState>>()
        .ok_or_else(|| AppError::InternalError("application state unavailable".to_string()))?;

    let raw = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    let token = parse_bearer(raw)?;

    let claims = validate(token, &state.config)
        .map_err(|_| AppError::Unauthorized("Invalid or expired token".to_string()))?;

    Ok(AuthedUser(claims.sub, claims.spotify_id))
}

/// Pull the bare token out of a raw `Authorization` header value.
/// Pure (no app state) so it is unit-testable without a request/DB.
fn parse_bearer(raw: Option<&str>) -> Result<&str, AppError> {
    let raw =
        raw.ok_or_else(|| AppError::Unauthorized("Missing Authorization header".to_string()))?;

    raw.strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .ok_or_else(|| {
            AppError::Unauthorized("Authorization header must be 'Bearer <token>'".to_string())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config(secret: &str) -> Config {
        Config {
            client_id: "id".into(),
            client_secret: "secret".into(),
            redirect_uri: "http://127.0.0.1:8080/callback".into(),
            database_url: "postgres://localhost/test".into(),
            jwt_secret: secret.into(),
            host: "127.0.0.1".into(),
            port: 8080,
            frontend_url: "http://localhost:3000".into(),
        }
    }

    fn test_user(id: i32) -> User {
        let now = Utc::now();
        User {
            id,
            display_name: Some("Tester".into()),
            profile_img_url: None,
            spotify_id: Some("spotify-abc".into()),
            spotify_url: Some("https://open.spotify.com/user/abc".into()),
            access_token: Some("access".into()),
            refresh_token: Some("refresh".into()),
            email: None,
            created_at: now,
            updated_at: now,
        }
    }

    fn encode_with_exp(config: &Config, exp: i64) -> String {
        let claims = Claims {
            sub: 7,
            spotify_id: "spotify-abc".into(),
            iat: Utc::now().timestamp(),
            exp,
        };
        encode(
            &Header::new(ALGORITHM),
            &claims,
            &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
        )
        .unwrap()
    }

    #[test]
    fn issue_then_validate_round_trips() {
        let config = test_config("super-secret");
        let token = issue(&test_user(42), &config).unwrap();
        let claims = validate(&token, &config).unwrap();
        assert_eq!(claims.sub, 42);
        assert_eq!(claims.spotify_id, "spotify-abc");
        assert!(claims.exp > claims.iat);
    }

    #[test]
    fn garbage_token_is_rejected() {
        let config = test_config("super-secret");
        assert!(validate("not.a.jwt", &config).is_err());
        assert!(validate("", &config).is_err());
    }

    #[test]
    fn expired_token_is_rejected() {
        let config = test_config("super-secret");
        let expired = encode_with_exp(&config, Utc::now().timestamp() - 10_000);
        assert!(validate(&expired, &config).is_err());
    }

    #[test]
    fn wrong_secret_is_rejected() {
        let signed = encode_with_exp(&test_config("secret-a"), Utc::now().timestamp() + 10_000);
        assert!(validate(&signed, &test_config("secret-b")).is_err());
    }

    #[test]
    fn parse_bearer_accepts_valid_header() {
        assert_eq!(parse_bearer(Some("Bearer abc.def.ghi")).unwrap(), "abc.def.ghi");
    }

    #[test]
    fn parse_bearer_rejects_missing_and_malformed() {
        assert!(parse_bearer(None).is_err());
        assert!(parse_bearer(Some("Bearer ")).is_err());
        assert!(parse_bearer(Some("Bearer    ")).is_err());
        assert!(parse_bearer(Some("Basic abc")).is_err());
        assert!(parse_bearer(Some("abc.def.ghi")).is_err());
    }
}
