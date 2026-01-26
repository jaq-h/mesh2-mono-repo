use actix_web::{HttpResponse, ResponseError};
use std::error::Error as StdError;
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    // Database errors
    DatabaseError(String),
    NotFound(String),

    // Spotify API errors
    SpotifyAuthError(String),
    SpotifyApiError(String),

    // Request errors
    BadRequest(String),
    Unauthorized(String),

    // Internal errors
    InternalError(String),
    ConfigError(String),

    // HTTP client errors
    HttpClientError(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::DatabaseError(msg) => write!(f, "Database error: {}", msg),
            AppError::NotFound(msg) => write!(f, "Not found: {}", msg),
            AppError::SpotifyAuthError(msg) => write!(f, "Spotify authentication error: {}", msg),
            AppError::SpotifyApiError(msg) => write!(f, "Spotify API error: {}", msg),
            AppError::BadRequest(msg) => write!(f, "Bad request: {}", msg),
            AppError::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            AppError::InternalError(msg) => write!(f, "Internal error: {}", msg),
            AppError::ConfigError(msg) => write!(f, "Configuration error: {}", msg),
            AppError::HttpClientError(msg) => write!(f, "HTTP client error: {}", msg),
        }
    }
}

impl StdError for AppError {}

impl ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        let error_body = serde_json::json!({
            "error": self.to_string()
        });

        match self {
            AppError::NotFound(_) => HttpResponse::NotFound().json(error_body),
            AppError::BadRequest(_) => HttpResponse::BadRequest().json(error_body),
            AppError::Unauthorized(_) | AppError::SpotifyAuthError(_) => {
                HttpResponse::Unauthorized().json(error_body)
            }
            AppError::DatabaseError(_)
            | AppError::SpotifyApiError(_)
            | AppError::InternalError(_)
            | AppError::ConfigError(_)
            | AppError::HttpClientError(_) => HttpResponse::InternalServerError().json(error_body),
        }
    }
}

// Implement From traits for common error types

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AppError::NotFound("Record not found".to_string()),
            _ => AppError::DatabaseError(err.to_string()),
        }
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::HttpClientError(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::InternalError(format!("JSON serialization error: {}", err))
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::InternalError(err.to_string())
    }
}

impl From<jsonwebtoken::errors::Error> for AppError {
    fn from(err: jsonwebtoken::errors::Error) -> Self {
        AppError::Unauthorized(format!("JWT error: {}", err))
    }
}

pub type AppResult<T> = Result<T, AppError>;
