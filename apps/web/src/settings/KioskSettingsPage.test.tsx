import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext, KioskManagement } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  createKioskEnrollment,
  createKioskReenrollment,
  getKioskManagement,
  resetEmployeeKioskPin,
  revokeKioskDevice,
  updateKioskDeviceLabel,
} from "./kiosk-management-data";
import KioskSettingsPage from "./KioskSettingsPage";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const locationId = "11000000-0000-4000-8000-000000000001";
const employeeId = "15000000-0000-4000-8000-000000000001";
const deviceId = "a8100000-0000-4000-8000-000000000001";
const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: {
    id: workspaceId,
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspaceId,
    role: "manager",
    status: "active",
    allLocations: false,
  },
  permissions: [
    "workspace.read",
    "kiosk.device.enroll.location",
    "kiosk.device.read.location",
    "kiosk.device.revoke.location",
    "kiosk.pin.reset.location",
    "kiosk.audit.read.location",
  ],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: false, locationIds: [locationId] },
} satisfies ActiveWorkspaceContext;

const model = {
  workspace_id: workspaceId,
  locations: [
    {
      id: locationId,
      name: "Main Dining",
      timezone: "America/Los_Angeles",
      can_enroll: true,
      can_reset_pin: true,
    },
  ],
  devices: [
    {
      id: deviceId,
      workspace_id: workspaceId,
      location_id: locationId,
      location_name: "Main Dining",
      label: "Front counter",
      status: "active",
      credential_version: 1,
      created_at: "2026-08-17T12:00:00.000Z",
      last_seen_at: "2026-08-17T12:05:00.000Z",
      revoked_at: null,
    },
  ],
  employees: [
    {
      id: employeeId,
      display_name: "Alex Kim",
      employee_code: "E-0001",
      location_ids: [locationId],
      pin_configured: true,
    },
  ],
  events: [
    {
      id: "a8600000-0000-4000-8000-000000000001",
      action: "kiosk.device.enrolled",
      occurred_at: "2026-08-17T12:00:00.000Z",
      location_id: locationId,
      location_name: "Main Dining",
      device_id: deviceId,
      device_label: "Front counter",
      employee_id: null,
      employee_name: null,
      actor_name: "Local Owner",
    },
  ],
} satisfies KioskManagement;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./kiosk-management-data", () => ({
  getKioskManagement: vi.fn(),
  createKioskEnrollment: vi.fn(),
  updateKioskDeviceLabel: vi.fn(),
  revokeKioskDevice: vi.fn(),
  createKioskReenrollment: vi.fn(),
  resetEmployeeKioskPin: vi.fn(),
}));

function renderPage() {
  vi.mocked(getKioskManagement).mockResolvedValue(model);
  vi.mocked(updateKioskDeviceLabel).mockResolvedValue(model.devices[0]!);
  vi.mocked(revokeKioskDevice).mockResolvedValue(undefined);
  vi.mocked(createKioskEnrollment).mockResolvedValue({
    id: "a8500000-0000-4000-8000-000000000001",
    workspace_id: workspaceId,
    location_id: locationId,
    label: "Front counter",
    code: "ABCDE-FGHIJ-KLMNO-PQRST",
    expires_at: "2026-08-17T12:10:00.000Z",
  });
  vi.mocked(createKioskReenrollment).mockResolvedValue({
    id: "a8500000-0000-4000-8000-000000000002",
    workspace_id: workspaceId,
    location_id: locationId,
    label: "Front counter",
    code: "VWXYZ-23456-ABCDE-FGHIJ",
    expires_at: "2026-08-17T12:10:00.000Z",
  });
  vi.mocked(resetEmployeeKioskPin).mockResolvedValue({
    employee_id: employeeId,
    workspace_id: workspaceId,
    location_id: locationId,
    updated_at: "2026-08-17T12:00:00.000Z",
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <KioskSettingsPage />
    </QueryClientProvider>,
  );
}

describe("KioskSettingsPage", () => {
  it("renames a scoped device and requires confirmation before replacement", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Kiosk" })).toBeTruthy();
    expect(await screen.findByText("Front counter")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit Front counter" }));
    fireEvent.change(screen.getByLabelText("Device name"), {
      target: { value: "Host stand" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateKioskDeviceLabel).toHaveBeenCalledWith(
        workspaceId,
        deviceId,
        { label: "Host stand" },
      ),
    );
    const replaceButton = screen.getByRole("button", {
      name: "Replace Front counter",
    });
    replaceButton.focus();
    fireEvent.click(replaceButton);
    expect(
      screen.getByRole("dialog", { name: "Replace device enrollment?" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Replace device enrollment?" }),
    ).toBeNull();
    expect(document.activeElement).toBe(replaceButton);
    fireEvent.click(replaceButton);
    fireEvent.click(screen.getByRole("button", { name: "Replace device" }));
    expect(await screen.findByText("VWXYZ-23456-ABCDE-FGHIJ")).toBeTruthy();
    expect(createKioskReenrollment).toHaveBeenCalledWith(workspaceId, deviceId);
  });

  it("resets a six-digit PIN only after location and employee selection", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "PIN access" }));
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: locationId },
    });
    fireEvent.change(screen.getByLabelText("Employee"), {
      target: { value: employeeId },
    });
    fireEvent.change(screen.getByLabelText("New 6-digit PIN"), {
      target: { value: "246810" },
    });
    fireEvent.change(screen.getByLabelText("Confirm PIN"), {
      target: { value: "246810" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset PIN" }));
    await waitFor(() =>
      expect(resetEmployeeKioskPin).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        locationId,
        "246810",
      ),
    );
    expect(await screen.findByText("Employee kiosk PIN reset.")).toBeTruthy();
  });

  it("shows scoped audit history and an explicit deployment boundary", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Activity" }));
    expect(screen.getByText("Device Enrolled")).toBeTruthy();
    expect(screen.getByText("Local Owner")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Deployment boundary" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Managed-device mode", { exact: false }),
    ).toBeTruthy();
  });
});
