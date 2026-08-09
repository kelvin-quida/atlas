export interface SteamGame {
  appid: string;       // maps to GameDto.id (UUID) or steam_app_id
  name: string;
  installdir: string;
  library_path: string;
  image_url: string;   // maps to GameDto.cover_url
  bg_url?: string;     // maps to background image
  isCustom?: boolean;
  exe_path?: string;
  last_played?: string;
  added_at?: string;
}

// Shape of the DB DTO returned from Rust
export interface GameDto {
  id: string;
  name: string;
  platform: string;
  exe_path?: string;
  install_dir?: string;
  steam_app_id?: string;
  igdb_id?: number;
  cover_url?: string;
  background_url?: string;
  last_played?: string;
  added_at: string;
}

export interface PlaytimeStats {
  total_seconds: number;
  formatted: string;
}

export type SettingsTab = "geral" | "custom" | "aparencia";
export type EditTab = "general" | "advanced" | "media";
export type FocusArea = "carousel" | "header";

export interface SteamUserInfo {
  steam_id: string;
  persona_name: string;
  avatar_url: string;
  profile_url: string;
}

export interface SteamImportResult {
  imported: number;
  updated: number;
  total: number;
}

export interface SteamImportProgress {
  current: number;
  total: number;
  percentage: number;
  current_game: string;
}
