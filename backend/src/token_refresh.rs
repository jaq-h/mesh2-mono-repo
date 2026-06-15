//! Token refresh background task
//!
//! This module provides a background task that automatically refreshes
//! Spotify access tokens every 25 minutes to ensure they don't expire.
//! Spotify tokens expire after 1 hour, so refreshing at 25 minutes
//! provides a safe margin.

use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;
use tokio::time::interval;

use crate::config::Config;
use crate::models::User;
use crate::spotify::SpotifyApiAdapter;

/// Interval between token refresh cycles (25 minutes)
const REFRESH_INTERVAL_SECS: u64 = 25 * 60;

/// Token refresh task state
pub struct TokenRefreshTask {
    pool: PgPool,
    config: Config,
    http_client: reqwest::Client,
}

impl TokenRefreshTask {
    /// Create a new token refresh task
    pub fn new(pool: PgPool, config: Config, http_client: reqwest::Client) -> Self {
        Self {
            pool,
            config,
            http_client,
        }
    }

    /// Start the background token refresh task
    ///
    /// This spawns a tokio task that runs indefinitely, refreshing tokens
    /// for all users every 25 minutes.
    pub fn start(self: Arc<Self>) {
        tokio::spawn(async move {
            tracing::info!(
                "Starting token refresh task (interval: {} seconds)",
                REFRESH_INTERVAL_SECS
            );

            let mut ticker = interval(Duration::from_secs(REFRESH_INTERVAL_SECS));

            loop {
                ticker.tick().await;
                tracing::info!("Running scheduled token refresh...");

                if let Err(e) = self.refresh_all_tokens().await {
                    tracing::error!("Token refresh cycle failed: {}", e);
                }
            }
        });
    }

    /// Refresh tokens for all users that have a refresh token
    pub async fn refresh_all_tokens(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Get all users with refresh tokens
        let users = self.get_users_with_refresh_tokens().await?;

        if users.is_empty() {
            tracing::debug!("No users with refresh tokens found");
            return Ok(());
        }

        tracing::info!("Refreshing tokens for {} users", users.len());

        let mut success_count = 0;
        let mut error_count = 0;

        for user in users {
            match self.refresh_user_token(&user).await {
                Ok(_) => {
                    success_count += 1;
                    tracing::debug!(
                        "Successfully refreshed token for user: {:?}",
                        user.display_name
                    );
                }
                Err(e) => {
                    error_count += 1;
                    tracing::warn!(
                        "Failed to refresh token for user {:?}: {}",
                        user.display_name,
                        e
                    );
                }
            }
        }

        tracing::info!(
            "Token refresh complete: {} succeeded, {} failed",
            success_count,
            error_count
        );

        Ok(())
    }

    /// Get all users that have a refresh token stored
    async fn get_users_with_refresh_tokens(
        &self,
    ) -> Result<Vec<User>, Box<dyn std::error::Error + Send + Sync>> {
        let users = sqlx::query_as::<_, User>(
            r#"
            SELECT id, display_name, profile_img_url, spotify_id, spotify_url,
                   access_token, refresh_token, email, created_at, updated_at
            FROM users
            WHERE refresh_token IS NOT NULL
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(users)
    }

    /// Refresh a single user's access token
    async fn refresh_user_token(
        &self,
        user: &User,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let refresh_token = user
            .refresh_token
            .as_ref()
            .ok_or("User has no refresh token")?;

        let spotify = SpotifyApiAdapter::new(&self.http_client, &self.config);

        // Call Spotify API to refresh the token
        let token_response = spotify.refresh_token(refresh_token).await?;

        // Update the user's tokens in the database
        // Note: Spotify may return a new refresh token, or the same one
        let new_refresh_token = token_response
            .refresh_token
            .as_ref()
            .unwrap_or(refresh_token);

        sqlx::query(
            r#"
            UPDATE users
            SET access_token = $1, refresh_token = $2, updated_at = NOW()
            WHERE id = $3
            "#,
        )
        .bind(&token_response.access_token)
        .bind(new_refresh_token)
        .bind(user.id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

/// Convenience function to start the token refresh task
///
/// # Arguments
/// * `pool` - Database connection pool
/// * `config` - Application configuration
/// * `http_client` - HTTP client for API calls
///
/// # Example
/// ```ignore
/// use mesh_backend::token_refresh::start_token_refresh_task;
///
/// start_token_refresh_task(pool.clone(), config.clone(), http_client.clone());
/// ```
pub fn start_token_refresh_task(pool: PgPool, config: Config, http_client: reqwest::Client) {
    let task = Arc::new(TokenRefreshTask::new(pool, config, http_client));
    task.start();
}

/// Manually trigger a token refresh for a specific user
///
/// This can be called when a user's token is detected as expired
/// during an API call, allowing for immediate refresh.
pub async fn refresh_user_token_now(
    pool: &PgPool,
    config: &Config,
    http_client: &reqwest::Client,
    user_id: i32,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // Get the user
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, display_name, profile_img_url, spotify_id, spotify_url,
               access_token, refresh_token, email, created_at, updated_at
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or("User not found")?;

    let refresh_token = user
        .refresh_token
        .as_ref()
        .ok_or("User has no refresh token")?;

    let spotify = SpotifyApiAdapter::new(http_client, config);

    // Refresh the token
    let token_response = spotify.refresh_token(refresh_token).await?;

    // Update database
    let new_refresh_token = token_response
        .refresh_token
        .as_ref()
        .unwrap_or(refresh_token);

    sqlx::query(
        r#"
        UPDATE users
        SET access_token = $1, refresh_token = $2, updated_at = NOW()
        WHERE id = $3
        "#,
    )
    .bind(&token_response.access_token)
    .bind(new_refresh_token)
    .bind(user_id)
    .execute(pool)
    .await?;

    tracing::info!("Manually refreshed token for user_id: {}", user_id);

    Ok(token_response.access_token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_refresh_interval() {
        // Verify refresh interval is 25 minutes (1500 seconds)
        assert_eq!(REFRESH_INTERVAL_SECS, 25 * 60);
        assert_eq!(REFRESH_INTERVAL_SECS, 1500);
    }
}
