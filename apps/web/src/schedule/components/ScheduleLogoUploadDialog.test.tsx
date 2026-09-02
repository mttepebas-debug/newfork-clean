import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleLogoUploadDialog } from "./ScheduleLogoUploadDialog";

describe("ScheduleLogoUploadDialog", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:logo-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders as a save-based editor with the reference frame and no visible description", () => {
    render(
      <ScheduleLogoUploadDialog
        open
        organizationName="Downtown"
        logoUrl="https://storage.example/logo.png"
        logoPlacement={{ scale: 1.2, offset_x: 10, offset_y: -5 }}
        logoFileName="logo.png"
        logoUpdatedAt="2026-06-15T12:00:00.000Z"
        saving={false}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Schedule logo" });
    const title = within(dialog).getByText("Schedule logo");
    const image = within(dialog).getByRole("img", { name: "Downtown logo" });
    const referenceFrame = screen.getByTestId(
      "schedule-logo-editor-reference-frame",
    );

    expect(title.className).toContain("sr-only");
    expect(
      within(dialog).queryByText(
        "Upload, position, and scale the logo shown on the schedule.",
      ),
    ).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Done" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeTruthy();
    expect(image.getAttribute("src")).toBe("https://storage.example/logo.png");
    expect(image.style.getPropertyValue("--schedule-logo-scale")).toBe("1.2");
    expect(image.style.getPropertyValue("--schedule-logo-offset-x")).toBe("10%");
    expect(image.style.getPropertyValue("--schedule-logo-offset-y")).toBe("-5%");
    expect(referenceFrame.style.aspectRatio).toBe("200 / 79");
    expect(referenceFrame.style.borderTopWidth).toBe("1px");
    expect(referenceFrame.style.borderRightWidth).toBe("3px");
    expect(referenceFrame.style.borderBottomWidth).toBe("1px");
    expect(referenceFrame.style.borderLeftWidth).toBe("1px");
    expect(referenceFrame.style.borderTopStyle).toBe("solid");
    expect(referenceFrame.style.borderTopColor).toBe(
      "hsl(var(--foreground) / 0.36)",
    );
  });

  it("keeps selected files local until Save and submits placement with the draft", () => {
    const onSave = vi.fn();

    render(
      <ScheduleLogoUploadDialog
        open
        organizationName="Downtown"
        logoUrl="https://storage.example/logo.png"
        logoPlacement={{ scale: 1, offset_x: 0, offset_y: 0 }}
        logoFileName="logo.png"
        saving={false}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    const file = new File(["logo"], "next-logo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload schedule logo file"), {
      target: { files: [file] },
    });

    expect(onSave).not.toHaveBeenCalled();
    const preview = screen.getByTestId("schedule-logo-editor-preview-image");
    expect(preview.getAttribute("src")).toBe("blob:logo-preview");

    fireEvent.change(screen.getByLabelText("Scale"), {
      target: { value: "1.5" },
    });
    fireEvent.change(screen.getByLabelText("Horizontal"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Vertical"), {
      target: { value: "-8" },
    });

    expect(preview.style.getPropertyValue("--schedule-logo-scale")).toBe("1.5");
    expect(preview.style.getPropertyValue("--schedule-logo-offset-x")).toBe(
      "12%",
    );
    expect(preview.style.getPropertyValue("--schedule-logo-offset-y")).toBe(
      "-8%",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      file,
      removeLogo: false,
      placement: { scale: 1.5, offset_x: 12, offset_y: -8 },
    });
  });

  it("drafts removal until Save and shows the generated preview", () => {
    const onSave = vi.fn();

    render(
      <ScheduleLogoUploadDialog
        open
        organizationName="Downtown"
        logoUrl="https://storage.example/logo.png"
        logoPlacement={{ scale: 1.3, offset_x: 20, offset_y: 10 }}
        logoFileName="logo.png"
        saving={false}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.getByText("Logo will be removed")).toBeTruthy();
    expect(
      screen
        .getByTestId("schedule-logo-editor-generated-preview")
        .getAttribute("aria-label"),
    ).toBe("Downtown logo");
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      file: null,
      removeLogo: true,
      placement: { scale: 1, offset_x: 0, offset_y: 0 },
    });
  });

  it("renders the generated organization-name logo when no upload exists", () => {
    render(
      <ScheduleLogoUploadDialog
        open
        organizationName="Downtown"
        logoUrl={null}
        error="Use SVG, PNG, JPEG, or WebP."
        saving={false}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Schedule logo" });
    const generatedPreview = screen.getByTestId(
      "schedule-logo-editor-generated-preview",
    );

    expect(generatedPreview.getAttribute("aria-label")).toBe("Downtown logo");
    expect(generatedPreview.textContent).toContain("DO");
    expect(generatedPreview.textContent).toContain("Downtown");
    expect(within(dialog).getByRole("button", { name: "Upload" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Remove" })).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Save" }).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Use SVG, PNG, JPEG, or WebP.",
    );
  });
});
