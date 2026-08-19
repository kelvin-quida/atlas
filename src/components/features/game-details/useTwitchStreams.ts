import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  profile_image_url?: string;
  is_mature: boolean;
}

interface UseTwitchStreamsResult {
  streams: TwitchStream[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTwitchStreams(gameName: string | undefined): UseTwitchStreamsResult {
  const [streams, setStreams] = useState<TwitchStream[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStreams = useCallback(async () => {
    if (!gameName || !gameName.trim()) {
      setStreams([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await invoke<TwitchStream[]>("get_twitch_streams", {
        gameName: gameName.trim(),
      });
      setStreams(result || []);
    } catch (err: any) {
      console.error("[useTwitchStreams] Error fetching streams:", err);
      setError(typeof err === "string" ? err : "Não foi possível carregar as transmissões da Twitch.");
      setStreams([]);
    } finally {
      setLoading(false);
    }
  }, [gameName]);

  useEffect(() => {
    let isMounted = true;
    fetchStreams().then(() => {
      if (!isMounted) return;
    });

    return () => {
      isMounted = false;
    };
  }, [fetchStreams]);

  return { streams, loading, error, refetch: fetchStreams };
}
