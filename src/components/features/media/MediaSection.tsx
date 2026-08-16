import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { FocusArea } from "../../../types/game";

export interface MediaFolder {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

export interface MovieFile {
  id: string;
  title: string;
  file_name: string;
  path: string;
  extension: string;
  folder_path: string;
  size_mb: number;
}

export interface MediaItem {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  bgGradient: string;
  badgeText: string;
  path?: string;
  isFolder?: boolean;
  isMovie?: boolean;
  isAddButton?: boolean;
  onClick: () => void;
  onDelete?: () => void;
}

interface MediaSectionProps {
  currentTheme: string;
  focusArea: FocusArea;
  selectedMediaIndex: number;
  onOpenYouTube: () => void;
  onOpenTwitch: () => void;
  onOpenBackloggd: () => void;
  onOpenAddMediaFolder: () => void;
  onSelectMedia?: (index: number) => void;
  onItemCountChange?: (count: number) => void;
}

export const MediaSection: React.FC<MediaSectionProps> = ({
  currentTheme,
  focusArea,
  selectedMediaIndex,
  onOpenYouTube,
  onOpenTwitch,
  onOpenBackloggd,
  onOpenAddMediaFolder,
  onSelectMedia,
  onItemCountChange,
}) => {
  const [savedFolders, setSavedFolders] = useState<MediaFolder[]>([]);
  const [savedMovies, setSavedMovies] = useState<MovieFile[]>([]);

  const loadMediaData = () => {
    const rawFolders = localStorage.getItem("atlas_media_folders");
    if (rawFolders) {
      try {
        setSavedFolders(JSON.parse(rawFolders));
      } catch (e) {
        console.error("Erro ao carregar pastas de mídia:", e);
      }
    } else {
      setSavedFolders([]);
    }

    const rawMovies = localStorage.getItem("atlas_media_movies");
    if (rawMovies) {
      try {
        setSavedMovies(JSON.parse(rawMovies));
      } catch (e) {
        console.error("Erro ao carregar filmes de mídia:", e);
      }
    } else {
      setSavedMovies([]);
    }
  };

  useEffect(() => {
    loadMediaData();
    const handleUpdate = () => loadMediaData();
    window.addEventListener("atlas_media_folders_updated", handleUpdate);
    return () => window.removeEventListener("atlas_media_folders_updated", handleUpdate);
  }, []);

  useEffect(() => {
    if (focusArea === "media") {
      const cards = document.querySelectorAll(".media-card");
      const activeCard = cards[selectedMediaIndex] as HTMLElement;
      if (activeCard) {
        activeCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedMediaIndex, focusArea]);

  const handleOpenPath = async (path: string) => {
    try {
      await invoke("open_path_in_system", { path });
    } catch (err) {
      console.warn("Fallback to openPath plugin:", err);
      try {
        await openPath(path);
      } catch (err2) {
        alert(`Não foi possível abrir o arquivo: ${err2}`);
      }
    }
  };

  const handleDeleteMovie = (id: string) => {
    const updated = savedMovies.filter((m) => m.id !== id);
    setSavedMovies(updated);
    localStorage.setItem("atlas_media_movies", JSON.stringify(updated));
  };

  const handleDeleteFolder = (id: string, folderPath: string) => {
    const updatedFolders = savedFolders.filter((f) => f.id !== id);
    setSavedFolders(updatedFolders);
    localStorage.setItem("atlas_media_folders", JSON.stringify(updatedFolders));

    // Optionally filter out movies belonging to this folder
    const updatedMovies = savedMovies.filter((m) => m.folder_path.toLowerCase() !== folderPath.toLowerCase());
    setSavedMovies(updatedMovies);
    localStorage.setItem("atlas_media_movies", JSON.stringify(updatedMovies));
  };

  const mediaItems: MediaItem[] = [
    {
      id: "add_folder",
      title: "Adicionar Pasta de Filmes",
      category: "Biblioteca Local",
      description: "Selecione uma pasta do seu computador para importar e escancear filmes.",
      bgGradient: "linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(6, 78, 59, 0.4) 100%)",
      badgeText: "+ Selecionar Pasta",
      isAddButton: true,
      onClick: onOpenAddMediaFolder,
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      ),
    },
    ...savedMovies.map((movie) => ({
      id: movie.id,
      title: movie.title,
      category: `Filme (${movie.extension}) • ${movie.size_mb > 0 ? `${movie.size_mb} MB` : 'Vídeo'}`,
      description: movie.file_name,
      bgGradient: "linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(127, 29, 29, 0.4) 100%)",
      badgeText: "🍿 Assistir Filme",
      path: movie.path,
      isMovie: true,
      onClick: () => handleOpenPath(movie.path),
      onDelete: () => handleDeleteMovie(movie.id),
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
        </svg>
      ),
    })),
    ...savedFolders.map((folder) => ({
      id: folder.id,
      title: folder.name,
      category: "Pasta Importada",
      description: folder.path,
      bgGradient: "linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(120, 53, 15, 0.4) 100%)",
      badgeText: "📁 Explorar Pasta",
      path: folder.path,
      isFolder: true,
      onClick: () => handleOpenPath(folder.path),
      onDelete: () => handleDeleteFolder(folder.id, folder.path),
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
    })),
    {
      id: "youtube",
      title: "YouTube",
      category: "Vídeos & Transmissões",
      description: "Assista a trailers, gameplays, reviews e conteúdos da comunidade gamer.",
      bgGradient: "linear-gradient(135deg, rgba(255, 0, 0, 0.25) 0%, rgba(120, 0, 0, 0.4) 100%)",
      badgeText: "Assistir Vídeos",
      onClick: onOpenYouTube,
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      ),
    },
    {
      id: "twitch",
      title: "Twitch",
      category: "Livestreams Ao Vivo",
      description: "Acompanhe seus streamers favoritos, e-sports e transmissões ao vivo.",
      bgGradient: "linear-gradient(135deg, rgba(145, 71, 255, 0.25) 0%, rgba(75, 20, 150, 0.4) 100%)",
      badgeText: "Ver Lives",
      onClick: onOpenTwitch,
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.571 4.714h1.715v5.143h-1.715zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
        </svg>
      ),
    },
    {
      id: "backloggd",
      title: "Backloggd",
      category: "Diário & Críticas",
      description: "Organize sua coleção, registre seus jogos zerados e confira avaliações.",
      bgGradient: "linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(15, 23, 42, 0.5) 100%)",
      badgeText: "Meu Perfil",
      onClick: onOpenBackloggd,
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 4H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM5.5 7h3a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5zm-1 7.5a.5.5 0 0 1 .5-.5h14a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm15 2.5H4.5v-1h15v1zm0-4h-8a.5.5 0 0 1 0-1h8a.5.5 0 0 1 0 1zm0-2h-8a.5.5 0 0 1 0-1h8a.5.5 0 0 1 0 1zm0-2h-8a.5.5 0 0 1 0-1h8a.5.5 0 0 1 0 1z" />
        </svg>
      ),
    },
  ];

  useEffect(() => {
    onItemCountChange?.(mediaItems.length);
  }, [mediaItems.length, onItemCountChange]);

  return (
    <div className={`media-section-wrapper theme-${currentTheme}`}>
      <div className="media-section-header">
        <h2 className="media-section-title">Central de Mídia & Filmes</h2>
        <span className="media-section-subtitle">
          {savedMovies.length > 0
            ? `${savedMovies.length} filme(s) encontrado(s) em ${savedFolders.length} pasta(s)`
            : "Acesse seus filmes locais e aplicativos de streaming"}
        </span>
      </div>

      <div className="media-grid">
        {mediaItems.map((item, index) => {
          const isFocused = focusArea === "media" && selectedMediaIndex === index;
          return (
            <div
              key={item.id}
              className={`media-card ${isFocused ? "focused" : ""}`}
              style={{ background: item.bgGradient }}
              onClick={() => {
                onSelectMedia?.(index);
                item.onClick();
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
                <div className="media-card-icon-wrapper">{item.icon}</div>
                {(item.isFolder || item.isMovie) && item.onDelete && (
                  <button
                    type="button"
                    title="Remover"
                    className="media-card-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onDelete?.();
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>

              <div className="media-card-content">
                <span className="media-card-category">{item.category}</span>
                <h3 className="media-card-title">{item.title}</h3>
                <p className="media-card-desc" title={item.description}>{item.description}</p>
                <div className="media-card-badge">{item.badgeText}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
