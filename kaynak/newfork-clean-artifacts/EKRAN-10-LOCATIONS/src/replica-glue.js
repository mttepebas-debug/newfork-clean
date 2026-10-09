// Replays the captured states of /app/settings/locations the way the real page moves between them.
(() => {
  const R = window.NF_REPLICA;
  const slugByName = R.slugs;
  for (const [k, v] of Object.entries(R.html)) if (k !== "style") document.documentElement.setAttribute(k, v);

  let current = null;
  let nodes = [];
  let bodyAttrs = [];
  let disarm = 0;

  let swapping = false;
  // A deep link has no click behind it: focus only a text field, as a fresh drawer does,
  // so buttons do not draw the keyboard ring the real page never shows after a click.
  function show(name, fromLink = false) {
    const t = document.getElementById("nf-s-" + name);
    if (!t || swapping) return false;
    swapping = true;
    clearTimeout(disarm);
    nodes.forEach((n) => n.remove());
    bodyAttrs.forEach((a) => document.body.removeAttribute(a));
    const attrs = JSON.parse(t.dataset.body || "{}");
    bodyAttrs = Object.keys(attrs);
    for (const [k, v] of Object.entries(attrs)) document.body.setAttribute(k, v);
    const frag = t.content.cloneNode(true);
    nodes = [...frag.childNodes];
    document.body.insertBefore(frag, document.body.firstChild);
    current = name;
    const focus = document.querySelector("[data-nf-focus]");
    if (focus) {
      focus.removeAttribute("data-nf-focus");
      if (!fromLink || focus.matches("input:not([type=checkbox]):not([type=radio]), textarea")) focus.focus({ preventScroll: true });
    }
    if (name.startsWith("armed-")) {
      const edit = "edit-" + name.slice(6);
      disarm = setTimeout(() => show(edit), 3200);
      const armed = document.querySelector(".catalog-delete-confirm-button");
      armed?.addEventListener("blur", () => current === name && show(edit), { once: true });
    }
    swapping = false;
    return true;
  }

  const listState = () => (document.querySelector(".job-archive-filter input")?.checked ? "list-archived" : "list");
  const inDrawer = () => current && (current === "add" || current.startsWith("edit-") || current.startsWith("armed-"));
  const slugOf = (el) => {
    const row = el.closest(".job-catalog-row");
    const name = row?.querySelector(".job-row-name")?.textContent?.trim();
    return name ? slugByName[name] : null;
  };

  document.addEventListener("click", (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const link = t.closest("a[href]");
    if (link) { event.preventDefault(); return; }
    if (inDrawer()) {
      if (t.closest(".job-icon-button, .job-editor-actions .job-secondary-button")) return void show("list");
      const trigger = t.closest(".catalog-delete-trigger");
      if (trigger && current.startsWith("edit-")) return void show("armed-" + current.slice(5));
      if (t.closest(".catalog-delete-confirm-button") && current.startsWith("armed-")) return void show("edit-" + current.slice(6));
      return;
    }
    if (t.closest(".settings-page-header .job-primary-button, .settings-header .job-primary-button")) return void show("add");
    const identity = t.closest(".job-row-identity");
    if (identity) { const s = slugOf(identity); if (s) show("edit-" + s); return; }
    const menuButton = t.closest(".job-menu-popover button");
    if (menuButton) {
      const s = slugOf(menuButton);
      menuButton.closest("details")?.removeAttribute("open");
      if (/^Edit/.test(menuButton.textContent.trim()) && s) show("edit-" + s);
    }
  }, true);

  // Header button: match by text when the header class differs.
  document.addEventListener("click", (event) => {
    const b = event.target instanceof Element && event.target.closest("button");
    if (b && !inDrawer() && b.textContent.trim() === "Add location") show("add");
  });

  document.addEventListener("change", (event) => {
    const t = event.target;
    if (t instanceof HTMLInputElement && t.closest(".job-archive-filter")) show(t.checked ? "list-archived" : "list");
  });

  document.addEventListener("input", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLInputElement) || !t.closest(".job-search")) return;
    const q = t.value.trim().toLowerCase();
    document.querySelectorAll(".job-catalog-row").forEach((row) => {
      const text = (row.querySelector(".job-row-name")?.textContent + " " + row.querySelector(".location-catalog-address")?.textContent).toLowerCase();
      row.hidden = Boolean(q) && !text.includes(q);
    });
  });

  document.addEventListener("pointerdown", (event) => {
    const t = event.target;
    document.querySelectorAll("details.job-row-menu[open]").forEach((d) => {
      if (!(t instanceof Node) || !d.contains(t)) d.removeAttribute("open");
    });
    if (inDrawer() && t instanceof Element && t.classList.contains("catalog-drawer-backdrop")) {
      event.preventDefault();
      show("list");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (current && current.startsWith("armed-")) { event.preventDefault(); return void show("edit-" + current.slice(6)); }
    if (inDrawer()) { event.preventDefault(); return void show("list"); }
    document.querySelectorAll("details.job-row-menu[open]").forEach((d) => {
      d.removeAttribute("open");
      d.querySelector("summary")?.focus();
    });
  });

  const fromHash = () => {
    const h = location.hash.slice(1);
    if (h === "menu") return "menu-first";
    if (h === "archived") return "list-archived";
    return h;
  };
  window.addEventListener("hashchange", () => show(fromHash(), true) || show(listState(), true));
  if (!show(fromHash(), true)) show("list", true);
})();
