import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { gamepadProcessor, GamepadActionState } from "../core/focus/gamepadInput";
import { navigateSpatially } from "../core/navigation/spatialNavigation";

type GamepadHandler = (actions: GamepadActionState) => boolean | void;

interface GamepadContextType {
  gamepadConnected: boolean;
  gamepadName: string;
  activeLayer: string;
  pushLayer: (layerId: string) => void;
  popLayer: (layerId: string) => void;
  registerLayerHandler: (layerId: string, handler: GamepadHandler) => () => void;
}

const GamepadContext = createContext<GamepadContextType>({
  gamepadConnected: false,
  gamepadName: "",
  activeLayer: "main",
  pushLayer: () => {},
  popLayer: () => {},
  registerLayerHandler: () => () => {},
});

export const GamepadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [gamepadName, setGamepadName] = useState("");
  const [layerStack, setLayerStack] = useState<string[]>(["main"]);

  const handlersRef = useRef<Map<string, GamepadHandler>>(new Map());
  const activeLayer = layerStack[layerStack.length - 1] || "main";

  const pushLayer = useCallback((layerId: string) => {
    setLayerStack((prev) => {
      if (prev.includes(layerId)) return prev;
      return [...prev, layerId];
    });
  }, []);

  const popLayer = useCallback((layerId: string) => {
    setLayerStack((prev) => {
      const filtered = prev.filter((id) => id !== layerId);
      return filtered.length > 0 ? filtered : ["main"];
    });
  }, []);

  const registerLayerHandler = useCallback((layerId: string, handler: GamepadHandler) => {
    handlersRef.current.set(layerId, handler);
    return () => {
      handlersRef.current.delete(layerId);
    };
  }, []);

  // Listen to connected/disconnected events
  useEffect(() => {
    const handleConnect = (e: GamepadEvent) => {
      setGamepadConnected(true);
      setGamepadName(e.gamepad.id);
    };

    const handleDisconnect = () => {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      const activeGp = Array.from(gps).find((g) => g !== null);
      if (activeGp) {
        setGamepadConnected(true);
        setGamepadName(activeGp.id);
      } else {
        setGamepadConnected(false);
        setGamepadName("");
      }
    };

    window.addEventListener("gamepadconnected", handleConnect);
    window.addEventListener("gamepaddisconnected", handleDisconnect);

    // Initial check
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const activeGp = Array.from(gps).find((g) => g !== null);
    if (activeGp) {
      setGamepadConnected(true);
      setGamepadName(activeGp.id);
    }

    return () => {
      window.removeEventListener("gamepadconnected", handleConnect);
      window.removeEventListener("gamepaddisconnected", handleDisconnect);
    };
  }, []);

  // Single unified Gamepad Polling Loop
  useEffect(() => {
    let animFrameId: number;

    const poll = () => {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = Array.from(gps).find((g) => g !== null) || null;

      if (gp) {
        const actions = gamepadProcessor.process(gp);

        // Check if any button or direction was triggered
        const hasTrigger =
          actions.a ||
          actions.b ||
          actions.x ||
          actions.y ||
          actions.lb ||
          actions.rb ||
          actions.lt ||
          actions.rt ||
          actions.start ||
          actions.select ||
          actions.up ||
          actions.down ||
          actions.left ||
          actions.right;

        if (hasTrigger) {
          const currentTopLayer = layerStack[layerStack.length - 1] || "main";
          const topHandler = handlersRef.current.get(currentTopLayer);

          let handled = false;
          if (topHandler) {
            handled = topHandler(actions) === true;
          }

          // Default fallback spatial navigation if not explicitly handled by custom layer
          if (!handled) {
            if (actions.up) navigateSpatially("up");
            else if (actions.down) navigateSpatially("down");
            else if (actions.left) navigateSpatially("left");
            else if (actions.right) navigateSpatially("right");
            else if (actions.a) {
              const active = document.activeElement as HTMLElement | null;
              if (active) active.click();
            }
          }
        }
      } else {
        gamepadProcessor.process(null);
      }

      animFrameId = requestAnimationFrame(poll);
    };

    animFrameId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animFrameId);
  }, [layerStack]);

  return (
    <GamepadContext.Provider
      value={{
        gamepadConnected,
        gamepadName,
        activeLayer,
        pushLayer,
        popLayer,
        registerLayerHandler,
      }}
    >
      {children}
    </GamepadContext.Provider>
  );
};

export const useGamepad = () => useContext(GamepadContext);
