use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

#[derive(serde::Serialize, Clone)]
struct SteamGame {
    appid: String,
    name: String,
    installdir: String,
    library_path: String,
    image_url: String,
}

fn get_steam_install_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        // Query registry: HKCU\Software\Valve\Steam -> SteamPath
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
        
        // Fallback to registry HKLM (64-bit or 32-bit redirect)
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

        // Try standard paths
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
    let mut libraries = Vec::new();

    // 1. Find Steam installation path
    let steam_path = get_steam_install_path();
    if let Some(ref path) = steam_path {
        libraries.push(path.clone());
        
        // Read libraryfolders.vdf
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
    
    // Common fallbacks if no libraries found
    if libraries.is_empty() {
        #[cfg(target_os = "windows")]
        {
            let common_paths = vec![
                PathBuf::from("C:\\Program Files (x86)\\Steam"),
                PathBuf::from("C:\\Program Files\\Steam"),
                PathBuf::from("D:\\Steam"),
                PathBuf::from("E:\\Steam"),
            ];
            for path in common_paths {
                if path.exists() {
                    libraries.push(path);
                }
            }
        }
        #[cfg(target_os = "linux")]
        {
            if let Ok(home) = std::env::var("HOME") {
                let common_paths = vec![
                    PathBuf::from(format!("{}/.local/share/Steam", home)),
                    PathBuf::from(format!("{}/.steam/steam", home)),
                    PathBuf::from(format!("{}/.var/app/com.valvesoftware.Steam/.local/share/Steam", home)),
                ];
                for path in common_paths {
                    if path.exists() {
                        libraries.push(path);
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
    
    // Ignore Steamworks Common Redistributables or SteamVR etc.
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

#[tauri::command]
fn get_installed_games() -> Vec<SteamGame> {
    let mut games = Vec::new();
    let libraries = get_steam_libraries();
    
    for lib in libraries {
        let steamapps_path = lib.join("steamapps");
        if !steamapps_path.exists() {
            continue;
        }
        
        if let Ok(entries) = std::fs::read_dir(&steamapps_path) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let file_name = entry.file_name().to_string_lossy().into_owned();
                    if file_name.starts_with("appmanifest_") && file_name.ends_with(".acf") {
                        if let Some(game) = parse_acf_file(&entry.path(), &lib) {
                            games.push(game);
                        }
                    }
                }
            }
        }
    }
    
    // Sort games alphabetically by name
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
                            let exe_name_str = exe_name.to_string_lossy();
                            return Ok(stdout.contains(&*exe_name_str));
                        }
                    }
                    Ok(stdout.contains("tauri-app")) // fallback string check
                } else {
                    Ok(false)
                }
            }
            Err(e) => Err(e.to_string())
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
                    "/v",
                    "Shell",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &path_str,
                    "/f"
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
                    "/v",
                    "Shell",
                    "/f"
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_installed_games,
            launch_game,
            is_shell_replacement_enabled,
            toggle_shell_replacement
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
