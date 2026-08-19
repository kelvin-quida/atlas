import React, { useState, useEffect, useMemo, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { DashboardStats, GameStatsDetail, FocusArea } from "../../../types/game";
import "./DashboardSection.css";

interface DashboardSectionProps {
  currentTheme?: string;
  focusArea?: FocusArea;
  onFocusHeader?: () => void;
  onRefreshStats?: () => void;
  onRegisterGamepadHandler?: (handler: ((actions: any) => boolean) | null) => void;
}

type DashboardZone = "filters" | "metrics" | "leaderboard";

export const DashboardSection: React.FC<DashboardSectionProps> = ({
  currentTheme = "atlas",
  focusArea,
  onFocusHeader,
  onRegisterGamepadHandler,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"monthly" | "all">("monthly");

  // Gamepad & Keyboard spatial navigation state
  const isFocused = focusArea === "dashboard";

  const [activeZone, setActiveZone] = useState<DashboardZone>("filters");
  const [focusedFilterIdx, setFocusedFilterIdx] = useState<number>(0);
  const [focusedMetricIdx, setFocusedMetricIdx] = useState<number>(0);
  const [focusedLeaderboardIdx, setFocusedLeaderboardIdx] = useState<number>(0);

  const loadDashboardData = async (reqYear?: number, reqMonth?: number) => {
    setLoading(true);
    try {
      const data = await invoke<DashboardStats>("get_dashboard_stats", {
        year: reqYear,
        month: reqMonth,
      });
      setStats(data);
      if (data.game_stats.length > 0 && !selectedGameId) {
        const topMonthly = data.game_stats.find((g) => g.monthly_seconds > 0);
        const topPlayed = topMonthly || data.game_stats[0];
        if (topPlayed) {
          setSelectedGameId(topPlayed.game_id);
        }
      }
    } catch (err) {
      console.error("[Dashboard] Failed to fetch stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = useCallback(() => {
    if (!stats) return;
    const prevYear = stats.selected_month === 1 ? stats.selected_year - 1 : stats.selected_year;
    const prevMonth = stats.selected_month === 1 ? 12 : stats.selected_month - 1;
    loadDashboardData(prevYear, prevMonth);
  }, [stats]);

  const handleNextMonth = useCallback(() => {
    if (!stats) return;
    const nextYear = stats.selected_month === 12 ? stats.selected_year + 1 : stats.selected_year;
    const nextMonth = stats.selected_month === 12 ? 1 : stats.selected_month + 1;
    loadDashboardData(nextYear, nextMonth);
  }, [stats]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Filter and sort games list (only include played games > 0s for the selected filter)
  const filteredGames = useMemo(() => {
    if (!stats?.game_stats) return [];
    let list = stats.game_stats.filter((g) => {
      if (filterMode === "monthly") return g.monthly_seconds > 0;
      return g.total_seconds > 0;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }

    if (filterMode === "monthly") {
      list.sort((a, b) => b.monthly_seconds - a.monthly_seconds || b.total_seconds - a.total_seconds);
    } else {
      list.sort((a, b) => b.total_seconds - a.total_seconds);
    }

    return list;
  }, [stats, searchQuery, filterMode]);

  // Selected Game details
  const selectedGame: GameStatsDetail | null = useMemo(() => {
    if (!stats?.game_stats || filteredGames.length === 0) return null;
    if (selectedGameId) {
      const foundInFiltered = filteredGames.find((g) => g.game_id === selectedGameId);
      if (foundInFiltered) return foundInFiltered;
    }
    return filteredGames[0] || null;
  }, [stats, filteredGames, selectedGameId]);

  // Max playtime for percentage progress bar calculation
  const maxPlaytimeSeconds = useMemo(() => {
    if (!filteredGames || filteredGames.length === 0) return 1;
    if (filterMode === "monthly") return Math.max(...filteredGames.map((g) => g.monthly_seconds), 1);
    return Math.max(...filteredGames.map((g) => g.total_seconds), 1);
  }, [filteredGames, filterMode]);

  // Auto update selected game when leaderboard item is focused via gamepad
  useEffect(() => {
    if (isFocused && activeZone === "leaderboard" && filteredGames[focusedLeaderboardIdx]) {
      setSelectedGameId(filteredGames[focusedLeaderboardIdx].game_id);
      const items = document.querySelectorAll(".leaderboard-item");
      const el = items[focusedLeaderboardIdx] as HTMLElement;
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [focusedLeaderboardIdx, activeZone, isFocused, filteredGames]);

  // Handle Gamepad / Spatial input
  const handleNavigationAction = useCallback(
    (actions: { up?: boolean; down?: boolean; left?: boolean; right?: boolean; a?: boolean; b?: boolean; lt?: boolean; rt?: boolean; start?: boolean }) => {
      if (!isFocused) return false;

      // Cycle months with L2 (LT) and R2 (RT) triggers infinitely
      if (actions.lt) {
        handlePrevMonth();
        return true;
      } else if (actions.rt) {
        handleNextMonth();
        return true;
      }

      if (activeZone === "filters") {
        if (actions.left) {
          setFocusedFilterIdx((prev) => (prev > 0 ? prev - 1 : 1));
          return true;
        } else if (actions.right) {
          setFocusedFilterIdx((prev) => (prev < 1 ? prev + 1 : 0));
          return true;
        } else if (actions.down) {
          setActiveZone("metrics");
          setFocusedMetricIdx(0);
          return true;
        } else if (actions.up) {
          onFocusHeader?.();
          return true;
        } else if (actions.a || actions.start) {
          const modes: ("monthly" | "all")[] = ["monthly", "all"];
          setFilterMode(modes[focusedFilterIdx]);
          return true;
        }
      } else if (activeZone === "metrics") {
        if (actions.left) {
          setFocusedMetricIdx((prev) => (prev > 0 ? prev - 1 : 2));
          return true;
        } else if (actions.right) {
          setFocusedMetricIdx((prev) => (prev < 2 ? prev + 1 : 0));
          return true;
        } else if (actions.up) {
          setActiveZone("filters");
          setFocusedFilterIdx(0);
          return true;
        } else if (actions.down) {
          setActiveZone("leaderboard");
          setFocusedLeaderboardIdx(0);
          return true;
        }
      } else if (activeZone === "leaderboard") {
        if (actions.up) {
          if (focusedLeaderboardIdx > 0) {
            setFocusedLeaderboardIdx((prev) => prev - 1);
          } else {
            setActiveZone("metrics");
            setFocusedMetricIdx(0);
          }
          return true;
        } else if (actions.down) {
          if (filteredGames.length > 0) {
            setFocusedLeaderboardIdx((prev) => (prev < filteredGames.length - 1 ? prev + 1 : prev));
          }
          return true;
        } else if (actions.a || actions.start) {
          if (filteredGames[focusedLeaderboardIdx]) {
            setSelectedGameId(filteredGames[focusedLeaderboardIdx].game_id);
          }
          return true;
        }
      }

      return false;
    },
    [
      isFocused,
      activeZone,
      focusedFilterIdx,
      focusedMetricIdx,
      focusedLeaderboardIdx,
      filteredGames,
      handlePrevMonth,
      handleNextMonth,
      onFocusHeader,
    ]
  );

  // Register Gamepad action handler with parent without replacing 'main' layer
  useEffect(() => {
    if (onRegisterGamepadHandler && isFocused) {
      onRegisterGamepadHandler(handleNavigationAction);
      return () => {
        onRegisterGamepadHandler(null);
      };
    }
  }, [onRegisterGamepadHandler, isFocused, handleNavigationAction]);

  // Keyboard navigation fallback
  useEffect(() => {
    if (!isFocused) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Do NOT intercept tab-switching keys (Q, E, [, ], PageUp, PageDown)
      if (
        e.key === "q" || e.key === "Q" ||
        e.key === "e" || e.key === "E" ||
        e.key === "[" || e.key === "]" ||
        e.key === "PageUp" || e.key === "PageDown"
      ) {
        return;
      }

      const actions = {
        up: e.key === "ArrowUp" || e.key === "w" || e.key === "W",
        down: e.key === "ArrowDown" || e.key === "s" || e.key === "S",
        left: e.key === "ArrowLeft",
        right: e.key === "ArrowRight",
        a: e.key === "Enter" || e.key === " ",
        b: e.key === "Escape",
        lt: e.key === "," || e.key === "<",
        rt: e.key === "." || e.key === ">",
      };

      if (actions.up || actions.down || actions.left || actions.right || actions.a || actions.b || actions.lt || actions.rt) {
        const handled = handleNavigationAction(actions);
        if (handled) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocused, handleNavigationAction]);

  // Helper to format ISO dates to locale string
  const formatDate = (isoString?: string) => {
    if (!isoString || isoString.trim() === "" || isoString === "Invalid Date") return "Nunca jogado";
    try {
      const cleaned = isoString.trim().replace(" ", "T");
      const date = new Date(cleaned);
      if (isNaN(date.getTime())) {
        return "Sessão gravada";
      }
      return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Sessão gravada";
    }
  };

  const getImageUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
      return url;
    }
    return convertFileSrc(url);
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <span>Carregando estatísticas da biblioteca...</span>
      </div>
    );
  }

  return (
    <div className={`dashboard-container theme-${currentTheme}`}>
      {/* Header Banner */}
      <div className="dashboard-header">
        <div className="dashboard-title-row">
          <div className="dashboard-title-group">
            <div>
              <h1 className="dashboard-title">{stats?.selected_month_label || "Dashboard"}</h1>
            </div>
          </div>

          <div className="dashboard-filter-pills">
            <button
              className={`filter-pill-btn ${filterMode === "monthly" ? "active" : ""} ${
                isFocused && activeZone === "filters" && focusedFilterIdx === 0 ? "gamepad-focused" : ""
              }`}
              onClick={() => {
                setActiveZone("filters");
                setFocusedFilterIdx(0);
                setFilterMode("monthly");
              }}
            >
              Neste Mês ({stats?.selected_month_label || "Mês"})
            </button>


          </div>
        </div>
      </div>

      {/* Main Stat Cards */}
      <div className="dashboard-metrics-grid">
        {/* Monthly (Primary Focus) */}
        <div
          className={`metric-card featured-monthly ${
            isFocused && activeZone === "metrics" && focusedMetricIdx === 0 ? "gamepad-focused" : ""
          }`}
          onClick={() => {
            setActiveZone("metrics");
            setFocusedMetricIdx(0);
          }}
        >
          <div className="metric-icon-box monthly">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label" style={{ color: "#fbbf24" }}>
              {stats?.selected_month_label ? `Horas (${stats.selected_month_label})` : "Horas no Mês"}
            </span>
            <span className="metric-value">{stats?.monthly_formatted || "0m"}</span>
            <span className="metric-subtext">Total em {stats?.selected_month_label || "neste mês"}</span>
          </div>
        </div>

        {/* Total Sessions (Filtered by filterMode) */}
        <div
          className={`metric-card ${
            isFocused && activeZone === "metrics" && focusedMetricIdx === 1 ? "gamepad-focused" : ""
          }`}
          onClick={() => {
            setActiveZone("metrics");
            setFocusedMetricIdx(1);
          }}
        >
          <div className="metric-icon-box sessions">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label">Total de Sessões</span>
            <span className="metric-value">
              {filterMode === "monthly"
                ? stats?.monthly_sessions_count || 0
                : stats?.total_sessions_count || 0}
            </span>
            <span className="metric-subtext">
              {filterMode === "monthly"
                ? `Em ${stats?.selected_month_label || "neste mês"}`
                : "Partidas iniciadas"}
            </span>
          </div>
        </div>

        {/* Played Games Count (Filtered by filterMode, single number) */}
        <div
          className={`metric-card ${
            isFocused && activeZone === "metrics" && focusedMetricIdx === 2 ? "gamepad-focused" : ""
          }`}
          onClick={() => {
            setActiveZone("metrics");
            setFocusedMetricIdx(2);
          }}
        >
          <div className="metric-icon-box games">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 11h4M8 9v4M15 11h.01M18 13h.01" />
              <rect x="2" y="6" width="20" height="12" rx="6" />
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label">Jogos Jogados</span>
            <span className="metric-value">
              {filterMode === "monthly"
                ? stats?.monthly_played_games_count || 0
                : stats?.played_games_count || 0}
            </span>
            <span className="metric-subtext">
              {filterMode === "monthly"
                ? `Em ${stats?.selected_month_label || "neste mês"}`
                : "Com histórico de jogo"}
            </span>
          </div>
        </div>

        {/* Total Accumulated (Secondary) */}
      </div>

      {/* Main Grid: Selected Game Focus & Leaderboard */}
      <div className="dashboard-main-grid">
        {/* Active / Inspector Game Card */}
          {selectedGame ? (
            <div className="game-detail-card">
              <div
                className="game-detail-hero"
                style={{
                  backgroundImage: selectedGame.background_url
                    ? `url(${getImageUrl(selectedGame.background_url)})`
                    : selectedGame.cover_url
                    ? `url(${getImageUrl(selectedGame.cover_url)})`
                    : "none",
                }}
              >
                <div className="game-detail-hero-overlay" />
                <div className="game-detail-header-content">
                  {selectedGame.cover_url ? (
                    <img
                      src={getImageUrl(selectedGame.cover_url)}
                      alt={selectedGame.name}
                      className="game-detail-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="game-detail-cover" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem" }}>
                      🎮
                    </div>
                  )}
                  <div className="game-detail-title-box">
                    <span className="game-detail-badge">
                      <span>⚡</span> Detalhes & Estatísticas
                    </span>
                    <h2 className="game-detail-name">{selectedGame.name}</h2>
                  </div>
                </div>
              </div>

              <div className="game-detail-stats-grid">
                <div className="stat-item" style={{ border: "1px solid rgba(52, 211, 153, 0.3)", background: "rgba(16, 185, 129, 0.08)" }}>
                  <span className="stat-item-label" style={{ color: "#34d399" }}>Horas na Semana</span>
                  <span className="stat-item-value">{selectedGame.weekly_formatted}</span>
                  <span className="stat-item-sub">Últimos 7 dias</span>
                </div>

                <div className="stat-item" style={{ border: "1px solid rgba(251, 191, 36, 0.3)", background: "rgba(245, 158, 11, 0.08)" }}>
                  <span className="stat-item-label" style={{ color: "#fbbf24" }}>Horas no Mês</span>
                  <span className="stat-item-value">{selectedGame.monthly_formatted}</span>
                  <span className="stat-item-sub">Últimos 30 dias</span>
                </div>

                <div className="stat-item">
                  <span className="stat-item-label">Nº de Sessões</span>
                  <span className="stat-item-value">{selectedGame.session_count} sessões</span>
                  <span className="stat-item-sub">Vezes executado</span>
                </div>

                <div className="stat-item">
                  <span className="stat-item-label">Média por Sessão</span>
                  <span className="stat-item-value">{selectedGame.avg_session_formatted}</span>
                  <span className="stat-item-sub">Tempo médio de jogo</span>
                </div>

                <div className="stat-item">
                  <span className="stat-item-label">Maior Sessão</span>
                  <span className="stat-item-value">{selectedGame.longest_session_formatted}</span>
                  <span className="stat-item-sub">Recorde em uma partida</span>
                </div>

                <div className="stat-item">
                  <span className="stat-item-label">Tempo Total Acumulado</span>
                  <span className="stat-item-value">{selectedGame.total_formatted}</span>
                  <span className="stat-item-sub">{(selectedGame.total_seconds / 3600).toFixed(1)} horas no total</span>
                </div>

                <div className="stat-item" style={{ gridColumn: "span 2" }}>
                  <span className="stat-item-label">Última Vez Jogado</span>
                  <span className="stat-item-value" style={{ fontSize: "0.95rem" }}>
                    {formatDate(selectedGame.last_played)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="section-box empty-state">
              <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Nenhum jogo selecionado ou sem histórico registrado.</span>
            </div>
          )}

          {/* Games Leaderboard */}
          <div className="section-box">
            <div className="section-box-title">
              <span>Classificação por Tempo Jogado</span>
              <span className="section-box-subtitle">
                {filteredGames.length} jogo(s) encontrado(s)
              </span>
            </div>

            <div className="search-input-box">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="Filtrar jogo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="leaderboard-list">
              {filteredGames.length === 0 ? (
                <div className="empty-state">
                  <span>Nenhum jogo com histórico de tempo jogado neste período.</span>
                </div>
              ) : (
                filteredGames.map((game, index) => {
                  const displaySeconds =
                    filterMode === "monthly"
                      ? game.monthly_seconds
                      : game.total_seconds;

                  const displayFormatted =
                    filterMode === "monthly"
                      ? game.monthly_formatted
                      : game.total_formatted;

                  const percentage = Math.min(100, Math.max(4, (displaySeconds / maxPlaytimeSeconds) * 100));
                  const isSelected = selectedGameId === game.game_id;
                  const isGamepadFocused =
                    isFocused && activeZone === "leaderboard" && focusedLeaderboardIdx === index;

                  return (
                    <div
                      key={game.game_id}
                      className={`leaderboard-item ${isSelected ? "selected" : ""} ${
                        isGamepadFocused ? "gamepad-focused" : ""
                      }`}
                      onClick={() => {
                        setActiveZone("leaderboard");
                        setFocusedLeaderboardIdx(index);
                        setSelectedGameId(game.game_id);
                      }}
                    >
                      <span
                        className={`rank-badge ${
                          index === 0 ? "top1" : index === 1 ? "top2" : index === 2 ? "top3" : ""
                        }`}
                      >
                        {index + 1}º
                      </span>

                      {game.cover_url ? (
                        <img
                          src={getImageUrl(game.cover_url)}
                          alt={game.name}
                          className="leaderboard-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div
                          className="leaderboard-cover"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "1.2rem",
                          }}
                        >
                          🎮
                        </div>
                      )}

                      <div className="leaderboard-info">
                        <span className="leaderboard-name">{game.name}</span>
                        <div className="progress-bar-bg">
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>

                      <div className="leaderboard-time">
                        {displayFormatted}
                        <span className="leaderboard-subtime">{game.session_count} sessões</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
      </div>
    </div>
  );
};
