import React, { useState, useEffect } from "react";
import { useGamepad } from "../providers/GamepadContext";
import { GamepadActionState } from "../core/focus/gamepadInput";

interface VirtualKeyboardProps {
  isOpen: boolean;
  initialValue: string;
  label?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
  onChange?: (value: string) => void;
}

// Key definitions for different layout modes
const LOWERCASE_LAYOUT = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["SHIFT", "z", "x", "c", "v", "b", "n", "m", "BACKSPACE"],
  ["MODE_SYM", "SPACE", "CLEAR", "ENTER"],
];

const UPPERCASE_LAYOUT = [
  ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "_", "+"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["SHIFT", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
  ["MODE_SYM", "SPACE", "CLEAR", "ENTER"],
];

const SYMBOLS_LAYOUT = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
  ["[", "]", "{", "}", "<", ">", "/", "\\", "|", "?"],
  ["MODE_ABC", "~", "`", ";", ":", "'", '"', ",", ".", "BACKSPACE"],
  ["MODE_ABC", "SPACE", "CLEAR", "ENTER"],
];

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  isOpen,
  initialValue,
  label = "Digitar Texto",
  placeholder = "Digite aqui...",
  onConfirm,
  onClose,
  onChange,
}) => {
  const [value, setValue] = useState(initialValue);
  const [isShift, setIsShift] = useState(false);
  const [isSymbols, setIsSymbols] = useState(false);

  const { pushLayer, popLayer, registerLayerHandler } = useGamepad();

  // Focus state in grid: [rowIndex, colIndex]
  const [focusedRow, setFocusedRow] = useState(1);
  const [focusedCol, setFocusedCol] = useState(0);

  // Synchronize initial value when opening
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setFocusedRow(1);
      setFocusedCol(0);
      pushLayer("keyboard");
    } else {
      popLayer("keyboard");
    }
    return () => {
      popLayer("keyboard");
    };
  }, [isOpen, initialValue, pushLayer, popLayer]);

  // Update caller when value changes
  const updateValue = (newValue: string) => {
    setValue(newValue);
    if (onChange) onChange(newValue);
  };

  const getLayout = () => {
    if (isSymbols) return SYMBOLS_LAYOUT;
    return isShift ? UPPERCASE_LAYOUT : LOWERCASE_LAYOUT;
  };

  const layout = getLayout();

  // Clamp colIndex when moving between rows of different lengths
  const currentRowLength = layout[focusedRow]?.length || 1;
  const safeCol = Math.min(focusedCol, currentRowLength - 1);

  const handleKeyPress = (key: string) => {
    switch (key) {
      case "SHIFT":
        setIsShift((prev) => !prev);
        break;
      case "MODE_SYM":
        setIsSymbols(true);
        break;
      case "MODE_ABC":
        setIsSymbols(false);
        break;
      case "BACKSPACE":
        updateValue(value.slice(0, -1));
        break;
      case "CLEAR":
        updateValue("");
        break;
      case "SPACE":
        updateValue(value + " ");
        break;
      case "ENTER":
        onConfirm(value);
        onClose();
        break;
      default:
        updateValue(value + key);
        if (isShift) {
          setIsShift(false);
        }
        break;
    }
  };

  // Keyboard navigation for physical keyboard
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm(value);
        onClose();
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedRow((r) => Math.max(0, r - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedRow((r) => Math.min(layout.length - 1, r + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusedCol((c) => Math.max(0, c - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusedCol((c) => Math.min(layout[focusedRow].length - 1, c + 1));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        updateValue(value.slice(0, -1));
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        updateValue(value + e.key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, focusedRow, safeCol, layout, value]);

  // Unified Gamepad Layer Handler
  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerLayerHandler("keyboard", (actions: GamepadActionState) => {
      if (actions.b) {
        onClose();
        return true;
      }
      if (actions.start) {
        onConfirm(value);
        onClose();
        return true;
      }
      if (actions.x) {
        updateValue(value.slice(0, -1));
        return true;
      }
      if (actions.y) {
        updateValue(value + " ");
        return true;
      }
      if (actions.lb) {
        setIsShift((prev) => !prev);
        return true;
      }
      if (actions.rb) {
        setIsSymbols((prev) => !prev);
        return true;
      }
      if (actions.up) {
        setFocusedRow((r) => Math.max(0, r - 1));
        return true;
      }
      if (actions.down) {
        setFocusedRow((r) => Math.min(layout.length - 1, r + 1));
        return true;
      }
      if (actions.left) {
        setFocusedCol((c) => Math.max(0, c - 1));
        return true;
      }
      if (actions.right) {
        const maxCol = layout[focusedRow]?.length ? layout[focusedRow].length - 1 : 0;
        setFocusedCol((c) => Math.min(maxCol, c + 1));
        return true;
      }
      if (actions.a) {
        const currentKey = layout[focusedRow]?.[safeCol];
        if (currentKey) {
          handleKeyPress(currentKey);
          return true;
        }
      }
      return true;
    });

    return () => unregister();
  }, [isOpen, focusedRow, safeCol, layout, value, registerLayerHandler, onClose, onConfirm]);

  if (!isOpen) return null;

  const getKeyDisplayLabel = (key: string) => {
    switch (key) {
      case "SHIFT":
        return isShift ? "⇧ CAPS" : "⇧ Shift";
      case "MODE_SYM":
        return "#@& 123";
      case "MODE_ABC":
        return "ABC";
      case "BACKSPACE":
        return "⌫ Apagar";
      case "SPACE":
        return "Espaço";
      case "CLEAR":
        return "Limpar";
      case "ENTER":
        return "✓ Concluir";
      default:
        return key;
    }
  };

  return (
    <div className="virtual-keyboard-overlay" onClick={onClose}>
      <div className="virtual-keyboard-card" onClick={(e) => e.stopPropagation()}>
        <div className="virtual-keyboard-header">
          <span className="virtual-keyboard-title">{label}</span>
          <button className="virtual-keyboard-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Live Input Preview */}
        <div className="virtual-keyboard-preview-container">
          <input
            type="text"
            className="virtual-keyboard-preview-input"
            value={value}
            placeholder={placeholder}
            onChange={(e) => updateValue(e.target.value)}
            autoFocus
          />
          {value.length > 0 && (
            <button
              className="virtual-keyboard-clear-btn"
              onClick={() => updateValue("")}
              title="Limpar tudo"
            >
              ✕
            </button>
          )}
        </div>

        {/* Keyboard Key Grid */}
        <div className="virtual-keyboard-grid">
          {layout.map((row, rIdx) => (
            <div key={rIdx} className="virtual-keyboard-row">
              {row.map((key, cIdx) => {
                const isFocused = rIdx === focusedRow && cIdx === safeCol;
                const isSpecial = [
                  "SHIFT",
                  "MODE_SYM",
                  "MODE_ABC",
                  "BACKSPACE",
                  "SPACE",
                  "CLEAR",
                  "ENTER",
                ].includes(key);

                let extraClasses = "";
                if (key === "SPACE") extraClasses += " key-space";
                if (key === "ENTER") extraClasses += " key-enter";
                if (key === "SHIFT" && isShift) extraClasses += " key-active";
                if ((key === "MODE_SYM" && isSymbols) || (key === "MODE_ABC" && !isSymbols))
                  extraClasses += " key-active";

                return (
                  <button
                    key={`${rIdx}-${cIdx}-${key}`}
                    type="button"
                    className={`virtual-keyboard-key ${isSpecial ? "special-key" : ""} ${extraClasses} ${
                      isFocused ? "focused gamepad-focused" : ""
                    }`}
                    onClick={() => {
                      setFocusedRow(rIdx);
                      setFocusedCol(cIdx);
                      handleKeyPress(key);
                    }}
                  >
                    {getKeyDisplayLabel(key)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Controller Hints Footer */}
        <div className="virtual-keyboard-hints">
          <span className="hint-item"><kbd className="btn-badge a">A</kbd> Selecionar</span>
          <span className="hint-item"><kbd className="btn-badge x">X</kbd> Apagar</span>
          <span className="hint-item"><kbd className="btn-badge y">Y</kbd> Espaço</span>
          <span className="hint-item"><kbd className="btn-badge lb">LB</kbd> Shift</span>
          <span className="hint-item"><kbd className="btn-badge rb">RB</kbd> Símbolos</span>
          <span className="hint-item"><kbd className="btn-badge start">Start</kbd> Concluir</span>
          <span className="hint-item"><kbd className="btn-badge b">B</kbd> Cancelar</span>
        </div>
      </div>
    </div>
  );
};
