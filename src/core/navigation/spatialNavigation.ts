export type NavigationDirection = "up" | "down" | "left" | "right";

export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"], .focusable, .game-card, .gamepad-target';

interface Point {
  x: number;
  y: number;
}

function getCenter(rect: DOMRect): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function navigateSpatially(
  direction: NavigationDirection,
  container: HTMLElement | null = null
): HTMLElement | null {
  const root = container || document.body;
  const activeEl = document.activeElement as HTMLElement | null;

  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => {
    if (el === activeEl) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== "hidden";
  });

  if (candidates.length === 0) return null;

  // If nothing inside root is currently focused, focus the first candidate
  if (!activeEl || !root.contains(activeEl)) {
    const target = candidates[0];
    focusElement(target);
    return target;
  }

  const activeRect = activeEl.getBoundingClientRect();
  const activeCenter = getCenter(activeRect);

  let bestCandidate: HTMLElement | null = null;
  let bestScore = Infinity;

  const threshold = 2; // Pixel alignment tolerance

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    const center = getCenter(rect);

    const dx = center.x - activeCenter.x;
    const dy = center.y - activeCenter.y;

    let isValidDirection = false;
    let primaryDistance = 0;
    let secondaryDistance = 0;

    switch (direction) {
      case "up":
        isValidDirection = dy < -threshold;
        primaryDistance = -dy;
        secondaryDistance = Math.abs(dx);
        break;
      case "down":
        isValidDirection = dy > threshold;
        primaryDistance = dy;
        secondaryDistance = Math.abs(dx);
        break;
      case "left":
        isValidDirection = dx < -threshold;
        primaryDistance = -dx;
        secondaryDistance = Math.abs(dy);
        break;
      case "right":
        isValidDirection = dx > threshold;
        primaryDistance = dx;
        secondaryDistance = Math.abs(dy);
        break;
    }

    if (isValidDirection) {
      // Calculate overlap projection to preserve natural grid/row flow
      let overlap = 0;
      if (direction === "up" || direction === "down") {
        const minRight = Math.min(activeRect.right, rect.right);
        const maxLeft = Math.max(activeRect.left, rect.left);
        overlap = Math.max(0, minRight - maxLeft);
      } else {
        const minBottom = Math.min(activeRect.bottom, rect.bottom);
        const maxTop = Math.max(activeRect.top, rect.top);
        overlap = Math.max(0, minBottom - maxTop);
      }

      // Discount secondary penalty if elements align in parallel projection
      const secondaryPenalty = overlap > 0 ? secondaryDistance * 0.15 : secondaryDistance * 2.2;
      const score = primaryDistance + secondaryPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }
  }

  if (bestCandidate) {
    focusElement(bestCandidate);
    return bestCandidate;
  }

  return null;
}

export function focusElement(el: HTMLElement) {
  // Remove existing gamepad-focused markers across DOM
  document.querySelectorAll(".gamepad-focused").forEach((node) => {
    node.classList.remove("gamepad-focused");
  });

  el.classList.add("gamepad-focused");
  el.focus({ preventScroll: true });

  // Smooth auto-scroll into view with margin offset
  el.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: "smooth",
  });
}
