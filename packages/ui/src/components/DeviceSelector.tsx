// =============================================================================
// DeviceSelector Component - Select and Transfer Playback Between Devices
// =============================================================================

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useSpotifyDevices } from "../context/SpotifyContext";
import type { SpotifyDevice } from "@mesh/spotify-api";

// =============================================================================
// Icons
// =============================================================================

const ComputerIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
  </svg>
);

const SmartphoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
  </svg>
);

const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-5 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 16c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
  </svg>
);

const TvIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
  </svg>
);

const CarIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
  </svg>
);

const GameConsoleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
  </svg>
);

const DefaultDeviceIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
  </svg>
);

const ActiveIndicatorIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
  </svg>
);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the appropriate icon for a device type
 */
function getDeviceIcon(type: string): React.ReactNode {
  const normalizedType = type.toLowerCase();

  if (normalizedType.includes("computer") || normalizedType.includes("pc")) {
    return <ComputerIcon />;
  }
  if (normalizedType.includes("smartphone") || normalizedType.includes("phone")) {
    return <SmartphoneIcon />;
  }
  if (normalizedType.includes("speaker")) {
    return <SpeakerIcon />;
  }
  if (normalizedType.includes("tv")) {
    return <TvIcon />;
  }
  if (normalizedType.includes("automobile") || normalizedType.includes("car")) {
    return <CarIcon />;
  }
  if (normalizedType.includes("game") || normalizedType.includes("console")) {
    return <GameConsoleIcon />;
  }

  return <DefaultDeviceIcon />;
}

/**
 * Format device type for display
 */
function formatDeviceType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// =============================================================================
// Types
// =============================================================================

export interface DeviceSelectorProps {
  /**
   * Display variant
   * @default "list"
   */
  variant?: "list" | "dropdown" | "compact";

  /**
   * Show refresh button
   * @default true
   */
  showRefresh?: boolean;

  /**
   * Auto-refresh interval in ms (0 to disable)
   * @default 0
   */
  autoRefreshInterval?: number;

  /**
   * Start playing when transferring to a device
   * @default true
   */
  playOnTransfer?: boolean;

  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Callback when device is selected
   */
  onDeviceSelect?: (device: SpotifyDevice) => void;

  /**
   * Callback when transfer completes
   */
  onTransferComplete?: (device: SpotifyDevice) => void;

  /**
   * Callback on error
   */
  onError?: (error: string) => void;
}

// =============================================================================
// Main Component
// =============================================================================

export function DeviceSelector({
  variant = "list",
  showRefresh = true,
  autoRefreshInterval = 0,
  playOnTransfer = true,
  className = "",
  onDeviceSelect,
  onTransferComplete,
  onError,
}: DeviceSelectorProps) {
  const { devices, activeDevice, isLoading, error, refresh, transfer, clearError } =
    useSpotifyDevices();

  const [isTransferring, setIsTransferring] = useState<string | null>(null);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefreshInterval > 0) {
      const interval = setInterval(refresh, autoRefreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefreshInterval, refresh]);

  // Error callback
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // Handle device selection
  const handleDeviceSelect = useCallback(
    async (device: SpotifyDevice) => {
      if (!device.id || device.is_active) return;

      onDeviceSelect?.(device);
      setIsTransferring(device.id);
      clearError();

      try {
        await transfer(device.id, playOnTransfer);
        onTransferComplete?.(device);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transfer failed";
        onError?.(message);
      } finally {
        setIsTransferring(null);
      }
    },
    [transfer, playOnTransfer, clearError, onDeviceSelect, onTransferComplete, onError]
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    clearError();
    refresh();
  }, [refresh, clearError]);

  // Render based on variant
  if (variant === "dropdown") {
    return (
      <DeviceSelectorDropdown
        devices={devices}
        activeDevice={activeDevice}
        isLoading={isLoading}
        isTransferring={isTransferring}
        showRefresh={showRefresh}
        onDeviceSelect={handleDeviceSelect}
        onRefresh={handleRefresh}
        className={className}
      />
    );
  }

  if (variant === "compact") {
    return (
      <DeviceSelectorCompact
        devices={devices}
        activeDevice={activeDevice}
        isLoading={isLoading}
        isTransferring={isTransferring}
        onDeviceSelect={handleDeviceSelect}
        onRefresh={handleRefresh}
        className={className}
      />
    );
  }

  // Default list variant
  return (
    <div className={`device-selector ${className}`}>
      {/* Header */}
      <div className="device-selector__header">
        <h3 className="device-selector__title">Devices</h3>
        {showRefresh && (
          <button
            type="button"
            className={`device-selector__refresh ${isLoading ? "device-selector__refresh--loading" : ""}`}
            onClick={handleRefresh}
            disabled={isLoading}
            aria-label="Refresh devices"
          >
            <span className="device-selector__refresh-icon">
              <RefreshIcon />
            </span>
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="device-selector__error" role="alert">
          {error}
        </div>
      )}

      {/* Device list */}
      <div className="device-selector__list" role="listbox" aria-label="Available devices">
        {devices.length === 0 ? (
          <div className="device-selector__empty">
            {isLoading ? "Loading devices..." : "No devices found"}
          </div>
        ) : (
          devices.map((device) => (
            <DeviceItem
              key={device.id || device.name}
              device={device}
              isActive={device.is_active}
              isTransferring={isTransferring === device.id}
              onClick={() => handleDeviceSelect(device)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Device Item Component
// =============================================================================

interface DeviceItemProps {
  device: SpotifyDevice;
  isActive: boolean;
  isTransferring: boolean;
  onClick: () => void;
}

function DeviceItem({ device, isActive, isTransferring, onClick }: DeviceItemProps) {
  return (
    <button
      type="button"
      className={`device-item ${isActive ? "device-item--active" : ""} ${
        isTransferring ? "device-item--transferring" : ""
      }`}
      onClick={onClick}
      disabled={isActive || isTransferring || !device.id}
      role="option"
      aria-selected={isActive}
      aria-disabled={!device.id}
    >
      <span className="device-item__icon">{getDeviceIcon(device.type)}</span>

      <span className="device-item__info">
        <span className="device-item__name">{device.name}</span>
        <span className="device-item__type">{formatDeviceType(device.type)}</span>
      </span>

      {isActive && (
        <span className="device-item__active-indicator" aria-label="Currently active">
          <ActiveIndicatorIcon />
        </span>
      )}

      {isTransferring && (
        <span className="device-item__spinner" aria-label="Transferring...">
          <span className="device-item__spinner-dot" />
        </span>
      )}
    </button>
  );
}

// =============================================================================
// Dropdown Variant
// =============================================================================

interface DeviceSelectorDropdownProps {
  devices: SpotifyDevice[];
  activeDevice: SpotifyDevice | null;
  isLoading: boolean;
  isTransferring: string | null;
  showRefresh: boolean;
  onDeviceSelect: (device: SpotifyDevice) => void;
  onRefresh: () => void;
  className: string;
}

function DeviceSelectorDropdown({
  devices,
  activeDevice,
  isLoading,
  isTransferring,
  showRefresh,
  onDeviceSelect,
  onRefresh,
  className,
}: DeviceSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Handle device selection
  const handleSelect = (device: SpotifyDevice) => {
    onDeviceSelect(device);
    setIsOpen(false);
  };

  return (
    <div className={`device-selector-dropdown ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`device-selector-dropdown__trigger ${isOpen ? "device-selector-dropdown__trigger--open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="device-selector-dropdown__icon">
          {activeDevice ? getDeviceIcon(activeDevice.type) : <DefaultDeviceIcon />}
        </span>
        <span className="device-selector-dropdown__label">
          {activeDevice?.name || "No device"}
        </span>
      </button>

      {isOpen && (
        <div className="device-selector-dropdown__menu" role="listbox">
          {showRefresh && (
            <button
              type="button"
              className="device-selector-dropdown__refresh"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <span className={isLoading ? "spinning" : ""}>
                <RefreshIcon />
              </span>
              Refresh
            </button>
          )}

          {devices.length === 0 ? (
            <div className="device-selector-dropdown__empty">
              {isLoading ? "Loading..." : "No devices"}
            </div>
          ) : (
            devices.map((device) => (
              <button
                key={device.id || device.name}
                type="button"
                className={`device-selector-dropdown__item ${
                  device.is_active ? "device-selector-dropdown__item--active" : ""
                }`}
                onClick={() => handleSelect(device)}
                disabled={device.is_active || isTransferring === device.id || !device.id}
                role="option"
                aria-selected={device.is_active}
              >
                <span className="device-selector-dropdown__item-icon">
                  {getDeviceIcon(device.type)}
                </span>
                <span className="device-selector-dropdown__item-name">{device.name}</span>
                {device.is_active && (
                  <span className="device-selector-dropdown__item-active">
                    <ActiveIndicatorIcon />
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Compact Variant
// =============================================================================

interface DeviceSelectorCompactProps {
  devices: SpotifyDevice[];
  activeDevice: SpotifyDevice | null;
  isLoading: boolean;
  isTransferring: string | null;
  onDeviceSelect: (device: SpotifyDevice) => void;
  onRefresh: () => void;
  className: string;
}

function DeviceSelectorCompact({
  devices,
  activeDevice,
  isLoading,
  isTransferring,
  onDeviceSelect,
  onRefresh,
  className,
}: DeviceSelectorCompactProps) {
  const [showList, setShowList] = useState(false);

  return (
    <div className={`device-selector-compact ${className}`}>
      <button
        type="button"
        className="device-selector-compact__button"
        onClick={() => {
          if (!showList) {
            onRefresh();
          }
          setShowList(!showList);
        }}
        aria-label={activeDevice ? `Playing on ${activeDevice.name}` : "Select device"}
        title={activeDevice?.name || "Select device"}
      >
        <span className="device-selector-compact__icon">
          {activeDevice ? getDeviceIcon(activeDevice.type) : <DefaultDeviceIcon />}
        </span>
      </button>

      {showList && (
        <div className="device-selector-compact__popup">
          <div className="device-selector-compact__popup-header">
            <span>Connect to a device</span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="Refresh devices"
            >
              <RefreshIcon />
            </button>
          </div>

          <div className="device-selector-compact__popup-list">
            {devices.length === 0 ? (
              <div className="device-selector-compact__popup-empty">
                {isLoading ? "Searching..." : "No devices found"}
              </div>
            ) : (
              devices.map((device) => (
                <button
                  key={device.id || device.name}
                  type="button"
                  className={`device-selector-compact__popup-item ${
                    device.is_active ? "device-selector-compact__popup-item--active" : ""
                  }`}
                  onClick={() => {
                    onDeviceSelect(device);
                    setShowList(false);
                  }}
                  disabled={device.is_active || isTransferring === device.id || !device.id}
                >
                  <span>{getDeviceIcon(device.type)}</span>
                  <span>{device.name}</span>
                  {device.is_active && <ActiveIndicatorIcon />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Default Export
// =============================================================================

export default DeviceSelector;
