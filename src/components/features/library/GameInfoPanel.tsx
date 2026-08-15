import React from "react";
import { SteamGame, PlaytimeStats } from "../../../types/game";
import { getGameWidgets } from "../../../utils/gameUtils";

interface GameInfoPanelProps {
  activeGame: SteamGame | null;
  currentTheme: string;
  playtimes: Record<string, PlaytimeStats>;
  onTryLaunchGame: (game: SteamGame) => void;
}

export const GameInfoPanel: React.FC<GameInfoPanelProps> = ({
  activeGame,
  currentTheme,
  playtimes,
  onTryLaunchGame,
}) => {
  if (!activeGame) return null;

  if (activeGame.appid === "__LIBRARY_CARD__") {
    return (
      <div className="game-info-panel">
        <h1 className="game-title-active">Minha Biblioteca</h1>
        <div className="game-meta-active">
          <span>Visualizar todos os jogos instalados e não instalados da sua coleção</span>
        </div>
      </div>
    );
  }

  if (currentTheme === "ps5") {
    return (
      <div className="game-info-panel">
        <div className="ps5-game-hero-container">
          <div className="ps5-game-logo">{activeGame.name}</div>
          <div className="game-meta-active">
            <span>
              Tipo:{" "}
              <span className="meta-pill">
                {activeGame.isCustom ? "Customizado" : "Steam"}
              </span>
            </span>
          </div>
          <div className="ps5-hero-actions">
            <button
              className="ps5-play-btn"
              onClick={() => onTryLaunchGame(activeGame)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Jogar
            </button>
          </div>

          <div className="ps5-widgets-row">
            {getGameWidgets(activeGame, playtimes).map((w, idx) => (
              <div className="ps5-widget-card" key={idx}>
                <div className="ps5-widget-title">{w.title}</div>
                <div className="ps5-widget-desc">{w.desc}</div>
                {w.progress !== undefined ? (
                  <div className="ps5-widget-progress-container">
                    <span className="ps5-widget-value">{w.value}</span>
                    <div className="ps5-widget-progress-bar">
                      <div
                        className="ps5-widget-progress-fill"
                        style={{ width: `${w.progress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="ps5-widget-value">{w.value}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-info-panel">
      <h1 className="game-title-active">{activeGame.name}</h1>
      <div className="game-meta-active">
        <span>
          Tipo:{" "}
          <span className="meta-pill">
            {activeGame.isCustom ? "Customizado" : "Steam"}
          </span>
        </span>
        <span>•</span>
        <span>
          Tempo Jogado:{" "}
          <span className="meta-pill">
            {playtimes[activeGame.appid]?.formatted || "Não jogado"}
          </span>
        </span>
      </div>
    </div>
  );
};
