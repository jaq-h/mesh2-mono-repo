// =============================================================================
// PlayerPage - Main Player Interface (Shared Component)
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  useSpotify,
  useSpotifyAuth,
  useSpotifyPlayback,
  useSpotifyDevices,
} from "../context/SpotifyContext";
import {
  formatDuration,
  getBestImageUrl,
  type SpotifyDevice,
  type RepeatMode,
} from "@mesh/spotify-api";

// =============================================================================
// Types
// =============================================================================

export interface PlayerPageProps {
  /**
   * Callback when user wants to logout
   */
  onLogout?: () => void;

  /**
   * Callback when user is not authenticated
   */
  onUnauthenticated?: () => void;

  /**
   * Custom class name
   */
  className?: string;

  /**
   * Device refresh interval in ms
   * @default 30000
   */
  deviceRefreshInterval?: number;

  /**
   * Extra actions rendered in the header, before the Logout button
   */
  headerActions?: React.ReactNode;
}

// =============================================================================
// Component
// =============================================================================

export function PlayerPage({
  onLogout,
  onUnauthenticated,
  className = "",
  deviceRefreshInterval = 30000,
  headerActions,
}: PlayerPageProps) {
  const { user, isAuthenticated } = useSpotify();
  const { logout } = useSpotifyAuth();
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    shuffle,
    repeat,
    volume,
    sleepMode,
    isLoading: playerLoading,
    error: playerError,
    togglePlayback,
    nextTrack,
    previousTrack,
    seek,
    setVolume,
    setShuffle,
    setRepeat,
    wakeFromSleep,
  } = useSpotifyPlayback();

  const {
    devices,
    activeDevice,
    isLoading: devicesLoading,
    refresh: refreshDevices,
    transfer: transferPlayback,
  } = useSpotifyDevices();

  // Local state
  const [localPosition, setLocalPosition] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const deviceRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ==========================================================================
  // Progress tracking
  // ==========================================================================

  useEffect(() => {
    if (!isSeeking) {
      setLocalPosition(progress);
    }
  }, [progress, isSeeking]);

  useEffect(() => {
    // Update progress every second when playing
    if (isPlaying && duration > 0) {
      progressIntervalRef.current = setInterval(() => {
        setLocalPosition((prev) => {
          const next = prev + 1000;
          return next > duration ? duration : next;
        });
      }, 1000);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [isPlaying, duration]);

  // ==========================================================================
  // Device refresh interval
  // ==========================================================================

  useEffect(() => {
    if (deviceRefreshInterval > 0) {
      deviceRefreshRef.current = setInterval(() => {
        refreshDevices();
      }, deviceRefreshInterval);
    }

    return () => {
      if (deviceRefreshRef.current) {
        clearInterval(deviceRefreshRef.current);
        deviceRefreshRef.current = null;
      }
    };
  }, [deviceRefreshInterval, refreshDevices]);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleSeek = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!duration) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const newPosition = Math.floor(percent * duration);

      setIsSeeking(true);
      setLocalPosition(newPosition);

      try {
        await seek(newPosition);
      } catch (err) {
        console.error("Seek failed:", err);
      } finally {
        setTimeout(() => setIsSeeking(false), 500);
      }
    },
    [duration, seek],
  );

  const handleVolumeChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value) * 100;
      try {
        await setVolume(newVolume);
      } catch (err) {
        console.error("Volume change failed:", err);
      }
    },
    [setVolume],
  );

  const handleShuffle = useCallback(async () => {
    try {
      await setShuffle(!shuffle);
    } catch (err) {
      console.error("Shuffle toggle failed:", err);
    }
  }, [shuffle, setShuffle]);

  const handleRepeat = useCallback(async () => {
    const modes: RepeatMode[] = ["off", "context", "track"];
    const currentIndex = modes.indexOf(repeat);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    try {
      await setRepeat(nextMode);
    } catch (err) {
      console.error("Repeat change failed:", err);
    }
  }, [repeat, setRepeat]);

  const handleDeviceSelect = useCallback(
    async (device: SpotifyDevice) => {
      if (!device.id || device.is_active) return;
      try {
        await transferPlayback(device.id, true);
        setShowDevices(false);
      } catch (err) {
        setError("Failed to transfer playback");
      }
    },
    [transferPlayback],
  );

  const handleLogout = useCallback(async () => {
    await logout();
    onLogout?.();
  }, [logout, onLogout]);

  // ==========================================================================
  // Render helpers
  // ==========================================================================

  const progressPercent = duration > 0 ? (localPosition / duration) * 100 : 0;
  const volumeNormalized = (volume ?? 50) / 100;

  const albumArtUrl = currentTrack
    ? getBestImageUrl(currentTrack.album.images, 300)
    : null;

  // ==========================================================================
  // Render
  // ==========================================================================

  if (!isAuthenticated) {
    // Call callback if provided
    if (onUnauthenticated) {
      onUnauthenticated();
    }
    return (
      <div className={`player-page player-page--unauthenticated ${className}`}>
        <p>Please log in to use the player</p>
        <a href="/login">Go to Login</a>
      </div>
    );
  }

  return (
    <div className={`player-page ${className}`}>
      {/* Header */}
      <header className="player-page__header">
        <div className="player-page__user">
          {user?.images?.[0]?.url && (
            <img
              src={user.images[0].url}
              alt={user.display_name || "User"}
              className="player-page__user-avatar"
            />
          )}
          <span className="player-page__user-name">
            {user?.display_name || "User"}
          </span>
        </div>
        <div className="player-page__header-actions">
          {/* Status Indicator */}
          <button
            className={`player-page__status-indicator ${
              sleepMode === "awake"
                ? "player-page__status-indicator--awake"
                : "player-page__status-indicator--sleeping"
            }`}
            onClick={wakeFromSleep}
            aria-label={
              sleepMode === "awake"
                ? "Connected"
                : "Sleeping - click to refresh"
            }
            title={
              sleepMode === "awake"
                ? "Connected"
                : sleepMode === "light"
                  ? "Light sleep - click to refresh"
                  : "Sleeping - click to refresh"
            }
          >
            {sleepMode === "awake" ? (
              <span className="player-page__status-dot" />
            ) : (
              <RefreshIcon />
            )}
          </button>
          {headerActions}
          <button className="player-page__logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Error display */}
      {(error || playerError) && (
        <div className="player-page__error" role="alert">
          {error || playerError}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Main content */}
      <main className="player-page__main">
        {/* Album Art */}
        <div className="player-page__album-art">
          {albumArtUrl ? (
            <img
              src={albumArtUrl}
              alt={currentTrack?.album.name || "Album art"}
              className="player-page__album-image"
            />
          ) : (
            <div className="player-page__album-placeholder">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="64"
                height="64"
              >
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="player-page__track-info">
          <h2 className="player-page__track-title">
            {currentTrack?.name || "Not Playing"}
          </h2>
          <p className="player-page__track-artist">
            {currentTrack?.artists.map((a) => a.name).join(", ") ||
              "Select a device to start playing"}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="player-page__progress">
          <div
            className="player-page__progress-bar"
            onClick={handleSeek}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={localPosition}
            tabIndex={0}
          >
            <div
              className="player-page__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="player-page__progress-times">
            <span>{formatDuration(localPosition)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="player-page__controls">
          <button
            className={`player-page__control-btn player-page__control-btn--shuffle ${
              shuffle ? "player-page__control-btn--active" : ""
            }`}
            onClick={handleShuffle}
            aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
            aria-pressed={shuffle}
          >
            <ShuffleIcon />
          </button>

          <button
            className="player-page__control-btn"
            onClick={previousTrack}
            aria-label="Previous track"
          >
            <PreviousIcon />
          </button>

          <button
            className="player-page__control-btn player-page__control-btn--play"
            onClick={togglePlayback}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button
            className="player-page__control-btn"
            onClick={nextTrack}
            aria-label="Next track"
          >
            <NextIcon />
          </button>

          <button
            className={`player-page__control-btn player-page__control-btn--repeat ${
              repeat !== "off" ? "player-page__control-btn--active" : ""
            }`}
            onClick={handleRepeat}
            aria-label={`Repeat: ${repeat}`}
          >
            {repeat === "track" ? <RepeatOneIcon /> : <RepeatIcon />}
          </button>
        </div>

        {/* Volume */}
        <div className="player-page__volume">
          <VolumeIcon muted={volumeNormalized === 0} />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volumeNormalized}
            onChange={handleVolumeChange}
            className="player-page__volume-slider"
            aria-label="Volume"
          />
        </div>

        {/* Device Selector */}
        <div className="player-page__devices">
          <button
            className="player-page__devices-toggle"
            onClick={() => {
              setShowDevices(!showDevices);
              if (!showDevices) refreshDevices();
            }}
          >
            <DevicesIcon />
            <span>{activeDevice?.name || "No device"}</span>
          </button>

          {showDevices && (
            <div className="player-page__devices-list">
              <div className="player-page__devices-header">
                <span>Connect to a device</span>
                <button onClick={refreshDevices} disabled={devicesLoading}>
                  <RefreshIcon />
                </button>
              </div>

              {devices.length === 0 ? (
                <div className="player-page__devices-empty">
                  {devicesLoading ? "Searching..." : "No devices found"}
                </div>
              ) : (
                devices.map((device) => (
                  <button
                    key={device.id || device.name}
                    className={`player-page__device-item ${
                      device.is_active ? "player-page__device-item--active" : ""
                    }`}
                    onClick={() => handleDeviceSelect(device)}
                    disabled={device.is_active || !device.id}
                  >
                    <span className="player-page__device-name">
                      {device.name}
                    </span>
                    <span className="player-page__device-type">
                      {formatDeviceType(device.type)}
                    </span>
                    {device.is_active && (
                      <span className="player-page__device-active">✓</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* SDK Status */}
        {playerLoading && (
          <div className="player-page__status">Connecting to Spotify...</div>
        )}
      </main>
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDeviceType(deviceType: string): string {
  return deviceType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// =============================================================================
// Icons
// =============================================================================

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}

function PreviousIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
    </svg>
  );
}

function RepeatOneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" />
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function DevicesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  );
}

// =============================================================================
// Default Export
// =============================================================================

export default PlayerPage;
