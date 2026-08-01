import React from "react";
import { SteamGame, FocusArea } from "../../../types/game";
import { GameCard } from "./GameCard";

interface GameCarouselProps {
  games: SteamGame[];
  selectedGameIndex: number;
  focusArea: FocusArea;
  imageErrors: Record<string, boolean>;
  carouselRef: React.RefObject<HTMLDivElement | null>;
  onSelectGame: (index: number, game: SteamGame) => void;
  onImageError: (appid: string) => void;
}

export const GameCarousel: React.FC<GameCarouselProps> = ({
  games,
  selectedGameIndex,
  focusArea,
  imageErrors,
  carouselRef,
  onSelectGame,
  onImageError,
}) => {
  return (
    <div className="games-carousel-wrapper">
      <div className="games-carousel" ref={carouselRef}>
        {games.map((game, index) => {
          const isFocused =
            index === selectedGameIndex && focusArea === "carousel";
          const isErr = imageErrors[game.appid] || !game.image_url;

          return (
            <GameCard
              key={game.appid}
              game={game}
              isFocused={isFocused}
              isImageErr={isErr}
              onClick={() => onSelectGame(index, game)}
              onImageError={onImageError}
            />
          );
        })}
      </div>
    </div>
  );
};
