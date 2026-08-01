import React from "react";
import { SteamGame } from "../../types/game";
import { getGradientBg } from "../../utils/gameUtils";

interface AmbientBackgroundProps {
  ambientBgUrl: string;
  activeGame: SteamGame | null;
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({
  ambientBgUrl,
  activeGame,
}) => {
  return (
    <>
      <div
        className="ambient-bg"
        style={{
          backgroundImage: ambientBgUrl ? `url(${ambientBgUrl})` : "none",
          backgroundColor: ambientBgUrl ? "var(--bg-primary)" : "transparent",
        }}
      >
        {activeGame && !activeGame.image_url && (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: getGradientBg(activeGame.name),
              opacity: 0.15,
            }}
          />
        )}
      </div>
      <div className="ambient-overlay" />
    </>
  );
};
