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

export function useGameMetadata(gameId: string) {
  const [metadata, setMetadata] = useState<GameMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!gameId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    invoke<GameMetadata>("get_game_metadata", { gameId })
      .then((data) => {
        if (isMounted) {
          setMetadata(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Failed to fetch game metadata:", err);
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [gameId]);

  return { metadata, loading, error };
}
