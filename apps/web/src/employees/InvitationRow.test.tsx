import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { acceptPendingEmployeeInvitation, InvitationError } from "./employee-data";
import { InvitationRow } from "./InvitationRow";

vi.mock("./employee-data", async () => {
  const actual = await vi.importActual<typeof import("./employee-data")>("./employee-data");
  return {
    InvitationError: actual.InvitationError,
    acceptPendingEmployeeInvitation: vi.fn(),
    declinePendingEmployeeInvitation: vi.fn(),
  };
});

describe("InvitationRow", () => {
  it("tells an account with an unconfirmed email to confirm it first", async () => {
    vi.mocked(acceptPendingEmployeeInvitation).mockRejectedValue(new InvitationError("email_unconfirmed"));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <InvitationRow
            invitation={{
              id: "5f0c3a52-7a57-4f55-9d9c-3a1f4d0f3a11",
              workspaceName: "Northstar",
              expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
            } as Parameters<typeof InvitationRow>[0]["invitation"]}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Join Northstar" }));
    expect(
      await screen.findByText("Confirm your email first: open the link we sent when you created your account."),
    ).toBeTruthy();
    expect(screen.queryByText("Invitation update failed")).toBeNull();
  });
});
