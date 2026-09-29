// Runs before the stylesheets to avoid flashing the wrong theme on reload.
(() => {
  const key = "fraid-theme";
  const system = window.matchMedia?.("(prefers-color-scheme: dark)");
  const valid = (value) => value === "light" || value === "dark";
  let preference = null;
  try {
    const saved = window.localStorage.getItem(key);
    if (valid(saved)) preference = saved;
  } catch {
    /* The theme still works when browser storage is unavailable. */
  }

  function apply() {
    const dark =
      (preference || (system?.matches ? "dark" : "light")) === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#191816" : "#f5f1e9");
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      if (button.matches('input[type="checkbox"]')) {
        button.checked = dark;
      } else {
        button.setAttribute("aria-pressed", String(dark));
      }
      button.title = dark
        ? "Prepnúť na svetlý režim"
        : "Prepnúť na tmavý režim";
    });
  }

  apply();
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-theme-toggle]")) return;
    preference =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(key, preference);
    } catch {}
    apply();
  });
  system?.addEventListener?.("change", () => {
    if (!preference) apply();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : null;
    apply();
  });
})();
