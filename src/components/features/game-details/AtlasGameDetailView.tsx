import React, { useEffect, useRef } from "react";
import { SteamGame, PlaytimeStats } from "../../../types/game";
import { useGameMedia } from "./useGameMedia";
import { GameGallery } from "./GameGallery";

interface AtlasGameDetailViewProps {
  activeDetailGame: SteamGame;
  detailSelectedIndex: number;
  playtimes: Record<string, PlaytimeStats>;
  setDetailSelectedIndex: (index: number) => void;
  onClose?: () => void;
  onTryLaunchGame: (game: SteamGame) => void;
  onOpenEditMedia: (game: SteamGame) => void;
  galleryPrevRef?: React.MutableRefObject<(() => void) | null>;
  galleryNextRef?: React.MutableRefObject<(() => void) | null>;
  galleryLightboxRef?: React.MutableRefObject<(() => void) | null>;
}

export const AtlasGameDetailView: React.FC<AtlasGameDetailViewProps> = ({
  activeDetailGame,
  detailSelectedIndex,
  playtimes,
  setDetailSelectedIndex,
  onTryLaunchGame,
  onOpenEditMedia,
  galleryPrevRef,
  galleryNextRef,
  galleryLightboxRef,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);
  const { media, loading, error } = useGameMedia(activeDetailGame.appid, activeDetailGame.name);

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
          </div>

          <h1 className="atlas-hero-title">{activeDetailGame.name || "Sem Nome"}</h1>
          {/* Hero Actions Row */}
          <div className="atlas-hero-actions-row">
            <button
              ref={playBtnRef}
              tabIndex={0}
              className={`atlas-detail-play-btn focusable ${detailSelectedIndex === 0 ? "focused" : ""
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
              className={`atlas-detail-options-btn focusable ${detailSelectedIndex === 1 ? "focused" : ""
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
                {playtimes[activeDetailGame.appid]?.formatted || "Não jogado"}
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
        <GameGallery
          media={media}
          loading={loading}
          error={error}
          isFocused={detailSelectedIndex === 2}
          galleryPrevRef={galleryPrevRef}
          galleryNextRef={galleryNextRef}
          galleryLightboxRef={galleryLightboxRef}
        />

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
      </div>        {/* Right Column: Achievements & Stats Sidebar */}
        <div className="atlas-detail-side-col">
          {/* Achievements Widget */}
          <div className="atlas-card sidebar-widget-card">
            <div className="sidebar-widget-header">
              <span className="widget-title-row">
                <span className="widget-chevron">⌃</span>
                <span className="atlas-card-title">Conquistas</span>
              </span>
            </div>
            <div className="achievements-widget-body">
              <div className="achievements-lock-container">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lock-icon">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span className="achievements-lock-text">Faça login para ver conquistas</span>
              </div>
            </div>
          </div>

          {/* Stats Widget */}
          <div className="atlas-card sidebar-widget-card">
            <div className="sidebar-widget-header">
              <span className="widget-title-row">
                <span className="widget-chevron">⌃</span>
                <span className="atlas-card-title">Estatísticas</span>
              </span>
            </div>
            <div className="stats-list">
              <div className="stat-row">
                <span className="stat-name">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Execuções / Downloads
                </span>
                <span className="stat-score">355.447</span>
              </div>
              <div className="stat-row">
                <span className="stat-name">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Jogadores Ativos
                </span>
                <span className="stat-score">2.189</span>
              </div>
              <div className="stat-row">
                <span className="stat-name">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" color="#eab308"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Avaliação Geral
                </span>
                <span className="stat-score">★ 5.0</span>
              </div>
            </div>
          </div>

          {/* How Long To Beat Widget */}
          <div className="atlas-card sidebar-widget-card hltb-card">
            <div className="sidebar-widget-header">
              <span className="widget-title-row">
                <span className="widget-chevron">⌃</span>
                <span className="atlas-card-title">How Long To Beat</span>
              </span>
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
        </div>
      </div>
    </div>
  );
};
