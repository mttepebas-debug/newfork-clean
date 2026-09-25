const shortDescription =
  "Employees assigned to delivery routes must provide a current certificate before working independently.";
const longDescription =
  "Employees assigned to delivery routes must provide certificate details, renewal timing, reviewer expectations, and upload guidance before working independently.";
const initialData = {
  name: "Driver safety certificate",
  description: shortDescription,
  mode: "conditional",
  scope: "all_active",
  operator: "and",
  period: "14",
  suspend: true,
  review: true,
  expiry: true,
  warning: "30",
  locations: ["North Market", "Airport Kiosk"],
  departments: ["Operations"],
  jobs: ["Delivery Lead", "Courier"],
  employees: ["Ava Chen"],
  fields: [
    { label: "Certificate number", kind: "text", required: true },
    { label: "Issued date", kind: "date", required: false },
  ],
};
let savedData = clone(initialData);
const state = {
  variant: "rail",
  activeSection: "basics",
  expanded: true,
  longText: false,
  data: clone(initialData),
};
const targetOptions = {
  locations: ["North Market", "Airport Kiosk", "Westside Cafe"],
  departments: ["Operations", "Kitchen", "Training"],
  jobs: ["Delivery Lead", "Courier", "Shift Lead", "Prep Cook"],
  employees: ["Ava Chen", "Mateo Rivera", "Nora Patel"],
};
const employees = [
  {
    name: "Ava Chen",
    location: "North Market",
    department: "Operations",
    job: "Delivery Lead",
  },
  {
    name: "Mateo Rivera",
    location: "Airport Kiosk",
    department: "Operations",
    job: "Courier",
  },
  {
    name: "Nora Patel",
    location: "Westside Cafe",
    department: "Training",
    job: "Shift Lead",
  },
  {
    name: "Jon Bell",
    location: "North Market",
    department: "Kitchen",
    job: "Prep Cook",
  },
  {
    name: "Lina Brooks",
    location: "Airport Kiosk",
    department: "Operations",
    job: "Courier",
  },
  {
    name: "Omar Hale",
    location: "Westside Cafe",
    department: "Operations",
    job: "Delivery Lead",
  },
  {
    name: "Iris Moon",
    location: "North Market",
    department: "Training",
    job: "Shift Lead",
  },
  {
    name: "Eli Stone",
    location: "Airport Kiosk",
    department: "Kitchen",
    job: "Prep Cook",
  },
];

const shell = document.getElementById("drawerShell");
const page = document.querySelector(".page");
const firstSection = {
  rail: "basics",
  "tabs-form": "setup",
  accordion: "all",
  impact: "all",
  checklist: "all",
};

function render(options = {}) {
  page.dataset.expanded = String(state.expanded);
  updateMetrics();
  shell.className = `drawer-shell ${state.variant}`;
  shell.innerHTML = "";
  const form = document
    .getElementById("formTemplate")
    .content.firstElementChild.cloneNode(true);
  form.querySelector("h2").textContent =
    state.data.name.trim() || "Untitled document";
  const body = form.querySelector(".body");
  body.appendChild(buildVariant());
  form.addEventListener("input", onInput);
  form.addEventListener("change", onInput);
  form.addEventListener("submit", save);
  form
    .querySelector('[data-action="cancel"]')
    .addEventListener("click", cancel);
  shell.appendChild(form);
  autoGrowAll();
  refreshDynamicText();
  if (options.message) message(form, options.message, options.type);
  if (options.focus) restoreFocus(options.focus);
}

function buildVariant() {
  const wrapper = document.createElement("div");
  wrapper.className = `form-grid ${state.variant}`;
  if (state.variant === "rail") {
    wrapper.innerHTML = `
      <nav class="rail-nav" role="tablist" aria-label="Form sections">
        ${tabButton("basics", "Basics")}
        ${tabButton("targeting", "Targeting")}
        ${tabButton("rules", "Rules")}
        ${tabButton("fields", "Fields")}
      </nav>
      <div class="form-grid">
        ${panel("basics", basics())}
        ${panel("targeting", targeting())}
        ${panel("rules", `${rules()}${summary()}`)}
        ${panel("fields", `${extraFields()}${summary()}`)}
      </div>`;
    return wrapper;
  }
  if (state.variant === "tabs-form") {
    wrapper.innerHTML = `
      <div class="subtabs" role="tablist" aria-label="Form groups">
        ${tabButton("setup", "Setup")}
        ${tabButton("targeting", "Targeting")}
        ${tabButton("rules", "Rules")}
      </div>
      ${panel("setup", basics())}
      ${panel("targeting", targeting())}
      ${panel("rules", `${rules()}${extraFields()}${summary()}`)}`;
    return wrapper;
  }
  if (state.variant === "accordion") {
    wrapper.innerHTML = `
      <div class="accordion">
        <details open><summary>Basics and employee copy</summary><div>${basics()}</div></details>
        <details ${state.data.mode === "conditional" ? "open" : ""}><summary>Requirement and targeting</summary><div>${targeting()}</div></details>
        <details open><summary>Review, expiration and fields</summary><div>${rules()}${extraFields()}</div></details>
      </div>${summary()}`;
    return wrapper;
  }
  if (state.variant === "impact") {
    wrapper.innerHTML = `
      <section class="section hero-section">
        <h3><span data-mode-label>${labelMode()}</span> requirement impact</h3>
        <div class="three">
          <span class="pill" data-audience>${estimateAudience()}</span>
          <span class="pill" data-deadline>${deadlineLabel()}</span>
          <span class="pill" data-access>${accessLabel()}</span>
        </div>
      </section>
      ${basics()}${targeting()}${rules()}${extraFields()}${summary()}`;
    return wrapper;
  }
  wrapper.innerHTML = `
    <div class="review-list">
      <div class="review-item"><b>1</b><div><strong>Name and instructions</strong><span data-name-summary>${esc(state.data.name || "Missing name")}</span></div></div>
      <div class="review-item"><b>2</b><div><strong>Audience</strong><span><span data-audience>${estimateAudience()}</span> using <span data-operator>${state.data.operator.toUpperCase()}</span> targeting</span></div></div>
      <div class="review-item"><b>3</b><div><strong>Rules</strong><span data-rules-summary>${rulesLabel()}</span></div></div>
    </div>
    ${basics()}${targeting()}${rules()}${extraFields()}${summary()}`;
  return wrapper;
}

function tabButton(section, label) {
  const active = state.activeSection === section;
  return `<button class="${active ? "active" : ""}" type="button" role="tab" aria-selected="${active}" data-section-tab="${section}">${label}</button>`;
}

function panel(section, content) {
  const active = state.activeSection === section;
  return `<div class="tabpanel" role="tabpanel" data-section-panel="${section}" ${active ? "" : "hidden"}>${content}</div>`;
}

function basics() {
  return `<section class="section">
    <h3>Basics</h3>
    <label class="field"><span>Document name</span><input name="name" required maxlength="80" value="${esc(state.data.name)}" /></label>
    <label class="field"><span>Description</span><textarea name="description" maxlength="240">${esc(state.data.description)}</textarea></label>
    <div class="two">
      <label class="field"><span>Requirement</span><select name="mode">
        ${option("optional", "Optional", state.data.mode)}
        ${option("required", "Required", state.data.mode)}
        ${option("conditional", "Conditional", state.data.mode)}
      </select></label>
      <label class="field"><span>Assignment scope</span><select name="scope">
        ${option("future_onboarding", "Future onboarding only", state.data.scope)}
        ${option("all_active", "All active employees", state.data.scope)}
      </select></label>
    </div>
  </section>`;
}

function targeting() {
  if (state.data.mode !== "conditional")
    return `<section class="section conditional-hidden" aria-hidden="true"></section><section class="compact-note"><strong>No conditional targeting</strong><span>${labelMode()} documents use the assignment scope above without target rules.</span></section>`;
  const controls = `
    <div class="two">
      <label class="field"><span>Match rule</span><select name="operator">
        ${option("and", "All selected groups", state.data.operator)}
        ${option("or", "Any selected group", state.data.operator)}
      </select></label>
      <label class="field"><span>Delivery period</span><input name="period" type="number" min="1" max="3650" value="${esc(state.data.period)}" /></label>
    </div>`;
  if (!state.expanded)
    return `<section class="section"><h3>Targeting</h3>${controls}<div class="compact-note"><strong data-audience>${estimateAudience()}</strong><span>${targetSummary()}</span></div></section>`;
  return `<section class="section">
    <h3>Targeting</h3>
    ${controls}
    ${targetGroup("locations", "Locations")}
    ${targetGroup("departments", "Departments")}
    ${targetGroup("jobs", "Jobs")}
    ${targetGroup("employees", "Employees")}
  </section>`;
}

function targetGroup(key, label) {
  return `<div class="target-list"><span class="label">${label}</span>${targetOptions[
    key
  ]
    .map(
      (value) =>
        `<label class="target-row"><input type="checkbox" name="${key}" value="${esc(value)}" ${
          state.data[key].includes(value) ? "checked" : ""
        } /><span>${esc(value)}</span></label>`,
    )
    .join("")}</div>`;
}

function rules() {
  const canSuspend = state.data.mode !== "optional";
  return `<section class="section">
    <h3>Review and expiration</h3>
    <label class="choice"><input type="checkbox" name="review" ${state.data.review ? "checked" : ""} /><span>Manager review required</span></label>
    <label class="choice"><input type="checkbox" name="expiry" ${state.data.expiry ? "checked" : ""} /><span>Track expiration date</span></label>
    ${
      canSuspend
        ? `<label class="choice"><input type="checkbox" name="suspend" ${state.data.suspend ? "checked" : ""} /><span>Suspend workspace access when overdue</span></label>`
        : ""
    }
    ${
      state.data.expiry
        ? `<label class="field"><span>Expiry warning</span><input name="warning" type="number" min="1" max="365" value="${esc(state.data.warning)}" /></label>`
        : ""
    }
  </section>`;
}

function extraFields() {
  return `<section class="section">
    <h3>Employee-entered fields</h3>
    <div class="extra-list">${state.data.fields
      .map(
        (field, index) => `<div class="extra-row" data-field="${index}">
          <input name="field-label" value="${esc(field.label)}" aria-label="Extra field label ${index + 1}" maxlength="80" />
          <select name="field-kind" aria-label="Extra field type ${index + 1}">
            ${option("text", "Text", field.kind)}
            ${option("date", "Date", field.kind)}
            ${option("number", "Number", field.kind)}
          </select>
          <label class="check-row"><input type="checkbox" name="field-required" ${field.required ? "checked" : ""} /> Required</label>
          <button type="button" data-remove-field="${index}" aria-label="Remove field">x</button>
        </div>`,
      )
      .join("")}</div>
    <button class="btn" type="button" data-add-field>Add field</button>
  </section>`;
}

function summary() {
  return `<section class="summary">
    <strong>Prototype draft state</strong>
    <span data-rules-summary>${rulesLabel()}</span>
    <span>Matched audience: <span data-audience>${estimateAudience()}</span>. ${targetSummary()}</span>
    <span>Save updates the local baseline. Cancel rolls unsaved changes back to that baseline. No backend mutation is sent.</span>
  </section>`;
}

function onInput(event) {
  const target = event.target;
  if (!target.name) return;
  const focus = focusDescriptor(target);
  const rerenderNames = new Set(["mode", "expiry"]);
  if (target.name === "name") state.data.name = target.value;
  if (target.name === "description")
    state.data.description = target.value.slice(0, 240);
  if (target.name === "mode") {
    state.data.mode = target.value;
    if (state.data.mode === "optional") state.data.suspend = false;
    if (state.data.mode === "conditional" && !state.data.period)
      state.data.period = "14";
  }
  if (target.name === "scope") state.data.scope = target.value;
  if (target.name === "operator") state.data.operator = target.value;
  if (target.name === "period") state.data.period = target.value;
  if (target.name === "warning") state.data.warning = target.value;
  if (target.name === "review") state.data.review = target.checked;
  if (target.name === "expiry") state.data.expiry = target.checked;
  if (target.name === "suspend") state.data.suspend = target.checked;
  for (const key of ["locations", "departments", "jobs", "employees"]) {
    if (target.name === key) state.data[key] = checkedValues(key);
  }
  const fieldRow = target.closest(".extra-row");
  if (fieldRow) {
    const index = Number(fieldRow.dataset.field);
    if (target.name === "field-label")
      state.data.fields[index].label = target.value.slice(0, 80);
    if (target.name === "field-kind")
      state.data.fields[index].kind = target.value;
    if (target.name === "field-required")
      state.data.fields[index].required = target.checked;
  }
  if (rerenderNames.has(target.name)) render({ focus });
  else {
    autoGrowAll();
    refreshDynamicText();
  }
}

function save(event) {
  event.preventDefault();
  const errors = validate();
  if (errors.length) {
    message(event.currentTarget, errors[0], "error");
    return;
  }
  savedData = clone(state.data);
  render({
    message:
      "Draft saved to the local prototype baseline. No backend mutation was sent.",
    type: "ok",
  });
}

function cancel() {
  state.data = clone(savedData);
  state.longText = state.data.description === longDescription;
  render({
    message: "Unsaved changes rolled back to the last saved prototype draft.",
    type: "ok",
  });
}

function validate() {
  if (state.data.name.trim().length < 3)
    return ["Document name needs at least 3 characters."];
  if (state.data.description.length > 240)
    return ["Description must be 240 characters or fewer."];
  if (state.data.mode === "conditional") {
    if (!selectedTargetCount())
      return ["Conditional documents need at least one target."];
    if (!Number(state.data.period))
      return ["Conditional documents need a delivery period."];
  }
  if (state.data.suspend && !Number(state.data.period))
    return ["Suspension requires a delivery period."];
  if (state.data.fields.length > 20)
    return ["No more than 20 employee-entered fields are supported."];
  if (state.data.fields.some((field) => !field.label.trim()))
    return ["Extra fields need labels."];
  return [];
}

function checkedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(
    (item) => item.value,
  );
}

function refreshDynamicText() {
  updateMetrics();
  document
    .querySelectorAll("[data-audience]")
    .forEach((node) => (node.textContent = estimateAudience()));
  document
    .querySelectorAll("[data-deadline]")
    .forEach((node) => (node.textContent = deadlineLabel()));
  document
    .querySelectorAll("[data-access]")
    .forEach((node) => (node.textContent = accessLabel()));
  document
    .querySelectorAll("[data-mode-label]")
    .forEach((node) => (node.textContent = labelMode()));
  document
    .querySelectorAll("[data-operator]")
    .forEach((node) => (node.textContent = state.data.operator.toUpperCase()));
  document
    .querySelectorAll("[data-name-summary]")
    .forEach((node) => (node.textContent = state.data.name || "Missing name"));
  document
    .querySelectorAll("[data-rules-summary]")
    .forEach((node) => (node.textContent = rulesLabel()));
}

function updateMetrics() {
  document.getElementById("metricMode").textContent = labelMode();
  document.getElementById("metricAudience").textContent = estimateAudience();
  document.getElementById("metricDeadline").textContent = deadlineLabel();
}

function message(form, text, type) {
  const msg = form.querySelector(".msg");
  msg.textContent = text;
  msg.className = `msg show ${type}`;
}

function labelMode() {
  return state.data.mode.charAt(0).toUpperCase() + state.data.mode.slice(1);
}

function matchingEmployees() {
  if (state.data.mode !== "conditional") {
    return state.data.scope === "all_active"
      ? employees
      : employees.slice(0, 3);
  }
  if (!selectedTargetCount()) return [];
  return employees.filter((employee) => {
    const checks = [
      ["locations", employee.location],
      ["departments", employee.department],
      ["jobs", employee.job],
      ["employees", employee.name],
    ].filter(([key]) => state.data[key].length > 0);
    if (state.data.operator === "or")
      return checks.some(([key, value]) => state.data[key].includes(value));
    return checks.every(([key, value]) => state.data[key].includes(value));
  });
}

function estimateAudience() {
  const count = matchingEmployees().length;
  return `${count} ${count === 1 ? "employee" : "employees"}`;
}

function selectedTargetCount() {
  return ["locations", "departments", "jobs", "employees"].reduce(
    (sum, key) => sum + state.data[key].length,
    0,
  );
}

function targetSummary() {
  if (state.data.mode !== "conditional")
    return "No target filters are used for this requirement mode.";
  if (!selectedTargetCount()) return "No targets selected.";
  const names = ["locations", "departments", "jobs", "employees"]
    .filter((key) => state.data[key].length)
    .map(
      (key) =>
        `${state.data[key].length} ${key.replace("employees", "employee")}`,
    );
  return `${state.data.operator.toUpperCase()} match across ${names.join(", ")}.`;
}

function deadlineLabel() {
  if (!state.data.period) return "No delivery period";
  return `${state.data.period} day delivery`;
}

function accessLabel() {
  if (state.data.mode === "optional") return "No access restriction";
  return state.data.suspend ? "Restricts access" : "No access restriction";
}

function rulesLabel() {
  return `${state.data.review ? "Manager review" : "Auto complete"}; ${
    state.data.expiry
      ? `tracks expiry with ${state.data.warning || 0} day warning`
      : "no expiry tracking"
  }; ${accessLabel()}.`;
}

function option(value, label, current) {
  return `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function autoGrowAll() {
  document.querySelectorAll("textarea").forEach((textarea) => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  });
}

function focusDescriptor(target) {
  return {
    name: target.name,
    value: target.value,
    checked: target.checked,
    field: target.closest(".extra-row")?.dataset.field ?? null,
  };
}

function restoreFocus(focus) {
  if (focus.section) {
    document.querySelector(`[data-section-tab="${focus.section}"]`)?.focus();
    return;
  }
  let selector = `[name="${focus.name}"]`;
  if (focus.field)
    selector = `.extra-row[data-field="${focus.field}"] ${selector}`;
  const candidates = [...document.querySelectorAll(selector)];
  const target =
    candidates.find((item) => item.value === focus.value) ?? candidates[0];
  if (target) target.focus();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

document.querySelectorAll(".prototype-list button").forEach((button) => {
  button.addEventListener("click", () => {
    document
      .querySelectorAll(".prototype-list button")
      .forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.variant = button.dataset.variant;
    state.activeSection = firstSection[state.variant];
    render();
  });
});
document
  .getElementById("expandedToggle")
  ?.addEventListener("change", (event) => {
    state.expanded = event.target.checked;
    render();
  });
document
  .getElementById("longTextToggle")
  ?.addEventListener("change", (event) => {
    state.longText = event.target.checked;
    state.data.description = state.longText
      ? longDescription
      : shortDescription;
    render({ focus: { name: "description" } });
  });
document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-section-tab]");
  if (tab) {
    state.activeSection = tab.dataset.sectionTab;
    render({ focus: { section: state.activeSection } });
  }
  const remove = event.target.closest("[data-remove-field]");
  if (remove) {
    state.data.fields.splice(Number(remove.dataset.removeField), 1);
    render();
  }
  if (event.target.closest("[data-add-field]")) {
    state.data.fields.push({ label: "", kind: "text", required: false });
    render({
      focus: {
        name: "field-label",
        field: String(state.data.fields.length - 1),
      },
    });
  }
});
if (!document.body.dataset.compact) render();
