import React, { useState, useEffect } from "react";
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
  const [currentUrl, setCurrentUrl] = useState(ambientBgUrl);
  const [prevUrl, setPrevUrl] = useState("");
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (ambientBgUrl !== currentUrl) {
      setPrevUrl(currentUrl);
      setCurrentUrl(ambientBgUrl);
      setIsFading(true);

      const timer = setTimeout(() => {
        setIsFading(false);
        setPrevUrl("");
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [ambientBgUrl, currentUrl]);

  return (
    <>
      {/* Camada do background anterior (permanece visível por baixo durante a transição) */}
      {isFading && prevUrl && (
        <div
          className="ambient-bg"
          style={{
            backgroundImage: `url(${prevUrl})`,
            backgroundColor: "var(--bg-primary)",
            zIndex: 0,
          }}
        />
      )}

      {/* Camada do background atual (faz fade-in por cima sem distorcer o tamanho da imagem) */}
      <div
        key={currentUrl || "app-default-bg"}
        className={`ambient-bg ${isFading ? "ambient-bg-fade-in" : ""} ${!currentUrl ? "app-default-bg" : ""}`}
        style={{
          backgroundImage: currentUrl ? `url(${currentUrl})` : undefined,
          backgroundColor: "var(--bg-primary)",
          zIndex: isFading ? 1 : 0,
        }}
      >
        {activeGame && !activeGame.image_url && currentUrl && (
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
      <div className={`ambient-overlay ${!currentUrl ? "app-default-overlay" : ""}`} style={{ zIndex: 2 }} />
    </>
  );
};
