import React from "react";

interface FileExplorerModalProps {
  fileExplorerOpen: boolean;
  fileExplorerPath: string;
  availableDrives: string[];
  fileExplorerItems: any[];
  fileExplorerSelectedIndex: number;
  gamepadConnected: boolean;
  currentTheme: string;
  fileExplorerListRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onNavigateToPath: (path: string) => void;
  onSelectFileExplorerItem: (item: any) => void;
}

export const FileExplorerModal: React.FC<FileExplorerModalProps> = ({
  fileExplorerOpen,
  fileExplorerPath,
  availableDrives,
  fileExplorerItems,
  fileExplorerSelectedIndex,
  gamepadConnected,
  currentTheme,
  fileExplorerListRef,
  onClose,
  onNavigateToPath,
  onSelectFileExplorerItem,
}) => {
  if (!fileExplorerOpen) return null;

  return (
    <div
      className="settings-overlay file-explorer-overlay"
      onClick={onClose}
    >
      <div
        className="settings-card file-explorer-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Explorador de Arquivos Atlas</h2>

        <div className="file-explorer-header-bar">
          <div className="file-explorer-path-bar">
            <span>Caminho:</span>
            <strong>
              {fileExplorerPath || "Meu Computador (Unidades de Disco)"}
            </strong>
          </div>

          {availableDrives.length > 0 && (
            <div className="drive-selector-bar">
              <span className="drive-selector-label">Mudar Disco:</span>
              <button
                type="button"
                className={`drive-pill ${
                  fileExplorerPath === "" ? "active" : ""
                }`}
                onClick={() => onNavigateToPath("")}
              >
                💾 Todos Discos
              </button>
              {availableDrives.map((drive) => (
                <button
                  key={drive}
                  type="button"
                  className={`drive-pill ${
                    fileExplorerPath
                      .toUpperCase()
                      .startsWith(drive.toUpperCase())
                      ? "active"
                      : ""
                  }`}
                  onClick={() => onNavigateToPath(drive)}
                >
                  💾 {drive}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="file-explorer-list" ref={fileExplorerListRef}>
          {fileExplorerItems.length === 0 ? (
            <div className="file-explorer-empty">
              Nenhum arquivo ou pasta compatível encontrado nesta pasta.
            </div>
          ) : (
            fileExplorerItems.map((item, index) => {
              const isSelected = fileExplorerSelectedIndex === index;
              let icon = "📁";
              if (item.path === "..") {
                icon = "↩️";
              } else if (!item.is_dir) {
                const ext = item.path.split(".").pop()?.toLowerCase();
                if (ext === "exe" || ext === "sh" || ext === "bin") {
                  icon = "🎮";
                } else if (
                  ["png", "jpg", "jpeg", "webp"].includes(ext || "")
                ) {
                  icon = "🖼️";
                } else {
                  icon = "📄";
                }
              } else if (fileExplorerPath === "") {
                icon = "💾";
              }

              return (
                <div
                  key={item.path + "-" + index}
                  id={`file-explorer-item-${index}`}
                  tabIndex={0}
                  className={`file-explorer-item ${
                    isSelected ? "focused" : ""
                  }`}
                  onClick={() => onSelectFileExplorerItem(item)}
                >
                  <span className="file-explorer-icon">{icon}</span>
                  <span className="file-explorer-name">{item.name}</span>
                </div>
              );
            })
          )}
        </div>

        <div className="settings-footer" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>

        {gamepadConnected && (
          <div
            className="modal-gamepad-hints"
            style={{ marginTop: "1.25rem" }}
          >
            <span className="yt-hint">
              <span className="yt-hint-key">⇅</span> Navegar
            </span>
            <span className="yt-hint">
              <span className="yt-hint-key">
                {currentTheme === "ps5" ? "✕" : "A"}
              </span>{" "}
              Entrar / Selecionar
            </span>
            <span className="yt-hint">
              <span className="yt-hint-key">
                {currentTheme === "ps5" ? "○" : "B"}
              </span>{" "}
              Voltar
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
