// Reuse the first study's draft state, input handling and synthetic data.
const coreRender = render;
const coreInput = onInput;
const sections = ["basics", "audience", "rules", "fields", "review"];
const sectionLabels = {
  basics: "Details",
  audience: "Audience",
  rules: "Rules",
  fields: "Fields",
  review: "Review",
};
let group = "locations";
let fieldPage = 0;
let targetSearch = "";
let impactStage = "";
let impactPage = 0;
let impactReason = "";
state.variant = "folio";
state.activeSection = "basics";
state.expanded = true;

const groupLabels = {
  locations: "Locations",
  departments: "Departments",
  jobs: "Jobs",
  employees: "People",
};
const groupKeys = Object.keys(groupLabels);

function buttonFor(key, index) {
  const active = state.activeSection === key;
  return `<button type="button" id="section-${key}" data-section="${key}" role="tab" aria-controls="active-panel" aria-selected="${active}" class="${active ? "active" : ""}">${state.variant === "index" ? `<small>0${index + 1}</small>` : ""}${sectionLabels[key]}</button>`;
}

function contentFor(key) {
  return {
    basics,
    audience: targeting,
    rules,
    fields: extraFields,
    review: reviewPanel,
  }[key]();
}

buildVariant = function () {
  const wrapper = document.createElement("div");
  wrapper.className = "form-grid";
  const key = state.activeSection;
  const panelMarkup = `<div class="panel-content" id="active-panel" role="tabpanel" aria-labelledby="section-${key}">${contentFor(key)}</div>`;
  const tabs = `<nav class="section-tabs" role="tablist" aria-label="Document sections">${sections.map(buttonFor).join("")}</nav>`;
  if (state.variant === "folio") wrapper.innerHTML = tabs + panelMarkup;
  if (state.variant === "index")
    wrapper.innerHTML = `<nav class="side-index" role="tablist" aria-label="Document sections">${sections.map(buttonFor).join("")}</nav>${panelMarkup}`;
  if (state.variant === "sequence") {
    const index = sections.indexOf(key);
    wrapper.innerHTML = `<nav class="step-track" aria-label="Document steps">${sections.map((s, i) => `<button type="button" data-section="${s}" title="${sectionLabels[s]}" aria-label="Step ${i + 1}: ${sectionLabels[s]}" ${s === key ? 'aria-current="step"' : ""} class="${i <= index ? "active" : ""}"></button>`).join("")}</nav><div class="step-title"><h3 id="section-${key}">${sectionLabels[key]}</h3><span>${index + 1} of ${sections.length}</span></div>${panelMarkup}<div class="step-actions"><button type="button" data-section="${sections[index - 1] || key}" ${index === 0 ? "disabled" : ""}>Back</button><button type="button" data-section="${sections[index + 1] || key}" ${index === sections.length - 1 ? "disabled" : ""}>Continue</button></div>`;
  }
  if (state.variant === "workspace")
    wrapper.innerHTML = `<div class="identity-column">${basics()}</div><div><nav class="section-tabs" role="tablist" aria-label="Document sections">${sections
      .filter((s) => s !== "basics")
      .map(buttonFor)
      .join("")}</nav>${panelMarkup}</div>`;
  if (state.variant === "outline")
    wrapper.innerHTML = sections
      .map(
        (s, i) =>
          `<div class="outline-row"><button type="button" class="outline-heading" id="section-${s}" data-section="${s}" aria-expanded="${s === key}" ${s === key ? 'aria-controls="active-panel"' : ""}><span>${s === key ? "−" : "+"}</span>${sectionLabels[s]}<small>${s === "audience" ? estimateAudience() : s === "fields" ? `${state.data.fields.length} fields` : `0${i + 1}`}</small></button>${s === key ? panelMarkup : ""}</div>`,
      )
      .join("");
  return wrapper;
};

basics = function () {
  return `<section class="section"><h3>Document details</h3><label class="field"><span>Document name</span><input name="name" required maxlength="80" value="${esc(state.data.name)}" /></label><label class="field"><span>Description</span><textarea name="description" maxlength="240" rows="2">${esc(state.data.description)}</textarea></label><div class="two"><label class="field"><span>Requirement</span><select name="mode">${option("optional", "Optional", state.data.mode)}${option("required", "Required", state.data.mode)}${option("conditional", "Conditional", state.data.mode)}</select></label><label class="field"><span>Assignment scope</span><select name="scope">${option("future_onboarding", "Future onboarding", state.data.scope)}${option("all_active", "All active employees", state.data.scope)}</select></label></div></section>`;
};

targeting = function () {
  return `<section class="section"><h3>Audience</h3><div class="two"><label class="field"><span>Match groups</span><select name="operator">${option("and", "All conditions (AND)", state.data.operator)}${option("or", "Any condition (OR)", state.data.operator)}</select></label><label class="field"><span>Find ${groupLabels[group].toLowerCase()}</span><input type="search" data-target-search value="${esc(targetSearch)}" /></label></div><nav class="group-tabs" role="tablist" aria-label="Target groups">${groupKeys.map((k) => `<button type="button" role="tab" id="group-${k}" aria-controls="target-options" aria-selected="${k === group}" data-group="${k}">${groupLabels[k]} (${state.data[k].length})</button>`).join("")}</nav><div id="target-options" role="tabpanel" aria-labelledby="group-${group}">${targetGroup(group, groupLabels[group])}</div><div class="selection-meta"><span data-audience>${estimateAudience()}</span><span>${group === "employees" ? "Named people are added" : "Empty groups match everyone"}</span></div></section>`;
};

rules = function () {
  return `<section class="section"><h3>Time and review</h3>${state.data.mode !== "optional" ? `<div class="two"><label class="field"><span>${state.data.mode === "conditional" ? "Grace" : "Delivery"} period (days)</span><input type="number" name="period" min="1" max="3650" value="${esc(state.data.period)}" /></label><label class="choice"><input type="checkbox" name="suspend" ${state.data.suspend ? "checked" : ""} /><span>Restrict access when overdue</span></label></div>` : ""}<label class="choice"><input type="checkbox" name="review" ${state.data.review ? "checked" : ""} /><span>Manager review required</span></label><div class="two"><label class="choice"><input type="checkbox" name="expiry" ${state.data.expiry ? "checked" : ""} /><span>Track expiration date</span></label>${state.data.expiry ? `<label class="field"><span>Warn before expiry (days)</span><input type="number" name="warning" min="1" max="365" value="${esc(state.data.warning)}" /></label>` : ""}</div></section>`;
};

extraFields = function () {
  const size = state.variant === "workspace" ? 2 : 3;
  const pages = Math.max(1, Math.ceil(state.data.fields.length / size));
  fieldPage = Math.min(fieldPage, pages - 1);
  return `<section class="section"><h3>Employee-entered fields</h3><div class="field-list">${
    state.data.fields
      .slice(fieldPage * size, (fieldPage + 1) * size)
      .map((f, offset) => {
        const i = fieldPage * size + offset;
        return `<div class="extra-row" data-field="${i}"><input name="field-label" maxlength="80" value="${esc(f.label)}" placeholder="Field label" aria-label="Extra field label ${i + 1}" /><select name="field-kind" aria-label="Extra field type ${i + 1}">${option("text", "Text", f.kind)}${option("date", "Date", f.kind)}${option("number", "Number", f.kind)}</select><label class="check-row"><input type="checkbox" name="field-required" ${f.required ? "checked" : ""} />Required</label><button type="button" data-remove-compact="${i}" title="Remove field" aria-label="Remove field ${i + 1}">×</button></div>`;
      })
      .join("") || "<p>No additional fields.</p>"
  }</div><div class="field-pagination"><button class="btn" type="button" data-add-compact ${state.data.fields.length >= 20 ? "disabled" : ""}>Add field</button><div><button type="button" data-field-page="${fieldPage - 1}" ${fieldPage === 0 ? "disabled" : ""} aria-label="Previous fields" title="Previous fields">←</button><span>${fieldPage + 1} / ${pages}</span><button type="button" data-field-page="${fieldPage + 1}" ${fieldPage === pages - 1 ? "disabled" : ""} aria-label="Next fields" title="Next fields">→</button></div></div><div class="formats">Employee uploads: PDF · JPEG · PNG · WebP</div></section>`;
};

function reviewPanel() {
  if (impactStage === "reason")
    return `<section class="section"><h3>Apply to existing assignments</h3><label class="field"><span>Reason for applying</span><textarea data-impact-reason maxlength="500" rows="3">${esc(impactReason)}</textarea></label><div class="field-pagination"><button type="button" data-impact="preview">Back</button><button type="button" class="btn primary" data-impact="apply" ${impactReason.trim() ? "" : "disabled"}>Apply changes</button></div><span class="formats">Synthetic assignments only</span></section>`;
  if (impactStage === "preview") {
    const matches = matchingEmployees();
    const pages = Math.max(1, Math.ceil(matches.length / 3));
    impactPage = Math.min(impactPage, pages - 1);
    return `<section class="section"><h3>Assignment impact</h3><span class="formats">Simulated update · ${matches.length} employees</span><div>${
      matches
        .slice(impactPage * 3, (impactPage + 1) * 3)
        .map(
          (e) =>
            `<div class="choice">${esc(e.name)}<span class="formats">Definition update</span></div>`,
        )
        .join("") || "<p>No changes to existing assignments.</p>"
    }</div><div class="field-pagination"><button type="button" data-impact="summary">Back</button><div><button type="button" data-impact-page="${impactPage - 1}" ${impactPage === 0 ? "disabled" : ""} aria-label="Previous employees">←</button><span>${impactPage + 1} / ${pages}</span><button type="button" data-impact-page="${impactPage + 1}" ${impactPage === pages - 1 ? "disabled" : ""} aria-label="Next employees">→</button></div><button type="button" data-impact="reason" ${matches.length ? "" : "disabled"}>Continue</button></div></section>`;
  }
  const dirty = JSON.stringify(state.data) !== JSON.stringify(savedData);
  return `<section class="section"><h3>Review document</h3><div class="selection-meta"><strong>${labelMode()}</strong><span>${estimateAudience()}</span></div><div class="choice">${esc(state.data.name)}</div><div class="selection-meta"><span>Review</span><strong>${state.data.review ? "Manager approval" : "Automatic"}</strong></div><div class="selection-meta"><span>Expiration</span><strong>${state.data.expiry ? `${state.data.warning} day warning` : "Not tracked"}</strong></div><div class="selection-meta"><span>Delivery period</span><strong>${state.data.mode === "optional" ? "Not required" : state.data.period ? `${state.data.period} days` : "Not set"}</strong></div><div class="selection-meta"><span>Overdue access</span><strong>${state.data.suspend ? "Restricted" : "Unchanged"}</strong></div><div class="selection-meta"><span>Additional fields</span><strong>${state.data.fields.length}</strong></div><button type="button" data-impact="preview" ${dirty ? "disabled" : ""} title="${dirty ? "Save draft before previewing" : "Preview existing assignments"}">Preview impact</button></section>`;
}

// Match the current source contract: named people are additive; empty groups match all.
matchingEmployees = function () {
  return employees.filter((e) => {
    if (state.data.employees.includes(e.name)) return true;
    const checks = [
      ["locations", e.location],
      ["departments", e.department],
      ["jobs", e.job],
    ]
      .filter(([k]) => state.data[k].length)
      .map(([k, v]) => state.data[k].includes(v));
    return (
      checks.length === 0 ||
      (state.data.operator === "and"
        ? checks.every(Boolean)
        : checks.some(Boolean))
    );
  });
};

render = function (options = {}) {
  coreRender(options);
  shell.querySelector("[data-close]").addEventListener("click", closeEditor);
  applyTargetSearch();
};

onInput = function (event) {
  if (event.target.name) impactStage = "";
  coreInput(event);
  const preview = shell.querySelector('[data-impact="preview"]');
  if (preview && !impactStage)
    preview.disabled = JSON.stringify(state.data) !== JSON.stringify(savedData);
  if (groupKeys.includes(event.target.name)) {
    const tab = document.querySelector(`[data-group="${event.target.name}"]`);
    if (tab)
      tab.textContent = `${groupLabels[event.target.name]} (${state.data[event.target.name].length})`;
  }
};

function validationIssue() {
  if (state.data.name.trim().length < 3)
    return {
      section: "basics",
      name: "name",
      text: "Enter a document name with at least 3 characters.",
    };
  const period = Number(state.data.period);
  if (
    state.data.mode !== "optional" &&
    (((state.data.mode === "conditional" || state.data.suspend) && !period) ||
      (state.data.period &&
        (!Number.isInteger(period) || period < 1 || period > 3650)))
  )
    return {
      section: "rules",
      name: "period",
      text: "Enter a whole delivery period from 1 to 3650 days.",
    };
  const warning = Number(state.data.warning);
  if (
    state.data.expiry &&
    (!Number.isInteger(warning) || warning < 1 || warning > 365)
  )
    return {
      section: "rules",
      name: "warning",
      text: "Enter a whole expiry warning from 1 to 365 days.",
    };
  const index = state.data.fields.findIndex((f) => !f.label.trim());
  if (index >= 0)
    return {
      section: "fields",
      name: "field-label",
      index,
      text: "Every additional field needs a label.",
    };
  return null;
}

save = function (event) {
  event.preventDefault();
  const issue = validationIssue();
  if (issue) {
    state.activeSection =
      state.variant === "workspace" && issue.section === "basics"
        ? "audience"
        : issue.section;
    if (issue.index !== undefined)
      fieldPage = Math.floor(
        issue.index / (state.variant === "workspace" ? 2 : 3),
      );
    render({
      message: issue.text,
      type: "error",
      focus: {
        name: issue.name,
        field: issue.index === undefined ? null : String(issue.index),
      },
    });
    shell
      .querySelector(`[name="${issue.name}"]`)
      ?.setAttribute("aria-invalid", "true");
    return;
  }
  savedData = clone(state.data);
  impactStage = "";
  render({ message: "Draft saved in this preview.", type: "ok" });
};

cancel = function () {
  impactStage = "";
  state.data = clone(savedData);
  render({ message: "Unsaved changes discarded.", type: "ok" });
};

function closeEditor() {
  impactStage = "";
  state.data = clone(savedData);
  shell.innerHTML =
    '<button type="button" class="btn primary reopen" data-reopen>Edit document</button>';
}

function applyTargetSearch() {
  const rows = shell.querySelectorAll(".target-row");
  rows.forEach(
    (row) =>
      (row.hidden = !row.textContent
        .toLowerCase()
        .includes(targetSearch.toLowerCase())),
  );
  shell.querySelector(".target-empty")?.remove();
  if (rows.length && [...rows].every((row) => row.hidden)) {
    const empty = document.createElement("p");
    empty.className = "target-empty";
    empty.textContent = "No matches";
    shell.querySelector("#target-options").appendChild(empty);
  }
}

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-impact-reason]")) {
    impactReason = event.target.value;
    shell.querySelector('[data-impact="apply"]').disabled =
      !impactReason.trim();
    autoGrowAll();
  }
  if (event.target.matches("[data-target-search]")) {
    targetSearch = event.target.value;
    applyTargetSearch();
  }
});

document.addEventListener("click", (event) => {
  const impact = event.target.closest("[data-impact]");
  if (impact && !impact.disabled) {
    if (impact.dataset.impact === "apply") {
      impactStage = "";
      impactReason = "";
      render({
        message: "Changes applied to synthetic assignments.",
        type: "ok",
      });
    } else {
      impactStage =
        impact.dataset.impact === "summary" ? "" : impact.dataset.impact;
      render();
    }
  }
  const impactNav = event.target.closest("[data-impact-page]");
  if (impactNav && !impactNav.disabled) {
    impactPage = Number(impactNav.dataset.impactPage);
    render();
  }
  const design = event.target.closest("[data-design]");
  if (design) {
    state.variant = design.dataset.design;
    state.activeSection = state.variant === "workspace" ? "audience" : "basics";
    document
      .querySelectorAll("[data-design]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === design)));
    fieldPage = 0;
    render();
  }
  const theme = event.target.closest("[data-theme-choice]");
  if (theme) {
    document.documentElement.dataset.theme = theme.dataset.themeChoice;
    document
      .querySelectorAll("[data-theme-choice]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === theme)));
  }
  const section = event.target.closest("[data-section]");
  if (section && !section.disabled) {
    state.activeSection = section.dataset.section;
    render();
    shell.querySelector(`[data-section="${state.activeSection}"]`)?.focus();
  }
  const target = event.target.closest("[data-group]");
  if (target) {
    group = target.dataset.group;
    targetSearch = "";
    render();
    shell.querySelector(`[data-group="${group}"]`).focus();
  }
  const pagination = event.target.closest("[data-field-page]");
  if (pagination && !pagination.disabled) {
    fieldPage = Number(pagination.dataset.fieldPage);
    render();
  }
  if (
    event.target.closest("[data-add-compact]") &&
    state.data.fields.length < 20
  ) {
    state.data.fields.push({ label: "", kind: "text", required: false });
    fieldPage = Math.floor(
      (state.data.fields.length - 1) / (state.variant === "workspace" ? 2 : 3),
    );
    render({
      focus: {
        name: "field-label",
        field: String(state.data.fields.length - 1),
      },
    });
  }
  const remove = event.target.closest("[data-remove-compact]");
  if (remove) {
    state.data.fields.splice(Number(remove.dataset.removeCompact), 1);
    render();
  }
  if (event.target.closest("[data-reopen]")) render();
});

document.addEventListener("keydown", (event) => {
  const tab = event.target.closest('[role="tab"]');
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
    return;
  const tabs = [
    ...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]'),
  ];
  const i = tabs.indexOf(tab);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (i + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  event.preventDefault();
  tabs[next].click();
});

document.getElementById("longDescription").addEventListener("click", () => {
  state.data.description =
    "Upload a current safety certificate showing your full name, certificate number, issuing authority, and renewal date. Include all pages in one file. The operations team reviews submissions before independent delivery work begins. Keep it valid.".slice(
      0,
      240,
    );
  state.activeSection = state.variant === "workspace" ? "audience" : "basics";
  render({ focus: { name: "description" } });
});
document.getElementById("resetPreview").addEventListener("click", () => {
  impactStage = "";
  impactReason = "";
  impactPage = 0;
  state.data = clone(initialData);
  savedData = clone(initialData);
  fieldPage = 0;
  targetSearch = "";
  render({ message: "Preview reset.", type: "ok" });
});
render();
