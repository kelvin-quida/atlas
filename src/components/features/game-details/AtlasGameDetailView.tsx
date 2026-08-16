import React, { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { SteamGame, PlaytimeStats } from "../../../types/game";
import { useGameMedia } from "./useGameMedia";
import { GameGallery } from "./GameGallery";
import { GameNews } from "./GameNews";
import { useSteamNews } from "./useSteamNews";
import { useGamepad } from "../../../providers/GamepadContext";

interface AtlasGameDetailViewProps {
  activeDetailGame: SteamGame;
  detailSelectedIndex: number;
  playtimes: Record<string, PlaytimeStats>;
  setDetailSelectedIndex: (index: number | ((prev: number) => number)) => void;
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
  onClose,
  onTryLaunchGame,
  onOpenEditMedia,
  galleryPrevRef,
  galleryNextRef,
  galleryLightboxRef,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "news">("overview");
  const [selectedNewsIndex, setSelectedNewsIndex] = useState<number>(0);
  const openNewsModalRef = useRef<((item?: SteamNewsItem) => void) | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);
  const optionsBtnRef = useRef<HTMLButtonElement | null>(null);
  const newsCardRef = useRef<HTMLDivElement | null>(null);
  const installCardRef = useRef<HTMLDivElement | null>(null);
  const statsCardRef = useRef<HTMLDivElement | null>(null);
  const hltbCardRef = useRef<HTMLDivElement | null>(null);
  const achievementsCardRef = useRef<HTMLDivElement | null>(null);

  const { media, loading, error } = useGameMedia(activeDetailGame.appid, activeDetailGame.name);
  const { news: steamNews, loading: newsLoading, error: newsError } = useSteamNews(activeDetailGame.appid, activeDetailGame.name);
  const { pushLayer, popLayer, registerLayerHandler } = useGamepad();

  // Push gamepad layer for atlas-detail-view
  useEffect(() => {
    pushLayer("atlas-detail-view");
    return () => {
      popLayer("atlas-detail-view");
    };
  }, [pushLayer, popLayer]);

  // Register Gamepad layer handler for navigation
  useEffect(() => {
    const unregister = registerLayerHandler("atlas-detail-view", (actions) => {
      if (actions.b) {
        if (detailSelectedIndex !== 0) {
          setDetailSelectedIndex(0);
        } else if (onClose) {
          onClose();
        }
        return true;
      }

      if (actions.lb) {
        setActiveTab("overview");
        setDetailSelectedIndex(0);
        return true;
      }

      if (actions.rb) {
        setActiveTab("news");
        setDetailSelectedIndex(0);
        setSelectedNewsIndex(0);
        return true;
      }

      if (actions.a) {
        if (detailSelectedIndex === 0) {
          onTryLaunchGame(activeDetailGame);
        } else if (detailSelectedIndex === 1) {
          onOpenEditMedia(activeDetailGame);
        } else if (detailSelectedIndex === 2) {
          if (activeTab === "overview") {
            galleryLightboxRef?.current?.();
          } else if (activeTab === "news") {
            openNewsModalRef.current?.();
          }
        }
        return true;
      }

      if (actions.left) {
        if (activeTab === "overview" && detailSelectedIndex === 2) {
          galleryPrevRef?.current?.();
          return true;
        }
        setDetailSelectedIndex((prev) => {
          if (prev === 1) return 0;
          if (activeTab === "overview") {
            if (prev === 4) return 2;
            if (prev === 5) return 3;
            if (prev === 6) return 3;
          }
          return prev;
        });
        return true;
      }

      if (actions.right) {
        if (activeTab === "overview" && detailSelectedIndex === 2) {
          galleryNextRef?.current?.();
          return true;
        }
        setDetailSelectedIndex((prev) => {
          if (prev === 0) return 1;
          if (activeTab === "overview") {
            if (prev === 2) return 4;
            if (prev === 3) return 6;
          }
          return prev;
        });
        return true;
      }

      if (actions.up) {
        if (activeTab === "news" && detailSelectedIndex === 2) {
          if (selectedNewsIndex > 0) {
            setSelectedNewsIndex((prev) => prev - 1);
          } else {
            setDetailSelectedIndex(0);
          }
        } else {
          setDetailSelectedIndex((prev) => {
            if (prev === 2) return 0;
            if (activeTab === "overview") {
              if (prev === 3) return 2;
              if (prev === 4) return 1;
              if (prev === 5) return 4;
              if (prev === 6) return 5;
            }
            return 0;
          });
        }
        return true;
      }

      if (actions.down) {
        if (activeTab === "news" && detailSelectedIndex === 2) {
          if (selectedNewsIndex < steamNews.length - 1) {
            setSelectedNewsIndex((prev) => prev + 1);
          }
        } else {
          setDetailSelectedIndex((prev) => {
            if (prev === 0 || prev === 1) return 2;
            if (activeTab === "overview") {
              if (prev === 2) return 3;
              if (prev === 4) return 5;
              if (prev === 5) return 6;
            }
            return prev;
          });
        }
        return true;
      }

      return false;
    });

    return () => unregister();
  }, [
    activeTab,
    detailSelectedIndex,
    selectedNewsIndex,
    steamNews,
    activeDetailGame,
    onClose,
    onTryLaunchGame,
    onOpenEditMedia,
    galleryPrevRef,
    galleryNextRef,
    galleryLightboxRef,
    registerLayerHandler,
    setDetailSelectedIndex,
  ]);

  // Keyboard navigation listener inside AtlasGameDetailView
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector(".news-modal-overlay")) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (detailSelectedIndex !== 0) {
          setDetailSelectedIndex(0);
        } else if (onClose) {
          onClose();
        }
      } else if (e.key === "q" || e.key === "Q") {
        setActiveTab("overview");
        setDetailSelectedIndex(0);
      } else if (e.key === "e" || e.key === "E") {
        setActiveTab("news");
        setDetailSelectedIndex(0);
        setSelectedNewsIndex(0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeTab === "overview" && detailSelectedIndex === 2) {
          galleryPrevRef?.current?.();
        } else {
          setDetailSelectedIndex((prev) => {
            if (prev === 1) return 0;
            if (activeTab === "overview") {
              if (prev === 4) return 2;
              if (prev === 5) return 3;
              if (prev === 6) return 3;
            }
            return prev;
          });
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (activeTab === "overview" && detailSelectedIndex === 2) {
          galleryNextRef?.current?.();
        } else {
          setDetailSelectedIndex((prev) => {
            if (prev === 0) return 1;
            if (activeTab === "overview") {
              if (prev === 2) return 4;
              if (prev === 3) return 6;
            }
            return prev;
          });
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (activeTab === "news" && detailSelectedIndex === 2) {
          if (selectedNewsIndex > 0) {
            setSelectedNewsIndex((prev) => prev - 1);
          } else {
            setDetailSelectedIndex(0);
          }
        } else {
          setDetailSelectedIndex((prev) => {
            if (prev === 2) return 0;
            if (activeTab === "overview") {
              if (prev === 3) return 2;
              if (prev === 4) return 1;
              if (prev === 5) return 4;
              if (prev === 6) return 5;
            }
            return 0;
          });
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (activeTab === "news" && detailSelectedIndex === 2) {
          if (selectedNewsIndex < steamNews.length - 1) {
            setSelectedNewsIndex((prev) => prev + 1);
          }
        } else {
          setDetailSelectedIndex((prev) => {
            if (prev === 0 || prev === 1) return 2;
            if (activeTab === "overview") {
              if (prev === 2) return 3;
              if (prev === 4) return 5;
              if (prev === 5) return 6;
            }
            return prev;
          });
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (detailSelectedIndex === 0) {
          onTryLaunchGame(activeDetailGame);
        } else if (detailSelectedIndex === 1) {
          onOpenEditMedia(activeDetailGame);
        } else if (detailSelectedIndex === 2) {
          if (activeTab === "overview") {
            galleryLightboxRef?.current?.();
          } else if (activeTab === "news") {
            openNewsModalRef.current?.();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeTab,
    detailSelectedIndex,
    selectedNewsIndex,
    steamNews,
    activeDetailGame,
    onClose,
    onTryLaunchGame,
    onOpenEditMedia,
    galleryPrevRef,
    galleryNextRef,
    galleryLightboxRef,
    setDetailSelectedIndex,
  ]);

  // Scroll focused element into view smoothly (scroll smoothly to top when hero banner is focused)
  useEffect(() => {
    if (detailSelectedIndex === 0 || detailSelectedIndex === 1) {
      if (containerRef.current) {
        containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else {
      let targetEl: HTMLElement | null = null;
      if (activeTab === "overview") {
        if (detailSelectedIndex === 2) {
          const galleryEl = containerRef.current?.querySelector(".atlas-game-gallery");
          if (galleryEl) targetEl = galleryEl as HTMLElement;
        } else if (detailSelectedIndex === 3) targetEl = installCardRef.current;
        else if (detailSelectedIndex === 4) targetEl = statsCardRef.current;
        else if (detailSelectedIndex === 5) targetEl = hltbCardRef.current;
        else if (detailSelectedIndex === 6) targetEl = achievementsCardRef.current;
      } else {
        if (detailSelectedIndex === 2) targetEl = newsCardRef.current;
      }

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [detailSelectedIndex, activeTab]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    if (playBtnRef.current) {
      playBtnRef.current.focus({ preventScroll: true });
    }
  }, [activeDetailGame]);

  const rawBg = activeDetailGame.bg_url || activeDetailGame.image_url || "";
  const heroBgUrl = rawBg
    ? (rawBg.startsWith("http://") || rawBg.startsWith("https://") || rawBg.startsWith("data:")
        ? rawBg
        : convertFileSrc(rawBg))
    : "";

  return (
    <div className="atlas-game-detail-view hydra-design-view" ref={containerRef}>
      {/* Hero Header Banner Card with Hydra Style Backdrop */}
      <div
        className="atlas-detail-hero-banner hydra-hero-banner"
        style={{
          backgroundImage: heroBgUrl ? `url("${heroBgUrl}")` : undefined,
        }}
      >
        <div className="hydra-hero-gradient-overlay" />
        <div className="atlas-hero-main-info hydra-hero-info">
          <div className="atlas-hero-badges">
            <span className="platform-badge hydra-platform-badge">
              🎮{" "}
              {activeDetailGame.isCustom
                ? "Jogo Personalizado (PC)"
                : "Biblioteca Steam"}
            </span>
          </div>

          <h1 className="atlas-hero-title hydra-hero-title">
            {activeDetailGame.name || "Sem Nome"}
          </h1>

          <p className="hydra-hero-description">
            {activeDetailGame.isCustom
              ? "Jogo adicionado à sua biblioteca pessoal do Atlas. Execute diretamente com suporte total a controles e personalizações."
              : `Entre no universo fascinante de ${activeDetailGame.name || "seu jogo"}. Enfrente grandes desafios, explore cenários épicos e acompanhe cada conquista da sua jornada.`}
          </p>

          {/* Hero Actions Row with Hydra Pill Buttons */}
          <div className="atlas-hero-actions-row hydra-actions-row">
            <button
              ref={playBtnRef}
              tabIndex={0}
              className={`atlas-detail-play-btn hydra-btn-primary focusable ${
                detailSelectedIndex === 0 ? "focused" : ""
              }`}
              onClick={() => onTryLaunchGame(activeDetailGame)}
              onMouseEnter={() => setDetailSelectedIndex(0)}
            >
              <div className="hydra-btn-icon-circle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <span>Jogar</span>
            </button>

            <button
              ref={optionsBtnRef}
              tabIndex={0}
              className={`atlas-detail-options-btn hydra-btn-secondary focusable ${
                detailSelectedIndex === 1 ? "focused" : ""
              }`}
              onClick={() => onOpenEditMedia(activeDetailGame)}
              onMouseEnter={() => setDetailSelectedIndex(1)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Opções</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hydra Playtime / Metrics Strip */}
      <div className="hydra-metrics-strip">
        <div className="hydra-metrics-content">
          <span className="hydra-playtime-main">
            Tempo de jogo:{" "}
            <strong>
              {playtimes[activeDetailGame.appid]?.formatted || "0 minutos"}
            </strong>
          </span>
          <span className="hydra-playtime-sub">
            {activeDetailGame.last_played
              ? `Última vez jogado em ${new Date(
                  activeDetailGame.last_played
                ).toLocaleDateString()}`
              : "Você ainda não jogou"}
          </span>
        </div>
      </div>

      {/* Detail View Navigation Tabs */}
      <div className="atlas-detail-tabs-nav">
        <button
          type="button"
          className={`detail-tab-item ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("overview");
            setDetailSelectedIndex(0);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Visão Geral</span>
          <span className="tab-key-hint">L1</span>
        </button>

        <button
          type="button"
          className={`detail-tab-item ${activeTab === "news" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("news");
            setDetailSelectedIndex(0);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8" />
            <path d="M15 18h-5" />
            <path d="M10 6h8v4h-8z" />
          </svg>
          <span>Notícias & Patches</span>
          {steamNews.length > 0 && (
            <span className="tab-badge">{steamNews.length}</span>
          )}
          <span className="tab-key-hint">R1</span>
        </button>
      </div>

      {/* Tab Content Rendering */}
      {activeTab === "overview" ? (
        <div className="atlas-detail-content-grid hydra-content-grid">
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
            <div
              ref={installCardRef}
              tabIndex={0}
              className={`atlas-card install-info-card hydra-card focusable ${
                detailSelectedIndex === 3 ? "focused" : ""
              }`}
              onMouseEnter={() => setDetailSelectedIndex(3)}
            >
              <div className="atlas-card-header">
                <h3 className="atlas-card-title">Informações do Sistema</h3>
              </div>
              <div className="install-info-list hydra-info-list">
                <div className="info-row">
                  <span className="info-key">Executável:</span>
                  <span
                    className="info-val"
                    title={activeDetailGame.exe_path || "Padrão do Sistema"}
                  >
                    {activeDetailGame.exe_path || "Padrão do Sistema"}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-key">Plataforma:</span>
                  <span className="info-val">
                    {activeDetailGame.isCustom ? "Atalho PC" : "Steam"}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-key">ID do Jogo:</span>
                  <span className="info-val">{activeDetailGame.appid}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Achievements & Hydra Stats Sidebar */}
          <div className="atlas-detail-side-col hydra-side-col">
            {/* Stats Widget (Matching Hydra "Game Stats") */}
            <div
              ref={statsCardRef}
              tabIndex={0}
              className={`atlas-card sidebar-widget-card hydra-card focusable ${
                detailSelectedIndex === 4 ? "focused" : ""
              }`}
              onMouseEnter={() => setDetailSelectedIndex(4)}
            >
              <div className="sidebar-widget-header">
                <span className="widget-title-row">
                  <span className="atlas-card-title">Estatísticas do Jogo</span>
                </span>
              </div>
              <div className="stats-list hydra-stats-table">
                <div className="stat-row hydra-stat-row">
                  <span className="stat-name">Avaliação</span>
                  <span className="stat-score hydra-rating-val">★ 5.0</span>
                </div>
                <div className="stat-row hydra-stat-row">
                  <span className="stat-name">Downloads</span>
                  <span className="stat-score">700K</span>
                </div>
                <div className="stat-row hydra-stat-row">
                  <span className="stat-name">Jogando Agora</span>
                  <span className="stat-score">1.6K</span>
                </div>
              </div>
            </div>

            {/* How Long To Beat Widget (Matching Hydra "How Long to Beat") */}
            <div
              ref={hltbCardRef}
              tabIndex={0}
              className={`atlas-card sidebar-widget-card hltb-card hydra-card focusable ${
                detailSelectedIndex === 5 ? "focused" : ""
              }`}
              onMouseEnter={() => setDetailSelectedIndex(5)}
            >
              <div className="sidebar-widget-header">
                <span className="widget-title-row">
                  <span className="atlas-card-title">How Long to Beat</span>
                </span>
              </div>
              <div className="hltb-grid hydra-hltb-table">
                <div className="stat-row hydra-stat-row">
                  <span className="stat-name">História Principal</span>
                  <span className="stat-score">12½h</span>
                </div>
                <div className="stat-row hydra-stat-row">
                  <span className="stat-name">Principal + Extras</span>
                  <span className="stat-score">24h</span>
                </div>
                <div className="stat-row hydra-stat-row">
                  <span className="stat-name">100% Completo</span>
                  <span className="stat-score">50h</span>
                </div>
              </div>
            </div>

            {/* Achievements Widget */}
            <div
              ref={achievementsCardRef}
              tabIndex={0}
              className={`atlas-card sidebar-widget-card hydra-card focusable ${
                detailSelectedIndex === 6 ? "focused" : ""
              }`}
              onMouseEnter={() => setDetailSelectedIndex(6)}
            >
              <div className="sidebar-widget-header">
                <span className="widget-title-row">
                  <span className="atlas-card-title">Conquistas</span>
                </span>
              </div>
              <div className="achievements-widget-body">
                <div className="achievements-lock-container">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lock-icon"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span className="achievements-lock-text">
                    Conquistas indisponíveis
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={newsCardRef}
          className="atlas-detail-news-tab-container"
          onMouseEnter={() => setDetailSelectedIndex(2)}
        >
          <GameNews
            news={steamNews}
            loading={newsLoading}
            error={newsError}
            isFocused={detailSelectedIndex === 2}
            selectedNewsIndex={selectedNewsIndex}
            onSelectNewsIndex={setSelectedNewsIndex}
            openNewsModalRef={openNewsModalRef}
          />
        </div>
      )}
    </div>
  );
};
