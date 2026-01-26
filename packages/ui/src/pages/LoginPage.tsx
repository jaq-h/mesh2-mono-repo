// =============================================================================
// LoginPage - Shared Login Page Component
// =============================================================================

import React from "react";
import { useSpotify, useSpotifyAuth } from "../context/SpotifyContext";

// =============================================================================
// Types
// =============================================================================

export interface LoginPageProps {
  /**
   * App name to display
   * @default "Mesh"
   */
  appName?: string;

  /**
   * Subtitle text
   * @default "Control your Spotify playback from anywhere"
   */
  subtitle?: string;

  /**
   * Features to display
   */
  features?: Array<{
    icon: string;
    text: string;
  }>;

  /**
   * Note text at the bottom
   * @default "Requires a Spotify Premium account for full playback control"
   */
  note?: string;

  /**
   * Callback after successful login
   */
  onLoginSuccess?: () => void;

  /**
   * Callback when login fails
   */
  onLoginError?: (error: string) => void;

  /**
   * Custom class name
   */
  className?: string;

  /**
   * Custom logo element (defaults to emoji)
   */
  logo?: React.ReactNode;
}

// =============================================================================
// Default Features
// =============================================================================

const DEFAULT_FEATURES = [
  {
    icon: "🎧",
    text: "Control playback across all your devices",
  },
  {
    icon: "📱",
    text: "Works on desktop, mobile, and tablet",
  },
  {
    icon: "🔒",
    text: "Secure OAuth authentication with Spotify",
  },
];

// =============================================================================
// Component
// =============================================================================

export function LoginPage({
  appName = "Mesh",
  subtitle = "Control your Spotify playback from anywhere",
  features = DEFAULT_FEATURES,
  note = "Requires a Spotify Premium account for full playback control",
  onLoginSuccess,
  onLoginError,
  className = "",
  logo,
}: LoginPageProps) {
  const { isAuthenticated } = useSpotify();
  const { login, isLoading, error, clearError } = useSpotifyAuth();

  // If already authenticated, show a simple redirect message
  if (isAuthenticated) {
    return (
      <div className={`login-page login-page--authenticated ${className}`}>
        <p>You're already logged in!</p>
        <a href="/player">Go to Player →</a>
      </div>
    );
  }

  const handleLogin = async () => {
    clearError();
    try {
      await login();
      onLoginSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      console.error("Login error:", err);
      onLoginError?.(message);
    }
  };

  return (
    <div className={`login-page ${className}`}>
      <div className="login-page__container">
        {/* Logo / Title */}
        <div className="login-page__header">
          <div className="login-page__logo">{logo || "🎵"}</div>
          <h1 className="login-page__title">{appName}</h1>
          <p className="login-page__subtitle">{subtitle}</p>
        </div>

        {/* Features */}
        {features.length > 0 && (
          <div className="login-page__features">
            {features.map((feature, index) => (
              <div key={index} className="login-page__feature">
                <span className="login-page__feature-icon">{feature.icon}</span>
                <span className="login-page__feature-text">{feature.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="login-page__error" role="alert">
            <span className="login-page__error-icon">⚠️</span>
            <span className="login-page__error-text">{error}</span>
            <button
              className="login-page__error-dismiss"
              onClick={clearError}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {/* Login Button */}
        <button
          className="login-page__button"
          onClick={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className="login-page__spinner" />
              Connecting...
            </>
          ) : (
            <>
              <SpotifyIcon />
              Connect with Spotify
            </>
          )}
        </button>

        {/* Note */}
        {note && <p className="login-page__note">{note}</p>}
      </div>
    </div>
  );
}

// =============================================================================
// Spotify Icon Component
// =============================================================================

function SpotifyIcon() {
  return (
    <svg
      className="login-page__spotify-icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="24"
      height="24"
    >
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

// =============================================================================
// Default Export
// =============================================================================

export default LoginPage;
