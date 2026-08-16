import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { openPath } from "@tauri-apps/plugin-opener";
import { SteamNewsItem } from "./useSteamNews";
import { useGamepad } from "../../../providers/GamepadContext";

interface GameNewsProps {
  news: SteamNewsItem[];
  loading: boolean;
  error: string | null;
  isFocused?: boolean;
  selectedNewsIndex?: number;
  onSelectNewsIndex?: (index: number) => void;
  onNewsItemClick?: (item: SteamNewsItem) => void;
  openNewsModalRef?: React.MutableRefObject<((item?: SteamNewsItem) => void) | null>;
}

/**
 * Strips Steam BBCode tags and formats content for clean text display (excerpt previews)
 */
export function cleanSteamNewsContent(content: string): string {
  if (!content) return "";
  let text = content;

  // Remove Steam clan images and raw img tags
  text = text.replace(/\{STEAM_CLAN_IMAGE\}[^\s\]]+/g, "");
  text = text.replace(/\[img[\s\S]*?\][\s\S]*?\[\/img\]/gi, "");
  text = text.replace(/\[img[\s\S]*?\]/gi, "");
  text = text.replace(/\[dynamiclink[\s\S]*?\][\s\S]*?\[\/dynamiclink\]/gi, "");

  // Convert paragraph tags to linebreaks
  text = text.replace(/\[p\]/gi, "");
  text = text.replace(/\[\/p\]/gi, "\n");

  // Convert headers
  text = text.replace(/\[h[1-6]\]/gi, "\n");
  text = text.replace(/\[\/h[1-6]\]/gi, "\n");

  // Convert formatting
  text = text.replace(/\[b\]/gi, "");
  text = text.replace(/\[\/b\]/gi, "");
  text = text.replace(/\[i\]/gi, "");
  text = text.replace(/\[\/i\]/gi, "");
  text = text.replace(/\[u\]/gi, "");
  text = text.replace(/\[\/u\]/gi, "");
  text = text.replace(/\[list\]/gi, "");
  text = text.replace(/\[\/list\]/gi, "");
  text = text.replace(/\[\/\*\]/gi, "");
  text = text.replace(/\[\*\]/gi, "• ");

  // Convert links [url=http...]label[/url] -> label
  text = text.replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, "$1");
  text = text.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, "$1");

  // Strip HTML tags if any exist
  text = text.replace(/<[^>]*>/g, "");

  // Strip remaining BBCode tags
  text = text.replace(/\[\/?[a-z0-9=\-_"'\:\/\.\?\&]+\]/gi, "");

  // Clean excessive whitespace and newlines
  text = text.replace(/\n\s*\n\s*\n/g, "\n\n").trim();

  return text;
}

/**
 * Recursively finds matching close tag handling nested structures (e.g. nested [list])
 */
function findMatchingCloseTag(
  str: string,
  openTagPattern: RegExp,
  closeTagStr: string,
  startPos: number
): { openEndPos: number; closeStartPos: number; closeEndPos: number } | null {
  const openMatch = str.slice(startPos).match(openTagPattern);
  if (!openMatch || openMatch.index === undefined) return null;

  const openStart = startPos + openMatch.index;
  const openEnd = openStart + openMatch[0].length;
  const openTagBase = openMatch[0].split(/[\s=\]]/)[0].toLowerCase();
  const closeLower = closeTagStr.toLowerCase();

  let depth = 1;
  let pos = openEnd;

  while (pos < str.length && depth > 0) {
    const nextOpen = str.toLowerCase().indexOf(openTagBase, pos);
    const nextClose = str.toLowerCase().indexOf(closeLower, pos);

    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTagBase.length;
    } else {
      depth--;
      if (depth === 0) {
        return {
          openEndPos: openEnd,
          closeStartPos: nextClose,
          closeEndPos: nextClose + closeTagStr.length,
        };
      }
      pos = nextClose + closeTagStr.length;
    }
  }

  return null;
}

function splitListItems(str: string): string[] {
  const items: string[] = [];
  let currentItem = "";
  let listDepth = 0;
  let pos = 0;

  while (pos < str.length) {
    const slice = str.slice(pos);

    const listOpenMatch = slice.match(/^\[list[^\]]*\]/i);
    if (listOpenMatch) {
      listDepth++;
      currentItem += listOpenMatch[0];
      pos += listOpenMatch[0].length;
      continue;
    }

    if (slice.toLowerCase().startsWith("[/list]")) {
      listDepth = Math.max(0, listDepth - 1);
      currentItem += "[/list]";
      pos += 7;
      continue;
    }

    if (listDepth === 0 && slice.startsWith("[*]")) {
      if (currentItem.trim()) {
        items.push(currentItem.trim());
      }
      currentItem = "";
      pos += 3;
      continue;
    }

    currentItem += str[pos];
    pos++;
  }

  if (currentItem.trim()) {
    items.push(currentItem.trim());
  }

  return items;
}

function parseBBCodeNodes(
  text: string,
  onOpenUrl: (url: string) => void,
  keyPrefix: string
): React.ReactNode[] {
  if (!text) return [];

  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let elementCounter = 0;

  while (remaining.length > 0) {
    const match = remaining.match(/\[(list|h1|h2|h3|quote|code|img)[^\]]*\]/i);

    if (!match || match.index === undefined) {
      if (remaining.trim()) {
        nodes.push(
          <React.Fragment key={`${keyPrefix}-text-${elementCounter++}`}>
            {renderInlineAndParagraphs(remaining, onOpenUrl, `${keyPrefix}-p-${elementCounter}`)}
          </React.Fragment>
        );
      }
      break;
    }

    const tagStart = match.index;
    const tagName = match[1].toLowerCase();

    if (tagStart > 0) {
      const preceding = remaining.slice(0, tagStart);
      if (preceding.trim()) {
        nodes.push(
          <React.Fragment key={`${keyPrefix}-pre-${elementCounter++}`}>
            {renderInlineAndParagraphs(preceding, onOpenUrl, `${keyPrefix}-pre-${elementCounter}`)}
          </React.Fragment>
        );
      }
    }

    const closeTagStr = `[/${tagName}]`;
    const bounds = findMatchingCloseTag(remaining, new RegExp(`\\[${tagName}[^\\]]*\\]`, "i"), closeTagStr, tagStart);

    if (!bounds) {
      const fallbackText = remaining.slice(tagStart);
      nodes.push(
        <React.Fragment key={`${keyPrefix}-fb-${elementCounter++}`}>
          {renderInlineAndParagraphs(fallbackText, onOpenUrl, `${keyPrefix}-fb-${elementCounter}`)}
        </React.Fragment>
      );
      break;
    }

    const innerContent = remaining.slice(bounds.openEndPos, bounds.closeStartPos);
    const key = `${keyPrefix}-${tagName}-${elementCounter++}`;

    if (tagName === "list") {
      const items = splitListItems(innerContent);
      nodes.push(
        <ul key={key} className="news-content-list">
          {items.map((itemText, itemIdx) => {
            const itemKey = `${key}-item-${itemIdx}`;
            return (
              <li key={itemKey} className="news-content-list-item">
                {parseBBCodeNodes(itemText, onOpenUrl, itemKey)}
              </li>
            );
          })}
        </ul>
      );
    } else if (tagName === "h1") {
      nodes.push(
        <h3 key={key} className="news-content-h1">
          {renderInlineText(innerContent, onOpenUrl, key)}
        </h3>
      );
    } else if (tagName === "h2") {
      nodes.push(
        <h4 key={key} className="news-content-h2">
          {renderInlineText(innerContent, onOpenUrl, key)}
        </h4>
      );
    } else if (tagName === "h3") {
      nodes.push(
        <h5 key={key} className="news-content-h3">
          {renderInlineText(innerContent, onOpenUrl, key)}
        </h5>
      );
    } else if (tagName === "quote") {
      nodes.push(
        <blockquote key={key} className="news-content-quote">
          <div className="quote-icon">💬</div>
          <div>{parseBBCodeNodes(innerContent, onOpenUrl, key)}</div>
        </blockquote>
      );
    } else if (tagName === "code") {
      nodes.push(
        <pre key={key} className="news-content-code">
          <code>{innerContent.trim()}</code>
        </pre>
      );
    } else if (tagName === "img") {
      const imgUrl = innerContent.trim();
      nodes.push(
        <div key={key} className="news-content-img-container">
          <img src={imgUrl} alt="Patch Note Media" className="news-content-img" />
        </div>
      );
    }

    remaining = remaining.slice(bounds.closeEndPos);
  }

  return nodes;
}

function renderInlineAndParagraphs(
  text: string,
  onOpenUrl: (url: string) => void,
  keyPrefix: string
): React.ReactNode {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <>
      {paragraphs.map((p, idx) => {
        const pKey = `${keyPrefix}-p-${idx}`;
        return (
          <p key={pKey} className="news-content-paragraph">
            {renderInlineText(p, onOpenUrl, pKey)}
          </p>
        );
      })}
    </>
  );
}

function renderInlineText(
  text: string,
  onOpenUrl: (url: string) => void,
  keyPrefix: string
): React.ReactNode {
  if (!text) return null;

  const regex = /(\[url=[^\]]+\][\s\S]*?\[\/url\]|\[url\][\s\S]*?\[\/url\]|\[b\][\s\S]*?\[\/b\]|\[i\][\s\S]*?\[\/i\]|\[u\][\s\S]*?\[\/u\]|\[strike\][\s\S]*?\[\/strike\]|\[spoiler\][\s\S]*?\[\/spoiler\])/gi;

  const parts = text.split(regex);

  return parts.map((part, idx) => {
    const key = `${keyPrefix}-inl-${idx}`;
    if (!part) return null;

    const urlMatch = part.match(/^\[url=([^\]]+)\]([\s\S]*?)\[\/url\]$/i);
    if (urlMatch) {
      const [, linkUrl, linkLabel] = urlMatch;
      return (
        <a
          key={key}
          className="news-content-link"
          onClick={(e) => {
            e.preventDefault();
            onOpenUrl(linkUrl);
          }}
        >
          {renderInlineText(linkLabel, onOpenUrl, `${key}-lbl`)}
        </a>
      );
    }

    const simpleUrlMatch = part.match(/^\[url\]([\s\S]*?)\[\/url\]$/i);
    if (simpleUrlMatch) {
      const [, linkUrl] = simpleUrlMatch;
      return (
        <a
          key={key}
          className="news-content-link"
          onClick={(e) => {
            e.preventDefault();
            onOpenUrl(linkUrl);
          }}
        >
          {linkUrl}
        </a>
      );
    }

    const boldMatch = part.match(/^\[b\]([\s\S]*?)\[\/b\]$/i);
    if (boldMatch) {
      return (
        <strong key={key} className="news-content-bold">
          {renderInlineText(boldMatch[1], onOpenUrl, `${key}-b`)}
        </strong>
      );
    }

    const italicMatch = part.match(/^\[i\]([\s\S]*?)\[\/i\]$/i);
    if (italicMatch) {
      return (
        <em key={key} className="news-content-italic">
          {renderInlineText(italicMatch[1], onOpenUrl, `${key}-i`)}
        </em>
      );
    }

    const underlineMatch = part.match(/^\[u\]([\s\S]*?)\[\/u\]$/i);
    if (underlineMatch) {
      return (
        <u key={key} className="news-content-underline">
          {renderInlineText(underlineMatch[1], onOpenUrl, `${key}-u`)}
        </u>
      );
    }

    const strikeMatch = part.match(/^\[strike\]([\s\S]*?)\[\/strike\]$/i);
    if (strikeMatch) {
      return (
        <del key={key} className="news-content-strike">
          {renderInlineText(strikeMatch[1], onOpenUrl, `${key}-del`)}
        </del>
      );
    }

    const spoilerMatch = part.match(/^\[spoiler\]([\s\S]*?)\[\/spoiler\]$/i);
    if (spoilerMatch) {
      return (
        <span key={key} className="news-content-spoiler" title="Spoiler (clique para ver)">
          {renderInlineText(spoilerMatch[1], onOpenUrl, `${key}-sp`)}
        </span>
      );
    }

    const cleanText = part.replace(/\[\/?p\]/gi, "");
    const subLines = cleanText.split("\n");

    if (subLines.length === 1) {
      return <React.Fragment key={key}>{cleanText}</React.Fragment>;
    }

    return (
      <React.Fragment key={key}>
        {subLines.map((line, lIdx) => (
          <React.Fragment key={`${key}-l-${lIdx}`}>
            {lIdx > 0 && <br />}
            {line}
          </React.Fragment>
        ))}
      </React.Fragment>
    );
  });
}

/**
 * Renders Steam news content with full BBCode structure for nested blocks,
 * lists, headers, quotes, spoilers, code blocks, images and clickable links.
 */
export function renderSteamNewsContent(
  rawContent: string,
  onOpenUrl: (url: string) => void
): React.ReactNode {
  if (!rawContent) return null;

  let text = rawContent;

  // Convert {STEAM_CLAN_IMAGE} to CDN URL
  text = text.replace(
    /\{STEAM_CLAN_IMAGE\}([^\s\]"']+)/g,
    "https://clan.cloudflare.steamstatic.com/images/$1"
  );

  // Unescape escaped brackets: \[ -> [, \] -> ]
  text = text.replace(/\\\[/g, "[").replace(/\\\]/g, "]");

  // Clean explicit Steam item closing tags [/*]
  text = text.replace(/\[\/\*\]/g, "");

  // Normalize carriage returns
  text = text.replace(/\r\n/g, "\n");

  return (
    <div className="news-formatted-body">
      {parseBBCodeNodes(text, onOpenUrl, "root")}
    </div>
  );
}

export const GameNews: React.FC<GameNewsProps> = ({
  news,
  loading,
  error,
  isFocused = false,
  selectedNewsIndex = 0,
  onSelectNewsIndex,
  onNewsItemClick,
  openNewsModalRef,
}) => {
  const [selectedNewsModal, setSelectedNewsModal] = useState<SteamNewsItem | null>(null);
  const [focusedModalBtn, setFocusedModalBtn] = useState<0 | 1>(0); // 0 = External, 1 = Close
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const modalBodyRef = useRef<HTMLDivElement | null>(null);

  const { pushLayer, popLayer, registerLayerHandler } = useGamepad();

  // Attach ref trigger for parent component to open selected modal
  useEffect(() => {
    if (openNewsModalRef) {
      openNewsModalRef.current = (itemToOpen) => {
        const target = itemToOpen || news[selectedNewsIndex];
        if (target) {
          setSelectedNewsModal(target);
          setFocusedModalBtn(0);
        }
      };
    }
  }, [news, selectedNewsIndex, openNewsModalRef]);

  // Scroll selected news item card into view smoothly
  useEffect(() => {
    if (isFocused && itemRefs.current[selectedNewsIndex]) {
      itemRefs.current[selectedNewsIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [isFocused, selectedNewsIndex]);

  // Handle Gamepad Layer for News Modal
  useEffect(() => {
    if (!selectedNewsModal) return;

    pushLayer("news-modal");
    const unregister = registerLayerHandler("news-modal", (actions) => {
      if (actions.b) {
        setSelectedNewsModal(null);
        return true;
      }

      if (actions.up) {
        if (modalBodyRef.current) {
          modalBodyRef.current.scrollTop -= 140;
        }
        return true;
      }

      if (actions.down) {
        if (modalBodyRef.current) {
          modalBodyRef.current.scrollTop += 140;
        }
        return true;
      }

      if (actions.left || actions.right) {
        setFocusedModalBtn((prev) => (prev === 0 ? 1 : 0));
        return true;
      }

      if (actions.a) {
        if (focusedModalBtn === 0) {
          handleOpenExternal(selectedNewsModal.url);
        } else {
          setSelectedNewsModal(null);
        }
        return true;
      }

      return false;
    });

    return () => {
      popLayer("news-modal");
      unregister();
    };
  }, [selectedNewsModal, focusedModalBtn, pushLayer, popLayer, registerLayerHandler]);

  // Keyboard navigation listener inside News Modal
  useEffect(() => {
    if (!selectedNewsModal) return;

    const handleModalKeys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedNewsModal(null);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (modalBodyRef.current) modalBodyRef.current.scrollTop -= 140;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (modalBodyRef.current) modalBodyRef.current.scrollTop += 140;
      } else if (e.key === "PageUp") {
        e.preventDefault();
        if (modalBodyRef.current) modalBodyRef.current.scrollTop -= 360;
      } else if (e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        if (modalBodyRef.current) modalBodyRef.current.scrollTop += 360;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Tab") {
        e.preventDefault();
        setFocusedModalBtn((prev) => (prev === 0 ? 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusedModalBtn === 0) {
          handleOpenExternal(selectedNewsModal.url);
        } else {
          setSelectedNewsModal(null);
        }
      }
    };

    window.addEventListener("keydown", handleModalKeys);
    return () => window.removeEventListener("keydown", handleModalKeys);
  }, [selectedNewsModal, focusedModalBtn]);

  const handleOpenExternal = async (url: string) => {
    try {
      await openPath(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const filteredNews = (news || []).filter((item) => {
    const combined = `${item.url || ""} ${item.feedname || ""} ${item.feedlabel || ""} ${item.author || ""}`.toLowerCase();
    return (
      !combined.includes("gamemag") &&
      !combined.includes("rockpapershotgun") &&
      !combined.includes("rock_paper") &&
      !combined.includes("rock-paper") &&
      !combined.includes("rock, paper") &&
      !combined.includes("shotgun")
    );
  });

  return (
    <>
      <div
        className={`atlas-card game-news-card hydra-card ${
          isFocused ? "focused-card" : ""
        }`}
      >
        <div className="atlas-card-header news-header">
          <div className="news-title-row">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="news-header-icon"
            >
              <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
              <path d="M18 14h-8" />
              <path d="M15 18h-5" />
              <path d="M10 6h8v4h-8z" />
            </svg>
            <h3 className="atlas-card-title">Últimas Atualizações & Patches</h3>
          </div>
          {filteredNews.length > 0 && (
            <span className="news-count-badge">{filteredNews.length} notas recentes</span>
          )}
        </div>

        {/* Content Container Body */}
        <div className="news-card-body">
          {loading ? (
            <div className="news-loading-skeleton">
              <div className="skeleton news-item-skeleton" />
              <div className="skeleton news-item-skeleton" />
              <div className="skeleton news-item-skeleton" />
            </div>
          ) : error ? (
            <div className="news-empty-state">
              <span className="news-empty-icon">⚠️</span>
              <p>{error}</p>
            </div>
          ) : filteredNews.length === 0 ? (
            <div className="news-empty-state">
              <span className="news-empty-icon">📰</span>
              <p>Nenhuma atualização ou patch recente encontrado para este jogo na Steam.</p>
            </div>
          ) : (
            <div className="news-list">
              {filteredNews.map((item, index) => {
                const cleanedExcerpt = cleanSteamNewsContent(item.contents);
                const displayDate = formatDate(item.date);
                const feedLabel = item.feedlabel || "Atualização";
                const isItemSelected = isFocused && index === selectedNewsIndex;

                return (
                  <div
                    key={item.gid || index}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    tabIndex={0}
                    className={`news-item-card focusable ${
                      isItemSelected ? "focused" : ""
                    }`}
                    onMouseEnter={() => onSelectNewsIndex?.(index)}
                    onClick={() => {
                      if (onNewsItemClick) onNewsItemClick(item);
                      setSelectedNewsModal(item);
                      setFocusedModalBtn(0);
                    }}
                  >
                    <div className="news-item-top">
                      <span className="news-feed-label">{feedLabel}</span>
                      <span className="news-item-date">{displayDate}</span>
                    </div>

                    <h4 className="news-item-title">{item.title}</h4>

                    <p className="news-item-excerpt">
                      {cleanedExcerpt || "Clique para ver os detalhes da atualização..."}
                    </p>

                    <div className="news-item-footer">
                      <span className="news-read-more">
                        Ler notas completas
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </span>
                      {item.author && (
                        <span className="news-author">Por {item.author}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Patch Notes Full Detail Modal */}
      {selectedNewsModal &&
        createPortal(
          <div
            className="news-modal-overlay"
            onClick={() => setSelectedNewsModal(null)}
          >
            <div
              className="news-modal-container"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="news-modal-header">
                <div className="news-modal-title-group">
                  <span className="news-modal-badge">
                    {selectedNewsModal.feedlabel || "Notas de Atualização"}
                  </span>
                  <h2 className="news-modal-title">{selectedNewsModal.title}</h2>
                  <div className="news-modal-meta">
                    <span>📅 {formatDate(selectedNewsModal.date)}</span>
                    {selectedNewsModal.author && (
                      <span>• ✍️ {selectedNewsModal.author}</span>
                    )}
                  </div>
                </div>
                <button
                  className="news-modal-close"
                  onClick={() => setSelectedNewsModal(null)}
                  title="Fechar"
                >
                  ✕
                </button>
              </div>

              <div className="news-modal-body" ref={modalBodyRef}>
                {renderSteamNewsContent(selectedNewsModal.contents, handleOpenExternal)}
              </div>

              <div className="news-modal-footer">
                <button
                  className={`news-modal-external-btn focusable ${
                    focusedModalBtn === 0 ? "focused" : ""
                  }`}
                  onClick={() => handleOpenExternal(selectedNewsModal.url)}
                  onMouseEnter={() => setFocusedModalBtn(0)}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  <span>Abrir na Comunidade Steam</span>
                </button>
                <button
                  className={`news-modal-close-btn focusable ${
                    focusedModalBtn === 1 ? "focused" : ""
                  }`}
                  onClick={() => setSelectedNewsModal(null)}
                  onMouseEnter={() => setFocusedModalBtn(1)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

