import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type GameMedia =
  | {
      type: "screenshot";
      url: string;
      thumbnailUrl?: string;
      width?: number;
      height?: number;
    }
  | {
      type: "trailer";
      url: string;
      thumbnailUrl?: string;
      duration?: number;
    };

interface UseGameMediaResult {
  media: GameMedia[];
  loading: boolean;
  error: string | null;
}

function deduplicateMedia(items: GameMedia[]): GameMedia[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.url || seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  });
}

export function useGameMedia(gameId: string | undefined, gameName: string | undefined): UseGameMediaResult {
  const [media, setMedia] = useState<GameMedia[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId || !gameName) {
      setMedia([]);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    invoke<GameMedia[]>("db_get_game_media", { gameId, gameName })
      .then((res) => {
        if (isMounted) {
          setMedia(deduplicateMedia(res || []));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Error fetching game media:", err);
          setError(err.toString());
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [gameId, gameName]);

  return { media, loading, error };
}
