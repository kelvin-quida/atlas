import React from "react";
import { GamepadModal } from "../../GamepadModal";

interface AddGameModalProps {
  isOpen: boolean;
  availableDrives: string[];
  selectedDrives: Record<string, boolean>;
  searchQuery: string;
  installedApps: any[];
  loadingApps: boolean;
  addGameSelectedIndex: number;
  detectedSelectedIndex: number;
  customName: string;
  customExe: string;
  detectedListRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  setSelectedDrives: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSearchQuery: (q: string) => void;
  setDetectedSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  setAddGameSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  setCustomName: (name: string) => void;
  setCustomExe: (exe: string) => void;
  onPickExe: () => void;
  onSubmit: (e?: React.FormEvent) => void;
}

export const AddGameModal: React.FC<AddGameModalProps> = ({
  isOpen,
  availableDrives,
  selectedDrives,
  searchQuery,
  installedApps,
  loadingApps,
  addGameSelectedIndex,
  detectedSelectedIndex,
  customName,
  customExe,
  detectedListRef,
  onClose,
  setSelectedDrives,
  setSearchQuery,
  setDetectedSelectedIndex,
  setAddGameSelectedIndex,
  setCustomName,
  setCustomExe,
  onPickExe,
  onSubmit,
}) => {
  return (
    <GamepadModal
      isOpen={isOpen}
      onClose={onClose}
      title="Adicionar Jogo à Biblioteca"
      className="add-game-card"
    >
      <div className="add-game-layout">
        {/* Left Column: Installed Apps List & Disk Filter Chips */}
        <div className="add-game-list-section">
          {/* Horizontal Filter Chips Bar */}
          <div className="disk-filter-chips-bar">
            <button
              type="button"
              className={`disk-filter-pill ${
                availableDrives.length > 0 &&
                availableDrives.every((d) => selectedDrives[d] !== false)
                  ? "active"
                  : ""
              }`}
              onClick={() => {
                const allActive = availableDrives.every(
                  (d) => selectedDrives[d] !== false
                );
                const updated: Record<string, boolean> = {};
                availableDrives.forEach((d) => {
                  updated[d] = !allActive;
                });
                setSelectedDrives(updated);
              }}
            >
              Todos Discos
            </button>

            {availableDrives.map((drive) => {
              const isEnabled = selectedDrives[drive] !== false;
              return (
                <button
                  key={drive}
                  type="button"
                  className={`disk-filter-pill ${isEnabled ? "active" : ""}`}
                  onClick={() => {
                    setSelectedDrives((prev) => ({
                      ...prev,
                      [drive]: !isEnabled,
                    }));
                  }}
                >
                  Disco {drive}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <div className="search-wrapper" style={{ flex: 1, position: "relative" }}>
              <input
                id="add-game-search-input"
                type="text"
                placeholder="Pesquisar jogos instalados..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setDetectedSelectedIndex(0);
                }}
                className={addGameSelectedIndex === 0 ? "focused" : ""}
              />
              <span className="search-icon-hint">🔍</span>
            </div>

            <button
              id="add-game-manual-browse-btn"
              type="button"
              title="Procurar pasta do jogo manualmente"
              className={`btn-secondary browse-folder-btn ${
                addGameSelectedIndex === 1 ? "focused" : ""
              }`}
              onClick={onPickExe}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>

          <div className="detected-apps-list" ref={detectedListRef}>
            {loadingApps ? (
              <div className="apps-list-empty">
                Buscando jogos instalados no PC...
              </div>
            ) : (() => {
              const fApps = installedApps.filter((app) => {
                const matchesSearch = app.name
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase());
                if (!matchesSearch) return false;
                const appPathUpper = app.path.toUpperCase();
                const activeDrives = Object.keys(selectedDrives).filter(
                  (d) => selectedDrives[d] !== false
                );
                if (activeDrives.length === 0) return false;
                return activeDrives.some((d) =>
                  appPathUpper.startsWith(d.toUpperCase())
                );
              });
              if (fApps.length === 0) {
                return (
                  <div className="apps-list-empty">
                    Nenhum jogo encontrado para os discos ativos.
                  </div>
                );
              }
              return fApps.map((app, index) => {
                const isSelected =
                  addGameSelectedIndex === 2 && detectedSelectedIndex === index;
                return (
                  <div
                    key={app.path + "-" + index}
                    id={`detected-app-item-${index}`}
                    tabIndex={0}
                    className={`detected-app-item ${isSelected ? "focused" : ""}`}
                    onClick={() => {
                      setCustomName(app.name);
                      setCustomExe(app.path);
                      setAddGameSelectedIndex(7);
                    }}
                  >
                    <div className="app-icon-placeholder">🎮</div>
                    <div className="app-info">
                      <span className="app-name">{app.name}</span>
                      <span className="app-path" title={app.path}>
                        {app.path}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Right Column: Selected Game Preview & Confirmation */}
        <div className="add-game-form-section">
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              className="playnite-group"
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  className="playnite-group-title"
                  style={{ color: "var(--accent-cyan)", marginBottom: "0.75rem" }}
                >
                  Jogo Selecionado
                </div>
                {customExe ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                      background: "rgba(0, 0, 0, 0.25)",
                      padding: "1.25rem",
                      borderRadius: "12px",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "8px",
                          background: "rgba(6, 182, 212, 0.15)",
                          border: "1px solid var(--accent-cyan)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.5rem",
                        }}
                      >
                        🎮
                      </div>
                      <div>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "1.05rem",
                            color: "#ffffff",
                            display: "block",
                          }}
                        >
                          {customName}
                        </span>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--accent-cyan)",
                            fontWeight: 600,
                          }}
                        >
                          Pronto para Adicionar
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                        paddingTop: "0.75rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.35rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          fontWeight: 600,
                        }}
                      >
                        Caminho Executável:
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "#ffffff",
                          wordBreak: "break-all",
                          fontFamily: "monospace",
                          background: "rgba(0,0,0,0.3)",
                          padding: "0.4rem 0.6rem",
                          borderRadius: "6px",
                        }}
                      >
                        {customExe}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "2.5rem 1rem",
                      background: "rgba(0, 0, 0, 0.2)",
                      borderRadius: "12px",
                      border: "1px dashed rgba(255, 255, 255, 0.15)",
                      textAlign: "center",
                      gap: "0.75rem",
                    }}
                  >
                    <span style={{ fontSize: "2rem" }}>🎯</span>
                    <span
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Selecione um jogo na lista à esquerda ou use a busca para
                      encontrar seu jogo instalados no PC.
                    </span>
                  </div>
                )}
              </div>

              <form onSubmit={onSubmit} style={{ marginTop: "1.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    id="add-game-cancel-btn"
                    type="button"
                    className="btn-secondary"
                    onClick={onClose}
                  >
                    Cancelar
                  </button>
                  <button
                    id="add-game-submit-btn"
                    type="submit"
                    className="btn-primary"
                    disabled={!customExe}
                  >
                    + Adicionar à Biblioteca
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </GamepadModal>
  );
};
