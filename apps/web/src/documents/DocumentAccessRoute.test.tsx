// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentAccessRoute } from "./DocumentAccessRoute";
import { getDocumentAccess } from "./document-data";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: { userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5" },
    context: {
      workspace: { id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd" },
      membership: { access: { employee: true, management: membershipManagement() } },
    },
  }),
}));
vi.mock("./document-data", () => ({ getDocumentAccess: vi.fn() }));
let management: string | null = null;
const membershipManagement = () => management;

function renderRoute(address = "/app/workspace") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <Routes>
          <Route
            path="/app/*"
            element={
              <DocumentAccessRoute>
                <Routes>
                  <Route path="workspace" element={<p>The app</p>} />
                  <Route path="employee-hub/documents" element={<p>Your documents</p>} />
                  <Route path="my-documents" element={<p>My documents</p>} />
                </Routes>
              </DocumentAccessRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

beforeEach(() => {
  management = null;
  vi.mocked(getDocumentAccess).mockReset().mockResolvedValue({ restricted: false } as never);
});

describe("DocumentAccessRoute", () => {
  it("shows the card with Try again, not the server's sentence, when the first check fails", async () => {
    vi.mocked(getDocumentAccess).mockRejectedValueOnce(new Error("Gateway timeout"));
    renderRoute();
    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't check your documents" })).toBeTruthy();
    expect(screen.queryByText("The app")).toBeNull();
    expect(screen.queryByText("Gateway timeout")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("The app")).toBeTruthy();
  });

  // The check repeats every 30 seconds; one failed repeat must not take the
  // whole app off the screen.
  it("keeps the app on screen when a later check fails", async () => {
    const { client } = renderRoute();
    expect(await screen.findByText("The app")).toBeTruthy();
    vi.mocked(getDocumentAccess).mockRejectedValueOnce(new Error("Gateway timeout"));
    await act(async () => {
      await client.refetchQueries();
    });
    expect(getDocumentAccess).toHaveBeenCalledTimes(2);
    expect(client.getQueryState(["document-lifecycle", "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5", "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", "access"])?.status).toBe("error");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByText("The app")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Their documents are a page of the app now (MY-DOCUMENTS): the check lets
  // that one page through, in the interface that is theirs.
  it("still sends a restricted person to their documents, and lets that page open", async () => {
    vi.mocked(getDocumentAccess).mockResolvedValue({ restricted: true } as never);
    renderRoute();
    expect(await screen.findByText("Your documents")).toBeTruthy();
  });

  it("sends a restricted manager to My documents", async () => {
    management = "manager";
    vi.mocked(getDocumentAccess).mockResolvedValue({ restricted: true } as never);
    renderRoute();
    expect(await screen.findByText("My documents")).toBeTruthy();
  });

  it("opens the documents page itself while restricted", async () => {
    vi.mocked(getDocumentAccess).mockResolvedValue({ restricted: true } as never);
    renderRoute("/app/employee-hub/documents?kind=acknowledgement");
    expect(await screen.findByText("Your documents")).toBeTruthy();
    expect(screen.queryByText("The app")).toBeNull();
  });
});
