// =============================================================================
// NowPlaying Component - Displays Current Track Information
// =============================================================================

import React from "react";
import { useSpotifyPlayback } from "../context/SpotifyContext";
import { formatDuration, getBestImageUrl, formatTrackInfo } from "@mesh/spotify-api";

// =============================================================================
// Types
// =============================================================================

export interface NowPlayingProps {
  /**
   * Show progress bar
   * @default true
   */
  showProgress?: boolean;

  /**
   * Show album art
   * @default true
   */
  showAlbumArt?: boolean;

  /**
   * Album art size in pixels
   * @default 200
   */
  albumArtSize?: number;

  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Callback when seeking (clicking on progress bar)
   */
  onSeek?: (positionMs: number) => void;
}

// =============================================================================
// Component
// =============================================================================

export function NowPlaying({
  showProgress = true,
  showAlbumArt = true,
  albumArtSize = 200,
  className = "",
  onSeek,
}: NowPlayingProps) {
  const { currentTrack, isPlaying, progress, duration, seek } = useSpotifyPlayback();

  // Handle progress bar click
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const positionMs = Math.floor(percent * duration);

    if (onSeek) {
      onSeek(positionMs);
    } else {
      seek(positionMs);
    }
  };

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  // Get track info
  const trackInfo = currentTrack ? formatTrackInfo(currentTrack) : null;
  const albumArtUrl = currentTrack
    ? getBestImageUrl(currentTrack.album.images, albumArtSize)
    : null;

  // No track playing
  if (!currentTrack) {
    return (
      <div className={`now-playing now-playing--empty ${className}`}>
        <div
          className="now-playing__album-art now-playing__album-art--placeholder"
          style={{ width: albumArtSize, height: albumArtSize }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            width={albumArtSize * 0.4}
            height={albumArtSize * 0.4}
          >
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
        <div className="now-playing__info">
          <div className="now-playing__title">Not Playing</div>
          <div className="now-playing__artist">Select a track to play</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`now-playing ${isPlaying ? "now-playing--playing" : ""} ${className}`}>
      {/* Album Art */}
      {showAlbumArt && (
        <div
          className="now-playing__album-art"
          style={{ width: albumArtSize, height: albumArtSize }}
        >
          {albumArtUrl ? (
            <img
              src={albumArtUrl}
              alt={`${currentTrack.album.name} album art`}
              className="now-playing__album-image"
              width={albumArtSize}
              height={albumArtSize}
            />
          ) : (
            <div className="now-playing__album-art--placeholder">
              <svg viewBox="0 0 24 24" fill="currentColor" width={48} height={48}>
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Track Info */}
      <div className="now-playing__info">
        <div className="now-playing__title" title={trackInfo?.title}>
          {trackInfo?.title}
        </div>
        <div className="now-playing__artist" title={trackInfo?.artist}>
          {trackInfo?.artist}
        </div>
        <div className="now-playing__album" title={currentTrack.album.name}>
          {currentTrack.album.name}
        </div>
      </div>

      {/* Progress Bar */}
      {showProgress && (
        <div className="now-playing__progress">
          <div
            className="now-playing__progress-bar"
            onClick={handleProgressClick}
            role="slider"
            aria-label="Track progress"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={progress}
            tabIndex={0}
          >
            <div
              className="now-playing__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="now-playing__progress-times">
            <span className="now-playing__time-current">{formatDuration(progress)}</span>
            <span className="now-playing__time-total">{formatDuration(duration)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Compact Variant
// =============================================================================

export interface NowPlayingCompactProps {
  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Click handler
   */
  onClick?: () => void;
}

/**
 * Compact version of NowPlaying for use in headers/footers
 */
export function NowPlayingCompact({ className = "", onClick }: NowPlayingCompactProps) {
  const { currentTrack, isPlaying, progress, duration } = useSpotifyPlayback();

  const trackInfo = currentTrack ? formatTrackInfo(currentTrack) : null;
  const albumArtUrl = currentTrack ? getBestImageUrl(currentTrack.album.images, 48) : null;
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  if (!currentTrack) {
    return (
      <div
        className={`now-playing-compact now-playing-compact--empty ${className}`}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <div className="now-playing-compact__art now-playing-compact__art--placeholder">
          <svg viewBox="0 0 24 24" fill="currentColor" width={24} height={24}>
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
        <div className="now-playing-compact__info">
          <span className="now-playing-compact__title">Not Playing</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`now-playing-compact ${isPlaying ? "now-playing-compact--playing" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="now-playing-compact__art">
        {albumArtUrl ? (
          <img src={albumArtUrl} alt="" width={48} height={48} />
        ) : (
          <div className="now-playing-compact__art--placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor" width={24} height={24}>
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
      </div>
      <div className="now-playing-compact__info">
        <span className="now-playing-compact__title">{trackInfo?.title}</span>
        <span className="now-playing-compact__artist">{trackInfo?.artist}</span>
      </div>
      <div
        className="now-playing-compact__progress"
        style={{ width: `${progressPercent}%` }}
      />
    </div>
  );
}

// =============================================================================
// Default Export
// =============================================================================

export default NowPlaying;
