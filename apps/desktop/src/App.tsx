// =============================================================================
// Desktop App - Main Application Component (Tauri)
// =============================================================================

import { useMemo, useEffect, useState, useCallback } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { SpotifyProvider, LoginPage, PlayerPage, Spinner } from "@mesh/ui";
import { createTauriSpotifyService } from "./services/TauriSpotifyService";
import { Settings } from "./components/Settings";

// =============================================================================
// Configuration
// =============================================================================

const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  PLAYER: "/player",
} as const;

// =============================================================================
// Route Components
// =============================================================================

function LoginPageWrapper() {
  const navigate = useNavigate();

  return (
    <LoginPage
      appName="Mesh Desktop"
      subtitle="Control your Spotify playback from your desktop"
      features={[
        {
          icon: "🖥️",
          text: "Native desktop experience with system integration",
        },
        {
          icon: "🎧",
          text: "Control playback across all your devices",
        },
        {
          icon: "🔒",
          text: "Secure OAuth authentication with Spotify",
        },
      ]}
      onLoginSuccess={() => {
        navigate(ROUTES.PLAYER, { replace: true });
      }}
      onLoginError={(error: string) => {
        console.error("Login error:", error);
      }}
    />
  );
}

function PlayerPageWrapper() {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <PlayerPage
        onLogout={() => {
          navigate(ROUTES.LOGIN, { replace: true });
        }}
        onUnauthenticated={() => {
          navigate(ROUTES.LOGIN, { replace: true });
        }}
        deviceRefreshInterval={30000}
      />

      {/* Settings Button */}
      <button
        onClick={() => setShowSettings(true)}
        style={{
          position: "fixed",
          top: "1rem",
          right: "1rem",
          background: "rgba(255,255,255,0.1)",
          border: "none",
          borderRadius: "50%",
          width: "36px",
          height: "36px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#b3b3b3",
          fontSize: "1.25rem",
          transition: "all 0.2s",
          zIndex: 100,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.2)";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          e.currentTarget.style.color = "#b3b3b3";
        }}
        title="Settings"
      >
        ⚙
      </button>

      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  );
}

// =============================================================================
// Loading Screen
// =============================================================================

function LoadingScreen() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "1rem",
        backgroundColor: "#121212",
      }}
    >
      <Spinner size="large" />
      <p style={{ color: "#b3b3b3", fontSize: "0.875rem" }}>
        Initializing Mesh Desktop...
      </p>
    </div>
  );
}

// =============================================================================
// App Routes
// =============================================================================

function AppRoutes({
  initialAuthenticated,
}: {
  initialAuthenticated: boolean;
}) {
  return (
    <Routes>
      {/* Home redirects based on auth status */}
      <Route
        path={ROUTES.HOME}
        element={
          <Navigate
            to={initialAuthenticated ? ROUTES.PLAYER : ROUTES.LOGIN}
            replace
          />
        }
      />

      {/* Login Page */}
      <Route path={ROUTES.LOGIN} element={<LoginPageWrapper />} />

      {/* Main Player Page */}
      <Route path={ROUTES.PLAYER} element={<PlayerPageWrapper />} />

      {/* Catch-all redirect based on auth status */}
      <Route
        path="*"
        element={
          <Navigate
            to={initialAuthenticated ? ROUTES.PLAYER : ROUTES.LOGIN}
            replace
          />
        }
      />
    </Routes>
  );
}

// =============================================================================
// Main App Component
// =============================================================================

function App() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initialUser, setInitialUser] = useState<any>(null);
  const [pollingIntervalMs, setPollingIntervalMs] = useState<number | null>(
    5000,
  );
  const [settingsVersion, setSettingsVersion] = useState(0);

  // Create the Tauri service instance once
  const service = useMemo(() => createTauriSpotifyService(), []);

  // Callback to reload polling interval from settings
  const reloadPollingInterval = useCallback(async () => {
    try {
      const intervalMs = await service.getPollingIntervalMs();
      setPollingIntervalMs(intervalMs);
      // Increment version to force SpotifyProvider to recognize the change
      setSettingsVersion((v) => v + 1);
      console.log("Polling interval updated:", intervalMs, "ms");
    } catch (error) {
      console.error("Failed to reload polling interval:", error);
    }
  }, [service]);

  // Initialize the app
  useEffect(() => {
    const init = async () => {
      try {
        // Try to restore authentication from stored refresh tokens
        // This avoids re-authentication on every app launch
        const restoredUser = await service.tryRestoreAuth();
        if (restoredUser) {
          console.log(
            "Authentication restored for:",
            restoredUser.display_name || restoredUser.id,
          );
          setInitialUser(restoredUser);
          setIsAuthenticated(true);
        } else {
          console.log("No stored authentication found, login required");
          setIsAuthenticated(false);
        }
        console.log("Desktop app initialized, authenticated:", !!restoredUser);

        // Load polling interval from settings
        const intervalMs = await service.getPollingIntervalMs();
        setPollingIntervalMs(intervalMs);
        console.log("Polling interval:", intervalMs, "ms");
      } catch (error) {
        console.error("Failed to initialize:", error);
      } finally {
        setIsReady(true);
      }
    };

    // Small delay to show loading screen
    const timer = setTimeout(() => {
      init();
    }, 500);

    // Cleanup on unmount
    return () => {
      clearTimeout(timer);
      service.destroy();
    };
  }, [service]);

  // Listen for settings changes from Tauri backend
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen("settings-changed", () => {
          console.log(
            "Settings changed event received, reloading polling interval",
          );
          reloadPollingInterval();
        });
      } catch (error) {
        console.error("Failed to setup settings-changed listener:", error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [reloadPollingInterval]);

  // Show loading screen while initializing
  if (!isReady) {
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter>
      <SpotifyProvider
        key={`spotify-provider-${settingsVersion}`}
        service={service}
        pollingInterval={pollingIntervalMs ?? 5000}
        autoStartPolling={pollingIntervalMs !== null}
        initialUser={initialUser}
      >
        <div className="app">
          <AppRoutes initialAuthenticated={isAuthenticated} />
        </div>
      </SpotifyProvider>
    </BrowserRouter>
  );
}

// =============================================================================
// Export
// =============================================================================

export default App;
