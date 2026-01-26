/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Enable debug mode */
  readonly VITE_DEBUG_MODE: string;
  /** Tauri platform (windows, macos, linux) */
  readonly TAURI_ENV_PLATFORM: string;
  /** Tauri architecture */
  readonly TAURI_ENV_ARCH: string;
  /** Tauri target triple */
  readonly TAURI_ENV_TARGET_TRIPLE: string;
  /** Tauri family (unix, windows) */
  readonly TAURI_ENV_FAMILY: string;
  /** Whether this is a debug build */
  readonly TAURI_ENV_DEBUG: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
