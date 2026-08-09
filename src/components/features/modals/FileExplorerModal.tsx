import { VirtualKeyboard } from "../../VirtualKeyboard";
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGamepad } from "../../../providers/GamepadContext";
import { GamepadActionState } from "../../../core/focus/gamepadInput";

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
  onUpdateExplorerItems?: (items: any[]) => void;
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
  onUpdateExplorerItems,
}) => {
  const { pushLayer, popLayer, registerLayerHandler } = useGamepad();
  const [searchQuery, setSearchQuery] = useState("");
  const [isVirtualKeyboardOpen, setIsVirtualKeyboardOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Register dedicated gamepad layer for FileExplorerModal
  useEffect(() => {
    if (fileExplorerOpen) {
      pushLayer("fileExplorer");
    } else {
      popLayer("fileExplorer");
    }
    return () => {
      popLayer("fileExplorer");
    };
  }, [fileExplorerOpen, pushLayer, popLayer]);

  // Reset search query whenever directory path changes
  useEffect(() => {
    setSearchQuery("");
    setSearchResults(null);
  }, [fileExplorerPath]);

  // Deep recursive search into subfolders when user types in search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(() => {
      setSearching(true);
      const rootToSearch = fileExplorerPath || (availableDrives[0] ? availableDrives[0] : "C:\\");
      invoke<any[]>("search_files_recursive", {
        rootPath: rootToSearch,
        query: searchQuery.trim(),
        allowedExtensions: ["exe", "sh", "bin"],
      })
        .then((res) => {
          setSearchResults(res);
          setSearching(false);
          const goUp = fileExplorerItems.find((item) => item.path === "..");
          const finalItems = goUp ? [goUp, ...res] : res;
          if (onUpdateExplorerItems) {
            onUpdateExplorerItems(finalItems);
          }
        })
        .catch((err) => {
          console.error("Erro na busca de arquivos:", err);
          setSearching(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, fileExplorerPath, availableDrives]);

  // Determine active list of items to display
  let displayedItems = fileExplorerItems;
  if (searchResults !== null) {
    const goUpItem = fileExplorerItems.find((item) => item.path === "..");
    displayedItems = goUpItem ? [goUpItem, ...searchResults] : searchResults;
  }

  // Register Gamepad Input Handler
  useEffect(() => {
    if (!fileExplorerOpen) return;

    const unregister = registerLayerHandler("fileExplorer", (actions: GamepadActionState) => {
      if (actions.lb || actions.rb) {
        if (availableDrives && availableDrives.length > 0) {
          const curIdx = availableDrives.findIndex((d) =>
            (fileExplorerPath || "").toUpperCase().startsWith(d.toUpperCase())
          );
          let nextIdx = curIdx >= 0 ? curIdx : 0;
          if (actions.lb) {
            nextIdx = (curIdx - 1 + availableDrives.length) % availableDrives.length;
          } else {
            nextIdx = (curIdx + 1) % availableDrives.length;
          }
          onNavigateToPath(availableDrives[nextIdx]);
        }
        return true;
      }

      if (actions.up) {
        const active = document.activeElement;
        const currentIdx = displayedItems.findIndex(
          (_, index) => document.getElementById(`file-explorer-item-${index}`) === active
        );
        const nextIdx = currentIdx > 0 ? currentIdx - 1 : Math.max(0, displayedItems.length - 1);
        const el = document.getElementById(`file-explorer-item-${nextIdx}`);
        if (el) {
          el.focus();
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        return true;
      }

      if (actions.down) {
        const active = document.activeElement;
        const currentIdx = displayedItems.findIndex(
          (_, index) => document.getElementById(`file-explorer-item-${index}`) === active
        );
        const nextIdx = currentIdx < displayedItems.length - 1 ? currentIdx + 1 : 0;
        const el = document.getElementById(`file-explorer-item-${nextIdx}`);
        if (el) {
          el.focus();
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        return true;
      }

      if (actions.a) {
        const active = document.activeElement;
        const currentIdx = displayedItems.findIndex(
          (_, index) => document.getElementById(`file-explorer-item-${index}`) === active
        );
        const selected = displayedItems[currentIdx >= 0 ? currentIdx : 0];
        if (selected) {
          onSelectFileExplorerItem(selected);
        }
        return true;
      }

      if (actions.y) {
        setIsVirtualKeyboardOpen(true);
        return true;
      }

      if (actions.b) {
        if (fileExplorerPath && !fileExplorerPath.endsWith(":\\")) {
          invoke<string>("get_parent_path", { path: fileExplorerPath })
            .then((parent) => {
              if (parent && parent !== fileExplorerPath) {
                onNavigateToPath(parent);
              } else {
                onClose();
              }
            })
            .catch(() => onClose());
        } else {
          onClose();
        }
        return true;
      }

      return true;
    });

    return () => {
      unregister();
    };
  }, [
    fileExplorerOpen,
    fileExplorerPath,
    availableDrives,
    displayedItems,
    registerLayerHandler,
    onNavigateToPath,
    onSelectFileExplorerItem,
    onClose,
  ]);

  // Initial focus trap when file explorer opens
  useEffect(() => {
    if (!fileExplorerOpen) return;
    const timer = setTimeout(() => {
      const firstItem = document.getElementById("file-explorer-item-0");
      if (firstItem) {
        firstItem.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [fileExplorerOpen, fileExplorerPath]);

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
        <h2>🎮 Selecionar Executável do Jogo (.exe)</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Escolha a unidade (C:\, D:\, E:\) e navegue pelas pastas ou busque diretamente pelo nome do jogo.
        </p>

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

        {/* Search Bar Input */}
        <div style={{ margin: "0.75rem 0", position: "relative", display: "flex", alignItems: "center" }}>
          <input id="file-explorer-search-input"
            type="text"
            placeholder="🔍 Buscar subpastas e executáveis neste disco (ex: BeastOfReincarnation, .exe)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "0.65rem 1rem",
              paddingRight: searchQuery ? "2.5rem" : "1rem",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              background: "rgba(0, 0, 0, 0.3)",
              color: "#ffffff",
              fontSize: "0.9rem",
              outline: "none",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchResults(null);
                if (onUpdateExplorerItems) {
                  onUpdateExplorerItems(fileExplorerItems);
                }
              }}
              style={{
                position: "absolute",
                right: "0.75rem",
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          )}
        </div>

        <div className="file-explorer-list" ref={fileExplorerListRef}>
          {searching ? (
            <div className="file-explorer-empty">
              Buscando "{searchQuery}" nas pastas de {fileExplorerPath || "Disco"}...
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="file-explorer-empty">
              {searchQuery
                ? `Nenhum jogo ou executável encontrado para "${searchQuery}".`
                : "Nenhum arquivo ou pasta compatível encontrado nesta pasta."}
            </div>
          ) : (
            displayedItems.map((item, index) => {
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
                  <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <span className="file-explorer-name">{item.name}</span>
                    {searchResults !== null && item.path !== ".." && (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {item.path}
                      </span>
                    )}
                  </div>
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
            style={{ marginTop: "1.25rem", display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}
          >
            <span className="yt-hint">
              <span className="yt-hint-key">
                {currentTheme === "ps5" ? "△" : "Y"}
              </span>{" "}
              Pesquisar
            </span>
            <span className="yt-hint">
              <span className="yt-hint-key">LB / RB</span> Mudar Disco
            </span>
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

        {isVirtualKeyboardOpen && (
          <VirtualKeyboard
            isOpen={isVirtualKeyboardOpen}
            initialValue={searchQuery}
            label="Buscar Jogo no PC"
            placeholder="Digite o nome do jogo ou executável..."
            onChange={(val) => setSearchQuery(val)}
            onConfirm={(val) => {
              setSearchQuery(val);
              setIsVirtualKeyboardOpen(false);
            }}
            onClose={() => setIsVirtualKeyboardOpen(false)}
          />
        )}
      </div>
    </div>
  );
};