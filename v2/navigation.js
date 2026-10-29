const stateKey = '__fraidSection';
let scopeSequence = 0;

// Deliberately inert until start(): call only after authenticated/demo boot.
// Auth and password-recovery URLs belong to their existing dedicated flows.
export function createSectionNavigation({ window: win, sections, defaultSection = 'today', beforeNavigate = () => true, onNavigate = () => {} }) {
  const allowed = new Set(sections);
  if (!allowed.has(defaultSection) || [...allowed].some(section => !/^[a-z][a-z0-9-]*$/.test(section))) {
    throw new TypeError('Navigation requires a safe section whitelist and default.');
  }
  let started = false, restoring = false, scope = '', current = null;
  // A fresh document must not mistake pre-reload history indexes for its own.
  const newScope = () => win.crypto?.randomUUID?.() || `fraid-${Date.now()}-${++scopeSequence}-${Math.random().toString(36).slice(2)}`;
  const authLocation = () => {
    const params = new win.URLSearchParams(win.location.search);
    return params.has('recovery') || params.has('forgot') || params.has('code') || params.has('token_hash') || /[=&]/.test(win.location.hash);
  };
  const sectionAtLocation = () => {
    const hash = win.location.hash.slice(1);
    return allowed.has(hash) ? hash : defaultSection;
  };
  const urlFor = section => `${win.location.pathname}${win.location.search}#${section}`;
  const stateFor = entry => ({
    ...(win.history.state && typeof win.history.state === 'object' && !Array.isArray(win.history.state) ? win.history.state : {}),
    [stateKey]: { scope, ...entry },
  });
  const ownedEntry = section => {
    const entry = win.history.state?.[stateKey];
    return entry?.scope === scope && entry.section === section && Number.isSafeInteger(entry.position) && entry.position >= 0 ? entry : null;
  };
  const permitted = (section, source) => {
    try {
      const decision = beforeNavigate({ from: current.section, to: section, source });
      return decision !== false && !(decision && typeof decision.then === 'function');
    } catch { return false; }
  };
  function replace(section, position) {
    current = { section, position };
    win.history.replaceState(stateFor(current), '', urlFor(section));
  }

  function locationChanged() {
    if (!started || authLocation()) return;
    const section = sectionAtLocation(), entry = ownedEntry(section);
    if (restoring) {
      if (entry?.position === current.position && section === current.section) restoring = false;
      return;
    }
    if (section === current.section) {
      if (entry) current = { section, position: entry.position };
      else {
        // An unmanaged same-document hash creates a new safe history baseline.
        scope = newScope();
        replace(section, 0);
      }
      return;
    }
    if (!permitted(section, 'history')) {
      const delta = entry ? current.position - entry.position : 0;
      if (delta) {
        // Return to the known current entry; ignore the intervening hashchange
        // and restoration events, so a pending save cannot create an event loop.
        restoring = true;
        win.history.go(delta);
      } else {
        // Unknown same-document history has no trustworthy traversal distance.
        // Restore only this URL, without leaving the document or cancelling work.
        scope = newScope();
        replace(current.section, 0);
      }
      return;
    }
    const previousSection = current.section;
    if (entry) current = { section, position: entry.position };
    else {
      scope = newScope();
      replace(section, 0);
    }
    onNavigate(section, { source: 'history', previousSection });
  }

  function start() {
    if (started) return true;
    if (authLocation()) return false;
    scope = newScope();
    replace(sectionAtLocation(), 0);
    started = true;
    win.addEventListener('popstate', locationChanged);
    win.addEventListener('hashchange', locationChanged);
    onNavigate(current.section, { source: 'initial', previousSection: null });
    return true;
  }
  function navigate(section) {
    if (!started || restoring || authLocation() || !allowed.has(section)) return false;
    if (section === current.section) return true;
    if (!permitted(section, 'navigation')) return false;
    const previousSection = current.section;
    current = { section, position: current.position + 1 };
    win.history.pushState(stateFor(current), '', urlFor(section));
    onNavigate(section, { source: 'navigation', previousSection });
    return true;
  }
  function destroy() {
    win.removeEventListener('popstate', locationChanged);
    win.removeEventListener('hashchange', locationChanged);
    started = false;
    restoring = false;
    current = null;
  }
  return { start, navigate, current: () => current?.section || null, destroy };
}
