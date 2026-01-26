use actix_cors::Cors;
use actix_web::{middleware, web, App, HttpServer};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod error;
mod handlers;
mod models;
mod spotify;
mod token_refresh;

use config::Config;
use token_refresh::TokenRefreshTask;

pub struct AppState {
    pub db: sqlx::PgPool,
    pub config: Config,
    pub http_client: reqwest::Client,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load environment variables
    dotenvy::dotenv().ok();

    // Load configuration
    let config = Config::from_env().expect("Failed to load configuration");

    // Create database connection pool
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await
        .expect("Failed to create database pool");

    // Run migrations (optional - you can also use sqlx-cli)
    tracing::info!("Running database migrations...");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    // Create HTTP client for Spotify API calls
    let http_client = reqwest::Client::new();

    // Start the token refresh background task
    let refresh_task = Arc::new(TokenRefreshTask::new(
        pool.clone(),
        config.clone(),
        http_client.clone(),
    ));
    refresh_task.start();
    tracing::info!("Token refresh task started (runs every 25 minutes)");

    let bind_address = format!("{}:{}", config.host, config.port);
    let frontend_url = config.frontend_url.clone();

    // Create shared app state
    let app_state = web::Data::new(AppState {
        db: pool,
        config,
        http_client,
    });

    tracing::info!("Starting server at http://{}", bind_address);

    HttpServer::new(move || {
        // Configure CORS
        let cors = Cors::default()
            .allowed_origin(&frontend_url)
            .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
            .allowed_headers(vec![
                actix_web::http::header::AUTHORIZATION,
                actix_web::http::header::ACCEPT,
                actix_web::http::header::CONTENT_TYPE,
            ])
            .supports_credentials()
            .max_age(3600);

        App::new()
            .app_data(app_state.clone())
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .service(
                web::scope("/api")
                    // Auth endpoints
                    .route("/auth", web::get().to(handlers::sessions::create))
                    .route("/login", web::post().to(handlers::users::create))
                    .route("/refresh", web::post().to(handlers::users::refresh))
                    // User endpoints
                    .route(
                        "/users/{display_name}",
                        web::get().to(handlers::users::show),
                    )
                    // Player/Remote control endpoints
                    .service(
                        web::scope("/player")
                            .route("/state", web::get().to(handlers::player::get_state))
                            .route(
                                "/currently-playing",
                                web::get().to(handlers::player::get_currently_playing),
                            )
                            .route("/devices", web::get().to(handlers::player::get_devices))
                            .route("/play", web::post().to(handlers::player::play))
                            .route("/pause", web::post().to(handlers::player::pause))
                            .route("/next", web::post().to(handlers::player::next))
                            .route("/previous", web::post().to(handlers::player::previous))
                            .route("/seek", web::post().to(handlers::player::seek))
                            .route("/volume", web::post().to(handlers::player::volume))
                            .route("/shuffle", web::post().to(handlers::player::shuffle))
                            .route("/repeat", web::post().to(handlers::player::repeat))
                            .route("/transfer", web::post().to(handlers::player::transfer))
                            .route("/queue", web::post().to(handlers::player::queue)),
                    ),
            )
    })
    .bind(&bind_address)?
    .run()
    .await
}
