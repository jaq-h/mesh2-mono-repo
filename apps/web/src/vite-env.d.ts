/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL */
  readonly VITE_API_BASE_URL: string;
  /** Frontend app URL */
  readonly VITE_APP_URL: string;
  /** Enable debug mode */
  readonly VITE_DEBUG_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
