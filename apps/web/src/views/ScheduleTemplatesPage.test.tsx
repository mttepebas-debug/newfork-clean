import type { ScheduleTemplateList } from "@newfork/shared/schedule";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ScheduleDataModule from "../schedule/schedule-data";
import {
  deleteScheduleTemplate,
  listScheduleTemplates,
  renameScheduleTemplate,
} from "../schedule/schedule-data";
import ScheduleTemplatesPage from "./ScheduleTemplatesPage";

import { RequestError } from "../lib/request-error";
const auth = vi.hoisted(() => ({
  context: {
    workspace: { id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd" },
    permissions: ["schedule.read", "schedule.templates.manage"],
    actions: ["schedule.read", "schedule.templates.read", "schedule.templates"],
  },
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: auth.context }),
}));

vi.mock("@newfork/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@newfork/ui")>()),
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    action: vi.fn(),
  }),
}));

vi.mock("../schedule/schedule-data", async (importOriginal) => {
  const actual = await importOriginal<typeof ScheduleDataModule>();
  return {
    ...actual,
    listScheduleTemplates: vi.fn(),
    renameScheduleTemplate: vi.fn(),
    deleteScheduleTemplate: vi.fn(),
  };
});

const templateList: ScheduleTemplateList = {
  templates: [
    {
      id: "91000000-0000-4000-8000-000000000001",
      workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      name: "Standard week",
      revision: 3,
      shift_count: 10,
      open_slot_count: 2,
      created_by_name: "Manager",
      updated_at: "2026-08-17T12:00:00.000Z",
    },
  ],
};

const listTemplatesMock = vi.mocked(listScheduleTemplates);
const renameTemplateMock = vi.mocked(renameScheduleTemplate);
const deleteTemplateMock = vi.mocked(deleteScheduleTemplate);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ScheduleTemplatesPage />
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

describe("ScheduleTemplatesPage", () => {
  it("lists templates with counts and opens the rename dialog", async () => {
    listTemplatesMock.mockResolvedValue(templateList);
    renderPage();

    expect(await screen.findByText("Standard week")).toBeTruthy();
    expect(screen.getByText("Revision 3")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Manager")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Rename template Standard week" }),
    );

    expect(screen.getByRole("dialog", { name: "Rename template" })).toBeTruthy();
    expect(
      (screen.getByRole("textbox", {
        name: "Template name",
      }) as HTMLInputElement).value,
    ).toBe("Standard week");
  });

  it("renames templates with the expected revision", async () => {
    listTemplatesMock.mockResolvedValue(templateList);
    renameTemplateMock.mockResolvedValue({
      template: { ...templateList.templates[0]!, name: "Lunch week", revision: 4 },
      shifts: [],
    });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Rename template Standard week",
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Template name" }), {
      target: { value: "Lunch week" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() =>
      expect(renameTemplateMock).toHaveBeenCalledWith(
        "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        "91000000-0000-4000-8000-000000000001",
        "Lunch week",
        3,
      ),
    );
  });

  it("deletes templates after the reference-style second click confirmation", async () => {
    listTemplatesMock.mockResolvedValue(templateList);
    deleteTemplateMock.mockResolvedValue(undefined);
    renderPage();

    const deleteButton = await screen.findByRole("button", {
      name: "Delete template Standard week",
    });
    fireEvent.click(deleteButton);
    expect(deleteTemplateMock).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm delete template Standard week",
      }),
    );

    await waitFor(() =>
      expect(deleteTemplateMock).toHaveBeenCalledWith(
        "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        "91000000-0000-4000-8000-000000000001",
        3,
      ),
    );
  });

  it("offers rename and delete only to someone the core lets manage templates", async () => {
    listTemplatesMock.mockResolvedValue(templateList);
    const allowed = auth.context.actions;
    // The permission key alone opens nothing: the answer is the core's action.
    auth.context.actions = ["schedule.read", "schedule.templates.read"];
    try {
      renderPage();
      expect(await screen.findByText("Standard week")).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Rename template Standard week" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Delete template Standard week" }),
      ).toBeNull();
    } finally {
      auth.context.actions = allowed;
    }
  });

  it("shows an empty state when no templates exist", async () => {
    listTemplatesMock.mockResolvedValue({ templates: [] });
    renderPage();

    expect(await screen.findByText("No templates yet")).toBeTruthy();
  });
});

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses schedule templates (FB-6.1.9)", async () => {
    listTemplatesMock.mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to schedule templates" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});
