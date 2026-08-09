import React from "react";
import { FocusArea } from "../../../types/game";

interface HeaderProps {
  currentTheme: string;
  focusArea: FocusArea;
  headerSelectedIndex: number;
  systemTime: string;
  onOpenYouTube: () => void;
  onOpenTwitch: () => void;
  onOpenBackloggd: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTheme,
  focusArea,
  headerSelectedIndex,
  systemTime,
  onOpenYouTube,
  onOpenTwitch,
  onOpenBackloggd,
  onOpenSettings,
}) => {
  if (currentTheme === "ps5") {
    return (
      <header className="ps5-header">
        <div className="ps5-header-left">
          <div className="ps5-menu-tab active">Jogos</div>
          <div className="ps5-menu-tab">Mídia</div>
        </div>
        <div className="ps5-header-right">
          <button
            className={`ps5-icon-btn ${focusArea === "header" && headerSelectedIndex === 0 ? "focused" : ""
              }`}
            onClick={onOpenYouTube}
            title="YouTube"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </button>
          <button
            className={`ps5-icon-btn twitch-btn ${focusArea === "header" && headerSelectedIndex === 1 ? "focused" : ""
              }`}
            onClick={onOpenTwitch}
            title="Twitch"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.571 4.714h1.715v5.143h-1.715zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
            </svg>
          </button>
          <button
            className={`ps5-icon-btn backloggd-btn ${focusArea === "header" && headerSelectedIndex === 2 ? "focused" : ""
              }`}
            onClick={onOpenBackloggd}
            title="Backloggd"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 4H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM5.5 7h3a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5zm-1 7.5a.5.5 0 0 1 .5-.5h14a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm15 2.5H4.5v-1h15v1zm0-4h-8a.5.5 0 0 1 0-1h8a.5.5 0 0 1 0 1zm0-2h-8a.5.5 0 0 1 0-1h8a.5.5 0 0 1 0 1zm0-2h-8a.5.5 0 0 1 0-1h8a.5.5 0 0 1 0 1z" />
            </svg>
          </button>
          <button
            className={`ps5-icon-btn ${focusArea === "header" && headerSelectedIndex === 3 ? "focused" : ""
              }`}
            onClick={onOpenSettings}
            title="Configurações"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <div className="ps5-avatar-circle" title="Perfil">
            <div className="ps5-avatar-inner" />
          </div>
          <div className="ps5-time-display">{systemTime}</div>
        </div>
      </header>
    );
  }

  return (
    <header className="console-header">
      <div className="logo-container">
        <span className="logo-text">ATLAS</span>
      </div>

      <div className="system-status">
        <button
          className={`header-icon-btn ${focusArea === "header" && headerSelectedIndex === 0 ? "focused" : ""
            }`}
          onClick={onOpenYouTube}
          title="YouTube"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.25rem",
            transition: "all 0.2s ease",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
        </button>
        <button
          className={`header-icon-btn twitch-btn ${focusArea === "header" && headerSelectedIndex === 1 ? "focused" : ""
            }`}
          onClick={onOpenTwitch}
          title="Twitch"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.25rem",
            transition: "all 0.2s ease",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.571 4.714h1.715v5.143h-1.715zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
          </svg>
        </button>
        <button
          className={`header-icon-btn backloggd-btn ${focusArea === "header" && headerSelectedIndex === 2 ? "focused" : ""
            }`}
          onClick={onOpenBackloggd}
          title="Backloggd"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.25rem",
            transition: "all 0.2s ease",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 4H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM5.5 7h3a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5zm-1 7.5a.5.5 0 0 1 .5-.5h14a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm15 2.5H4.5v-1h15v1zm0-4h-8a.5.5 0 0 1 0-1h8a.5.5 0 0 1 0 1zm0-2h-8a.5.5 0 0 1 0-1h8a.5.5 0 0 1 0 1zm0-2h-8a.5.5 0 0 1 0-1h8a.5.5 0 0 1 0 1z" />
          </svg>
        </button>
        <button
          className={`header-icon-btn ${focusArea === "header" && headerSelectedIndex === 3 ? "focused" : ""
            }`}
          onClick={onOpenSettings}
          title="Configurações"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.25rem",
            transition: "all 0.2s ease",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <div className="system-time">{systemTime}</div>
      </div>
    </header>
  );
};
