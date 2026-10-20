import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScheduleLogoFrame } from "./ScheduleLogoFrame";

describe("ScheduleLogoFrame", () => {
  it("renders the saved logo with placement variables", () => {
    render(
      <ScheduleLogoFrame
        logoUrl="https://storage.example/logo.png"
        organizationName="Meyhouse"
        placement={{ scale: 1.5, offset_x: 12, offset_y: -8 }}
        testId="schedule-organization-logo"
      />,
    );

    const logo = screen.getByTestId("schedule-organization-logo");
    expect(logo.getAttribute("src")).toBe("https://storage.example/logo.png");
    expect(logo.style.getPropertyValue("--schedule-logo-scale")).toBe("1.5");
    expect(logo.style.getPropertyValue("--schedule-logo-offset-x")).toBe("12%");
    expect(logo.style.getPropertyValue("--schedule-logo-offset-y")).toBe("-8%");
  });

  it("renders a generated organization logo when no upload exists", () => {
    render(
      <ScheduleLogoFrame logoUrl={null} organizationName="Meyhouse Jazz" />,
    );

    expect(
      screen.getByRole("img", { name: "Meyhouse Jazz logo" }),
    ).toBeTruthy();
    expect(screen.getByText("MJ")).toBeTruthy();
  });

  it("shows a cut workspace name in full on hover (QA 50)", () => {
    render(
      <ScheduleLogoFrame logoUrl={null} organizationName="TEST Workspace With A Long Name" />,
    );

    expect(
      screen.getByText("TEST Workspace With A Long Name").getAttribute("title"),
    ).toBe("TEST Workspace With A Long Name");
  });
});
