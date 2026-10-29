// Preserve native scrolling and accessibility zoom; add only supported haptics.
export function initMobileControls(doc = document, win = window) {
  let lastTap = -Infinity;
  function vibrate(duration) {
    if (doc.hidden || typeof win.navigator.vibrate !== 'function') return false;
    try {
      return win.navigator.vibrate(duration);
    } catch {
      return false; // Unsupported/blocked feedback must never interrupt an action.
    }
  }
  doc.addEventListener('click', event => {
    const control = event.target.closest?.('button, input[switch]');
    if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
    const now = win.performance.now();
    if (now - lastTap < 80) return;
    lastTap = now;
    vibrate(10);
  }, { capture: true });

  return { success: () => vibrate(22) };
}
