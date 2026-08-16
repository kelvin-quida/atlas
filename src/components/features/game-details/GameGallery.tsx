import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useGamepad } from "../../../providers/GamepadContext";
import { GameMedia } from "./useGameMedia";
import { Play, X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";

interface GameGalleryProps {
  media: GameMedia[];
  loading: boolean;
  error: string | null;
  isFocused?: boolean;
  galleryPrevRef?: React.MutableRefObject<(() => void) | null>;
  galleryNextRef?: React.MutableRefObject<(() => void) | null>;
  galleryLightboxRef?: React.MutableRefObject<(() => void) | null>;
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
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const thumbnailContainerRef = useRef<HTMLDivElement | null>(null);
  const { pushLayer, popLayer, registerLayerHandler } = useGamepad();

  // Reset selected index when media list changes (different game loaded)
  useEffect(() => {
    setSelectedIndex(0);
    setLightboxOpen(false);
  }, [media]);

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

  // Bind refs for external controls (e.g. Gamepad loop in App.tsx)
  useEffect(() => {
    if (galleryPrevRef) galleryPrevRef.current = handlePrev;
    if (galleryNextRef) galleryNextRef.current = handleNext;
    if (galleryLightboxRef) galleryLightboxRef.current = () => setLightboxOpen(true);
  }, [galleryPrevRef, galleryNextRef, galleryLightboxRef, handlePrev, handleNext]);

  // Keyboard navigation when gallery is focused
  useEffect(() => {
    if (!isFocused || lightboxOpen) return;
    const handleGalleryKeys = (e: KeyboardEvent) => {
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
    };
    window.addEventListener("keydown", handleGalleryKeys);
    return () => window.removeEventListener("keydown", handleGalleryKeys);
  }, [isFocused, lightboxOpen, handlePrev, handleNext]);

  // Handle global keyboard listeners for navigation and closing lightbox
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
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          handlePrev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          handleNext();
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
  }, [lightboxOpen, handlePrev, handleNext, activeMedia]);

  // Gamepad handler for the Lightbox modal layer
  useEffect(() => {
    if (!lightboxOpen || media.length === 0) return;

    pushLayer("lightbox");

    const unregister = registerLayerHandler("lightbox", (actions) => {
      if (actions.b) {
        setLightboxOpen(false);
        return true;
      }
      if (actions.left) {
        handlePrev();
        return true;
      }
      if (actions.right) {
        handleNext();
        return true;
      }
      return true;
    });

    return () => {
      popLayer("lightbox");
      unregister();
    };
  }, [lightboxOpen, media.length, handlePrev, handleNext, pushLayer, popLayer, registerLayerHandler]);

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
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&rel=0&showinfo=0`}
              title="Game Trailer"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
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
          className={`gallery-hero-content focusable ${activeMedia.type === "screenshot" ? "clickable" : ""}`}
          onClick={() => activeMedia.type === "screenshot" && setLightboxOpen(true)}
          tabIndex={0}
          role={activeMedia.type === "screenshot" ? "button" : "region"}
          aria-label={activeMedia.type === "screenshot" ? "Clique para ampliar imagem" : "Player de vídeo"}
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
