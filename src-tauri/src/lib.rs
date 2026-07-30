use std::path::{Path, PathBuf};
use std::time::{Instant, Duration};
use tauri::Manager;
use tokio::sync::Mutex;
use sea_orm::DatabaseConnection;
use sea_orm_migration::MigratorTrait;

// ── Sub-modules ──────────────────────────────────────────────────────────────
pub mod database;
pub mod models;
pub mod providers;
pub mod services;
pub mod commands;

// ── IGDB / Twitch credentials ─────────────────────────────────────────────────
const CLIENT_ID: &str = "tdcgkpt4ojpb1bdvmgxo0gufofipj3";
const CLIENT_SECRET: &str = "yn53jn1amldun5lfeagwjrvmvlp3br";

// ── Cached Twitch OAuth token ─────────────────────────────────────────────────
pub struct TwitchToken {
    pub access_token: String,
    pub expires_at: Instant,
}

// ── Global app state (shared across all Tauri commands via .manage()) ─────────
pub struct AppState {
    pub db: DatabaseConnection,
    pub igdb_token: Mutex<Option<TwitchToken>>,
    pub app_data_dir: PathBuf,
}

impl AppState {
    /// Returns a valid Twitch OAuth token, refreshing it if expired.
    pub async fn get_igdb_token(&self) -> Result<String, String> {
        let mut token_guard = self.igdb_token.lock().await;

        if let Some(ref token) = *token_guard {
            if Instant::now() < token.expires_at {
                return Ok(token.access_token.clone());
            }
        }

        // Fetch new token from Twitch
        let client = reqwest::Client::new();
        let response = client
            .post("https://id.twitch.tv/oauth2/token")
            .query(&[
                ("client_id", CLIENT_ID),
                ("client_secret", CLIENT_SECRET),
                ("grant_type", "client_credentials"),
            ])
            .send()
            .await
            .map_err(|e| format!("Twitch auth request failed: {}", e))?;

        #[derive(serde::Deserialize)]
        struct TokenResponse {
            access_token: String,
            expires_in: u64,
        }

        let res = response
            .json::<TokenResponse>()
            .await
            .map_err(|e| format!("Failed to parse Twitch token response: {}", e))?;

        let expires_at =
            Instant::now() + Duration::from_secs(res.expires_in.saturating_sub(60));

        let access_token = res.access_token.clone();
        *token_guard = Some(TwitchToken {
            access_token: res.access_token,
            expires_at,
        });

        Ok(access_token)
    }
}

// ── IGDB response types ───────────────────────────────────────────────────────
#[derive(serde::Deserialize)]
struct IgdbCover {
    url: Option<String>,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct IgdbGame {
    name: String,
    cover: Option<IgdbCover>,
}

// ── Legacy SteamGame type (kept for backward compat with get_installed_games) ─
#[derive(serde::Serialize, Clone)]
struct SteamGame {
    appid: String,
    name: String,
    installdir: String,
    library_path: String,
    image_url: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Steam scanning helpers
// ─────────────────────────────────────────────────────────────────────────────

fn get_steam_install_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"])
            .output()
        {
            if output.status.success() {
                if let Ok(stdout) = String::from_utf8(output.stdout) {
                    for line in stdout.lines() {
                        if line.contains("SteamPath") {
                            let parts: Vec<&str> = line.split("REG_SZ").collect();
                            if parts.len() >= 2 {
                                let path = parts[1].trim().replace("/", "\\");
                                let path_buf = PathBuf::from(path);
                                if path_buf.exists() {
                                    return Some(path_buf);
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", "HKLM\\Software\\Wow6432Node\\Valve\\Steam", "/v", "InstallPath"])
            .output()
        {
            if output.status.success() {
                if let Ok(stdout) = String::from_utf8(output.stdout) {
                    for line in stdout.lines() {
                        if line.contains("InstallPath") {
                            let parts: Vec<&str> = line.split("REG_SZ").collect();
                            if parts.len() >= 2 {
                                let path = parts[1].trim().to_string();
                                let path_buf = PathBuf::from(path);
                                if path_buf.exists() {
                                    return Some(path_buf);
                                }
                            }
                        }
                    }
                }
            }
        }

        let default_path = PathBuf::from("C:\\Program Files (x86)\\Steam");
        if default_path.exists() {
            return Some(default_path);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let paths = vec![
                format!("{}/.local/share/Steam", home),
                format!("{}/.steam/steam", home),
                format!("{}/.var/app/com.valvesoftware.Steam/.local/share/Steam", home),
            ];
            for p in paths {
                let path_buf = PathBuf::from(p);
                if path_buf.exists() {
                    return Some(path_buf);
                }
            }
        }
    }

    None
}

fn get_steam_libraries() -> Vec<PathBuf> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    let mut libraries = Vec::new();
    let steam_path = get_steam_install_path();
    if let Some(ref path) = steam_path {
        libraries.push(path.clone());
        let vdf_path = path.join("steamapps").join("libraryfolders.vdf");
        if vdf_path.exists() {
            if let Ok(file) = File::open(&vdf_path) {
                let reader = BufReader::new(file);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        if line.contains("\"path\"") {
                            let parts: Vec<&str> = line.split('"').collect();
                            if parts.len() >= 4 {
                                let lib_path = parts[3].replace("\\\\", "\\");
                                let path_buf = PathBuf::from(lib_path);
                                if path_buf.exists() && !libraries.contains(&path_buf) {
                                    libraries.push(path_buf);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if libraries.is_empty() {
        #[cfg(target_os = "windows")]
        {
            for p in ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam", "D:\\Steam", "E:\\Steam"] {
                let pb = PathBuf::from(p);
                if pb.exists() {
                    libraries.push(pb);
                }
            }
        }
        #[cfg(target_os = "linux")]
        {
            if let Ok(home) = std::env::var("HOME") {
                for p in [
                    format!("{}/.local/share/Steam", home),
                    format!("{}/.steam/steam", home),
                ] {
                    let pb = PathBuf::from(p);
                    if pb.exists() {
                        libraries.push(pb);
                    }
                }
            }
        }
    }

    libraries
}

fn extract_acf_value(line: &str) -> Option<String> {
    let parts: Vec<&str> = line.split('"').collect();
    if parts.len() >= 4 {
        Some(parts[3].to_string())
    } else {
        None
    }
}

fn parse_acf_file(path: &Path, library_path: &Path) -> Option<SteamGame> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut appid = String::new();
    let mut name = String::new();
    let mut installdir = String::new();

    for line in reader.lines() {
        if let Ok(line) = line {
            let line = line.trim();
            if line.contains("\"appid\"") {
                appid = extract_acf_value(line)?;
            } else if line.contains("\"name\"") {
                name = extract_acf_value(line)?;
            } else if line.contains("\"installdir\"") {
                installdir = extract_acf_value(line)?;
            }
        }
    }

    if appid.is_empty() || name.is_empty() {
        return None;
    }
    if appid == "228980" || name.contains("Steamworks Common Redistributables") {
        return None;
    }

    let image_url = format!(
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900.jpg",
        appid
    );

    Some(SteamGame {
        appid,
        name,
        installdir,
        library_path: library_path.to_string_lossy().into_owned(),
        image_url,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands — legacy / platform
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_installed_games() -> Vec<SteamGame> {
    let mut games = Vec::new();
    for lib in get_steam_libraries() {
        let steamapps_path = lib.join("steamapps");
        if !steamapps_path.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&steamapps_path) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().into_owned();
                if file_name.starts_with("appmanifest_") && file_name.ends_with(".acf") {
                    if let Some(game) = parse_acf_file(&entry.path(), &lib) {
                        games.push(game);
                    }
                }
            }
        }
    }
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    games
}

#[tauri::command]
fn launch_game(appid: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("cmd")
            .args(["/C", &format!("start steam://run/{}", appid)])
            .status();
        match status {
            Ok(s) if s.success() => Ok(format!("Successfully launched {}", appid)),
            Ok(s) => Err(format!("Command exited with status code: {}", s)),
            Err(e) => Err(format!("Failed to execute command: {}", e)),
        }
    }
    #[cfg(target_os = "linux")]
    {
        let status = std::process::Command::new("xdg-open")
            .arg(format!("steam://run/{}", appid))
            .status();
        match status {
            Ok(s) if s.success() => Ok(format!("Successfully launched {}", appid)),
            Ok(s) => Err(format!("Command exited with status code: {}", s)),
            Err(e) => Err(format!("Failed to execute command: {}", e)),
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Unsupported platform".to_string())
    }
}

#[tauri::command]
fn is_shell_replacement_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("reg")
            .args(["query", "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon", "/v", "Shell"])
            .output();
        match output {
            Ok(out) => {
                if out.status.success() {
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    if let Ok(exe_path) = std::env::current_exe() {
                        if let Some(exe_name) = exe_path.file_name() {
                            return Ok(stdout.contains(&*exe_name.to_string_lossy()));
                        }
                    }
                    Ok(stdout.contains("tauri-app"))
                } else {
                    Ok(false)
                }
            }
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn toggle_shell_replacement(enable: bool) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        if enable {
            let current_exe = std::env::current_exe()
                .map_err(|e| format!("Failed to get current executable path: {}", e))?;
            let path_str = current_exe.to_string_lossy().to_string();
            let status = std::process::Command::new("reg")
                .args([
                    "add",
                    "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon",
                    "/v", "Shell", "/t", "REG_SZ", "/d", &path_str, "/f",
                ])
                .status()
                .map_err(|e| format!("Failed to run reg.exe: {}", e))?;
            if status.success() {
                Ok("Shell replacement enabled successfully".to_string())
            } else {
                Err("reg.exe exited with an error status".to_string())
            }
        } else {
            let status = std::process::Command::new("reg")
                .args([
                    "delete",
                    "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon",
                    "/v", "Shell", "/f",
                ])
                .status()
                .map_err(|e| format!("Failed to run reg.exe: {}", e))?;
            if status.success() {
                Ok("Shell replacement disabled successfully (restored to explorer.exe)".to_string())
            } else {
                Err("reg.exe exited with an error status".to_string())
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Registry shell replacement is only supported on Windows.".to_string())
    }
}

#[tauri::command]
fn pick_file(filter: &str, title: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let script = format!(
            r#"
            Add-Type -AssemblyName System.Windows.Forms;
            $FileBrowser = New-Object System.Windows.Forms.OpenFileDialog;
            $FileBrowser.Filter = "{}";
            $FileBrowser.Title = "{}";
            $Show = $FileBrowser.ShowDialog();
            if ($Show -eq "OK") {{ Write-Host $FileBrowser.FileName -NoNewline }}
            "#,
            filter, title
        );
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                Err("Canceled".to_string())
            } else {
                Ok(path)
            }
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
    #[cfg(target_os = "linux")]
    {
        let output = std::process::Command::new("zenity")
            .args(["--file-selection", &format!("--title={}", title)])
            .output();
        match output {
            Ok(out) if out.status.success() => {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() { Err("Canceled".to_string()) } else { Ok(path) }
            }
            _ => {
                let out2 = std::process::Command::new("kdialog")
                    .args(["--getopenfilename", ".", "*"])
                    .output();
                match out2 {
                    Ok(o) if o.status.success() => {
                        let path = String::from_utf8_lossy(&o.stdout).trim().to_string();
                        if path.is_empty() { Err("Canceled".to_string()) } else { Ok(path) }
                    }
                    _ => Err("Nenhum seletor de arquivos encontrado no Linux".to_string()),
                }
            }
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Plataforma não suportada para seleção de arquivos".to_string())
    }
}

#[tauri::command]
fn launch_custom_game(exe_path: &str) -> Result<String, String> {
    let path = Path::new(exe_path);
    if !path.exists() {
        return Err("O arquivo executável não existe no caminho especificado.".to_string());
    }
    let parent_dir = path
        .parent()
        .ok_or_else(|| "Não foi possível obter o diretório do executável.".to_string())?;

    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "Start-Process -FilePath '{}' -WorkingDirectory '{}'",
                    path.to_string_lossy().replace('\'', "''"),
                    parent_dir.to_string_lossy().replace('\'', "''")
                ),
            ])
            .status();
        match status {
            Ok(s) if s.success() => Ok("Jogo customizado iniciado com sucesso".to_string()),
            Ok(s) => Err(format!("O PowerShell retornou código de erro: {}", s)),
            Err(e) => Err(format!("Falha ao executar o comando PowerShell: {}", e)),
        }
    }
    #[cfg(target_os = "linux")]
    {
        match std::process::Command::new(path).current_dir(parent_dir).spawn() {
            Ok(_) => Ok("Jogo customizado iniciado com sucesso".to_string()),
            Err(e) => Err(format!("Falha ao executar o processo: {}", e)),
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Plataforma não suportada".to_string())
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct InstalledApp {
    name: String,
    path: String,
}

#[derive(serde::Serialize, Clone, Debug)]
struct FileItem {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
fn get_installed_apps() -> Result<Vec<InstalledApp>, String> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
        $sh = New-Object -ComObject WScript.Shell
        $paths = @(
            "C:\ProgramData\Microsoft\Windows\Start Menu\Programs",
            "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
        )
        $apps = [System.Collections.Generic.List[Object]]::new()
        foreach ($p in $paths) {
            if (Test-Path $p) {
                Get-ChildItem -Path $p -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
                    try {
                        $lnk = $sh.CreateShortcut($_.FullName)
                        $target = $lnk.TargetPath
                        if ($target -and $target.EndsWith(".exe") -and (Test-Path $target)) {
                            $apps.Add(@{
                                name = $_.BaseName
                                path = $target
                            })
                        }
                    } catch {}
                }
            }
        }
        ConvertTo-Json -InputObject $apps -Compress
        "#;
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", script])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() {
                return Ok(Vec::new());
            }
            let apps: Vec<InstalledApp> = serde_json::from_str(&stdout).unwrap_or_else(|_| {
                if let Ok(single) = serde_json::from_str::<InstalledApp>(&stdout) {
                    vec![single]
                } else {
                    Vec::new()
                }
            });
            let mut unique_apps = std::collections::HashMap::new();
            for app in apps {
                unique_apps.insert(app.path.clone(), app);
            }
            let mut result: Vec<InstalledApp> = unique_apps.into_values().collect();
            result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
            Ok(result)
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![
            InstalledApp { name: "Mock Game 1".to_string(), path: "/usr/bin/mock1".to_string() },
            InstalledApp { name: "Mock Game 2".to_string(), path: "/usr/bin/mock2".to_string() },
        ])
    }
}

#[tauri::command]
fn get_drives() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let mut drives = Vec::new();
        for letter in b'A'..=b'Z' {
            let drive_path = format!("{}:\\", letter as char);
            if Path::new(&drive_path).exists() {
                drives.push(drive_path);
            }
        }
        if drives.is_empty() {
            drives.push("C:\\".to_string());
        }
        drives
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec!["/".to_string()]
    }
}

#[tauri::command]
fn list_dir_contents(path: &str, allowed_extensions: Vec<String>) -> Result<Vec<FileItem>, String> {
    let dir_path = Path::new(path);
    if !dir_path.exists() {
        return Err("Diretório não existe".to_string());
    }
    let mut items = Vec::new();
    for entry in std::fs::read_dir(dir_path).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let full_path = entry.path().to_string_lossy().into_owned();
        if name.starts_with('.') || name.starts_with('$') {
            continue;
        }
        if let Ok(ft) = entry.file_type() {
            let is_dir = ft.is_dir();
            if !is_dir && !allowed_extensions.is_empty() {
                let ext = entry.path().extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_lowercase())
                    .unwrap_or_default();
                if !allowed_extensions.contains(&ext) {
                    continue;
                }
            }
            items.push(FileItem { name, path: full_path, is_dir });
        }
    }
    items.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });
    Ok(items)
}

#[tauri::command]
fn get_parent_path(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    match p.parent() {
        Some(parent) => {
            let s = parent.to_string_lossy().into_owned();
            if s.is_empty() || s == path { Ok("".to_string()) } else { Ok(s) }
        }
        None => Ok("".to_string()),
    }
}

/// Searches IGDB for a game cover and returns the high-quality URL.
/// Downloads the image to disk and returns the local asset path if successful.
#[tauri::command]
async fn get_game_image_url(
    game_name: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let token = state.get_igdb_token().await?;
    let client = reqwest::Client::new();
    let escaped_name = game_name.replace('"', "\\\"");
    let body = format!("search \"{}\"; fields name, cover.url; limit 1;", escaped_name);

    let response = client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", CLIENT_ID)
        .header("Authorization", format!("Bearer {}", token))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("IGDB request failed: {}", e))?;

    let games = response
        .json::<Vec<IgdbGame>>()
        .await
        .map_err(|e| format!("Failed to parse IGDB response: {}", e))?;

    if let Some(game) = games.first() {
        if let Some(ref cover) = game.cover {
            if let Some(ref url) = cover.url {
                let mut full_url = url.clone();
                if full_url.starts_with("//") {
                    full_url = format!("https:{}", full_url);
                }
                // Use high-quality 720p instead of thumb
                full_url = full_url.replace("t_thumb", "t_720p");
                return Ok(full_url);
            }
        }
    }

    Err("Nenhuma imagem de capa encontrada para este jogo".to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube TV webview
// ─────────────────────────────────────────────────────────────────────────────

const YOUTUBE_TV_INIT_SCRIPT: &str = r#"
(function() {
    if (window.__ATLAS_TV_INJECTED) return;
    window.__ATLAS_TV_INJECTED = true;

    function simulateKey(key, code, keyCode) {
        const target = document.activeElement || document.body;
        const opts = {
            key: key, code: code, keyCode: keyCode, which: keyCode,
            bubbles: true, cancelable: true
        };
        target.dispatchEvent(new KeyboardEvent('keydown', opts));
        target.dispatchEvent(new KeyboardEvent('keyup', opts));
    }

    window.__ATLAS_TV = function(action) {
        switch(action) {
            case 'navigate_up':    simulateKey('ArrowUp',    'ArrowUp',    38); break;
            case 'navigate_down':  simulateKey('ArrowDown',  'ArrowDown',  40); break;
            case 'navigate_left':  simulateKey('ArrowLeft',  'ArrowLeft',  37); break;
            case 'navigate_right': simulateKey('ArrowRight', 'ArrowRight', 39); break;
            case 'click':          simulateKey('Enter', 'Enter', 13); break;
            case 'back':           simulateKey('Escape', 'Escape', 27); break;
            case 'play_pause':     simulateKey(' ', 'Space', 32); break;
            case 'seek_back':      simulateKey('j', 'KeyJ', 74); break;
            case 'seek_forward':   simulateKey('l', 'KeyL', 76); break;
            case 'volume_up': {
                const v = document.querySelector('video');
                if (v) v.volume = Math.min(1, v.volume + 0.1);
                break;
            }
            case 'volume_down': {
                const v = document.querySelector('video');
                if (v) v.volume = Math.max(0, v.volume - 0.1);
                break;
            }
            case 'fullscreen': simulateKey('f', 'KeyF', 70); break;
        }
    };

    console.log('[Atlas] YouTube TV gamepad bridge injected.');
})();
"#;

#[tauri::command]
async fn open_youtube_webview(app: tauri::AppHandle) -> Result<(), String> {
    let main_window = app
        .get_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;

    if app.get_webview("youtube").is_some() {
        return Ok(());
    }

    let scale_factor = main_window.scale_factor().map_err(|e| e.to_string())?;
    let size = main_window.inner_size().map_err(|e| e.to_string())?;
    let header_height_physical = (60.0 * scale_factor) as u32;

    let webview_builder = tauri::WebviewBuilder::new(
        "youtube",
        tauri::WebviewUrl::External(tauri::Url::parse("https://www.youtube.com/tv").unwrap()),
    )
    .user_agent("Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36")
    .initialization_script(YOUTUBE_TV_INIT_SCRIPT)
    .auto_resize();

    main_window
        .add_child(
            webview_builder,
            tauri::PhysicalPosition::new(0, header_height_physical as i32),
            tauri::PhysicalSize::new(size.width, size.height.saturating_sub(header_height_physical)),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn youtube_gamepad_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview("youtube") {
        let js = format!(
            "if (window.__ATLAS_TV) {{ window.__ATLAS_TV('{}'); }}",
            action.replace('\\', "\\\\").replace('\'', "\\'")
        );
        webview.eval(&js).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn close_youtube_webview(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("youtube") {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri entry point
// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Resolve the platform-specific AppData directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app_data_dir");

            // Spawn async setup (database + directory creation)
            let handle = app.handle().clone();
            let data_dir = app_data_dir.clone();

            tauri::async_runtime::block_on(async move {
                // 1. Ensure all required directories exist
                crate::services::cache_service::ensure_directories(&data_dir).await;

                // 2. Connect to SQLite
                let db_path = data_dir.join("atlas.db");
                let db = crate::database::connection::setup_database(&db_path)
                    .await
                    .expect("Failed to connect to database");

                // 3. Run all pending migrations
                crate::database::migrations::Migrator::up(&db, None)
                    .await
                    .expect("Failed to run database migrations");

                // 4. Register global state
                handle.manage(AppState {
                    db,
                    igdb_token: Mutex::new(None),
                    app_data_dir: data_dir,
                });
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Resized(size) = event {
                if window.label() == "main" {
                    if let Some(youtube) = window.get_webview("youtube") {
                        if let Ok(scale_factor) = window.scale_factor() {
                            let header_height_physical = (60.0 * scale_factor) as u32;
                            if size.height > header_height_physical {
                                let _ = youtube.set_position(tauri::PhysicalPosition::new(
                                    0, header_height_physical as i32,
                                ));
                                let _ = youtube.set_size(tauri::PhysicalSize::new(
                                    size.width,
                                    size.height - header_height_physical,
                                ));
                            }
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // ── Platform / Steam commands ─────────────────────────────
            get_installed_games,
            launch_game,
            is_shell_replacement_enabled,
            toggle_shell_replacement,
            pick_file,
            launch_custom_game,
            // ── File browser commands ─────────────────────────────────
            get_installed_apps,
            get_drives,
            list_dir_contents,
            get_parent_path,
            // ── IGDB metadata ─────────────────────────────────────────
            get_game_image_url,
            // ── Database game commands (Phase 2) ──────────────────────
            commands::game_commands::db_list_games,
            commands::game_commands::db_add_game,
            commands::game_commands::db_delete_game,
            commands::game_commands::db_update_game,
            commands::game_commands::db_migrate_from_localstorage,
            // ── Playtime tracking commands (Phase 5) ─────────────────────────────────
            commands::playtime_commands::start_play_session,
            commands::playtime_commands::end_play_session,
            commands::playtime_commands::get_game_playtime,
            // ── YouTube TV ────────────────────────────────────────────
            open_youtube_webview,
            close_youtube_webview,
            youtube_gamepad_action,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
