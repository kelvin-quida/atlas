import React, { useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { SteamGame, PlaytimeStats } from "../../../types/game";
import { useGameMedia } from "./useGameMedia";
import { GameGallery } from "./GameGallery";
import { GameNews } from "./GameNews";
import { useSteamNews, SteamNewsItem } from "./useSteamNews";
import { GameReviews, GameReviewsNavHandler } from "./GameReviews";
import { useSteamReviews } from "./useSteamReviews";
import { useGameMetadata } from "./useGameMetadata";
import { GameStreamers } from "./GameStreamers";
import { useTwitchStreams } from "./useTwitchStreams";
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
  galleryFullscreenRef?: React.MutableRefObject<(() => void) | null>;
}

function formatLastPlayed(lastPlayedStr?: string): string {
  if (!lastPlayedStr) return "Você ainda não jogou";

  const d = new Date(lastPlayedStr);
  if (isNaN(d.getTime())) return "Você ainda não jogou";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (targetDate.getTime() === today.getTime()) {
    return "Última vez jogado: Hoje";
  }
  if (targetDate.getTime() === yesterday.getTime()) {
    return "Última vez jogado: Ontem";
  }
  return `Última vez jogado em ${d.toLocaleDateString()}`;
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
  galleryFullscreenRef,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "news" | "reviews" | "streamers">("overview");
  const [selectedNewsIndex, setSelectedNewsIndex] = useState<number>(0);
  const [selectedReviewIndex, setSelectedReviewIndex] = useState<number>(0);
  const [selectedStreamIndex, setSelectedStreamIndex] = useState<number>(0);
  const [filteredReviewCount, setFilteredReviewCount] = useState<number>(0);
  const openNewsModalRef = useRef<((item?: SteamNewsItem) => void) | null>(null);
  const openReviewModalRef = useRef<((index?: number) => void) | null>(null);
  const reviewsNavRef = useRef<GameReviewsNavHandler | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);
  const optionsBtnRef = useRef<HTMLButtonElement | null>(null);
  const newsCardRef = useRef<HTMLDivElement | null>(null);
  const reviewsCardRef = useRef<HTMLDivElement | null>(null);
  const streamersCardRef = useRef<HTMLDivElement | null>(null);
  const installCardRef = useRef<HTMLDivElement | null>(null);
  const statsCardRef = useRef<HTMLDivElement | null>(null);
  const hltbCardRef = useRef<HTMLDivElement | null>(null);
  const achievementsCardRef = useRef<HTMLDivElement | null>(null);

  const { media, loading, error } = useGameMedia(activeDetailGame.appid, activeDetailGame.name);
  const { news: steamNews, loading: newsLoading, error: newsError } = useSteamNews(activeDetailGame.appid, activeDetailGame.name);
  const {
    reviews: steamReviews,
    loading: reviewsLoading,
    loadingMore: reviewsLoadingMore,
    error: reviewsError,
    hasMore: reviewsHasMore,
    loadMore: loadReviewsMore,
  } = useSteamReviews(activeDetailGame.appid, activeDetailGame.name);
  const {
    streams: twitchStreams,
    loading: streamersLoading,
    error: streamersError,
    refetch: refetchStreamers,
  } = useTwitchStreams(activeDetailGame.name);
  const { metadata } = useGameMetadata(activeDetailGame.appid);
  const { pushLayer, popLayer, registerLayerHandler } = useGamepad();

  const cleanDescription = (html?: string) => {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, "").trim();
  };

  const getReviewSummaryColor = (reviewSummary?: string, rating?: number): string => {
    if (reviewSummary) {
      const s = reviewSummary.toLowerCase();
      if (s.includes("negativ")) return "#ef5350"; // Red
      if (s.includes("neutra") || s.includes("mista") || s.includes("mixed")) return "#ffb74d"; // Orange/Yellow
      if (s.includes("extremamente positiva") || s.includes("overwhelmingly positive")) return "#4caf50"; // Bright Green
      if (s.includes("positiva") || s.includes("positive")) return "#66bb6a"; // Positive Green

      const match = s.match(/\((\d+)%\)/);
      if (match) {
        const pct = parseInt(match[1], 10);
        if (pct >= 70) return "#66bb6a";
        if (pct >= 40) return "#ffb74d";
        return "#ef5350";
      }
      return "#66bb6a";
    }

    if (typeof rating === "number") {
      const val = rating > 10 ? rating : rating * 10;
      if (val >= 75) return "#66bb6a";
      if (val >= 50) return "#ffb74d";
      return "#ef5350";
    }

    return "#b0bec5";
  };

  const [showTagsModal, setShowTagsModal] = useState<boolean>(false);

  // Push gamepad layer for atlas-detail-view
  useEffect(() => {
    pushLayer("atlas-detail-view");
    return () => {
      popLayer("atlas-detail-view");
    };
  }, [pushLayer, popLayer]);

  const getStreamGridColumns = (): number => {
    if (!containerRef.current) return 3;
    const gridEl = containerRef.current.querySelector(".streamers-grid");
    if (!gridEl) return 3;
    const computed = window.getComputedStyle(gridEl);
    const gridTemplateColumns = computed.getPropertyValue("grid-template-columns");
    if (gridTemplateColumns) {
      const cols = gridTemplateColumns.split(" ").filter(Boolean).length;
      if (cols > 0) return cols;
    }
    return 3;
  };

  // Register Gamepad layer handler for navigation
  useEffect(() => {
    const unregister = registerLayerHandler("atlas-detail-view", (actions) => {
      if ((window as any).__atlasTwitchOpen) return true;

      if (showTagsModal) {
        if (actions.b || actions.a) {
          setShowTagsModal(false);
          return true;
        }
        return true;
      }

      if (actions.b) {
        if (document.querySelector(".review-modal-overlay")) {
          const closeBtn = document.querySelector(".review-modal-overlay .modal-close-btn") as HTMLButtonElement;
          if (closeBtn) closeBtn.click();
          return true;
        }
        if (detailSelectedIndex !== 0) {
          setDetailSelectedIndex(0);
        } else if (onClose) {
          onClose();
        }
        return true;
      }

      if (actions.lb) {
        setActiveTab((prev) => {
          if (prev === "streamers") return "reviews";
          if (prev === "reviews") return "news";
          return "overview";
        });
        setDetailSelectedIndex(0);
        return true;
      }

      if (actions.rb) {
        setActiveTab((prev) => {
          if (prev === "overview") return "news";
          if (prev === "news") return "reviews";
          return "streamers";
        });
        setDetailSelectedIndex(0);
        if (activeTab === "overview") setSelectedNewsIndex(0);
        if (activeTab === "news") setSelectedReviewIndex(0);
        if (activeTab === "reviews") setSelectedStreamIndex(0);
        return true;
      }

      if (actions.x || actions.y) {
        if (detailSelectedIndex === 2 && activeTab === "overview") {
          galleryFullscreenRef?.current?.();
          return true;
        }
      }

      if (actions.a) {
        if (detailSelectedIndex === 0) {
          onTryLaunchGame(activeDetailGame);
        } else if (detailSelectedIndex === 1) {
          onOpenEditMedia(activeDetailGame);
        } else if (detailSelectedIndex === 7) {
          setShowTagsModal(true);
        } else if (detailSelectedIndex === 2) {
          if (activeTab === "overview") {
            galleryLightboxRef?.current?.();
          } else if (activeTab === "news") {
            openNewsModalRef.current?.();
          } else if (activeTab === "reviews") {
            if (reviewsNavRef.current?.handleAction("a")) return true;
          } else if (activeTab === "streamers") {
            const stream = twitchStreams[selectedStreamIndex];
            if (stream) {
              const streamUrl = `https://www.twitch.tv/${stream.user_login}`;
              invoke("open_twitch_stream_url", { url: streamUrl })
                .then(() => window.dispatchEvent(new Event("atlas:twitch-opened")))
                .catch(() => window.open(streamUrl, "_blank"));
            }
          }
        }
        return true;
      }

      if (actions.left) {
        if (activeTab === "overview" && detailSelectedIndex === 2) {
          galleryPrevRef?.current?.();
          return true;
        }
        if (activeTab === "reviews" && detailSelectedIndex === 2) {
          if (reviewsNavRef.current?.handleAction("left")) return true;
        }
        if (activeTab === "streamers" && detailSelectedIndex === 2) {
          if (selectedStreamIndex > 0) {
            setSelectedStreamIndex((prev) => prev - 1);
          }
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
        if (activeTab === "reviews" && detailSelectedIndex === 2) {
          if (reviewsNavRef.current?.handleAction("right")) return true;
        }
        if (activeTab === "streamers" && detailSelectedIndex === 2) {
          if (selectedStreamIndex < twitchStreams.length - 1) {
            setSelectedStreamIndex((prev) => prev + 1);
          }
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
        } else if (activeTab === "reviews" && detailSelectedIndex === 2) {
          if (reviewsNavRef.current?.handleAction("up")) {
            return true;
          }
          setDetailSelectedIndex(0);
        } else if (activeTab === "streamers" && detailSelectedIndex === 2) {
          const cols = getStreamGridColumns();
          if (selectedStreamIndex >= cols) {
            setSelectedStreamIndex((prev) => prev - cols);
          } else {
            setDetailSelectedIndex(0);
          }
          return true;
        } else {
          setDetailSelectedIndex((prev) => {
            if (prev === 0 || prev === 1) return 7;
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
        } else if (activeTab === "reviews" && detailSelectedIndex === 2) {
          if (reviewsNavRef.current?.handleAction("down")) return true;
        } else if (activeTab === "streamers" && detailSelectedIndex === 2) {
          const cols = getStreamGridColumns();
          if (selectedStreamIndex + cols < twitchStreams.length) {
            setSelectedStreamIndex((prev) => prev + cols);
          } else if (selectedStreamIndex < twitchStreams.length - 1) {
            setSelectedStreamIndex(twitchStreams.length - 1);
          }
          return true;
        } else {
          setDetailSelectedIndex((prev) => {
            if (prev === 7) return 0;
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
    selectedReviewIndex,
    selectedStreamIndex,
    twitchStreams,
    filteredReviewCount,
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

      // If Twitch webview is currently open, let App.tsx handle the Escape
      if ((window as any).__atlasTwitchOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (detailSelectedIndex !== 0) {
          setDetailSelectedIndex(0);
        } else if (onClose) {
          onClose();
        }
      } else if (e.key === "q" || e.key === "Q") {
        setActiveTab((prev) => (prev === "reviews" ? "news" : "overview"));
        setDetailSelectedIndex(0);
      } else if (e.key === "e" || e.key === "E") {
        setActiveTab((prev) => (prev === "overview" ? "news" : "reviews"));
        setDetailSelectedIndex(0);
        if (activeTab === "overview") setSelectedNewsIndex(0);
        if (activeTab === "news") setSelectedReviewIndex(0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeTab === "overview" && detailSelectedIndex === 2) {
          galleryPrevRef?.current?.();
        } else if (activeTab === "reviews" && detailSelectedIndex === 2) {
          reviewsNavRef.current?.handleAction("left");
        } else if (activeTab === "streamers" && detailSelectedIndex === 2) {
          if (selectedStreamIndex > 0) {
            setSelectedStreamIndex((prev) => prev - 1);
          }
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
        } else if (activeTab === "reviews" && detailSelectedIndex === 2) {
          reviewsNavRef.current?.handleAction("right");
        } else if (activeTab === "streamers" && detailSelectedIndex === 2) {
          if (selectedStreamIndex < twitchStreams.length - 1) {
            setSelectedStreamIndex((prev) => prev + 1);
          }
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
        } else if (activeTab === "reviews" && detailSelectedIndex === 2) {
          if (!reviewsNavRef.current?.handleAction("up")) {
            setDetailSelectedIndex(0);
          }
        } else if (activeTab === "streamers" && detailSelectedIndex === 2) {
          const cols = getStreamGridColumns();
          if (selectedStreamIndex >= cols) {
            setSelectedStreamIndex((prev) => prev - cols);
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
        } else if (activeTab === "reviews" && detailSelectedIndex === 2) {
          reviewsNavRef.current?.handleAction("down");
        } else if (activeTab === "streamers" && detailSelectedIndex === 2) {
          const cols = getStreamGridColumns();
          if (selectedStreamIndex + cols < twitchStreams.length) {
            setSelectedStreamIndex((prev) => prev + cols);
          } else if (selectedStreamIndex < twitchStreams.length - 1) {
            setSelectedStreamIndex(twitchStreams.length - 1);
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
          } else if (activeTab === "reviews") {
            reviewsNavRef.current?.handleAction("a");
          } else if (activeTab === "streamers") {
            const stream = twitchStreams[selectedStreamIndex];
            if (stream) {
              const streamUrl = `https://www.twitch.tv/${stream.user_login}`;
              invoke("open_twitch_stream_url", { url: streamUrl })
                .then(() => window.dispatchEvent(new Event("atlas:twitch-opened")))
                .catch(() => window.open(streamUrl, "_blank"));
            }
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
    selectedStreamIndex,
    twitchStreams,
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
          <div
            tabIndex={0}
            className={`atlas-hero-badges focusable ${
              detailSelectedIndex === 7 ? "focused" : ""
            }`}
            onClick={() => setShowTagsModal(true)}
            onMouseEnter={() => setDetailSelectedIndex(7)}
            style={{ cursor: "pointer" }}
            title="Clique ou pressione (A) para ver todas as tags"
          >
            {metadata?.genres && metadata.genres.slice(0, 5).map((genre) => (
              <span key={genre} className="platform-badge hydra-platform-badge minimalist-tag">
                {genre}
              </span>
            ))}
            {metadata?.genres && metadata.genres.length > 3 && (
              <span
                className="platform-badge hydra-platform-badge minimalist-tag minimalist-tag-more"
              >
                +{metadata.genres.length - 5}
              </span>
            )}
            {detailSelectedIndex === 7 && (
              <span className="tags-expand-hint">(A) Ver todas</span>
            )}
          </div>

          <h1 className="atlas-hero-title hydra-hero-title">
            {activeDetailGame.name || "Sem Nome"}
          </h1>

          <p className="hydra-hero-description">
            {metadata?.description
              ? cleanDescription(metadata.description)
              : activeDetailGame.isCustom
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
            {formatLastPlayed(activeDetailGame.last_played)}
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
        </button>

        <button
          type="button"
          className={`detail-tab-item ${activeTab === "news" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("news");
            setDetailSelectedIndex(0);
            setSelectedNewsIndex(0);
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
        </button>

        <button
          type="button"
          className={`detail-tab-item ${activeTab === "reviews" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("reviews");
            setDetailSelectedIndex(0);
            setSelectedReviewIndex(0);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Análises dos Jogadores</span>
          {steamReviews.length > 0 && (
            <span className="tab-badge">{steamReviews.length}</span>
          )}
        </button>

        <button
          type="button"
          className={`detail-tab-item ${activeTab === "streamers" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("streamers");
            setDetailSelectedIndex(0);
            setSelectedStreamIndex(0);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 2H3v16h5v4l4-4h9V2z" />
            <path d="M11 11V7" />
            <path d="M16 11V7" />
          </svg>
          <span>Streamers</span>
          {twitchStreams.length > 0 && (
            <span className="tab-badge tab-badge-twitch">{twitchStreams.length}</span>
          )}
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
              galleryFullscreenRef={galleryFullscreenRef}
            />

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
                  <span className="atlas-card-title">Informações do Jogo</span>
                </span>
              </div>
              <div className="stats-list hydra-stats-table">
                <div className="stat-row hydra-stat-row">
                  <span className="stat-name">Avaliação Geral</span>
                  <span
                    className="stat-score hydra-rating-val"
                    style={{
                      color: getReviewSummaryColor(metadata?.review_summary, metadata?.rating),
                      fontWeight: "600",
                    }}
                  >
                    {metadata?.review_summary
                      ? metadata.review_summary
                      : metadata?.rating
                      ? `★ ${metadata.rating}`
                      : "Sem análises suficientes"}
                  </span>
                </div>
                {metadata?.developer && (
                  <div className="stat-row hydra-stat-row">
                    <span className="stat-name">Desenvolvedora</span>
                    <span className="stat-score" title={metadata.developer}>
                      {metadata.developer.length > 18
                        ? `${metadata.developer.substring(0, 18)}...`
                        : metadata.developer}
                    </span>
                  </div>
                )}
                {metadata?.release_date && (
                  <div className="stat-row hydra-stat-row">
                    <span className="stat-name">Lançamento</span>
                    <span className="stat-score">{metadata.release_date}</span>
                  </div>
                )}
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
      ) : activeTab === "news" ? (
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
      ) : activeTab === "reviews" ? (
        <div
          ref={reviewsCardRef}
          className="atlas-detail-reviews-tab-container"
          onMouseEnter={() => setDetailSelectedIndex(2)}
        >
          <GameReviews
            ref={reviewsNavRef}
            reviews={steamReviews}
            loading={reviewsLoading}
            loadingMore={reviewsLoadingMore}
            error={reviewsError}
            hasMore={reviewsHasMore}
            onLoadMore={loadReviewsMore}
            isFocused={detailSelectedIndex === 2}
            selectedReviewIndex={selectedReviewIndex}
            onSelectReviewIndex={setSelectedReviewIndex}
            openReviewModalRef={openReviewModalRef}
            onFilteredCountChange={setFilteredReviewCount}
          />
        </div>
      ) : (
        <div
          ref={streamersCardRef}
          className="atlas-detail-streamers-tab-container"
          onMouseMove={(e) => {
            if (e.movementX !== 0 || e.movementY !== 0) {
              setDetailSelectedIndex(2);
            }
          }}
        >
          <GameStreamers
            streams={twitchStreams}
            loading={streamersLoading}
            error={streamersError}
            isFocused={detailSelectedIndex === 2}
            selectedStreamIndex={selectedStreamIndex}
            onSelectStreamIndex={setSelectedStreamIndex}
            gameName={activeDetailGame.name}
            onRefetch={refetchStreamers}
          />
        </div>
      )}

      {/* Expanded Tags Modal */}
      {showTagsModal && metadata?.genres && (
        <div className="tags-modal-overlay" onClick={() => setShowTagsModal(false)}>
          <div className="tags-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="tags-modal-header">
              <h3>Marcadores & Gêneros — {activeDetailGame.name}</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowTagsModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="tags-modal-body">
              {metadata.genres.map((genre) => (
                <span key={genre} className="tags-modal-chip">
                  {genre}
                </span>
              ))}
            </div>
            <div className="tags-modal-footer">
              <span className="gamepad-hint">(B) / Esc Fechar</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
