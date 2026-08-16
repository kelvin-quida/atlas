import React, { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useGamepad } from "../../../providers/GamepadContext";
import { X, Play, Pause, Volume2, VolumeX, RotateCcw, RotateCw } from "lucide-react";
import { MovieFile } from "../media/MediaSection";

interface VideoPlayerModalProps {
  isOpen: boolean;
  movie: MovieFile | null;
  onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  isOpen,
  movie,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const { pushLayer, popLayer, registerLayerHandler } = useGamepad();

  useEffect(() => {
    if (isOpen) {
      pushLayer("video-player");
      setIsPlaying(true);
    } else {
      popLayer("video-player");
    }
    return () => {
      popLayer("video-player");
    };
  }, [isOpen, pushLayer, popLayer]);

  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.play().catch((err) => {
        console.warn("Autoplay was prevented:", err);
        setIsPlaying(false);
      });
    }
  }, [isOpen, movie?.path]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const seekRelative = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.min(
      Math.max(0, videoRef.current.currentTime + seconds),
      duration || 0
    );
  };

  const changeVolume = (delta: number) => {
    if (!videoRef.current) return;
    const newVol = Math.min(1, Math.max(0, videoRef.current.volume + delta));
    videoRef.current.volume = newVol;
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekRelative(-5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekRelative(5);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        changeVolume(0.1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        changeVolume(-0.1);
      } else if (e.key === "m") {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, duration, isMuted]);

  // Gamepad layer handler
  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerLayerHandler("video-player", (actions) => {
      if (actions.b) {
        onClose();
        return true;
      }
      if (actions.a) {
        togglePlay();
        return true;
      }
      if (actions.left) {
        seekRelative(-5);
        return true;
      }
      if (actions.right) {
        seekRelative(5);
        return true;
      }
      if (actions.up) {
        changeVolume(0.1);
        return true;
      }
      if (actions.down) {
        changeVolume(-0.1);
        return true;
      }
      if (actions.x) {
        toggleMute();
        return true;
      }
      return true;
    });

    return () => unregister();
  }, [isOpen, duration, isMuted, registerLayerHandler]);

  if (!isOpen || !movie) return null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    if (hh > 0) {
      return `${hh}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${mm}:${String(s).padStart(2, "0")}`;
  };

  const videoSrc = movie.path
    ? movie.path.startsWith("http://") || movie.path.startsWith("https://")
      ? movie.path
      : convertFileSrc(movie.path)
    : "";

  return (
    <div className="settings-overlay video-player-overlay" onClick={onClose}>
      <div
        className="video-player-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "90%",
          maxWidth: "1100px",
          background: "#0c0d12",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.8)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.5rem",
            background: "rgba(255, 255, 255, 0.03)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.2rem" }}>🎬</span>
            <h3
              style={{
                margin: 0,
                fontSize: "1.1rem",
                fontWeight: 600,
                color: "#f3f4f6",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "700px",
              }}
            >
              {movie.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "none",
              color: "#fff",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Video Area */}
        <div
          style={{
            position: "relative",
            background: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "350px",
            maxHeight: "68vh",
          }}
        >
          <video
            ref={videoRef}
            src={videoSrc}
            autoPlay
            controls={false}
            onTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) setDuration(videoRef.current.duration);
            }}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
            style={{
              width: "100%",
              height: "100%",
              maxHeight: "68vh",
              objectFit: "contain",
              cursor: "pointer",
            }}
          />
        </div>

        {/* Video Controls Bar */}
        <div
          style={{
            padding: "1rem 1.5rem",
            background: "rgba(15, 17, 26, 0.95)",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {/* Timeline slider */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontSize: "0.85rem", color: "#9ca3af", fontFamily: "monospace", minWidth: "50px" }}>
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (videoRef.current) videoRef.current.currentTime = val;
                setCurrentTime(val);
              }}
              style={{
                flex: 1,
                accentColor: "#6366f1",
                cursor: "pointer",
                height: "6px",
              }}
            />
            <span style={{ fontSize: "0.85rem", color: "#9ca3af", fontFamily: "monospace", minWidth: "50px" }}>
              {formatTime(duration)}
            </span>
          </div>

          {/* Action buttons bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={togglePlay}
                style={{
                  background: "#6366f1",
                  border: "none",
                  color: "#fff",
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                {isPlaying ? "Pausar" : "Reproduzir"}
              </button>

              <button
                type="button"
                onClick={() => seekRelative(-5)}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#e5e7eb",
                  padding: "0.5rem",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
                title="Voltar 5 segundos"
              >
                <RotateCcw size={16} />
              </button>

              <button
                type="button"
                onClick={() => seekRelative(5)}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#e5e7eb",
                  padding: "0.5rem",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
                title="Avançar 5 segundos"
              >
                <RotateCw size={16} />
              </button>
            </div>

            {/* Controller Hints */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.8rem", color: "#9ca3af" }}>
              <span>
                <kbd style={{ background: "rgba(255,255,255,0.15)", padding: "2px 6px", borderRadius: "4px", color: "#fff" }}>A</kbd> Play/Pausa
              </span>
              <span>
                <kbd style={{ background: "rgba(255,255,255,0.15)", padding: "2px 6px", borderRadius: "4px", color: "#fff" }}>← / →</kbd> Seek 5s
              </span>
              <span>
                <kbd style={{ background: "rgba(255,255,255,0.15)", padding: "2px 6px", borderRadius: "4px", color: "#fff" }}>B</kbd> Sair
              </span>

              <button
                type="button"
                onClick={toggleMute}
                style={{
                  background: "none",
                  border: "none",
                  color: isMuted ? "#ef4444" : "#9ca3af",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
