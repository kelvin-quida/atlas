import React from "react";
import { FocusArea, MainSection } from "../../../types/game";

interface HeaderProps {
  currentTheme: string;
  focusArea: FocusArea;
  headerSelectedIndex: number;
  systemTime: string;
  activeSection?: MainSection;
  onSectionChange?: (section: MainSection) => void;
  onOpenYouTube?: () => void;
  onOpenTwitch?: () => void;
  onOpenBackloggd?: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTheme,
  focusArea,
  headerSelectedIndex,
  systemTime,
  activeSection = "games",
  onSectionChange,
  onOpenSettings,
}) => {
  if (currentTheme === "ps5") {
    return (
      <header className="ps5-header">
        <div className="ps5-header-left">
          <div
            className={`ps5-menu-tab ${activeSection === "games" ? "active" : ""}`}
            onClick={() => onSectionChange?.("games")}
            title="Alternar para Jogos (L1)"
          >
            <span className="key-badge">L1</span> Jogos
          </div>
          <div
            className={`ps5-menu-tab ${activeSection === "media" ? "active" : ""}`}
            onClick={() => onSectionChange?.("media")}
            title="Alternar para Mídia"
          >
            Mídia
          </div>
          <div
            className={`ps5-menu-tab ${activeSection === "dashboard" ? "active" : ""}`}
            onClick={() => onSectionChange?.("dashboard")}
            title="Alternar para Dashboard (R1)"
          >
            Dashboard <span className="key-badge">R1</span>
          </div>
        </div>
        <div className="ps5-header-right">
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
        <div className="header-tabs">
          <button
            className={`header-tab-btn ${activeSection === "games" ? "active" : ""}`}
            onClick={() => onSectionChange?.("games")}
            title="Alternar para Jogos (L1)"
          >
            <span className="key-badge">L1</span> Jogos
          </button>
          <button
            className={`header-tab-btn ${activeSection === "media" ? "active" : ""}`}
            onClick={() => onSectionChange?.("media")}
            title="Alternar para Mídia"
          >
            Mídia
          </button>
          <button
            className={`header-tab-btn ${activeSection === "dashboard" ? "active" : ""}`}
            onClick={() => onSectionChange?.("dashboard")}
            title="Alternar para Dashboard (R1)"
          >
            Dashboard <span className="key-badge">R1</span>
          </button>
        </div>
      </div>

      <div className="system-status">
        
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

