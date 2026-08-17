import { useState, useEffect, useRef, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useGamepad } from "./providers/GamepadContext";
import { GamepadActionState } from "./core/focus/gamepadInput";
import "./App.css";

// Types
import {
  SteamGame,
  GameDto,
  PlaytimeStats,
  SettingsTab,
  EditTab,
  FocusArea,
  MainSection,
  SteamUserInfo,
  SteamImportResult,
  SteamImportProgress,
} from "./types/game";

// Utils
import { gameDtoToSteamGame, getGameImageUrl, isProtonOrSteamTool } from "./utils/gameUtils";

// UI & Layout Components
import { AmbientBackground } from "./components/ui/AmbientBackground";
import { LaunchingOverlay } from "./components/ui/LaunchingOverlay";
import { ConsoleLayout } from "./components/layouts/ConsoleLayout";

// Feature Components
import { Header } from "./components/features/header/Header";
import { MainView } from "./components/features/library/MainView";
import { EmptyLibrary } from "./components/features/library/EmptyLibrary";
import { LibraryModal } from "./components/features/library/LibraryModal";
import { AtlasGameDetailView } from "./components/features/game-details/AtlasGameDetailView";
import { SettingsModal } from "./components/features/settings/SettingsModal";
import { EditGameModal } from "./components/features/modals/EditGameModal";
import { FileExplorerModal } from "./components/features/modals/FileExplorerModal";
import { ImagePickerModal } from "./components/features/modals/ImagePickerModal";
import { VideoPlayerModal } from "./components/features/modals/VideoPlayerModal";
import { MovieFile } from "./components/features/media/MediaSection";

function App() {
  // Main games states
  const [steamGames, setSteamGames] = useState<SteamGame[]>([]);
  const [customGames, setCustomGames] = useState<SteamGame[]>([]);
  const [games, setGames] = useState<SteamGame[]>([]);
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingSearchingIgdb, setEditingSearchingIgdb] = useState(false);

  const installedGames = useMemo(() => {
    return games.filter((g) => g.is_installed);
  }, [games]);

  const uninstalledGames = useMemo(() => {
    return games.filter((g) => !g.is_installed);
  }, [games]);

  const libraryCardItem: SteamGame = useMemo(
    () => ({
      appid: "__LIBRARY_CARD__",
      name: "Minha Biblioteca",
      installdir: "",
      library_path: "",
      image_url: "",
      is_installed: true,
    }),
    []
  );

  const carouselGames = useMemo(() => {
    return [...installedGames, libraryCardItem];
  }, [installedGames, libraryCardItem]);

  const [isSimulated, setIsSimulated] = useState(false);
  const [ambientBgUrl, setAmbientBgUrl] = useState("");

  const [launchingGame, setLaunchingGame] = useState<SteamGame | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("geral");
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return localStorage.getItem("atlas_theme") || "atlas";
  });
  const [shellEnabled, setShellEnabled] = useState(false);
  const [systemTime, setSystemTime] = useState("");
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const { gamepadConnected, registerLayerHandler } = useGamepad();
  const [youtubeActive, setYoutubeActive] = useState(false);
  const [twitchActive, setTwitchActive] = useState(false);
  const [backloggdActive, setBackloggdActive] = useState(false);
  const [activeDetailGame, setActiveDetailGame] = useState<SteamGame | null>(null);
  const [detailSelectedIndex, setDetailSelectedIndex] = useState<number>(0);

  // Playtime Tracking States
  const [playtimes, setPlaytimes] = useState<Record<string, PlaytimeStats>>({});
  const activeSessionIdRef = useRef<number | null>(null);
  const activeLaunchingGameRef = useRef<SteamGame | null>(null);

  // Gallery Navigation Refs
  const galleryPrevRef = useRef<(() => void) | null>(null);
  const galleryNextRef = useRef<(() => void) | null>(null);
  const galleryLightboxRef = useRef<(() => void) | null>(null);

  // States for options menu and editing
  const [editingGame, setEditingGame] = useState<SteamGame | null>(null);
  const [editName, setEditName] = useState("");
  const [editExe, setEditExe] = useState("");
  const [editImg, setEditImg] = useState("");
  const [editBg, setEditBg] = useState("");
  const [editTab, setEditTab] = useState<EditTab>("general");
  const [editPlaytimeHours, setEditPlaytimeHours] = useState("");
  const [editPlaytimeMinutes, setEditPlaytimeMinutes] = useState("");
  const [editLastPlayed, setEditLastPlayed] = useState("");

  const handleOpenEditGame = (game: SteamGame, initialTab: EditTab = "general") => {
    setEditName(game.name);
    setEditExe(game.exe_path || "");
    setEditImg(game.image_url || "");
    setEditBg(game.bg_url || "");
    setEditTab(initialTab);

    const currentPlaytimeSeconds = playtimes[game.appid]?.total_seconds || 0;
    const h = Math.floor(currentPlaytimeSeconds / 3600);
    const m = Math.floor((currentPlaytimeSeconds % 3600) / 60);
    setEditPlaytimeHours(h > 0 ? String(h) : "0");
    setEditPlaytimeMinutes(m > 0 ? String(m) : "0");

    if (game.last_played) {
      try {
        const d = new Date(game.last_played);
        const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setEditLastPlayed(iso);
      } catch (e) {
        setEditLastPlayed("");
      }
    } else {
      setEditLastPlayed("");
    }

    setEditingGame(game);
  };

  // State for active in-app playing movie video modal
  const [activePlayingMovie, setActivePlayingMovie] = useState<MovieFile | null>(null);

  // States for background image picker gallery modal
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerTarget, setImagePickerTarget] = useState<"cover" | "background">("cover");
  const [imagePickerLoading, setImagePickerLoading] = useState(false);
  const [imagePickerQuery, setImagePickerQuery] = useState("");
  const [imagePickerResults, setImagePickerResults] = useState<string[]>([]);
  const [imagePickerSelectedIndex, setImagePickerSelectedIndex] = useState(-1);

  // States for main section and focus
  const [activeSection, setActiveSection] = useState<MainSection>("games");
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [focusArea, setFocusArea] = useState<FocusArea>("carousel");
  const [headerSelectedIndex, setHeaderSelectedIndex] = useState(0);

  // In-App File Explorer States
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  const [fileExplorerPath, setFileExplorerPath] = useState("");
  const [fileExplorerItems, setFileExplorerItems] = useState<any[]>([]);
  const [fileExplorerSelectedIndex, setFileExplorerSelectedIndex] = useState(0);
  const [fileExplorerFilter, setFileExplorerFilter] = useState<string[]>([]);
  const [fileExplorerOnSelect, setFileExplorerOnSelect] = useState<((path: string) => void) | null>(null);
  const [fileExplorerAllowFolderSelect, setFileExplorerAllowFolderSelect] = useState(false);
  const [fileExplorerTitle, setFileExplorerTitle] = useState("");
  const [fileExplorerSubtitle, setFileExplorerSubtitle] = useState("");
  const [availableDrives, setAvailableDrives] = useState<string[]>([]);
  const [mediaItemCount, setMediaItemCount] = useState(4);

  // Steam Account States
  const [steamUser, setSteamUser] = useState<SteamUserInfo | null>(null);
  const [steamImporting, setSteamImporting] = useState(false);
  const [steamImportResult, setSteamImportResult] = useState<SteamImportResult | null>(null);
  const [steamImportProgress, setSteamImportProgress] = useState<SteamImportProgress | null>(null);
  const [steamLoggingIn, setSteamLoggingIn] = useState(false);

  const carouselRef = useRef<HTMLDivElement | null>(null);
  const igdbAttemptsRef = useRef<Record<string, boolean>>({});

  // Reset activeDetailGame on theme change
  useEffect(() => {
    setActiveDetailGame(null);
  }, [currentTheme]);

  // Keep activeDetailGame synced with latest games data
  useEffect(() => {
    if (activeDetailGame) {
      const updated = games.find((g) => g.appid === activeDetailGame.appid);
      if (updated) {
        setActiveDetailGame(updated);
      }
    }
  }, [games]);

  // Update ambient background when detail page opens
  useEffect(() => {
    if (activeDetailGame) {
      const bg = activeDetailGame.bg_url || activeDetailGame.image_url;
      if (bg) {
        const bgUrl =
          bg.startsWith("http://") || bg.startsWith("https://") || bg.startsWith("data:")
            ? bg
            : convertFileSrc(bg);
        setAmbientBgUrl(bgUrl);
      }
    }
  }, [activeDetailGame]);

  // Sync theme with document class/attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("atlas_theme", currentTheme);
  }, [currentTheme]);

  // Keyboard navigation for Game Detail Page
  useEffect(() => {
    if (!activeDetailGame) return;
    const handleDetailKeys = (e: KeyboardEvent) => {
      if (
        !activeDetailGame ||
        settingsOpen ||
        launchingGame ||
        loading ||
        editingGame ||
        fileExplorerOpen ||
        currentTheme === "atlas"
      )
        return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (detailSelectedIndex !== 0) {
          setDetailSelectedIndex(0);
        } else {
          setActiveDetailGame(null);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setDetailSelectedIndex((prev) => {
          if (prev === 2) return 0;
          if (prev === 3) return 2;
          if (prev === 4) return 1;
          if (prev === 5) return 4;
          if (prev === 6) return 5;
          return 0;
        });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setDetailSelectedIndex((prev) => {
          if (prev === 0 || prev === 1) return 2;
          if (prev === 2) return 3;
          if (prev === 4) return 5;
          if (prev === 5) return 6;
          return prev;
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setDetailSelectedIndex((prev) => {
          if (prev === 1) return 0;
          if (prev === 4) return 2;
          if (prev === 5) return 3;
          if (prev === 6) return 3;
          return prev;
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setDetailSelectedIndex((prev) => {
          if (prev === 0) return 1;
          if (prev === 2) return 4;
          if (prev === 3) return 5;
          return prev;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (detailSelectedIndex === 0) {
          handleTryLaunchGame(activeDetailGame);
        } else if (detailSelectedIndex === 1) {
          setEditName(activeDetailGame.name);
          setEditExe(activeDetailGame.exe_path || "");
          setEditImg(activeDetailGame.image_url || "");
          setEditBg(activeDetailGame.bg_url || "");
          setEditTab("media");
          setEditingGame(activeDetailGame);
        } else if (detailSelectedIndex === 2) {
          galleryLightboxRef.current?.();
        }
      }
    };
    window.addEventListener("keydown", handleDetailKeys);
    return () => window.removeEventListener("keydown", handleDetailKeys);
  }, [
    activeDetailGame,
    detailSelectedIndex,
    settingsOpen,
    launchingGame,
    loading,
    editingGame,
    fileExplorerOpen,
  ]);

  // Ref to hold current state values for the gamepad loop
  const stateRef = useRef({
    games: carouselGames,
    selectedGameIndex,
    settingsOpen,
    isLibraryOpen,
    launchingGame,
    loading,
    youtubeActive,
    twitchActive,
    backloggdActive,
    editingGame,
    customGames,
    focusArea,
    headerSelectedIndex,
    settingsTab,
    currentTheme,
    fileExplorerOpen,
    fileExplorerSelectedIndex,
    fileExplorerItems,
    activeDetailGame,
    detailSelectedIndex,
    activeSection,
    selectedMediaIndex,
  });

  // Sync state values with ref
  useEffect(() => {
    stateRef.current = {
      games: carouselGames,
      selectedGameIndex,
      settingsOpen,
      isLibraryOpen,
      launchingGame,
      loading,
      youtubeActive,
      twitchActive,
      backloggdActive,
      editingGame,
      customGames,
      focusArea,
      headerSelectedIndex,
      settingsTab,
      currentTheme,
      fileExplorerOpen,
      fileExplorerSelectedIndex,
      fileExplorerItems,
      activeDetailGame,
      detailSelectedIndex,
      activeSection,
      selectedMediaIndex,
    };
  }, [
    carouselGames,
    selectedGameIndex,
    settingsOpen,
    isLibraryOpen,
    launchingGame,
    loading,
    youtubeActive,
    twitchActive,
    backloggdActive,
    editingGame,
    customGames,
    focusArea,
    headerSelectedIndex,
    settingsTab,
    currentTheme,
    fileExplorerOpen,
    fileExplorerSelectedIndex,
    fileExplorerItems,
    activeDetailGame,
    detailSelectedIndex,
    activeSection,
    selectedMediaIndex,
  ]);

  const handleOpenYouTube = async () => {
    try {
      setYoutubeActive(true);
      await invoke("open_youtube_webview");
    } catch (err) {
      console.error(err);
      alert(`Falha ao abrir YouTube: ${err}`);
      setYoutubeActive(false);
    }
  };

  const handleCloseYouTube = async () => {
    try {
      await invoke("close_youtube_webview");
    } catch (err) {
      console.error(err);
    } finally {
      setYoutubeActive(false);
    }
  };

  const handleOpenTwitch = async () => {
    try {
      setTwitchActive(true);
      await invoke("open_twitch_webview");
    } catch (err) {
      console.error(err);
      alert(`Falha ao abrir Twitch: ${err}`);
      setTwitchActive(false);
    }
  };

  const handleOpenBackloggd = async () => {
    try {
      setBackloggdActive(true);
      await invoke("open_backloggd_webview");
    } catch (err) {
      console.error(err);
      alert(`Falha ao abrir Backloggd: ${err}`);
      setBackloggdActive(false);
    }
  };

  const handleCloseBackloggd = async () => {
    try {
      await invoke("close_backloggd_webview");
    } catch (err) {
      console.error(err);
    } finally {
      setBackloggdActive(false);
    }
  };

  const handleCloseTwitch = async () => {
    try {
      await invoke("close_twitch_webview");
    } catch (err) {
      console.error(err);
    } finally {
      setTwitchActive(false);
    }
  };

  // Load all games from SQLite — runs on mount and handles first-run localStorage migration
  const loadGames = async () => {
    setLoading(true);
    try {
      // First-run migration: move localStorage games into SQLite
      const legacyRaw = localStorage.getItem("atlas_custom_games");
      const migrated = localStorage.getItem("atlas_db_migrated");
      if (legacyRaw && !migrated) {
        try {
          const legacyGames = JSON.parse(legacyRaw);
          if (Array.isArray(legacyGames) && legacyGames.length > 0) {
            console.log(`[Atlas] Migrating ${legacyGames.length} games from localStorage to SQLite...`);
            await invoke("db_migrate_from_localstorage", { legacyGames });
            localStorage.setItem("atlas_db_migrated", "1");
            localStorage.removeItem("atlas_custom_games");
            console.log("[Atlas] Migration complete.");
          }
        } catch (e) {
          console.error("[Atlas] Migration failed, will retry next launch:", e);
        }
      }

      // Load all games from the database
      const dtos = await invoke<GameDto[]>("db_list_games");
      const validGames = dtos
        .map(gameDtoToSteamGame)
        .filter((g) => !isProtonOrSteamTool(g.name, g.appid));
      validGames.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

      setSteamGames(validGames.filter((g) => !g.isCustom));
      setCustomGames(validGames.filter((g) => g.isCustom));
      setIsSimulated(false);
      loadAllPlaytimes();
    } catch (err) {
      console.warn("[Atlas] Failed to load games from database:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllPlaytimes = async () => {
    try {
      const statsList = await invoke<{ game_id: string; total_seconds: number; formatted: string }[]>(
        "get_all_playtimes"
      );
      const map: Record<string, PlaytimeStats> = {};
      statsList.forEach((stat) => {
        map[stat.game_id] = { total_seconds: stat.total_seconds, formatted: stat.formatted };
      });
      setPlaytimes(map);
    } catch (err) {
      console.warn("[Playtime] Failed to load all playtimes:", err);
    }
  };

  const loadPlaytime = async (gameId: string) => {
    try {
      const stats = await invoke<{ game_id: string; total_seconds: number; formatted: string }>(
        "get_game_playtime",
        { gameId }
      );
      setPlaytimes((prev) => ({
        ...prev,
        [gameId]: { total_seconds: stats.total_seconds, formatted: stats.formatted },
      }));
    } catch (err) {
      console.warn(`[Playtime] Failed to load playtime for ${gameId}:`, err);
    }
  };

  // Load playtime for active game when selection changes
  useEffect(() => {
    const game = games[selectedGameIndex];
    if (game) {
      loadPlaytime(game.appid);
    }
  }, [selectedGameIndex, games]);

  // Load playtime when detail page opens
  useEffect(() => {
    if (activeDetailGame) {
      loadPlaytime(activeDetailGame.appid);
    }
  }, [activeDetailGame]);

  // Load all playtimes when library modal opens
  useEffect(() => {
    if (isLibraryOpen) {
      loadAllPlaytimes();
    }
  }, [isLibraryOpen]);

  // ── Steam Account Handlers ──────────────────────────────────────────────────
  const loadSteamUser = async () => {
    try {
      const user = await invoke<SteamUserInfo | null>("steam_get_user");
      setSteamUser(user);
    } catch (err) {
      console.warn("[Atlas] Failed to load Steam user:", err);
    }
  };

  const handleSteamLogin = async () => {
    setSteamLoggingIn(true);
    setSteamImportResult(null);
    try {
      const user = await invoke<SteamUserInfo>("steam_login");
      setSteamUser(user);
    } catch (err) {
      console.error("[Atlas] Steam login failed:", err);
      alert(`Falha ao conectar com Steam: ${err}`);
    } finally {
      setSteamLoggingIn(false);
    }
  };

  const handleSteamLogout = async () => {
    try {
      await invoke("steam_logout");
      setSteamUser(null);
      setSteamImportResult(null);
    } catch (err) {
      console.error("[Atlas] Steam logout failed:", err);
    }
  };

  // Listen for Steam import progress events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<SteamImportProgress>("steam-import-progress", (event) => {
      setSteamImportProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleSteamImport = async () => {
    setSteamImporting(true);
    setSteamImportResult(null);
    setSteamImportProgress(null);
    try {
      const result = await invoke<SteamImportResult>("steam_import_library");
      setSteamImportResult(result);
      // Reload the game library to show imported games
      await loadGames();
    } catch (err) {
      console.error("[Atlas] Steam import failed:", err);
      alert(`Falha ao importar biblioteca Steam: ${err}`);
    } finally {
      setSteamImporting(false);
      setSteamImportProgress(null);
    }
  };

  // Listen to window focus/blur to end play sessions
  useEffect(() => {
    const handleFocus = async () => {
      if (activeSessionIdRef.current !== null) {
        const sid = activeSessionIdRef.current;
        const targetGame = activeLaunchingGameRef.current || activeDetailGame || games[selectedGameIndex];
        activeSessionIdRef.current = null;
        activeLaunchingGameRef.current = null;
        try {
          const res = await invoke<{ duration_seconds: number; formatted: string }>(
            "end_play_session",
            { sessionId: sid }
          );
          console.log(`[Playtime] Ended session ${sid}. Played for ${res.formatted}`);

          if (targetGame) {
            const nowIso = new Date().toISOString();
            loadPlaytime(targetGame.appid);

            if (targetGame.isCustom) {
              setCustomGames((prev) =>
                prev.map((g) =>
                  g.appid === targetGame.appid ? { ...g, last_played: nowIso } : g
                )
              );
            } else {
              setSteamGames((prev) =>
                prev.map((g) =>
                  g.appid === targetGame.appid ? { ...g, last_played: nowIso } : g
                )
              );
            }

            setActiveDetailGame((prev) =>
              prev && prev.appid === targetGame.appid
                ? { ...prev, last_played: nowIso }
                : prev
            );
          }
        } catch (e) {
          console.error("Failed to end play session in DB:", e);
        }
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [games, selectedGameIndex, activeDetailGame]);

  // Merge steamGames and customGames when either changes, deduplicating by appid and name
  useEffect(() => {
    const merged = [...steamGames, ...customGames];
    const uniqueGames: SteamGame[] = [];
    const seenAppIds = new Set<string>();
    const seenNames = new Set<string>();

    for (const g of merged) {
      const nameKey = g.name.trim().toLowerCase();
      if (seenAppIds.has(g.appid) || seenNames.has(nameKey)) {
        continue;
      }
      seenAppIds.add(g.appid);
      seenNames.add(nameKey);
      uniqueGames.push(g);
    }

    uniqueGames.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    setGames(uniqueGames);
  }, [steamGames, customGames]);

  // Clamp selectedGameIndex to valid bounds in carouselGames
  useEffect(() => {
    if (selectedGameIndex >= carouselGames.length && carouselGames.length > 0) {
      setSelectedGameIndex(carouselGames.length - 1);
    }
  }, [carouselGames, selectedGameIndex]);

  // Auto-fetch IGDB images for games without cover urls
  useEffect(() => {
    games.forEach((game) => {
      if (!game.image_url && !igdbAttemptsRef.current[game.appid]) {
        igdbAttemptsRef.current[game.appid] = true;

        invoke<string>("get_game_image_url", { gameName: game.name })
          .then((newUrl) => {
            setImageErrors((prev) => {
              const next = { ...prev };
              delete next[game.appid];
              return next;
            });

            if (game.isCustom) {
              setCustomGames((prev) =>
                prev.map((g) => (g.appid === game.appid ? { ...g, image_url: newUrl } : g))
              );
            } else {
              setSteamGames((prev) =>
                prev.map((g) => (g.appid === game.appid ? { ...g, image_url: newUrl } : g))
              );
            }
          })
          .catch((err) => {
            console.warn(`Failed to auto-fetch IGDB cover for ${game.name}:`, err);
          });
      }
    });
  }, [games]);

  // Smoothly preload ambient background images to avoid delays/flashes
  useEffect(() => {
    if (loading || carouselGames.length === 0) return;
    const activeGame = carouselGames[selectedGameIndex] || installedGames[0];
    if (!activeGame || activeGame.appid === "__LIBRARY_CARD__") {
      setAmbientBgUrl("");
      return;
    }

    let bgUrl = "";
    if (activeGame.bg_url) {
      bgUrl =
        activeGame.bg_url.startsWith("http://") ||
        activeGame.bg_url.startsWith("https://") ||
        activeGame.bg_url.startsWith("data:")
          ? activeGame.bg_url
          : convertFileSrc(activeGame.bg_url);
    } else if (!activeGame.isCustom && activeGame.appid) {
      bgUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${activeGame.appid}/library_hero.jpg`;
    } else if (activeGame.image_url) {
      if (activeGame.image_url.includes("images.igdb.com")) {
        bgUrl = activeGame.image_url.replace("t_720p", "t_cover_big");
      } else {
        bgUrl = getGameImageUrl(activeGame);
      }
    }

    if (!bgUrl) {
      setAmbientBgUrl("");
      return;
    }

    let isMounted = true;
    const img = new Image();
    img.src = bgUrl;
    img.onload = () => {
      if (isMounted) setAmbientBgUrl(bgUrl);
    };
    img.onerror = () => {
      // Fallback for Steam games: try header.jpg if library_hero.jpg failed
      if (!activeGame.isCustom && activeGame.appid && bgUrl.includes("library_hero")) {
        const fallbackUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${activeGame.appid}/header.jpg`;
        const fallbackImg = new Image();
        fallbackImg.src = fallbackUrl;
        fallbackImg.onload = () => {
          if (isMounted) setAmbientBgUrl(fallbackUrl);
        };
        fallbackImg.onerror = () => {
          if (isMounted) setAmbientBgUrl("");
        };
      } else {
        if (isMounted) setAmbientBgUrl("");
      }
    };

    return () => {
      isMounted = false;
    };
  }, [selectedGameIndex, carouselGames, loading]);

  // Check if custom registry Windows shell replacement is currently enabled
  const checkShellStatus = async () => {
    try {
      const enabled = await invoke<boolean>("is_shell_replacement_enabled");
      setShellEnabled(enabled);
    } catch (err) {
      console.warn(
        "Shell replacement check is only fully functional in Windows production builds.",
        err
      );
    }
  };

  // Toggle Windows shell replacement
  const handleToggleShell = async (checked: boolean) => {
    try {
      await invoke("toggle_shell_replacement", { enable: checked });
      setShellEnabled(checked);
    } catch (err) {
      console.error(err);
      alert(
        `Erro ao alterar o registro: ${err}\n(Esta função precisa de permissões administrativas no Windows)`
      );
    }
  };

  // Launch selected game (Steam or Custom)
  const handleLaunchGame = async (game: SteamGame) => {
    if (youtubeActive) {
      await handleCloseYouTube();
    }
    if (twitchActive) {
      await handleCloseTwitch();
    }
    if (backloggdActive) {
      await handleCloseBackloggd();
    }

    setLaunchingGame(game);
    activeLaunchingGameRef.current = game;
    try {
      if (!isSimulated) {
        try {
          const res = await invoke<{ session_id: number }>("start_play_session", {
            gameId: game.appid,
          });
          activeSessionIdRef.current = res.session_id;
          console.log(`[Playtime] Started session ${res.session_id} for ${game.name}`);
        } catch (e) {
          console.error("Failed to start play session in DB:", e);
        }
      }

      if (game.isCustom) {
        if (isSimulated) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        } else {
          await invoke("launch_custom_game", { exePath: game.exe_path });
        }
      } else {
        if (isSimulated) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        } else {
          await invoke("launch_game", { appid: game.appid });
        }
      }

      try {
        await getCurrentWindow().minimize();
      } catch (winErr) {
        console.error("Falha ao minimizar janela do launcher:", winErr);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(err);
      alert(`Falha ao iniciar o jogo: ${err}`);
    } finally {
      setLaunchingGame(null);
    }
  };

  const handleTryLaunchGame = (game: SteamGame) => {
    if (game.appid === "__LIBRARY_CARD__") {
      setIsLibraryOpen(true);
      return;
    }
    handleLaunchGame(game);
  };

  // Custom File Explorer and Add Custom Game Helpers
  const openFileExplorer = (
    allowedExts: string[],
    onSelect: (path: string) => void,
    options?: {
      allowFolderSelect?: boolean;
      customTitle?: string;
      customSubtitle?: string;
    }
  ) => {
    setFileExplorerFilter(allowedExts);
    setFileExplorerOnSelect(() => onSelect);
    setFileExplorerAllowFolderSelect(options?.allowFolderSelect || false);
    setFileExplorerTitle(options?.customTitle || "");
    setFileExplorerSubtitle(options?.customSubtitle || "");

    invoke<string[]>("get_drives")
      .then((drives) => {
        setAvailableDrives(drives);
        setFileExplorerPath("");
        const items = drives.map((drive) => ({
          name: `Disco Local (${drive})`,
          path: drive,
          is_dir: true,
        }));
        setFileExplorerItems(items);
        setFileExplorerSelectedIndex(0);
        setFileExplorerOpen(true);
      })
      .catch((err) => {
        console.error("Erro ao carregar drives:", err);
        setFileExplorerPath("");
        setFileExplorerItems([]);
        setFileExplorerSelectedIndex(0);
        setFileExplorerOpen(true);
      });
  };

  const handleOpenMediaFolderExplorer = () => {
    openFileExplorer(
      ["mp4", "mkv", "avi", "mov", "webm", "m4v", "ts", "flv", "wmv"],
      async (selectedPath) => {
        if (!selectedPath) return;

        // 1. Save folder path
        const rawFolders = localStorage.getItem("atlas_media_folders");
        let folders: any[] = [];
        if (rawFolders) {
          try {
            folders = JSON.parse(rawFolders);
          } catch (e) {
            folders = [];
          }
        }

        const normalized = selectedPath.replace(/\\/g, "/");
        const parts = normalized.split("/").filter(Boolean);
        const folderName = parts[parts.length - 1] || selectedPath;

        if (!folders.some((f) => f.path.toLowerCase() === selectedPath.toLowerCase())) {
          folders.push({
            id: Date.now().toString(),
            name: folderName,
            path: selectedPath,
            addedAt: new Date().toISOString(),
          });
          localStorage.setItem("atlas_media_folders", JSON.stringify(folders));
        }

        // 2. Scan movies in folder recursively via Rust command
        try {
          const scannedMovies = await invoke<any[]>("scan_movies_in_folder", {
            folderPath: selectedPath,
          });

          const rawMovies = localStorage.getItem("atlas_media_movies");
          let existingMovies: any[] = [];
          if (rawMovies) {
            try {
              existingMovies = JSON.parse(rawMovies);
            } catch (e) {
              existingMovies = [];
            }
          }

          const existingPaths = new Set(existingMovies.map((m) => m.path.toLowerCase()));
          const newMovies = scannedMovies.filter((m) => !existingPaths.has(m.path.toLowerCase()));

          const updatedMovies = [...existingMovies, ...newMovies];
          localStorage.setItem("atlas_media_movies", JSON.stringify(updatedMovies));
          window.dispatchEvent(new Event("atlas_media_folders_updated"));

          if (scannedMovies.length > 0) {
            console.log(`[Media] Scanned ${scannedMovies.length} movies in ${selectedPath}`);
          } else {
            alert(`Nenhum arquivo de vídeo (.mp4, .mkv, etc.) foi encontrado na pasta "${folderName}".`);
          }
        } catch (err) {
          console.error("Erro ao escanear filmes na pasta:", err);
          window.dispatchEvent(new Event("atlas_media_folders_updated"));
        }
      },
      {
        allowFolderSelect: true,
        customTitle: "🎬 Selecionar Pasta de Filmes / Mídia",
        customSubtitle: "Navegue até a pasta que contém seus filmes e vídeos e clique em 'Selecionar Esta Pasta' ou aperte START.",
      }
    );
  };

  const getMediaTotalCards = () => {
    const cards = document.querySelectorAll(".media-card");
    return cards.length > 0 ? cards.length : mediaItemCount;
  };

  const getMediaColumnsCount = () => {
    const gridEl = document.querySelector(".media-grid");
    if (!gridEl) return 4;
    const cards = gridEl.querySelectorAll(".media-card");
    if (cards.length < 2) return 4;
    const firstTop = (cards[0] as HTMLElement).offsetTop;
    let cols = 0;
    for (let i = 0; i < cards.length; i++) {
      if ((cards[i] as HTMLElement).offsetTop === firstTop) {
        cols++;
      } else {
        break;
      }
    }
    return cols || 4;
  };

  const navigateToPath = (newPath: string) => {
    if (newPath === "") {
      invoke<string[]>("get_drives")
        .then((drives) => {
          setAvailableDrives(drives);
          setFileExplorerPath("");
          const items = drives.map((drive) => ({
            name: `Disco Local (${drive})`,
            path: drive,
            is_dir: true,
          }));
          setFileExplorerItems(items);
          setFileExplorerSelectedIndex(0);
        })
        .catch((err) => {
          console.error("Erro ao carregar drives:", err);
        });
      return;
    }

    invoke<any[]>("list_dir_contents", {
      path: newPath,
      allowedExtensions: fileExplorerFilter,
    })
      .then((items) => {
        setFileExplorerPath(newPath);
        const parentItem = {
          name: ".. (Voltar)",
          path: "..",
          is_dir: true,
        };
        setFileExplorerItems([parentItem, ...items]);
        setFileExplorerSelectedIndex(0);
      })
      .catch((err) => {
        alert(`Não foi possível acessar a pasta: ${err}`);
      });
  };

  const handleFileExplorerSelect = async (item: any) => {
    if (item.path === "..") {
      try {
        const parent = await invoke<string>("get_parent_path", {
          path: fileExplorerPath,
        });
        navigateToPath(parent);
      } catch (err) {
        console.error(err);
      }
    } else if (item.is_dir) {
      navigateToPath(item.path);
    } else {
      if (fileExplorerOnSelect) {
        fileExplorerOnSelect(item.path);
      }
      setFileExplorerOpen(false);
    }
  };

  const handleFileExplorerSelectRef = useRef<any>(null);
  handleFileExplorerSelectRef.current = handleFileExplorerSelect;

  const openAddGameModal = () => {
    openFileExplorer(["exe", "sh", "bin", "lnk", "url"], async (selectedPath) => {
      if (!selectedPath) return;

      const parts = selectedPath.replace(/\\/g, "/").split("/");
      const fileName = parts[parts.length - 1] || "";
      const dotIndex = fileName.lastIndexOf(".");
      const rawName = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
      // Clean up shortcut suffixes, split CamelCase/PascalCase words, replace hyphens/underscores
      const gameName = rawName
        .replace(/\.exe$/i, "")
        .replace(/\s*-\s*atalho$/i, "")
        .replace(/\s*-\s*shortcut$/i, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .replace(/[-_]+/g, " ")
        .trim();

      let coverUrl: string | null = null;
      try {
        coverUrl = await invoke<string>("get_game_image_url", {
          gameName: gameName,
        });
      } catch (err) {
        console.warn("Could not fetch game cover automatically:", err);
      }

      try {
        const dto = await invoke<GameDto>("db_add_game", {
          name: gameName,
          exePath: selectedPath,
          installDir: null,
          steamAppId: null,
          platform: "manual",
          coverUrl: coverUrl || null,
        });
        const newGame = gameDtoToSteamGame(dto);
        setCustomGames((prev) => [...prev, newGame]);
      } catch (err) {
        console.error("Failed to add game:", err);
        alert(`Erro ao adicionar o jogo: ${err}`);
      }
    });
  };

  const handleEditPickExe = () => {
    openFileExplorer(["exe", "sh", "bin", "lnk", "url"], (path) => {
      setEditExe(path);
      if (!editName && path) {
        const parts = path.replace(/\\/g, "/").split("/");
        const fileName = parts[parts.length - 1];
        const dotIndex = fileName.lastIndexOf(".");
        const rawName = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
        // Clean up shortcut suffixes, split CamelCase/PascalCase words, replace hyphens/underscores
        const cleanName = rawName
          .replace(/\.exe$/i, "")
          .replace(/\s*-\s*atalho$/i, "")
          .replace(/\s*-\s*shortcut$/i, "")
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
          .replace(/[-_]+/g, " ")
          .trim();
        setEditName(cleanName);
      }
    });
  };

  const handleDeleteCustomGame = async (appid: string) => {
    try {
      await invoke("db_delete_game", { gameId: appid });
      setCustomGames((prev) => prev.filter((g) => g.appid !== appid));
    } catch (err) {
      console.error("Failed to delete game:", err);
      alert(`Erro ao excluir o jogo: ${err}`);
    }
  };

  const handleEditCustomGameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGame) return;
    if (!editName || !editExe) {
      alert("Por favor, preencha pelo menos o Nome e o Executável.");
      return;
    }

    setEditingSearchingIgdb(true);
    let resolvedImg = editImg || null;
    if (!resolvedImg) {
      try {
        resolvedImg = await invoke<string>("get_game_image_url", {
          gameName: editName,
        });
      } catch (err) {
        console.warn("Could not auto-fetch image during edit:", err);
      }
    }

    let isoLastPlayed: string | null = null;
    if (editLastPlayed) {
      try {
        isoLastPlayed = new Date(editLastPlayed).toISOString();
      } catch (e) {
        console.warn("Failed to parse last_played date:", e);
      }
    }

    try {
      const dto = await invoke<GameDto>("db_update_game", {
        gameId: editingGame.appid,
        name: editName,
        exePath: editExe,
        coverUrl: resolvedImg,
        backgroundUrl: editBg || null,
        lastPlayed: isoLastPlayed,
      });

      const parsedHours = parseInt(editPlaytimeHours || "0", 10);
      const parsedMinutes = parseInt(editPlaytimeMinutes || "0", 10);
      const safeHours = isNaN(parsedHours) ? 0 : Math.max(0, parsedHours);
      const safeMinutes = isNaN(parsedMinutes) ? 0 : Math.max(0, Math.min(59, parsedMinutes));
      const totalSecs = safeHours * 3600 + safeMinutes * 60;

      const newPlaytimeStats = await invoke<PlaytimeStats>("set_game_playtime", {
        gameId: editingGame.appid,
        totalSeconds: totalSecs,
      });

      setPlaytimes((prev) => ({
        ...prev,
        [editingGame.appid]: newPlaytimeStats,
      }));

      const updated = gameDtoToSteamGame(dto);
      if (editingGame.isCustom) {
        setCustomGames((prev) =>
          prev.map((g) => (g.appid === editingGame.appid ? updated : g))
        );
      } else {
        setSteamGames((prev) =>
          prev.map((g) => (g.appid === editingGame.appid ? updated : g))
        );
      }
      if (activeDetailGame && activeDetailGame.appid === editingGame.appid) {
        setActiveDetailGame(updated);
      }
    } catch (err) {
      console.error("Failed to update game:", err);
      alert(`Erro ao atualizar o jogo: ${err}`);
    }

    setEditingGame(null);
    setEditingSearchingIgdb(false);
  };

  // Helper functions for Background Image Picker Gallery Modal
  const handleOpenImagePicker = async (target: "cover" | "background") => {
    if (!editName) {
      alert("Por favor, informe o nome do jogo na aba Geral antes de buscar imagens.");
      return;
    }
    setImagePickerTarget(target);
    const defaultQuery =
      target === "cover" ? `${editName} cover` : `${editName} background`;
    setImagePickerQuery(defaultQuery);
    setImagePickerOpen(true);
    setImagePickerLoading(true);
    setImagePickerResults([]);
    setImagePickerSelectedIndex(-1);

    try {
      const urls = await invoke<string[]>("search_game_images", {
        query: defaultQuery,
        target,
      });
      setImagePickerResults(urls);
    } catch (err) {
      console.error("Erro ao buscar imagens em background:", err);
      setImagePickerResults([]);
    } finally {
      setImagePickerLoading(false);
    }
  };

  const handlePerformImageSearch = async (customQuery?: string) => {
    const queryToUse = customQuery !== undefined ? customQuery : imagePickerQuery;
    if (!queryToUse.trim()) return;
    setImagePickerLoading(true);
    setImagePickerSelectedIndex(-1);
    try {
      const urls = await invoke<string[]>("search_game_images", {
        query: queryToUse,
        target: imagePickerTarget,
      });
      setImagePickerResults(urls);
    } catch (err) {
      console.error("Erro ao buscar imagens:", err);
    } finally {
      setImagePickerLoading(false);
    }
  };

  const handleSelectImage = (url: string) => {
    if (imagePickerTarget === "cover") {
      setEditImg(url);
    } else {
      setEditBg(url);
    }
    setImagePickerOpen(false);
  };

  // Refs for scrolling container
  const fileExplorerListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (fileExplorerListRef.current && fileExplorerOpen) {
      const container = fileExplorerListRef.current;
      const items = container.getElementsByClassName("file-explorer-item");
      const activeItem = items[fileExplorerSelectedIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [fileExplorerSelectedIndex, fileExplorerOpen, fileExplorerItems]);

  // Keydown listener for Keyboard Navigation inside In-App File Explorer
  useEffect(() => {
    const handleFileExplorerKeys = (e: KeyboardEvent) => {
      if (!fileExplorerOpen) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFileExplorerSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : fileExplorerItems.length - 1
        );
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFileExplorerSelectedIndex((prev) =>
          prev < fileExplorerItems.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selectedItem = fileExplorerItems[fileExplorerSelectedIndex];
        if (selectedItem) {
          handleFileExplorerSelect(selectedItem);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setFileExplorerOpen(false);
      }
    };
    window.addEventListener("keydown", handleFileExplorerKeys);
    return () => window.removeEventListener("keydown", handleFileExplorerKeys);
  }, [fileExplorerOpen, fileExplorerSelectedIndex, fileExplorerItems]);

  // Clock initialization
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      setSystemTime(`${hh}:${mm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000 * 15);
    return () => clearInterval(interval);
  }, []);

  // Backend calls on mount
  useEffect(() => {
    loadGames();
    checkShellStatus();
    loadSteamUser();
  }, []);

  // Keyboard navigation for carousel and header buttons
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11" || (e.altKey && e.key === "Enter")) {
        e.preventDefault();
        invoke("toggle_fullscreen").catch(console.error);
        return;
      }

      if (settingsOpen || launchingGame || loading || editingGame || isLibraryOpen) return;

      if (youtubeActive) {
        if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          handleCloseYouTube();
        }
        return;
      }

      if (twitchActive) {
        if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          handleCloseTwitch();
        }
        return;
      }

      if (backloggdActive) {
        if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          handleCloseBackloggd();
        }
        return;
      }

      if (carouselGames.length === 0) {
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          setSettingsOpen(true);
          return;
        }
        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          handleOpenYouTube();
          return;
        }
        if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          handleOpenTwitch();
          return;
        }

        if (focusArea !== "header") {
          setFocusArea("header");
          setHeaderSelectedIndex(0);
          return;
        }

        if (focusArea === "header") {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setHeaderSelectedIndex((prev) => (prev > 0 ? prev - 1 : 3));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setHeaderSelectedIndex((prev) => (prev < 3 ? prev + 1 : 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (headerSelectedIndex === 0) {
              handleOpenYouTube();
            } else if (headerSelectedIndex === 1) {
              handleOpenTwitch();
            } else if (headerSelectedIndex === 2) {
              handleOpenBackloggd();
            } else {
              setSettingsOpen(true);
            }
          }
        }
        return;
      }

      // Tab Switching (L1 / R1 keyboard shortcuts)
      if (e.key === "q" || e.key === "Q" || e.key === "[" || e.key === "PageUp") {
        e.preventDefault();
        setActiveSection("games");
        setFocusArea("carousel");
        return;
      } else if (e.key === "e" || e.key === "E" || e.key === "]" || e.key === "PageDown") {
        e.preventDefault();
        setActiveSection("media");
        setFocusArea("media");
        return;
      }

      if (focusArea === "carousel") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setSelectedGameIndex((prev) => (prev > 0 ? prev - 1 : carouselGames.length - 1));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setSelectedGameIndex((prev) => (prev < carouselGames.length - 1 ? prev + 1 : 0));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setFocusArea("header");
          setHeaderSelectedIndex(0);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (carouselGames[selectedGameIndex]) {
            handleTryLaunchGame(carouselGames[selectedGameIndex]);
          }
        } else if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          setSettingsOpen(true);
        } else if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          handleOpenYouTube();
        } else if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          handleOpenTwitch();
        }
      } else if (focusArea === "media") {
        const cols = getMediaColumnsCount();
        const total = getMediaTotalCards();
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setSelectedMediaIndex((prev) => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setSelectedMediaIndex((prev) => (prev < total - 1 ? prev + 1 : total - 1));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedMediaIndex((prev) => {
            const next = prev + cols;
            return next < total ? next : prev;
          });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (selectedMediaIndex >= cols) {
            setSelectedMediaIndex((prev) => prev - cols);
          } else {
            setFocusArea("header");
            setHeaderSelectedIndex(0);
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          const mediaCard = document.querySelectorAll(".media-card")[selectedMediaIndex] as HTMLElement;
          if (mediaCard) mediaCard.click();
        }
      } else if (focusArea === "header") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setHeaderSelectedIndex((prev) => (prev > 0 ? prev - 1 : 3));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setHeaderSelectedIndex((prev) => (prev < 3 ? prev + 1 : 0));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusArea(activeSection === "media" ? "media" : "carousel");
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (headerSelectedIndex === 0) {
            handleOpenYouTube();
          } else if (headerSelectedIndex === 1) {
            handleOpenTwitch();
          } else if (headerSelectedIndex === 2) {
            handleOpenBackloggd();
          } else {
            setSettingsOpen(true);
          }
        } else if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          setFocusArea(activeSection === "media" ? "media" : "carousel");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    games,
    selectedGameIndex,
    settingsOpen,
    launchingGame,
    loading,
    isSimulated,
    youtubeActive,
    twitchActive,
    backloggdActive,
    editingGame,
    focusArea,
    headerSelectedIndex,
    activeSection,
    selectedMediaIndex,
  ]);



  // Keyboard navigation for editing custom game modal
  useEffect(() => {
    const handleEditKeys = (e: KeyboardEvent) => {
      if (!editingGame) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setEditingGame(null);
      }
    };
    window.addEventListener("keydown", handleEditKeys);
    return () => window.removeEventListener("keydown", handleEditKeys);
  }, [editingGame]);

  // Scroll carousel to center active card
  useEffect(() => {
    if (carouselRef.current && carouselGames.length > 0) {
      const container = carouselRef.current;
      const cards = container.getElementsByClassName("game-card");
      const activeCard = cards[selectedGameIndex] as HTMLElement;

      if (activeCard) {
        const containerWidth = container.offsetWidth;
        const cardWidth = activeCard.offsetWidth;
        const cardLeft = activeCard.offsetLeft;

        container.scrollTo({
          left: cardLeft - containerWidth / 2 + cardWidth / 2,
          behavior: "smooth",
        });
      }
    }
  }, [selectedGameIndex, carouselGames]);

  // Unified Gamepad Registration for Main Application Layer
  useEffect(() => {
    const unregister = registerLayerHandler("main", (actions: GamepadActionState) => {
      const {
        games: currentGames,
        selectedGameIndex: currentIndex,
        settingsOpen: isSettingsOpen,
        isLibraryOpen,
        launchingGame: isLaunching,
        loading: isLoading,
        youtubeActive: isYoutubeActive,
        twitchActive: isTwitchActive,
        backloggdActive: isBackloggdActive,
        editingGame: isEditing,
        focusArea,
        headerSelectedIndex,

        fileExplorerOpen: isFileExplorerOpen,
        fileExplorerSelectedIndex: fileExplorerIdx,
        fileExplorerItems: fileExplorerItms,
        currentTheme: theme,
        activeDetailGame: detailGame,
        detailSelectedIndex: detailIdx,
      } = stateRef.current;

      if (isLoading || isLaunching || isSettingsOpen || isLibraryOpen) return true;

      if (isYoutubeActive) {
        const sendAction = (action: string) => {
          invoke("youtube_gamepad_action", { action }).catch(console.error);
        };

        if (actions.start) handleCloseYouTube();
        else if (actions.up) sendAction("navigate_up");
        else if (actions.down) sendAction("navigate_down");
        else if (actions.left) sendAction("navigate_left");
        else if (actions.right) sendAction("navigate_right");
        else if (actions.a) sendAction("click");
        else if (actions.b) sendAction("back");
        else if (actions.x) sendAction("fullscreen");
        else if (actions.y) sendAction("play_pause");
        else if (actions.lb) sendAction("seek_back");
        else if (actions.rb) sendAction("seek_forward");
        else if (actions.lt) sendAction("volume_down");
        else if (actions.rt) sendAction("volume_up");
        else if (actions.rawAxes.y < -0.6) sendAction("scroll_up");
        else if (actions.rawAxes.y > 0.6) sendAction("scroll_down");
        return true;
      }

      if (isTwitchActive) {
        const sendAction = (action: string) => {
          invoke("twitch_gamepad_action", { action }).catch(console.error);
        };

        if (actions.start) handleCloseTwitch();
        else if (actions.up) sendAction("navigate_up");
        else if (actions.down) sendAction("navigate_down");
        else if (actions.left) sendAction("navigate_left");
        else if (actions.right) sendAction("navigate_right");
        else if (actions.a) sendAction("click");
        else if (actions.b) sendAction("back");
        else if (actions.x) sendAction("fullscreen");
        else if (actions.y) sendAction("play_pause");
        else if (actions.lb) sendAction("seek_back");
        else if (actions.rb) sendAction("seek_forward");
        else if (actions.lt) sendAction("volume_down");
        else if (actions.rt) sendAction("volume_up");
        else if (actions.rawAxes.y < -0.6) sendAction("scroll_up");
        else if (actions.rawAxes.y > 0.6) sendAction("scroll_down");
        return true;
      }

      if (isBackloggdActive) {
        const sendAction = (action: string) => {
          invoke("backloggd_gamepad_action", { action }).catch(console.error);
        };

        if (actions.start) handleCloseBackloggd();
        else if (actions.up) sendAction("navigate_up");
        else if (actions.down) sendAction("navigate_down");
        else if (actions.left) sendAction("navigate_left");
        else if (actions.right) sendAction("navigate_right");
        else if (actions.a) sendAction("click");
        else if (actions.b) sendAction("back");
        else if (actions.rawAxes.y < -0.6) sendAction("scroll_up");
        else if (actions.rawAxes.y > 0.6) sendAction("scroll_down");
        return true;
      }

      if (isFileExplorerOpen) {
        if (actions.up) {
          setFileExplorerSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : fileExplorerItms.length - 1
          );
        } else if (actions.down) {
          setFileExplorerSelectedIndex((prev) =>
            prev < fileExplorerItms.length - 1 ? prev + 1 : 0
          );
        } else if (actions.a) {
          const selectedItem = fileExplorerItms[fileExplorerIdx];
          if (selectedItem) handleFileExplorerSelectRef.current?.(selectedItem);
        } else if (actions.b) {
          setFileExplorerOpen(false);
        }
        return true;
      }

      if (isEditing) {
        if (actions.b) setEditingGame(null);
        return true;
      }

      if (isSettingsOpen) {
        if (actions.b) setSettingsOpen(false);
        return true;
      }

      if (detailGame && theme === "atlas") {
        if (actions.b) {
          if (detailIdx === 2) {
            setDetailSelectedIndex(0);
          } else {
            setActiveDetailGame(null);
          }
        } else if (actions.up) {
          if (detailIdx === 2) {
            setDetailSelectedIndex(0);
          }
        } else if (actions.down) {
          if (detailIdx < 2) {
            setDetailSelectedIndex(2);
          }
        } else if (actions.left) {
          if (detailIdx === 0 || detailIdx === 1) {
            setDetailSelectedIndex((prev) => (prev > 0 ? prev - 1 : 1));
          } else if (detailIdx === 2) {
            galleryPrevRef.current?.();
          }
        } else if (actions.right) {
          if (detailIdx === 0 || detailIdx === 1) {
            setDetailSelectedIndex((prev) => (prev < 1 ? prev + 1 : 0));
          } else if (detailIdx === 2) {
            galleryNextRef.current?.();
          }
        } else if (actions.a || actions.start) {
          if (detailIdx === 0) {
            handleTryLaunchGame(detailGame);
          } else if (detailIdx === 1) {
            handleOpenEditGame(detailGame, "media");
          } else if (detailIdx === 2) {
            galleryLightboxRef.current?.();
          }
        }
        return true;
      }

      // Global L1 / R1 tab switching on Gamepad
      if (actions.lb) {
        setActiveSection("games");
        setFocusArea("carousel");
        return true;
      }
      if (actions.rb) {
        setActiveSection("media");
        setFocusArea("media");
        return true;
      }

      if (focusArea === "media") {
        const cols = getMediaColumnsCount();
        const total = getMediaTotalCards();
        const { selectedMediaIndex: mediaIdx } = stateRef.current;
        if (actions.left) {
          setSelectedMediaIndex((prev) => (prev > 0 ? prev - 1 : 0));
        } else if (actions.right) {
          setSelectedMediaIndex((prev) => (prev < total - 1 ? prev + 1 : total - 1));
        } else if (actions.down) {
          setSelectedMediaIndex((prev) => {
            const next = prev + cols;
            return next < total ? next : prev;
          });
        } else if (actions.up) {
          if (mediaIdx >= cols) {
            setSelectedMediaIndex((prev) => prev - cols);
          } else {
            setFocusArea("header");
            setHeaderSelectedIndex(0);
          }
        } else if (actions.a) {
          const mediaCard = document.querySelectorAll(".media-card")[mediaIdx] as HTMLElement;
          if (mediaCard) mediaCard.click();
        } else if (actions.b) {
          setActiveSection("games");
          setFocusArea("carousel");
        }
        return true;
      }

      if (currentGames.length > 0 || stateRef.current.activeSection === "games") {
        if (focusArea === "carousel") {
          if (actions.left) {
            setSelectedGameIndex((prev) => (prev > 0 ? prev - 1 : currentGames.length - 1));
          } else if (actions.right) {
            setSelectedGameIndex((prev) => (prev < currentGames.length - 1 ? prev + 1 : 0));
          } else if (actions.up) {
            setFocusArea("header");
            setHeaderSelectedIndex(0);
          } else if (actions.a || actions.start) {
            const selectedItem = currentGames[currentIndex];
            if (selectedItem) {
              if (selectedItem.appid === "__LIBRARY_CARD__") {
                setIsLibraryOpen(true);
              } else if (theme === "atlas") {
                setActiveDetailGame(selectedItem);
                setDetailSelectedIndex(0);
              } else {
                handleTryLaunchGame(selectedItem);
              }
            }
          } else if (actions.select) {
            setSettingsOpen(true);
          } else if (actions.y) {
            handleOpenYouTube();
          } else if (actions.x) {
            openAddGameModal();
          }
        } else if (focusArea === "header") {
          if (actions.left) {
            setHeaderSelectedIndex((prev) => (prev > 0 ? prev - 1 : 3));
          } else if (actions.right) {
            setHeaderSelectedIndex((prev) => (prev < 3 ? prev + 1 : 0));
          } else if (actions.down) {
            setFocusArea(stateRef.current.activeSection === "media" ? "media" : "carousel");
          } else if (actions.a) {
            if (headerSelectedIndex === 0) handleOpenYouTube();
            else if (headerSelectedIndex === 1) handleOpenTwitch();
            else if (headerSelectedIndex === 2) handleOpenBackloggd();
            else setSettingsOpen(true);
          } else if (actions.b) {
            setFocusArea(stateRef.current.activeSection === "media" ? "media" : "carousel");
          }
        }
      }

      return true;
    });

    return () => unregister();
  }, [registerLayerHandler]);

  // Image load helper — fetches cover from IGDB and persists to DB + disk
  const handleImageError = (appid: string) => {
    setImageErrors((prev) => ({ ...prev, [appid]: true }));

    if (igdbAttemptsRef.current[appid]) return;
    igdbAttemptsRef.current[appid] = true;

    const game = games.find((g) => g.appid === appid);
    if (!game) return;

    invoke<string>("get_game_image_url", { gameName: game.name })
      .then(async (newUrl) => {
        setImageErrors((prev) => {
          const next = { ...prev };
          delete next[appid];
          return next;
        });

        try {
          const dto = await invoke<GameDto>("db_update_game", {
            gameId: appid,
            name: null,
            exePath: null,
            coverUrl: newUrl,
          });
          const updated = gameDtoToSteamGame(dto);
          if (game.isCustom) {
            setCustomGames((prev) => prev.map((g) => (g.appid === appid ? updated : g)));
          } else {
            setSteamGames((prev) => prev.map((g) => (g.appid === appid ? updated : g)));
          }
          if (activeDetailGame && activeDetailGame.appid === appid) {
            setActiveDetailGame(updated);
          }
        } catch {
          if (game.isCustom) {
            setCustomGames((prev) =>
              prev.map((g) => (g.appid === appid ? { ...g, image_url: newUrl } : g))
            );
          } else {
            setSteamGames((prev) =>
              prev.map((g) => (g.appid === appid ? { ...g, image_url: newUrl } : g))
            );
          }
          if (activeDetailGame && activeDetailGame.appid === appid) {
            setActiveDetailGame((prev) => (prev ? { ...prev, image_url: newUrl } : prev));
          }
        }
      })
      .catch((err) => {
        console.warn(`Failed to fetch IGDB cover for ${game.name}:`, err);
      });
  };

  const activeGame = carouselGames[selectedGameIndex] || installedGames[0] || null;

  const handleSelectGameInCarousel = (index: number, game: SteamGame) => {
    setSelectedGameIndex(index);
    if (game.appid === "__LIBRARY_CARD__") {
      setIsLibraryOpen(true);
      return;
    }
    if (currentTheme === "atlas") {
      setActiveDetailGame(game);
      setDetailSelectedIndex(0);
    } else {
      if (index === selectedGameIndex && focusArea === "carousel") {
        handleTryLaunchGame(game);
      } else {
        setFocusArea("carousel");
      }
    }
  };

  return (
    <ConsoleLayout
      ambientBg={
        activeDetailGame ? null : (
          <AmbientBackground
            ambientBgUrl={ambientBgUrl}
            activeGame={activeGame}
          />
        )
      }
      header={
        <Header
          currentTheme={currentTheme}
          focusArea={focusArea}
          headerSelectedIndex={headerSelectedIndex}
          systemTime={systemTime}
          activeSection={activeSection}
          onSectionChange={(sec) => {
            setActiveSection(sec);
            if (sec === "media") setFocusArea("media");
            else setFocusArea("carousel");
          }}
          onOpenYouTube={handleOpenYouTube}
          onOpenTwitch={handleOpenTwitch}
          onOpenBackloggd={handleOpenBackloggd}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      }
      mainContent={
        currentTheme === "atlas" && activeDetailGame ? (
          <AtlasGameDetailView
            activeDetailGame={activeDetailGame}
            detailSelectedIndex={detailSelectedIndex}
            playtimes={playtimes}
            setDetailSelectedIndex={setDetailSelectedIndex}
            onClose={() => setActiveDetailGame(null)}
            onTryLaunchGame={handleTryLaunchGame}
            onOpenEditMedia={(game) => {
              handleOpenEditGame(game, "media");
            }}
            galleryPrevRef={galleryPrevRef}
            galleryNextRef={galleryNextRef}
            galleryLightboxRef={galleryLightboxRef}
          />
        ) : games.length === 0 && !loading && activeSection === "games" ? (
          <EmptyLibrary
            onAddGameClick={() => {
              setSettingsOpen(true);
              setSettingsTab("custom");
            }}
          />
        ) : (
          <MainView
            activeGame={activeGame}
            currentTheme={currentTheme}
            playtimes={playtimes}
            loading={loading}
            carouselGames={carouselGames}
            selectedGameIndex={selectedGameIndex}
            focusArea={focusArea}
            activeSection={activeSection}
            selectedMediaIndex={selectedMediaIndex}
            imageErrors={imageErrors}
            carouselRef={carouselRef}
            uninstalledCount={uninstalledGames.length}
            totalGamesCount={games.length}
            onTryLaunchGame={handleTryLaunchGame}
            onSelectGame={handleSelectGameInCarousel}
            onImageError={handleImageError}
            onOpenLibrary={() => setIsLibraryOpen(true)}
            onOpenYouTube={handleOpenYouTube}
            onOpenTwitch={handleOpenTwitch}
            onOpenBackloggd={handleOpenBackloggd}
            onOpenAddMediaFolder={handleOpenMediaFolderExplorer}
            onPlayMovie={(movie) => setActivePlayingMovie(movie)}
            onSelectMedia={setSelectedMediaIndex}
            onMediaItemCountChange={setMediaItemCount}
          />
        )
      }
      launchingOverlay={
        <LaunchingOverlay
          launchingGame={launchingGame}
          gamepadConnected={gamepadConnected}
        />
      }
      modals={
        <>
          <LibraryModal
            isOpen={isLibraryOpen}
            games={games}
            playtimes={playtimes}
            onClose={() => setIsLibraryOpen(false)}
            onTryLaunchGame={handleTryLaunchGame}
          />

          <SettingsModal
            isOpen={settingsOpen}
            settingsTab={settingsTab}
            shellEnabled={shellEnabled}
            isSimulated={isSimulated}
            customGames={customGames}
            currentTheme={currentTheme}
            onClose={() => setSettingsOpen(false)}
            onTabChange={setSettingsTab}
            onToggleShell={handleToggleShell}
            onReloadLibrary={loadGames}
            steamUser={steamUser}
            steamLoggingIn={steamLoggingIn}
            steamImporting={steamImporting}
            steamImportResult={steamImportResult}
            steamImportProgress={steamImportProgress}
            onSteamLogin={handleSteamLogin}
            onSteamLogout={handleSteamLogout}
            onSteamImport={handleSteamImport}
            onOpenAddGameModal={openAddGameModal}
            onDeleteCustomGame={handleDeleteCustomGame}
            onSelectTheme={setCurrentTheme}
          />

          <EditGameModal
            editingGame={editingGame}
            editName={editName}
            editExe={editExe}
            editImg={editImg}
            editBg={editBg}
            editTab={editTab}
            editingSearchingIgdb={editingSearchingIgdb}
            editPlaytimeHours={editPlaytimeHours}
            editPlaytimeMinutes={editPlaytimeMinutes}
            editLastPlayed={editLastPlayed}
            onClose={() => setEditingGame(null)}
            onTabChange={setEditTab}
            setEditName={setEditName}
            setEditExe={setEditExe}
            setEditPlaytimeHours={setEditPlaytimeHours}
            setEditPlaytimeMinutes={setEditPlaytimeMinutes}
            setEditLastPlayed={setEditLastPlayed}
            onPickExe={handleEditPickExe}
            onSubmit={handleEditCustomGameSubmit}
            onOpenImagePicker={handleOpenImagePicker}
          />

          <VideoPlayerModal
            isOpen={activePlayingMovie !== null}
            movie={activePlayingMovie}
            onClose={() => setActivePlayingMovie(null)}
          />


          <FileExplorerModal
            fileExplorerOpen={fileExplorerOpen}
            fileExplorerPath={fileExplorerPath}
            availableDrives={availableDrives}
            fileExplorerItems={fileExplorerItems}
            fileExplorerSelectedIndex={fileExplorerSelectedIndex}
            gamepadConnected={gamepadConnected}
            currentTheme={currentTheme}
            fileExplorerListRef={fileExplorerListRef}
            allowFolderSelect={fileExplorerAllowFolderSelect}
            customTitle={fileExplorerTitle}
            customSubtitle={fileExplorerSubtitle}
            onClose={() => setFileExplorerOpen(false)}
            onNavigateToPath={navigateToPath}
            onSelectFileExplorerItem={handleFileExplorerSelect}
            onSelectCurrentFolder={(folderPath) => {
              if (fileExplorerOnSelect) {
                fileExplorerOnSelect(folderPath);
              }
              setFileExplorerOpen(false);
            }}
          />

          <ImagePickerModal
            isOpen={imagePickerOpen}
            editName={editName}
            imagePickerTarget={imagePickerTarget}
            imagePickerQuery={imagePickerQuery}
            imagePickerLoading={imagePickerLoading}
            imagePickerResults={imagePickerResults}
            imagePickerSelectedIndex={imagePickerSelectedIndex}
            onClose={() => setImagePickerOpen(false)}
            setImagePickerQuery={setImagePickerQuery}
            onPerformImageSearch={handlePerformImageSearch}
            onSelectImage={handleSelectImage}
            setImagePickerSelectedIndex={setImagePickerSelectedIndex}
          />
        </>
      }
    />
  );
}

export default App;
