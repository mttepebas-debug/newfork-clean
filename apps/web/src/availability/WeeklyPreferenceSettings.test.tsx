// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequestError } from "../lib/request-error";
import { loadWeeklyPreferenceSettings } from "./availability-data";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeeklyPreferenceSettingsRead } from "@newfork/shared";
import {
  WeeklyPreferenceSettings,
  WeeklyPreferenceSettingsPanel,
} from "./WeeklyPreferenceSettings";
vi.mock("./availability-data", () => ({
  loadWeeklyPreferenceSettings: vi.fn(),
  saveWeeklyPreferenceSettings: vi.fn(),
}));
afterEach(cleanup);
function model(): WeeklyPreferenceSettingsRead {
  return {
    settings: {
      input_mode: "time_range",
      onboarding_required: false,
      revision: 3,
    },
    can_edit: true,
    missing_shift_types: [],
  };
}
describe("weekly preference settings", () => {
  it("saves entry mode and onboarding with the loaded revision", async () => {
    const value = model();
    const onSave = vi
      .fn()
      .mockResolvedValue({
        ...value,
        settings: {
          ...value.settings,
          input_mode: "shift_type",
          onboarding_required: true,
          revision: 4,
        },
      });
    render(
      <MemoryRouter>
        <WeeklyPreferenceSettings
          model={value}
          onSave={onSave}
          onReload={async () => value}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Shift type" }));
    expect(
      screen.getByText(/Saved weeks will be converted to the new entry mode/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(onSave).toHaveBeenCalledWith({
      input_mode: "shift_type",
      onboarding_required: true,
      expected_revision: 3,
    });
    expect(
      (screen.getByRole("radio", { name: "Shift type" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
  it("blocks missing defaults only in shift mode and links the exact type", () => {
    const value = {
      ...model(),
      missing_shift_types: [
        { id: "ad420000-0000-4000-8000-000000000001", name: "Lunch" },
      ],
    };
    const onSave = vi.fn();
    render(
      <MemoryRouter>
        <WeeklyPreferenceSettings
          model={value}
          onSave={onSave}
          onReload={async () => value}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Shift type" }));
    expect(
      screen.getByRole("link", { name: "Lunch" }).getAttribute("href"),
    ).toContain(`?edit=${value.missing_shift_types[0]!.id}`);
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Time range" }));
    fireEvent.click(screen.getByRole("switch"));
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("preserves dirty choices on a newer revision until explicit reload", async () => {
    const value = model();
    const next = { ...value, settings: { ...value.settings, revision: 4 } };
    const onSave = vi.fn();
    const onReload = vi.fn().mockResolvedValue(next);
    const view = (m: WeeklyPreferenceSettingsRead) => (
      <MemoryRouter>
        <WeeklyPreferenceSettings
          model={m}
          onSave={onSave}
          onReload={onReload}
        />
      </MemoryRouter>
    );
    const result = render(view(value));
    fireEvent.click(screen.getByRole("radio", { name: "Shift type" }));
    result.rerender(view(next));
    expect(screen.getByText(/Your draft is preserved/)).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: "Shift type" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard and reload" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("radio", { name: "Time range" }) as HTMLInputElement)
          .checked,
      ).toBe(true),
    );
  });
  it("does not offer editing to a manager without organization authority", () => {
    const value = { ...model(), can_edit: false };
    const onSave = vi.fn();
    render(
      <MemoryRouter>
        <WeeklyPreferenceSettings
          model={value}
          onSave={onSave}
          onReload={async () => value}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.getByRole("radio", { name: "Shift type" }).closest("fieldset")!
        .disabled,
    ).toBe(true);
    expect((screen.getByRole("switch") as HTMLInputElement).disabled).toBe(
      true,
    );
  });
  // BL-798 (E4-15): the core's "Not allowed" reads as a sentence.
  it("says the person has no access instead of the core's refusal", async () => {
    vi.mocked(loadWeeklyPreferenceSettings).mockRejectedValue(
      new RequestError("Not allowed", "authz.missing_permission", undefined, 403),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <WeeklyPreferenceSettingsPanel workspaceId="w" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You don't have access to these availability settings.",
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
