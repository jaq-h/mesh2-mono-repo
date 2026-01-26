// =============================================================================
// PlayerControls Component - Playback Control Buttons
// =============================================================================

import { useState, useCallback } from "react";
import { useSpotifyPlayback } from "../context/SpotifyContext";
import type { RepeatMode } from "@mesh/spotify-api";

// =============================================================================
// Icons
// =============================================================================

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const NextIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
  </svg>
);

const PreviousIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
  </svg>
);

const ShuffleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
  </svg>
);

const RepeatIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
  </svg>
);

const RepeatOneIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" />
  </svg>
);

// =============================================================================
// Types
// =============================================================================

export interface PlayerControlsProps {
  /**
   * Size variant
   * @default "medium"
   */
  size?: "small" | "medium" | "large";

  /**
   * Show shuffle button
   * @default true
   */
  showShuffle?: boolean;

  /**
   * Show repeat button
   * @default true
   */
  showRepeat?: boolean;

  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Disabled state (e.g., when not authenticated)
   */
  disabled?: boolean;
}

// =============================================================================
// Size Mappings
// =============================================================================

const sizeMap = {
  small: {
    button: 32,
    playButton: 40,
    icon: 16,
    playIcon: 24,
  },
  medium: {
    button: 40,
    playButton: 56,
    icon: 20,
    playIcon: 32,
  },
  large: {
    button: 48,
    playButton: 72,
    icon: 24,
    playIcon: 40,
  },
};

// =============================================================================
// Component
// =============================================================================

export function PlayerControls({
  size = "medium",
  showShuffle = true,
  showRepeat = true,
  className = "",
  disabled = false,
}: PlayerControlsProps) {
  const {
    isPlaying,
    shuffle,
    repeat,
    togglePlayback,
    nextTrack,
    previousTrack,
    setShuffle,
    setRepeat,
    isLoading,
  } = useSpotifyPlayback();

  const [isProcessing, setIsProcessing] = useState(false);
  const sizes = sizeMap[size];

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAction = useCallback(
    async (action: () => Promise<void>) => {
      if (isProcessing || disabled) return;
      setIsProcessing(true);
      try {
        await action();
      } catch (error) {
        console.error("Player control error:", error);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, disabled]
  );

  const handlePlayPause = useCallback(() => {
    handleAction(togglePlayback);
  }, [handleAction, togglePlayback]);

  const handleNext = useCallback(() => {
    handleAction(nextTrack);
  }, [handleAction, nextTrack]);

  const handlePrevious = useCallback(() => {
    handleAction(previousTrack);
  }, [handleAction, previousTrack]);

  const handleShuffle = useCallback(() => {
    handleAction(() => setShuffle(!shuffle));
  }, [handleAction, setShuffle, shuffle]);

  const handleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ["off", "context", "track"];
    const currentIndex = modes.indexOf(repeat);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    handleAction(() => setRepeat(nextMode));
  }, [handleAction, setRepeat, repeat]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isDisabled = disabled || isLoading || isProcessing;

  return (
    <div className={`player-controls player-controls--${size} ${className}`}>
      {/* Shuffle Button */}
      {showShuffle && (
        <button
          type="button"
          className={`player-controls__button player-controls__button--shuffle ${
            shuffle ? "player-controls__button--active" : ""
          }`}
          onClick={handleShuffle}
          disabled={isDisabled}
          aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
          aria-pressed={shuffle}
          style={{ width: sizes.button, height: sizes.button }}
        >
          <span
            className="player-controls__icon"
            style={{ width: sizes.icon, height: sizes.icon }}
          >
            <ShuffleIcon />
          </span>
        </button>
      )}

      {/* Previous Track Button */}
      <button
        type="button"
        className="player-controls__button player-controls__button--previous"
        onClick={handlePrevious}
        disabled={isDisabled}
        aria-label="Previous track"
        style={{ width: sizes.button, height: sizes.button }}
      >
        <span
          className="player-controls__icon"
          style={{ width: sizes.icon, height: sizes.icon }}
        >
          <PreviousIcon />
        </span>
      </button>

      {/* Play/Pause Button */}
      <button
        type="button"
        className={`player-controls__button player-controls__button--play ${
          isPlaying ? "player-controls__button--playing" : ""
        }`}
        onClick={handlePlayPause}
        disabled={isDisabled}
        aria-label={isPlaying ? "Pause" : "Play"}
        style={{ width: sizes.playButton, height: sizes.playButton }}
      >
        <span
          className="player-controls__icon"
          style={{ width: sizes.playIcon, height: sizes.playIcon }}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </span>
      </button>

      {/* Next Track Button */}
      <button
        type="button"
        className="player-controls__button player-controls__button--next"
        onClick={handleNext}
        disabled={isDisabled}
        aria-label="Next track"
        style={{ width: sizes.button, height: sizes.button }}
      >
        <span
          className="player-controls__icon"
          style={{ width: sizes.icon, height: sizes.icon }}
        >
          <NextIcon />
        </span>
      </button>

      {/* Repeat Button */}
      {showRepeat && (
        <button
          type="button"
          className={`player-controls__button player-controls__button--repeat ${
            repeat !== "off" ? "player-controls__button--active" : ""
          }`}
          onClick={handleRepeat}
          disabled={isDisabled}
          aria-label={`Repeat: ${repeat}`}
          aria-pressed={repeat !== "off"}
          style={{ width: sizes.button, height: sizes.button }}
        >
          <span
            className="player-controls__icon"
            style={{ width: sizes.icon, height: sizes.icon }}
          >
            {repeat === "track" ? <RepeatOneIcon /> : <RepeatIcon />}
          </span>
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Mini Variant - Just Play/Pause, Next, Previous
// =============================================================================

export interface PlayerControlsMiniProps {
  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Disabled state
   */
  disabled?: boolean;

  /**
   * Button size in pixels
   * @default 32
   */
  buttonSize?: number;

  /**
   * Icon size in pixels
   * @default 16
   */
  iconSize?: number;
}

/**
 * Minimal player controls - just the essential buttons
 */
export function PlayerControlsMini({
  className = "",
  disabled = false,
  buttonSize = 32,
  iconSize = 16,
}: PlayerControlsMiniProps) {
  const { isPlaying, togglePlayback, nextTrack, previousTrack, isLoading } =
    useSpotifyPlayback();

  const [isProcessing, setIsProcessing] = useState(false);
  const isDisabled = disabled || isLoading || isProcessing;

  const handleAction = async (action: () => Promise<void>) => {
    if (isDisabled) return;
    setIsProcessing(true);
    try {
      await action();
    } catch (error) {
      console.error("Player control error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`player-controls-mini ${className}`}>
      <button
        type="button"
        className="player-controls-mini__button"
        onClick={() => handleAction(previousTrack)}
        disabled={isDisabled}
        aria-label="Previous track"
        style={{ width: buttonSize, height: buttonSize }}
      >
        <span style={{ width: iconSize, height: iconSize, display: "flex" }}>
          <PreviousIcon />
        </span>
      </button>

      <button
        type="button"
        className={`player-controls-mini__button player-controls-mini__button--play ${
          isPlaying ? "player-controls-mini__button--playing" : ""
        }`}
        onClick={() => handleAction(togglePlayback)}
        disabled={isDisabled}
        aria-label={isPlaying ? "Pause" : "Play"}
        style={{ width: buttonSize * 1.25, height: buttonSize * 1.25 }}
      >
        <span
          style={{ width: iconSize * 1.25, height: iconSize * 1.25, display: "flex" }}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </span>
      </button>

      <button
        type="button"
        className="player-controls-mini__button"
        onClick={() => handleAction(nextTrack)}
        disabled={isDisabled}
        aria-label="Next track"
        style={{ width: buttonSize, height: buttonSize }}
      >
        <span style={{ width: iconSize, height: iconSize, display: "flex" }}>
          <NextIcon />
        </span>
      </button>
    </div>
  );
}

// =============================================================================
// Default Export
// =============================================================================

export default PlayerControls;
