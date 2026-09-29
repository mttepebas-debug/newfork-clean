import "./switcher.css";
import "./shared.css";
import "./variant-a.css";
import "./variant-b.css";
import "./variant-c.css";

import {
  UI_VARIANTS,
  applyUiVariant,
  readUiVariant,
  storedUiVariant,
  subscribeUiVariant,
  type UiVariant,
} from "./uiVariant";

const LABELS: Readonly<Record<UiVariant, string>> = {
  a: "A · Newfork",
  b: "B · Linear/Notion",
  c: "C · Competitors",
};

export function installUiVariant(): void {
  const requested =
    new URLSearchParams(window.location.search).get("ui") ?? storedUiVariant();
  applyUiVariant(
    UI_VARIANTS.includes(requested as UiVariant) ? (requested as UiVariant) : null,
  );
  mountSwitcher();
}

function mountSwitcher(): void {
  const options: readonly (readonly [UiVariant | null, string])[] = [
    [null, "Now"],
    ...UI_VARIANTS.map((variant) => [variant, LABELS[variant]] as const),
  ];
  const bar = document.createElement("div");
  bar.className = "ui-variant-switcher";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Mockup style");
  // Open menus close on an outside pointerdown; switching must not close them.
  bar.addEventListener("pointerdown", (event) => event.stopPropagation());
  const buttons = options.map(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => applyUiVariant(value));
    bar.append(button);
    return button;
  });
  const sync = () =>
    buttons.forEach((button, index) =>
      button.setAttribute(
        "aria-pressed",
        String(options[index]?.[0] === readUiVariant()),
      ),
    );
  subscribeUiVariant(sync);
  sync();
  document.body.append(bar);
}
