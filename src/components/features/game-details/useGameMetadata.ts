import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface GameMetadata {
  title?: string;
  description?: string;
  genres: string[];
  developer?: string;
  publisher?: string;
  release_date?: string;
  rating?: number;
  review_summary?: string;
  cover_url?: string;
  background_url?: string;
  igdb_id?: number;
  igdb_url?: string;
}

export function useGameMetadata(gameId: string, forceRefreshOnMount: boolean = false) {
  const [metadata, setMetadata] = useState<GameMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetadata = (forceRefresh: boolean = false) => {
    if (!gameId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    invoke<GameMetadata>("get_game_metadata", { gameId, forceRefresh })
      .then((data) => {
        setMetadata(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch game metadata:", err);
        setError(String(err));
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMetadata(forceRefreshOnMount);
  }, [gameId]);

  return { metadata, loading, error, refetch: fetchMetadata };
}
