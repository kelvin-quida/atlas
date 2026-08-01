import React from "react";
import { SteamGame } from "../../types/game";

interface LaunchingOverlayProps {
  launchingGame: SteamGame | null;
  gamepadConnected: boolean;
}

export const LaunchingOverlay: React.FC<LaunchingOverlayProps> = ({
  launchingGame,
  gamepadConnected,
}) => {
  if (!launchingGame) return null;

  return (
    <div className="launching-screen">
      <div className="spinner" />
      <h2 style={{ fontWeight: 600, fontSize: "1.8rem" }}>
        Iniciando {launchingGame.name}...
      </h2>
      <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
        {gamepadConnected
          ? "Processo iniciado no controle..."
          : "Executando processo secundário..."}
      </p>
    </div>
  );
};
