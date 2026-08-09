import { useState, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
} from "./types/game";

// Utils
import { gameDtoToSteamGame, getGameImageUrl } from "./utils/gameUtils";

// UI & Layout Components
import { AmbientBackground } from "./components/ui/AmbientBackground";
import { LaunchingOverlay } from "./components/ui/LaunchingOverlay";
import { ConsoleLayout } from "./components/layouts/ConsoleLayout";

// Feature Components
import { Header } from "./components/features/header/Header";
import { GameCarousel } from "./components/features/library/GameCarousel";
import { GameInfoPanel } from "./components/features/library/GameInfoPanel";
import { EmptyLibrary } from "./components/features/library/EmptyLibrary";
import { AtlasGameDetailView } from "./components/features/game-details/AtlasGameDetailView";
import { SettingsModal } from "./components/features/settings/SettingsModal";
import { OptionsMenuModal } from "./components/features/modals/OptionsMenuModal";
import { EditGameModal } from "./components/features/modals/EditGameModal";
import { FileExplorerModal } from "./components/features/modals/FileExplorerModal";
import { ImagePickerModal } from "./components/features/modals/ImagePickerModal";

function App() {
  // Main games states
  const [steamGames, setSteamGames] = useState<SteamGame[]>([]);
  const [customGames, setCustomGames] = useState<SteamGame[]>([]);
  const [games, setGames] = useState<SteamGame[]>([]);
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingSearchingIgdb, setEditingSearchingIgdb] = useState(false);

  const [isSimulated, setIsSimulated] = useState(false);
  const [ambientBgUrl, setAmbientBgUrl] = useState("");

  const [launchingGame, setLaunchingGame] = useState<SteamGame | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [activeDetailGame, setActiveDetailGame] = useState<SteamGame | null>(null);
  const [detailSelectedIndex, setDetailSelectedIndex] = useState<number>(0);

  // Playtime Tracking States
  const [playtimes, setPlaytimes] = useState<Record<string, PlaytimeStats>>({});
  const activeSessionIdRef = useRef<number | null>(null);

  // States for options menu and editing
  const [optionsMenuGame, setOptionsMenuGame] = useState<SteamGame | null>(null);
  const [optionsMenuSelectedIndex, setOptionsMenuSelectedIndex] = useState(0);
  const [editingGame, setEditingGame] = useState<SteamGame | null>(null);
  const [editName, setEditName] = useState("");
  const [editExe, setEditExe] = useState("");
  const [editImg, setEditImg] = useState("");
  const [editBg, setEditBg] = useState("");
  const [editTab, setEditTab] = useState<EditTab>("general");

  // States for background image picker gallery modal
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerTarget, setImagePickerTarget] = useState<"cover" | "background">("cover");
  const [imagePickerLoading, setImagePickerLoading] = useState(false);
  const [imagePickerQuery, setImagePickerQuery] = useState("");
  const [imagePickerResults, setImagePickerResults] = useState<string[]>([]);
  const [imagePickerSelectedIndex, setImagePickerSelectedIndex] = useState(-1);

  // States for header focus and navigation
  const [focusArea, setFocusArea] = useState<FocusArea>("carousel");
  const [headerSelectedIndex, setHeaderSelectedIndex] = useState(0);

  // In-App File Explorer States
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  const [fileExplorerPath, setFileExplorerPath] = useState("");
  const [fileExplorerItems, setFileExplorerItems] = useState<any[]>([]);
  const [fileExplorerSelectedIndex, setFileExplorerSelectedIndex] = useState(0);
  const [fileExplorerFilter, setFileExplorerFilter] = useState<string[]>([]);
  const [fileExplorerOnSelect, setFileExplorerOnSelect] = useState<((path: string) => void) | null>(null);
  const [availableDrives, setAvailableDrives] = useState<string[]>([]);

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
        settingsOpen ||
        launchingGame ||
        loading ||
        optionsMenuGame ||
        editingGame ||
        fileExplorerOpen
      )
        return;

      if (e.key === "Escape") {
        e.preventDefault();
        setActiveDetailGame(null);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setDetailSelectedIndex((prev) => (prev > 0 ? prev - 1 : 2));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setDetailSelectedIndex((prev) => (prev < 2 ? prev + 1 : 0));
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
          setOptionsMenuGame(activeDetailGame);
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
    optionsMenuGame,
    editingGame,
    fileExplorerOpen,
  ]);

  // Ref to hold current state values for the gamepad loop
  const stateRef = useRef({
    games,
    selectedGameIndex,
    settingsOpen,
    launchingGame,
    loading,
    youtubeActive,
    twitchActive,
    optionsMenuGame,
    optionsMenuSelectedIndex,
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
  });

  // Sync state values with ref
  useEffect(() => {
    stateRef.current = {
      games,
      selectedGameIndex,
      settingsOpen,
      launchingGame,
      loading,
      youtubeActive,
      twitchActive,
      optionsMenuGame,
      optionsMenuSelectedIndex,
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
    };
  }, [
    games,
    selectedGameIndex,
    settingsOpen,
    launchingGame,
    loading,
    youtubeActive,
    twitchActive,
    optionsMenuGame,
    optionsMenuSelectedIndex,
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
      const allGames = dtos.map(gameDtoToSteamGame);
      allGames.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

      setSteamGames(allGames.filter((g) => !g.isCustom));
      setCustomGames(allGames.filter((g) => g.isCustom));
      setIsSimulated(false);
    } catch (err) {
      console.warn("[Atlas] Failed to load games from database:", err);
    } finally {
      setLoading(false);
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

  // Listen to window focus/blur to end play sessions
  useEffect(() => {
    const handleFocus = async () => {
      if (activeSessionIdRef.current !== null) {
        const sid = activeSessionIdRef.current;
        activeSessionIdRef.current = null;
        try {
          const res = await invoke<{ duration_seconds: number; formatted: string }>(
            "end_play_session",
            { sessionId: sid }
          );
          console.log(`[Playtime] Ended session ${sid}. Played for ${res.formatted}`);

          const game = games[selectedGameIndex];
          if (game) {
            loadPlaytime(game.appid);
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
  }, [games, selectedGameIndex]);

  // Merge steamGames and customGames when either changes
  useEffect(() => {
    const merged = [...steamGames, ...customGames];
    merged.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    setGames(merged);

    if (selectedGameIndex >= merged.length && merged.length > 0) {
      setSelectedGameIndex(merged.length - 1);
    }
  }, [steamGames, customGames]);

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
              setCustomGames((prev) => {
                const next = prev.map((g) =>
                  g.appid === game.appid ? { ...g, image_url: newUrl } : g
                );
                localStorage.setItem("atlas_custom_games", JSON.stringify(next));
                return next;
              });
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
    if (loading || games.length === 0) return;
    const activeGame = games[selectedGameIndex];
    if (!activeGame) {
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
    } else if (activeGame.image_url) {
      if (!activeGame.isCustom) {
        bgUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${activeGame.appid}/header.jpg`;
      } else if (activeGame.image_url.includes("images.igdb.com")) {
        bgUrl = activeGame.image_url.replace("t_720p", "t_cover_big");
      } else {
        bgUrl = getGameImageUrl(activeGame);
      }
    }

    if (!bgUrl) {
      setAmbientBgUrl("");
      return;
    }

    const img = new Image();
    img.src = bgUrl;
    img.onload = () => {
      setAmbientBgUrl(bgUrl);
    };
  }, [selectedGameIndex, games, loading]);

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

    setLaunchingGame(game);
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
    setOptionsMenuSelectedIndex(0);
    setOptionsMenuGame(game);
  };

  const triggerOption = (option: string, game: SteamGame) => {
    if (option === "play") {
      setOptionsMenuGame(null);
      handleLaunchGame(game);
    } else if (option === "edit") {
      setEditName(game.name);
      setEditExe(game.exe_path || "");
      setEditImg(game.image_url || "");
      setEditBg(game.bg_url || "");
      setEditTab("general");
      setEditingGame(game);
      setOptionsMenuGame(null);
    } else if (option === "delete") {
      if (confirm(`Tem certeza que deseja excluir o atalho para ${game.name}?`)) {
        handleDeleteCustomGame(game.appid);
        setOptionsMenuGame(null);
      }
    } else if (option === "cancel") {
      setOptionsMenuGame(null);
    }
  };

  const triggerOptionRef = useRef<any>(null);
  triggerOptionRef.current = triggerOption;

  // Custom File Explorer and Add Custom Game Helpers
  const openFileExplorer = (
    allowedExts: string[],
    onSelect: (path: string) => void
  ) => {
    setFileExplorerFilter(allowedExts);
    setFileExplorerOnSelect(() => onSelect);

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
    openFileExplorer(["exe", "sh", "bin"], async (selectedPath) => {
      if (!selectedPath) return;

      const parts = selectedPath.replace(/\\/g, "/").split("/");
      const fileName = parts[parts.length - 1] || "";
      const dotIndex = fileName.lastIndexOf(".");
      const rawName = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
      const gameName = rawName.replace(/[-_]+/g, " ").trim();

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
    openFileExplorer(["exe", "sh", "bin"], (path) => {
      setEditExe(path);
      if (!editName && path) {
        const parts = path.replace(/\\/g, "/").split("/");
        const fileName = parts[parts.length - 1];
        const dotIndex = fileName.lastIndexOf(".");
        setEditName(dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName);
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

    try {
      const dto = await invoke<GameDto>("db_update_game", {
        gameId: editingGame.appid,
        name: editName,
        exePath: editExe,
        coverUrl: resolvedImg,
        backgroundUrl: editBg || null,
      });
      const updated = gameDtoToSteamGame(dto);
      setCustomGames((prev) =>
        prev.map((g) => (g.appid === editingGame.appid ? updated : g))
      );
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
  }, []);

  // Keyboard navigation for carousel and header buttons
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11" || (e.altKey && e.key === "Enter")) {
        e.preventDefault();
        invoke("toggle_fullscreen").catch(console.error);
        return;
      }

      if (settingsOpen || launchingGame || loading || optionsMenuGame || editingGame) return;

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

      if (games.length === 0) {
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
            setHeaderSelectedIndex((prev) => (prev > 0 ? prev - 1 : 2));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setHeaderSelectedIndex((prev) => (prev < 2 ? prev + 1 : 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (headerSelectedIndex === 0) {
              handleOpenYouTube();
            } else if (headerSelectedIndex === 1) {
              handleOpenTwitch();
            } else {
              setSettingsOpen(true);
            }
          }
        }
        return;
      }

      if (focusArea === "carousel") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setSelectedGameIndex((prev) => (prev > 0 ? prev - 1 : games.length - 1));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setSelectedGameIndex((prev) => (prev < games.length - 1 ? prev + 1 : 0));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setFocusArea("header");
          setHeaderSelectedIndex(0);
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleTryLaunchGame(games[selectedGameIndex]);
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
      } else if (focusArea === "header") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setHeaderSelectedIndex((prev) => (prev > 0 ? prev - 1 : 2));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setHeaderSelectedIndex((prev) => (prev < 2 ? prev + 1 : 0));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusArea("carousel");
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (headerSelectedIndex === 0) {
            handleOpenYouTube();
          } else if (headerSelectedIndex === 1) {
            handleOpenTwitch();
          } else {
            setSettingsOpen(true);
          }
        } else if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          setFocusArea("carousel");
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
    optionsMenuGame,
    editingGame,
    focusArea,
    headerSelectedIndex,
  ]);

  // Keyboard navigation for options menu
  useEffect(() => {
    const handleOptionsMenuKeys = (e: KeyboardEvent) => {
      if (!optionsMenuGame || editingGame) return;

      const availableOptions = optionsMenuGame.isCustom
        ? ["play", "edit", "delete", "cancel"]
        : ["play", "cancel"];

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setOptionsMenuSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : availableOptions.length - 1
        );
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setOptionsMenuSelectedIndex((prev) =>
          prev < availableOptions.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        triggerOption(availableOptions[optionsMenuSelectedIndex], optionsMenuGame);
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        setOptionsMenuGame(null);
      }
    };
    window.addEventListener("keydown", handleOptionsMenuKeys);
    return () => window.removeEventListener("keydown", handleOptionsMenuKeys);
  }, [optionsMenuGame, optionsMenuSelectedIndex, editingGame]);

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
    if (carouselRef.current && games.length > 0) {
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
  }, [selectedGameIndex, games]);

  // Unified Gamepad Registration for Main Application Layer
  useEffect(() => {
    const unregister = registerLayerHandler("main", (actions: GamepadActionState) => {
      const {
        games: currentGames,
        selectedGameIndex: currentIndex,
        settingsOpen: isSettingsOpen,
        launchingGame: isLaunching,
        loading: isLoading,
        youtubeActive: isYoutubeActive,
        twitchActive: isTwitchActive,
        optionsMenuGame: isOptionsMenuOpen,
        optionsMenuSelectedIndex: selectedOptionIdx,
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

      if (isLoading || isLaunching) return true;

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

      if (isOptionsMenuOpen) {
        const availableOptions = isOptionsMenuOpen.isCustom
          ? ["play", "edit", "delete", "cancel"]
          : ["play", "cancel"];

        if (actions.up) {
          setOptionsMenuSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : availableOptions.length - 1
          );
        } else if (actions.down) {
          setOptionsMenuSelectedIndex((prev) =>
            prev < availableOptions.length - 1 ? prev + 1 : 0
          );
        } else if (actions.a) {
          triggerOptionRef.current?.(
            availableOptions[selectedOptionIdx],
            isOptionsMenuOpen
          );
        } else if (actions.b) {
          setOptionsMenuGame(null);
        }
        return true;
      }

      if (detailGame && theme === "atlas") {
        if (actions.b) {
          setActiveDetailGame(null);
        } else if (actions.left) {
          setDetailSelectedIndex((prev) => (prev > 0 ? prev - 1 : 2));
        } else if (actions.right) {
          setDetailSelectedIndex((prev) => (prev < 2 ? prev + 1 : 0));
        } else if (actions.a || actions.start) {
          if (detailIdx === 0) {
            handleTryLaunchGame(detailGame);
          } else if (detailIdx === 1) {
            setEditName(detailGame.name);
            setEditExe(detailGame.exe_path || "");
            setEditImg(detailGame.image_url || "");
            setEditBg(detailGame.bg_url || "");
            setEditTab("media");
            setEditingGame(detailGame);
          } else if (detailIdx === 2) {
            setOptionsMenuGame(detailGame);
          }
        } else if (actions.x || actions.y) {
          setOptionsMenuGame(detailGame);
        }
        return true;
      }

      if (currentGames.length > 0) {
        if (focusArea === "carousel") {
          if (actions.left) {
            setSelectedGameIndex((prev) => (prev > 0 ? prev - 1 : currentGames.length - 1));
          } else if (actions.right) {
            setSelectedGameIndex((prev) => (prev < currentGames.length - 1 ? prev + 1 : 0));
          } else if (actions.up) {
            setFocusArea("header");
            setHeaderSelectedIndex(0);
          } else if (actions.a || actions.start) {
            if (currentGames[currentIndex]) {
              if (theme === "atlas") {
                setActiveDetailGame(currentGames[currentIndex]);
                setDetailSelectedIndex(0);
              } else {
                handleTryLaunchGame(currentGames[currentIndex]);
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
            setHeaderSelectedIndex((prev) => (prev > 0 ? prev - 1 : 2));
          } else if (actions.right) {
            setHeaderSelectedIndex((prev) => (prev < 2 ? prev + 1 : 0));
          } else if (actions.down) {
            setFocusArea("carousel");
          } else if (actions.a) {
            if (headerSelectedIndex === 0) handleOpenYouTube();
            else if (headerSelectedIndex === 1) handleOpenTwitch();
            else setSettingsOpen(true);
          } else if (actions.b) {
            setFocusArea("carousel");
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
        }
      })
      .catch((err) => {
        console.warn(`Failed to fetch IGDB cover for ${game.name}:`, err);
      });
  };

  const activeGame = games[selectedGameIndex];

  const handleSelectGameInCarousel = (index: number, game: SteamGame) => {
    setSelectedGameIndex(index);
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
        <AmbientBackground
          ambientBgUrl={ambientBgUrl}
          activeGame={activeGame}
        />
      }
      header={
        <Header
          currentTheme={currentTheme}
          focusArea={focusArea}
          headerSelectedIndex={headerSelectedIndex}
          systemTime={systemTime}
          onOpenYouTube={handleOpenYouTube}
          onOpenTwitch={handleOpenTwitch}
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
            onOpenOptionsMenu={setOptionsMenuGame}
            onOpenEditMedia={(game) => {
              setEditName(game.name);
              setEditExe(game.exe_path || "");
              setEditImg(game.image_url || "");
              setEditBg(game.bg_url || "");
              setEditTab("media");
              setEditingGame(game);
            }}
          />
        ) : games.length === 0 && !loading ? (
          <EmptyLibrary
            onAddGameClick={() => {
              setSettingsOpen(true);
              setSettingsTab("custom");
            }}
          />
        ) : (
          <>
            <GameInfoPanel
              activeGame={activeGame}
              currentTheme={currentTheme}
              playtimes={playtimes}
              onTryLaunchGame={handleTryLaunchGame}
            />

            {loading ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "300px",
                }}
              >
                <div className="spinner" />
              </div>
            ) : (
              <GameCarousel
                games={games}
                selectedGameIndex={selectedGameIndex}
                focusArea={focusArea}
                imageErrors={imageErrors}
                carouselRef={carouselRef}
                onSelectGame={handleSelectGameInCarousel}
                onImageError={handleImageError}
              />
            )}
          </>
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
            onOpenAddGameModal={openAddGameModal}
            onDeleteCustomGame={handleDeleteCustomGame}
            onSelectTheme={setCurrentTheme}
          />

          <OptionsMenuModal
            optionsMenuGame={optionsMenuGame}
            optionsMenuSelectedIndex={optionsMenuSelectedIndex}
            gamepadConnected={gamepadConnected}
            currentTheme={currentTheme}
            onClose={() => setOptionsMenuGame(null)}
            onTriggerOption={triggerOption}
            setOptionsMenuSelectedIndex={setOptionsMenuSelectedIndex}
          />

          <EditGameModal
            editingGame={editingGame}
            editName={editName}
            editExe={editExe}
            editImg={editImg}
            editBg={editBg}
            editTab={editTab}
            editingSearchingIgdb={editingSearchingIgdb}
            playtimes={playtimes}
            onClose={() => setEditingGame(null)}
            onTabChange={setEditTab}
            setEditName={setEditName}
            setEditExe={setEditExe}
            onPickExe={handleEditPickExe}
            onSubmit={handleEditCustomGameSubmit}
            onOpenImagePicker={handleOpenImagePicker}
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
            onClose={() => setFileExplorerOpen(false)}
            onNavigateToPath={navigateToPath}
            onSelectFileExplorerItem={handleFileExplorerSelect}
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
