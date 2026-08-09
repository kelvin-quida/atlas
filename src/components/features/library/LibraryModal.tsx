import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SteamGame, PlaytimeStats } from "../../../types/game";
import { getGameImageUrl, getGradientBg } from "../../../utils/gameUtils";
import { useGamepad } from "../../../providers/GamepadContext";

interface LibraryModalProps {
  isOpen: boolean;
  games: SteamGame[];
  playtimes: Record<string, PlaytimeStats>;
  onClose: () => void;
  onTryLaunchGame: (game: SteamGame) => void;
}

type LibraryFilter = "all" | "uninstalled" | "installed" | "steam" | "custom";

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "uninstalled", label: "Não Instalados" },
  { id: "installed", label: "Instalados" },
  { id: "steam", label: "Steam" },
  { id: "custom", label: "Customizados" },
];

export const LibraryModal: React.FC<LibraryModalProps> = ({
  isOpen,
  games,
  playtimes,
  onClose,
  onTryLaunchGame,
}) => {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const { pushLayer, popLayer, registerLayerHandler } = useGamepad();

  // Push library-modal to Gamepad layer stack when open, pop when closed
  useEffect(() => {
    if (!isOpen) return;

    pushLayer("library-modal");
    return () => {
      popLayer("library-modal");
    };
  }, [isOpen, pushLayer, popLayer]);

  // Reset selectedIndex when filter or search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter, searchQuery]);

  // Filtered games list
  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      const matchesSearch = game.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (filter === "uninstalled") return !game.is_installed;
      if (filter === "installed") return !!game.is_installed;
      if (filter === "steam") return !game.isCustom;
      if (filter === "custom") return !!game.isCustom;
      return true;
    });
  }, [games, filter, searchQuery]);

  // Scroll selected card into view smoothly
  useEffect(() => {
    if (!isOpen || !gridContainerRef.current) return;
    const container = gridContainerRef.current;
    const cards = container.getElementsByClassName("library-grid-card");
    const activeCard = cards[selectedIndex] as HTMLElement;
    if (activeCard) {
      activeCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex, isOpen, filteredGames]);

  // Calculate exact number of columns per row dynamically from DOM
  const getGridCols = (): number => {
    if (!gridContainerRef.current) return 5;
    const container = gridContainerRef.current;
    const cards = container.getElementsByClassName("library-grid-card");
    if (cards.length < 2) return 1;
    const firstTop = (cards[0] as HTMLElement).offsetTop;
    for (let i = 1; i < cards.length; i++) {
      if ((cards[i] as HTMLElement).offsetTop > firstTop) {
        return i;
      }
    }
    return cards.length;
  };

  // Keyboard navigation inside Full Screen Library
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // Tab navigation with Q / E or PageUp / PageDown
      if (e.key === "PageUp" || e.key === "q" || e.key === "Q") {
        e.preventDefault();
        setFilter((prev) => {
          const idx = FILTERS.findIndex((f) => f.id === prev);
          const nextIdx = idx > 0 ? idx - 1 : FILTERS.length - 1;
          return FILTERS[nextIdx].id;
        });
        return;
      }
      if (e.key === "PageDown" || e.key === "e" || e.key === "E") {
        e.preventDefault();
        setFilter((prev) => {
          const idx = FILTERS.findIndex((f) => f.id === prev);
          const nextIdx = idx < FILTERS.length - 1 ? idx + 1 : 0;
          return FILTERS[nextIdx].id;
        });
        return;
      }

      if (filteredGames.length === 0) return;

      const cols = getGridCols();
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredGames.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + cols, filteredGames.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - cols, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const game = filteredGames[selectedIndex];
        if (game) handleActionGame(game);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredGames, selectedIndex, onClose]);

  // Full Gamepad navigation layer for Library
  useEffect(() => {
    if (!isOpen) return;

    return registerLayerHandler("library-modal", (actions) => {
      if (actions.b || actions.select) {
        onClose();
        return true;
      }

      // LB / RB cycles filter tabs
      if (actions.lb) {
        setFilter((prev) => {
          const idx = FILTERS.findIndex((f) => f.id === prev);
          const nextIdx = idx > 0 ? idx - 1 : FILTERS.length - 1;
          return FILTERS[nextIdx].id;
        });
        return true;
      }
      if (actions.rb) {
        setFilter((prev) => {
          const idx = FILTERS.findIndex((f) => f.id === prev);
          const nextIdx = idx < FILTERS.length - 1 ? idx + 1 : 0;
          return FILTERS[nextIdx].id;
        });
        return true;
      }

      if (filteredGames.length === 0) return true;

      const cols = getGridCols();
      if (actions.right) {
        setSelectedIndex((prev) => Math.min(prev + 1, filteredGames.length - 1));
        return true;
      }
      if (actions.left) {
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return true;
      }
      if (actions.down) {
        setSelectedIndex((prev) => Math.min(prev + cols, filteredGames.length - 1));
        return true;
      }
      if (actions.up) {
        setSelectedIndex((prev) => Math.max(prev - cols, 0));
        return true;
      }
      if (actions.a || actions.start) {
        const game = filteredGames[selectedIndex];
        if (game) {
          handleActionGame(game);
        }
        return true;
      }
      return true;
    });
  }, [isOpen, filteredGames, selectedIndex, registerLayerHandler, onClose]);

  const handleActionGame = (game: SteamGame) => {
    if (game.is_installed) {
      onClose();
      onTryLaunchGame(game);
    } else {
      // Trigger Steam install protocol
      invoke("launch_game", { appid: game.appid }).catch((err) => {
        console.warn("Failed to launch steam install command:", err);
      });
    }
  };

  if (!isOpen) return null;

  const installedCount = games.filter((g) => g.is_installed).length;
  const uninstalledCount = games.length - installedCount;

  return (
    <div className="library-fullscreen-overlay">
      <div className="library-fullscreen-container">
        {/* Top Header */}
        <div className="library-modal-header">
          <div className="library-modal-title-box">
            <div className="library-modal-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </div>
            <div>
              <h1 className="library-modal-title">Sua Biblioteca</h1>
              <p className="library-modal-subtitle">
                {games.length} jogos totais • {installedCount} instalados • {uninstalledCount} não instalados
              </p>
            </div>
          </div>

          <div className="library-header-actions">
            <div className="library-gamepad-hints">
              <span className="hint-pill">LB / RB Alternar Filtros</span>
              <span className="hint-pill">D-Pad / Analógico Navegar</span>
              <span className="hint-pill">A Selecionar</span>
              <span className="hint-pill">B Voltar</span>
            </div>

            <button className="library-modal-close" onClick={onClose} title="Fechar Biblioteca (Esc / B)">
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="library-modal-toolbar">
          <div className="library-search-wrapper">
            <svg className="library-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="library-search-input"
              placeholder="Pesquisar na biblioteca..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="library-search-clear" onClick={() => setSearchQuery("")}>
                ✕
              </button>
            )}
          </div>

          <div className="library-filter-tabs">
            {FILTERS.map((f) => {
              let count = games.length;
              if (f.id === "uninstalled") count = uninstalledCount;
              if (f.id === "installed") count = installedCount;
              if (f.id === "steam") count = games.filter((g) => !g.isCustom).length;
              if (f.id === "custom") count = games.filter((g) => g.isCustom).length;

              return (
                <button
                  key={f.id}
                  className={`library-tab ${filter === f.id ? "active" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Games Grid Body */}
        <div className="library-modal-body" ref={gridContainerRef}>
          {filteredGames.length === 0 ? (
            <div className="library-empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p>Nenhum jogo encontrado nesta categoria.</p>
            </div>
          ) : (
            <div className="library-games-grid">
              {filteredGames.map((game, idx) => {
                const isSelected = idx === selectedIndex;
                const playtimeStr = playtimes[game.appid]?.formatted;

                return (
                  <div
                    key={game.appid}
                    className={`library-grid-card ${isSelected ? "selected" : ""}`}
                    onClick={() => handleActionGame(game)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="library-card-cover-wrapper">
                      {game.image_url ? (
                        <img
                          src={getGameImageUrl(game)}
                          alt={game.name}
                          className="library-card-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div
                          className="library-card-placeholder-bg"
                          style={{ background: getGradientBg(game.name) }}
                        >
                          {game.name}
                        </div>
                      )}

                      <div
                        className={`library-status-badge ${
                          game.is_installed ? "installed" : "uninstalled"
                        }`}
                      >
                        {game.is_installed ? "Instalado" : "Não Instalado"}
                      </div>
                    </div>

                    <div className="library-card-details">
                      <div className="library-card-header-row">
                        <span className="library-platform-tag">
                          {game.isCustom ? "CUSTOM" : "STEAM"}
                        </span>
                        {playtimeStr && (
                          <span className="library-playtime-tag">{playtimeStr}</span>
                        )}
                      </div>
                      <h4 className="library-card-name" title={game.name}>
                        {game.name}
                      </h4>

                      <button
                        className={`library-card-action-btn ${
                          game.is_installed ? "play-btn" : "install-btn"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleActionGame(game);
                        }}
                      >
                        {game.is_installed ? (
                          <>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            Jogar
                          </>
                        ) : (
                          <>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Instalar via Steam
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
