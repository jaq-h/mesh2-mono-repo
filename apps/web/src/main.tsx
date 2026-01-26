// =============================================================================
// Web App Entry Point
// =============================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Import shared styles from @mesh/ui
import "@mesh/ui/src/styles/index.css";
import "@mesh/ui/src/styles/app.css";

// Mount the app
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
