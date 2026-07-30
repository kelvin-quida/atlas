import { useState, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

interface SteamGame {
  appid: string;
  name: string;
  installdir: string;
  library_path: string;
  image_url: string;
  isCustom?: boolean;
  exe_path?: string;
}

// Gorgeous mock games to display in dev environment or if Steam isn't installed
const MOCK_GAMES: SteamGame[] = [
  {
    appid: "1086940",
    name: "Baldur's Gate 3",
    installdir: "Baldurs Gate 3",
    library_path: "C:\\Program Files (x86)\\Steam",
    image_url: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1086940/library_600x900.jpg"
  },
  {
    appid: "1091500",
    name: "Cyberpunk 2077",
    installdir: "Cyberpunk 2077",
    library_path: "C:\\Program Files (x86)\\Steam",
    image_url: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1091500/library_600x900.jpg"
  },
  {
    appid: "1245620",
    name: "Elden Ring",
    installdir: "ELDEN RING",
    library_path: "C:\\Program Files (x86)\\Steam",
    image_url: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1245620/library_600x900.jpg"
  },
  {
    appid: "1145360",
    name: "Hades",
    installdir: "Hades",
    library_path: "C:\\Program Files (x86)\\Steam",
    image_url: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1145360/library_600x900.jpg"
  },
  {
    appid: "774361",
    name: "Hollow Knight",
    installdir: "Hollow Knight",
    library_path: "C:\\Program Files (x86)\\Steam",
    image_url: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/774361/library_600x900.jpg"
  },
  {
    appid: "620",
    name: "Portal 2",
    installdir: "Portal 2",
    library_path: "C:\\Program Files (x86)\\Steam",
    image_url: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/620/library_600x900.jpg"
  }
];

function App() {
  const [steamGames, setSteamGames] = useState<SteamGame[]>([]);
  const [customGames, setCustomGames] = useState<SteamGame[]>([]);
  const [games, setGames] = useState<SteamGame[]>([]);
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSimulated, setIsSimulated] = useState(false);
  const [launchingGame, setLaunchingGame] = useState<SteamGame | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"geral" | "custom" | "aparencia">("geral");
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return localStorage.getItem("atlas_theme") || "atlas";
  });
  const [shellEnabled, setShellEnabled] = useState(false);
  const [systemTime, setSystemTime] = useState("");
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [youtubeActive, setYoutubeActive] = useState(false);

  // States for settings navigation
  const [settingsFocusArea, setSettingsFocusArea] = useState<"tabs" | "content" | "footer">("tabs");
  const [settingsSelectedIndex, setSettingsSelectedIndex] = useState(0);

  // Reset settings focus states when modal opens
  useEffect(() => {
    if (settingsOpen) {
      setSettingsFocusArea("tabs");
      setSettingsSelectedIndex(0);
    }
  }, [settingsOpen]);

  // Reset settings index when tab changes
  useEffect(() => {
    setSettingsSelectedIndex(0);
  }, [settingsTab]);

  // Programmatic HTML element focusing based on current settings selection
  useEffect(() => {
    if (!settingsOpen) return;

    let elementToFocus: HTMLElement | null = null;

    if (settingsFocusArea === "tabs") {
      if (settingsTab === "geral") {
        elementToFocus = document.getElementById("settings-tab-geral");
      } else if (settingsTab === "custom") {
        elementToFocus = document.getElementById("settings-tab-custom");
      } else if (settingsTab === "aparencia") {
        elementToFocus = document.getElementById("settings-tab-aparencia");
      }
    } else if (settingsFocusArea === "footer") {
      elementToFocus = document.getElementById("settings-close-btn");
    } else if (settingsFocusArea === "content") {
      if (settingsTab === "geral") {
        if (settingsSelectedIndex === 0) {
          elementToFocus = document.getElementById("geral-shell-toggle-input");
        } else if (settingsSelectedIndex === 1) {
          elementToFocus = document.getElementById("geral-recarregar-btn");
        }
      } else if (settingsTab === "aparencia") {
        if (settingsSelectedIndex === 0) {
          elementToFocus = document.getElementById("theme-card-atlas");
        } else if (settingsSelectedIndex === 1) {
          elementToFocus = document.getElementById("theme-card-ps5");
        }
      } else if (settingsTab === "custom") {
        if (settingsSelectedIndex === 0) {
          elementToFocus = document.getElementById("settings-add-custom-game-btn");
        } else {
          const deleteIdx = settingsSelectedIndex - 1;
          elementToFocus = document.getElementById(`custom-delete-btn-${deleteIdx}`);
        }
      }
    }

    if (elementToFocus) {
      elementToFocus.focus();
    }
  }, [settingsOpen, settingsTab, settingsFocusArea, settingsSelectedIndex]);

  // States for options menu and editing
  const [optionsMenuGame, setOptionsMenuGame] = useState<SteamGame | null>(null);
  const [optionsMenuSelectedIndex, setOptionsMenuSelectedIndex] = useState(0);
  const [editingGame, setEditingGame] = useState<SteamGame | null>(null);
  const [editName, setEditName] = useState("");
  const [editExe, setEditExe] = useState("");
  const [editImg, setEditImg] = useState("");

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

  // Xbox-Style Add Game Modal States
  const [addGameModalOpen, setAddGameModalOpen] = useState(false);
  const [installedApps, setInstalledApps] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [detectedSelectedIndex, setDetectedSelectedIndex] = useState(0);
  const [addGameSelectedIndex, setAddGameSelectedIndex] = useState(0);

  const carouselRef = useRef<HTMLDivElement>(null);
  const lastInputTime = useRef<number>(0);
  const cooldown = 200; // ms

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
    settingsFocusArea,
    settingsSelectedIndex,
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
      settingsFocusArea,
      settingsSelectedIndex,
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
  }, [games, selectedGameIndex, settingsOpen, launchingGame, loading, youtubeActive, optionsMenuGame, optionsMenuSelectedIndex, editingGame, customGames, focusArea, headerSelectedIndex, settingsFocusArea, settingsSelectedIndex, settingsTab, currentTheme, fileExplorerOpen, fileExplorerSelectedIndex, fileExplorerItems, addGameModalOpen, addGameSelectedIndex, detectedSelectedIndex, installedApps, searchQuery]);

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


  // Load installed Steam games
  const loadGames = async () => {
    setLoading(true);
    try {
      const list = await invoke<SteamGame[]>("get_installed_games");
      if (list && list.length > 0) {
        setSteamGames(list);
        setIsSimulated(false);
      } else {
        setSteamGames(MOCK_GAMES);
        setIsSimulated(true);
      }
    } catch (err) {
      console.warn("Failed to contact Tauri backend, falling back to mock library.", err);
      setSteamGames(MOCK_GAMES);
      setIsSimulated(true);
    } finally {
      setLoading(false);
    }
  };

  // Load custom games from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("atlas_custom_games");
    if (saved) {
      try {
        setCustomGames(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse custom games:", e);
      }
    }
  }, []);

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

  const handlePickImg = () => {
    openFileExplorer(["png", "jpg", "jpeg", "webp"], (path) => {
      setCustomImg(path);
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

  const handleAddCustomGameSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customName || !customExe) {
      alert("Por favor, preencha pelo menos o Nome e o Executável.");
      return;
    }

    const newGame: SteamGame = {
      appid: `custom-${Date.now()}`,
      name: customName,
      installdir: "",
      library_path: "",
      image_url: customImg,
      isCustom: true,
      exe_path: customExe
    };

    const updated = [...customGames, newGame];
    setCustomGames(updated);
    localStorage.setItem("atlas_custom_games", JSON.stringify(updated));

    // Reset form
    setCustomName("");
    setCustomExe("");
    setCustomImg("");
    setAddGameModalOpen(false);
  };

  const handleDeleteCustomGame = (appid: string) => {
    const updated = customGames.filter((g) => g.appid !== appid);
    setCustomGames(updated);
    localStorage.setItem("atlas_custom_games", JSON.stringify(updated));
  };

  const handleEditCustomGameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGame) return;
    if (!editName || !editExe) {
      alert("Por favor, preencha pelo menos o Nome e o Executável.");
      return;
    }

    const updated = customGames.map((g) => {
      if (g.appid === editingGame.appid) {
        return {
          ...g,
          name: editName,
          exe_path: editExe,
          image_url: editImg
        };
      }
      return g;
    });

    setCustomGames(updated);
    localStorage.setItem("atlas_custom_games", JSON.stringify(updated));
    setEditingGame(null);
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
      if (settingsOpen || launchingGame || loading || optionsMenuGame || editingGame) return;

      if (youtubeActive) {
        if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          handleCloseYouTube();
        }
        return;
      }

      if (games.length === 0) return;

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

  // Keyboard navigation for settings
  useEffect(() => {
    const handleSettingsKeys = (e: KeyboardEvent) => {
      if (!settingsOpen) return;
      if (e.key === "Escape" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSettingsOpen(false);
        return;
      }

      if (e.key === "Enter") {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
          // If it's a text input, let default Enter behavior happen (form submission, etc.)
          if (!(active instanceof HTMLInputElement && active.type === "text")) {
            e.preventDefault();
            active.click();
            return;
          }
        }
      }

      if (settingsFocusArea === "tabs") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setSettingsTab((prev) => {
            if (prev === "geral") return "aparencia";
            if (prev === "custom") return "geral";
            return "custom";
          });
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setSettingsTab((prev) => {
            if (prev === "geral") return "custom";
            if (prev === "custom") return "aparencia";
            return "geral";
          });
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setSettingsFocusArea("content");
          setSettingsSelectedIndex(0);
        }
      } else if (settingsFocusArea === "content") {
        if (settingsTab === "geral") {
          // 0: Shell toggle, 1: Recarregar
          if (e.key === "ArrowUp") {
            e.preventDefault();
            if (settingsSelectedIndex === 0) {
              setSettingsFocusArea("tabs");
            } else {
              setSettingsSelectedIndex(0);
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (settingsSelectedIndex === 1) {
              setSettingsFocusArea("footer");
            } else {
              setSettingsSelectedIndex(1);
            }
          }
        } else if (settingsTab === "aparencia") {
          // 0: Atlas card, 1: PS5 card
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setSettingsSelectedIndex(0);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setSettingsSelectedIndex(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSettingsFocusArea("tabs");
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSettingsFocusArea("footer");
          }
        } else if (settingsTab === "custom") {
          const maxIdx = customGames.length;
          if (e.key === "ArrowUp") {
            e.preventDefault();
            if (settingsSelectedIndex === 0) {
              setSettingsFocusArea("tabs");
            } else {
              setSettingsSelectedIndex((prev) => prev - 1);
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (settingsSelectedIndex >= maxIdx) {
              setSettingsFocusArea("footer");
            } else {
              setSettingsSelectedIndex((prev) => prev + 1);
            }
          }
        }
      } else if (settingsFocusArea === "footer") {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSettingsFocusArea("content");
          if (settingsTab === "geral") {
            setSettingsSelectedIndex(1);
          } else if (settingsTab === "aparencia") {
            setSettingsSelectedIndex(currentTheme === "ps5" ? 1 : 0);
          } else if (settingsTab === "custom") {
            setSettingsSelectedIndex(customGames.length);
          }
        }
      }
    };
    window.addEventListener("keydown", handleSettingsKeys);
    return () => window.removeEventListener("keydown", handleSettingsKeys);
  }, [settingsOpen, settingsFocusArea, settingsSelectedIndex, settingsTab, customGames, currentTheme]);

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

  // Gamepad Connection Listeners
  useEffect(() => {
    const handleConnected = (e: GamepadEvent) => {
      console.log("Gamepad connected:", e.gamepad);
      setGamepadConnected(true);
    };

    const handleDisconnected = (e: GamepadEvent) => {
      console.log("Gamepad disconnected:", e.gamepad);
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      const hasAny = Array.from(gps).some((gp) => gp !== null);
      setGamepadConnected(hasAny);
    };

    window.addEventListener("gamepadconnected", handleConnected);
    window.addEventListener("gamepaddisconnected", handleDisconnected);

    // Initial check
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const hasAny = Array.from(gps).some((gp) => gp !== null);
    setGamepadConnected(hasAny);

    return () => {
      window.removeEventListener("gamepadconnected", handleConnected);
      window.removeEventListener("gamepaddisconnected", handleDisconnected);
    };
  }, []);

  // Gamepad Polling Loop (continuous 60 FPS scan)
  useEffect(() => {
    let animationFrameId: number;

    const pollGamepad = () => {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = Array.from(gps).find((g) => g !== null);

      if (gp) {
        const now = Date.now();
        if (now - lastInputTime.current > cooldown) {
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
            settingsFocusArea: sFocusArea,
            settingsSelectedIndex: sSelectedIndex,
            settingsTab: sTab,
            currentTheme: sCurrentTheme,
            customGames: sCustomGames,
            fileExplorerOpen: isFileExplorerOpen,
            fileExplorerSelectedIndex: fileExplorerIdx,
            fileExplorerItems: fileExplorerItms,
            addGameModalOpen: isAddGameOpen,
            addGameSelectedIndex: addGameIdx,
            detectedSelectedIndex: detectedIdx,
            installedApps: instApps,
            searchQuery: sQuery
          } = stateRef.current;

          if (!isLoading && !isLaunching) {
            let inputTriggered = false;

            // Standard layout mappings
            const btnA = gp.buttons[0]?.pressed; // Confirm / Play
            const btnB = gp.buttons[1]?.pressed; // Back / Close Settings
            const btnY = gp.buttons[3]?.pressed; // Open YouTube
            const btnStart = gp.buttons[9]?.pressed; // Start Button (Game Options)
            const btnSelect = gp.buttons[8]?.pressed; // Select Button (Atlas Settings)
            const dpadLeft = gp.buttons[14]?.pressed;
            const dpadRight = gp.buttons[15]?.pressed;
            const dpadUp = gp.buttons[12]?.pressed;
            const dpadDown = gp.buttons[13]?.pressed;
            const stickX = gp.axes[0]; // Left stick horizontal axis
            const stickY = gp.axes[1]; // Left stick vertical axis

            if (isYoutubeActive) {
              // ── Full YouTube gamepad control ──
              const btnX = gp.buttons[2]?.pressed;
              const btnLB = gp.buttons[4]?.pressed;
              const btnRB = gp.buttons[5]?.pressed;
              const triggerLT = gp.buttons[6]?.value ?? 0;
              const triggerRT = gp.buttons[7]?.value ?? 0;
              const btnStartYT = gp.buttons[9]?.pressed;

              const sendAction = (action: string) => {
                invoke("youtube_gamepad_action", { action }).catch(console.error);
                inputTriggered = true;
              };

              if (btnStartYT) {
                // Start = close YouTube, back to launcher
                handleCloseYouTube();
                inputTriggered = true;
              } else if (dpadUp) {
                sendAction("navigate_up");
              } else if (dpadDown) {
                sendAction("navigate_down");
              } else if (dpadLeft) {
                sendAction("navigate_left");
              } else if (dpadRight) {
                sendAction("navigate_right");
              } else if (btnA) {
                sendAction("click");
              } else if (btnB) {
                sendAction("back");
              } else if (btnX) {
                sendAction("fullscreen");
              } else if (btnY) {
                sendAction("play_pause");
              } else if (btnLB) {
                sendAction("seek_back");
              } else if (btnRB) {
                sendAction("seek_forward");
              } else if (triggerLT > 0.5) {
                sendAction("volume_down");
              } else if (triggerRT > 0.5) {
                sendAction("volume_up");
              } else if (stickY < -0.6) {
                sendAction("scroll_up");
              } else if (stickY > 0.6) {
                sendAction("scroll_down");
              }
            } else if (isFileExplorerOpen) {
              if (dpadUp || stickY < -0.5) {
                setFileExplorerSelectedIndex((prev) => (prev > 0 ? prev - 1 : fileExplorerItms.length - 1));
                inputTriggered = true;
              } else if (dpadDown || stickY > 0.5) {
                setFileExplorerSelectedIndex((prev) => (prev < fileExplorerItms.length - 1 ? prev + 1 : 0));
                inputTriggered = true;
              } else if (btnA) {
                const selectedItem = fileExplorerItms[fileExplorerIdx];
                if (selectedItem) {
                  handleFileExplorerSelectRef.current?.(selectedItem);
                }
                inputTriggered = true;
              } else if (btnB) {
                setFileExplorerOpen(false);
                inputTriggered = true;
              }
            } else if (isAddGameOpen) {
              const fApps = instApps.filter((app: any) => app.name.toLowerCase().includes(sQuery.toLowerCase()));
              if (btnB) {
                setAddGameModalOpen(false);
                inputTriggered = true;
              } else if (addGameIdx === 2) {
                if (dpadUp || stickY < -0.5) {
                  if (detectedIdx > 0) {
                    setDetectedSelectedIndex(detectedIdx - 1);
                  } else {
                    setAddGameSelectedIndex(0);
                  }
                  inputTriggered = true;
                } else if (dpadDown || stickY > 0.5) {
                  if (detectedIdx < fApps.length - 1) {
                    setDetectedSelectedIndex(detectedIdx + 1);
                  } else {
                    setAddGameSelectedIndex(3);
                  }
                  inputTriggered = true;
                } else if (btnA) {
                  const app = fApps[detectedIdx];
                  if (app) {
                    setCustomName(app.name);
                    setCustomExe(app.path);
                    setAddGameSelectedIndex(7);
                  }
                  inputTriggered = true;
                }
              } else {
                if (dpadUp || stickY < -0.5) {
                  setAddGameSelectedIndex((prev) => {
                    if (prev === 0) return 8;
                    if (prev === 3) return fApps.length > 0 ? 2 : 0;
                    return prev - 1;
                  });
                  inputTriggered = true;
                } else if (dpadDown || stickY > 0.5) {
                  setAddGameSelectedIndex((prev) => {
                    if (prev === 8) return 0;
                    if (prev === 0 || prev === 1) return fApps.length > 0 ? 2 : 3;
                    if (prev === 2) return 3;
                    return prev + 1;
                  });
                  inputTriggered = true;
                } else if (dpadLeft || stickX < -0.5) {
                  if (addGameIdx === 1) {
                    setAddGameSelectedIndex(0);
                    inputTriggered = true;
                  } else if (addGameIdx === 8) {
                    setAddGameSelectedIndex(7);
                    inputTriggered = true;
                  }
                } else if (dpadRight || stickX > 0.5) {
                  if (addGameIdx === 0) {
                    setAddGameSelectedIndex(1);
                    inputTriggered = true;
                  } else if (addGameIdx === 7) {
                    setAddGameSelectedIndex(8);
                    inputTriggered = true;
                  }
                } else if (btnA) {
                  const active = document.activeElement;
                  if (active instanceof HTMLElement) {
                    if (!(active instanceof HTMLInputElement && active.type === "text")) {
                      active.click();
                      inputTriggered = true;
                    }
                  }
                }
              }
            } else if (isEditing) {
              if (btnB) {
                setEditingGame(null);
                inputTriggered = true;
              }
            } else if (isSettingsOpen) {
              if (btnB) {
                setSettingsOpen(false);
                inputTriggered = true;
              } else if (btnA) {
                const active = document.activeElement;
                if (active instanceof HTMLElement) {
                  // If it's a text input, let default behavior handle typing focus, don't trigger click
                  if (!(active instanceof HTMLInputElement && active.type === "text")) {
                    active.click();
                    inputTriggered = true;
                  }
                }
              } else if (sFocusArea === "tabs") {
                if (dpadLeft || stickX < -0.5) {
                  setSettingsTab((prev) => {
                    if (prev === "geral") return "aparencia";
                    if (prev === "custom") return "geral";
                    return "custom";
                  });
                  inputTriggered = true;
                } else if (dpadRight || stickX > 0.5) {
                  setSettingsTab((prev) => {
                    if (prev === "geral") return "custom";
                    if (prev === "custom") return "aparencia";
                    return "geral";
                  });
                  inputTriggered = true;
                } else if (dpadDown || stickY > 0.5) {
                  setSettingsFocusArea("content");
                  setSettingsSelectedIndex(0);
                  inputTriggered = true;
                }
              } else if (sFocusArea === "content") {
                if (sTab === "geral") {
                  if (dpadUp || stickY < -0.5) {
                    if (sSelectedIndex === 0) {
                      setSettingsFocusArea("tabs");
                    } else {
                      setSettingsSelectedIndex(0);
                    }
                    inputTriggered = true;
                  } else if (dpadDown || stickY > 0.5) {
                    if (sSelectedIndex === 1) {
                      setSettingsFocusArea("footer");
                    } else {
                      setSettingsSelectedIndex(1);
                    }
                    inputTriggered = true;
                  }
                } else if (sTab === "aparencia") {
                  if (dpadLeft || stickX < -0.5) {
                    setSettingsSelectedIndex(0);
                    inputTriggered = true;
                  } else if (dpadRight || stickX > 0.5) {
                    setSettingsSelectedIndex(1);
                    inputTriggered = true;
                  } else if (dpadUp || stickY < -0.5) {
                    setSettingsFocusArea("tabs");
                    inputTriggered = true;
                  } else if (dpadDown || stickY > 0.5) {
                    setSettingsFocusArea("footer");
                    inputTriggered = true;
                  }
                } else if (sTab === "custom") {
                  const maxIdx = sCustomGames.length;
                  if (dpadUp || stickY < -0.5) {
                    if (sSelectedIndex === 0) {
                      setSettingsFocusArea("tabs");
                    } else {
                      setSettingsSelectedIndex((prev) => prev - 1);
                    }
                    inputTriggered = true;
                  } else if (dpadDown || stickY > 0.5) {
                    if (sSelectedIndex >= maxIdx) {
                      setSettingsFocusArea("footer");
                    } else {
                      setSettingsSelectedIndex((prev) => prev + 1);
                    }
                    inputTriggered = true;
                  }
                }
              } else if (sFocusArea === "footer") {
                if (dpadUp || stickY < -0.5) {
                  setSettingsFocusArea("content");
                  if (sTab === "geral") {
                    setSettingsSelectedIndex(1);
                  } else if (sTab === "aparencia") {
                    setSettingsSelectedIndex(sCurrentTheme === "ps5" ? 1 : 0);
                  } else if (sTab === "custom") {
                    setSettingsSelectedIndex(sCustomGames.length);
                  }
                  inputTriggered = true;
                }
              }
            } else if (isOptionsMenuOpen) {
              const availableOptions = isOptionsMenuOpen.isCustom 
                ? ["play", "edit", "delete", "cancel"]
                : ["play", "cancel"];

              if (dpadUp || stickY < -0.5) {
                setOptionsMenuSelectedIndex((prev) => (prev > 0 ? prev - 1 : availableOptions.length - 1));
                inputTriggered = true;
              } else if (dpadDown || stickY > 0.5) {
                setOptionsMenuSelectedIndex((prev) => (prev < availableOptions.length - 1 ? prev + 1 : 0));
                inputTriggered = true;
              } else if (btnA) {
                triggerOptionRef.current?.(availableOptions[selectedOptionIdx], isOptionsMenuOpen);
                inputTriggered = true;
              } else if (btnB) {
                setOptionsMenuGame(null);
                inputTriggered = true;
              }
            } else if (currentGames.length > 0) {
              if (focusArea === "carousel") {
                if (dpadLeft || stickX < -0.5) {
                  setSelectedGameIndex((prev) => (prev > 0 ? prev - 1 : currentGames.length - 1));
                  inputTriggered = true;
                } else if (dpadRight || stickX > 0.5) {
                  setSelectedGameIndex((prev) => (prev < currentGames.length - 1 ? prev + 1 : 0));
                  inputTriggered = true;
                } else if (dpadUp || stickY < -0.5) {
                  setFocusArea("header");
                  setHeaderSelectedIndex(0);
                  inputTriggered = true;
                } else if (btnA) {
                  if (currentGames[currentIndex]) {
                    handleTryLaunchGame(currentGames[currentIndex]);
                    inputTriggered = true;
                  }
                } else if (btnStart) {
                  if (currentGames[currentIndex]) {
                    handleTryLaunchGame(currentGames[currentIndex]);
                    inputTriggered = true;
                  }
                } else if (btnSelect) {
                  setSettingsOpen(true);
                  inputTriggered = true;
                } else if (btnY) {
                  handleOpenYouTube();
                  inputTriggered = true;
                }
              } else if (focusArea === "header") {
                if (dpadLeft || stickX < -0.5) {
                  setHeaderSelectedIndex((prev) => (prev > 0 ? prev - 1 : 1));
                  inputTriggered = true;
                } else if (dpadRight || stickX > 0.5) {
                  setHeaderSelectedIndex((prev) => (prev < 1 ? prev + 1 : 0));
                  inputTriggered = true;
                } else if (dpadDown || stickY > 0.5) {
                  setFocusArea("carousel");
                  inputTriggered = true;
                } else if (btnA) {
                  if (headerSelectedIndex === 0) {
                    handleOpenYouTube();
                  } else {
                    setSettingsOpen(true);
                  }
                  inputTriggered = true;
                } else if (btnB) {
                  setFocusArea("carousel");
                  inputTriggered = true;
                }
              }
            }

            if (inputTriggered) {
              lastInputTime.current = now;
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(pollGamepad);
    };

    animationFrameId = requestAnimationFrame(pollGamepad);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Image load helper
  const handleImageError = (appid: string) => {
    setImageErrors((prev) => ({ ...prev, [appid]: true }));
  };

  const activeGame = games[selectedGameIndex];

  // Resolve image source for local vs remote images
  const getGameImageUrl = (game: SteamGame) => {
    if (!game.image_url) return "";
    if (game.image_url.startsWith("http://") || game.image_url.startsWith("https://") || game.image_url.startsWith("data:")) {
      return game.image_url;
    }
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

  // Generate game-specific mock widgets for PS5 theme
  const getGameWidgets = (game: SteamGame) => {
    const name = game.name;
    if (name.includes("Baldur's Gate")) {
      return [
        { title: "Troféus", desc: "Ato III iniciado", value: "32%", progress: 32 },
        { title: "Atividades", desc: "Acampamento na taverna", value: "Aventura ativa" },
        { title: "Dica de Jogo", desc: "Descubra segredos de Baldur's Gate", value: "Dica do Ato 3" }
      ];
    }
    if (name.includes("Cyberpunk")) {
      return [
        { title: "Troféus", desc: "Cidade dos Sonhos", value: "48%", progress: 48 },
        { title: "Atividades", desc: "Trabalho Sujo com Rogue", value: "Missão pendente" },
        { title: "Colecionáveis", desc: "Tarôs encontrados: 14/22", value: "Ver mapa" }
      ];
    }
    if (name.includes("Elden Ring")) {
      return [
        { title: "Troféus", desc: "Lendário Lorde de Limgrave", value: "78%", progress: 78 },
        { title: "Atividades", desc: "Explorar Ruínas de Caelid", value: "Nível 105" },
        { title: "Chefes derrotados", desc: "Margit, Godrick, Radahn...", value: "5/15" }
      ];
    }
    if (name.includes("Hades")) {
      return [
        { title: "Fugas", desc: "Tentativas de fuga bem sucedidas: 14", value: "14 fugas" },
        { title: "Troféus", desc: "Sangue e Trevas", value: "90%", progress: 90 },
        { title: "Favor com Deuses", desc: "Néctares dados: 12/20", value: "Favor ativo" }
      ];
    }
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const completion = Math.abs(hash % 90) + 10;
    const hours = Math.abs(hash % 150) + 12;
    return [
      { title: "Troféus", desc: "Progresso da Campanha", value: `${completion}%`, progress: completion },
      { title: "Atividades", desc: "Retomar de onde parou", value: "Jogar agora" },
      { title: "Estatísticas", desc: "Tempo total registrado", value: `${hours} horas` }
    ];
  };

  // Resolve background ambient glow url
  const ambientBackgroundUrl = activeGame
    ? getGameImageUrl(activeGame)
    : "";

  return (
    <div className="app-root">
      {youtubeActive && (
        <div className="youtube-header-bar">
          <div className="youtube-header-title">
            <span className="youtube-logo-red">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </span>
            <span className="youtube-header-text">YouTube</span>
          </div>

          {gamepadConnected && (
            <div className="youtube-gamepad-hints">
              <span className="yt-hint"><span className="yt-hint-key">D-Pad</span> Navegar</span>
              <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "✕" : "A"}</span> Selecionar</span>
              <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "○" : "B"}</span> Voltar</span>
              <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "△" : "Y"}</span> Play/Pause</span>
              <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "□" : "X"}</span> Fullscreen</span>
              <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "L1/R1" : "LB/RB"}</span> Seek</span>
              <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "L2/R2" : "LT/RT"}</span> Volume</span>
            </div>
          )}

          <button className="youtube-back-btn" onClick={handleCloseYouTube}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            {gamepadConnected ? (currentTheme === "ps5" ? "Options" : "Start") : "ESC"} — Voltar
          </button>
        </div>
      )}
      {/* Blurred ambient theme bg */}
      <div
        className="ambient-bg"
        style={{
          backgroundImage: activeGame && activeGame.image_url ? `url(${ambientBackgroundUrl})` : "none",
          backgroundColor: activeGame && !activeGame.image_url ? "transparent" : "var(--bg-primary)",
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
                  <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
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
                  <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
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
                          <path d="M8 5v14l11-7z"/>
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

      {/* Settings Modal Overlays */}
      {settingsOpen && (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-card" onClick={(e) => e.stopPropagation()}>
            <h2>Configurações do Atlas</h2>
 
            {/* Tab navigation inside settings */}
            <div className="settings-tabs">
              <button
                id="settings-tab-geral"
                className={`settings-tab-btn ${settingsTab === "geral" ? "active" : ""} ${settingsFocusArea === "tabs" && settingsTab === "geral" ? "focused" : ""}`}
                onClick={() => setSettingsTab("geral")}
              >
                Geral
              </button>
              <button
                id="settings-tab-custom"
                className={`settings-tab-btn ${settingsTab === "custom" ? "active" : ""} ${settingsFocusArea === "tabs" && settingsTab === "custom" ? "focused" : ""}`}
                onClick={() => setSettingsTab("custom")}
              >
                Jogos Customizados
              </button>
              <button
                id="settings-tab-aparencia"
                className={`settings-tab-btn ${settingsTab === "aparencia" ? "active" : ""} ${settingsFocusArea === "tabs" && settingsTab === "aparencia" ? "focused" : ""}`}
                onClick={() => setSettingsTab("aparencia")}
              >
                Aparência
              </button>
            </div>
 
            {/* Tab 1: Geral */}
            {settingsTab === "geral" && (
              <div className="settings-section">
                <div className={`settings-row ${settingsFocusArea === "content" && settingsSelectedIndex === 0 ? "focused" : ""}`}>
                  <div className="settings-label">
                    <span className="settings-label-title">Iniciar como Shell do Windows</span>
                    <span className="settings-label-desc">
                      Substitui o Explorer.exe pelo Atlas para este usuário, iniciando direto na sua biblioteca de jogos ao ligar o PC.
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      id="geral-shell-toggle-input"
                      type="checkbox"
                      checked={shellEnabled}
                      onChange={(e) => handleToggleShell(e.target.checked)}
                      className={settingsFocusArea === "content" && settingsSelectedIndex === 0 ? "focused" : ""}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
 
                <div className={`settings-row ${settingsFocusArea === "content" && settingsSelectedIndex === 1 ? "focused" : ""}`}>
                  <div className="settings-label">
                    <span className="settings-label-title">Recarregar Biblioteca</span>
                    <span className="settings-label-desc">
                      Força uma nova varredura nas pastas locais do Steam para detectar novos jogos instalados.
                    </span>
                  </div>
                  <button 
                    id="geral-recarregar-btn"
                    className={`btn-secondary ${settingsFocusArea === "content" && settingsSelectedIndex === 1 ? "focused" : ""}`}
                    onClick={() => { loadGames(); setSettingsOpen(false); }}
                  >
                    Recarregar
                  </button>
                </div>
 
                {isSimulated && (
                  <div className="settings-alert">
                    ⚠️ **Aviso:** O Steam local ou a API do Tauri não foram detectados. A interface está exibindo jogos de teste e operando em modo de simulação. Instale o Rust e configure o app no Windows para habilitar o comportamento nativo.
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Custom Games Manager */}
            {settingsTab === "custom" && (
              <div className="settings-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Gerencie seus atalhos manuais de jogos
                  </span>
                  <button
                    id="settings-add-custom-game-btn"
                    type="button"
                    className={`btn-primary ${settingsFocusArea === "content" && settingsSelectedIndex === 0 ? "focused" : ""}`}
                    onClick={openAddGameModal}
                  >
                    + Adicionar Jogo
                  </button>
                </div>

                {/* List of custom games */}
                <div className="custom-games-list">
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Jogos Adicionados ({customGames.length})
                  </span>
                  {customGames.length === 0 ? (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic", marginTop: "0.5rem" }}>
                      Nenhum jogo customizado adicionado ainda.
                    </div>
                  ) : (
                    customGames.map((game, index) => {
                      const itemIdx = 1 + index;
                      const isItemFocused = settingsFocusArea === "content" && settingsSelectedIndex === itemIdx;
                      return (
                        <div key={game.appid} className={`custom-game-item ${isItemFocused ? "focused" : ""}`}>
                          <div className="custom-game-item-info">
                            <span className="custom-game-item-name">{game.name}</span>
                            <span className="custom-game-item-path" title={game.exe_path}>{game.exe_path}</span>
                          </div>
                          <button
                            id={`custom-delete-btn-${index}`}
                            type="button"
                            className={`btn-delete ${isItemFocused ? "focused" : ""}`}
                            onClick={() => handleDeleteCustomGame(game.appid)}
                          >
                            Excluir
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
 
            {/* Tab 3: Aparência (Themes) */}
            {settingsTab === "aparencia" && (
              <div className="settings-section">
                <div className="settings-row-theme-header">
                  <span className="settings-label-title">Selecione o Tema do Console</span>
                  <span className="settings-label-desc">Altere o visual geral, cores, fontes e comportamento estético do Atlas Launcher.</span>
                </div>
                <div className="theme-selector-grid">
                  <div 
                    id="theme-card-atlas"
                    tabIndex={0}
                    className={`theme-selector-card ${currentTheme === "atlas" ? "active" : ""} ${settingsFocusArea === "content" && settingsSelectedIndex === 0 ? "focused" : ""}`}
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
                    id="theme-card-ps5"
                    tabIndex={0}
                    className={`theme-selector-card ${currentTheme === "ps5" ? "active" : ""} ${settingsFocusArea === "content" && settingsSelectedIndex === 1 ? "focused" : ""}`}
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
            )}
 
            <div className="settings-footer">
              <button 
                id="settings-close-btn"
                className={`btn-primary ${settingsFocusArea === "footer" ? "focused" : ""}`}
                onClick={() => setSettingsOpen(false)}
              >
                Fechar [ESC]
              </button>
            </div>

            {gamepadConnected && (
              <div className="modal-gamepad-hints" style={{ marginTop: "1rem" }}>
                <span className="yt-hint"><span className="yt-hint-key">D-Pad</span> Navegar</span>
                <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "✕" : "A"}</span> Selecionar</span>
                <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "○" : "B"}</span> Voltar</span>
              </div>
            )}
          </div>
        </div>
      )}

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
                  <path d="M8 5v14l11-7z"/>
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
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                    Editar Atalho
                  </button>

                  <button 
                    className={`options-btn delete-btn ${optionsMenuSelectedIndex === 2 ? "focused" : ""}`}
                    onClick={() => triggerOption("delete", optionsMenuGame)}
                    onMouseEnter={() => setOptionsMenuSelectedIndex(2)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      <line x1="10" y1="11" x2="10" y2="17"/>
                      <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                    Excluir Atalho
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
      {editingGame && (
        <div className="settings-overlay" onClick={() => setEditingGame(null)}>
          <div className="settings-card" onClick={(e) => e.stopPropagation()}>
            <h2>Editar Atalho de Jogo</h2>

            <form className="custom-game-form" onSubmit={handleEditCustomGameSubmit}>
              <div className="form-group">
                <label>Nome do Jogo *</label>
                <div className="input-row">
                  <input
                    type="text"
                    placeholder="Ex: Cyberpunk 2077"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Arquivo Executável *</label>
                <div className="input-row">
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

              <div className="form-group">
                <label>Imagem da Capa (Opcional - Arquivo local ou URL)</label>
                <div className="input-row">
                  <input
                    type="text"
                    placeholder="Escolha uma imagem ou cole a URL"
                    value={editImg}
                    onChange={(e) => setEditImg(e.target.value)}
                  />
                  <button type="button" className="btn-secondary" onClick={handleEditPickImg}>
                    Buscar
                  </button>
                </div>
              </div>

              <div className="settings-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingGame(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Xbox-Style Add Game Modal */}
      {addGameModalOpen && (
        <div className="settings-overlay add-game-overlay" onClick={() => setAddGameModalOpen(false)}>
          <div className="settings-card add-game-card" onClick={(e) => e.stopPropagation()}>
            <h2>Adicionar Jogo à Biblioteca</h2>

            <div className="add-game-layout">
              {/* Left Column: Installed Apps List */}
              <div className="add-game-list-section">
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
                    <span className="search-icon-hint">Y</span>
                  </div>
                  
                  <button
                    id="add-game-manual-browse-btn"
                    type="button"
                    title="Procurar pasta do jogo manualmente"
                    className={`btn-secondary browse-folder-btn ${addGameSelectedIndex === 1 ? "focused" : ""}`}
                    onClick={handlePickExe}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </button>
                </div>

                <div className="detected-apps-list" ref={detectedListRef}>
                  {loadingApps ? (
                    <div className="apps-list-empty">Buscando jogos instalados no PC...</div>
                  ) : (() => {
                    const fApps = installedApps.filter((app) => app.name.toLowerCase().includes(searchQuery.toLowerCase()));
                    if (fApps.length === 0) {
                      return <div className="apps-list-empty">Nenhum jogo encontrado. Use a pasta ao lado para procurar manualmente.</div>;
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
                            setAddGameSelectedIndex(7); // Select "Adicionar" button
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

              {/* Right Column: Customization Details Form */}
              <div className="add-game-form-section">
                <form onSubmit={handleAddCustomGameSubmit} style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div className="form-group">
                      <label>Nome do Jogo *</label>
                      <div className="input-row">
                        <input
                          id="add-game-custom-name"
                          type="text"
                          placeholder="Ex: Cyberpunk 2077"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          className={addGameSelectedIndex === 3 ? "focused" : ""}
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Arquivo Executável *</label>
                      <div className="input-row">
                        <input
                          type="text"
                          placeholder="Clique em Buscar ou escolha da lista"
                          value={customExe}
                          onChange={(e) => setCustomExe(e.target.value)}
                          className={addGameSelectedIndex === 4 ? "focused" : ""}
                          required
                          readOnly
                        />
                        <button
                          id="add-game-custom-exe-btn"
                          type="button"
                          className={`btn-secondary ${addGameSelectedIndex === 4 ? "focused" : ""}`}
                          onClick={handlePickExe}
                        >
                          Buscar
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Imagem da Capa (Opcional - Local ou URL)</label>
                      <div className="input-row">
                        <input
                          id="add-game-custom-img"
                          type="text"
                          placeholder="Escolha imagem ou cole a URL"
                          value={customImg}
                          onChange={(e) => setCustomImg(e.target.value)}
                          className={addGameSelectedIndex === 5 ? "focused" : ""}
                        />
                        <button
                          id="add-game-custom-img-btn"
                          type="button"
                          className={`btn-secondary ${addGameSelectedIndex === 6 ? "focused" : ""}`}
                          onClick={handlePickImg}
                        >
                          Buscar
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="settings-footer" style={{ padding: 0, marginTop: "1.5rem" }}>
                    <button
                      id="add-game-cancel-btn"
                      type="button"
                      className={`btn-secondary ${addGameSelectedIndex === 8 ? "focused" : ""}`}
                      onClick={() => setAddGameModalOpen(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      id="add-game-submit-btn"
                      type="submit"
                      className={`btn-primary ${addGameSelectedIndex === 7 ? "focused" : ""}`}
                    >
                      Adicionar Jogo
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {gamepadConnected && (
              <div className="modal-gamepad-hints" style={{ marginTop: "1rem" }}>
                <span className="yt-hint"><span className="yt-hint-key">⇅</span> Navegar</span>
                <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "✕" : "A"}</span> Selecionar / Confirmar</span>
                <span className="yt-hint"><span className="yt-hint-key">{currentTheme === "ps5" ? "○" : "B"}</span> Cancelar / Voltar</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Explorer Modal */}
      {fileExplorerOpen && (
        <div className="settings-overlay file-explorer-overlay" onClick={() => setFileExplorerOpen(false)}>
          <div className="settings-card file-explorer-card" onClick={(e) => e.stopPropagation()}>
            <h2>Explorador de Arquivos Atlas</h2>
            
            <div className="file-explorer-path-bar">
              <span>Caminho:</span>
              <strong>{fileExplorerPath || "Meu Computador (Unidades de Disco)"}</strong>
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
