import React, { useEffect, useRef, useState, useId } from "react";
import { VirtualKeyboard } from "./VirtualKeyboard";
import { useGamepad } from "../providers/GamepadContext";
import { navigateSpatially, focusElement } from "../core/navigation/spatialNavigation";
import { GamepadActionState } from "../core/focus/gamepadInput";

interface GamepadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const GamepadModal: React.FC<GamepadModalProps> = ({
  isOpen,
  onClose,
  title,
  tabs,
  activeTab,
  onTabChange,
  children,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { pushLayer, popLayer, registerLayerHandler, activeLayer } = useGamepad();
  const generatedId = useId();
  const layerId = `modal-${generatedId}`;

  // Virtual Keyboard state
  const [keyboardConfig, setKeyboardConfig] = useState<{
    isOpen: boolean;
    initialValue: string;
    label?: string;
    placeholder?: string;
    targetElement: HTMLInputElement | HTMLTextAreaElement | null;
  } | null>(null);

  const openKeyboardForElement = (el: HTMLInputElement | HTMLTextAreaElement) => {
    if (el.readOnly || el.disabled) return;
    const parentField = el.closest(".playnite-field") || el.closest(".form-group");
    const labelText = parentField?.querySelector("label")?.textContent || el.placeholder || "Digitar Texto";

    setKeyboardConfig({
      isOpen: true,
      initialValue: el.value,
      label: labelText,
      placeholder: el.placeholder,
      targetElement: el,
    });
  };

  const handleKeyboardConfirm = (val: string) => {
    if (keyboardConfig?.targetElement) {
      const el = keyboardConfig.targetElement;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.focus();
    }
    setKeyboardConfig(null);
  };

  // Register Gamepad Layer with unique instance ID
  useEffect(() => {
    if (isOpen) {
      pushLayer(layerId);
    } else {
      popLayer(layerId);
    }
    return () => {
      popLayer(layerId);
    };
  }, [isOpen, layerId, pushLayer, popLayer]);

  // Focus Trap & Focus Restoration when modal becomes active
  useEffect(() => {
    if (isOpen && activeLayer === layerId) {
      const timer = setTimeout(() => {
        if (!containerRef.current) return;
        if (!document.activeElement || !containerRef.current.contains(document.activeElement)) {
          const paneCandidate = containerRef.current.querySelector<HTMLElement>(
            ".playnite-tab-pane button:not([disabled]), .playnite-tab-pane input:not([disabled]), .playnite-tab-pane select:not([disabled]), .playnite-tab-pane textarea:not([disabled]), .playnite-tab-pane [tabindex='0'], .playnite-tab-pane .focusable"
          );
          const anyCandidate = containerRef.current.querySelector<HTMLElement>(
            "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0'], .focusable"
          );

          const toFocus = paneCandidate || anyCandidate;
          if (toFocus) focusElement(toFocus);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeTab, activeLayer, layerId]);

  // Keyboard Navigation Listeners
  useEffect(() => {
    if (!isOpen || keyboardConfig?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      const active = document.activeElement;
      const isEditableTextInput =
        active instanceof HTMLInputElement &&
        active.type === "text" &&
        !active.readOnly;

      // Q/E or PageUp/PageDown tab switching
      if (e.key === "PageUp" || (e.key === "q" && !isEditableTextInput) || (e.key === "Q" && !isEditableTextInput)) {
        if (tabs && tabs.length > 0 && activeTab && onTabChange) {
          e.preventDefault();
          const currentIndex = tabs.findIndex((t) => t.id === activeTab);
          const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          onTabChange(tabs[prevIndex].id);
        }
        return;
      }

      if (e.key === "PageDown" || (e.key === "e" && !isEditableTextInput) || (e.key === "E" && !isEditableTextInput)) {
        if (tabs && tabs.length > 0 && activeTab && onTabChange) {
          e.preventDefault();
          const currentIndex = tabs.findIndex((t) => t.id === activeTab);
          const nextIndex = (currentIndex + 1) % tabs.length;
          onTabChange(tabs[nextIndex].id);
        }
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateSpatially("up", containerRef.current);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateSpatially("down", containerRef.current);
      } else if (e.key === "ArrowLeft") {
        if (isEditableTextInput) return;
        e.preventDefault();
        navigateSpatially("left", containerRef.current);
      } else if (e.key === "ArrowRight") {
        if (isEditableTextInput) return;
        e.preventDefault();
        navigateSpatially("right", containerRef.current);
      } else if (e.key === "Enter") {
        if (active instanceof HTMLInputElement && active.type === "text" && !active.readOnly && !active.disabled) {
          e.preventDefault();
          openKeyboardForElement(active);
        } else if (active instanceof HTMLTextAreaElement && !active.readOnly && !active.disabled) {
          e.preventDefault();
          openKeyboardForElement(active);
        } else if (active instanceof HTMLElement) {
          if (!(active instanceof HTMLInputElement && active.type === "text")) {
            e.preventDefault();
            active.click();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, activeTab, tabs, onTabChange, keyboardConfig?.isOpen]);

  // Unified Gamepad Handler for Modal
  useEffect(() => {
    if (!isOpen || keyboardConfig?.isOpen) return;

    const unregister = registerLayerHandler(layerId, (actions: GamepadActionState) => {
      if (actions.b) {
        onClose();
        return true;
      }

      if (actions.lb || actions.lt) {
        if (tabs && tabs.length > 0 && activeTab && onTabChange) {
          const currentIndex = tabs.findIndex((t) => t.id === activeTab);
          const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          onTabChange(tabs[prevIndex].id);
          return true;
        }
      }

      if (actions.rb || actions.rt) {
        if (tabs && tabs.length > 0 && activeTab && onTabChange) {
          const currentIndex = tabs.findIndex((t) => t.id === activeTab);
          const nextIndex = (currentIndex + 1) % tabs.length;
          onTabChange(tabs[nextIndex].id);
          return true;
        }
      }

      if (actions.up) {
        navigateSpatially("up", containerRef.current);
        return true;
      }
      if (actions.down) {
        navigateSpatially("down", containerRef.current);
        return true;
      }
      if (actions.left) {
        navigateSpatially("left", containerRef.current);
        return true;
      }
      if (actions.right) {
        navigateSpatially("right", containerRef.current);
        return true;
      }

      if (actions.a) {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && active.type === "text" && !active.readOnly && !active.disabled) {
          openKeyboardForElement(active);
          return true;
        }
        if (active instanceof HTMLTextAreaElement && !active.readOnly && !active.disabled) {
          openKeyboardForElement(active);
          return true;
        }
        if (active instanceof HTMLElement) {
          active.click();
          return true;
        }
      }

      return true;
    });

    return () => unregister();
  }, [isOpen, layerId, onClose, tabs, activeTab, onTabChange, keyboardConfig?.isOpen, registerLayerHandler]);

  if (!isOpen) return null;

  return (
    <>
      <div className="settings-overlay" onClick={onClose}>
        <div
          ref={containerRef}
          className={`playnite-edit-card ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="playnite-edit-header">
            <h2>{title}</h2>
            <button className="playnite-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>

          {tabs && tabs.length > 0 && (
            <div className="playnite-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`playnite-tab-btn ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => onTabChange?.(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {children}
        </div>
      </div>

      {keyboardConfig && (
        <VirtualKeyboard
          isOpen={keyboardConfig.isOpen}
          initialValue={keyboardConfig.initialValue}
          label={keyboardConfig.label}
          placeholder={keyboardConfig.placeholder}
          onConfirm={handleKeyboardConfirm}
          onClose={() => setKeyboardConfig(null)}
          onChange={(val) => {
            if (keyboardConfig.targetElement) {
              const el = keyboardConfig.targetElement;
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value"
              )?.set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(el, val);
              } else {
                el.value = val;
              }
              el.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }}
        />
      )}
    </>
  );
};
