import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewAddressRoute } from "./view-address";

// A notice's address, an old link or a typed one opens the page in the view
// that is the person's own (NOTICE-VIEW): the employee view's pages live under
// /app/employee-hub, the management view's do not.

const post = "a8200000-0000-4000-8000-000000000065";
const employee = {
  membership: { access: { employee: true, management: null } },
  actions: ["employee_hub.read", "notifications.read_own"],
};
const both = {
  membership: { access: { employee: true, management: "manager" } },
  actions: ["employee_hub.read", "notifications.read_own", "settings.important_dates.read"],
};
const managerOnly = {
  membership: { access: { employee: false, management: "manager" } },
  actions: ["notifications.read_own"],
};
let current: object = employee;
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: current }) }));

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function openAt(path: string) {
  cleanup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <ViewAddressRoute>
              <Where />
            </ViewAddressRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId("where").textContent;
}

afterEach(() => {
  current = employee;
});

describe("ViewAddressRoute (NOTICE-VIEW)", () => {
  it("opens an employee's announcement notice in the employee view", () => {
    expect(openAt(`/app/announcements/${post}`)).toBe(`/app/employee-hub/announcements/${post}`);
    expect(openAt("/app/announcements")).toBe("/app/employee-hub/announcements");
  });

  it("opens an Important Date's notice as the post for an employee, never a no-access card", () => {
    expect(openAt(`/app/announcements/important-dates/${post}`)).toBe(`/app/employee-hub/announcements/${post}`);
  });

  it("opens an employee's notifications page in the employee view", () => {
    expect(openAt("/app/notifications")).toBe("/app/employee-hub/notifications");
  });

  it("keeps somebody with both accesses where the address is, starting from no view", () => {
    current = both;
    expect(openAt(`/app/announcements/important-dates/${post}`)).toBe(`/app/announcements/important-dates/${post}`);
    expect(openAt(`/app/employee-hub/announcements/${post}`)).toBe(`/app/employee-hub/announcements/${post}`);
  });

  it("sends a manager without Important Dates to the post itself", () => {
    current = managerOnly;
    expect(openAt(`/app/announcements/important-dates/${post}?tab=details`)).toBe(`/app/announcements/${post}?tab=details`);
  });

  it("sends somebody who only manages from an employee address to the management page", () => {
    current = managerOnly;
    expect(openAt(`/app/employee-hub/announcements/${post}`)).toBe(`/app/announcements/${post}`);
    expect(openAt("/app/employee-hub/notifications")).toBe("/app/notifications");
  });

  it("leaves every other address alone", () => {
    expect(openAt("/app/employee-hub/schedule?view=day")).toBe("/app/employee-hub/schedule?view=day");
  });
});
