import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultDocumentLifecycleSettings,
  type DocumentDetail,
} from "@newfork/shared";
import { DocumentReviewDrawer } from "./DocumentReviewDrawer";
import {
  getDocument,
  reviewDocument,
  setDocumentExemption,
  uploadDocument,
} from "./document-data";

vi.mock("./document-data", () => ({
  documentQueryKey: (a: { workspaceId: string }, u: string, id: string) => [
    "document-lifecycle",
    u,
    a.workspaceId,
    id,
  ],
  extendDocumentDeadline: vi.fn(),
  removeDocumentDraftFile: vi.fn(),
  withdrawDocumentAcknowledgement: vi.fn(),
  acknowledgeDocument: vi.fn(),
  deferInitialDocument: vi.fn(),
  getDocument: vi.fn(),
  reviewDocument: vi.fn(),
  setDocumentExemption: vi.fn(),
  setDocumentTimezone: vi.fn(),
  downloadDocument: vi.fn(),
  submitDocument: vi.fn(),
  uploadDocument: vi.fn(),
}));
const detail = (): DocumentDetail => ({
  obligation: {
    id: "requirement",
    workspace_id: "workspace",
    employee_id: "employee",
    employee_name: "Test Employee",
    title: "Safety certificate",
    source_id: "definition",
    kind: "document",
    mode: "conditional",
    status: "pending_review",
    revision: 1,
    requires_review: true,
    deadline_at: null,
    remaining_seconds: 0,
    rejection_reason: null,
    suspended: false,
    submitted_id: "submission",
    approved_id: null,
    location_ids: [],
    location_names: [],
    timezone: "America/Los_Angeles",
    settings: {
      ...defaultDocumentLifecycleSettings,
      mode: "conditional",
      period_days: 7,
    },
    accepted_formats: ["pdf"],
    tracks_expiry: false,
  },
  submissions: [
    {
      id: "submission",
      version: 1,
      state: "pending_review",
      submitted_at: "2026-09-15T12:00:00Z",
      reviewed_at: null,
      expiry_date: null,
      metadata: {},
      rejection_reason: null,
      files: [
        {
          id: "file",
          filename: "certificate.pdf",
          media_type: "application/pdf",
          size_bytes: 100,
          decision: "keep",
          note: "",
        },
      ],
    },
  ],
  history: [],
});
function page(selfOnly = false) {
  const onClose = vi.fn(),
    onNext = vi.fn();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <DocumentReviewDrawer
        audience={{ workspaceId: "workspace", selfOnly }}
        userId="user"
        requirementId="requirement"
        canReview={!selfOnly}
        onClose={onClose}
        onNext={onNext}
      />
    </QueryClientProvider>,
  );
  return { onClose, onNext };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDocument).mockResolvedValue(detail());
  vi.mocked(reviewDocument).mockResolvedValue({});
  vi.mocked(setDocumentExemption).mockResolvedValue({});
});
describe("shared document review", () => {
  it("describes only formats accepted by the current obligation", async () => {
    const draft = detail();
    draft.obligation.status = "missing";
    draft.obligation.submitted_id = null;
    draft.submissions = [];
    vi.mocked(getDocument).mockResolvedValue(draft);
    page(true);
    const upload = await screen.findByLabelText("Upload document");
    expect(upload.getAttribute("accept")).toBe(".pdf");
    expect(screen.getByText(/PDF, up to 10 MiB/)).toBeTruthy();
    expect(screen.queryByText(/JPEG, PNG or WebP/)).toBeNull();
  });
  it("keeps successful draft files and blocks Submit until a failed upload is removed", async () => {
    const draft = detail();
    draft.obligation.status = "missing";
    draft.obligation.submitted_id = null;
    draft.submissions[0]!.state = "draft";
    draft.submissions[0]!.submitted_at = null;
    vi.mocked(getDocument).mockResolvedValue(draft);
    vi.mocked(uploadDocument).mockRejectedValue(
      new Error("Upload unavailable"),
    );
    page(true);
    const submit = await screen.findByRole("button", {
      name: "Submit document",
    });
    expect(submit).toHaveProperty("disabled", false);
    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: {
        files: [
          new File(["pdf"], "replacement.pdf", { type: "application/pdf" }),
        ],
      },
    });
    await screen.findByRole("button", { name: "Retry upload" });
    expect(submit).toHaveProperty("disabled", true);
    expect(screen.getByText("certificate.pdf")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove failed upload" }),
    );
    expect(submit).toHaveProperty("disabled", false);
    expect(screen.getByText("certificate.pdf")).toBeTruthy();
    expect(uploadDocument).toHaveBeenCalledOnce();
  });
  it("requires rejection reason, disables exhausted remaining time, keeps the drawer open and advances only on Next", async () => {
    const { onClose, onNext } = page();
    const reject = await screen.findByRole("button", { name: "Reject" });
    expect(reject).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("option", { name: "Remaining time" }),
    ).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Unreadable" },
    });
    const after = detail();
    after.obligation.revision = 2;
    after.obligation.status = "rejected";
    after.submissions[0]!.state = "rejected";
    vi.mocked(getDocument).mockResolvedValue(after);
    fireEvent.click(reject);
    await waitFor(() =>
      expect(reviewDocument).toHaveBeenCalledWith(
        expect.anything(),
        "requirement",
        expect.objectContaining({
          revision: 1,
          decision: "reject",
          correction_period: "full",
          reason: "Unreadable",
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Reject" })).toBeNull(),
    );
    expect(
      screen.getByRole("heading", { name: "Safety certificate" }),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
  it("requires an exemption reason and locks parent navigation while the action is being confirmed", async () => {
    const { onClose } = page();
    fireEvent.click(
      await screen.findByRole("button", { name: "Exempt from this document" }),
    );
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
      "disabled",
      true,
    );
    const group = screen.getByRole("group", {
      name: "Exempt from this document",
    });
    expect(
      within(group).getByRole("button", { name: "Exempt from this document" }),
    ).toHaveProperty("disabled", true);
    fireEvent.change(within(group).getByLabelText("Reason"), {
      target: { value: "Role exception" },
    });
    const after = detail();
    after.obligation.revision = 2;
    after.obligation.status = "exempt";
    vi.mocked(getDocument).mockResolvedValue(after);
    fireEvent.click(
      within(group).getByRole("button", { name: "Exempt from this document" }),
    );
    await waitFor(() =>
      expect(setDocumentExemption).toHaveBeenCalledWith(
        expect.anything(),
        "requirement",
        { revision: 1, exempt: true, reason: "Role exception" },
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Remove exemption" }),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
  it("never offers manager review or exemption on the employee's own surface", async () => {
    page(true);
    await screen.findByRole("heading", { name: "Safety certificate" });
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Exempt from this document" }),
    ).toBeNull();
    expect(screen.getByLabelText("Upload document")).toBeTruthy();
  });
});

it("keeps paused document evidence readable while upload and review controls are absent",async()=>{
 const paused=detail();paused.obligation.status="paused";paused.obligation.publication_paused=true;
 vi.mocked(getDocument).mockResolvedValue(paused);page();
 await screen.findByText("certificate.pdf");
 expect(screen.queryByRole("button",{name:"Approve"})).toBeNull();
 expect(screen.queryByRole("button",{name:"Reject"})).toBeNull();
 expect(screen.queryByLabelText("Upload document")).toBeNull();
 expect(screen.queryByRole("button",{name:"Submit document"})).toBeNull();
 expect(reviewDocument).not.toHaveBeenCalled();
});
