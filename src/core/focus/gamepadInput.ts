export interface GamepadActionState {
  a: boolean; // Just pressed (rising edge)
  b: boolean; // Just pressed
  x: boolean; // Just pressed
  y: boolean; // Just pressed
  lb: boolean; // Just pressed
  rb: boolean; // Just pressed
  lt: boolean; // Just pressed or threshold reached
  rt: boolean; // Just pressed or threshold reached
  start: boolean; // Just pressed
  select: boolean; // Just pressed
  up: boolean; // Triggered (initial press or auto-repeat)
  down: boolean; // Triggered (initial press or auto-repeat)
  left: boolean; // Triggered (initial press or auto-repeat)
  right: boolean; // Triggered (initial press or auto-repeat)
  rawAxes: { x: number; y: number; rx: number; ry: number };
}

const DEADZONE = 0.28;
const INITIAL_REPEAT_DELAY_MS = 280; // Delay before repeat starts
const REPEAT_INTERVAL_MS = 70; // High responsiveness repeat speed

class GamepadInputProcessor {
  private prevButtons: boolean[] = [];
  private dirState: Record<string, { startTime: number; lastTriggerTime: number; hasRepeated: boolean }> = {
    up: { startTime: 0, lastTriggerTime: 0, hasRepeated: false },
    down: { startTime: 0, lastTriggerTime: 0, hasRepeated: false },
    left: { startTime: 0, lastTriggerTime: 0, hasRepeated: false },
    right: { startTime: 0, lastTriggerTime: 0, hasRepeated: false },
  };

  public process(gp: Gamepad | null): GamepadActionState {
    const actions: GamepadActionState = {
      a: false,
      b: false,
      x: false,
      y: false,
      lb: false,
      rb: false,
      lt: false,
      rt: false,
      start: false,
      select: false,
      up: false,
      down: false,
      left: false,
      right: false,
      rawAxes: { x: 0, y: 0, rx: 0, ry: 0 },
    };

    if (!gp) {
      this.prevButtons = [];
      this.resetDirections();
      return actions;
    }

    const now = Date.now();
    const currButtons = gp.buttons.map((b) => b.pressed || b.value > 0.5);

    // Helper to check rising edge (pressed now, was not pressed in prev frame)
    const isJustPressed = (index: number): boolean => {
      const isPressed = currButtons[index] ?? false;
      const wasPressed = this.prevButtons[index] ?? false;
      return isPressed && !wasPressed;
    };

    // Action buttons (Strict Rising Edge)
    actions.a = isJustPressed(0);
    actions.b = isJustPressed(1);
    actions.x = isJustPressed(2);
    actions.y = isJustPressed(3);
    actions.lb = isJustPressed(4);
    actions.rb = isJustPressed(5);
    actions.lt = isJustPressed(6);
    actions.rt = isJustPressed(7);
    actions.select = isJustPressed(8);
    actions.start = isJustPressed(9);

    // Process Analog Sticks with Deadzone
    let stickX = gp.axes[0] ?? 0;
    let stickY = gp.axes[1] ?? 0;
    const stickMag = Math.hypot(stickX, stickY);

    if (stickMag < DEADZONE) {
      stickX = 0;
      stickY = 0;
    }

    const rStickX = gp.axes[2] ?? 0;
    const rStickY = gp.axes[3] ?? 0;
    const rStickMag = Math.hypot(rStickX, rStickY);
    actions.rawAxes = {
      x: stickX,
      y: stickY,
      rx: rStickMag > DEADZONE ? rStickX : 0,
      ry: rStickMag > DEADZONE ? rStickY : 0,
    };

    // D-Pad buttons
    const dpadUp = currButtons[12] ?? false;
    const dpadDown = currButtons[13] ?? false;
    const dpadLeft = currButtons[14] ?? false;
    const dpadRight = currButtons[15] ?? false;

    // Combined Direction States
    const rawUp = dpadUp || stickY < -0.45;
    const rawDown = dpadDown || stickY > 0.45;
    const rawLeft = dpadLeft || stickX < -0.45;
    const rawRight = dpadRight || stickX > 0.45;

    actions.up = this.processDirection("up", rawUp, now);
    actions.down = this.processDirection("down", rawDown, now);
    actions.left = this.processDirection("left", rawLeft, now);
    actions.right = this.processDirection("right", rawRight, now);

    this.prevButtons = currButtons;
    return actions;
  }

  private processDirection(dir: string, active: boolean, now: number): boolean {
    const state = this.dirState[dir];
    if (!active) {
      state.startTime = 0;
      state.lastTriggerTime = 0;
      state.hasRepeated = false;
      return false;
    }

    if (state.startTime === 0) {
      // First frame pressed!
      state.startTime = now;
      state.lastTriggerTime = now;
      state.hasRepeated = false;
      return true;
    }

    const elapsedSinceStart = now - state.startTime;
    const elapsedSinceLastTrigger = now - state.lastTriggerTime;

    if (!state.hasRepeated) {
      if (elapsedSinceStart >= INITIAL_REPEAT_DELAY_MS) {
        state.hasRepeated = true;
        state.lastTriggerTime = now;
        return true;
      }
      return false;
    } else {
      if (elapsedSinceLastTrigger >= REPEAT_INTERVAL_MS) {
        state.lastTriggerTime = now;
        return true;
      }
      return false;
    }
  }

  private resetDirections() {
    for (const key in this.dirState) {
      this.dirState[key] = { startTime: 0, lastTriggerTime: 0, hasRepeated: false };
    }
  }
}

export const gamepadProcessor = new GamepadInputProcessor();
