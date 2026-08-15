import React from "react";
import { SteamGame, PlaytimeStats, FocusArea } from "../../../types/game";
import { GameInfoPanel } from "./GameInfoPanel";
import { GameCarousel } from "./GameCarousel";

export interface MainViewProps {
  activeGame: SteamGame | null;
  currentTheme: string;
  playtimes: Record<string, PlaytimeStats>;
  loading: boolean;
  carouselGames: SteamGame[];
  selectedGameIndex: number;
  focusArea: FocusArea;
  imageErrors: Record<string, boolean>;
  carouselRef: React.RefObject<HTMLDivElement | null>;
  uninstalledCount?: number;
  totalGamesCount?: number;
  onTryLaunchGame: (game: SteamGame) => void;
  onSelectGame: (index: number, game: SteamGame) => void;
  onImageError: (appid: string) => void;
  onOpenLibrary?: () => void;
}

export const MainView: React.FC<MainViewProps> = ({
  activeGame,
  currentTheme,
  playtimes,
  loading,
  carouselGames,
  selectedGameIndex,
  focusArea,
  imageErrors,
  carouselRef,
  uninstalledCount = 0,
  totalGamesCount = 0,
  onTryLaunchGame,
  onSelectGame,
  onImageError,
  onOpenLibrary,
}) => {
  return (
    <>
      <GameInfoPanel
        activeGame={activeGame}
        currentTheme={currentTheme}
        playtimes={playtimes}
        onTryLaunchGame={onTryLaunchGame}
      />

      {loading ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "300px",
          }}
        >
          <div className="spinner" />
        </div>
      ) : (
        <GameCarousel
          games={carouselGames}
          selectedGameIndex={selectedGameIndex}
          focusArea={focusArea}
          imageErrors={imageErrors}
          carouselRef={carouselRef}
          uninstalledCount={uninstalledCount}
          totalGamesCount={totalGamesCount}
          onSelectGame={onSelectGame}
          onImageError={onImageError}
          onOpenLibrary={onOpenLibrary}
        />
      )}
    </>
  );
};

export const MainScreen = MainView;
