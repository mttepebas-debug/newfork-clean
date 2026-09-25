const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("../../apps/web/node_modules/jsdom");

function open(filename, compact) {
  const html = fs.readFileSync(path.join(__dirname, filename), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  dom.window.eval(
    fs.readFileSync(
      path.join(__dirname, "documents-drawer-prototype-core.js"),
      "utf8",
    ) +
      (compact
        ? "\n" +
          fs.readFileSync(
            path.join(__dirname, "documents-drawer-compact.js"),
            "utf8",
          )
        : ""),
  );
  return dom;
}

const dom = open("documents-drawer-compact-2026-09-16.html", true);
const w = dom.window;
const d = w.document;
const query = (selector) => {
  const el = d.querySelector(selector);
  assert.ok(el, selector);
  return el;
};
const click = (selector) => query(selector).click();
const input = (selector, value) => {
  const el = query(selector);
  if (el.type === "checkbox") el.checked = value;
  else el.value = value;
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
};
const section = (key) => click(`[data-section="${key}"]`);
const save = () =>
  query("form").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );

assert.equal(d.querySelectorAll("[data-design]").length, 5);
for (const design of ["folio", "index", "sequence", "workspace", "outline"]) {
  click(`[data-design="${design}"]`);
  for (const theme of ["light", "dark"]) {
    click(`[data-theme-choice="${theme}"]`);
    assert.equal(d.documentElement.dataset.theme, theme);
    for (const key of ["audience", "rules", "fields", "review"]) {
      section(key);
      assert.equal(d.querySelectorAll("#active-panel").length, 1);
      assert.ok(query("#active-panel").textContent.trim());
    }
    if (design !== "workspace") section("basics");
    input('[name="name"]', "");
    save();
    assert.ok(query(".msg.error").textContent.includes("document name"));
    assert.equal(query('[name="name"]').getAttribute("aria-invalid"), "true");
    input('[name="name"]', `${design} certificate`);
    save();
    assert.ok(query(".msg.ok").textContent.includes("saved"));
  }
}
click('[data-design="folio"]');
input('[name="name"]', "Saved certificate");
save();
input('[name="name"]', "Unsaved certificate");
click('[data-action="cancel"]');
assert.equal(query('[name="name"]').value, "Saved certificate");
input('[name="mode"]', "optional");
section("rules");
assert.equal(d.querySelector('[name="period"]'), null);
assert.equal(d.querySelector('[name="suspend"]'), null);
input('[name="expiry"]', false);
assert.equal(d.querySelector('[name="warning"]'), null);
input('[name="expiry"]', true);
input('[name="warning"]', "366");
save();
assert.ok(query(".msg.error").textContent.includes("expiry warning"));
input('[name="warning"]', "30");
section("basics");
input('[name="mode"]', "conditional");
section("rules");
input('[name="period"]', "0");
save();
assert.ok(query(".msg.error").textContent.includes("delivery period"));
input('[name="period"]', "14");
section("audience");
for (const group of ["locations", "departments", "jobs", "employees"]) {
  click(`[data-group="${group}"]`);
  for (const checkbox of [...d.querySelectorAll(`input[name="${group}"]`)])
    input(`input[name="${group}"][value="${checkbox.value}"]`, false);
}
assert.equal(query("[data-audience]").textContent, "8 employees");
click('[data-group="locations"]');
input('input[value="North Market"]', true);
click('[data-group="employees"]');
input('input[value="Mateo Rivera"]', true);
assert.equal(query("[data-audience]").textContent, "4 employees");
input("[data-target-search]", "not found");
assert.equal(query(".target-empty").textContent, "No matches");
input("[data-target-search]", "");
section("fields");
for (let i = 2; i < 20; i++) {
  click("[data-add-compact]");
  input(`[aria-label="Extra field label ${i + 1}"]`, `Field ${i + 1}`);
}
assert.equal(query("[data-add-compact]").disabled, true);
assert.ok(d.querySelectorAll(".extra-row").length <= 3);
click('[data-field-page="5"]');
assert.equal(d.querySelectorAll(".extra-row").length, 3);
click('[data-remove-compact="15"]');
assert.equal(query("[data-add-compact]").disabled, false);
click("[data-add-compact]");
save();
assert.ok(query(".msg.error").textContent.includes("label"));
assert.equal(d.activeElement.name, "field-label");
input('[aria-label="Extra field label 20"]', "Final field");
save();
assert.ok(query(".msg.ok"));
click("#longDescription");
assert.equal(query('[name="description"]').value.length, 240);
click("[data-close]");
assert.equal(d.querySelector("form"), null);
click("[data-reopen]");
assert.ok(query("form"));
click("#resetPreview");
assert.equal(query('[name="name"]').value, "Driver safety certificate");
section("review");
click('[data-impact="preview"]');
assert.ok(query("#active-panel").textContent.includes("Assignment impact"));
click('[data-impact="reason"]');
assert.equal(query('[data-impact="apply"]').disabled, true);
input("[data-impact-reason]", "Annual renewal of employee certification.");
assert.equal(query('[data-impact="apply"]').disabled, false);
click('[data-impact="apply"]');
assert.ok(query(".msg.ok").textContent.includes("synthetic assignments"));
const legacy = open("documents-drawer-prototypes-2026-09-16.html", false);
assert.equal(
  legacy.window.document.querySelectorAll(".prototype-list button").length,
  5,
);
assert.ok(legacy.window.document.querySelector("form"));
legacy.window.close();
dom.window.close();
console.log(
  "PASS: 5 layouts x 2 themes, all sections, validation, rollback, targeting, 20-field pagination, close/reopen, legacy entry. No browser geometry claim.",
);
