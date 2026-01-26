-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL DEFAULT '',
    encrypted_password VARCHAR(255) NOT NULL DEFAULT '',
    reset_password_token VARCHAR(255),
    reset_password_sent_at TIMESTAMPTZ,
    remember_created_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS index_admin_users_on_email ON admin_users(email);

-- Create unique index on reset_password_token
CREATE UNIQUE INDEX IF NOT EXISTS index_admin_users_on_reset_password_token ON admin_users(reset_password_token);
