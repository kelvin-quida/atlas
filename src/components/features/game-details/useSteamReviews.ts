import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SteamReviewItem {
  recommendationid: string;
  author_name: string;
  author_avatar: string;
  playtime_forever_hours: number;
  voted_up: boolean;
  votes_up: number;
  votes_funny: number;
  review_text: string;
  timestamp_created: number;
  language: string;
}

export interface SteamReviewsFetchResult {
  reviews: SteamReviewItem[];
  cursor?: string;
}

interface UseSteamReviewsResult {
  reviews: SteamReviewItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

export function useSteamReviews(
  appid: string | undefined,
  gameName: string | undefined,
  pageSize: number = 20,
  language: string = "brazilian"
): UseSteamReviewsResult {
  const [reviews, setReviews] = useState<SteamReviewItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);

  // Initial fetch for a game
  const fetchInitialReviews = useCallback(async () => {
    if (!appid && !gameName) {
      setReviews([]);
      setCursor(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await invoke<SteamReviewsFetchResult>("get_steam_reviews", {
        appid: appid ? appid.trim() : "",
        gameName: gameName ? gameName.trim() : null,
        count: pageSize,
        language: language || "brazilian",
        cursor: "*",
      });

      const fetched = res?.reviews || [];
      setReviews(fetched);
      setCursor(res?.cursor || null);
      setHasMore(fetched.length > 0 && !!res?.cursor);
    } catch (rustErr) {
      console.warn("[useSteamReviews] Rust command error:", rustErr);
      setError("Não foi possível carregar as análises da comunidade.");
      setReviews([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [appid, gameName, pageSize, language]);

  // Load next page using stored cursor
  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || !cursor || !appid) return;

    setLoadingMore(true);

    try {
      const res = await invoke<SteamReviewsFetchResult>("get_steam_reviews", {
        appid: appid ? appid.trim() : "",
        gameName: gameName ? gameName.trim() : null,
        count: pageSize,
        language: language || "brazilian",
        cursor,
      });

      const newItems = res?.reviews || [];
      if (newItems.length > 0) {
        setReviews((prev) => {
          const existingIds = new Set(prev.map((r) => r.recommendationid));
          const uniqueNewItems = newItems.filter((r) => !existingIds.has(r.recommendationid));
          return [...prev, ...uniqueNewItems];
        });
        setCursor(res?.cursor || null);
        setHasMore(newItems.length >= pageSize && !!res?.cursor && res.cursor !== cursor);
      } else {
        setHasMore(false);
      }
    } catch (rustErr) {
      console.warn("[useSteamReviews] loadMore error:", rustErr);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [appid, gameName, pageSize, language, cursor, loading, loadingMore, hasMore]);

  useEffect(() => {
    let isMounted = true;
    fetchInitialReviews().then(() => {
      if (!isMounted) return;
    });

    return () => {
      isMounted = false;
    };
  }, [fetchInitialReviews]);

  return {
    reviews,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refetch: fetchInitialReviews,
  };
}
