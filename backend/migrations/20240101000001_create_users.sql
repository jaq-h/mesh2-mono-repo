-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    display_name VARCHAR(255),
    profile_img_url TEXT,
    spotify_id VARCHAR(255),
    spotify_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);
CREATE INDEX IF NOT EXISTS idx_users_spotify_id ON users(spotify_id);
CREATE INDEX IF NOT EXISTS idx_users_spotify_url ON users(spotify_url);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
