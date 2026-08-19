import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useGamepad } from "../../../providers/GamepadContext";
import { GameMedia } from "./useGameMedia";
import { Play, Pause, Volume2, VolumeX, X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";

interface GameGalleryProps {
  media: GameMedia[];
  loading: boolean;
  error: string | null;
  isFocused?: boolean;
  galleryPrevRef?: React.MutableRefObject<(() => void) | null>;
  galleryNextRef?: React.MutableRefObject<(() => void) | null>;
  galleryLightboxRef?: React.MutableRefObject<(() => void) | null>;
  galleryFullscreenRef?: React.MutableRefObject<(() => void) | null>;
}

function formatTime(secs: number): string {
  if (isNaN(secs) || secs < 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getYoutubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export const GameGallery: React.FC<GameGalleryProps> = ({
  media,
  loading,
  error,
  isFocused,
  galleryPrevRef,
  galleryNextRef,
  galleryLightboxRef,
  galleryFullscreenRef,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);

  // Video playback states for YouTube iframe controls
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(100);

  const heroIframeRef = useRef<HTMLIFrameElement | null>(null);
  const lightboxIframeRef = useRef<HTMLIFrameElement | null>(null);
  const thumbnailContainerRef = useRef<HTMLDivElement | null>(null);
  const { pushLayer, popLayer, registerLayerHandler } = useGamepad();

  // Reset selected index when media list changes (different game loaded)
  useEffect(() => {
    setSelectedIndex(0);
    setLightboxOpen(false);
  }, [media]);

  // Reset video playback states when active media item changes
  useEffect(() => {
    setIsPlaying(true);
    setIsMuted(true);
    setCurrentTime(0);
    setDuration(0);
  }, [selectedIndex, media]);

  const activeMedia = media[selectedIndex];

  // Helper to scroll active thumbnail into view
  useEffect(() => {
    if (thumbnailContainerRef.current) {
      const activeEl = thumbnailContainerRef.current.querySelector(".thumbnail-item.active") as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [selectedIndex]);

  // Navigate slides
  const handlePrev = useCallback(() => {
    if (media.length === 0) return;
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : media.length - 1));
  }, [media.length]);

  const handleNext = useCallback(() => {
    if (media.length === 0) return;
    setSelectedIndex((prev) => (prev < media.length - 1 ? prev + 1 : 0));
  }, [media.length]);

  // Send postMessage command to active YouTube iframe
  const sendYtCommand = useCallback(
    (func: string, args: any[] = []) => {
      const targetIframe = lightboxOpen ? lightboxIframeRef.current : heroIframeRef.current;
      if (targetIframe?.contentWindow) {
        targetIframe.contentWindow.postMessage(
          JSON.stringify({ event: "command", func, args }),
          "*"
        );
      }
    },
    [lightboxOpen]
  );

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      sendYtCommand(next ? "playVideo" : "pauseVideo");
      return next;
    });
  }, [sendYtCommand]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      sendYtCommand(next ? "mute" : "unMute");
      return next;
    });
  }, [sendYtCommand]);

  const seekRelative = useCallback(
    (seconds: number) => {
      setCurrentTime((prevTime) => {
        const newTime = Math.max(0, Math.min(duration || 9999, prevTime + seconds));
        sendYtCommand("seekTo", [newTime, true]);
        return newTime;
      });
    },
    [duration, sendYtCommand]
  );

  const changeVolume = useCallback(
    (delta: number) => {
      setVolume((prevVol) => {
        const newVol = Math.max(0, Math.min(100, prevVol + delta));
        sendYtCommand("setVolume", [newVol]);
        if (newVol > 0 && isMuted) {
          sendYtCommand("unMute");
          setIsMuted(false);
        }
        return newVol;
      });
    },
    [isMuted, sendYtCommand]
  );

  // Listen to YouTube window messages for real-time status updates
  useEffect(() => {
    const handleWindowMessage = (e: MessageEvent) => {
      if (!e.data) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.event === "infoDelivery" && data?.info) {
          if (typeof data.info.currentTime === "number") {
            setCurrentTime(data.info.currentTime);
          }
          if (typeof data.info.duration === "number") {
            setDuration(data.info.duration);
          }
          if (typeof data.info.playerState === "number") {
            if (data.info.playerState === 1) setIsPlaying(true);
            else if (data.info.playerState === 2) setIsPlaying(false);
          }
          if (typeof data.info.muted === "boolean") {
            setIsMuted(data.info.muted);
          }
          if (typeof data.info.volume === "number") {
            setVolume(data.info.volume);
          }
        }
      } catch {
        // Ignore non-json messages
      }
    };

    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, []);

  // Bind refs for external controls (e.g. Gamepad loop in App.tsx)
  useEffect(() => {
    if (galleryPrevRef) galleryPrevRef.current = handlePrev;
    if (galleryNextRef) galleryNextRef.current = handleNext;
    if (galleryLightboxRef) {
      galleryLightboxRef.current = () => {
        if (activeMedia?.type === "trailer") {
          togglePlay();
        } else {
          setLightboxOpen(true);
        }
      };
    }
    if (galleryFullscreenRef) {
      galleryFullscreenRef.current = () => setLightboxOpen(true);
    }
  }, [
    galleryPrevRef,
    galleryNextRef,
    galleryLightboxRef,
    galleryFullscreenRef,
    handlePrev,
    handleNext,
    activeMedia,
    togglePlay,
  ]);

  // Keyboard navigation when gallery is focused
  useEffect(() => {
    if (!isFocused || lightboxOpen) return;
    const handleGalleryKeys = (e: KeyboardEvent) => {
      if (activeMedia?.type === "trailer") {
        if (e.key === " " || e.key === "k" || e.key === "K" || e.key === "Enter") {
          e.preventDefault();
          togglePlay();
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleMute();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          handlePrev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          handleNext();
        } else if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          setLightboxOpen(true);
        }
      } else {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          handlePrev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          handleNext();
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setLightboxOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handleGalleryKeys);
    return () => window.removeEventListener("keydown", handleGalleryKeys);
  }, [isFocused, lightboxOpen, activeMedia, handlePrev, handleNext, togglePlay, toggleMute]);

  // Handle global keyboard listeners for navigation, controlling video, and closing lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in editable element
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active?.hasAttribute("contenteditable")
      ) {
        return;
      }

      if (lightboxOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setLightboxOpen(false);
        } else if (activeMedia?.type === "trailer") {
          if (e.key === " " || e.key === "k" || e.key === "K") {
            e.preventDefault();
            togglePlay();
          } else if (e.key === "m" || e.key === "M") {
            e.preventDefault();
            toggleMute();
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            seekRelative(-5);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            seekRelative(5);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            changeVolume(10);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            changeVolume(-10);
          }
        } else {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            handlePrev();
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            handleNext();
          }
        }
      } else {
        // Keyboard navigation when gallery is in focus (or key shortcuts)
        const galleryContainer = document.querySelector(".atlas-game-gallery");
        if (galleryContainer?.contains(active)) {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            handlePrev();
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            handleNext();
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setLightboxOpen(true);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    lightboxOpen,
    handlePrev,
    handleNext,
    activeMedia,
    togglePlay,
    toggleMute,
    seekRelative,
    changeVolume,
  ]);

  // Gamepad handler for the Lightbox modal layer
  useEffect(() => {
    if (!lightboxOpen || media.length === 0) return;

    pushLayer("lightbox");

    const unregister = registerLayerHandler("lightbox", (actions) => {
      if (actions.b) {
        setLightboxOpen(false);
        return true;
      }

      if (activeMedia?.type === "trailer") {
        if (actions.a) {
          togglePlay();
          return true;
        }
        if (actions.x || actions.y) {
          toggleMute();
          return true;
        }
        if (actions.left) {
          seekRelative(-5);
          return true;
        }
        if (actions.right) {
          seekRelative(5);
          return true;
        }
        if (actions.up) {
          changeVolume(10);
          return true;
        }
        if (actions.down) {
          changeVolume(-10);
          return true;
        }
        if (actions.lb) {
          handlePrev();
          return true;
        }
        if (actions.rb) {
          handleNext();
          return true;
        }
      } else {
        if (actions.left || actions.lb) {
          handlePrev();
          return true;
        }
        if (actions.right || actions.rb) {
          handleNext();
          return true;
        }
      }

      return true;
    });

    return () => {
      popLayer("lightbox");
      unregister();
    };
  }, [
    lightboxOpen,
    media.length,
    activeMedia,
    handlePrev,
    handleNext,
    togglePlay,
    toggleMute,
    seekRelative,
    changeVolume,
    pushLayer,
    popLayer,
    registerLayerHandler,
  ]);

  if (loading) {
    return (
      <div className="atlas-card media-gallery-card loading-skeleton-wrapper">
        <div className="gallery-main-skeleton skeleton" />
        <div className="gallery-thumbnails-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="thumbnail-skeleton skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="atlas-card media-gallery-card gallery-error-card">
        <div className="gallery-error-content">
          <span className="error-icon">⚠️</span>
          <h4>Não foi possível carregar as mídias</h4>
          <p className="error-msg">{error}</p>
        </div>
      </div>
    );
  }

  if (media.length === 0) {
    return null;
  }

  // Render hero content (screenshot vs video)
  const renderHeroContent = (item: GameMedia, isLightbox: boolean = false) => {
    if (item.type === "trailer") {
      const videoId = getYoutubeId(item.url);
      if (videoId) {
        return (
          <div className="gallery-video-container">
            <iframe
              ref={isLightbox ? lightboxIframeRef : heroIframeRef}
              src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&mute=1&controls=1&rel=0&showinfo=0`}
              title="Game Trailer"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onLoad={(e) => {
                try {
                  const cw = e.currentTarget.contentWindow;
                  cw?.postMessage(
                    JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
                    "*"
                  );
                  cw?.postMessage(
                    JSON.stringify({ event: "command", func: "listening", args: [] }),
                    "*"
                  );
                } catch {
                  // Ignore
                }
              }}
            />
            {isLightbox ? (
              <div className="trailer-controls-hud">
                <div className="trailer-hud-status">
                  <span className={`hud-badge ${isPlaying ? "playing" : "paused"}`}>
                    {isPlaying ? "▶ Reproduzindo" : "⏸ Pausado"}
                    {duration > 0 ? ` (${formatTime(currentTime)} / ${formatTime(duration)})` : ""}
                  </span>
                  <span className={`hud-badge ${isMuted ? "muted" : "unmuted"}`}>
                    {isMuted ? "🔇 Mudo" : `🔊 Vol: ${volume}%`}
                  </span>
                </div>
                <div className="trailer-hud-gamepad-hints">
                  <span className="hud-hint">
                    <kbd className="gamepad-key">A</kbd> {isPlaying ? "Pausar" : "Play"}
                  </span>
                  <span className="hud-hint">
                    <kbd className="gamepad-key">X</kbd> {isMuted ? "Desmutar" : "Mutar"}
                  </span>
                  <span className="hud-hint">
                    <kbd className="gamepad-key">← / →</kbd> Seek 5s
                  </span>
                  <span className="hud-hint">
                    <kbd className="gamepad-key">↑ / ↓</kbd> Vol
                  </span>
                  <span className="hud-hint">
                    <kbd className="gamepad-key">LB / RB</kbd> Mídia
                  </span>
                  <span className="hud-hint">
                    <kbd className="gamepad-key">B</kbd> Sair
                  </span>
                </div>
              </div>
            ) : (
              <div className="hero-trailer-controls-bar">
                <button
                  type="button"
                  className="hero-trailer-btn focusable"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  onMouseEnter={(e) => e.stopPropagation()}
                  title={isPlaying ? "Pausar trailer" : "Reproduzir trailer"}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  <span>{isPlaying ? "Pausar" : "Reproduzir"}</span>
                </button>

                <button
                  type="button"
                  className="hero-trailer-btn focusable"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute();
                  }}
                  onMouseEnter={(e) => e.stopPropagation()}
                  title={isMuted ? "Ativar som" : "Mutar som"}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <span>{isMuted ? "Som Ativo" : "Mutado"}</span>
                </button>

                <button
                  type="button"
                  className="hero-trailer-btn focusable"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxOpen(true);
                  }}
                  onMouseEnter={(e) => e.stopPropagation()}
                  title="Expandir em tela cheia"
                >
                  <Maximize2 size={14} />
                  <span>Tela Cheia</span>
                </button>
              </div>
            )}
          </div>
        );
      }
    }

    return (
      <img
        src={item.url}
        alt="Game Media"
        className="gallery-image"
        loading={isLightbox ? "eager" : "lazy"}
      />
    );
  };

  return (
    <div className={`atlas-card media-gallery-card atlas-game-gallery ${isFocused ? "gallery-focused" : ""}`}>
      {/* Gallery Main Hero Section */}
      <div className="gallery-hero-wrapper">
        <button
          className="gallery-expand-btn focusable"
          onClick={() => setLightboxOpen(true)}
          aria-label="Expandir mídia"
          title="Modo Tela Cheia"
          tabIndex={0}
        >
          <Maximize2 size={16} />
        </button>

        {media.length > 1 && (
          <button
            className="gallery-nav-btn prev focusable"
            onClick={handlePrev}
            aria-label="Mídia anterior"
            tabIndex={0}
          >
            <ChevronLeft size={22} />
          </button>
        )}

        <div
          className="gallery-hero-content focusable clickable"
          onClick={() => {
            if (activeMedia.type === "screenshot") {
              setLightboxOpen(true);
            } else if (activeMedia.type === "trailer") {
              togglePlay();
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={activeMedia.type === "screenshot" ? "Clique para ampliar imagem" : "Player de vídeo - Clique para pausar/reproduzir"}
        >
          {renderHeroContent(activeMedia)}
        </div>

        {media.length > 1 && (
          <button
            className="gallery-nav-btn next focusable"
            onClick={handleNext}
            aria-label="Próxima mídia"
            tabIndex={0}
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Gallery Thumbnails List */}
      {media.length > 1 && (
        <div className="gallery-thumbnails-strip" ref={thumbnailContainerRef}>
          {media.map((item, index) => {
            const isActive = index === selectedIndex;
            return (
              <button
                key={index}
                className={`thumbnail-item focusable ${isActive ? "active" : ""}`}
                onClick={() => setSelectedIndex(index)}
                onMouseEnter={() => setSelectedIndex(index)}
                tabIndex={0}
                aria-label={`Ver mídia ${index + 1}`}
              >
                {item.type === "trailer" ? (
                  <div className="thumbnail-video-preview">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="Trailer Thumbnail" loading="lazy" />
                    ) : (
                      <div className="thumbnail-fallback">Trailer</div>
                    )}
                    <div className="thumbnail-play-overlay">
                      <Play size={14} fill="currentColor" />
                    </div>
                  </div>
                ) : (
                  <img src={item.thumbnailUrl || item.url} alt="Screenshot Thumbnail" loading="lazy" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Gallery Lightbox Modal */}
      {lightboxOpen &&
        activeMedia &&
        createPortal(
          <div className="gallery-lightbox-modal" onClick={() => setLightboxOpen(false)}>
            <button
              className="lightbox-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(false);
              }}
              aria-label="Fechar visualização"
            >
              <X size={28} />
            </button>

            {media.length > 1 && (
              <button
                className="lightbox-nav-btn prev"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                aria-label="Mídia anterior"
              >
                <ChevronLeft size={36} />
              </button>
            )}

            <div className="lightbox-content-container" onClick={(e) => e.stopPropagation()}>
              {renderHeroContent(activeMedia, true)}
            </div>

            {media.length > 1 && (
              <button
                className="lightbox-nav-btn next"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                aria-label="Próxima mídia"
              >
                <ChevronRight size={36} />
              </button>
            )}

            <div className="lightbox-indicator">
              {selectedIndex + 1} / {media.length}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
