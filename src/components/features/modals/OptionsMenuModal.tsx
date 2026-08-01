import React from "react";
import { SteamGame } from "../../../types/game";

interface OptionsMenuModalProps {
  optionsMenuGame: SteamGame | null;
  optionsMenuSelectedIndex: number;
  gamepadConnected: boolean;
  currentTheme: string;
  onClose: () => void;
  onTriggerOption: (option: string, game: SteamGame) => void;
  setOptionsMenuSelectedIndex: (index: number) => void;
}

export const OptionsMenuModal: React.FC<OptionsMenuModalProps> = ({
  optionsMenuGame,
  optionsMenuSelectedIndex,
  gamepadConnected,
  currentTheme,
  onClose,
  onTriggerOption,
  setOptionsMenuSelectedIndex,
}) => {
  if (!optionsMenuGame) return null;

  return (
    <div className="options-overlay" onClick={onClose}>
      <div className="options-card" onClick={(e) => e.stopPropagation()}>
        <div className="options-header">
          <span className="options-subtitle">Opções de Jogo</span>
          <h2 className="options-title">{optionsMenuGame.name}</h2>
        </div>

        <div className="options-list">
          <button
            className={`options-btn play-btn ${
              optionsMenuSelectedIndex === 0 ? "focused" : ""
            }`}
            onClick={() => onTriggerOption("play", optionsMenuGame)}
            onMouseEnter={() => setOptionsMenuSelectedIndex(0)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Iniciar Jogo
          </button>

          {optionsMenuGame.isCustom ? (
            <>
              <button
                className={`options-btn edit-btn ${
                  optionsMenuSelectedIndex === 1 ? "focused" : ""
                }`}
                onClick={() => onTriggerOption("edit", optionsMenuGame)}
                onMouseEnter={() => setOptionsMenuSelectedIndex(1)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Editar
              </button>

              <button
                className={`options-btn delete-btn ${
                  optionsMenuSelectedIndex === 2 ? "focused" : ""
                }`}
                onClick={() => onTriggerOption("delete", optionsMenuGame)}
                onMouseEnter={() => setOptionsMenuSelectedIndex(2)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                Excluir
              </button>

              <button
                className={`options-btn cancel-btn ${
                  optionsMenuSelectedIndex === 3 ? "focused" : ""
                }`}
                onClick={() => onTriggerOption("cancel", optionsMenuGame)}
                onMouseEnter={() => setOptionsMenuSelectedIndex(3)}
              >
                Voltar
              </button>
            </>
          ) : (
            <button
              className={`options-btn cancel-btn ${
                optionsMenuSelectedIndex === 1 ? "focused" : ""
              }`}
              onClick={() => onTriggerOption("cancel", optionsMenuGame)}
              onMouseEnter={() => setOptionsMenuSelectedIndex(1)}
            >
              Voltar
            </button>
          )}
        </div>

        {gamepadConnected && (
          <div className="modal-gamepad-hints">
            <span className="yt-hint">
              <span className="yt-hint-key">D-Pad ↕</span> Navegar
            </span>
            <span className="yt-hint">
              <span className="yt-hint-key">
                {currentTheme === "ps5" ? "✕" : "A"}
              </span>{" "}
              Confirmar
            </span>
            <span className="yt-hint">
              <span className="yt-hint-key">
                {currentTheme === "ps5" ? "○" : "B"}
              </span>{" "}
              Voltar
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
