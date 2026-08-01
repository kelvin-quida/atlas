import React from "react";

interface EmptyLibraryProps {
  onAddGameClick: () => void;
}

export const EmptyLibrary: React.FC<EmptyLibraryProps> = ({
  onAddGameClick,
}) => {
  return (
    <div className="empty-library-container">
      <div className="empty-library-content">
        <div className="empty-library-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
          </svg>
        </div>
        <h2>Sua Biblioteca está Vazia</h2>
        <p>Adicione um jogo personalizado nas Configurações para começar a jogar.</p>
        <button className="empty-library-btn" onClick={onAddGameClick}>
          Adicionar Jogo
        </button>
      </div>
    </div>
  );
};
