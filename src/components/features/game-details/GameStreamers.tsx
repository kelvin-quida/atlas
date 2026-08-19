import React, { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TwitchStream } from "./useTwitchStreams";

interface GameStreamersProps {
  streams: TwitchStream[];
  loading: boolean;
  error: string | null;
  isFocused?: boolean;
  selectedStreamIndex?: number;
  onSelectStreamIndex?: (index: number) => void;
  gameName?: string;
  onRefetch?: () => void;
}

export function formatViewerCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M espect.`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k espect.`;
  }
  return `${count} espect.`;
}

export const GameStreamers: React.FC<GameStreamersProps> = ({
  streams,
  loading,
  error,
  isFocused = false,
  selectedStreamIndex = 0,
  onSelectStreamIndex,
  gameName,
  onRefetch,
}) => {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll focused stream card smoothly into view
  useEffect(() => {
    if (isFocused && itemRefs.current[selectedStreamIndex]) {
      itemRefs.current[selectedStreamIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [isFocused, selectedStreamIndex]);

  const handleLaunchStream = async (stream: TwitchStream) => {
    const streamUrl = `https://www.twitch.tv/${stream.user_login}`;
    try {
      await invoke("open_twitch_stream_url", { url: streamUrl });
    } catch (err) {
      console.error("Failed to open Twitch stream webview:", err);
      window.open(streamUrl, "_blank");
    }
  };

  const handleOpenTwitchDirectory = async () => {
    const clean = gameName ? gameName.replace(/\s*[\(\[].*?[\)\]]/g, "").trim() : "";
    const url = clean
      ? `https://www.twitch.tv/directory/category/${encodeURIComponent(clean.toLowerCase().replace(/\s+/g, "-"))}`
      : "https://www.twitch.tv/directory";

    try {
      await invoke("open_twitch_stream_url", { url });
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <div
      className={`atlas-card game-streamers-card hydra-card ${
        isFocused ? "focused-card" : ""
      }`}
    >
      <div className="atlas-card-header streamers-header">
        <div className="streamers-title-row">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="streamers-header-icon"
          >
            <path d="M21 2H3v16h5v4l4-4h9V2z" />
            <path d="M11 11V7" />
            <path d="M16 11V7" />
          </svg>
          <h3 className="atlas-card-title">Lives Ao Vivo na Twitch</h3>
        </div>

        <div className="streamers-header-actions">
          {streams.length > 0 && (
            <span className="streamers-count-badge">
              <span className="live-dot-pulse" />
              {streams.length} {streams.length === 1 ? "transmissão" : "transmissões"}
            </span>
          )}
          {onRefetch && (
            <button
              type="button"
              className="streamers-refresh-btn"
              onClick={onRefetch}
              title="Atualizar Transmissões"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6" />
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M22 12.5a10 10 0 0 1-18.8 4.3L2.5 16" />
              </svg>
              <span>Atualizar</span>
            </button>
          )}
        </div>
      </div>

      <div className="streamers-card-body">
        {loading ? (
          <div className="streamers-skeleton-grid">
            <div className="skeleton streamer-skeleton-card" />
            <div className="skeleton streamer-skeleton-card" />
            <div className="skeleton streamer-skeleton-card" />
            <div className="skeleton streamer-skeleton-card" />
            <div className="skeleton streamer-skeleton-card" />
            <div className="skeleton streamer-skeleton-card" />
          </div>
        ) : error ? (
          <div className="streamers-empty-state">
            <span className="streamers-empty-icon">⚠️</span>
            <p>{error}</p>
            <button className="streamers-action-btn" onClick={onRefetch}>
              Tentar Novamente
            </button>
          </div>
        ) : streams.length === 0 ? (
          <div className="streamers-empty-state">
            <div className="streamers-empty-twitch-logo">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.571 4.714h1.715v5.143h-1.715zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
              </svg>
            </div>
            <h4>Nenhum streamer transmitindo {gameName || "este jogo"} no momento</h4>
            <p>Seja o primeiro a transmitir ou navegue pelas categorias da Twitch!</p>
            <button className="streamers-action-btn" onClick={handleOpenTwitchDirectory}>
              Abrir Diretório na Twitch
            </button>
          </div>
        ) : (
          <div className="streamers-grid">
            {streams.map((stream, index) => {
              const isSelected = isFocused && index === selectedStreamIndex;

              return (
                <div
                  key={stream.id || index}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  tabIndex={0}
                  className={`streamer-card focusable ${isSelected ? "focused" : ""}`}
                  onMouseEnter={() => onSelectStreamIndex?.(index)}
                  onClick={() => handleLaunchStream(stream)}
                >
                  {/* Thumbnail Wrapper */}
                  <div className="stream-thumbnail-wrapper">
                    <img
                      src={stream.thumbnail_url}
                      alt={stream.title}
                      className="stream-thumbnail-img"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "https://static-cdn.jtvnw.net/ttv-static/404_preview-440x248.jpg";
                      }}
                    />

                    {/* Live Indicator Badge */}
                    <div className="stream-live-badge">
                      <span className="live-pulse-dot" />
                      <span>AO VIVO</span>
                    </div>

                    {/* Viewer Count Badge */}
                    <div className="stream-viewers-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                      </svg>
                      <span>{formatViewerCount(stream.viewer_count)}</span>
                    </div>

                    {/* Language Badge */}
                    {stream.language && (
                      <div className="stream-lang-badge">
                        {stream.language.toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Streamer Info Section */}
                  <div className="streamer-info-box">
                    <div className="streamer-avatar-col">
                      {stream.profile_image_url ? (
                        <img
                          src={stream.profile_image_url}
                          alt={stream.user_name}
                          className="streamer-avatar-img"
                        />
                      ) : (
                        <div className="streamer-avatar-placeholder">
                          {stream.user_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="streamer-text-col">
                      <div className="streamer-name-row">
                        <span className="streamer-user-name" title={stream.user_name}>
                          {stream.user_name}
                        </span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="#9146FF"
                          className="twitch-verified-icon"
                        >
                          <path d="M12 2l2.4 2.4H18v3.6L20.4 12 18 14.4V18h-3.6L12 20.4 9.6 18H6v-3.6L3.6 12 6 9.6V6h3.6L12 2z" />
                        </svg>
                      </div>

                      <h4 className="stream-title" title={stream.title}>
                        {stream.title || "Transmissão ao vivo"}
                      </h4>

                      <span className="stream-game-name">
                        {stream.game_name || gameName || "Twitch"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
