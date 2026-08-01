import React, { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { SteamGame, PlaytimeStats } from "../../../types/game";
import { getGameImageUrl } from "../../../utils/gameUtils";

interface AtlasGameDetailViewProps {
  activeDetailGame: SteamGame;
  detailSelectedIndex: number;
  playtimes: Record<string, PlaytimeStats>;
  setDetailSelectedIndex: (index: number) => void;
  onClose?: () => void;
  onTryLaunchGame: (game: SteamGame) => void;
  onOpenOptionsMenu: (game: SteamGame) => void;
  onOpenEditMedia: (game: SteamGame) => void;
}

export const AtlasGameDetailView: React.FC<AtlasGameDetailViewProps> = ({
  activeDetailGame,
  detailSelectedIndex,
  playtimes,
  setDetailSelectedIndex,
  onTryLaunchGame,
  onOpenOptionsMenu,
  onOpenEditMedia,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    if (playBtnRef.current) {
      playBtnRef.current.focus({ preventScroll: true });
    }
  }, [activeDetailGame]);

  return (
    <div className="atlas-game-detail-view" ref={containerRef}>
      {/* Hero Header Banner Card */}
      <div className="atlas-detail-hero-banner">
        <div className="atlas-hero-main-info">
          <div className="atlas-hero-badges">
            <span className="platform-badge">
              🎮{" "}
              {activeDetailGame.isCustom
                ? "Jogo Personalizado (PC)"
                : "Biblioteca Steam"}
            </span>
            <span className="status-badge">
              <span className="status-dot" /> Pronto para Jogar
            </span>
          </div>

          <h1 className="atlas-hero-title">{activeDetailGame.name || "Sem Nome"}</h1>

          <p className="atlas-hero-subtitle">
            {activeDetailGame.isCustom
              ? `Atalho local executável • ${activeDetailGame.exe_path || "Pasta do sistema"
              }`
              : `Steam App ID: ${activeDetailGame.appid} • Sincronizado`}
          </p>

          {/* Hero Actions Row */}
          <div className="atlas-hero-actions-row">
            <button
              ref={playBtnRef}
              tabIndex={0}
              className={`atlas-detail-play-btn focusable ${
                detailSelectedIndex === 0 ? "focused" : ""
              }`}
              onClick={() => onTryLaunchGame(activeDetailGame)}
              onMouseEnter={() => setDetailSelectedIndex(0)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Jogar</span>
            </button>

            <button
              tabIndex={0}
              className={`atlas-detail-options-btn focusable ${
                detailSelectedIndex === 1 ? "focused" : ""
              }`}
              onClick={() => onOpenEditMedia(activeDetailGame)}
              onMouseEnter={() => setDetailSelectedIndex(1)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Editar Jogo</span>
            </button>

            <button
              tabIndex={0}
              className={`atlas-detail-options-btn focusable ${
                detailSelectedIndex === 2 ? "focused" : ""
              }`}
              onClick={() => onOpenOptionsMenu(activeDetailGame)}
              onMouseEnter={() => setDetailSelectedIndex(2)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Opções</span>
            </button>
          </div>
        </div>

        {/* Metrics Ribbon */}
        <div className="atlas-metrics-ribbon">
          <div className="metric-pill">
            <span className="metric-icon">⏱️</span>
            <div className="metric-info">
              <span className="metric-label">Tempo Jogado</span>
              <span className="metric-value">
                {playtimes[activeDetailGame.appid]?.formatted || "< 1 minuto"}
              </span>
            </div>
          </div>

          <div className="metric-pill">
            <span className="metric-icon">📅</span>
            <div className="metric-info">
              <span className="metric-label">Última Vez Jogado</span>
              <span className="metric-value">
                {activeDetailGame.last_played
                  ? new Date(activeDetailGame.last_played).toLocaleDateString()
                  : "Nunca jogado"}
              </span>
            </div>
          </div>

          <div className="metric-pill">
            <span className="metric-icon">☁️</span>
            <div className="metric-info">
              <span className="metric-label">Nuvem & Salvamentos</span>
              <span className="metric-value text-cyan">Sincronizado</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid (2 Columns) */}
      <div className="atlas-detail-content-grid">
        {/* Left Column: Media Gallery & Installation Info */}
        <div className="atlas-detail-main-col">
          {/* Media Gallery Showcase */}
          <div className="atlas-card media-showcase-card">
            <div className="atlas-card-header">
              <h3 className="atlas-card-title">Arquivos de Mídia</h3>
              <button
                tabIndex={0}
                className="atlas-card-action-btn focusable"
                onClick={() => onOpenEditMedia(activeDetailGame)}
              >
                ✏️ Editar Mídias
              </button>
            </div>

            <div className="media-showcase-grid">
              <div className="media-item-box cover-box">
                <span className="media-item-label">Capa Oficial</span>
                <div className="media-item-img-container">
                  {activeDetailGame.image_url ? (
                    <img
                      src={getGameImageUrl(activeDetailGame)}
                      alt="Capa"
                    />
                  ) : (
                    <div className="media-placeholder">Sem Capa</div>
                  )}
                </div>
              </div>

              <div className="media-item-box bg-box">
                <span className="media-item-label">
                  Background / Hero Banner
                </span>
                <div className="media-item-img-container">
                  {activeDetailGame.bg_url ? (
                    <img
                      src={
                        activeDetailGame.bg_url.startsWith("http") ||
                          activeDetailGame.bg_url.startsWith("data:")
                          ? activeDetailGame.bg_url
                          : convertFileSrc(activeDetailGame.bg_url)
                      }
                      alt="Background"
                    />
                  ) : (
                    <div className="media-placeholder">Sem Background</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Installation & Execution Card */}
          <div className="atlas-card install-info-card">
            <div className="atlas-card-header">
              <h3 className="atlas-card-title">
                Informações do Sistema & Instalação
              </h3>
            </div>
            <div className="install-info-list">
              <div className="info-row">
                <span className="info-key">Executável do Jogo:</span>
                <span
                  className="info-val"
                  title={activeDetailGame.exe_path || "Padrão do Sistema"}
                >
                  {activeDetailGame.exe_path || "Executável Padrão do Sistema"}
                </span>
              </div>
              <div className="info-row">
                <span className="info-key">Plataforma / Origem:</span>
                <span className="info-val">
                  {activeDetailGame.isCustom
                    ? "Atalho Personalizado (PC)"
                    : "Biblioteca Steam"}
                </span>
              </div>
              <div className="info-row">
                <span className="info-key">ID do Registro:</span>
                <span className="info-val">{activeDetailGame.appid}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: How Long To Beat & Stats Sidebar */}
        <div className="atlas-detail-side-col">
          {/* How Long To Beat Widget */}
          <div className="atlas-card hltb-card">
            <div className="atlas-card-header">
              <h3 className="atlas-card-title">How Long To Beat (Estimativa)</h3>
            </div>
            <div className="hltb-grid">
              <div className="hltb-item">
                <div className="hltb-icon">⏱️</div>
                <div className="hltb-val">12½h</div>
                <div className="hltb-label">História Principal</div>
              </div>
              <div className="hltb-item">
                <div className="hltb-icon">⏱️</div>
                <div className="hltb-val">24h</div>
                <div className="hltb-label">Principal + Extras</div>
              </div>
              <div className="hltb-item">
                <div className="hltb-icon">🏆</div>
                <div className="hltb-val">50h</div>
                <div className="hltb-label">100% Completo</div>
              </div>
            </div>
          </div>

          {/* Game Stats Widget */}
          <div className="atlas-card stats-card">
            <div className="atlas-card-header">
              <h3 className="atlas-card-title">Estatísticas do Jogo</h3>
            </div>
            <div className="stats-list">
              <div className="stat-row">
                <span className="stat-name">Avaliação Geral</span>
                <span className="stat-score">★ 4.8 / 5</span>
              </div>
              <div className="stat-row">
                <span className="stat-name">Comunidade Ativa</span>
                <span className="stat-score">+120.4K Jogadores</span>
              </div>
              <div className="stat-row">
                <span className="stat-name">Data de Adição</span>
                <span className="stat-score">
                  {activeDetailGame.added_at
                    ? new Date(activeDetailGame.added_at).toLocaleDateString()
                    : "Recente"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
