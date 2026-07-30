import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface SteamGame {
  appid: string;
  name: string;
  installdir: string;
  library_path: string;
  image_url: string;
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
  const [games, setGames] = useState<SteamGame[]>([]);
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSimulated, setIsSimulated] = useState(false);
  const [launchingGame, setLaunchingGame] = useState<SteamGame | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shellEnabled, setShellEnabled] = useState(false);
  const [systemTime, setSystemTime] = useState("");
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [gamepadConnected, setGamepadConnected] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);
  const lastInputTime = useRef<number>(0);
  const cooldown = 200; // ms

  // Ref to hold current state values for the gamepad loop
  const stateRef = useRef({
    games,
    selectedGameIndex,
    settingsOpen,
    launchingGame,
    loading
  });

  // Sync state values with ref
  useEffect(() => {
    stateRef.current = { games, selectedGameIndex, settingsOpen, launchingGame, loading };
  }, [games, selectedGameIndex, settingsOpen, launchingGame, loading]);

  // Load installed Steam games
  const loadGames = async () => {
    setLoading(true);
    try {
      const list = await invoke<SteamGame[]>("get_installed_games");
      if (list && list.length > 0) {
        setGames(list);
        setIsSimulated(false);
      } else {
        setGames(MOCK_GAMES);
        setIsSimulated(true);
      }
    } catch (err) {
      console.warn("Failed to contact Tauri backend, falling back to mock library.", err);
      setGames(MOCK_GAMES);
      setIsSimulated(true);
    } finally {
      setLoading(false);
    }
  };

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

  // Launch selected Steam game
  const handleLaunchGame = async (game: SteamGame) => {
    setLaunchingGame(game);
    try {
      if (isSimulated) {
        // Simulated launch experience for demonstration
        await new Promise((resolve) => setTimeout(resolve, 2500));
      } else {
        await invoke("launch_game", { appid: game.appid });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (err) {
      console.error(err);
      alert(`Falha ao iniciar o jogo: ${err}`);
    } finally {
      setLaunchingGame(null);
    }
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
      if (settingsOpen || launchingGame || loading || games.length === 0) return;

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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [games, selectedGameIndex, settingsOpen, launchingGame, loading, isSimulated]);

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
          const { games: currentGames, selectedGameIndex: currentIndex, settingsOpen: isSettingsOpen, launchingGame: isLaunching, loading: isLoading } = stateRef.current;

          if (!isLoading && !isLaunching && currentGames.length > 0) {
            let inputTriggered = false;

            // Standard layout mappings
            const btnA = gp.buttons[0]?.pressed; // Confirm / Play
            const btnB = gp.buttons[1]?.pressed; // Back / Close Settings
            const btnStart = gp.buttons[9]?.pressed || gp.buttons[8]?.pressed; // Settings Toggle
            const dpadLeft = gp.buttons[14]?.pressed;
            const dpadRight = gp.buttons[15]?.pressed;
            const stickX = gp.axes[0]; // Left stick horizontal axis

            if (isSettingsOpen) {
              if (btnB) {
                setSettingsOpen(false);
                inputTriggered = true;
              }
            } else {
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

  // Dynamic ambient hero background url
  const ambientBackgroundUrl = activeGame
    ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${activeGame.appid}/library_hero.jpg`
    : "";

  return (
    <div className="app-root">
      {/* Blurred ambient theme bg */}
      <div
        className="ambient-bg"
        style={{
          backgroundImage: activeGame ? `url(${ambientBackgroundUrl}), url(${activeGame.image_url})` : "none",
        }}
      ></div>
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
                    AppID: <span className="meta-pill">{activeGame.appid}</span>
                  </span>
                  <span>•</span>
                  <span>Steam Library Folder</span>
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
                  const isErr = imageErrors[game.appid];

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
                        <div className="game-card-placeholder">
                          <div className="placeholder-tag">Steam Game</div>
                          <div className="placeholder-text">{game.name}</div>
                        </div>
                      ) : (
                        <div className="game-card-img-wrapper">
                          <img
                            src={game.image_url}
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
          </div>

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
        </footer>
      </div>

      {/* Launching overlay screen */}
      {launchingGame && (
        <div className="launching-screen">
          <div className="spinner"></div>
          <h2 style={{ fontWeight: 600, fontSize: "1.8rem" }}>Iniciando {launchingGame.name}...</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            {isSimulated ? "Simulando execução do jogo no modo desenvolvedor" : "Aguardando Steam carregar o processo"}
          </p>
        </div>
      )}

      {/* Settings Modal Overlays */}
      {settingsOpen && (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-card" onClick={(e) => e.stopPropagation()}>
            <h2>Configurações do Atlas</h2>

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
            </div>

            {isSimulated && (
              <div className="settings-alert">
                ⚠️ **Aviso:** O Steam local ou a API do Tauri não foram detectados. A interface está exibindo jogos de teste e operando em modo de simulação. Instale o Rust e configure o app no Windows para habilitar o comportamento nativo.
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
