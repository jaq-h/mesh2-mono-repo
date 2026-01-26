// =============================================================================
// Web App - Main Application Component
// =============================================================================

import { useMemo } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { SpotifyProvider, LoginPage, RedirectPage, PlayerPage } from "@mesh/ui";
import { createWebSpotifyService } from "./services/WebSpotifyService";

// =============================================================================
// Configuration
// =============================================================================

// Use empty string to leverage Vite's proxy configuration for /api routes
// This avoids CORS issues during development
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REDIRECT: "/redirect",
  PLAYER: "/player",
} as const;

// =============================================================================
// Route Components (with navigation logic)
// =============================================================================

function LoginPageWrapper() {
  const navigate = useNavigate();

  return (
    <LoginPage
      appName="Mesh"
      subtitle="Control your Spotify playback from anywhere"
      onLoginSuccess={() => {
        // Login redirects to Spotify, so this is only called
        // if user is already authenticated
        navigate(ROUTES.PLAYER, { replace: true });
      }}
      onLoginError={(error) => {
        console.error("Login error:", error);
      }}
    />
  );
}

function RedirectPageWrapper() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  return (
    <RedirectPage
      appName="Mesh"
      getAuthCode={() => searchParams.get("code")}
      getAuthError={() => {
        const error = searchParams.get("error");
        if (error) {
          return {
            error,
            description: searchParams.get("error_description") || undefined,
          };
        }
        return null;
      }}
      onSuccess={() => {
        navigate(ROUTES.PLAYER, { replace: true });
      }}
      onError={() => {
        navigate(ROUTES.LOGIN, { replace: true });
      }}
    />
  );
}

function PlayerPageWrapper() {
  const navigate = useNavigate();

  return (
    <PlayerPage
      onLogout={() => {
        navigate(ROUTES.LOGIN, { replace: true });
      }}
      onUnauthenticated={() => {
        navigate(ROUTES.LOGIN, { replace: true });
      }}
    />
  );
}

// =============================================================================
// App Routes
// =============================================================================

function AppRoutes() {
  return (
    <Routes>
      {/* Home redirects to login */}
      <Route
        path={ROUTES.HOME}
        element={<Navigate to={ROUTES.LOGIN} replace />}
      />

      {/* Login Page */}
      <Route path={ROUTES.LOGIN} element={<LoginPageWrapper />} />

      {/* OAuth Redirect Callback */}
      <Route path={ROUTES.REDIRECT} element={<RedirectPageWrapper />} />

      {/* Main Player Page */}
      <Route path={ROUTES.PLAYER} element={<PlayerPageWrapper />} />

      {/* Catch-all redirect to login */}
      <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
    </Routes>
  );
}

// =============================================================================
// Main App Component
// =============================================================================

function App() {
  // Create the service instance once
  const service = useMemo(() => createWebSpotifyService(API_BASE_URL), []);

  return (
    <BrowserRouter>
      <SpotifyProvider
        service={service}
        pollingInterval={5000}
        autoStartPolling={true}
      >
        <div className="app">
          <AppRoutes />
        </div>
      </SpotifyProvider>
    </BrowserRouter>
  );
}

// =============================================================================
// Export
// =============================================================================

export default App;
