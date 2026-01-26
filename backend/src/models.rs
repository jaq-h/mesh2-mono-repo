use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// User model representing a Spotify user in the database
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct User {
    pub id: i32,
    pub display_name: Option<String>,
    pub profile_img_url: Option<String>,
    pub spotify_id: Option<String>,
    pub spotify_url: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub email: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// User response DTO - excludes sensitive fields like refresh_token
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserResponse {
    pub id: i32,
    pub display_name: Option<String>,
    pub profile_img_url: Option<String>,
    pub spotify_id: Option<String>,
    pub spotify_url: Option<String>,
    pub access_token: Option<String>,
    pub email: Option<String>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        UserResponse {
            id: user.id,
            display_name: user.display_name,
            profile_img_url: user.profile_img_url,
            spotify_id: user.spotify_id,
            spotify_url: user.spotify_url,
            access_token: user.access_token,
            email: user.email,
        }
    }
}

/// Parameters for creating or finding a user
#[derive(Debug, Clone)]
pub struct CreateUserParams {
    pub display_name: String,
    pub spotify_url: String,
}

/// Parameters for updating a user's tokens and profile image
#[derive(Debug, Clone)]
pub struct UpdateUserParams {
    pub profile_img_url: Option<String>,
    pub access_token: String,
    pub refresh_token: String,
}

/// Session model (if needed for session tracking)
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Session {
    pub id: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Admin user model
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct AdminUser {
    pub id: i32,
    pub email: String,
    pub encrypted_password: String,
    pub reset_password_token: Option<String>,
    pub reset_password_sent_at: Option<DateTime<Utc>>,
    pub remember_created_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// Database operations for User
impl User {
    /// Find a user by display_name
    pub async fn find_by_display_name(
        pool: &sqlx::PgPool,
        display_name: &str,
    ) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            SELECT id, display_name, profile_img_url, spotify_id, spotify_url,
                   access_token, refresh_token, email, created_at, updated_at
            FROM users
            WHERE display_name = $1
            "#,
        )
        .bind(display_name)
        .fetch_optional(pool)
        .await
    }

    /// Find a user by spotify_url
    pub async fn find_by_spotify_url(
        pool: &sqlx::PgPool,
        spotify_url: &str,
    ) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            SELECT id, display_name, profile_img_url, spotify_id, spotify_url,
                   access_token, refresh_token, email, created_at, updated_at
            FROM users
            WHERE spotify_url = $1
            "#,
        )
        .bind(spotify_url)
        .fetch_optional(pool)
        .await
    }

    /// Find or create a user by display_name and spotify_url
    pub async fn find_or_create(
        pool: &sqlx::PgPool,
        params: &CreateUserParams,
    ) -> Result<User, sqlx::Error> {
        // First try to find existing user
        if let Some(user) = Self::find_by_spotify_url(pool, &params.spotify_url).await? {
            return Ok(user);
        }

        // Create new user if not found
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (display_name, spotify_url, created_at, updated_at)
            VALUES ($1, $2, NOW(), NOW())
            RETURNING id, display_name, profile_img_url, spotify_id, spotify_url,
                      access_token, refresh_token, email, created_at, updated_at
            "#,
        )
        .bind(&params.display_name)
        .bind(&params.spotify_url)
        .fetch_one(pool)
        .await?;

        Ok(user)
    }

    /// Update user's profile image and tokens
    pub async fn update_tokens(
        pool: &sqlx::PgPool,
        user_id: i32,
        params: &UpdateUserParams,
    ) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            UPDATE users
            SET profile_img_url = $1, access_token = $2, refresh_token = $3, updated_at = NOW()
            WHERE id = $4
            RETURNING id, display_name, profile_img_url, spotify_id, spotify_url,
                      access_token, refresh_token, email, created_at, updated_at
            "#,
        )
        .bind(&params.profile_img_url)
        .bind(&params.access_token)
        .bind(&params.refresh_token)
        .bind(user_id)
        .fetch_one(pool)
        .await
    }

    /// Find a user by ID
    pub async fn find_by_id(pool: &sqlx::PgPool, id: i32) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            SELECT id, display_name, profile_img_url, spotify_id, spotify_url,
                   access_token, refresh_token, email, created_at, updated_at
            FROM users
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Get all users
    pub async fn all(pool: &sqlx::PgPool) -> Result<Vec<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            SELECT id, display_name, profile_img_url, spotify_id, spotify_url,
                   access_token, refresh_token, email, created_at, updated_at
            FROM users
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(pool)
        .await
    }
}
