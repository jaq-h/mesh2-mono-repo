// =============================================================================
// Spinner Component - Loading Indicator
// =============================================================================

import React from "react";

// =============================================================================
// Types
// =============================================================================

export interface SpinnerProps {
  /**
   * Size variant or custom size in pixels
   * @default "medium"
   */
  size?: "small" | "medium" | "large" | number;

  /**
   * Color of the spinner
   * @default "currentColor"
   */
  color?: string;

  /**
   * Border width in pixels
   * @default 2
   */
  borderWidth?: number;

  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Label for accessibility (screen readers)
   * @default "Loading"
   */
  label?: string;
}

// =============================================================================
// Size Mappings
// =============================================================================

const sizeMap = {
  small: 16,
  medium: 24,
  large: 40,
};

// =============================================================================
// Component
// =============================================================================

export function Spinner({
  size = "medium",
  color = "currentColor",
  borderWidth = 2,
  className = "",
  label = "Loading",
}: SpinnerProps) {
  const sizeValue = typeof size === "number" ? size : sizeMap[size];

  const spinnerStyle: React.CSSProperties = {
    width: sizeValue,
    height: sizeValue,
    borderWidth,
    borderStyle: "solid",
    borderColor: `${color === "currentColor" ? "rgba(255,255,255,0.2)" : `${color}33`}`,
    borderTopColor: color,
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    boxSizing: "border-box",
  };

  return (
    <div
      className={`spinner ${className}`}
      style={spinnerStyle}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}

// =============================================================================
// Spinner with Text
// =============================================================================

export interface SpinnerWithTextProps extends SpinnerProps {
  /**
   * Text to display next to the spinner
   */
  text?: string;

  /**
   * Position of the text relative to the spinner
   * @default "right"
   */
  textPosition?: "top" | "right" | "bottom" | "left";
}

export function SpinnerWithText({
  text = "Loading...",
  textPosition = "right",
  ...spinnerProps
}: SpinnerWithTextProps) {
  const containerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    flexDirection:
      textPosition === "top"
        ? "column-reverse"
        : textPosition === "bottom"
          ? "column"
          : textPosition === "left"
            ? "row-reverse"
            : "row",
  };

  return (
    <div className="spinner-with-text" style={containerStyle}>
      <Spinner {...spinnerProps} />
      <span className="spinner-with-text__text">{text}</span>
    </div>
  );
}

// =============================================================================
// Overlay Spinner (Full-screen or container overlay)
// =============================================================================

export interface SpinnerOverlayProps extends SpinnerProps {
  /**
   * Text to display below the spinner
   */
  text?: string;

  /**
   * Whether to cover the full viewport
   * @default false
   */
  fullScreen?: boolean;

  /**
   * Background color/opacity
   * @default "rgba(0, 0, 0, 0.5)"
   */
  backgroundColor?: string;
}

export function SpinnerOverlay({
  text,
  fullScreen = false,
  backgroundColor = "rgba(0, 0, 0, 0.5)",
  size = "large",
  ...spinnerProps
}: SpinnerOverlayProps) {
  const overlayStyle: React.CSSProperties = {
    position: fullScreen ? "fixed" : "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor,
    zIndex: fullScreen ? 9999 : 10,
    gap: "1rem",
  };

  return (
    <div className="spinner-overlay" style={overlayStyle}>
      <Spinner size={size} {...spinnerProps} />
      {text && (
        <span
          className="spinner-overlay__text"
          style={{ color: "white", fontSize: "0.875rem" }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Inline Spinner (for buttons, etc.)
// =============================================================================

export interface InlineSpinnerProps {
  /**
   * Size in pixels
   * @default 16
   */
  size?: number;

  /**
   * Color of the spinner
   * @default "currentColor"
   */
  color?: string;

  /**
   * Additional CSS class name
   */
  className?: string;
}

export function InlineSpinner({
  size = 16,
  color = "currentColor",
  className = "",
}: InlineSpinnerProps) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderWidth: Math.max(2, size / 8),
    borderStyle: "solid",
    borderColor: `transparent`,
    borderTopColor: color,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
    verticalAlign: "middle",
  };

  return (
    <span
      className={`inline-spinner ${className}`}
      style={style}
      role="status"
      aria-hidden="true"
    />
  );
}

// =============================================================================
// Default Export
// =============================================================================

export default Spinner;
