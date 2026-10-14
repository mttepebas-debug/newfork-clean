import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const jobsSettingsStyles = readFileSync(
  "src/settings/jobs-settings.css",
  "utf8",
);

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(styles)?.[1] ?? "";
}

function ruleBodies(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    ...styles.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")),
  ].map((match) => match[1] ?? "");
}

describe("settings page alignment styles", () => {
  it("keeps Settings page width owned by the shared page frame", () => {
    const pageFrame = ruleBody(".settings-page");
    expect(pageFrame).toContain("width: min(100% - 64px, 1320px)");
    expect(pageFrame).toContain("--settings-header-action-gap: 18px");
    expect(pageFrame).toContain("--settings-header-action-min-height: 42px");
    expect(pageFrame).toContain("--settings-header-action-background: var(--theme-accent)");
    expect(pageFrame).toContain("--settings-header-title-font-size: 28px");
    expect(pageFrame).toContain(
      "--settings-header-description-font-size: 13px",
    );
    expect(ruleBody(".roles-page")).not.toContain("width:");
    expect(ruleBody(".acknowledgement-page")).not.toContain("width:");
    expect(ruleBody(".notification-settings")).not.toContain("max-width:");
    expect(ruleBody(".notification-settings")).not.toContain("width:");
  });

  it.each(["shift-catalog-settings-page", "acknowledgement-page"])(
    "keeps %s headers on the shared Settings alignment",
    (pageClass) => {
      expect(jobsSettingsStyles).not.toMatch(
        new RegExp(
          `\\.${pageClass}\\s*>\\s*\\.settings-page-header\\s*[,\\{][^}]*align-items\\s*:`,
        ),
      );
    },
  );

  it("owns every Settings header action coordinate in the shared contract", () => {
    const desktopAction = ruleBody(".settings-header-action");
    expect(desktopAction).toContain("align-self: start");
    expect(desktopAction).toContain("justify-self: end");
    expect(desktopAction).toContain(
      "margin-left: var(--settings-header-action-gap)",
    );
    const actionButton = ruleBody(
      ".settings-header-action :is(.nf-button, .job-primary-button)",
    );
    expect(actionButton).toContain(
      "min-height: var(--settings-header-action-min-height)",
    );
    expect(actionButton).toContain(
      "background: var(--settings-header-action-background)",
    );
    expect(actionButton).toContain(
      "font-size: var(--settings-header-action-font-size) !important",
    );
    expect(actionButton).toContain(
      "border-radius: var(--settings-header-action-radius)",
    );
    expect(ruleBody(".settings-page-header h1")).toContain(
      "font-weight: var(--settings-header-title-font-weight)",
    );
    expect(ruleBody(".settings-page-header p")).toContain(
      "color: var(--settings-header-description-color)",
    );
    expect(jobsSettingsStyles).toMatch(
      /\.shift-catalog-header-actions\s*\{[^}]*align-items:\s*flex-start/,
    );
    expect(ruleBodies(".settings-header-action")).toEqual(
      expect.arrayContaining([
        expect.stringContaining("justify-self: stretch"),
      ]),
    );
    expect(jobsSettingsStyles).not.toMatch(
      /\.(?:shift-catalog-settings-page|acknowledgement-page)\s+\.settings-header-action\s*\{[^}]*(?:align|justify)-self\s*:/,
    );
  });
  it("keeps a single frame on the job drawer's search box", () => {
    // The editor's field rule (0,2,1, later in the file) would add an inner border.
    const body = /\.job-assignment-drawer \.job-search\.job-search input \{([^}]*)\}/.exec(
      jobsSettingsStyles,
    )?.[1];
    expect(body).toContain("border: 0");
    expect(body).toContain("padding: 0");
  });
});
