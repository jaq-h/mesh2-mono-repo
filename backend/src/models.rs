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

/// Parameters for the login upsert (create-or-refresh, keyed on `spotify_id`).
#[derive(Debug, Clone)]
pub struct CreateUserParams {
    pub spotify_id: String,
    pub display_name: Option<String>,
    pub spotify_url: String,
    pub profile_img_url: Option<String>,
    pub access_token: String,
    /// `None`/empty leaves any stored refresh token untouched on upsert.
    pub refresh_token: Option<String>,
    pub email: Option<String>,
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

    /// Create-or-refresh a user on login, keyed on the stable `spotify_id`.
    ///
    /// First login inserts the row; later logins refresh the profile and tokens.
    /// A `None`/empty refresh token never overwrites a stored one. Atomic and
    /// race-safe against concurrent first logins (relies on the
    /// `users_spotify_id_key` unique index).
    pub async fn upsert_from_login(
        pool: &sqlx::PgPool,
        params: &CreateUserParams,
    ) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (spotify_id, display_name, spotify_url, profile_img_url,
                               access_token, refresh_token, email, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, NOW(), NOW())
            ON CONFLICT (spotify_id) DO UPDATE SET
                display_name    = EXCLUDED.display_name,
                spotify_url     = EXCLUDED.spotify_url,
                profile_img_url = EXCLUDED.profile_img_url,
                access_token    = EXCLUDED.access_token,
                refresh_token   = COALESCE(NULLIF(EXCLUDED.refresh_token, ''), users.refresh_token),
                email           = COALESCE(EXCLUDED.email, users.email),
                updated_at      = NOW()
            RETURNING id, display_name, profile_img_url, spotify_id, spotify_url,
                      access_token, refresh_token, email, created_at, updated_at
            "#,
        )
        .bind(&params.spotify_id)
        .bind(&params.display_name)
        .bind(&params.spotify_url)
        .bind(&params.profile_img_url)
        .bind(&params.access_token)
        .bind(params.refresh_token.as_deref().unwrap_or(""))
        .bind(&params.email)
        .fetch_one(pool)
        .await
    }

    /// Persist rotated tokens after a refresh. A `None`/empty new refresh token
    /// leaves the stored one untouched (Spotify does not always rotate it).
    pub async fn persist_refreshed_tokens(
        pool: &sqlx::PgPool,
        user_id: i32,
        access_token: &str,
        refresh_token: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE users
            SET access_token = $1,
                refresh_token = COALESCE(NULLIF($2, ''), refresh_token),
                updated_at = NOW()
            WHERE id = $3
            "#,
        )
        .bind(access_token)
        .bind(refresh_token.unwrap_or(""))
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(())
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
