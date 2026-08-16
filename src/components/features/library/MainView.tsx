import React from "react";
import { SteamGame, PlaytimeStats, FocusArea, MainSection } from "../../../types/game";
import { GameInfoPanel } from "./GameInfoPanel";
import { GameCarousel } from "./GameCarousel";
import { MediaSection } from "../media/MediaSection";

export interface MainViewProps {
  activeGame: SteamGame | null;
  currentTheme: string;
  playtimes: Record<string, PlaytimeStats>;
  loading: boolean;
  carouselGames: SteamGame[];
  selectedGameIndex: number;
  focusArea: FocusArea;
  activeSection?: MainSection;
  selectedMediaIndex?: number;
  imageErrors: Record<string, boolean>;
  carouselRef: React.RefObject<HTMLDivElement | null>;
  uninstalledCount?: number;
  totalGamesCount?: number;
  onTryLaunchGame: (game: SteamGame) => void;
  onSelectGame: (index: number, game: SteamGame) => void;
  onImageError: (appid: string) => void;
  onOpenLibrary?: () => void;
  onOpenYouTube: () => void;
  onOpenTwitch: () => void;
  onOpenBackloggd: () => void;
  onOpenAddMediaFolder: () => void;
  onSelectMedia?: (index: number) => void;
  onMediaItemCountChange?: (count: number) => void;
}

export const MainView: React.FC<MainViewProps> = ({
  activeGame,
  currentTheme,
  playtimes,
  loading,
  carouselGames,
  selectedGameIndex,
  focusArea,
  activeSection = "games",
  selectedMediaIndex = 0,
  imageErrors,
  carouselRef,
  uninstalledCount = 0,
  totalGamesCount = 0,
  onTryLaunchGame,
  onSelectGame,
  onImageError,
  onOpenLibrary,
  onOpenYouTube,
  onOpenTwitch,
  onOpenBackloggd,
  onOpenAddMediaFolder,
  onSelectMedia,
  onMediaItemCountChange,
}) => {
  if (loading) {
    return (
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
    );
  }

  if (activeSection === "media") {
    return (
      <MediaSection
        currentTheme={currentTheme}
        focusArea={focusArea}
        selectedMediaIndex={selectedMediaIndex}
        onOpenYouTube={onOpenYouTube}
        onOpenTwitch={onOpenTwitch}
        onOpenBackloggd={onOpenBackloggd}
        onOpenAddMediaFolder={onOpenAddMediaFolder}
        onSelectMedia={onSelectMedia}
        onItemCountChange={onMediaItemCountChange}
      />
    );
  }

  return (
    <>
      <GameInfoPanel
        activeGame={activeGame}
        currentTheme={currentTheme}
        playtimes={playtimes}
        onTryLaunchGame={onTryLaunchGame}
      />

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
    </>
  );
};

export const MainScreen = MainView;

