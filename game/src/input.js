// Input keyboard + klik: WASD/panah gerak, Shift menyelinap, E interaksi,
// Q lempar pakan, R restart, Enter mulai, M mute, P jeda.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_INTERACT = 'interact';
export const ACTION_FEED = 'feed';
export const ACTION_SNEAK = 'sneak';
export const ACTION_RESTART = 'restart';
export const ACTION_MUTE = 'mute';
export const ACTION_PAUSE = 'pause';

const KEY_ACTIONS = {
  KeyE: ACTION_INTERACT,
  Space: ACTION_INTERACT,
  KeyQ: ACTION_FEED,
  KeyR: ACTION_RESTART,
  Enter: ACTION_CONFIRM,
  NumpadEnter: ACTION_CONFIRM,
  KeyM: ACTION_MUTE,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
};

export function createInput(target) {
  const keys = new Set();
  const pressed = new Set(); // sekali-tekan (edge), dibersihkan tiap frame
  let muted = false;
  let onMute = null;

  function key(e) {
    return e.code;
  }

  function down(e) {
    const c = key(e);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
    if (!keys.has(c)) pressed.add(c);
    keys.add(c);
    const action = KEY_ACTIONS[c];
    if (action === ACTION_MUTE) {
      muted = !muted;
      if (onMute) onMute(muted);
    }
  }

  function up(e) {
    keys.delete(key(e));
  }

  function blur() {
    keys.clear();
  }

  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  window.addEventListener('blur', blur);

  function axis() {
    let x = 0;
    let z = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
    const len = Math.hypot(x, z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  function wasPressed(action) {
    for (const c of pressed) {
      if (KEY_ACTIONS[c] === action) return true;
    }
    return false;
  }

  return {
    axis,
    wasPressed,
    sneaking() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    endFrame() {
      pressed.clear();
    },
    isMuted() {
      return muted;
    },
    setMuted(v) {
      muted = v;
    },
    onMuteChange(fn) {
      onMute = fn;
    },
    destroy() {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    },
  };
}
