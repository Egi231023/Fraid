import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { database, userIds } from "./helpers/database.mjs";

const recipe = {
  name: "Testovacie espresso",
  category: "Káva",
  ingredients: [{ name: "Káva", quantity: 18, unit: "g" }],
  steps: "Pripraviť espresso.",
};
const tick = () => new Promise((r) => setTimeout(r, 10));

test("recipe removal checks role, reason and version, preserves the record, and is idempotent", async () => {
  const f = await database();
  try {
    await f.actor("admin");
    await f.write({
      op: "save",
      kind: "recipes",
      id: "recipe",
      version: 0,
      data: recipe,
    });
    await f.actor("employee");
    await assert.rejects(
      f.write({
        op: "void",
        kind: "recipes",
        id: "recipe",
        version: 1,
        reason: "Remove",
      }),
      /administrátor/,
    );
    await f.actor("admin");
    await assert.rejects(
      f.write({ op: "void", kind: "recipes", id: "recipe", version: 1 }),
      /dôvod/,
    );
    await f.write({
      op: "save",
      kind: "recipes",
      id: "recipe",
      version: 1,
      data: { ...recipe, steps: "Novší postup." },
    });
    await assert.rejects(
      f.write({
        op: "void",
        kind: "recipes",
        id: "recipe",
        version: 1,
        reason: "Remove",
      }),
      /medzitým/,
    );
    const request = {
      op: "void",
      kind: "recipes",
      id: "recipe",
      version: 2,
      reason: "Odstránenie receptu zo zoznamu",
      requestId: crypto.randomUUID(),
    };
    await f.write(request);
    await f.write(request);
    const row = (await f.records()).find((r) => r.id === "recipe");
    assert.equal(row.data.status, "void");
    assert.equal(row.data.steps, "Novší postup.");
    assert.equal(row.version, 3);
    const audit = await f.db.query(
      "select * from public.fraid_v2_audit where kind='recipes' and action='void'",
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].before_data.name, recipe.name);
  } finally {
    await f.close();
  }
});

test("admin can cancel, remove, refetch and restore a recipe through the UI and real SQL function; employee cannot remove it", async () => {
  const f = await database();
  let dom;
  const timers = new Set(),
    originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (...args) => {
    const id = originalTimeout(...args);
    timers.add(id);
    return id;
  };
  try {
    await f.actor("admin");
    await f.write({
      op: "save",
      kind: "recipes",
      id: "recipe",
      version: 0,
      data: recipe,
    });
    for (const actor of ["admin", "employee"]) {
      await f.actor(actor);
      dom = new JSDOM(
        '<div id="status"></div><div id="app"></div><dialog id="dialog"><div id="dialog-body"></div></dialog>',
        { url: "https://example.invalid/v2/" },
      );
      for (const k of [
        "window",
        "document",
        "location",
        "sessionStorage",
        "navigator",
        "FormData",
      ])
        Object.defineProperty(globalThis, k, {
          value: dom.window[k],
          configurable: true,
        });
      dom.window.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      dom.window.HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
      window.supabase = {
        createClient: () => ({
          auth: {
            getSession: async () => ({
              data: { session: { user: { id: userIds[actor] } } },
            }),
            onAuthStateChange: () => ({}),
          },
          from(table) {
            assert.ok(
              [
                "fraid_v2_people",
                "fraid_v2_records",
                "fraid_v2_audit",
              ].includes(table),
            );
            const chain = {
              select: () => chain,
              order: () => chain,
              range: () => chain,
              limit: () => chain,
              then(resolve, reject) {
                return f.db
                  .query("select * from public." + table)
                  .then((r) => ({
                    data: JSON.parse(JSON.stringify(r.rows)),
                    error: null,
                  }))
                  .then(resolve, reject);
              },
            };
            return chain;
          },
          async rpc(name, { p } = {}) {
            if (name === "fraid_delivery_status") return { data: null };
            try {
              return { data: await f.write(p), error: null };
            } catch (e) {
              return { error: { message: e.message, code: e.code } };
            }
          },
        }),
      };
      await import("../v2/app.js?recipe-test=" + actor);
      for (let n = 0; n < 100 && !document.querySelector("#view"); n++)
        await tick();
      assert.ok(document.querySelector("#view"), document.body.textContent);
      document.querySelector('[data-page="recipes"]').click();
      if (actor === "employee") {
        assert.equal(
          document.querySelector('[data-action="recipe-delete"]'),
          null,
        );
        assert.equal(
          document.querySelector('[data-action="recipes-archived"]'),
          null,
        );
        document.querySelector('[data-action="recipe-detail"]').click();
        assert.equal(
          document.querySelector('#dialog-body [data-action="recipe-delete"]'),
          null,
        );
      } else {
        document.querySelector('[data-action="recipe-delete"]').click();
        assert.match(
          document.querySelector("#dialog-body").textContent,
          /Testovacie espresso/,
        );
        document.querySelector('[data-action="close"]').click();
        assert.notEqual(
          (await f.records()).find((r) => r.id === "recipe").data.status,
          "void",
        );
        document.querySelector('[data-action="recipe-delete"]').click();
        let form = document.querySelector("#editor");
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(
          document.querySelector("#dialog").open,
          false,
          document.querySelector("#form-error").textContent,
        );
        assert.equal(document.querySelector(".recipe-row"), null);
        document.querySelector('[data-action="refresh"]').click();
        for (
          let n = 0;
          n < 100 && document.querySelector('[data-action="refresh"]').disabled;
          n++
        )
          await tick();
        assert.equal(document.querySelector(".recipe-row"), null);
        document.querySelector('[data-action="recipes-archived"]').click();
        assert.match(
          document.querySelector(".recipe-row").textContent,
          /Testovacie espresso/,
        );
        document.querySelector('[data-action="recipe-restore"]').click();
        form = document.querySelector("#editor");
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(
          document.querySelector("#dialog").open,
          false,
          document.querySelector("#form-error").textContent,
        );
        assert.equal(
          (await f.records()).find((r) => r.id === "recipe").data.status,
          "active",
        );
        assert.ok(
          document.querySelector('.recipe-row [data-action="recipe-delete"]'),
        );
      }
      dom.window.close();
      dom = null;
    }
  } finally {
    for (const id of timers) clearTimeout(id);
    globalThis.setTimeout = originalTimeout;
    dom?.window.close();
    await f.close();
  }
});
