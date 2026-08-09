import React from "react";
import { GamepadModal } from "../../GamepadModal";

interface ImagePickerModalProps {
  isOpen: boolean;
  editName: string;
  imagePickerTarget: "cover" | "background";
  imagePickerQuery: string;
  imagePickerLoading: boolean;
  imagePickerResults: string[];
  imagePickerSelectedIndex: number;
  onClose: () => void;
  setImagePickerQuery: (q: string) => void;
  onPerformImageSearch: (query?: string) => void;
  onSelectImage: (url: string) => void;
  setImagePickerSelectedIndex: (idx: number) => void;
}

export const ImagePickerModal: React.FC<ImagePickerModalProps> = ({
  isOpen,
  editName,
  imagePickerTarget,
  imagePickerQuery,
  imagePickerLoading,
  imagePickerResults,
  imagePickerSelectedIndex,
  onClose,
  setImagePickerQuery,
  onPerformImageSearch,
  onSelectImage,
  setImagePickerSelectedIndex,
}) => {
  return (
    <GamepadModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        imagePickerTarget === "cover"
          ? `Buscar Capas: ${editName}`
          : `Buscar Backgrounds: ${editName}`
      }
    >
      <div className="image-picker-container">
        <div className="image-picker-header">
          <div
            className="search-wrapper"
            style={{ display: "flex", gap: "0.5rem", width: "100%" }}
          >
            <input
              type="text"
              value={imagePickerQuery}
              onChange={(e) => setImagePickerQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onPerformImageSearch();
                }
              }}
              placeholder="Digitar termo de busca..."
              style={{
                flex: 1,
                padding: "0.5rem 0.75rem",
                borderRadius: "6px",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff",
              }}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={() => onPerformImageSearch()}
              disabled={imagePickerLoading}
            >
              {imagePickerLoading ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </div>

        {imagePickerLoading ? (
          <div className="image-picker-loading-state">
            <div className="spinner" />
            <span>Buscando imagens em segundo plano...</span>
          </div>
        ) : imagePickerResults.length === 0 ? (
          <div className="image-picker-empty-state">
            <span>Nenhuma imagem encontrada para "{imagePickerQuery}".</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Tente alterar o termo de busca acima e clicar em Buscar.
            </span>
          </div>
        ) : (
          <div className={`image-picker-grid ${imagePickerTarget === "cover" ? "is-cover" : "is-background"}`}>
            {imagePickerResults.map((url, idx) => (
              <div
                key={url + "-" + idx}
                tabIndex={0}
                role="button"
                className={`image-picker-card focusable ${
                  imagePickerSelectedIndex === idx ? "focused" : ""
                }`}
                onClick={() => onSelectImage(url)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectImage(url);
                  }
                }}
                onMouseEnter={() => setImagePickerSelectedIndex(idx)}
              >
                <img
                  src={url}
                  alt={`Opção ${idx + 1}`}
                  loading="lazy"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const card = img.parentElement;
                    if (!card) return;
                    if (imagePickerTarget === "cover") {
                      if (img.naturalWidth > img.naturalHeight * 1.15) {
                        card.classList.add("hidden-img");
                      }
                    } else if (imagePickerTarget === "background") {
                      if (img.naturalHeight > img.naturalWidth * 1.15) {
                        card.classList.add("hidden-img");
                      }
                    }
                  }}
                  onError={(e) => {
                    const card = (e.target as HTMLImageElement).parentElement;
                    if (card) card.classList.add("hidden-img");
                  }}
                />
                <div className="image-picker-card-overlay">
                  <span>Selecionar</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </GamepadModal>
  );
};
