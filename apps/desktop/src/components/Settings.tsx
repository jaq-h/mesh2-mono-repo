// =============================================================================
// Settings Component - Configure now playing data source and polling
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// =============================================================================
// Types
// =============================================================================

type NowPlayingSource = "api_only" | "os_only" | "hybrid";
type PollingIntervalPreset = "disabled" | "low" | "medium" | "high" | "custom";
type PollingInterval = PollingIntervalPreset | { custom: number };

interface AppSettings {
  now_playing_source: NowPlayingSource;
  polling_interval: PollingInterval;
  verify_same_user: boolean;
  spotify_user_id?: string;
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [_settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OS status
  const [spotifyRunning, setSpotifyRunning] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Local state for form
  const [nowPlayingSource, setNowPlayingSource] =
    useState<NowPlayingSource>("api_only");
  const [pollingInterval, setPollingInterval] =
    useState<PollingIntervalPreset>("high");
  const [verifySameUser, setVerifySameUser] = useState(true);
  const [customIntervalMs, setCustomIntervalMs] = useState(5000);

  // Load settings on mount
  // Load settings when opened
  useEffect(() => {
    if (isOpen) {
      loadSettings();
      checkStatusOnce();
    }
  }, [isOpen]);

  // Periodically check Spotify running status while open (not auth - that's expensive)
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(checkSpotifyRunning, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Check Spotify running status only (for periodic polling)
  const checkSpotifyRunning = async () => {
    try {
      const running = await invoke<boolean>("check_spotify_running");
      setSpotifyRunning(running);
    } catch (e) {
      console.error("Failed to check Spotify status:", e);
    }
  };

  // Check full status once (including auth)
  const checkStatusOnce = async () => {
    try {
      const running = await invoke<boolean>("check_spotify_running");
      setSpotifyRunning(running);

      const auth = await invoke<boolean>("is_authenticated");
      setIsAuthenticated(auth);
    } catch (e) {
      console.error("Failed to check status:", e);
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await invoke<AppSettings>("get_settings");
      setSettings(s);
      setNowPlayingSource(s.now_playing_source);
      setVerifySameUser(s.verify_same_user);

      // Handle polling interval (could be string preset or custom object)
      if (
        typeof s.polling_interval === "object" &&
        "custom" in s.polling_interval
      ) {
        setPollingInterval("custom");
        setCustomIntervalMs(s.polling_interval.custom);
      } else {
        setPollingInterval(s.polling_interval as PollingIntervalPreset);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const newSettings: AppSettings = {
        now_playing_source: nowPlayingSource,
        polling_interval:
          pollingInterval === "custom"
            ? { custom: customIntervalMs }
            : pollingInterval,
        verify_same_user: verifySameUser,
      };
      await invoke("update_settings", { settings: newSettings });
      setSettings(newSettings);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [
    nowPlayingSource,
    pollingInterval,
    verifySameUser,
    customIntervalMs,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? (
          <div className="settings-loading">Loading settings...</div>
        ) : (
          <div className="settings-content">
            {error && <div className="settings-error">{error}</div>}

            {/* Status Section */}
            <div className="settings-section status-section">
              <h3>Status</h3>
              <div className="status-indicators">
                <div className="status-item">
                  <span
                    className={`status-dot ${spotifyRunning ? "status-ok" : "status-error"}`}
                  />
                  <span className="status-label">
                    Spotify App:{" "}
                    {spotifyRunning === null
                      ? "Checking..."
                      : spotifyRunning
                        ? "Running"
                        : "Not Running"}
                  </span>
                </div>
                <div className="status-item">
                  <span
                    className={`status-dot ${isAuthenticated ? "status-ok" : "status-warning"}`}
                  />
                  <span className="status-label">
                    API Auth:{" "}
                    {isAuthenticated === null
                      ? "Checking..."
                      : isAuthenticated
                        ? "Connected"
                        : "Not Connected"}
                  </span>
                </div>
              </div>
            </div>

            {/* Now Playing Source */}
            <div className="settings-section">
              <h3>Now Playing Data Source</h3>
              <p className="settings-description">
                Choose where to get the currently playing track information.
              </p>

              <div className="settings-options">
                <label className="settings-option">
                  <input
                    type="radio"
                    name="nowPlayingSource"
                    value="api_only"
                    checked={nowPlayingSource === "api_only"}
                    onChange={() => setNowPlayingSource("api_only")}
                  />
                  <div className="option-content">
                    <span className="option-title">API Only</span>
                    <span className="option-desc">
                      Use Spotify Web API for all data. Requires login.
                    </span>
                  </div>
                </label>

                <label
                  className={`settings-option ${!spotifyRunning ? "option-disabled" : ""}`}
                >
                  <input
                    type="radio"
                    name="nowPlayingSource"
                    value="os_only"
                    checked={nowPlayingSource === "os_only"}
                    onChange={() => setNowPlayingSource("os_only")}
                  />
                  <div className="option-content">
                    <span className="option-title">
                      OS Only{" "}
                      <span className="option-badge">No Login Required</span>
                    </span>
                    <span className="option-desc">
                      Control local Spotify app via system APIs. No API calls,
                      fastest response.
                    </span>
                    {!spotifyRunning && (
                      <span className="option-warning">
                        ⚠️ Requires Spotify desktop app to be running
                      </span>
                    )}
                  </div>
                </label>

                <label className="settings-option">
                  <input
                    type="radio"
                    name="nowPlayingSource"
                    value="hybrid"
                    checked={nowPlayingSource === "hybrid"}
                    onChange={() => setNowPlayingSource("hybrid")}
                  />
                  <div className="option-content">
                    <span className="option-title">Hybrid</span>
                    <span className="option-desc">
                      Prefer OS data when available, fall back to API for remote
                      devices.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* OS-Only Mode Info */}
            {nowPlayingSource === "os_only" && (
              <div className="settings-section info-section">
                <div className="info-box">
                  <span className="info-icon">ℹ️</span>
                  <div className="info-content">
                    <strong>OS-Only Mode Features:</strong>
                    <ul>
                      <li>No Spotify account login required</li>
                      <li>
                        Controls your local Spotify app directly (AppleScript on
                        macOS)
                      </li>
                      <li>Fastest response time - no network latency</li>
                      <li>Works offline once Spotify app is open</li>
                    </ul>
                    <strong>Limitations:</strong>
                    <ul>
                      <li>
                        Cannot control remote devices (phone, speaker, etc.)
                      </li>
                      <li>
                        Some features may be unavailable (queue, playlists)
                      </li>
                      <li>Requires Spotify desktop app to be running</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Polling Interval */}
            <div className="settings-section">
              <h3>API Polling Interval</h3>
              <p className="settings-description">
                How often to fetch updates from Spotify API.
                {nowPlayingSource === "os_only" && (
                  <span className="settings-note">
                    {" "}
                    (Not used in OS Only mode)
                  </span>
                )}
              </p>

              <div className="settings-options">
                <label className="settings-option">
                  <input
                    type="radio"
                    name="pollingInterval"
                    value="disabled"
                    checked={pollingInterval === "disabled"}
                    onChange={() => setPollingInterval("disabled")}
                    disabled={nowPlayingSource === "os_only"}
                  />
                  <div className="option-content">
                    <span className="option-title">Disabled</span>
                    <span className="option-desc">Manual refresh only</span>
                  </div>
                </label>

                <label className="settings-option">
                  <input
                    type="radio"
                    name="pollingInterval"
                    value="low"
                    checked={pollingInterval === "low"}
                    onChange={() => setPollingInterval("low")}
                    disabled={nowPlayingSource === "os_only"}
                  />
                  <div className="option-content">
                    <span className="option-title">Low (15s)</span>
                    <span className="option-desc">Minimal API usage</span>
                  </div>
                </label>

                <label className="settings-option">
                  <input
                    type="radio"
                    name="pollingInterval"
                    value="medium"
                    checked={pollingInterval === "medium"}
                    onChange={() => setPollingInterval("medium")}
                    disabled={nowPlayingSource === "os_only"}
                  />
                  <div className="option-content">
                    <span className="option-title">Medium (10s)</span>
                    <span className="option-desc">Balanced</span>
                  </div>
                </label>

                <label className="settings-option">
                  <input
                    type="radio"
                    name="pollingInterval"
                    value="high"
                    checked={pollingInterval === "high"}
                    onChange={() => setPollingInterval("high")}
                    disabled={nowPlayingSource === "os_only"}
                  />
                  <div className="option-content">
                    <span className="option-title">High (5s)</span>
                    <span className="option-desc">Most responsive</span>
                  </div>
                </label>
              </div>
            </div>

            {/* User Verification */}
            {nowPlayingSource !== "api_only" &&
              nowPlayingSource !== "os_only" && (
                <div className="settings-section">
                  <h3>User Verification</h3>
                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={verifySameUser}
                      onChange={(e) => setVerifySameUser(e.target.checked)}
                    />
                    <span>
                      Verify OS data matches authenticated Spotify user
                    </span>
                  </label>
                  <p className="settings-description">
                    When enabled, OS now playing data will only be used if it
                    appears to be from the same Spotify account.
                  </p>
                </div>
              )}
          </div>
        )}

        <div className="settings-footer">
          <button className="settings-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="settings-btn primary"
            onClick={saveSettings}
            disabled={loading || saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <style>{`
        .settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .settings-modal {
          background: #282828;
          border-radius: 12px;
          width: 90%;
          max-width: 520px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #404040;
        }

        .settings-header h2 {
          margin: 0;
          font-size: 1.25rem;
          color: #fff;
        }

        .settings-close {
          background: none;
          border: none;
          color: #b3b3b3;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0.25rem;
          line-height: 1;
        }

        .settings-close:hover {
          color: #fff;
        }

        .settings-content {
          padding: 1.5rem;
          overflow-y: auto;
          flex: 1;
        }

        .settings-loading {
          padding: 2rem;
          text-align: center;
          color: #b3b3b3;
        }

        .settings-error {
          background: #ff4444;
          color: white;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
        }

        .settings-section {
          margin-bottom: 1.5rem;
        }

        .settings-section h3 {
          margin: 0 0 0.25rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .settings-description {
          margin: 0 0 1rem 0;
          font-size: 0.8125rem;
          color: #b3b3b3;
        }

        .settings-note {
          color: #1DB954;
          font-style: italic;
        }

        /* Status Section */
        .status-section {
          background: #333;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .status-section h3 {
          margin-bottom: 0.75rem;
        }

        .status-indicators {
          display: flex;
          gap: 1.5rem;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-ok {
          background: #1DB954;
          box-shadow: 0 0 6px rgba(29, 185, 84, 0.5);
        }

        .status-warning {
          background: #f0a500;
          box-shadow: 0 0 6px rgba(240, 165, 0, 0.5);
        }

        .status-error {
          background: #ff4444;
          box-shadow: 0 0 6px rgba(255, 68, 68, 0.5);
        }

        .status-label {
          color: #b3b3b3;
          font-size: 0.8125rem;
        }

        /* Options */
        .settings-options {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .settings-option {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.75rem;
          background: #333;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .settings-option:hover:not(.option-disabled) {
          background: #404040;
        }

        .settings-option.option-disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .settings-option input[type="radio"] {
          margin-top: 0.25rem;
          accent-color: #1DB954;
        }

        .option-content {
          display: flex;
          flex-direction: column;
        }

        .option-title {
          color: #fff;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .option-badge {
          background: #1DB954;
          color: #000;
          font-size: 0.625rem;
          font-weight: 700;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .option-desc {
          color: #b3b3b3;
          font-size: 0.8125rem;
        }

        .option-warning {
          color: #f0a500;
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }

        /* Info Box */
        .info-section {
          margin-top: -0.5rem;
        }

        .info-box {
          display: flex;
          gap: 0.75rem;
          background: rgba(29, 185, 84, 0.1);
          border: 1px solid rgba(29, 185, 84, 0.3);
          border-radius: 8px;
          padding: 1rem;
        }

        .info-icon {
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .info-content {
          font-size: 0.8125rem;
          color: #b3b3b3;
        }

        .info-content strong {
          color: #fff;
          display: block;
          margin-bottom: 0.25rem;
          margin-top: 0.5rem;
        }

        .info-content strong:first-child {
          margin-top: 0;
        }

        .info-content ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        .info-content li {
          margin: 0.125rem 0;
        }

        /* Checkbox */
        .settings-checkbox {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
          color: #fff;
          margin-bottom: 0.5rem;
        }

        .settings-checkbox input {
          accent-color: #1DB954;
          width: 1rem;
          height: 1rem;
        }

        /* Footer */
        .settings-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          border-top: 1px solid #404040;
        }

        .settings-btn {
          padding: 0.625rem 1.25rem;
          border-radius: 20px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .settings-btn.primary {
          background: #1DB954;
          color: #000;
          border: none;
        }

        .settings-btn.primary:hover:not(:disabled) {
          background: #1ed760;
          transform: scale(1.02);
        }

        .settings-btn.primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .settings-btn.secondary {
          background: transparent;
          color: #fff;
          border: 1px solid #727272;
        }

        .settings-btn.secondary:hover {
          border-color: #fff;
        }
      `}</style>
    </div>
  );
}

export default Settings;
