import React from "react";

interface LibraryCardProps {
  isFocused: boolean;
  uninstalledCount: number;
  totalCount: number;
  onClick: () => void;
}

export const LibraryCard: React.FC<LibraryCardProps> = ({
  isFocused,
  uninstalledCount,
  totalCount,
  onClick,
}) => {
  return (
    <div
      className={`game-card library-card ${isFocused ? "focused" : ""}`}
      onClick={onClick}
      tabIndex={0}
      title="Abrir Biblioteca Completa"
    >
      <div className="library-card-content">
        <div className="library-card-badge">
          {uninstalledCount > 0 ? `${uninstalledCount} não instalados` : "Coleção completa"}
        </div>
        <div className="library-card-icon-container">
          <svg
            className="library-card-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </div>
        <div className="library-card-info">
          <span className="library-card-tag">ATLAS LIBRARY</span>
          <h3 className="library-card-title">Minha Biblioteca</h3>
          <p className="library-card-subtitle">
            {totalCount} {totalCount === 1 ? "jogo total" : "jogos na coleção"}
          </p>
        </div>
      </div>
      <div className="game-card-overlay" />
    </div>
  );
};
