// Keep callback parameters and deep links on this origin, without logging them.
(() => {
  const current = new URL(location.href);
  // Defensive guard if this root-only script is accidentally included by v2.
  if (/\/v2(?:\/(?:index\.html)?)?$/.test(current.pathname)) return;
  const target = new URL('./v2/', current);
  target.search = current.search;
  target.hash = current.hash;
  const fallback = document.getElementById('open-app');
  if (fallback) fallback.href = target.href;
  // Replace avoids a Back-button loop. If navigation is blocked, the link remains usable.
  try { location.replace(target.href); } catch { /* Leave the app-like fallback visible. */ }
})();
