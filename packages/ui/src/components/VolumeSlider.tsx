// =============================================================================
// VolumeSlider Component - Volume Control
// =============================================================================

import React, { useCallback, useState, useRef, useEffect } from "react";

// =============================================================================
// Icons
// =============================================================================

const VolumeHighIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);

const VolumeMediumIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
  </svg>
);

const VolumeLowIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M7 9v6h4l5 5V4l-5 5H7z" />
  </svg>
);

const VolumeMutedIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
  </svg>
);

// =============================================================================
// Types
// =============================================================================

export interface VolumeSliderProps {
  /**
   * Current volume (0-1)
   */
  volume: number;

  /**
   * Whether the volume control is disabled
   */
  disabled?: boolean;

  /**
   * Whether to show the mute button
   * @default true
   */
  showMuteButton?: boolean;

  /**
   * Slider width in pixels
   * @default 100
   */
  sliderWidth?: number;

  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Callback when volume changes
   */
  onVolumeChange?: (volume: number) => Promise<void> | void;

  /**
   * Callback when mute is toggled
   */
  onMuteToggle?: () => Promise<void> | void;
}

// =============================================================================
// Component
// =============================================================================

export function VolumeSlider({
  volume,
  disabled = false,
  showMuteButton = true,
  sliderWidth = 100,
  className = "",
  onVolumeChange,
  onMuteToggle,
}: VolumeSliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localVolume, setLocalVolume] = useState(volume);
  const sliderRef = useRef<HTMLDivElement>(null);
  const previousVolumeRef = useRef(volume);

  // Sync local volume with prop when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalVolume(volume);
    }
  }, [volume, isDragging]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const calculateVolumeFromPosition = useCallback(
    (clientX: number): number => {
      if (!sliderRef.current) return localVolume;

      const rect = sliderRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      return percent;
    },
    [localVolume]
  );

  const handleSliderChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      setLocalVolume(newVolume);

      if (onVolumeChange) {
        try {
          await onVolumeChange(newVolume);
        } catch (error) {
          console.error("Volume change error:", error);
        }
      }
    },
    [onVolumeChange]
  );

  const handleSliderClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;

      const newVolume = calculateVolumeFromPosition(e.clientX);
      setLocalVolume(newVolume);

      if (onVolumeChange) {
        try {
          await onVolumeChange(newVolume);
        } catch (error) {
          console.error("Volume change error:", error);
        }
      }
    },
    [disabled, calculateVolumeFromPosition, onVolumeChange]
  );

  const handleMuteClick = useCallback(async () => {
    if (disabled) return;

    if (onMuteToggle) {
      try {
        await onMuteToggle();
      } catch (error) {
        console.error("Mute toggle error:", error);
      }
    } else if (onVolumeChange) {
      // Default behavior: toggle between 0 and previous volume
      try {
        if (localVolume > 0) {
          previousVolumeRef.current = localVolume;
          setLocalVolume(0);
          await onVolumeChange(0);
        } else {
          const restoreVolume = previousVolumeRef.current || 0.5;
          setLocalVolume(restoreVolume);
          await onVolumeChange(restoreVolume);
        }
      } catch (error) {
        console.error("Mute toggle error:", error);
      }
    }
  }, [disabled, localVolume, onMuteToggle, onVolumeChange]);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Get appropriate volume icon
  // ---------------------------------------------------------------------------

  const getVolumeIcon = () => {
    if (localVolume === 0) {
      return <VolumeMutedIcon />;
    } else if (localVolume < 0.33) {
      return <VolumeLowIcon />;
    } else if (localVolume < 0.66) {
      return <VolumeMediumIcon />;
    } else {
      return <VolumeHighIcon />;
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const volumePercent = Math.round(localVolume * 100);

  return (
    <div className={`volume-slider ${className}`}>
      {/* Mute Button */}
      {showMuteButton && (
        <button
          type="button"
          className={`volume-slider__mute ${localVolume === 0 ? "volume-slider__mute--muted" : ""}`}
          onClick={handleMuteClick}
          disabled={disabled}
          aria-label={localVolume === 0 ? "Unmute" : "Mute"}
          title={localVolume === 0 ? "Unmute" : "Mute"}
        >
          <span className="volume-slider__mute-icon" style={{ width: 20, height: 20 }}>
            {getVolumeIcon()}
          </span>
        </button>
      )}

      {/* Slider Container */}
      <div
        className="volume-slider__track-container"
        style={{ width: sliderWidth }}
        ref={sliderRef}
        onClick={handleSliderClick}
      >
        {/* Native Range Input (for accessibility) */}
        <input
          type="range"
          className="volume-slider__input"
          min="0"
          max="1"
          step="0.01"
          value={localVolume}
          onChange={handleSliderChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          disabled={disabled}
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={volumePercent}
          aria-valuetext={`${volumePercent}%`}
        />

        {/* Custom Track */}
        <div className="volume-slider__track">
          <div
            className="volume-slider__fill"
            style={{ width: `${volumePercent}%` }}
          />
        </div>

        {/* Thumb (visual only, interaction handled by input) */}
        <div
          className="volume-slider__thumb"
          style={{ left: `${volumePercent}%` }}
        />
      </div>

      {/* Volume Percentage Display (optional) */}
      {/* <span className="volume-slider__value">{volumePercent}%</span> */}
    </div>
  );
}

// =============================================================================
// Compact Variant
// =============================================================================

export interface VolumeSliderCompactProps {
  /**
   * Current volume (0-1)
   */
  volume: number;

  /**
   * Whether the volume control is disabled
   */
  disabled?: boolean;

  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Callback when volume changes
   */
  onVolumeChange?: (volume: number) => Promise<void> | void;
}

/**
 * Compact volume slider - just the icon that expands on hover
 */
export function VolumeSliderCompact({
  volume,
  disabled = false,
  className = "",
  onVolumeChange,
}: VolumeSliderCompactProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localVolume, setLocalVolume] = useState(volume);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousVolumeRef = useRef(volume);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local volume with prop
  useEffect(() => {
    setLocalVolume(volume);
  }, [volume]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsExpanded(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 300);
  }, []);

  const handleVolumeChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      setLocalVolume(newVolume);

      if (onVolumeChange) {
        try {
          await onVolumeChange(newVolume);
        } catch (error) {
          console.error("Volume change error:", error);
        }
      }
    },
    [onVolumeChange]
  );

  const handleMuteClick = useCallback(async () => {
    if (disabled || !onVolumeChange) return;

    try {
      if (localVolume > 0) {
        previousVolumeRef.current = localVolume;
        setLocalVolume(0);
        await onVolumeChange(0);
      } else {
        const restoreVolume = previousVolumeRef.current || 0.5;
        setLocalVolume(restoreVolume);
        await onVolumeChange(restoreVolume);
      }
    } catch (error) {
      console.error("Mute toggle error:", error);
    }
  }, [disabled, localVolume, onVolumeChange]);

  const getVolumeIcon = () => {
    if (localVolume === 0) {
      return <VolumeMutedIcon />;
    } else if (localVolume < 0.33) {
      return <VolumeLowIcon />;
    } else if (localVolume < 0.66) {
      return <VolumeMediumIcon />;
    } else {
      return <VolumeHighIcon />;
    }
  };

  const volumePercent = Math.round(localVolume * 100);

  return (
    <div
      className={`volume-slider-compact ${isExpanded ? "volume-slider-compact--expanded" : ""} ${className}`}
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className="volume-slider-compact__button"
        onClick={handleMuteClick}
        disabled={disabled}
        aria-label={localVolume === 0 ? "Unmute" : "Mute"}
      >
        <span style={{ width: 20, height: 20, display: "flex" }}>
          {getVolumeIcon()}
        </span>
      </button>

      <div
        className={`volume-slider-compact__slider ${isExpanded ? "volume-slider-compact__slider--visible" : ""}`}
      >
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={localVolume}
          onChange={handleVolumeChange}
          disabled={disabled}
          aria-label="Volume"
          aria-valuenow={volumePercent}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Default Export
// =============================================================================

export default VolumeSlider;
