// Schedule redesign prototype ("Service sheet" skin).
//
// Visual only: every rule in schedule-redesign.css sits behind
// :root[data-schedule-skin="sheet"], and nothing here touches schedule
// behaviour. Ways back, from lightest to heaviest:
//   1. the "Classic" button in the corner switch (remembered per browser),
//   2. ?skin=classic in the address,
//   3. delete the `import "./schedule/redesign/skin"` line in main.tsx.
import "./schedule-redesign.css";

const storageKey = "nf-schedule-skin";
type Skin = "sheet" | "classic";

function readSkin(): Skin {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("skin");
    if (fromUrl === "classic" || fromUrl === "sheet") {
      window.localStorage.setItem(storageKey, fromUrl);
      return fromUrl;
    }
    return window.localStorage.getItem(storageKey) === "classic" ? "classic" : "sheet";
  } catch {
    return "sheet";
  }
}

function applySkin(skin: Skin) {
  if (skin === "sheet") document.documentElement.dataset.scheduleSkin = "sheet";
  else delete document.documentElement.dataset.scheduleSkin;
  try {
    window.localStorage.setItem(storageKey, skin);
  } catch {
    // Private windows: the switch still works for this page.
  }
  document.querySelectorAll<HTMLButtonElement>("#nf-skin-switch button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.skin === skin));
  });
}

function mountSwitch() {
  // Automated browsers (Playwright sets navigator.webdriver) get the skin
  // without the switch, so a test click can never land on it.
  if (navigator.webdriver) return;
  if (document.getElementById("nf-skin-switch")) return;
  const host = document.createElement("div");
  host.id = "nf-skin-switch";
  host.setAttribute("role", "group");
  host.setAttribute("aria-label", "Schedule look");
  for (const [skin, label] of [
    ["sheet", "New look"],
    ["classic", "Classic"],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.dataset.skin = skin;
    button.textContent = label;
    host.append(button);
  }
  document.body.append(host);
  applySkin(readSkin());
}

// Today's column and the weekend columns. Cells only say their date, so the
// rules list the dates (a year either side of today) instead of marking cells.
function isoDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function writeDayRules() {
  const today = new Date();
  const weekend: string[] = [];
  for (let offset = -366; offset <= 366; offset += 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    if (day.getDay() === 0 || day.getDay() === 6) weekend.push(`[data-date="${isoDate(day)}"]`);
  }
  const prefix = ':root[data-schedule-skin="sheet"] .schedule-cell';
  const style = document.createElement("style");
  style.id = "nf-skin-day-rules";
  style.textContent = [
    `${prefix}:is(${weekend.join(",")}) { background: var(--sheet-paper-quiet); }`,
    `${prefix}[data-date="${isoDate(today)}"] { background: color-mix(in srgb, var(--sheet-accent) 4%, var(--sheet-paper)); }`,
  ].join("\n");
  document.getElementById(style.id)?.remove();
  document.head.append(style);
}

writeDayRules();
// The schedule never hears about the switch. It listens on window in the
// capture phase (an outside pointerdown clears the selection); these run
// first, being added before the app mounts, and stop anything that starts on
// the switch before it reaches the schedule or the switch's own buttons.
for (const type of ["pointerdown", "mousedown", "mouseup", "click", "keydown"]) {
  window.addEventListener(
    type,
    (event) => {
      if (!(event.target instanceof Element) || !event.target.closest("#nf-skin-switch")) return;
      event.stopImmediatePropagation();
      // No focus move: a focused button would take the grid's shortcuts.
      if (type === "pointerdown" || type === "mousedown") event.preventDefault();
      const button = event.target.closest<HTMLButtonElement>("button[data-skin]");
      if (type === "click" && button) applySkin(button.dataset.skin as Skin);
    },
    true,
  );
}

applySkin(readSkin());
if (document.body) mountSwitch();
else window.addEventListener("DOMContentLoaded", mountSwitch, { once: true });
