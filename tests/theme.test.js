import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const script = readFileSync(new URL("../v2/theme.js", import.meta.url), "utf8");
function page({ dark = false, saved = null, blocked = false } = {}) {
  const dom = new JSDOM(
    '<meta name="theme-color" content="#30241e"><button data-theme-toggle aria-label="Tmavý režim"></button><input value="Rozpísaný odkaz"><label><input type="checkbox" switch data-theme-toggle aria-label="Tmavý režim"></label>',
    { url: "https://example.invalid/v2/", runScripts: "outside-only" },
  );
  const media = new dom.window.EventTarget();
  media.matches = dark;
  dom.window.matchMedia = () => media;
  if (saved) dom.window.localStorage.setItem("fraid-theme", saved);
  if (blocked)
    Object.defineProperty(dom.window, "localStorage", {
      get() {
        throw Error("Storage blocked");
      },
    });
  dom.window.eval(script);
  return {
    dom,
    media,
    doc: dom.window.document,
    toggle: () => dom.window.document.querySelector("button").click(),
  };
}

test("theme follows the device until explicitly selected, persists and preserves unfinished input", () => {
  const p = page({ dark: true });
  assert.equal(p.doc.documentElement.dataset.theme, "dark");
  p.media.matches = false;
  p.media.dispatchEvent(new p.dom.window.Event("change"));
  assert.equal(p.doc.documentElement.dataset.theme, "light");
  p.toggle();
  assert.equal(p.doc.documentElement.dataset.theme, "dark");
  assert.equal(
    p.doc.querySelector("button").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(p.doc.querySelector("input").value, "Rozpísaný odkaz");
  p.media.dispatchEvent(new p.dom.window.Event("change"));
  assert.equal(p.doc.documentElement.dataset.theme, "dark");
  const saved = p.dom.window.localStorage.getItem("fraid-theme");
  const reloaded = page({ saved });
  assert.equal(reloaded.doc.documentElement.dataset.theme, "dark");
  reloaded.toggle();
  assert.equal(reloaded.doc.documentElement.dataset.theme, "light");
  assert.equal(reloaded.doc.querySelector("meta").content, "#f5f1e9");
  const nativeSwitch = reloaded.doc.querySelector('input[switch]');
  assert.equal(nativeSwitch.checked, false);
  nativeSwitch.click();
  assert.equal(nativeSwitch.checked, true);
  assert.equal(reloaded.doc.documentElement.dataset.theme, 'dark');
  nativeSwitch.click();
  assert.equal(nativeSwitch.checked, false);
  assert.equal(reloaded.doc.documentElement.dataset.theme, 'light');
  p.dom.window.close();
  reloaded.dom.window.close();
});

test("theme remains usable with blocked storage and ignores an invalid saved preference", () => {
  const blocked = page({ blocked: true });
  blocked.toggle();
  assert.equal(blocked.doc.documentElement.dataset.theme, "dark");
  const invalid = page({ dark: true, saved: "unknown" });
  assert.equal(invalid.doc.documentElement.dataset.theme, "dark");
  blocked.dom.window.close();
  invalid.dom.window.close();
});

test("theme updates when another tab changes the preference", () => {
  const p = page();
  p.dom.window.dispatchEvent(
    new p.dom.window.StorageEvent("storage", {
      key: "fraid-theme",
      newValue: "dark",
    }),
  );
  assert.equal(p.doc.documentElement.dataset.theme, "dark");
  assert.equal(p.doc.querySelector('input[switch]').checked, true);
  p.dom.window.dispatchEvent(
    new p.dom.window.StorageEvent("storage", {
      key: "fraid-theme",
      newValue: null,
    }),
  );
  assert.equal(p.doc.documentElement.dataset.theme, "light");
  p.dom.window.close();
});
