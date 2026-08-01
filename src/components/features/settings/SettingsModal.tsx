import React from "react";
import { GamepadModal } from "../../GamepadModal";
import { SteamGame, SettingsTab } from "../../../types/game";

interface SettingsModalProps {
  isOpen: boolean;
  settingsTab: SettingsTab;
  shellEnabled: boolean;
  isSimulated: boolean;
  customGames: SteamGame[];
  currentTheme: string;
  onClose: () => void;
  onTabChange: (tab: SettingsTab) => void;
  onToggleShell: (checked: boolean) => void;
  onReloadLibrary: () => void;
  onOpenAddGameModal: () => void;
  onDeleteCustomGame: (appid: string) => void;
  onSelectTheme: (theme: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settingsTab,
  shellEnabled,
  isSimulated,
  customGames,
  currentTheme,
  onClose,
  onTabChange,
  onToggleShell,
  onReloadLibrary,
  onOpenAddGameModal,
  onDeleteCustomGame,
  onSelectTheme,
}) => {
  return (
    <GamepadModal
      isOpen={isOpen}
      onClose={onClose}
      title="Configurações do Atlas"
      tabs={[
        { id: "geral", label: "Geral" },
        { id: "custom", label: "Jogos Customizados" },
        { id: "aparencia", label: "Aparência" },
      ]}
      activeTab={settingsTab}
      onTabChange={(tabId) => onTabChange(tabId as SettingsTab)}
    >
      {settingsTab === "geral" && (
        <div className="playnite-tab-content">
          <div className="playnite-tab-pane">
            <div className="playnite-group">
              <div className="playnite-group-title">Sistema</div>
              <div className="playnite-form-grid">
                <div
                  className="playnite-field full-width"
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div className="settings-label">
                    <span
                      className="settings-label-title"
                      style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}
                    >
                      Iniciar como Shell do Windows
                    </span>
                    <span
                      className="settings-label-desc"
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        marginTop: "0.25rem",
                      }}
                    >
                      Substitui o Explorer.exe pelo Atlas para este usuário,
                      iniciando direto na sua biblioteca de jogos ao ligar o PC.
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={shellEnabled}
                      onChange={(e) => onToggleShell(e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div
                  className="playnite-field full-width"
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "1rem",
                  }}
                >
                  <div className="settings-label">
                    <span
                      className="settings-label-title"
                      style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}
                    >
                      Recarregar Biblioteca
                    </span>
                    <span
                      className="settings-label-desc"
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        marginTop: "0.25rem",
                      }}
                    >
                      Força uma nova varredura nas pastas locais do Steam para
                      detectar novos jogos instalados.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      onReloadLibrary();
                      onClose();
                    }}
                  >
                    Recarregar
                  </button>
                </div>
              </div>
            </div>

            {isSimulated && (
              <div
                className="settings-alert"
                style={{
                  background: "rgba(234, 179, 8, 0.1)",
                  border: "1px solid rgba(234, 179, 8, 0.2)",
                  color: "#fef08a",
                  padding: "1rem",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  lineHeight: "1.4",
                }}
              >
                ⚠️ <strong>Aviso:</strong> O Steam local ou a API do Tauri não
                foram detectados. A interface está exibindo jogos de teste e
                operando em modo de simulação. Instale o Rust e configure o app
                no Windows para habilitar o comportamento nativo.
              </div>
            )}
          </div>
        </div>
      )}

      {settingsTab === "custom" && (
        <div className="playnite-tab-content">
          <div className="playnite-tab-pane">
            <div className="playnite-group">
              <div className="playnite-group-title">Jogos Customizados</div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1.5rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  Gerencie seus atalhos manuais de jogos
                </span>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onOpenAddGameModal}
                >
                  + Adicionar Jogo
                </button>
              </div>

              {/* List of custom games */}
              <div className="custom-games-list">
                <span
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: "0.5rem",
                    display: "block",
                  }}
                >
                  Jogos Adicionados ({customGames.length})
                </span>
                {customGames.length === 0 ? (
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      fontStyle: "italic",
                      marginTop: "0.5rem",
                    }}
                  >
                    Nenhum jogo customizado adicionado ainda.
                  </div>
                ) : (
                  customGames.map((game) => (
                    <div
                      key={game.appid}
                      className="custom-game-item"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "rgba(0,0,0,0.2)",
                        padding: "0.5rem 0.75rem",
                        borderRadius: "6px",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <div
                        className="custom-game-item-info"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.25rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginRight: "1rem",
                        }}
                      >
                        <span
                          className="custom-game-item-name"
                          style={{ fontWeight: 600, fontSize: "0.85rem" }}
                        >
                          {game.name}
                        </span>
                        <span
                          className="custom-game-item-path"
                          title={game.exe_path}
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {game.exe_path}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-delete"
                        onClick={() => onDeleteCustomGame(game.appid)}
                        style={{ flexShrink: 0 }}
                      >
                        Excluir
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {settingsTab === "aparencia" && (
        <div className="playnite-tab-content">
          <div className="playnite-tab-pane">
            <div className="playnite-group">
              <div className="playnite-group-title">Personalização de Temas</div>
              <div
                className="settings-row-theme-header"
                style={{ marginBottom: "1.5rem" }}
              >
                <span
                  className="settings-label-title"
                  style={{ fontSize: "0.85rem", fontWeight: 600, display: "block" }}
                >
                  Selecione o Tema do Console
                </span>
                <span
                  className="settings-label-desc"
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                    marginTop: "0.25rem",
                  }}
                >
                  Altere o visual geral, cores, fontes e comportamento estético do
                  Atlas Launcher.
                </span>
              </div>
              <div className="theme-selector-grid">
                <div
                  tabIndex={0}
                  className={`theme-selector-card ${
                    currentTheme === "atlas" ? "active" : ""
                  }`}
                  onClick={() => onSelectTheme("atlas")}
                >
                  <div className="theme-preview-box atlas-theme-preview">
                    <span className="preview-indicator" />
                    <div className="theme-mini-logo">ATLAS</div>
                    <div className="theme-color-dots">
                      <span style={{ background: "#06b6d4" }} />
                      <span style={{ background: "#3b82f6" }} />
                      <span style={{ background: "#8b5cf6" }} />
                    </div>
                  </div>
                  <div className="theme-card-title">Atlas (Padrão)</div>
                </div>

                <div
                  tabIndex={0}
                  className={`theme-selector-card ${
                    currentTheme === "ps5" ? "active" : ""
                  }`}
                  onClick={() => onSelectTheme("ps5")}
                >
                  <div className="theme-preview-box ps5-theme-preview">
                    <span className="preview-indicator" />
                    <div className="theme-mini-logo">PS5</div>
                    <div className="theme-color-dots">
                      <span style={{ background: "#0072CE" }} />
                      <span style={{ background: "#ffffff" }} />
                      <span style={{ background: "#0a0a0c" }} />
                    </div>
                  </div>
                  <div className="theme-card-title">PlayStation 5</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="playnite-edit-footer">
        <button
          type="button"
          className="btn-primary"
          onClick={onClose}
        >
          Fechar [ESC]
        </button>
      </div>
    </GamepadModal>
  );
};
