import React, { useState, useMemo, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { createPortal } from "react-dom";
import { SteamReviewItem } from "./useSteamReviews";

type FilterType = "all" | "positive" | "negative";
type SortBy = "helpful" | "playtime" | "recent" | "funny";

export interface GameReviewsNavHandler {
  handleAction: (action: "up" | "down" | "left" | "right" | "a" | "b") => boolean;
}

interface GameReviewsProps {
  reviews: SteamReviewItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  isFocused?: boolean;
  selectedReviewIndex: number;
  onSelectReviewIndex: (index: number) => void;
  openReviewModalRef?: React.MutableRefObject<((index?: number) => void) | null>;
  onFilteredCountChange?: (count: number) => void;
}

export const GameReviews = forwardRef<GameReviewsNavHandler, GameReviewsProps>(({
  reviews,
  loading,
  loadingMore,
  error,
  hasMore,
  onLoadMore,
  isFocused = false,
  selectedReviewIndex,
  onSelectReviewIndex,
  openReviewModalRef,
  onFilteredCountChange,
}, ref) => {
  const [activeModalReview, setActiveModalReview] = useState<SteamReviewItem | null>(null);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<SortBy>("helpful");
  const [focusedZone, setFocusedZone] = useState<"filter" | "grid" | "load_more">("filter");
  const [selectedFilterIndex, setSelectedFilterIndex] = useState<number>(0);

  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const filterBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const loadMoreBtnRef = useRef<HTMLButtonElement | null>(null);
  const modalScrollRef = useRef<HTMLDivElement | null>(null);

  // Filter and sort reviews
  const processedReviews = useMemo(() => {
    let list = [...reviews];
    if (filterType === "positive") {
      list = list.filter((r) => r.voted_up);
    } else if (filterType === "negative") {
      list = list.filter((r) => !r.voted_up);
    }

    if (sortBy === "helpful") {
      list.sort((a, b) => b.votes_up - a.votes_up);
    } else if (sortBy === "playtime") {
      list.sort((a, b) => b.playtime_forever_hours - a.playtime_forever_hours);
    } else if (sortBy === "recent") {
      list.sort((a, b) => b.timestamp_created - a.timestamp_created);
    } else if (sortBy === "funny") {
      list.sort((a, b) => b.votes_funny - a.votes_funny);
    }

    return list;
  }, [reviews, filterType, sortBy]);

  // Update parent when filtered length changes
  useEffect(() => {
    if (onFilteredCountChange) {
      onFilteredCountChange(processedReviews.length);
    }
  }, [processedReviews.length, onFilteredCountChange]);

  // Connect openReviewModalRef
  useEffect(() => {
    if (openReviewModalRef) {
      openReviewModalRef.current = (idx?: number) => {
        const targetIndex = idx !== undefined ? idx : selectedReviewIndex;
        if (processedReviews[targetIndex]) {
          setActiveModalReview(processedReviews[targetIndex]);
        }
      };
    }
  }, [openReviewModalRef, selectedReviewIndex, processedReviews]);

  // Scroll focused elements into view
  useEffect(() => {
    if (!isFocused) return;

    if (focusedZone === "grid" && cardRefs.current[selectedReviewIndex]) {
      cardRefs.current[selectedReviewIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    } else if (focusedZone === "filter" && filterBtnRefs.current[selectedFilterIndex]) {
      filterBtnRefs.current[selectedFilterIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    } else if (focusedZone === "load_more" && loadMoreBtnRef.current) {
      loadMoreBtnRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [isFocused, focusedZone, selectedReviewIndex, selectedFilterIndex]);

  // Imperative gamepad navigation handler exposed to parent
  useImperativeHandle(ref, () => ({
    handleAction: (action: "up" | "down" | "left" | "right" | "a" | "b"): boolean => {
      // 1. If modal is active, up/down scroll text, b/a close modal
      if (activeModalReview) {
        if (action === "up") {
          modalScrollRef.current?.scrollBy({ top: -160, behavior: "smooth" });
          return true;
        }
        if (action === "down") {
          modalScrollRef.current?.scrollBy({ top: 160, behavior: "smooth" });
          return true;
        }
        if (action === "b" || action === "a") {
          setActiveModalReview(null);
          return true;
        }
        return true;
      }

      const totalReviews = processedReviews.length;

      // 2. Zone: FILTER TOOLBAR
      if (focusedZone === "filter") {
        if (action === "left") {
          setSelectedFilterIndex((prev) => Math.max(0, prev - 1));
          return true;
        }
        if (action === "right") {
          setSelectedFilterIndex((prev) => Math.min(6, prev + 1));
          return true;
        }
        if (action === "down") {
          setFocusedZone("grid");
          onSelectReviewIndex(0);
          return true;
        }
        if (action === "up") {
          return false; // Parent handles returning to top tab bar
        }
        if (action === "a") {
          // Trigger filter/sort button based on index
          switch (selectedFilterIndex) {
            case 0: setFilterType("all"); break;
            case 1: setFilterType("positive"); break;
            case 2: setFilterType("negative"); break;
            case 3: setSortBy("helpful"); break;
            case 4: setSortBy("playtime"); break;
            case 5: setSortBy("recent"); break;
            case 6: setSortBy("funny"); break;
          }
          onSelectReviewIndex(0);
          return true;
        }
      }

      // 3. Zone: GRID CARDS
      if (focusedZone === "grid") {
        if (action === "left") {
          if (selectedReviewIndex % 2 === 1) {
            onSelectReviewIndex(selectedReviewIndex - 1);
          }
          return true;
        }
        if (action === "right") {
          if (selectedReviewIndex % 2 === 0 && selectedReviewIndex + 1 < totalReviews) {
            onSelectReviewIndex(selectedReviewIndex + 1);
          }
          return true;
        }
        if (action === "up") {
          if (selectedReviewIndex >= 2) {
            onSelectReviewIndex(selectedReviewIndex - 2);
          } else {
            setFocusedZone("filter");
          }
          return true;
        }
        if (action === "down") {
          if (selectedReviewIndex + 2 < totalReviews) {
            onSelectReviewIndex(selectedReviewIndex + 2);
          } else if (selectedReviewIndex % 2 === 0 && selectedReviewIndex + 1 < totalReviews) {
            onSelectReviewIndex(selectedReviewIndex + 1);
          } else if (hasMore) {
            setFocusedZone("load_more");
          }
          return true;
        }
        if (action === "a") {
          if (processedReviews[selectedReviewIndex]) {
            setActiveModalReview(processedReviews[selectedReviewIndex]);
          }
          return true;
        }
      }

      // 4. Zone: LOAD MORE BUTTON
      if (focusedZone === "load_more") {
        if (action === "up") {
          setFocusedZone("grid");
          onSelectReviewIndex(Math.max(0, totalReviews - 1));
          return true;
        }
        if (action === "a") {
          onLoadMore();
          return true;
        }
      }

      return false;
    },
  }), [focusedZone, selectedFilterIndex, selectedReviewIndex, processedReviews, activeModalReview, hasMore, onLoadMore, onSelectReviewIndex]);

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "";
    return new Date(timestamp * 1000).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="steam-reviews-container loading-state">
        <div className="reviews-loading-spinner" />
        <p>Carregando análises da comunidade Steam...</p>
      </div>
    );
  }

  if (error || reviews.length === 0) {
    return (
      <div className="steam-reviews-container empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <h3>Nenhuma análise encontrada</h3>
        <p>Ainda não há análises disponíveis para este jogo na comunidade.</p>
      </div>
    );
  }

  return (
    <div className="steam-reviews-container">
      {/* Reviews Controls Banner: Title + Sentiment Filter + Sorting */}
      <div className="reviews-controls-header">
        <div className="reviews-title-block">
          <h2>Análises dos Jogadores ({processedReviews.length})</h2>
          <span className="reviews-subtitle">Comentários e opiniões da comunidade Steam</span>
        </div>

        <div className="reviews-filter-toolbar">
          {/* Sentiment Filter Pills */}
          <div className="filter-pill-group">
            <button
              ref={(el) => { filterBtnRefs.current[0] = el; }}
              type="button"
              className={`filter-pill-btn focusable ${filterType === "all" ? "active" : ""} ${
                isFocused && focusedZone === "filter" && selectedFilterIndex === 0 ? "focused" : ""
              }`}
              onClick={() => {
                setFilterType("all");
                setFocusedZone("filter");
                setSelectedFilterIndex(0);
                onSelectReviewIndex(0);
              }}
            >
              Todas ({reviews.length})
            </button>
            <button
              ref={(el) => { filterBtnRefs.current[1] = el; }}
              type="button"
              className={`filter-pill-btn pos focusable ${filterType === "positive" ? "active" : ""} ${
                isFocused && focusedZone === "filter" && selectedFilterIndex === 1 ? "focused" : ""
              }`}
              onClick={() => {
                setFilterType("positive");
                setFocusedZone("filter");
                setSelectedFilterIndex(1);
                onSelectReviewIndex(0);
              }}
            >
              👍 Positivas ({reviews.filter((r) => r.voted_up).length})
            </button>
            <button
              ref={(el) => { filterBtnRefs.current[2] = el; }}
              type="button"
              className={`filter-pill-btn neg focusable ${filterType === "negative" ? "active" : ""} ${
                isFocused && focusedZone === "filter" && selectedFilterIndex === 2 ? "focused" : ""
              }`}
              onClick={() => {
                setFilterType("negative");
                setFocusedZone("filter");
                setSelectedFilterIndex(2);
                onSelectReviewIndex(0);
              }}
            >
              👎 Negativas ({reviews.filter((r) => !r.voted_up).length})
            </button>
          </div>

          {/* Sorting Pills */}
          <div className="sort-pill-group">
            <span className="sort-label">Ordenar:</span>
            <button
              ref={(el) => { filterBtnRefs.current[3] = el; }}
              type="button"
              className={`sort-pill-btn focusable ${sortBy === "helpful" ? "active" : ""} ${
                isFocused && focusedZone === "filter" && selectedFilterIndex === 3 ? "focused" : ""
              }`}
              onClick={() => {
                setSortBy("helpful");
                setFocusedZone("filter");
                setSelectedFilterIndex(3);
                onSelectReviewIndex(0);
              }}
            >
              🔥 Mais Úteis
            </button>
            <button
              ref={(el) => { filterBtnRefs.current[4] = el; }}
              type="button"
              className={`sort-pill-btn focusable ${sortBy === "playtime" ? "active" : ""} ${
                isFocused && focusedZone === "filter" && selectedFilterIndex === 4 ? "focused" : ""
              }`}
              onClick={() => {
                setSortBy("playtime");
                setFocusedZone("filter");
                setSelectedFilterIndex(4);
                onSelectReviewIndex(0);
              }}
            >
              ⏳ Horas Jogadas
            </button>
            <button
              ref={(el) => { filterBtnRefs.current[5] = el; }}
              type="button"
              className={`sort-pill-btn focusable ${sortBy === "recent" ? "active" : ""} ${
                isFocused && focusedZone === "filter" && selectedFilterIndex === 5 ? "focused" : ""
              }`}
              onClick={() => {
                setSortBy("recent");
                setFocusedZone("filter");
                setSelectedFilterIndex(5);
                onSelectReviewIndex(0);
              }}
            >
              📅 Recentes
            </button>
            <button
              ref={(el) => { filterBtnRefs.current[6] = el; }}
              type="button"
              className={`sort-pill-btn focusable ${sortBy === "funny" ? "active" : ""} ${
                isFocused && focusedZone === "filter" && selectedFilterIndex === 6 ? "focused" : ""
              }`}
              onClick={() => {
                setSortBy("funny");
                setFocusedZone("filter");
                setSelectedFilterIndex(6);
                onSelectReviewIndex(0);
              }}
            >
              😂 Hilárias
            </button>
          </div>
        </div>
      </div>

      {processedReviews.length === 0 ? (
        <div className="steam-reviews-container empty-state">
          <h3>Nenhuma análise nesta categoria</h3>
          <p>Tente alterar o filtro de avaliação selecionado.</p>
        </div>
      ) : (
        /* 2x2 Grid Layout */
        <div className="reviews-grid-list">
          {processedReviews.map((item, index) => {
            const isSelected = isFocused && focusedZone === "grid" && selectedReviewIndex === index;
            return (
              <div
                key={item.recommendationid || index}
                ref={(el) => { cardRefs.current[index] = el; }}
                tabIndex={0}
                className={`review-card-item focusable ${isSelected ? "focused" : ""} ${
                  item.voted_up ? "recommended" : "not-recommended"
                }`}
                onClick={() => {
                  setFocusedZone("grid");
                  onSelectReviewIndex(index);
                  setActiveModalReview(item);
                }}
                onMouseEnter={() => {
                  setFocusedZone("grid");
                  onSelectReviewIndex(index);
                }}
              >
                <div className="review-card-header">
                  <div className="author-info-group">
                    {item.author_avatar ? (
                      <img src={item.author_avatar} alt={item.author_name} className="author-avatar-img" />
                    ) : (
                      <div className="author-avatar-placeholder">
                        {item.author_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="author-details">
                      <span className="author-name-text">{item.author_name}</span>
                      <span className="author-playtime">
                        🎮 {item.playtime_forever_hours > 0 ? `${item.playtime_forever_hours}h jogadas` : "Tempo não registrado"}
                      </span>
                    </div>
                  </div>

                  <div className={`recommendation-badge ${item.voted_up ? "pos" : "neg"}`}>
                    {item.voted_up ? "👍 Recomendado" : "👎 Não Recomendado"}
                  </div>
                </div>

                <div className="review-card-body">
                  <p className="review-body-text">{item.review_text}</p>
                </div>

                <div className="review-card-footer">
                  <span className="review-date">{formatDate(item.timestamp_created)}</span>
                  {item.votes_up > 0 && (
                    <span className="helpful-count">
                      👍 {item.votes_up} {item.votes_up === 1 ? "pessoa achou útil" : "pessoas acharam útil"}
                    </span>
                  )}
                  {item.votes_funny > 0 && (
                    <span className="funny-count">😂 {item.votes_funny}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More Button at the bottom of the grid */}
      {hasMore && (
        <div className="load-more-reviews-banner">
          <button
            ref={loadMoreBtnRef}
            type="button"
            className={`load-more-reviews-btn focusable ${
              isFocused && focusedZone === "load_more" ? "focused" : ""
            }`}
            disabled={loadingMore}
            onClick={() => {
              setFocusedZone("load_more");
              onLoadMore();
            }}
          >
            {loadingMore ? (
              <>
                <span className="reviews-loading-spinner-sm" />
                Carregando mais análises...
              </>
            ) : (
              <>➕ Carregar Mais Análises</>
            )}
          </button>
        </div>
      )}

      {/* Review Modal Portal Overlay for detailed reading */}
      {activeModalReview &&
        createPortal(
          <div className="review-modal-overlay" onClick={() => setActiveModalReview(null)}>
            <div className="review-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="author-info-group">
                  {activeModalReview.author_avatar ? (
                    <img src={activeModalReview.author_avatar} alt={activeModalReview.author_name} className="author-avatar-img" />
                  ) : (
                    <div className="author-avatar-placeholder">
                      {activeModalReview.author_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3>{activeModalReview.author_name}</h3>
                    <span className="author-playtime">
                      🎮 {activeModalReview.playtime_forever_hours} horas registradas no jogo
                    </span>
                  </div>
                </div>

                <div className={`recommendation-badge ${activeModalReview.voted_up ? "pos" : "neg"}`}>
                  {activeModalReview.voted_up ? "👍 Recomendado" : "👎 Não Recomendado"}
                </div>
              </div>

              <div ref={modalScrollRef} className="modal-body-scroll">
                <p>{activeModalReview.review_text}</p>
              </div>

              <div className="modal-footer">
                <span>Publicado em {formatDate(activeModalReview.timestamp_created)}</span>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setActiveModalReview(null)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});
