import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  is_external_url?: boolean;
  author: string;
  contents: string;
  feedlabel?: string;
  date: number;
  feedname?: string;
  feed_type?: number;
  appid: number;
}

interface UseSteamNewsResult {
  news: SteamNewsItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSteamNews(
  appid: string | undefined,
  gameName: string | undefined,
  count: number = 5
): UseSteamNewsResult {
  const [news, setNews] = useState<SteamNewsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    if (!appid && !gameName) {
      setNews([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const items = await invoke<SteamNewsItem[]>("get_steam_news", {
        appid: appid ? appid.trim() : "",
        gameName: gameName ? gameName.trim() : null,
        count,
      });
      setNews(items || []);
    } catch (rustErr) {
      console.warn("[useSteamNews] Rust command failed, attempting direct fetch fallback...", rustErr);
      try {
        let targetAppId = appid && /^\d+$/.test(appid.trim()) ? appid.trim() : null;

        // Fallback: Clean game name (remove trailing (PC), (Atalho), etc.)
        const cleanName = gameName
          ? gameName.replace(/\s*[\(\[].*?[\)\]]/g, "").trim()
          : "";

        if (!targetAppId && cleanName) {
          // 1. Try steamcommunity SearchApps
          try {
            const searchAppsRes = await fetch(
              `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(cleanName)}`
            );
            if (searchAppsRes.ok) {
              const searchAppsData = await searchAppsRes.json();
              if (Array.isArray(searchAppsData) && searchAppsData.length > 0 && searchAppsData[0].appid) {
                targetAppId = searchAppsData[0].appid.toString();
              }
            }
          } catch (e) {
            console.warn("SearchApps fallback failed:", e);
          }

          // 2. Try storesearch with cc=US
          if (!targetAppId) {
            const storeRes = await fetch(
              `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanName)}&cc=US&l=english`
            );
            if (storeRes.ok) {
              const storeData = await storeRes.json();
              if (storeData?.items && storeData.items.length > 0) {
                targetAppId = storeData.items[0].id.toString();
              }
            }
          }
        }

        if (!targetAppId) {
          setNews([]);
          setLoading(false);
          return;
        }

        const fetchCount = count + 5;
        const response = await fetch(
          `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${targetAppId}&count=${fetchCount}&maxlength=0&format=json`
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        const rawItems: SteamNewsItem[] = data?.appnews?.newsitems || [];
        const items = rawItems
          .filter((item) => {
            const combined = `${item.url || ""} ${item.feedname || ""} ${item.feedlabel || ""} ${item.author || ""}`.toLowerCase();
            return (
              !combined.includes("gamemag") &&
              !combined.includes("rockpapershotgun") &&
              !combined.includes("rock_paper") &&
              !combined.includes("rock-paper") &&
              !combined.includes("rock, paper") &&
              !combined.includes("shotgun")
            );
          })
          .slice(0, count);
        setNews(items);
      } catch (fetchErr: any) {
        console.error("[useSteamNews] Error fetching Steam news:", fetchErr);
        setError("Não foi possível carregar as notícias da Steam.");
        setNews([]);
      }
    } finally {
      setLoading(false);
    }
  }, [appid, gameName, count]);

  useEffect(() => {
    let isMounted = true;
    fetchNews().then(() => {
      if (!isMounted) return;
    });

    return () => {
      isMounted = false;
    };
  }, [fetchNews]);

  return { news, loading, error, refetch: fetchNews };
}
