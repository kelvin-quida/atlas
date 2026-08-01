import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { GamepadModal } from "../../GamepadModal";
import { SteamGame, EditTab, PlaytimeStats } from "../../../types/game";

interface EditGameModalProps {
  editingGame: SteamGame | null;
  editName: string;
  editExe: string;
  editImg: string;
  editBg: string;
  editTab: EditTab;
  editingSearchingIgdb: boolean;
  playtimes: Record<string, PlaytimeStats>;
  onClose: () => void;
  onTabChange: (tab: EditTab) => void;
  setEditName: (name: string) => void;
  setEditExe: (exe: string) => void;
  onPickExe: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onOpenImagePicker: (target: "cover" | "background") => void;
}

export const EditGameModal: React.FC<EditGameModalProps> = ({
  editingGame,
  editName,
  editExe,
  editImg,
  editBg,
  editTab,
  editingSearchingIgdb,
  playtimes,
  onClose,
  onTabChange,
  setEditName,
  setEditExe,
  onPickExe,
  onSubmit,
  onOpenImagePicker,
}) => {
  return (
    <GamepadModal
      isOpen={editingGame !== null}
      onClose={onClose}
      title={editingGame ? `Editar - ${editingGame.name}` : ""}
      tabs={[
        { id: "general", label: "Geral" },
        { id: "advanced", label: "Avançado" },
        { id: "media", label: "Mídia" },
      ]}
      activeTab={editTab}
      onTabChange={(tabId) => onTabChange(tabId as EditTab)}
    >
      {editingGame && (
        <form className="playnite-edit-form" onSubmit={onSubmit}>
          <div className="playnite-tab-content">
            {editTab === "general" && (
              <div className="playnite-tab-pane">
                <div className="playnite-group">
                  <div className="playnite-group-title">Informações Básicas</div>
                  <div className="playnite-form-grid">
                    <div className="playnite-field full-width">
                      <label>Nome do Jogo *</label>
                      <div className="playnite-input-wrapper">
                        <input
                          type="text"
                          placeholder="Ex: Cyberpunk 2077"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="playnite-field">
                      <label>Plataforma</label>
                      <div className="playnite-input-wrapper">
                        <input
                          type="text"
                          value={editingGame.isCustom ? "Manual (PC)" : "Steam"}
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="playnite-field">
                      <label>ID do Jogo</label>
                      <div className="playnite-input-wrapper">
                        <input
                          type="text"
                          value={editingGame.appid}
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="playnite-group">
                  <div className="playnite-group-title">Instalação</div>
                  <div className="playnite-form-grid">
                    <div className="playnite-field full-width">
                      <label>Arquivo Executável *</label>
                      <div className="playnite-input-wrapper">
                        <input
                          type="text"
                          placeholder="Escolha o arquivo .exe do jogo"
                          value={editExe}
                          onChange={(e) => setEditExe(e.target.value)}
                          required
                          readOnly
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={onPickExe}
                        >
                          Buscar
                        </button>
                      </div>
                    </div>

                    <div className="playnite-field full-width">
                      <label>Pasta de Instalação</label>
                      <div className="playnite-input-wrapper">
                        <input
                          type="text"
                          value={editingGame.installdir || "Não especificada"}
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {editTab === "advanced" && (
              <div className="playnite-tab-pane">
                <div className="playnite-group">
                  <div className="playnite-group-title">
                    Rastreamento & Execução
                  </div>
                  <div className="playnite-form-grid">
                    <div className="playnite-field full-width">
                      <label>Argumentos de Inicialização</label>
                      <div className="playnite-input-wrapper">
                        <input
                          type="text"
                          placeholder="Ex: -windowed -noborder"
                          disabled
                        />
                      </div>
                    </div>

                    <div className="playnite-field full-width">
                      <label>Diretório de Trabalho (Auto)</label>
                      <div className="playnite-input-wrapper">
                        <input
                          type="text"
                          value={
                            editExe
                              ? editExe.substring(0, editExe.lastIndexOf("\\"))
                              : "Automático"
                          }
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="playnite-group">
                  <div className="playnite-group-title">Estatísticas</div>
                  <div className="playnite-form-grid">
                    <div className="playnite-field">
                      <label>Tempo Total Jogado</label>
                      <div className="playnite-input-wrapper">
                        <input
                          type="text"
                          value={
                            playtimes[editingGame.appid]?.formatted || "0h 0m"
                          }
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="playnite-field">
                      <label>Último Acesso</label>
                      <div className="playnite-input-wrapper">
                        <input
                          type="text"
                          value={
                            editingGame.last_played
                              ? new Date(
                                  editingGame.last_played
                                ).toLocaleString()
                              : "Nunca jogado"
                          }
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="playnite-field full-width">
                      <label>Data Adicionado à Biblioteca</label>
                      <div className="playnite-input-wrapper">
                        <input
                          type="text"
                          value={
                            editingGame.added_at
                              ? new Date(editingGame.added_at).toLocaleString()
                              : "Desconhecido"
                          }
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {editTab === "media" && (
              <div className="playnite-tab-pane">
                <div className="playnite-group">
                  <div className="playnite-group-title">Arquivos de Mídia</div>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                      marginBottom: "1.25rem",
                    }}
                  >
                    Clique em um dos cartões de mídia abaixo para buscar e
                    escolher imagens na internet em segundo plano.
                  </p>

                  <div className="playnite-media-previews">
                    <div
                      tabIndex={0}
                      role="button"
                      className="playnite-media-preview-box clickable focusable"
                      onClick={() => onOpenImagePicker("cover")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenImagePicker("cover");
                        }
                      }}
                      title="Clique ou pressione Enter para buscar capas para este jogo"
                    >
                      <span className="preview-label">Visualização Capa 🔍</span>
                      <div className="preview-image-container">
                        {editImg ? (
                          <img
                            src={
                              editImg.startsWith("http") ||
                              editImg.startsWith("data:")
                                ? editImg
                                : convertFileSrc(editImg)
                            }
                            alt="Capa"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "";
                            }}
                          />
                        ) : (
                          <div className="preview-placeholder">
                            Clique para Buscar Capa
                          </div>
                        )}
                        <div className="preview-overlay-badge">Alterar Capa</div>
                      </div>
                    </div>

                    <div
                      tabIndex={0}
                      role="button"
                      className="playnite-media-preview-box clickable focusable"
                      onClick={() => onOpenImagePicker("background")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenImagePicker("background");
                        }
                      }}
                      title="Clique ou pressione Enter para buscar imagens de fundo"
                    >
                      <span className="preview-label">
                        Background / Hero 🔍
                      </span>
                      <div className="preview-image-container">
                        {editBg ? (
                          <img
                            src={
                              editBg.startsWith("http") ||
                              editBg.startsWith("data:")
                                ? editBg
                                : convertFileSrc(editBg)
                            }
                            alt="Background"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "";
                            }}
                          />
                        ) : (
                          <div className="preview-placeholder">
                            Clique para Buscar Background
                          </div>
                        )}
                        <div className="preview-overlay-badge">
                          Alterar Background
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="playnite-edit-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={editingSearchingIgdb}
            >
              {editingSearchingIgdb ? "Buscando Capa..." : "Salvar Alterações"}
            </button>
          </div>
        </form>
      )}
    </GamepadModal>
  );
};
