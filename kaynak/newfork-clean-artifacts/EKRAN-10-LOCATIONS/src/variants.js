// Five Locations designs, applied on top of the real captured page (real CSS, real shell).
// NF_REF carries the real Settings → Documents header, toolbar and sortable heading cell.
(() => {
  const L = [
    { name: "Main Dining", short: "MAIN", street: "100 Main St", city: "Los Angeles", region: "CA", zip: "90001", phone: "", zone: "Pacific Time", iana: "America/Los Angeles", abbr: "PT" },
    { name: "Garden Room", short: "GARDEN", street: "100 Main St", city: "Los Angeles", region: "CA", zip: "90001", phone: "", zone: "Pacific Time", iana: "America/Los Angeles", abbr: "PT" },
  ];
  const addr = (l) => `${l.street}, ${l.city}, ${l.region} ${l.zip}`;
  const cityLine = (l) => `${l.city}, ${l.region} ${l.zip}`;
  const tpl = (html) => { const t = document.createElement("template"); t.innerHTML = html; return t.content; };

  let MENU = "";
  const menu = (l) => MENU.replaceAll("Main Dining", l.name);

  function header() {
    const c = tpl(NF_REF.header + NF_REF.toolbar);
    const h1 = c.querySelector("h1");
    h1.id = "locations-settings-title";
    h1.firstChild.textContent = "Locations";
    const p = c.querySelector(".catalog-page-heading p");
    p.textContent = "Restaurant addresses and local time zones used throughout scheduling.";
    p.title = p.textContent;
    const tabs = c.querySelector(".catalog-status-tabs");
    tabs.setAttribute("aria-label", "Location status");
    const b = [...tabs.children];
    b[0].textContent = "Active";
    b[1].textContent = "Archived";
    b[1].className = "";
    b.slice(2).forEach((x) => x.remove());
    c.querySelector(".toolbar-filter-select")?.remove();
    const input = c.querySelector(".toolbar-search input");
    input.placeholder = "Search name or address";
    input.setAttribute("aria-label", "Search locations");
    const add = c.querySelector(".list-add-button");
    add.lastChild.textContent = "New location";
    c.querySelector(".job-catalog-toolbar").classList.remove("document-catalog-toolbar");
    const d = document.createElement("div");
    d.append(c);
    return d.innerHTML;
  }
  function head(label) {
    const c = tpl(NF_REF.sortHead);
    const s = c.firstElementChild;
    s.removeAttribute("class");
    s.querySelector(".catalog-sort-label").textContent = label;
    return s.outerHTML;
  }
  const headings = (labels) =>
    `<div class="job-column-headings catalog-column-headings location-catalog-row" role="row">${labels.map(head).join("")}<span></span></div>`;

  // ---------- lists ----------
  const lists = {
    A: () => `${header()}<div class="job-catalog" aria-label="Locations">${headings(["Location", "Address", "Phone number", "Time zone"])}${L.map((l) => `
      <div class="job-catalog-row location-catalog-row" data-archived="false">
        <button type="button" class="job-row-identity"><span class="job-name-stack"><span class="job-row-name" title="${l.name}">${l.name}</span><span class="lv-card-line">${addr(l)}</span><span class="lv-card-meta">${l.phone ? `${l.zone} · ${l.phone}` : l.zone}</span></span></button>
        <span class="lv-cell">${addr(l)}</span><span class="lv-cell lv-faint">${l.phone || "—"}</span><span class="lv-cell">${l.zone}</span>${menu(l)}
      </div>`).join("")}</div>`,

    B: () => `${header()}<div class="job-catalog" aria-label="Locations">${headings(["Location", "Short name", "Address", "Phone number", "Time zone"])}${L.map((l) => `
      <div class="job-catalog-row location-catalog-row" data-archived="false">
        <button type="button" class="job-row-identity"><span class="job-name-stack"><span class="lv-phone-top"><span class="lv-chip">${l.short}</span></span><span class="job-row-name" title="${l.name}">${l.name}</span><span class="lv-card-line">${l.street}<br>${cityLine(l)}</span><span class="lv-card-meta">${l.zone}<span class="lv-dot">·</span>${l.phone || "No phone number"}</span></span></button>
        <span class="lv-cell"><span class="lv-chip">${l.short}</span></span>
        <span class="lv-cell lv-two"><span>${l.street}</span><span class="lv-sub">${cityLine(l)}</span></span>
        <span class="lv-cell lv-faint">${l.phone || "—"}</span>
        <span class="lv-cell lv-two"><span>${l.zone}</span><span class="lv-sub">${l.iana}</span></span>${menu(l)}
      </div>`).join("")}</div>`,

    C: () => `${header()}<div class="lv-cards" aria-label="Locations">${L.map((l) => `
      <article class="lv-card">
        <div class="lv-card-head">
          <span class="lv-tile">${ic("map-pin", 18)}</span>
          <div class="lv-card-title"><button type="button" class="lv-card-name">${l.name}</button><span class="lv-chip">${l.short}</span></div>
          ${menu(l)}
        </div>
        <ul class="lv-facts">
          <li>${ic("map-pin", 15)}<span>${l.street}<br>${cityLine(l)}</span></li>
          <li class="${l.phone ? "" : "lv-faint-row"}">${ic("phone", 15)}<span>${l.phone || "No phone number"}</span></li>
          <li>${ic("clock", 15)}<span>${l.zone}</span></li>
        </ul>
      </article>`).join("")}</div>`,

    D: () => `${header()}<div class="job-catalog" aria-label="Locations">${headings(["Location", "Address", "Phone number", "Time zone"])}${L.map((l, i) => `
      <div class="job-catalog-row location-catalog-row${i === 0 ? " lv-row-selected" : ""}" data-archived="false">
        <button type="button" class="job-row-identity"><span class="job-name-stack"><span class="job-row-name" title="${l.name}">${l.name}</span><span class="lv-card-line">${addr(l)}</span></span><span class="lv-abbr">${l.abbr}</span></button>
        <span class="lv-cell">${addr(l)}</span><span class="lv-cell lv-faint">${l.phone || "—"}</span><span class="lv-cell">${l.zone}</span>${menu(l)}
      </div>`).join("")}</div>`,

    E: () => `${header()}<div class="lv-plain" aria-label="Locations">${L.map((l) => `
      <div class="lv-plain-row">
        <button type="button" class="lv-plain-main"><span class="lv-plain-title"><span class="lv-plain-name">${l.name}</span><span class="lv-chip">${l.short}</span></span><span class="lv-plain-sub">${addr(l)}</span><span class="lv-plain-zone-m">${l.zone}${l.phone ? ` · ${l.phone}` : ""}</span></button>
        <span class="lv-plain-zone">${ic("clock", 14)}${l.zone}</span>
        <span class="lv-plain-phone${l.phone ? "" : " lv-faint"}">${ic("phone", 14)}${l.phone || "No phone"}</span>
        <button type="button" class="lv-edit-button">Edit</button>
        ${menu(l)}
      </div>`).join("")}</div>`,
  };

  // ---------- drawers ----------
  function fields() {
    const map = {};
    document.querySelectorAll(".catalog-drawer .location-catalog-fields > *").forEach((el) => {
      const label = el.querySelector(".job-field > span")?.textContent?.trim() ?? el.querySelector("span")?.textContent?.trim();
      map[label] = el;
    });
    return map;
  }
  const wrap = (el, cls = "") => { const d = document.createElement("div"); d.className = `lv-f ${cls}`.trim(); d.append(el); return d; };
  function rebuild(variant, build) {
    const drawer = document.querySelector(".catalog-drawer");
    const backdrop = document.querySelector(".catalog-drawer-backdrop");
    drawer.classList.add("lv-drawer", `lv-${variant}`);
    backdrop.classList.add("lv-backdrop", `lv-${variant}`);
    const f = fields();
    const fieldset = drawer.querySelector(".location-catalog-fields");
    build({ drawer, backdrop, f, fieldset });
  }
  function section(title, ...children) {
    const s = document.createElement("section");
    s.className = "lv-sec";
    s.innerHTML = `<h3>${title}</h3>`;
    const g = document.createElement("div");
    g.className = "lv-g";
    children.forEach((c) => g.append(c));
    s.append(g);
    return s;
  }
  const drawers = {
    A: () => rebuild("A", () => {}),
    B: () => rebuild("B", ({ f, fieldset }) => {
      fieldset.className = "lv-form";
      fieldset.replaceChildren(
        section("Name", wrap(f["Location name"], "lv-name"), wrap(f["Short name"], "lv-short")),
        section("Address", wrap(f["Street address"], "lv-wide"), wrap(f["City"], "lv-city"), wrap(f["State / region"], "lv-state"), wrap(f["ZIP / postal code"], "lv-zip")),
        section("Contact and time", wrap(f["Phone number"], "lv-phone"), wrap(f["Time zone"], "lv-zone")),
      );
      fieldset.querySelectorAll(".lv-sec")[1].classList.add("lv-sec-addr");
      fieldset.querySelectorAll(".lv-sec")[0].classList.add("lv-sec-name");
    }),
    C: () => rebuild("C", ({ drawer, f, fieldset }) => {
      const title = drawer.querySelector(".job-editor-title > div");
      title.innerHTML = `<span class="lv-eyebrow">Edit location</span><h2>Main Dining</h2><p>Phone number is optional.</p>`;
      fieldset.className = "lv-form";
      const pair = document.createElement("div");
      pair.className = "lv-pair";
      pair.append(wrap(f["State / region"]), wrap(f["ZIP / postal code"]));
      fieldset.replaceChildren(wrap(f["Location name"]), wrap(f["Short name"]), wrap(f["Phone number"]), wrap(f["Street address"]), wrap(f["City"]), pair, wrap(f["Time zone"]));
    }),
    D: () => rebuild("D", ({ drawer, f, fieldset }) => {
      const title = drawer.querySelector(".job-editor-title > div");
      title.innerHTML = `<h2>Main Dining <span class="lv-chip">MAIN</span></h2><p>Phone number is optional.</p>`;
      const back = document.createElement("button");
      back.type = "button";
      back.className = "lv-back";
      back.innerHTML = `${ic("arrow-left", 18)}<span>Locations</span>`;
      drawer.querySelector(".job-editor-title").prepend(back);
      fieldset.className = "lv-form";
      const zones = [["Pacific Time", "Los Angeles"], ["Mountain Time", "Denver"], ["Central Time", "Chicago"], ["Eastern Time", "New York"], ["Arizona Time", "Phoenix"], ["Hawaii Time", "Honolulu"]];
      const tz = document.createElement("fieldset");
      tz.className = "lv-tz";
      tz.innerHTML = `<legend>Time zone</legend><div class="lv-tz-grid">${zones.map(([z, c], i) => `<label class="lv-tz-opt${i === 0 ? " is-on" : ""}"><input type="radio" name="lv-tz"${i === 0 ? " checked" : ""}><span class="lv-tz-text"><span>${z}</span><small>${c}</small></span></label>`).join("")}</div><button type="button" class="lv-link">Other time zone</button>`;
      const pair = document.createElement("div");
      pair.className = "lv-pair";
      pair.append(wrap(f["State / region"]), wrap(f["ZIP / postal code"]));
      fieldset.replaceChildren(wrap(f["Location name"]), wrap(f["Short name"]), wrap(f["Phone number"]), wrap(f["Street address"]), wrap(f["City"]), pair, tz);
    }),
    E: () => rebuild("E", ({ drawer, f, fieldset }) => {
      fieldset.className = "lv-form";
      const grab = document.createElement("span");
      grab.className = "lv-grab";
      grab.setAttribute("aria-hidden", "true");
      drawer.querySelector(".job-catalog-editor").prepend(grab);
      fieldset.replaceChildren(...["Location name", "Short name", "Phone number", "Street address", "City", "State / region", "ZIP / postal code", "Time zone"].map((k) => wrap(f[k], "lv-row")));
    }),
  };

  window.NFV = {
    apply(variant, frame) {
      const s = document.querySelector("section.locations-catalog-settings-page:not(.catalog-drawer)");
      MENU = s.querySelector("details.job-row-menu")?.outerHTML ?? "";
      s.className = `settings-page jobs-settings-page locations-catalog-settings-page list-page lv lv-${variant}`;
      s.innerHTML = lists[variant]();
      if (frame === "drawer") drawers[variant]();
      else s.querySelectorAll(".lv-row-selected").forEach((r) => r.classList.remove("lv-row-selected"));
    },
  };
})();
