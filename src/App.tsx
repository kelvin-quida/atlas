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
  const [settingsTab, setSettingsTab] = useState<"geral" | "custom">("geral");
  const [shellEnabled, setShellEnabled] = useState(false);
  const [systemTime, setSystemTime] = useState("");
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [youtubeActive, setYoutubeActive] = useState(false);

  // Form states for adding custom game
  const [customName, setCustomName] = useState("");
  const [customExe, setCustomExe] = useState("");
  const [customImg, setCustomImg] = useState("");

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
    youtubeActive
  });

  // Sync state values with ref
  useEffect(() => {
    stateRef.current = { games, selectedGameIndex, settingsOpen, launchingGame, loading, youtubeActive };
  }, [games, selectedGameIndex, settingsOpen, launchingGame, loading, youtubeActive]);

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

  // Native file selection dialog wrapper
  const handlePickExe = async () => {
    try {
      const path = await invoke<string>("pick_file", {
        filter: "Executáveis (*.exe;*.sh;*.bin)|*.exe;*.sh;*.bin|Todos os Arquivos (*.*)|*.*",
        title: "Selecione o Executável do Jogo"
      });
      setCustomExe(path);
      // Auto-populate title if empty based on file name
      if (!customName && path) {
        const parts = path.replace(/\\/g, "/").split("/");
        const fileName = parts[parts.length - 1];
        const dotIndex = fileName.lastIndexOf(".");
        setCustomName(dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName);
      }
    } catch (e) {
      if (e !== "Canceled") {
        alert(`Erro ao selecionar arquivo: ${e}`);
      }
    }
  };

  const handlePickImg = async () => {
    try {
      const path = await invoke<string>("pick_file", {
        filter: "Imagens (*.png;*.jpg;*.jpeg;*.webp)|*.png;*.jpg;*.jpeg;*.webp",
        title: "Selecione a Imagem da Capa"
      });
      setCustomImg(path);
    } catch (e) {
      if (e !== "Canceled") {
        alert(`Erro ao selecionar imagem: ${e}`);
      }
    }
  };

  const handleAddCustomGameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
  };

  const handleDeleteCustomGame = (appid: string) => {
    const updated = customGames.filter((g) => g.appid !== appid);
    setCustomGames(updated);
    localStorage.setItem("atlas_custom_games", JSON.stringify(updated));
  };

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

  // Keyboard navigation for carousel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (settingsOpen || launchingGame || loading) return;

      if (youtubeActive) {
        if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          handleCloseYouTube();
        }
        return;
      }

      if (games.length === 0) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedGameIndex((prev) => (prev > 0 ? prev - 1 : games.length - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedGameIndex((prev) => (prev < games.length - 1 ? prev + 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleLaunchGame(games[selectedGameIndex]);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        handleOpenYouTube();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [games, selectedGameIndex, settingsOpen, launchingGame, loading, isSimulated, youtubeActive]);

  // Keyboard navigation for settings
  useEffect(() => {
    const handleSettingsKeys = (e: KeyboardEvent) => {
      if (!settingsOpen) return;
      if (e.key === "Escape" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleSettingsKeys);
    return () => window.removeEventListener("keydown", handleSettingsKeys);
  }, [settingsOpen]);

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
          const { games: currentGames, selectedGameIndex: currentIndex, settingsOpen: isSettingsOpen, launchingGame: isLaunching, loading: isLoading, youtubeActive: isYoutubeActive } = stateRef.current;

          if (!isLoading && !isLaunching) {
            let inputTriggered = false;

            // Standard layout mappings
            const btnA = gp.buttons[0]?.pressed; // Confirm / Play
            const btnB = gp.buttons[1]?.pressed; // Back / Close Settings
            const btnY = gp.buttons[3]?.pressed; // Open YouTube
            const btnStart = gp.buttons[9]?.pressed || gp.buttons[8]?.pressed; // Settings Toggle
            const dpadLeft = gp.buttons[14]?.pressed;
            const dpadRight = gp.buttons[15]?.pressed;
            const stickX = gp.axes[0]; // Left stick horizontal axis

            if (isYoutubeActive) {
              // ── Full YouTube gamepad control ──
              const dpadUp = gp.buttons[12]?.pressed;
              const dpadDown = gp.buttons[13]?.pressed;
              const dpadLeft = gp.buttons[14]?.pressed;
              const dpadRight = gp.buttons[15]?.pressed;
              const btnA = gp.buttons[0]?.pressed;
              const btnB = gp.buttons[1]?.pressed;
              const btnX = gp.buttons[2]?.pressed;
              const btnY = gp.buttons[3]?.pressed;
              const btnLB = gp.buttons[4]?.pressed;
              const btnRB = gp.buttons[5]?.pressed;
              const triggerLT = gp.buttons[6]?.value ?? 0;
              const triggerRT = gp.buttons[7]?.value ?? 0;
              const btnStart = gp.buttons[9]?.pressed;
              const stickY = gp.axes[1]; // Left stick vertical

              const sendAction = (action: string) => {
                invoke("youtube_gamepad_action", { action }).catch(console.error);
                inputTriggered = true;
              };

              if (btnStart) {
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
            } else if (isSettingsOpen) {
              if (btnB) {
                setSettingsOpen(false);
                inputTriggered = true;
              }
            } else if (currentGames.length > 0) {
              if (dpadLeft || stickX < -0.5) {
                setSelectedGameIndex((prev) => (prev > 0 ? prev - 1 : currentGames.length - 1));
                inputTriggered = true;
              } else if (dpadRight || stickX > 0.5) {
                setSelectedGameIndex((prev) => (prev < currentGames.length - 1 ? prev + 1 : 0));
                inputTriggered = true;
              } else if (btnA) {
                if (currentGames[currentIndex]) {
                  handleLaunchGame(currentGames[currentIndex]);
                  inputTriggered = true;
                }
              } else if (btnStart) {
                setSettingsOpen(true);
                inputTriggered = true;
              } else if (btnY) {
                handleOpenYouTube();
                inputTriggered = true;
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
              <span className="yt-hint"><span className="yt-hint-key">A</span> Selecionar</span>
              <span className="yt-hint"><span className="yt-hint-key">B</span> Voltar</span>
              <span className="yt-hint"><span className="yt-hint-key">Y</span> Play/Pause</span>
              <span className="yt-hint"><span className="yt-hint-key">X</span> Fullscreen</span>
              <span className="yt-hint"><span className="yt-hint-key">LB/RB</span> Seek</span>
              <span className="yt-hint"><span className="yt-hint-key">LT/RT</span> Volume</span>
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
            {gamepadConnected ? "Start" : "ESC"} — Voltar
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
        <header className="console-header">
          <div className="logo-container">
            <span className="logo-text">ATLAS</span>
            <span className="logo-tag">LAUNCHER</span>
          </div>

          <div className="system-status">
            {gamepadConnected && (
              <div className="status-item gamepad-badge" style={{ color: "var(--accent-cyan)", borderColor: "rgba(6, 182, 212, 0.3)" }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginRight: "0.35rem" }}
                >
                  <line x1="6" x2="10" y1="12" y2="12" />
                  <line x1="8" x2="8" y1="10" y2="14" />
                  <line x1="15" x2="15.01" y1="13" y2="13" />
                  <line x1="18" x2="18.01" y1="11" y2="11" />
                  <rect x="2" y="6" width="20" height="12" rx="3" />
                </svg>
                <span>Controle Conectado</span>
              </div>
            )}
            <div className="status-item">
              <span className={`status-dot ${isSimulated ? "simulated" : ""}`}></span>
              <span>
                {isSimulated ? "Biblioteca Simulada (Sem Steam)" : "Biblioteca Steam Sincronizada"}
              </span>
            </div>
            <div className="system-time">{systemTime}</div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="console-content">
          <div className="game-info-panel">
            {activeGame && (
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
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "300px" }}>
              <div className="spinner"></div>
            </div>
          ) : (
            <div className="games-carousel-wrapper">
              <div className="games-carousel" ref={carouselRef}>
                {games.map((game, index) => {
                  const isFocused = index === selectedGameIndex;
                  const isErr = imageErrors[game.appid] || !game.image_url;

                  return (
                    <div
                      key={game.appid}
                      className={`game-card ${isFocused ? "focused" : ""}`}
                      onClick={() => {
                        if (isFocused) {
                          handleLaunchGame(game);
                        } else {
                          setSelectedGameIndex(index);
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

        {/* Bottom Legend / Footer */}
        <footer className="console-footer">
          <div className="nav-hints">
            <div className="hint-item">
              <span className="key-badge">◀</span>
              <span className="key-badge">▶</span>
              {gamepadConnected && <span className="key-badge" style={{ color: "var(--accent-cyan)" }}>L-Stick</span>}
              <span>Navegar</span>
            </div>
            <div className="hint-item">
              <span className="key-badge">Enter</span>
              {gamepadConnected && <span className="key-badge" style={{ color: "var(--accent-cyan)" }}>Botão A</span>}
              <span>Jogar</span>
            </div>
            <div className="hint-item">
              <span className="key-badge">S</span>
              {gamepadConnected && <span className="key-badge" style={{ color: "var(--accent-cyan)" }}>Start</span>}
              <span>Configurações</span>
            </div>
            <div className="hint-item">
              <span className="key-badge">Y</span>
              {gamepadConnected && <span className="key-badge" style={{ color: "var(--accent-cyan)" }}>Botão Y</span>}
              <span>YouTube</span>
            </div>
          </div>

          <div className="footer-actions">
            <button className="youtube-trigger-btn" onClick={handleOpenYouTube}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: "0.25rem" }}>
                <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              YouTube
            </button>

            <button className="settings-trigger-btn" onClick={() => setSettingsOpen(true)}>
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
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Configurações
            </button>
          </div>
        </footer>
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
                className={`settings-tab-btn ${settingsTab === "geral" ? "active" : ""}`}
                onClick={() => setSettingsTab("geral")}
              >
                Geral
              </button>
              <button
                className={`settings-tab-btn ${settingsTab === "custom" ? "active" : ""}`}
                onClick={() => setSettingsTab("custom")}
              >
                Jogos Customizados
              </button>
            </div>

            {/* Tab 1: Geral */}
            {settingsTab === "geral" && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-label">
                    <span className="settings-label-title">Iniciar como Shell do Windows</span>
                    <span className="settings-label-desc">
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

                <div className="settings-row">
                  <div className="settings-label">
                    <span className="settings-label-title">Recarregar Biblioteca</span>
                    <span className="settings-label-desc">
                      Força uma nova varredura nas pastas locais do Steam para detectar novos jogos instalados.
                    </span>
                  </div>
                  <button className="btn-secondary" onClick={() => { loadGames(); setSettingsOpen(false); }}>
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
                {/* Form to add custom game */}
                <form className="custom-game-form" onSubmit={handleAddCustomGameSubmit}>
                  <div className="form-group">
                    <label>Nome do Jogo *</label>
                    <div className="input-row">
                      <input
                        type="text"
                        placeholder="Ex: Cyberpunk 2077"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
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
                        value={customExe}
                        onChange={(e) => setCustomExe(e.target.value)}
                        required
                        readOnly
                      />
                      <button type="button" className="btn-secondary" onClick={handlePickExe}>
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
                        value={customImg}
                        onChange={(e) => setCustomImg(e.target.value)}
                      />
                      <button type="button" className="btn-secondary" onClick={handlePickImg}>
                        Buscar
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="btn-primary" style={{ marginTop: "0.5rem" }}>
                    Adicionar Jogo
                  </button>
                </form>

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
                    customGames.map((game) => (
                      <div key={game.appid} className="custom-game-item">
                        <div className="custom-game-item-info">
                          <span className="custom-game-item-name">{game.name}</span>
                          <span className="custom-game-item-path" title={game.exe_path}>{game.exe_path}</span>
                        </div>
                        <button
                          type="button"
                          className="btn-delete"
                          onClick={() => handleDeleteCustomGame(game.appid)}
                        >
                          Excluir
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="settings-footer">
              <button className="btn-primary" onClick={() => setSettingsOpen(false)}>
                Fechar [ESC]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
