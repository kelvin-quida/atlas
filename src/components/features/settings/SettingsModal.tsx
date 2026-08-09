import React from "react";
import { GamepadModal } from "../../GamepadModal";
import { SteamGame, SettingsTab, SteamUserInfo, SteamImportResult, SteamImportProgress } from "../../../types/game";

interface SettingsModalProps {
  isOpen: boolean;
  settingsTab: SettingsTab;
  shellEnabled: boolean;
  isSimulated: boolean;
  customGames: SteamGame[];
  currentTheme: string;
  steamUser: SteamUserInfo | null;
  steamLoggingIn: boolean;
  steamImporting: boolean;
  steamImportResult: SteamImportResult | null;
  steamImportProgress: SteamImportProgress | null;
  onClose: () => void;
  onTabChange: (tab: SettingsTab) => void;
  onToggleShell: (checked: boolean) => void;
  onReloadLibrary: () => void;
  onOpenAddGameModal: () => void;
  onDeleteCustomGame: (appid: string) => void;
  onSelectTheme: (theme: string) => void;
  onSteamLogin: () => void;
  onSteamLogout: () => void;
  onSteamImport: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settingsTab,
  shellEnabled,
  isSimulated,
  customGames,
  currentTheme,
  steamUser,
  steamLoggingIn,
  steamImporting,
  steamImportResult,
  steamImportProgress,
  onClose,
  onTabChange,
  onToggleShell,
  onReloadLibrary,
  onOpenAddGameModal,
  onDeleteCustomGame,
  onSelectTheme,
  onSteamLogin,
  onSteamLogout,
  onSteamImport,
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

            {/* ── Steam Account Section ────────────────────────────── */}
            <div className="playnite-group" style={{ marginTop: "1.5rem" }}>
              <div className="playnite-group-title">Conta Steam</div>
              <div className="playnite-form-grid">
                {steamUser ? (
                  /* Logged in — show profile + actions */
                  <>
                    <div
                      className="steam-profile-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        background: "rgba(102, 192, 244, 0.08)",
                        border: "1px solid rgba(102, 192, 244, 0.15)",
                        borderRadius: "10px",
                        padding: "0.75rem 1rem",
                      }}
                    >
                      {steamUser.avatar_url && (
                        <img
                          src={steamUser.avatar_url}
                          alt="Steam Avatar"
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: "50%",
                            border: "2px solid rgba(102, 192, 244, 0.4)",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "0.9rem",
                            color: "#e0e0e0",
                          }}
                        >
                          {steamUser.persona_name}
                        </div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "rgba(102, 192, 244, 0.7)",
                            marginTop: "0.15rem",
                          }}
                        >
                          Steam ID: {steamUser.steam_id}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-delete"
                        onClick={onSteamLogout}
                        style={{ flexShrink: 0, fontSize: "0.78rem" }}
                      >
                        Desconectar
                      </button>
                    </div>

                    <div
                      className="playnite-field full-width"
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "0.75rem",
                      }}
                    >
                      <div className="settings-label">
                        <span
                          className="settings-label-title"
                          style={{
                            display: "block",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                          }}
                        >
                          Importar Biblioteca Steam
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
                          Sincroniza todos os seus jogos da Steam para o Atlas,
                          incluindo jogos não instalados localmente.
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-steam-import"
                        onClick={onSteamImport}
                        disabled={steamImporting}
                        style={{
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        {steamImporting ? (
                          <>
                            <span className="steam-spinner" />
                            {steamImportProgress
                              ? `Importando ${steamImportProgress.percentage}%`
                              : "Iniciando..."}
                          </>
                        ) : (
                          "Importar Jogos"
                        )}
                      </button>
                    </div>

                    {steamImporting && steamImportProgress && (
                      <div
                        className="steam-progress-container"
                        style={{
                          marginTop: "0.75rem",
                          background: "rgba(0, 0, 0, 0.3)",
                          borderRadius: "8px",
                          padding: "0.75rem 1rem",
                          border: "1px solid rgba(102, 187, 106, 0.2)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            color: "#a5d6a7",
                            marginBottom: "0.4rem",
                          }}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "70%",
                            }}
                          >
                            {steamImportProgress.current_game}
                          </span>
                          <span>
                            {steamImportProgress.percentage}% ({steamImportProgress.current}/{steamImportProgress.total})
                          </span>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: "6px",
                            background: "rgba(255, 255, 255, 0.1)",
                            borderRadius: "3px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${steamImportProgress.percentage}%`,
                              height: "100%",
                              background: "linear-gradient(90deg, #4caf50, #81c784)",
                              borderRadius: "3px",
                              transition: "width 0.15s ease-out",
                              boxShadow: "0 0 10px rgba(76, 175, 80, 0.5)",
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {steamImportResult && (
                      <div
                        className="steam-import-result"
                        style={{
                          background: "rgba(102, 187, 106, 0.1)",
                          border: "1px solid rgba(102, 187, 106, 0.25)",
                          borderRadius: "8px",
                          padding: "0.75rem 1rem",
                          fontSize: "0.8rem",
                          marginTop: "0.5rem",
                          color: "#a5d6a7",
                          lineHeight: 1.5,
                        }}
                      >
                        ✓ Importação concluída!{" "}
                        <strong>{steamImportResult.imported}</strong> jogos novos
                        adicionados,{" "}
                        <strong>{steamImportResult.updated}</strong> atualizados
                        — Total: <strong>{steamImportResult.total}</strong> jogos
                        na sua biblioteca Steam.
                      </div>
                    )}
                  </>
                ) : (
                  /* Not logged in — show login button */
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
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                        }}
                      >
                        Conectar com Steam
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
                        Faça login com sua conta Steam para importar toda a sua
                        biblioteca, incluindo jogos não instalados.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-steam-login"
                      onClick={onSteamLogin}
                      disabled={steamLoggingIn}
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      {steamLoggingIn ? (
                        <>
                          <span className="steam-spinner" />
                          Aguardando login...
                        </>
                      ) : (
                        <>
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 256 259"
                            fill="currentColor"
                            style={{ flexShrink: 0 }}
                          >
                            <path d="M127.779 0C57.895 0 .813 55.416.032 124.903L68.791 153.3a35.82 35.82 0 0 1 20.283-6.252c.679 0 1.347.029 2.011.067l30.343-43.946v-.617c0-26.422 21.494-47.916 47.916-47.916 26.422 0 47.916 21.494 47.916 47.916s-21.494 47.916-47.916 47.916h-1.103l-43.248 30.857c0 .526.029 1.058.029 1.58 0 19.816-16.113 35.929-35.929 35.929-17.415 0-31.963-12.453-35.284-28.941L1.958 164.98C16.281 218.135 67.405 256.398 127.779 256.398c70.568 0 127.779-57.211 127.779-127.779C255.558 58.051 198.347 0 127.779 0" />
                          </svg>
                          Conectar com Steam
                        </>
                      )}
                    </button>
                  </div>
                )}
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
