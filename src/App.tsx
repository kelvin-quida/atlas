import { useState, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { GamepadModal } from "./components/GamepadModal";
import { useGamepad } from "./providers/GamepadContext";
import { GamepadActionState } from "./core/focus/gamepadInput";
import "./App.css";

interface SteamGame {
  appid: string;       // maps to GameDto.id (UUID) or steam_app_id
  name: string;
  installdir: string;
  library_path: string;
  image_url: string;   // maps to GameDto.cover_url
  isCustom?: boolean;
  exe_path?: string;
  last_played?: string;
  added_at?: string;
}

// Shape of the DB DTO returned from Rust
interface GameDto {
  id: string;
  name: string;
  platform: string;
  exe_path?: string;
  install_dir?: string;
  steam_app_id?: string;
  igdb_id?: number;
  cover_url?: string;
  last_played?: string;
  added_at: string;
}

// Map a DB GameDto to the legacy SteamGame shape used throughout the UI
function gameDtoToSteamGame(dto: GameDto): SteamGame {
  return {
    appid: dto.id,
    name: dto.name,
    installdir: dto.install_dir ?? "",
    library_path: "",
    image_url: dto.cover_url ?? "",
    isCustom: dto.platform === "manual",
    exe_path: dto.exe_path,
    last_played: dto.last_played,
    added_at: dto.added_at,
  };
}

// Gorgeous mock games to display in dev environment or if Steam isn't installed


function App() {
  const [steamGames, setSteamGames] = useState<SteamGame[]>([]);
  const [customGames, setCustomGames] = useState<SteamGame[]>([]);
  const [games, setGames] = useState<SteamGame[]>([]);
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [_searchingIgdb, setSearchingIgdb] = useState(false);
  const [editingSearchingIgdb, setEditingSearchingIgdb] = useState(false);

  const [isSimulated, setIsSimulated] = useState(false);
  const [ambientBgUrl, setAmbientBgUrl] = useState("");

  const [launchingGame, setLaunchingGame] = useState<SteamGame | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"geral" | "custom" | "aparencia">("geral");
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return localStorage.getItem("atlas_theme") || "atlas";
  });
  const [shellEnabled, setShellEnabled] = useState(false);
  const [systemTime, setSystemTime] = useState("");
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const { gamepadConnected, registerLayerHandler } = useGamepad();
  const [youtubeActive, setYoutubeActive] = useState(false);

  // Playtime Tracking States (Phase 5)
  const [playtimes, setPlaytimes] = useState<Record<string, { total_seconds: number; formatted: string }>>({});
  const activeSessionIdRef = useRef<number | null>(null);




  // States for options menu and editing
  const [optionsMenuGame, setOptionsMenuGame] = useState<SteamGame | null>(null);
  const [optionsMenuSelectedIndex, setOptionsMenuSelectedIndex] = useState(0);
  const [editingGame, setEditingGame] = useState<SteamGame | null>(null);
  const [editName, setEditName] = useState("");
  const [editExe, setEditExe] = useState("");
  const [editImg, setEditImg] = useState("");
  const [editTab, setEditTab] = useState<"general" | "advanced" | "media">("general");

  // States for header focus and navigation
  const [focusArea, setFocusArea] = useState<"carousel" | "header">("carousel");
  const [headerSelectedIndex, setHeaderSelectedIndex] = useState(0);

  // Sync theme with document class/attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("atlas_theme", currentTheme);
  }, [currentTheme]);

  // Form states for adding custom game
  const [customName, setCustomName] = useState("");
  const [customExe, setCustomExe] = useState("");
  const [customImg, setCustomImg] = useState("");

  // In-App File Explorer States
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  const [fileExplorerPath, setFileExplorerPath] = useState("");
  const [fileExplorerItems, setFileExplorerItems] = useState<any[]>([]);
  const [fileExplorerSelectedIndex, setFileExplorerSelectedIndex] = useState(0);
  const [fileExplorerFilter, setFileExplorerFilter] = useState<string[]>([]);
  const [fileExplorerOnSelect, setFileExplorerOnSelect] = useState<((path: string) => void) | null>(null);
  const [availableDrives, setAvailableDrives] = useState<string[]>([]);
  const [selectedDrives, setSelectedDrives] = useState<Record<string, boolean>>({});

  // Xbox-Style Add Game Modal States
  const [addGameModalOpen, setAddGameModalOpen] = useState(false);
  const [installedApps, setInstalledApps] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [detectedSelectedIndex, setDetectedSelectedIndex] = useState(0);
  const [addGameSelectedIndex, setAddGameSelectedIndex] = useState(0);

  const carouselRef = useRef<HTMLDivElement>(null);
  const igdbAttemptsRef = useRef<Record<string, boolean>>({});


  // Ref to hold current state values for the gamepad loop
  const stateRef = useRef({
    games,
    selectedGameIndex,
    settingsOpen,
    launchingGame,
    loading,
    youtubeActive,
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
    addGameModalOpen,
    addGameSelectedIndex,
    detectedSelectedIndex,
    installedApps,
    searchQuery
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
      addGameModalOpen,
      addGameSelectedIndex,
      detectedSelectedIndex,
      installedApps,
      searchQuery
    };
  }, [games, selectedGameIndex, settingsOpen, launchingGame, loading, youtubeActive, optionsMenuGame, optionsMenuSelectedIndex, editingGame, customGames, focusArea, headerSelectedIndex, settingsTab, currentTheme, fileExplorerOpen, fileExplorerSelectedIndex, fileExplorerItems, addGameModalOpen, addGameSelectedIndex, detectedSelectedIndex, installedApps, searchQuery]);

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


  // Load all games from SQLite — runs on mount and handles first-run localStorage migration
  const loadGames = async () => {
    setLoading(true);
    try {
      // ── First-run migration: move localStorage games into SQLite ──
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

      // ── Load all games from the database ──
      const dtos = await invoke<GameDto[]>("db_list_games");
      const allGames = dtos.map(gameDtoToSteamGame);
      allGames.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

      // Split into steam / custom buckets for compatibility with rest of UI
      setSteamGames(allGames.filter((g) => !g.isCustom));
      setCustomGames(allGames.filter((g) => g.isCustom));
      setIsSimulated(false);
    } catch (err) {
      console.warn("[Atlas] Failed to load games from database:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load games from DB on mount
  useEffect(() => {
    loadGames();
  }, []);

  const loadPlaytime = async (gameId: string) => {
    try {
      const stats = await invoke<{ game_id: string; total_seconds: number; formatted: string }>("get_game_playtime", { gameId });
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
          const res = await invoke<{ duration_seconds: number; formatted: string }>("end_play_session", { sessionId: sid });
          console.log(`[Playtime] Ended session ${sid}. Played for ${res.formatted}`);

          // Refresh playtime for current game
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
    // Sort games alphabetically by name
    merged.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    setGames(merged);

    // Safeguard selection index bounds
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
            // Remove error state if any was set
            setImageErrors((prev) => {
              const next = { ...prev };
              delete next[game.appid];
              return next;
            });

            if (game.isCustom) {
              setCustomGames((prev) => {
                const next = prev.map((g) => (g.appid === game.appid ? { ...g, image_url: newUrl } : g));
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
    if (activeGame.image_url) {
      if (!activeGame.isCustom) {
        // Use Steam's landscape header image: much smaller and loads instantly
        bgUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${activeGame.appid}/header.jpg`;
      } else if (activeGame.image_url.includes("images.igdb.com")) {
        // Use IGDB's t_cover_big (which is 264x352, about 10-20KB instead of 720p 200KB)
        bgUrl = activeGame.image_url.replace("t_720p", "t_cover_big");
      } else {
        // Fallback to custom game image URL (local file src or other remote source)
        bgUrl = getGameImageUrl(activeGame);
      }
    }

    if (!bgUrl) {
      setAmbientBgUrl("");
      return;
    }

    // Preload image in memory before transitioning
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
      console.warn("Shell replacement check is only fully functional in Windows production builds.", err);
    }
  };

  // Toggle Windows shell replacement
  const handleToggleShell = async (checked: boolean) => {
    try {
      await invoke("toggle_shell_replacement", { enable: checked });
      setShellEnabled(checked);
    } catch (err) {
      console.error(err);
      alert(`Erro ao alterar o registro: ${err}\n(Esta função precisa de permissões administrativas no Windows)`);
    }
  };

  // Launch selected game (Steam or Custom)
  const handleLaunchGame = async (game: SteamGame) => {
    // 1. Fechar o YouTube se estiver aberto para liberar ~180MB de RAM imediatamente
    if (youtubeActive) {
      await handleCloseYouTube();
    }

    setLaunchingGame(game);
    try {
      // Start session in DB before launching
      if (!isSimulated) {
        try {
          const res = await invoke<{ session_id: number }>("start_play_session", { gameId: game.appid });
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

      // 2. Minimizar a janela principal do Tauri para liberar processos de renderização GPU e Working Set de RAM
      try {
        await getCurrentWindow().minimize();
      } catch (winErr) {
        console.error("Falha ao minimizar janela do launcher:", winErr);
      }

      // Pequeno cooldown de transição pós-lançamento
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
        const items = drives.map(drive => ({
          name: `Disco Local (${drive})`,
          path: drive,
          is_dir: true
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
          const items = drives.map(drive => ({
            name: `Disco Local (${drive})`,
            path: drive,
            is_dir: true
          }));
          setFileExplorerItems(items);
          setFileExplorerSelectedIndex(0);
        })
        .catch((err) => {
          console.error("Erro ao carregar drives:", err);
        });
      return;
    }

    invoke<any[]>("list_dir_contents", { path: newPath, allowedExtensions: fileExplorerFilter })
      .then((items) => {
        setFileExplorerPath(newPath);
        const parentItem = {
          name: ".. (Voltar)",
          path: "..",
          is_dir: true
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
        const parent = await invoke<string>("get_parent_path", { path: fileExplorerPath });
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
    setCustomName("");
    setCustomExe("");
    setCustomImg("");
    setSearchQuery("");
    setDetectedSelectedIndex(0);
    setAddGameSelectedIndex(0);

    setLoadingApps(true);
    invoke<string[]>("get_drives")
      .then((drives) => {
        setAvailableDrives(drives);
        const initDrives: Record<string, boolean> = {};
        drives.forEach((d) => { initDrives[d] = true; });
        setSelectedDrives(initDrives);
      })
      .catch((err) => console.error("Erro ao carregar drives:", err));

    invoke<any[]>("get_installed_apps")
      .then((apps) => {
        setInstalledApps(apps);
        setLoadingApps(false);
      })
      .catch((err) => {
        console.error("Erro ao obter apps instalados:", err);
        setLoadingApps(false);
      });

    setAddGameModalOpen(true);
  };

  const handlePickExe = () => {
    openFileExplorer(["exe", "sh", "bin"], (path) => {
      setCustomExe(path);
      if (!customName && path) {
        const parts = path.replace(/\\/g, "/").split("/");
        const fileName = parts[parts.length - 1];
        const dotIndex = fileName.lastIndexOf(".");
        setCustomName(dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName);
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

  const handleEditPickImg = () => {
    openFileExplorer(["png", "jpg", "jpeg", "webp"], (path) => {
      setEditImg(path);
    });
  };

  const handleAddCustomGameSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customName || !customExe) {
      alert("Por favor, preencha pelo menos o Nome e o Executável.");
      return;
    }

    setSearchingIgdb(true);
    let resolvedImg = customImg;
    if (!resolvedImg) {
      try {
        resolvedImg = await invoke<string>("get_game_image_url", { gameName: customName });
      } catch (err) {
        console.warn("Could not auto-fetch image during addition:", err);
      }
    }

    try {
      const dto = await invoke<GameDto>("db_add_game", {
        name: customName,
        exePath: customExe,
        installDir: null,
        steamAppId: null,
        platform: "manual",
        coverUrl: resolvedImg || null,
      });
      const newGame = gameDtoToSteamGame(dto);
      setCustomGames((prev) => [...prev, newGame]);
    } catch (err) {
      console.error("Failed to add game to database:", err);
      alert(`Erro ao salvar o jogo: ${err}`);
    }

    // Reset form
    setCustomName("");
    setCustomExe("");
    setCustomImg("");
    setAddGameModalOpen(false);
    setSearchingIgdb(false);
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
        resolvedImg = await invoke<string>("get_game_image_url", { gameName: editName });
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



  const handleSearchIgdbForEdit = async () => {
    if (!editName) {
      alert("Por favor, digite o nome do jogo primeiro.");
      return;
    }
    setEditingSearchingIgdb(true);
    try {
      const url = await invoke<string>("get_game_image_url", { gameName: editName });
      setEditImg(url);
    } catch (err) {
      alert(`Não foi possível encontrar a imagem para "${editName}" no IGDB: ${err}`);
    } finally {
      setEditingSearchingIgdb(false);
    }
  };


  // Refs for scrolling container
  const detectedListRef = useRef<HTMLDivElement | null>(null);
  const fileExplorerListRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to center active elements
  useEffect(() => {
    if (detectedListRef.current && addGameModalOpen) {
      const container = detectedListRef.current;
      const items = container.getElementsByClassName("detected-app-item");
      const activeItem = items[detectedSelectedIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [detectedSelectedIndex, addGameModalOpen]);

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

  // Focus helper for AddGameModal
  useEffect(() => {
    if (!addGameModalOpen) return;

    let elementToFocus: HTMLElement | null = null;

    if (addGameSelectedIndex === 0) {
      elementToFocus = document.getElementById("add-game-search-input");
    } else if (addGameSelectedIndex === 1) {
      elementToFocus = document.getElementById("add-game-manual-browse-btn");
    } else if (addGameSelectedIndex === 2) {
      elementToFocus = document.getElementById(`detected-app-item-${detectedSelectedIndex}`);
    } else if (addGameSelectedIndex === 3) {
      elementToFocus = document.getElementById("add-game-custom-name");
    } else if (addGameSelectedIndex === 4) {
      elementToFocus = document.getElementById("add-game-custom-exe-btn");
    } else if (addGameSelectedIndex === 5) {
      elementToFocus = document.getElementById("add-game-custom-img");
    } else if (addGameSelectedIndex === 6) {
      elementToFocus = document.getElementById("add-game-custom-img-btn");
    } else if (addGameSelectedIndex === 7) {
      elementToFocus = document.getElementById("add-game-submit-btn");
    } else if (addGameSelectedIndex === 8) {
      elementToFocus = document.getElementById("add-game-cancel-btn");
    }

    if (elementToFocus) {
      elementToFocus.focus();
    }
  }, [addGameModalOpen, addGameSelectedIndex, detectedSelectedIndex, installedApps, searchQuery]);

  // Focus helper for File Explorer
  useEffect(() => {
    if (!fileExplorerOpen) return;

    const elementToFocus = document.getElementById(`file-explorer-item-${fileExplorerSelectedIndex}`);
    if (elementToFocus) {
      elementToFocus.focus();
    }
  }, [fileExplorerOpen, fileExplorerSelectedIndex, fileExplorerItems]);

  // Keydown listener for Keyboard Navigation inside AddGameModal
  useEffect(() => {
    const handleAddGameKeys = (e: KeyboardEvent) => {
      if (!addGameModalOpen || fileExplorerOpen) return;
      const fApps = installedApps.filter((app) => app.name.toLowerCase().includes(searchQuery.toLowerCase()));

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (addGameSelectedIndex === 2) {
          if (detectedSelectedIndex > 0) {
            setDetectedSelectedIndex((prev) => prev - 1);
          } else {
            setAddGameSelectedIndex(0);
          }
        } else {
          setAddGameSelectedIndex((prev) => {
            if (prev === 0) return 8;
            if (prev === 3) return fApps.length > 0 ? 2 : 0;
            return prev - 1;
          });
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (addGameSelectedIndex === 2) {
          if (detectedSelectedIndex < fApps.length - 1) {
            setDetectedSelectedIndex((prev) => prev + 1);
          } else {
            setAddGameSelectedIndex(3);
          }
        } else {
          setAddGameSelectedIndex((prev) => {
            if (prev === 8) return 0;
            if (prev === 0 || prev === 1) return fApps.length > 0 ? 2 : 3;
            if (prev === 2) return 3;
            return prev + 1;
          });
        }
      } else if (e.key === "ArrowLeft") {
        if (addGameSelectedIndex === 1) {
          e.preventDefault();
          setAddGameSelectedIndex(0);
        } else if (addGameSelectedIndex === 8) {
          e.preventDefault();
          setAddGameSelectedIndex(7);
        }
      } else if (e.key === "ArrowRight") {
        if (addGameSelectedIndex === 0) {
          e.preventDefault();
          setAddGameSelectedIndex(1);
        } else if (addGameSelectedIndex === 7) {
          e.preventDefault();
          setAddGameSelectedIndex(8);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setAddGameModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleAddGameKeys);
    return () => window.removeEventListener("keydown", handleAddGameKeys);
  }, [addGameModalOpen, addGameSelectedIndex, detectedSelectedIndex, installedApps, searchQuery, fileExplorerOpen]);

  // Keydown listener for Keyboard Navigation inside In-App File Explorer
  useEffect(() => {
    const handleFileExplorerKeys = (e: KeyboardEvent) => {
      if (!fileExplorerOpen) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFileExplorerSelectedIndex((prev) => (prev > 0 ? prev - 1 : fileExplorerItems.length - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFileExplorerSelectedIndex((prev) => (prev < fileExplorerItems.length - 1 ? prev + 1 : 0));
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

      if (games.length === 0) {
        // When library is empty, only allow header navigation and hotkeys
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

        // Force header focus if they try to navigate or it's not set
        if (focusArea !== "header") {
          setFocusArea("header");
          setHeaderSelectedIndex(0);
          return;
        }

        if (focusArea === "header") {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setHeaderSelectedIndex((prev) => (prev > 0 ? prev - 1 : 1));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setHeaderSelectedIndex((prev) => (prev < 1 ? prev + 1 : 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (headerSelectedIndex === 0) {
              handleOpenYouTube();
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
        }
      } else if (focusArea === "header") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setHeaderSelectedIndex((prev) => (prev > 0 ? prev - 1 : 1));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setHeaderSelectedIndex((prev) => (prev < 1 ? prev + 1 : 0));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusArea("carousel");
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (headerSelectedIndex === 0) {
            handleOpenYouTube();
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
  }, [games, selectedGameIndex, settingsOpen, launchingGame, loading, isSimulated, youtubeActive, optionsMenuGame, editingGame, focusArea, headerSelectedIndex]);

  // Keyboard navigation for options menu
  useEffect(() => {
    const handleOptionsMenuKeys = (e: KeyboardEvent) => {
      if (!optionsMenuGame || editingGame) return;

      const availableOptions = optionsMenuGame.isCustom
        ? ["play", "edit", "delete", "cancel"]
        : ["play", "cancel"];

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setOptionsMenuSelectedIndex((prev) => (prev > 0 ? prev - 1 : availableOptions.length - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setOptionsMenuSelectedIndex((prev) => (prev < availableOptions.length - 1 ? prev + 1 : 0));
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
        optionsMenuGame: isOptionsMenuOpen,
        optionsMenuSelectedIndex: selectedOptionIdx,
        editingGame: isEditing,
        focusArea,
        headerSelectedIndex,

        fileExplorerOpen: isFileExplorerOpen,
        fileExplorerSelectedIndex: fileExplorerIdx,
        fileExplorerItems: fileExplorerItms,
        addGameModalOpen: isAddGameOpen,
        addGameSelectedIndex: addGameIdx,
        detectedSelectedIndex: detectedIdx,
        installedApps: instApps,
        searchQuery: sQuery,
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

      if (isFileExplorerOpen) {
        if (actions.up) {
          setFileExplorerSelectedIndex((prev) => (prev > 0 ? prev - 1 : fileExplorerItms.length - 1));
        } else if (actions.down) {
          setFileExplorerSelectedIndex((prev) => (prev < fileExplorerItms.length - 1 ? prev + 1 : 0));
        } else if (actions.a) {
          const selectedItem = fileExplorerItms[fileExplorerIdx];
          if (selectedItem) handleFileExplorerSelectRef.current?.(selectedItem);
        } else if (actions.b) {
          setFileExplorerOpen(false);
        }
        return true;
      }

      if (isAddGameOpen) {
        const fApps = instApps.filter((app: any) => app.name.toLowerCase().includes(sQuery.toLowerCase()));
        if (actions.b) {
          setAddGameModalOpen(false);
        } else if (addGameIdx === 2) {
          if (actions.up) {
            if (detectedIdx > 0) setDetectedSelectedIndex(detectedIdx - 1);
            else setAddGameSelectedIndex(0);
          } else if (actions.down) {
            if (detectedIdx < fApps.length - 1) setDetectedSelectedIndex(detectedIdx + 1);
            else setAddGameSelectedIndex(3);
          } else if (actions.a) {
            const app = fApps[detectedIdx];
            if (app) {
              setCustomName(app.name);
              setCustomExe(app.path);
              setAddGameSelectedIndex(7);
            }
          }
        } else {
          if (actions.up) {
            setAddGameSelectedIndex((prev) => {
              if (prev === 0) return 8;
              if (prev === 3) return fApps.length > 0 ? 2 : 0;
              return prev - 1;
            });
          } else if (actions.down) {
            setAddGameSelectedIndex((prev) => {
              if (prev === 8) return 0;
              if (prev === 0 || prev === 1) return fApps.length > 0 ? 2 : 3;
              if (prev === 2) return 3;
              return prev + 1;
            });
          } else if (actions.left) {
            if (addGameIdx === 1) setAddGameSelectedIndex(0);
            else if (addGameIdx === 8) setAddGameSelectedIndex(7);
          } else if (actions.right) {
            if (addGameIdx === 0) setAddGameSelectedIndex(1);
            else if (addGameIdx === 7) setAddGameSelectedIndex(8);
          } else if (actions.a) {
            const active = document.activeElement;
            if (active instanceof HTMLElement && !(active instanceof HTMLInputElement && active.type === "text")) {
              active.click();
            }
          }
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
          setOptionsMenuSelectedIndex((prev) => (prev > 0 ? prev - 1 : availableOptions.length - 1));
        } else if (actions.down) {
          setOptionsMenuSelectedIndex((prev) => (prev < availableOptions.length - 1 ? prev + 1 : 0));
        } else if (actions.a) {
          triggerOptionRef.current?.(availableOptions[selectedOptionIdx], isOptionsMenuOpen);
        } else if (actions.b) {
          setOptionsMenuGame(null);
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
            if (currentGames[currentIndex]) handleTryLaunchGame(currentGames[currentIndex]);
          } else if (actions.select) {
            setSettingsOpen(true);
          } else if (actions.y) {
            handleOpenYouTube();
          } else if (actions.x) {
            setAddGameModalOpen(true);
          }
        } else if (focusArea === "header") {
          if (actions.left) {
            setHeaderSelectedIndex((prev) => (prev > 0 ? prev - 1 : 1));
          } else if (actions.right) {
            setHeaderSelectedIndex((prev) => (prev < 1 ? prev + 1 : 0));
          } else if (actions.down) {
            setFocusArea("carousel");
          } else if (actions.a) {
            if (headerSelectedIndex === 0) handleOpenYouTube();
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

        // Persist the cover to the database + download to disk
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
          // Fallback: update UI only
          if (game.isCustom) {
            setCustomGames((prev) => prev.map((g) => (g.appid === appid ? { ...g, image_url: newUrl } : g)));
          } else {
            setSteamGames((prev) => prev.map((g) => (g.appid === appid ? { ...g, image_url: newUrl } : g)));
          }
        }
      })
      .catch((err) => {
        console.warn(`Failed to fetch IGDB cover for ${game.name}:`, err);
      });
  };


  const activeGame = games[selectedGameIndex];

  // Resolve image source: local AppData path → asset:// URL, remote → passthrough
  const getGameImageUrl = (game: SteamGame): string => {
    if (!game.image_url) return "";
    // Remote URLs pass through as-is
    if (
      game.image_url.startsWith("http://") ||
      game.image_url.startsWith("https://") ||
      game.image_url.startsWith("data:")
    ) {
      return game.image_url;
    }
    // Local relative path (e.g. "assets/covers/abc.jpg") — needs convertFileSrc
    try {
      return convertFileSrc(game.image_url);
    } catch (e) {
      console.error("Failed to convert file src:", e);
      return "";
    }
  };

  // Generate consistent premium CSS background gradient based on name hash
  const getGradientBg = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash % 360);
    const h2 = Math.abs((hash + 80) % 360);
    return `linear-gradient(135deg, hsl(${h1}, 65%, 22%) 0%, hsl(${h2}, 65%, 10%) 100%)`;
  };

  // Generate game-specific widgets for PS5 theme (updated with real playtime stats)
  const getGameWidgets = (game: SteamGame) => {
    const name = game.name;
    const playtimeFormatted = playtimes[game.appid]?.formatted || "< 1m";

    if (name.includes("Baldur's Gate")) {
      return [
        { title: "Troféus", desc: "Ato III iniciado", value: "32%", progress: 32 },
        { title: "Atividades", desc: "Acampamento na taverna", value: "Aventura ativa" },
        { title: "Tempo jogado", desc: "Tempo total registrado", value: playtimeFormatted }
      ];
    }
    if (name.includes("Cyberpunk")) {
      return [
        { title: "Troféus", desc: "Cidade dos Sonhos", value: "48%", progress: 48 },
        { title: "Atividades", desc: "Trabalho Sujo com Rogue", value: "Missão pendente" },
        { title: "Tempo jogado", desc: "Tempo total registrado", value: playtimeFormatted }
      ];
    }
    if (name.includes("Elden Ring")) {
      return [
        { title: "Troféus", desc: "Lendário Lorde de Limgrave", value: "78%", progress: 78 },
        { title: "Atividades", desc: "Explorar Ruínas de Caelid", value: "Nível 105" },
        { title: "Tempo jogado", desc: "Tempo total registrado", value: playtimeFormatted }
      ];
    }
    if (name.includes("Hades")) {
      return [
        { title: "Fugas", desc: "Tentativas de fuga bem sucedidas: 14", value: "14 fugas" },
        { title: "Troféus", desc: "Sangue e Trevas", value: "90%", progress: 90 },
        { title: "Tempo jogado", desc: "Tempo total registrado", value: playtimeFormatted }
      ];
    }
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const completion = Math.abs(hash % 90) + 10;
    return [
      { title: "Troféus", desc: "Progresso da Campanha", value: `${completion}%`, progress: completion },
      { title: "Atividades", desc: "Retomar de onde parou", value: "Jogar agora" },
      { title: "Tempo jogado", desc: "Tempo total registrado", value: playtimeFormatted }
    ];
  };



  return (
    <div className="app-root">

      {/* Blurred ambient theme bg */}
      <div
        className="ambient-bg"
        style={{
          backgroundImage: ambientBgUrl ? `url(${ambientBgUrl})` : "none",
          backgroundColor: ambientBgUrl ? "var(--bg-primary)" : "transparent",
        }}
      >
        {activeGame && !activeGame.image_url && (
          <div style={{ width: "100%", height: "100%", background: getGradientBg(activeGame.name), opacity: 0.15 }}></div>
        )}
      </div>
      <div className="ambient-overlay"></div>

      <div className="console-container">
        {/* Top Header Section */}
        {currentTheme === "ps5" ? (
          <header className="ps5-header">
            <div className="ps5-header-left">
              <div className="ps5-menu-tab active">Jogos</div>
              <div className="ps5-menu-tab">Mídia</div>
            </div>
            <div className="ps5-header-right">
              <button
                className={`ps5-icon-btn ${focusArea === "header" && headerSelectedIndex === 0 ? "focused" : ""}`}
                onClick={handleOpenYouTube}
                title="YouTube"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </button>
              <button
                className={`ps5-icon-btn ${focusArea === "header" && headerSelectedIndex === 1 ? "focused" : ""}`}
                onClick={() => setSettingsOpen(true)}
                title="Configurações"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <div className="ps5-avatar-circle" title="Perfil">
                <div className="ps5-avatar-inner"></div>
              </div>
              <div className="ps5-time-display">{systemTime}</div>
            </div>
          </header>
        ) : (
          <header className="console-header">
            <div className="logo-container">
              <span className="logo-text">ATLAS</span>
              <span className="logo-tag">LAUNCHER</span>
            </div>

            <div className="system-status">
              <button
                className={`header-icon-btn ${focusArea === "header" && headerSelectedIndex === 0 ? "focused" : ""}`}
                onClick={handleOpenYouTube}
                title="YouTube"
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "0.25rem", transition: "all 0.2s ease" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </button>
              <button
                className={`header-icon-btn ${focusArea === "header" && headerSelectedIndex === 1 ? "focused" : ""}`}
                onClick={() => setSettingsOpen(true)}
                title="Configurações"
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "0.25rem", transition: "all 0.2s ease" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <div className="system-time">{systemTime}</div>
            </div>
          </header>
        )}

        {/* Main Content Area */}
        <main className="console-content">
          {games.length === 0 && !loading ? (
            <div className="empty-library-container">
              <div className="empty-library-content">
                <div className="empty-library-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
                  </svg>
                </div>
                <h2>Sua Biblioteca está Vazia</h2>
                <p>Adicione um jogo personalizado nas Configurações para começar a jogar.</p>
                <button
                  className="empty-library-btn"
                  onClick={() => { setSettingsOpen(true); setSettingsTab("custom"); }}
                >
                  Adicionar Jogo
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="game-info-panel">
                {activeGame && (
                  <>
                    {currentTheme === "ps5" ? (
                      <div className="ps5-game-hero-container">
                        <div className="ps5-game-logo">{activeGame.name}</div>
                        <div className="game-meta-active">
                          <span>
                            Tipo: <span className="meta-pill">{activeGame.isCustom ? "Customizado" : "Steam"}</span>
                          </span>
                          <span>•</span>
                          <span>{activeGame.isCustom ? "Atalho Local Executável" : `AppID: ${activeGame.appid}`}</span>
                        </div>
                        <div className="ps5-hero-actions">
                          <button className="ps5-play-btn" onClick={() => handleTryLaunchGame(activeGame)}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                            Jogar
                          </button>
                        </div>

                        <div className="ps5-widgets-row">
                          {getGameWidgets(activeGame).map((w, idx) => (
                            <div className="ps5-widget-card" key={idx}>
                              <div className="ps5-widget-title">{w.title}</div>
                              <div className="ps5-widget-desc">{w.desc}</div>
                              {w.progress !== undefined ? (
                                <div className="ps5-widget-progress-container">
                                  <span className="ps5-widget-value">{w.value}</span>
                                  <div className="ps5-widget-progress-bar">
                                    <div className="ps5-widget-progress-fill" style={{ width: `${w.progress}%` }}></div>
                                  </div>
                                </div>
                              ) : (
                                <div className="ps5-widget-value">{w.value}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <h1 className="game-title-active">{activeGame.name}</h1>
                        <div className="game-meta-active">
                          <span>
                            Tipo: <span className="meta-pill">{activeGame.isCustom ? "Customizado" : "Steam"}</span>
                          </span>
                          <span>•</span>
                          <span>{activeGame.isCustom ? "Atalho Local Executável" : `AppID: ${activeGame.appid}`}</span>
                          <span>•</span>
                          <span>Tempo Jogado: <span className="meta-pill">{playtimes[activeGame.appid]?.formatted || "< 1m"}</span></span>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "300px" }}>
                  <div className="spinner"></div>
                </div>
              ) : (
                <div className="games-carousel-wrapper">
                  <div className="games-carousel" ref={carouselRef}>
                    {games.map((game, index) => {
                      const isFocused = index === selectedGameIndex && focusArea === "carousel";
                      const isErr = imageErrors[game.appid] || !game.image_url;

                      return (
                        <div
                          key={game.appid}
                          className={`game-card ${isFocused ? "focused" : ""}`}
                          onClick={() => {
                            if (isFocused) {
                              handleTryLaunchGame(game);
                            } else {
                              setSelectedGameIndex(index);
                              setFocusArea("carousel");
                            }
                          }}
                        >
                          {isErr ? (
                            <div className="game-card-placeholder" style={{ background: getGradientBg(game.name) }}>
                              <div className="placeholder-tag">{game.isCustom ? "Jogo Custom" : "Jogo Steam"}</div>
                              <div className="placeholder-text">{game.name}</div>
                            </div>
                          ) : (
                            <div className="game-card-img-wrapper">
                              <img
                                src={getGameImageUrl(game)}
                                alt={game.name}
                                className="game-card-img"
                                onError={() => handleImageError(game.appid)}
                              />
                              <div className="game-card-overlay"></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

      </div>

      {/* Launching overlay screen */}
      {launchingGame && (
        <div className="launching-screen">
          <div className="spinner"></div>
          <h2 style={{ fontWeight: 600, fontSize: "1.8rem" }}>Iniciando {launchingGame.name}...</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            {gamepadConnected ? "Processo iniciado no controle..." : "Executando processo secundário..."}
          </p>
        </div>
      )}

      {/* Settings Modal */}
      <GamepadModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Configurações do Atlas"
        tabs={[
          { id: "geral", label: "Geral" },
          { id: "custom", label: "Jogos Customizados" },
          { id: "aparencia", label: "Aparência" },
        ]}
        activeTab={settingsTab}
        onTabChange={(tabId) => setSettingsTab(tabId as any)}
      >
        {settingsTab === "geral" && (
          <div className="playnite-tab-content">
            <div className="playnite-tab-pane">
              <div className="playnite-group">
                <div className="playnite-group-title">Sistema</div>
                <div className="playnite-form-grid">
                  <div className="playnite-field full-width" style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="settings-label">
                      <span className="settings-label-title" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>Iniciar como Shell do Windows</span>
                      <span className="settings-label-desc" style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                        Substitui o Explorer.exe pelo Atlas para este usuário, iniciando direto na sua biblioteca de jogos ao ligar o PC.
                      </span>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={shellEnabled}
                        onChange={(e) => handleToggleShell(e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="playnite-field full-width" style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
                    <div className="settings-label">
                      <span className="settings-label-title" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>Recarregar Biblioteca</span>
                      <span className="settings-label-desc" style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                        Força uma nova varredura nas pastas locais do Steam para detectar novos jogos instalados.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => { loadGames(); setSettingsOpen(false); }}
                    >
                      Recarregar
                    </button>
                  </div>
                </div>
              </div>

              {isSimulated && (
                <div className="settings-alert" style={{ background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.2)", color: "#fef08a", padding: "1rem", borderRadius: "6px", fontSize: "0.8rem", lineHeight: "1.4" }}>
                  ⚠️ <strong>Aviso:</strong> O Steam local ou a API do Tauri não foram detectados. A interface está exibindo jogos de teste e operando em modo de simulação. Instale o Rust e configure o app no Windows para habilitar o comportamento nativo.
                </div>
              )}
            </div>
          </div>
        )}

        {settingsTab === "custom" && (
          <div className="playnite-tab-content">
            <div className="playnite-tab-pane">
              <div className="playnite-group">
                <div className="playnite-group-title">Jogos Customizados</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Gerencie seus atalhos manuais de jogos
                  </span>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={openAddGameModal}
                  >
                    + Adicionar Jogo
                  </button>
                </div>

                {/* List of custom games */}
                <div className="custom-games-list">
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem", display: "block" }}>
                    Jogos Adicionados ({customGames.length})
                  </span>
                  {customGames.length === 0 ? (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic", marginTop: "0.5rem" }}>
                      Nenhum jogo customizado adicionado ainda.
                    </div>
                  ) : (
                    customGames.map((game) => (
                      <div key={game.appid} className="custom-game-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)", padding: "0.5rem 0.75rem", borderRadius: "6px", marginBottom: "0.5rem" }}>
                        <div className="custom-game-item-info" style={{ display: "flex", flexDirection: "column", gap: "0.25rem", overflow: "hidden", textOverflow: "ellipsis", marginRight: "1rem" }}>
                          <span className="custom-game-item-name" style={{ fontWeight: 600, fontSize: "0.85rem" }}>{game.name}</span>
                          <span className="custom-game-item-path" title={game.exe_path} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{game.exe_path}</span>
                        </div>
                        <button
                          type="button"
                          className="btn-delete"
                          onClick={() => handleDeleteCustomGame(game.appid)}
                          style={{ flexShrink: 0 }}
                        >
                          Excluir
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {settingsTab === "aparencia" && (
          <div className="playnite-tab-content">
            <div className="playnite-tab-pane">
              <div className="playnite-group">
                <div className="playnite-group-title">Personalização de Temas</div>
                <div className="settings-row-theme-header" style={{ marginBottom: "1.5rem" }}>
                  <span className="settings-label-title" style={{ fontSize: "0.85rem", fontWeight: 600, display: "block" }}>Selecione o Tema do Console</span>
                  <span className="settings-label-desc" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Altere o visual geral, cores, fontes e comportamento estético do Atlas Launcher.</span>
                </div>
                <div className="theme-selector-grid">
                  <div
                    tabIndex={0}
                    className={`theme-selector-card ${currentTheme === "atlas" ? "active" : ""}`}
                    onClick={() => setCurrentTheme("atlas")}
                  >
                    <div className="theme-preview-box atlas-theme-preview">
                      <span className="preview-indicator"></span>
                      <div className="theme-mini-logo">ATLAS</div>
                      <div className="theme-color-dots">
                        <span style={{ background: "#06b6d4" }}></span>
                        <span style={{ background: "#3b82f6" }}></span>
                        <span style={{ background: "#8b5cf6" }}></span>
                      </div>
                    </div>
                    <div className="theme-card-title">Atlas (Padrão)</div>
                  </div>

                  <div
                    tabIndex={0}
                    className={`theme-selector-card ${currentTheme === "ps5" ? "active" : ""}`}
                    onClick={() => setCurrentTheme("ps5")}
                  >
                    <div className="theme-preview-box ps5-theme-preview">
                      <span className="preview-indicator"></span>
                      <div className="theme-mini-logo">PS5</div>
                      <div className="theme-color-dots">
                        <span style={{ background: "#0072CE" }}></span>
                        <span style={{ background: "#ffffff" }}></span>
                        <span style={{ background: "#0a0a0c" }}></span>
                      </div>
                    </div>
                    <div className="theme-card-title">PlayStation 5</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="playnite-edit-footer">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setSettingsOpen(false)}
          >
            Fechar [ESC]
          </button>
        </div>
      </GamepadModal>

      {/* Options Menu Modal */}
      {optionsMenuGame && (
        <div className="options-overlay" onClick={() => setOptionsMenuGame(null)}>
          <div className="options-card" onClick={(e) => e.stopPropagation()}>
            <div className="options-header">
              <span className="options-subtitle">Opções de Jogo</span>
              <h2 className="options-title">{optionsMenuGame.name}</h2>
            </div>

            <div className="options-list">
              <button
                className={`options-btn play-btn ${optionsMenuSelectedIndex === 0 ? "focused" : ""}`}
                onClick={() => triggerOption("play", optionsMenuGame)}
                onMouseEnter={() => setOptionsMenuSelectedIndex(0)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Iniciar Jogo
              </button>

              {optionsMenuGame.isCustom ? (
                <>
                  <button
                    className={`options-btn edit-btn ${optionsMenuSelectedIndex === 1 ? "focused" : ""}`}
                    onClick={() => triggerOption("edit", optionsMenuGame)}
                    onMouseEnter={() => setOptionsMenuSelectedIndex(1)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    Editar
                  </button>

                  <button
                    className={`options-btn delete-btn ${optionsMenuSelectedIndex === 2 ? "focused" : ""}`}
                    onClick={() => triggerOption("delete", optionsMenuGame)}
                    onMouseEnter={() => setOptionsMenuSelectedIndex(2)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    Excluir
                  </button>

                  <button
                    className={`options-btn cancel-btn ${optionsMenuSelectedIndex === 3 ? "focused" : ""}`}
                    onClick={() => triggerOption("cancel", optionsMenuGame)}
                    onMouseEnter={() => setOptionsMenuSelectedIndex(3)}
                  >
                    Voltar
                  </button>
                </>
              ) : (
                <button
                  className={`options-btn cancel-btn ${optionsMenuSelectedIndex === 1 ? "focused" : ""}`}
                  onClick={() => triggerOption("cancel", optionsMenuGame)}
                  onMouseEnter={() => setOptionsMenuSelectedIndex(1)}
                >
                  Voltar
                </button>
              )}
            </div>

            {gamepadConnected && (
              <div className="modal-gamepad-hints">
                <span className="yt-hint"><span className="yt-hint-key">D-Pad ↕</span> Navegar</span>
                <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "✕" : "A"}</span> Confirmar</span>
                <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "○" : "B"}</span> Voltar</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Game Modal */}
      <GamepadModal
        isOpen={editingGame !== null}
        onClose={() => setEditingGame(null)}
        title={editingGame ? `Editar - ${editingGame.name}` : ""}
        tabs={[
          { id: "general", label: "Geral" },
          { id: "advanced", label: "Avançado" },
          { id: "media", label: "Mídia" },
        ]}
        activeTab={editTab}
        onTabChange={(tabId) => setEditTab(tabId as any)}
      >
        {editingGame && (
          <form className="playnite-edit-form" onSubmit={handleEditCustomGameSubmit}>
            <div className="playnite-tab-content">
              {editTab === "general" && (
                <div className="playnite-tab-pane">
                  <div className="playnite-group">
                    <div className="playnite-group-title">Informações Básicas</div>
                    <div className="playnite-form-grid">
                      <div className="playnite-field full-width">
                        <label>Nome do Jogo *</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            placeholder="Ex: Cyberpunk 2077"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="playnite-field">
                        <label>Plataforma</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            value={editingGame.isCustom ? "Manual (PC)" : "Steam"}
                            readOnly
                          />
                        </div>
                      </div>

                      <div className="playnite-field">
                        <label>ID do Jogo</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            value={editingGame.appid}
                            readOnly
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="playnite-group">
                    <div className="playnite-group-title">Instalação</div>
                    <div className="playnite-form-grid">
                      <div className="playnite-field full-width">
                        <label>Arquivo Executável *</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            placeholder="Escolha o arquivo .exe do jogo"
                            value={editExe}
                            onChange={(e) => setEditExe(e.target.value)}
                            required
                            readOnly
                          />
                          <button type="button" className="btn-secondary" onClick={handleEditPickExe}>
                            Buscar
                          </button>
                        </div>
                      </div>

                      <div className="playnite-field full-width">
                        <label>Pasta de Instalação</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            value={editingGame.installdir || "Não especificada"}
                            readOnly
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editTab === "advanced" && (
                <div className="playnite-tab-pane">
                  <div className="playnite-group">
                    <div className="playnite-group-title">Rastreamento & Execução</div>
                    <div className="playnite-form-grid">
                      <div className="playnite-field full-width">
                        <label>Argumentos de Inicialização</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            placeholder="Ex: -windowed -noborder"
                            disabled
                          />
                        </div>
                      </div>

                      <div className="playnite-field full-width">
                        <label>Diretório de Trabalho (Auto)</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            value={editExe ? editExe.substring(0, editExe.lastIndexOf("\\")) : "Automático"}
                            readOnly
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="playnite-group">
                    <div className="playnite-group-title">Estatísticas</div>
                    <div className="playnite-form-grid">
                      <div className="playnite-field">
                        <label>Tempo Total Jogado</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            value={playtimes[editingGame.appid]?.formatted || "0h 0m"}
                            readOnly
                          />
                        </div>
                      </div>

                      <div className="playnite-field">
                        <label>Último Acesso</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            value={editingGame.last_played ? new Date(editingGame.last_played).toLocaleString() : "Nunca jogado"}
                            readOnly
                          />
                        </div>
                      </div>

                      <div className="playnite-field full-width">
                        <label>Data Adicionado à Biblioteca</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            value={editingGame.added_at ? new Date(editingGame.added_at).toLocaleString() : "Desconhecido"}
                            readOnly
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editTab === "media" && (
                <div className="playnite-tab-pane">
                  <div className="playnite-group">
                    <div className="playnite-group-title">Arquivos de Mídia</div>
                    <div className="playnite-form-grid">
                      <div className="playnite-field full-width">
                        <label>Imagem da Capa (Local ou URL)</label>
                        <div className="playnite-input-wrapper">
                          <input
                            type="text"
                            placeholder="Caminho da imagem local ou URL da capa"
                            value={editImg}
                            onChange={(e) => setEditImg(e.target.value)}
                          />
                          <button type="button" className="btn-secondary" onClick={handleEditPickImg}>
                            Buscar
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={handleSearchIgdbForEdit}
                            disabled={editingSearchingIgdb}
                          >
                            {editingSearchingIgdb ? "Buscando..." : "IGDB"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="playnite-media-previews">
                      <div className="playnite-media-preview-box">
                        <span className="preview-label">Visualização Capa</span>
                        <div className="preview-image-container">
                          {editImg ? (
                            <img
                              src={editImg.startsWith("http") || editImg.startsWith("data:") ? editImg : convertFileSrc(editImg)}
                              alt="Capa"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "";
                              }}
                            />
                          ) : (
                            <div className="preview-placeholder">Sem Capa</div>
                          )}
                        </div>
                      </div>

                      <div className="playnite-media-preview-box disabled">
                        <span className="preview-label">Background (Indisponível)</span>
                        <div className="preview-image-container placeholder">
                          <div className="preview-placeholder">Sem Imagem</div>
                        </div>
                      </div>

                      <div className="playnite-media-preview-box disabled">
                        <span className="preview-label">Ícone (Indisponível)</span>
                        <div className="preview-image-container placeholder icon">
                          <div className="preview-placeholder">Sem Ícone</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="playnite-edit-footer">
              <button type="button" className="btn-secondary" onClick={() => setEditingGame(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={editingSearchingIgdb}>
                {editingSearchingIgdb ? "Buscando Capa..." : "Salvar Alterações"}
              </button>
            </div>
          </form>
        )}
      </GamepadModal>

      {/* Xbox-Style Add Game Modal using GamepadModal */}
      <GamepadModal
        isOpen={addGameModalOpen}
        onClose={() => setAddGameModalOpen(false)}
        title="Adicionar Jogo à Biblioteca"
        className="add-game-card"
      >
        <div className="add-game-layout">
          {/* Left Column: Installed Apps List & Disk Filter Chips */}
          <div className="add-game-list-section">
            {/* Horizontal Filter Chips Bar */}
            <div className="disk-filter-chips-bar">
              <button
                type="button"
                className={`disk-filter-pill ${
                  availableDrives.length > 0 && availableDrives.every((d) => selectedDrives[d] !== false) ? "active" : ""
                }`}
                onClick={() => {
                  const allActive = availableDrives.every((d) => selectedDrives[d] !== false);
                  const updated: Record<string, boolean> = {};
                  availableDrives.forEach((d) => {
                    updated[d] = !allActive;
                  });
                  setSelectedDrives(updated);
                }}
              >
                Todos Discos
              </button>

              {availableDrives.map((drive) => {
                const isEnabled = selectedDrives[drive] !== false;
                return (
                  <button
                    key={drive}
                    type="button"
                    className={`disk-filter-pill ${isEnabled ? "active" : ""}`}
                    onClick={() => {
                      setSelectedDrives((prev) => ({
                        ...prev,
                        [drive]: !isEnabled,
                      }));
                    }}
                  >
                    Disco {drive}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
              <div className="search-wrapper" style={{ flex: 1, position: "relative" }}>
                <input
                  id="add-game-search-input"
                  type="text"
                  placeholder="Pesquisar jogos instalados..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setDetectedSelectedIndex(0);
                  }}
                  className={addGameSelectedIndex === 0 ? "focused" : ""}
                />
                <span className="search-icon-hint">🔍</span>
              </div>

              <button
                id="add-game-manual-browse-btn"
                type="button"
                title="Procurar pasta do jogo manualmente"
                className={`btn-secondary browse-folder-btn ${addGameSelectedIndex === 1 ? "focused" : ""}`}
                onClick={handlePickExe}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            </div>

            <div className="detected-apps-list" ref={detectedListRef}>
              {loadingApps ? (
                <div className="apps-list-empty">Buscando jogos instalados no PC...</div>
              ) : (() => {
                const fApps = installedApps.filter((app) => {
                  const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase());
                  if (!matchesSearch) return false;
                  const appPathUpper = app.path.toUpperCase();
                  const activeDrives = Object.keys(selectedDrives).filter((d) => selectedDrives[d] !== false);
                  if (activeDrives.length === 0) return false;
                  return activeDrives.some((d) => appPathUpper.startsWith(d.toUpperCase()));
                });
                if (fApps.length === 0) {
                  return <div className="apps-list-empty">Nenhum jogo encontrado para os discos ativos.</div>;
                }
                return fApps.map((app, index) => {
                  const isSelected = addGameSelectedIndex === 2 && detectedSelectedIndex === index;
                  return (
                    <div
                      key={app.path + "-" + index}
                      id={`detected-app-item-${index}`}
                      tabIndex={0}
                      className={`detected-app-item ${isSelected ? "focused" : ""}`}
                      onClick={() => {
                        setCustomName(app.name);
                        setCustomExe(app.path);
                        setAddGameSelectedIndex(7);
                      }}
                    >
                      <div className="app-icon-placeholder">🎮</div>
                      <div className="app-info">
                        <span className="app-name">{app.name}</span>
                        <span className="app-path" title={app.path}>{app.path}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Right Column: Selected Game Preview & Confirmation */}
          <div className="add-game-form-section">
            <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div className="playnite-group" style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div className="playnite-group-title" style={{ color: "var(--accent-cyan)", marginBottom: "0.75rem" }}>
                    Jogo Selecionado
                  </div>
                  {customExe ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", background: "rgba(0, 0, 0, 0.25)", padding: "1.25rem", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div style={{ width: "48px", height: "48px", borderRadius: "8px", background: "rgba(6, 182, 212, 0.15)", border: "1px solid var(--accent-cyan)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem" }}>
                          🎮
                        </div>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#ffffff", display: "block" }}>{customName}</span>
                          <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", fontWeight: 600 }}>Pronto para Adicionar</span>
                        </div>
                      </div>

                      <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Caminho Executável:</span>
                        <span style={{ fontSize: "0.75rem", color: "#ffffff", wordBreak: "break-all", fontFamily: "monospace", background: "rgba(0,0,0,0.3)", padding: "0.4rem 0.6rem", borderRadius: "6px" }}>{customExe}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2.5rem 1rem", background: "rgba(0, 0, 0, 0.2)", borderRadius: "12px", border: "1px dashed rgba(255, 255, 255, 0.15)", textAlign: "center", gap: "0.75rem" }}>
                      <span style={{ fontSize: "2rem" }}>🎯</span>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        Selecione um jogo na lista à esquerda ou use a busca para encontrar seu jogo instalados no PC.
                      </span>
                    </div>
                  )}
                </div>

                <form onSubmit={handleAddCustomGameSubmit} style={{ marginTop: "1.5rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button
                      id="add-game-cancel-btn"
                      type="button"
                      className="btn-secondary"
                      onClick={() => setAddGameModalOpen(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      id="add-game-submit-btn"
                      type="submit"
                      className="btn-primary"
                      disabled={!customExe}
                    >
                      + Adicionar à Biblioteca
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </GamepadModal>

      {/* File Explorer Modal */}
      {fileExplorerOpen && (
        <div className="settings-overlay file-explorer-overlay" onClick={() => setFileExplorerOpen(false)}>
          <div className="settings-card file-explorer-card" onClick={(e) => e.stopPropagation()}>
            <h2>Explorador de Arquivos Atlas</h2>

            <div className="file-explorer-header-bar">
              <div className="file-explorer-path-bar">
                <span>Caminho:</span>
                <strong>{fileExplorerPath || "Meu Computador (Unidades de Disco)"}</strong>
              </div>

              {availableDrives.length > 0 && (
                <div className="drive-selector-bar">
                  <span className="drive-selector-label">Mudar Disco:</span>
                  <button
                    type="button"
                    className={`drive-pill ${fileExplorerPath === "" ? "active" : ""}`}
                    onClick={() => navigateToPath("")}
                  >
                    💾 Todos Discos
                  </button>
                  {availableDrives.map((drive) => (
                    <button
                      key={drive}
                      type="button"
                      className={`drive-pill ${fileExplorerPath.toUpperCase().startsWith(drive.toUpperCase()) ? "active" : ""}`}
                      onClick={() => navigateToPath(drive)}
                    >
                      💾 {drive}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              className="file-explorer-list"
              ref={fileExplorerListRef}
            >
              {fileExplorerItems.length === 0 ? (
                <div className="file-explorer-empty">Nenhum arquivo ou pasta compatível encontrado nesta pasta.</div>
              ) : (
                fileExplorerItems.map((item, index) => {
                  const isSelected = fileExplorerSelectedIndex === index;
                  let icon = "📁";
                  if (item.path === "..") {
                    icon = "↩️";
                  } else if (!item.is_dir) {
                    const ext = item.path.split('.').pop()?.toLowerCase();
                    if (ext === "exe" || ext === "sh" || ext === "bin") {
                      icon = "🎮";
                    } else if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) {
                      icon = "🖼️";
                    } else {
                      icon = "📄";
                    }
                  } else if (fileExplorerPath === "") {
                    icon = "💾";
                  }

                  return (
                    <div
                      key={item.path + "-" + index}
                      id={`file-explorer-item-${index}`}
                      tabIndex={0}
                      className={`file-explorer-item ${isSelected ? "focused" : ""}`}
                      onClick={() => handleFileExplorerSelect(item)}
                    >
                      <span className="file-explorer-icon">{icon}</span>
                      <span className="file-explorer-name">{item.name}</span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="settings-footer" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setFileExplorerOpen(false)}
              >
                Fechar
              </button>
            </div>

            {gamepadConnected && (
              <div className="modal-gamepad-hints" style={{ marginTop: "1.25rem" }}>
                <span className="yt-hint"><span className="yt-hint-key">⇅</span> Navegar</span>
                <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "✕" : "A"}</span> Entrar / Selecionar</span>
                <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "○" : "B"}</span> Voltar</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
