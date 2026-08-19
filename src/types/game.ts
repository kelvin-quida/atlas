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
  is_installed?: boolean;
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
  is_installed: boolean;
}

export interface PlaytimeStats {
  total_seconds: number;
  formatted: string;
}

export type SettingsTab = "geral" | "custom" | "aparencia";
export type EditTab = "general" | "advanced" | "media";
export type MainSection = "games" | "media" | "dashboard";
export type FocusArea = "carousel" | "header" | "media" | "dashboard";

export interface GameStatsDetail {
  game_id: string;
  name: string;
  cover_url?: string;
  background_url?: string;
  total_seconds: number;
  total_formatted: string;
  weekly_seconds: number;
  weekly_formatted: string;
  monthly_seconds: number;
  monthly_formatted: string;
  session_count: number;
  avg_session_seconds: number;
  avg_session_formatted: string;
  longest_session_seconds: number;
  longest_session_formatted: string;
  last_played?: string;
}

export interface PlaySessionDetail {
  id: number;
  game_id: string;
  game_name: string;
  cover_url?: string;
  started_at: string;
  ended_at?: string;
  duration_seconds: number;
  formatted_duration: string;
}

export interface MonthOption {
  year: number;
  month: number;
  label: string;
}

export interface DashboardStats {
  total_playtime_seconds: number;
  total_formatted: string;
  weekly_playtime_seconds: number;
  weekly_formatted: string;
  monthly_playtime_seconds: number;
  monthly_formatted: string;
  selected_year: number;
  selected_month: number;
  selected_month_label: string;
  available_months: MonthOption[];
  total_sessions_count: number;
  weekly_sessions_count: number;
  monthly_sessions_count: number;
  played_games_count: number;
  weekly_played_games_count: number;
  monthly_played_games_count: number;
  total_library_count: number;
  game_stats: GameStatsDetail[];
  recent_sessions: PlaySessionDetail[];
}

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

