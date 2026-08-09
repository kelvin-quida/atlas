import { convertFileSrc } from "@tauri-apps/api/core";
import { SteamGame, GameDto, PlaytimeStats } from "../types/game";

// Helper to identify and hide Steam Proton tools, runtimes, and redistributables
export function isProtonOrSteamTool(name: string, appid?: string): boolean {
  if (!name) return false;
  if (
    appid &&
    [
      "228980", "1070560", "1391110", "1628350", "1803580",
      "1458770", "2348520", "2805730", "1887720", "1580130",
      "1245040", "1229540", "1113280", "1168040", "2180100", "250820"
    ].includes(appid)
  ) {
    return true;
  }

  const lower = name.toLowerCase().trim();
  if (
    lower === "proton" ||
    lower.includes("ge-proton") ||
    lower.includes("proton-ge") ||
    lower.includes("proton-tkg") ||
    lower.includes("steam linux runtime") ||
    lower.includes("steamworks common redistributables") ||
    lower.includes("steam controller configs")
  ) {
    return true;
  }

  if (lower.startsWith("proton")) {
    const rest = lower.slice(6).trim();
    if (!rest) return true;
    const firstChar = rest.charAt(0);
    if (/\d/.test(firstChar) || firstChar === "(" || firstChar === "-" || firstChar === ".") {
      return true;
    }
    if (
      rest.includes("experimental") ||
      rest.includes("hotfix") ||
      rest.includes("next") ||
      rest.includes("easyanticheat") ||
      rest.includes("battleye") ||
      rest.includes("runtime") ||
      rest.includes("container") ||
      rest.includes("tool") ||
      rest.includes("beta") ||
      rest.includes("sdk")
    ) {
      return true;
    }
  }

  return false;
}

// Map a DB GameDto to the legacy SteamGame shape used throughout the UI
export function gameDtoToSteamGame(dto: GameDto): SteamGame {
  return {
    appid: dto.steam_app_id || dto.id,
    name: dto.name,
    installdir: dto.install_dir ?? "",
    library_path: "",
    image_url: dto.cover_url ?? "",
    bg_url: dto.background_url ?? "",
    isCustom: dto.platform === "manual",
    exe_path: dto.exe_path,
    last_played: dto.last_played,
    added_at: dto.added_at,
    is_installed: dto.is_installed ?? (dto.platform === "manual" || !!dto.exe_path || !!dto.install_dir),
  };
}

// Resolve image source: local AppData path → asset:// URL, remote → passthrough
export function getGameImageUrl(game: SteamGame): string {
  if (!game.image_url) return "";
  // Remote URLs pass through as-is
  if (
    game.image_url.startsWith("http://") ||
    game.image_url.startsWith("https://") ||
    game.image_url.startsWith("data:")
  ) {
    return game.image_url;
  }
  // Local relative path (e.g. "assets/covers/abc.jpg") — needs convertFileSrc
  try {
    return convertFileSrc(game.image_url);
  } catch (e) {
    console.error("Failed to convert file src:", e);
    return "";
  }
}

// Generate consistent premium CSS background gradient based on name hash
export function getGradientBg(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = Math.abs((hash + 80) % 360);
  return `linear-gradient(135deg, hsl(${h1}, 65%, 22%) 0%, hsl(${h2}, 65%, 10%) 100%)`;
}

// Generate game-specific widgets for PS5 theme (updated with real playtime stats)
export function getGameWidgets(game: SteamGame, playtimes: Record<string, PlaytimeStats>) {
  const name = game.name;
  const playtimeFormatted = playtimes[game.appid]?.formatted || "< 1m";

  if (name.includes("Baldur's Gate")) {
    return [
      { title: "Troféus", desc: "Ato III iniciado", value: "32%", progress: 32 },
      { title: "Atividades", desc: "Acampamento na taverna", value: "Aventura ativa" },
      { title: "Tempo jogado", desc: "Tempo total registrado", value: playtimeFormatted }
    ];
  }
  if (name.includes("Cyberpunk")) {
    return [
      { title: "Troféus", desc: "Cidade dos Sonhos", value: "48%", progress: 48 },
      { title: "Atividades", desc: "Trabalho Sujo com Rogue", value: "Missão pendente" },
      { title: "Tempo jogado", desc: "Tempo total registrado", value: playtimeFormatted }
    ];
  }
  if (name.includes("Elden Ring")) {
    return [
      { title: "Troféus", desc: "Lendário Lorde de Limgrave", value: "78%", progress: 78 },
      { title: "Atividades", desc: "Explorar Ruínas de Caelid", value: "Nível 105" },
      { title: "Tempo jogado", desc: "Tempo total registrado", value: playtimeFormatted }
    ];
  }
  if (name.includes("Hades")) {
    return [
      { title: "Fugas", desc: "Tentativas de fuga bem sucedidas: 14", value: "14 fugas" },
      { title: "Troféus", desc: "Sangue e Trevas", value: "90%", progress: 90 },
      { title: "Tempo jogado", desc: "Tempo total registrado", value: playtimeFormatted }
    ];
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const completion = Math.abs(hash % 90) + 10;
  return [
    { title: "Troféus", desc: "Progresso da Campanha", value: `${completion}%`, progress: completion },
    { title: "Atividades", desc: "Retomar de onde parou", value: "Jogar agora" },
    { title: "Tempo jogado", desc: "Tempo total registrado", value: playtimeFormatted }
  ];
}
