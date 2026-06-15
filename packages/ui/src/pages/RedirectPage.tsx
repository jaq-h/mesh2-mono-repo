// =============================================================================
// RedirectPage - OAuth Callback Handler
// =============================================================================

import React, { useEffect, useState, useRef } from "react";
import { useSpotifyAuth } from "../context/SpotifyContext";

// =============================================================================
// Types
// =============================================================================

export interface RedirectPageProps {
  /**
   * App name to display
   * @default "Mesh"
   */
  appName?: string;

  /**
   * Get the authorization code from the current URL
   * This allows different routing implementations
   */
  getAuthCode: () => string | null;

  /**
   * Get the OAuth `state` param from the current URL, validated against the
   * stored value to guard against CSRF.
   */
  getAuthState?: () => string | null;

  /**
   * Get any error from the OAuth response
   */
  getAuthError?: () => { error: string; description?: string } | null;

  /**
   * Callback when auth is successful - typically used for navigation
   */
  onSuccess: () => void;

  /**
   * Callback when auth fails - typically used for navigation
   */
  onError: (error: string) => void;

  /**
   * Custom class name
   */
  className?: string;

  /**
   * Custom logo element
   */
  logo?: React.ReactNode;
}

// =============================================================================
// Component
// =============================================================================

export function RedirectPage({
  appName = "Mesh",
  getAuthCode,
  getAuthState,
  getAuthError,
  onSuccess,
  onError,
  className = "",
  logo,
}: RedirectPageProps) {
  const { handleCallback, isLoading, error: authError } = useSpotifyAuth();

  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Use ref to prevent double-processing in strict mode
  const processedRef = useRef(false);

  useEffect(() => {
    // Prevent double-processing
    if (processedRef.current) return;
    processedRef.current = true;

    const processCallback = async () => {
      // Check for error from OAuth provider
      if (getAuthError) {
        const oauthError = getAuthError();
        if (oauthError) {
          console.error("OAuth error:", oauthError);
          setErrorMessage(oauthError.description || oauthError.error);
          setStatus("error");
          return;
        }
      }

      // Get the authorization code
      const code = getAuthCode();
      if (!code) {
        setErrorMessage("No authorization code received");
        setStatus("error");
        return;
      }

      // Get the state param (validated against the stored value for CSRF)
      const state = getAuthState?.() ?? undefined;

      try {
        // Process the callback (validates state, then exchanges code for tokens)
        await handleCallback(code, state);
        setStatus("success");

        // Give UI a moment to show success, then navigate
        setTimeout(() => {
          onSuccess();
        }, 1000);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Authentication failed";
        console.error("OAuth callback error:", err);
        setErrorMessage(message);
        setStatus("error");
      }
    };

    processCallback();
  }, [getAuthCode, getAuthState, getAuthError, handleCallback, onSuccess]);

  // ==========================================================================
  // Render based on status
  // ==========================================================================

  if (status === "error" || authError) {
    return (
      <div className={`redirect-page redirect-page--error ${className}`}>
        <div className="redirect-page__container">
          <div className="redirect-page__icon redirect-page__icon--error">
            ❌
          </div>
          <h1 className="redirect-page__title">Authentication Failed</h1>
          <p className="redirect-page__message">
            {errorMessage || authError || "An unknown error occurred"}
          </p>
          <div className="redirect-page__actions">
            <button
              className="redirect-page__button redirect-page__button--primary"
              onClick={() =>
                onError(errorMessage || authError || "Unknown error")
              }
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className={`redirect-page redirect-page--success ${className}`}>
        <div className="redirect-page__container">
          <div className="redirect-page__icon redirect-page__icon--success">
            ✓
          </div>
          <h1 className="redirect-page__title">Success!</h1>
          <p className="redirect-page__message">
            You've been authenticated. Redirecting to the player...
          </p>
          <div className="redirect-page__spinner" />
        </div>
      </div>
    );
  }

  // Processing state
  return (
    <div className={`redirect-page redirect-page--processing ${className}`}>
      <div className="redirect-page__container">
        <div className="redirect-page__logo">{logo || "🎵"}</div>
        <h1 className="redirect-page__title">{appName}</h1>
        <div className="redirect-page__spinner" />
        <p className="redirect-page__message">
          {isLoading ? "Completing authentication..." : "Processing..."}
        </p>
        <p className="redirect-page__submessage">
          Please wait while we connect your Spotify account
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Default Export
// =============================================================================

export default RedirectPage;
