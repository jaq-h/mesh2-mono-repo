// =============================================================================
// Spotify Context - Unified State Management for Web and Desktop
// =============================================================================

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type {
  SpotifyService,
  SpotifyUser,
  PlaybackState,
  SpotifyDevice,
  RepeatMode,
  PlayOptions,
} from "@mesh/spotify-api";

// =============================================================================
// Types
// =============================================================================

/**
 * Sleep mode for polling when no music is playing
 * - "awake": Normal polling at configured rate
 * - "light": Light sleep - checking every 60 seconds
 * - "hard": Hard sleep - no polling, requires manual refresh
 */
export type SleepMode = "awake" | "light" | "hard";

export interface SpotifyContextState {
  // Authentication
  user: SpotifyUser | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authError: string | null;

  // Playback
  playback: PlaybackState | null;
  isPlaybackLoading: boolean;
  playbackError: string | null;

  // Devices
  devices: SpotifyDevice[];
  activeDevice: SpotifyDevice | null;
  isDevicesLoading: boolean;
  devicesError: string | null;

  // General
  isInitialized: boolean;

  // Sleep mode for polling
  sleepMode: SleepMode;
}

export interface SpotifyContextActions {
  // Auth
  login: () => Promise<void>;
  handleCallback: (code: string, state?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  clearAuthError: () => void;

  // Playback Controls
  play: (options?: PlayOptions) => Promise<void>;
  pause: () => Promise<void>;
  togglePlayback: () => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volumePercent: number) => Promise<void>;
  setShuffle: (state: boolean) => Promise<void>;
  setRepeat: (state: RepeatMode) => Promise<void>;
  addToQueue: (uri: string) => Promise<void>;

  // Devices
  refreshDevices: () => Promise<void>;
  transferPlayback: (deviceId: string, play?: boolean) => Promise<void>;

  // Playback State
  refreshPlayback: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  wakeFromSleep: () => void;

  // Clear errors
  clearPlaybackError: () => void;
  clearDevicesError: () => void;
}

export interface SpotifyContextValue
  extends SpotifyContextState,
    SpotifyContextActions {
  service: SpotifyService;
}

// =============================================================================
// Context
// =============================================================================

const SpotifyContext = createContext<SpotifyContextValue | null>(null);

// =============================================================================
// Provider Props
// =============================================================================

export interface SpotifyProviderProps {
  /**
   * The SpotifyService implementation (web or desktop)
   */
  service: SpotifyService;

  /**
   * Polling interval for playback state (ms)
   * @default 5000
   */
  pollingInterval?: number;

  /**
   * Whether to start polling automatically when authenticated
   * @default true
   */
  autoStartPolling?: boolean;

  /**
   * Initial user if already authenticated (skips isAuthenticated IPC call)
   * Pass this if the app has already verified authentication on startup
   */
  initialUser?: SpotifyUser | null;

  /**
   * Children components
   */
  children: ReactNode;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export function SpotifyProvider({
  service,
  pollingInterval = 5000,
  autoStartPolling = true,
  initialUser = null,
  children,
}: SpotifyProviderProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Auth state - use initialUser if provided to skip redundant IPC call
  const [user, setUser] = useState<SpotifyUser | null>(initialUser);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Playback state
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [isPlaybackLoading, setIsPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Devices state
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [isDevicesLoading, setIsDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);

  // General state
  const [isInitialized, setIsInitialized] = useState(false);

  // Sleep mode state
  const [sleepMode, setSleepMode] = useState<SleepMode>("awake");

  // Refs
  const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingRef = useRef(false);

  // Sleep mode refs
  const lastPlayingTimeRef = useRef<number>(Date.now());
  const sleepModeRef = useRef<SleepMode>("awake");
  const lightSleepCheckDoneRef = useRef(false);

  // Constants for sleep system
  const IDLE_THRESHOLD_MS = 30_000; // 30 seconds before entering light sleep
  const LIGHT_SLEEP_INTERVAL_MS = 60_000; // 60 seconds between checks in light sleep
  const HARD_SLEEP_INTERVAL_MS = 120_000; // 2 minutes heartbeat in hard sleep (never fully stop)

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const isAuthenticated = !!user;
  const activeDevice = devices.find((d) => d.is_active) || null;

  // ---------------------------------------------------------------------------
  // Initialize
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const initialize = async () => {
      try {
        // If initialUser was provided, skip the isAuthenticated IPC call
        if (initialUser) {
          // User already set, just load data
          await refreshPlayback();
          await refreshDevices();

          if (autoStartPolling) {
            startPolling();
          }
        } else {
          // No initial user, check authentication
          const authenticated = await service.isAuthenticated();
          if (authenticated) {
            const currentUser = await service.getCurrentUser();
            setUser(currentUser);

            await refreshPlayback();
            await refreshDevices();

            if (autoStartPolling) {
              startPolling();
            }
          }
        }
      } catch (error) {
        console.error("Failed to initialize:", error);
      } finally {
        setIsInitialized(true);
      }
    };

    initialize();

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, initialUser]);

  // ---------------------------------------------------------------------------
  // Auth Actions
  // ---------------------------------------------------------------------------

  const login = useCallback(async () => {
    setIsAuthLoading(true);
    setAuthError(null);

    try {
      const authenticatedUser = await service.login();
      setUser(authenticatedUser);

      await refreshPlayback();
      await refreshDevices();

      if (autoStartPolling) {
        startPolling();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setAuthError(message);
      throw error;
    } finally {
      setIsAuthLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, autoStartPolling]);

  const handleCallback = useCallback(
    async (code: string, state?: string) => {
      setIsAuthLoading(true);
      setAuthError(null);

      try {
        if (
          "handleCallback" in service &&
          typeof (service as any).handleCallback === "function"
        ) {
          const authenticatedUser = await (service as any).handleCallback(
            code,
            state,
          );
          setUser(authenticatedUser);

          await refreshPlayback();
          await refreshDevices();

          if (autoStartPolling) {
            startPolling();
          }
        } else {
          throw new Error("handleCallback is not supported by this service");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Authentication failed";
        setAuthError(message);
        throw error;
      } finally {
        setIsAuthLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [service, autoStartPolling],
  );

  const logout = useCallback(async () => {
    setIsAuthLoading(true);

    try {
      stopPolling();
      await service.logout();
      setUser(null);
      setPlayback(null);
      setDevices([]);
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsAuthLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      return await service.refreshToken();
    } catch (error) {
      console.error("Token refresh failed:", error);
      return false;
    }
  }, [service]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Playback State Actions
  // ---------------------------------------------------------------------------

  const refreshPlayback = useCallback(async () => {
    if (!isAuthenticated && isInitialized) return;

    setIsPlaybackLoading(true);
    setPlaybackError(null);

    try {
      const state = await service.getPlaybackState();
      setPlayback(state);

      // If music is playing after a manual refresh, wake from sleep
      if (state?.is_playing) {
        lastPlayingTimeRef.current = Date.now();
        lightSleepCheckDoneRef.current = false;
        if (sleepModeRef.current !== "awake") {
          sleepModeRef.current = "awake";
          setSleepMode("awake");
          if (!isPollingRef.current) {
            setTimeout(() => {
              if (!isPollingRef.current) {
                startPolling();
              }
            }, 0);
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get playback state";
      setPlaybackError(message);
    } finally {
      setIsPlaybackLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, isAuthenticated, isInitialized]);

  const handleSleepLogic = useCallback(
    (state: PlaybackState | null): boolean => {
      const now = Date.now();
      const isPlaying = state?.is_playing ?? false;

      if (isPlaying) {
        lastPlayingTimeRef.current = now;
        lightSleepCheckDoneRef.current = false;
        const wasNotAwake = sleepModeRef.current !== "awake";
        if (wasNotAwake) {
          sleepModeRef.current = "awake";
          setSleepMode("awake");
          console.log(
            "[Polling] Waking up - music is playing (was in sleep mode)",
          );
        }
        // Return true if we woke up from a sleep mode, so caller can adjust polling rate
        return wasNotAwake;
      }

      const idleTime = now - lastPlayingTimeRef.current;

      if (sleepModeRef.current === "awake") {
        if (idleTime >= IDLE_THRESHOLD_MS) {
          sleepModeRef.current = "light";
          setSleepMode("light");
          lightSleepCheckDoneRef.current = false;
          console.log("[Polling] Entering light sleep - no music for 30s");
        }
      } else if (sleepModeRef.current === "light") {
        if (lightSleepCheckDoneRef.current) {
          sleepModeRef.current = "hard";
          setSleepMode("hard");
          console.log(
            "[Polling] Entering hard sleep - still no music after light sleep check",
          );
        } else {
          lightSleepCheckDoneRef.current = true;
        }
      }
      return false; // No wake-up occurred
    },
    [],
  );

  const startPolling = useCallback(() => {
    if (isPollingRef.current) return;

    isPollingRef.current = true;

    const poll = async () => {
      if (!isPollingRef.current) return;

      let nextInterval: number;
      const currentSleepMode = sleepModeRef.current;

      // Never fully stop polling - use a heartbeat even in hard sleep
      // This ensures we detect when music starts playing again from external sources
      if (currentSleepMode === "hard") {
        nextInterval = HARD_SLEEP_INTERVAL_MS;
        console.log("[Polling] In hard sleep - heartbeat poll every 2 minutes");
      } else if (currentSleepMode === "light") {
        nextInterval = LIGHT_SLEEP_INTERVAL_MS;
      } else {
        nextInterval = pollingInterval;
      }

      try {
        const state = await service.getPlaybackState();
        setPlayback(state);
        const wokeUp = handleSleepLogic(state);

        // If we just woke up from sleep mode, use normal polling interval
        // instead of the slow sleep interval we were using
        if (wokeUp && isPollingRef.current) {
          console.log("[Polling] Resuming normal polling rate after wake-up");
          pollingIntervalRef.current = setTimeout(poll, pollingInterval);
          return; // Skip the default scheduling below
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to get playback state";
        setPlaybackError(message);
        // Don't let errors stop the polling loop - schedule next poll anyway
      }

      // Always schedule next poll as long as we're supposed to be polling
      if (isPollingRef.current) {
        pollingIntervalRef.current = setTimeout(poll, nextInterval);
      }
    };

    poll();
  }, [pollingInterval, service, handleSleepLogic]);

  const stopPolling = useCallback(() => {
    isPollingRef.current = false;
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const wakeFromSleep = useCallback(() => {
    lastPlayingTimeRef.current = Date.now();
    lightSleepCheckDoneRef.current = false;
    const wasSleeping = sleepModeRef.current !== "awake";
    sleepModeRef.current = "awake";
    setSleepMode("awake");
    console.log("[Polling] Manual wake from sleep");

    if (!isPollingRef.current) {
      startPolling();
    } else if (wasSleeping) {
      // If we were in a slower sleep mode, clear the existing timeout
      // and immediately poll to get fresh data, then resume at normal rate
      if (pollingIntervalRef.current) {
        clearTimeout(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      // Refresh immediately - this will also restart the normal polling cycle
      refreshPlayback().then(() => {
        // Ensure polling continues at normal rate after wake
        if (isPollingRef.current && !pollingIntervalRef.current) {
          pollingIntervalRef.current = setTimeout(() => {
            if (isPollingRef.current) {
              // Restart the polling loop
              isPollingRef.current = false;
              startPolling();
            }
          }, pollingInterval);
        }
      });
      return; // Don't call refreshPlayback again below
    }

    refreshPlayback();
  }, [startPolling, refreshPlayback, pollingInterval]);

  const clearPlaybackError = useCallback(() => {
    setPlaybackError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Playback Control Actions
  // ---------------------------------------------------------------------------

  const play = useCallback(
    async (options?: PlayOptions) => {
      // Wake from sleep mode when user takes action
      if (sleepModeRef.current !== "awake") {
        lastPlayingTimeRef.current = Date.now();
        lightSleepCheckDoneRef.current = false;
        sleepModeRef.current = "awake";
        setSleepMode("awake");
        console.log("[Polling] Waking up due to play action");
      }
      try {
        await service.play(options);
        // Wake and refresh after action
        setTimeout(() => {
          refreshPlayback();
          // Ensure we're polling at normal rate
          if (!isPollingRef.current) {
            startPolling();
          }
        }, 300);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to play";
        setPlaybackError(message);
      }
    },
    [service, refreshPlayback, startPolling],
  );

  const pause = useCallback(async () => {
    // Wake from sleep mode when user takes action (to ensure we see the pause)
    if (sleepModeRef.current !== "awake") {
      lastPlayingTimeRef.current = Date.now();
      lightSleepCheckDoneRef.current = false;
      sleepModeRef.current = "awake";
      setSleepMode("awake");
      console.log("[Polling] Waking up due to pause action");
    }
    try {
      await service.pause();
      setTimeout(() => {
        refreshPlayback();
        if (!isPollingRef.current) {
          startPolling();
        }
      }, 300);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to pause";
      setPlaybackError(message);
    }
  }, [service, refreshPlayback, startPolling]);

  const togglePlayback = useCallback(async () => {
    if (playback?.is_playing) {
      await pause();
    } else {
      await play();
    }
  }, [playback, play, pause]);

  const nextTrack = useCallback(async () => {
    // Wake from sleep mode when user takes action
    if (sleepModeRef.current !== "awake") {
      lastPlayingTimeRef.current = Date.now();
      lightSleepCheckDoneRef.current = false;
      sleepModeRef.current = "awake";
      setSleepMode("awake");
      console.log("[Polling] Waking up due to next track action");
    }
    try {
      await service.nextTrack();
      setTimeout(() => {
        refreshPlayback();
        if (!isPollingRef.current) {
          startPolling();
        }
      }, 300);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to skip";
      setPlaybackError(message);
    }
  }, [service, refreshPlayback, startPolling]);

  const previousTrack = useCallback(async () => {
    // Wake from sleep mode when user takes action
    if (sleepModeRef.current !== "awake") {
      lastPlayingTimeRef.current = Date.now();
      lightSleepCheckDoneRef.current = false;
      sleepModeRef.current = "awake";
      setSleepMode("awake");
      console.log("[Polling] Waking up due to previous track action");
    }
    try {
      await service.previousTrack();
      setTimeout(() => {
        refreshPlayback();
        if (!isPollingRef.current) {
          startPolling();
        }
      }, 300);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to go back";
      setPlaybackError(message);
    }
  }, [service, refreshPlayback, startPolling]);

  const seek = useCallback(
    async (positionMs: number) => {
      // Wake from sleep mode when user takes action
      if (sleepModeRef.current !== "awake") {
        lastPlayingTimeRef.current = Date.now();
        lightSleepCheckDoneRef.current = false;
        sleepModeRef.current = "awake";
        setSleepMode("awake");
        console.log("[Polling] Waking up due to seek action");
      }
      try {
        await service.seek(positionMs);
        setTimeout(() => {
          refreshPlayback();
          if (!isPollingRef.current) {
            startPolling();
          }
        }, 300);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to seek";
        setPlaybackError(message);
      }
    },
    [service, refreshPlayback, startPolling],
  );

  const setVolume = useCallback(
    async (volumePercent: number) => {
      try {
        await service.setVolume(volumePercent);
        setTimeout(refreshPlayback, 300);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to set volume";
        setPlaybackError(message);
      }
    },
    [service, refreshPlayback],
  );

  const setShuffle = useCallback(
    async (state: boolean) => {
      try {
        await service.setShuffle(state);
        setTimeout(refreshPlayback, 300);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to set shuffle";
        setPlaybackError(message);
      }
    },
    [service, refreshPlayback],
  );

  const setRepeat = useCallback(
    async (state: RepeatMode) => {
      try {
        await service.setRepeat(state);
        setTimeout(refreshPlayback, 300);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to set repeat";
        setPlaybackError(message);
      }
    },
    [service, refreshPlayback],
  );

  const addToQueue = useCallback(
    async (uri: string) => {
      try {
        await service.addToQueue(uri);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to add to queue";
        setPlaybackError(message);
      }
    },
    [service],
  );

  // ---------------------------------------------------------------------------
  // Device Actions
  // ---------------------------------------------------------------------------

  const refreshDevices = useCallback(async () => {
    if (!isAuthenticated && isInitialized) return;

    setIsDevicesLoading(true);
    setDevicesError(null);

    try {
      const deviceList = await service.getDevices();
      setDevices(deviceList);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get devices";
      setDevicesError(message);
    } finally {
      setIsDevicesLoading(false);
    }
  }, [service, isAuthenticated, isInitialized]);

  const transferPlayback = useCallback(
    async (deviceId: string, play = true) => {
      try {
        await service.transferPlayback(deviceId, play);
        setTimeout(async () => {
          await refreshDevices();
          await refreshPlayback();
        }, 500);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to transfer playback";
        setDevicesError(message);
      }
    },
    [service, refreshDevices, refreshPlayback],
  );

  const clearDevicesError = useCallback(() => {
    setDevicesError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value: SpotifyContextValue = {
    // Service
    service,

    // Auth State
    user,
    isAuthenticated,
    isAuthLoading,
    authError,

    // Playback State
    playback,
    isPlaybackLoading,
    playbackError,

    // Devices State
    devices,
    activeDevice,
    isDevicesLoading,
    devicesError,

    // General State
    isInitialized,

    // Sleep Mode
    sleepMode,

    // Auth Actions
    login,
    handleCallback,
    logout,
    refreshToken,
    clearAuthError,

    // Playback Controls
    play,
    pause,
    togglePlayback,
    nextTrack,
    previousTrack,
    seek,
    setVolume,
    setShuffle,
    setRepeat,
    addToQueue,

    // Playback State Actions
    refreshPlayback,
    startPolling,
    stopPolling,
    wakeFromSleep,
    clearPlaybackError,

    // Device Actions
    refreshDevices,
    transferPlayback,
    clearDevicesError,
  };

  return (
    <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to access the full Spotify context
 */
export function useSpotify() {
  const context = useContext(SpotifyContext);
  if (!context) {
    throw new Error("useSpotify must be used within a SpotifyProvider");
  }
  return context;
}

/**
 * Hook to access only auth-related state and actions
 */
export function useSpotifyAuth() {
  const {
    user,
    isAuthenticated,
    isAuthLoading,
    authError,
    login,
    handleCallback,
    logout,
    refreshToken,
    clearAuthError,
  } = useSpotify();

  return {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    error: authError,
    login,
    handleCallback,
    logout,
    refreshToken,
    clearError: clearAuthError,
  };
}

/**
 * Hook to access only playback-related state and actions
 */
export function useSpotifyPlayback() {
  const {
    playback,
    isPlaybackLoading,
    playbackError,
    sleepMode,
    play,
    pause,
    togglePlayback,
    nextTrack,
    previousTrack,
    seek,
    setVolume,
    setShuffle,
    setRepeat,
    addToQueue,
    refreshPlayback,
    wakeFromSleep,
    clearPlaybackError,
  } = useSpotify();

  return {
    playback,
    isPlaying: playback?.is_playing ?? false,
    currentTrack: playback?.item ?? null,
    progress: playback?.progress_ms ?? 0,
    duration: playback?.item?.duration_ms ?? 0,
    shuffle: playback?.shuffle_state ?? false,
    repeat: playback?.repeat_state ?? "off",
    volume: playback?.device?.volume_percent ?? 100,
    sleepMode,
    isLoading: isPlaybackLoading,
    error: playbackError,
    play,
    pause,
    togglePlayback,
    nextTrack,
    previousTrack,
    seek,
    setVolume,
    setShuffle,
    setRepeat,
    addToQueue,
    refresh: refreshPlayback,
    wakeFromSleep,
    clearError: clearPlaybackError,
  };
}

/**
 * Hook to access only device-related state and actions
 */
export function useSpotifyDevices() {
  const {
    devices,
    activeDevice,
    isDevicesLoading,
    devicesError,
    refreshDevices,
    transferPlayback,
    clearDevicesError,
  } = useSpotify();

  return {
    devices,
    activeDevice,
    isLoading: isDevicesLoading,
    error: devicesError,
    refresh: refreshDevices,
    transfer: transferPlayback,
    clearError: clearDevicesError,
  };
}
