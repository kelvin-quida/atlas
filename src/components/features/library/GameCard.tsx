import React from "react";
import { SteamGame } from "../../../types/game";
import { getGameImageUrl, getGradientBg } from "../../../utils/gameUtils";

interface GameCardProps {
  game: SteamGame;
  isFocused: boolean;
  isImageErr: boolean;
  onClick: () => void;
  onImageError: (appid: string) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  isFocused,
  isImageErr,
  onClick,
  onImageError,
}) => {
  return (
    <div
      className={`game-card ${isFocused ? "focused" : ""}`}
      onClick={onClick}
    >
      {isImageErr ? (
        <div
          className="game-card-placeholder"
          style={{ background: getGradientBg(game.name) }}
        >
          <div className="placeholder-tag">
            {game.isCustom ? "Jogo Custom" : "Jogo Steam"}
          </div>
          <div className="placeholder-text">{game.name}</div>
        </div>
      ) : (
        <div className="game-card-img-wrapper">
          <img
            src={getGameImageUrl(game)}
            alt={game.name}
            className="game-card-img"
            onError={() => onImageError(game.appid)}
          />
          <div className="game-card-overlay" />
        </div>
      )}
    </div>
  );
};
