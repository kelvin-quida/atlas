import React from "react";
import { SteamGame, FocusArea } from "../../../types/game";
import { GameCard } from "./GameCard";
import { LibraryCard } from "./LibraryCard";

interface GameCarouselProps {
  games: SteamGame[];
  selectedGameIndex: number;
  focusArea: FocusArea;
  imageErrors: Record<string, boolean>;
  carouselRef: React.RefObject<HTMLDivElement | null>;
  uninstalledCount?: number;
  totalGamesCount?: number;
  onSelectGame: (index: number, game: SteamGame) => void;
  onImageError: (appid: string) => void;
  onOpenLibrary?: () => void;
}

export const GameCarousel: React.FC<GameCarouselProps> = ({
  games,
  selectedGameIndex,
  focusArea,
  imageErrors,
  carouselRef,
  uninstalledCount = 0,
  totalGamesCount = 0,
  onSelectGame,
  onImageError,
  onOpenLibrary,
}) => {
  return (
    <div className="games-carousel-wrapper">
      <div className="games-carousel" ref={carouselRef}>
        {games.map((game, index) => {
          const isFocused =
            index === selectedGameIndex && focusArea === "carousel";

          if (game.appid === "__LIBRARY_CARD__") {
            return (
              <LibraryCard
                key="__LIBRARY_CARD__"
                isFocused={isFocused}
                uninstalledCount={uninstalledCount}
                totalCount={totalGamesCount}
                onClick={() => {
                  if (onOpenLibrary) onOpenLibrary();
                  else onSelectGame(index, game);
                }}
              />
            );
          }

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
