import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultDocumentLifecycleSettings,
  type DocumentDetail,
  type DocumentObligation,
} from "@newfork/shared";
import { DocumentReviewDrawer } from "./DocumentReviewDrawer";
import { formatCalendarDay, formatDay } from "./document-review-facts";
import { createReviewSitting, type ReviewSitting } from "./review-sitting";
import { RequestError } from "../lib/request-error";
import {
  acknowledgeDocument,
  deferInitialDocument,
  downloadDocument,
  extendDocumentDeadline,
  getDocument,
  removeDocumentDraftFile,
  reviewDocument,
  setDocumentExemption,
  setDocumentTimezone,
  submitDocument,
  uploadDocument,
  withdrawDocumentAcknowledgement,
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
// A row of the manager's list, as the drawer's queue holds it.
const row = (over: Partial<DocumentObligation> = {}): DocumentObligation => ({
  ...detail().obligation,
  ...over,
});
function page(
  selfOnly = false,
  extra: { queue?: DocumentObligation[]; sitting?: ReviewSitting; canReview?: boolean } = {},
) {
  const onClose = vi.fn(),
    onNext = vi.fn(),
    onOpen = vi.fn();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Every mutation ends in the same refresh; the spy is how a test pins it.
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const drawer = (requirementId: string) => (
    <QueryClientProvider client={cache}>
      <DocumentReviewDrawer
        audience={{ workspaceId: "workspace", selfOnly }}
        userId="user"
        requirementId={requirementId}
        canReview={extra.canReview ?? !selfOnly}
        onClose={onClose}
        onNext={onNext}
        onOpen={onOpen}
        queue={extra.queue}
        sitting={extra.sitting}
      />
    </QueryClientProvider>
  );
  const { rerender, unmount } = render(drawer("requirement"));
  // The list keeps one drawer mounted and only changes which document it shows.
  const show = (requirementId: string) => rerender(drawer(requirementId));
  // Closed, then opened again from the list on the same page.
  const reopen = (requirementId = "requirement") => {
    unmount();
    return render(drawer(requirementId));
  };
  return { onClose, onNext, onOpen, invalidate, cache, show, reopen };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDocument).mockResolvedValue(detail());
  vi.mocked(reviewDocument).mockResolvedValue({});
  vi.mocked(setDocumentExemption).mockResolvedValue({});
});
// The manager's drawer (A2 Tur 6, file buttons design a): each file is approved or rejected on its own row, and the
// dock holds one line and one green button (Save, then Next: <who> or Close).
const dockLine = () => document.querySelector<HTMLElement>(".rd-foot .docr-note")?.textContent ?? null;
const green = () => document.querySelector<HTMLButtonElement>(".rd-foot .docr-green")!;
const save = () => screen.getByRole("button", { name: "Save" });
async function decide(file: string, choice: "Approve" | "Reject") {
  const pair = await screen.findByRole("group", { name: `Approve or reject ${file}` });
  fireEvent.click(within(pair).getByRole("button", { name: choice }));
}
const why = (file: string, first = "Test") =>
  screen.getByLabelText(`Why reject ${file}? ${first} sees this`) as HTMLInputElement;
async function approveAndSave(...files: string[]) {
  for (const file of files.length ? files : ["certificate.pdf"]) await decide(file, "Approve");
  fireEvent.click(save());
}
// The drawer's clock (performance.now): the green holds for 400 ms after its meaning changes.
function clock(start = 10_000) {
  let at = start;
  const spy = vi.spyOn(performance, "now").mockImplementation(() => at);
  return {
    tick: (ms: number) => {
      at += ms;
    },
    restore: () => spy.mockRestore(),
  };
}
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
  // BL-832 (KK-180 (2)): a reason typed and then left for Approve stays out of
  // the approval and its history line.
  it("sends no rejection reason with an approval", async () => {
    page();
    await decide("certificate.pdf", "Reject");
    fireEvent.change(why("certificate.pdf"), { target: { value: "Unreadable" } });
    await decide("certificate.pdf", "Approve");
    fireEvent.click(save());

    await waitFor(() =>
      expect(reviewDocument).toHaveBeenCalledWith(
        expect.anything(),
        "requirement",
        expect.objectContaining({
          decision: "approve",
          reason: "",
          files: [{ id: "file", decision: "keep", note: "" }],
        }),
      ),
    );
  });

  // BL-828 (KK-180 (2)): Zeynep approves a card Mert already decided; the
  // drawer reloads and says so instead of the server's "refresh required".
  it("reloads the drawer and says so when the document changed meanwhile", async () => {
    const { invalidate } = page();
    vi.mocked(reviewDocument).mockRejectedValueOnce(
      new RequestError("document changed; refresh required", "document.changed", undefined, 409),
    );
    const decided = detail();
    decided.obligation.revision = 2;
    decided.obligation.status = "completed";
    decided.submissions[0]!.state = "accepted";
    await approveAndSave();
    vi.mocked(getDocument).mockResolvedValue(decided);

    expect(
      await screen.findByText("This document changed. You're seeing the latest version."),
    ).toBeTruthy();
    expect(screen.queryByText("document changed; refresh required")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["document-lifecycle", "user", "workspace"],
    });
  });
  // BL-1028: the database names the kind of 409. "Changed meanwhile" says so
  // even when the reload looks the same, and never shows the server's sentence.
  it("says the document changed by its key, whatever the reload brings", async () => {
    page();
    vi.mocked(reviewDocument).mockRejectedValueOnce(
      new RequestError("document changed; refresh required", "document.changed", undefined, 409),
    );
    await approveAndSave();

    expect(
      await screen.findByText("This document changed. You're seeing the latest version."),
    ).toBeTruthy();
    expect(screen.queryByText("document changed; refresh required")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  // A standing refusal is also a 409 ("changes are paused"); nothing changed,
  // so there is nothing to reload and the refusal's own sentence stays, even
  // when somebody else's change lands at the same time.
  it("keeps a standing 409 refusal's sentence and claims no change", async () => {
    const { invalidate } = page();
    const later = detail();
    later.obligation.revision = 2;
    vi.mocked(reviewDocument).mockRejectedValueOnce(
      new RequestError("Document is unpublished; changes are paused", "document.paused", undefined, 409),
    );
    vi.mocked(getDocument).mockResolvedValueOnce(detail()).mockResolvedValue(later);
    await approveAndSave();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Document is unpublished; changes are paused",
    );
    expect(
      screen.queryByText("This document changed. You're seeing the latest version."),
    ).toBeNull();
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: ["document-lifecycle", "user", "workspace"],
    });
  });
  it("words a failed save for the person, not the server", async () => {
    page();
    vi.mocked(reviewDocument).mockRejectedValueOnce(
      new RequestError("Internal server error", undefined, undefined, 500),
    );
    await approveAndSave();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't save. Try again.",
    );
  });

  // BL-830 (KK-180 (2)): the version heading and a file's decision read as the
  // list does, never the stored code.
  it("names a version's state and a file's decision in words", async () => {
    const shown = detail();
    shown.obligation.status = "completed";
    shown.obligation.submitted_id = null;
    shown.submissions[0]!.state = "superseded";
    shown.submissions[0]!.files[0]!.decision = "discard";
    vi.mocked(getDocument).mockResolvedValue(shown);
    page(true);

    expect(
      await screen.findByRole("heading", { name: "Version 1 · Replaced" }),
    ).toBeTruthy();
    expect(screen.getByText("Discarded")).toBeTruthy();
    expect(screen.queryByText("discard")).toBeNull();
  });

  it("requires rejection reason, disables exhausted remaining time, keeps the drawer open and advances only on Next", async () => {
    const time = clock();
    try {
      const { onClose, onOpen } = page(false, {
        queue: [row(), row({ id: "second", employee_id: "other", employee_name: "Sam Lee" })],
      });
      await decide("certificate.pdf", "Reject");
      expect(save().getAttribute("aria-disabled")).toBe("true");
      expect(dockLine()).toBe("Add a reason for each rejected file");
      const left = screen.getByRole("button", { name: "What's left (0 days)" });
      expect(left.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(left);
      expect(left.getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByRole("button", { name: "A new 7 days" }).getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(save());
      expect(reviewDocument).not.toHaveBeenCalled();
      fireEvent.change(why("certificate.pdf"), { target: { value: "Unreadable" } });
      const after = detail();
      after.obligation.revision = 2;
      after.obligation.status = "rejected";
      after.submissions[0]!.state = "rejected";
      after.submissions[0]!.files[0] = { ...after.submissions[0]!.files[0]!, decision: "discard", note: "Unreadable" };
      vi.mocked(getDocument).mockResolvedValue(after);
      fireEvent.click(save());
      await waitFor(() =>
        expect(reviewDocument).toHaveBeenCalledWith(
          expect.anything(),
          "requirement",
          expect.objectContaining({
            revision: 1,
            decision: "reject",
            correction_period: "full",
            reason: "Unreadable.",
            files: [{ id: "file", decision: "discard", note: "Unreadable" }],
          }),
        ),
      );
      await waitFor(() => expect(green().textContent).toBe("Next: Sam Lee"));
      expect(screen.queryByRole("group", { name: "Approve or reject certificate.pdf" })).toBeNull();
      expect(
        screen.getByRole("dialog", { name: "Test Employee · Safety certificate" }),
      ).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
      // The green holds still for a moment after it changed meaning, then moves on.
      fireEvent.click(green());
      expect(onOpen).not.toHaveBeenCalled();
      time.tick(450);
      fireEvent.click(green());
      expect(onOpen).toHaveBeenCalledExactlyOnceWith("second");
    } finally {
      time.restore();
    }
  });
  // K1 decision 5: what is typed stays with its document, so nothing is locked while the Excuse panel is open; K1
  // decision 3: an excused document then offers today's Remove exemption as Ask for it again.
  it("requires a reason to excuse, keeps the strip and the X live meanwhile, and then offers to ask again", async () => {
    const time = clock();
    try {
      const { onClose, onOpen } = page(false, {
        queue: [row(), row({ id: "second", employee_id: "other", employee_name: "Sam Lee" })],
      });
      fireEvent.click(await screen.findByRole("button", { name: /^Excuse Test/ }));
      expect(screen.getByRole("button", { name: "Next: Sam Lee" })).toHaveProperty("disabled", false);
      expect(screen.getByRole("button", { name: "Close details" })).toHaveProperty("disabled", false);
      const group = screen.getByRole("group", { name: "Excuse Test" });
      time.tick(450);
      expect(save().getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(save());
      expect(setDocumentExemption).not.toHaveBeenCalled();
      fireEvent.change(within(group).getByLabelText("Reason"), {
        target: { value: "Role exception" },
      });
      const after = detail();
      after.obligation.revision = 2;
      after.obligation.status = "exempt";
      vi.mocked(getDocument).mockResolvedValue(after);
      fireEvent.click(save());
      await waitFor(() =>
        expect(setDocumentExemption).toHaveBeenCalledWith(
          expect.anything(),
          "requirement",
          { revision: 1, exempt: true, reason: "Role exception" },
        ),
      );
      expect(
        await screen.findByRole("button", { name: /^Ask for it again/ }),
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^Excuse Test/ })).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      time.restore();
    }
  });
  // The owner asked for the document in the first place. Taking their excuse
  // away is refused by the service, so the button is not offered.
  it("explains the owner's standing excuse instead of offering to lift it", async () => {
    const owner = detail();
    owner.obligation.status = "exempt";
    owner.obligation.exemption_locked = true;
    vi.mocked(getDocument).mockResolvedValue(owner);
    page();

    expect(
      // BL-834: in the person's words, not the rule's.
      await screen.findByText(
        "Owners aren't required to submit documents. Uploading is optional.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^Ask for it again/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /^Excuse/ })).toBeNull();
  });

  it("names the status the way the list does", async () => {
    page();
    expect(await screen.findByText("Needs review")).toBeTruthy();
    expect(screen.queryByText("pending review")).toBeNull();
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

// BL-1014: the decision can move the person out of Onboarding; the Employees list
// and the person's drawer read it again instead of keeping the old status.
it("refreshes the Employees list and the person's drawer after a decision", async () => {
  const { invalidate } = page();
  await approveAndSave();
  await waitFor(() =>
    expect(reviewDocument).toHaveBeenCalledWith(
      expect.anything(),
      "requirement",
      expect.objectContaining({ decision: "approve" }),
    ),
  );
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["employees", "workspace"] }),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["employee-detail", "workspace"] });
});

it("keeps paused document evidence readable while upload and review controls are absent",async()=>{
 const paused=detail();paused.obligation.status="paused";paused.obligation.publication_paused=true;
 vi.mocked(getDocument).mockResolvedValue(paused);page();
 await screen.findByText("certificate.pdf");
 expect(screen.queryByRole("button",{name:"Approve"})).toBeNull();
 expect(screen.queryByRole("button",{name:"Reject"})).toBeNull();
 expect(screen.queryByRole("group",{name:/^Approve or reject/})).toBeNull();
 expect(screen.queryByRole("button",{name:"Save"})).toBeNull();
 expect(screen.queryByLabelText("Upload document")).toBeNull();
 expect(screen.queryByRole("button",{name:"Submit document"})).toBeNull();
 expect(reviewDocument).not.toHaveBeenCalled();
});

// Characterization of the employee's own surface (Account > Documents): what
// the drawer does today, odd corners included, so a rewrite has an oracle.
const employee = { workspaceId: "workspace", selfOnly: true };
// Every mutation but download ends in the same refresh: the drawer's own
// document and the onboarding step list that embeds it.
function expectRefreshed(invalidate: ReturnType<typeof page>["invalidate"]) {
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["document-lifecycle", "user", "workspace"],
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["my-employee-onboarding", "workspace"],
  });
  // BL-278 (3): the account badge counts documents still to act on.
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account-attention"] });
}
// The employee's side of the same document: nothing submitted yet, one draft.
function withDraft() {
  const doc = detail();
  doc.obligation.status = "missing";
  doc.obligation.submitted_id = null;
  doc.submissions[0]!.state = "draft";
  doc.submissions[0]!.submitted_at = null;
  return doc;
}
function missing() {
  const doc = withDraft();
  doc.submissions = [];
  return doc;
}
const digest = "a".repeat(64);
const intent = "I have read and understood this policy";
const evidence = {
  typed_name: "Test Employee",
  executed_at: "2026-09-16T09:00:00Z",
  content_digest: digest,
  intent_statement: intent,
};
// The acknowledgement kind: policy text and a typed signature instead of files.
function policyDetail(acknowledged: typeof evidence | null = null) {
  const doc = missing();
  doc.obligation.kind = "acknowledgement";
  doc.obligation.title = "Code of conduct";
  if (acknowledged) doc.obligation.status = "completed";
  doc.policy = {
    content_text: "Be kind.",
    content_digest: digest,
    intent_statement: intent,
    can_withdraw: false,
    history: [],
    evidence: acknowledged,
  };
  return doc;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const closed = ["paused", "removed", "exempt"] as const;

describe("employee surface", () => {
  beforeEach(() => {
    vi.mocked(acknowledgeDocument).mockResolvedValue({});
    vi.mocked(withdrawDocumentAcknowledgement).mockResolvedValue({});
    vi.mocked(deferInitialDocument).mockResolvedValue({});
    vi.mocked(removeDocumentDraftFile).mockResolvedValue({});
    vi.mocked(submitDocument).mockResolvedValue({});
    vi.mocked(uploadDocument).mockResolvedValue({});
  });
  it("enables Acknowledge only with the intent ticked and the employee's own name, and unticking clears the name", async () => {
    vi.mocked(getDocument).mockResolvedValue(policyDetail());
    page(true);
    const acknowledge = await screen.findByRole("button", {
      name: "Acknowledge policy",
    });
    const box = screen.getByRole("checkbox", { name: intent });
    expect(acknowledge).toHaveProperty("disabled", true);
    expect(screen.queryByLabelText("Type your full name")).toBeNull();
    fireEvent.click(box);
    expect(acknowledge).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Type your full name"), {
      target: { value: "Test Employe" },
    });
    expect(acknowledge).toHaveProperty("disabled", true);
    // Case, doubled and surrounding whitespace do not count against the name.
    fireEvent.change(screen.getByLabelText("Type your full name"), {
      target: { value: "  test   EMPLOYEE " },
    });
    expect(acknowledge).toHaveProperty("disabled", false);
    fireEvent.click(box);
    expect(screen.queryByLabelText("Type your full name")).toBeNull();
    fireEvent.click(box);
    expect(screen.getByLabelText("Type your full name")).toHaveProperty(
      "value",
      "",
    );
    expect(acknowledge).toHaveProperty("disabled", true);
  });
  it("sends the name as typed with the content digest and one idempotency key, reused when the call is rejected", async () => {
    vi.mocked(getDocument).mockResolvedValue(policyDetail());
    vi.mocked(acknowledgeDocument)
      .mockRejectedValueOnce(new Error("Signature service unavailable"))
      .mockResolvedValue({});
    const { invalidate } = page(true);
    const acknowledge = await screen.findByRole("button", {
      name: "Acknowledge policy",
    });
    fireEvent.click(screen.getByRole("checkbox", { name: intent }));
    fireEvent.change(screen.getByLabelText("Type your full name"), {
      target: { value: "  test   EMPLOYEE " },
    });
    fireEvent.click(acknowledge);
    await screen.findByText("Signature service unavailable");
    expect(invalidate).not.toHaveBeenCalled();
    fireEvent.click(acknowledge);
    await waitFor(() => expectRefreshed(invalidate));
    expect(acknowledgeDocument).toHaveBeenCalledTimes(2);
    const [first, second] = vi
      .mocked(acknowledgeDocument)
      .mock.calls.map((call) => call[2]);
    expect(first).toEqual({
      revision: 1,
      // Only the comparison is normalised; the name travels as typed.
      typed_name: "  test   EMPLOYEE ",
      content_digest: digest,
      idempotency_key: expect.stringMatching(uuid),
    });
    expect(second).toEqual(first);
    expect(acknowledgeDocument).toHaveBeenCalledWith(
      employee,
      "requirement",
      first,
    );
  });
  it("clears the acknowledgement form once the refetched document carries a new revision, and the next attempt gets a fresh key", async () => {
    vi.mocked(getDocument).mockResolvedValue(policyDetail());
    page(true);
    await screen.findByRole("button", { name: "Acknowledge policy" });
    const sign = () => {
      fireEvent.click(screen.getByRole("checkbox", { name: intent }));
      fireEvent.change(screen.getByLabelText("Type your full name"), {
        target: { value: "Test Employee" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Acknowledge policy" }),
      );
    };
    // The server would also attach evidence; leaving it out keeps the form on
    // screen, so only the remount can explain the emptied name.
    const after = policyDetail();
    after.obligation.revision = 2;
    vi.mocked(getDocument).mockResolvedValue(after);
    sign();
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: intent })).toHaveProperty(
        "checked",
        false,
      ),
    );
    expect(screen.queryByLabelText("Type your full name")).toBeNull();
    const again = policyDetail();
    again.obligation.revision = 3;
    vi.mocked(getDocument).mockResolvedValue(again);
    sign();
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: intent })).toHaveProperty(
        "checked",
        false,
      ),
    );
    const [first, second] = vi
      .mocked(acknowledgeDocument)
      .mock.calls.map((call) => call[2]);
    expect(second).toMatchObject({ revision: 2 });
    expect(second!.idempotency_key).not.toBe(first!.idempotency_key);
  });
  it("withdraws an acknowledgement when evidence exists and the policy allows it", async () => {
    const doc = policyDetail(evidence);
    doc.policy!.can_withdraw = true;
    vi.mocked(getDocument).mockResolvedValue(doc);
    const { invalidate } = page(true);
    await screen.findByText(/Acknowledged by Test Employee on/);
    expect(
      screen.queryByRole("button", { name: "Acknowledge policy" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Withdraw acknowledgement" }),
    );
    await waitFor(() =>
      expect(withdrawDocumentAcknowledgement).toHaveBeenCalledWith(
        employee,
        "requirement",
        1,
      ),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  it.each<[string, boolean, boolean, boolean]>([
    ["the policy forbids it", true, false, true],
    ["nothing has been acknowledged", false, true, true],
    ["the viewer is a manager", true, true, false],
  ])("hides Withdraw when %s", async (_, acknowledged, canWithdraw, selfOnly) => {
    const doc = policyDetail(acknowledged ? evidence : null);
    doc.policy!.can_withdraw = canWithdraw;
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(selfOnly);
    await screen.findByText("Be kind.");
    expect(
      screen.queryByRole("button", { name: "Withdraw acknowledgement" }),
    ).toBeNull();
  });
  it.each<[string, DocumentDetail["initial_deferral"], boolean]>([
    ["the detail carries none", undefined, false],
    ["it is not allowed", { allowed: false, reason: null }, false],
    ["publication is paused", { allowed: true, reason: null }, true],
  ])("hides the initial deferral when %s", async (_, deferral, paused) => {
    const doc = missing();
    doc.initial_deferral = deferral;
    doc.obligation.publication_paused = paused;
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(true);
    await screen.findByRole("heading", { name: "Safety certificate" });
    expect(
      screen.queryByRole("group", { name: "Provide this document later" }),
    ).toBeNull();
  });
  it("saves a deferral reason only once it is non-blank and changed", async () => {
    const doc = missing();
    doc.initial_deferral = { allowed: true, reason: "Waiting for the embassy" };
    vi.mocked(getDocument).mockResolvedValue(doc);
    const { invalidate } = page(true);
    const group = await screen.findByRole("group", {
      name: "Provide this document later",
    });
    const save = within(group).getByRole("button", { name: "Save reason" });
    const reason = within(group).getByLabelText("Reason");
    expect(reason).toHaveProperty("value", "Waiting for the embassy");
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(reason, { target: { value: "   " } });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(reason, { target: { value: "Waiting for the embassy" } });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(reason, {
      target: { value: "Embassy appointment moved to October" },
    });
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);
    await waitFor(() =>
      expect(deferInitialDocument).toHaveBeenCalledWith(
        employee,
        "requirement",
        { revision: 1, reason: "Embassy appointment moved to October" },
      ),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  it("removes a file only from a draft version", async () => {
    const doc = withDraft();
    doc.obligation.status = "rejected";
    doc.submissions[0]!.version = 2;
    doc.submissions.unshift({
      ...detail().submissions[0]!,
      id: "rejected",
      state: "rejected",
      files: [
        { ...detail().submissions[0]!.files[0]!, id: "old", filename: "old.pdf" },
      ],
    });
    vi.mocked(getDocument).mockResolvedValue(doc);
    const { invalidate } = page(true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove certificate.pdf" }),
    );
    expect(screen.queryByRole("button", { name: "Remove old.pdf" })).toBeNull();
    await waitFor(() =>
      expect(removeDocumentDraftFile).toHaveBeenCalledWith(
        employee,
        "requirement",
        { revision: 1, submission_id: "submission", file_id: "file" },
      ),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  it("never offers to remove a draft file on the manager's surface", async () => {
    vi.mocked(getDocument).mockResolvedValue(withDraft());
    page();
    // A draft is the person's own until it is sent: the manager reads that nothing was sent, in Details and in
    // History, and is never offered its files.
    expect(await screen.findByText("Nothing sent yet")).toBeTruthy();
    expect(screen.queryByText("certificate.pdf")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText("Nothing has happened to this document yet.")).toBeTruthy();
    expect(screen.queryByText("certificate.pdf")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Remove certificate.pdf" }),
    ).toBeNull();
  });
  it("submits the draft with its expiry date and extra fields", async () => {
    const doc = withDraft();
    doc.obligation.tracks_expiry = true;
    doc.obligation.settings.extra_fields = [
      { key: "license_number", label: "License number", kind: "text", required: true },
      { key: "hours", label: "Training hours", kind: "number", required: false },
    ];
    vi.mocked(getDocument).mockResolvedValue(doc);
    const { invalidate } = page(true);
    const submit = await screen.findByRole("button", {
      name: "Submit document",
    });
    fireEvent.change(screen.getByLabelText("Expiration date (required)"), {
      target: { value: "2027-03-31" },
    });
    fireEvent.change(screen.getByLabelText("License number (required)"), {
      target: { value: "A-123" },
    });
    fireEvent.change(screen.getByLabelText("Training hours"), {
      target: { value: "8" },
    });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(submitDocument).toHaveBeenCalledWith(employee, "requirement", {
        revision: 1,
        submission_id: "submission",
        expiry_date: "2027-03-31",
        // Number fields travel as the typed string; nothing converts them.
        metadata: { license_number: "A-123", hours: "8" },
      }),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  it("submits a null expiry date when none is typed, and refreshes only once it succeeds", async () => {
    vi.mocked(getDocument).mockResolvedValue(withDraft());
    vi.mocked(submitDocument)
      .mockRejectedValueOnce(new Error("Submit unavailable"))
      .mockResolvedValue(undefined);
    const { invalidate } = page(true);

    const submit = await screen.findByRole("button", {
      name: "Submit document",
    });
    fireEvent.click(submit);
    await screen.findByText("Submit unavailable");
    // A failed mutation must not tell the rest of the app the document moved.
    expect(invalidate).not.toHaveBeenCalled();

    fireEvent.click(submit);
    await waitFor(() =>
      expect(submitDocument).toHaveBeenCalledWith(employee, "requirement", {
        revision: 1,
        submission_id: "submission",
        expiry_date: null,
        metadata: {},
      }),
    );
    expectRefreshed(invalidate);
  });
  it("keeps Submit disabled while the draft has no kept file", async () => {
    const doc = withDraft();
    doc.submissions[0]!.files[0]!.decision = "discard";
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(true);
    expect(
      await screen.findByRole("button", { name: "Submit document" }),
    ).toHaveProperty("disabled", true);
  });
  it("retries a failed upload with the same file, accepts the jpeg extensions and clears the picker after a pick", async () => {
    const doc = withDraft();
    doc.obligation.accepted_formats = ["pdf", "jpeg"];
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(uploadDocument)
      .mockRejectedValueOnce(new Error("Upload unavailable"))
      .mockResolvedValue({});
    const { invalidate } = page(true);
    const input = await screen.findByLabelText("Upload document");
    expect(input.getAttribute("accept")).toBe(".pdf,.jpg,.jpeg");
    expect(screen.getByText(/PDF, JPEG, up to 10 MiB/)).toBeTruthy();
    // jsdom never sets a fakepath on a file input, so a plain property stands
    // in for the browser-held selection the drawer must clear after the pick.
    Object.defineProperty(input, "value", {
      configurable: true,
      writable: true,
      value: "C:\\fakepath\\replacement.jpg",
    });
    const file = new File(["jpg"], "replacement.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(input).toHaveProperty("value", "");
    await screen.findByText(/replacement\.jpg could not be uploaded/);
    await screen.findByText("Upload unavailable");
    expect(invalidate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    await waitFor(() =>
      expect(uploadDocument).toHaveBeenNthCalledWith(
        2,
        employee,
        "requirement",
        1,
        file,
      ),
    );
    const calls = vi.mocked(uploadDocument).mock.calls;
    expect(calls[1]![3]).toBe(calls[0]![3]);
    await waitFor(() => {
      expectRefreshed(invalidate);
      expect(screen.queryByText(/could not be uploaded/)).toBeNull();
      expect(screen.queryByText("Upload unavailable")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Submit document" }),
      ).toHaveProperty("disabled", false);
    });
  });
  it("drops a failed upload and its error without touching the server", async () => {
    vi.mocked(getDocument).mockResolvedValue(withDraft());
    vi.mocked(uploadDocument).mockRejectedValue(new Error("Upload unavailable"));
    const { invalidate } = page(true);
    fireEvent.change(await screen.findByLabelText("Upload document"), {
      target: {
        files: [
          new File(["pdf"], "replacement.pdf", { type: "application/pdf" }),
        ],
      },
    });
    await screen.findByText("Upload unavailable");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove failed upload" }),
    );
    expect(screen.queryByText(/could not be uploaded/)).toBeNull();
    await waitFor(() =>
      expect(screen.queryByText("Upload unavailable")).toBeNull(),
    );
    expect(uploadDocument).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
  });
  it.each(closed)(
    "hides upload and submit from the employee when the document is %s",
    async (status) => {
      const doc = withDraft();
      doc.obligation.status = status;
      vi.mocked(getDocument).mockResolvedValue(doc);
      page(true);
      await screen.findByText("certificate.pdf");
      expect(screen.queryByLabelText("Upload document")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Submit document" }),
      ).toBeNull();
      // The draft's own Remove button is not behind this gate today.
      expect(
        screen.getByRole("button", { name: "Remove certificate.pdf" }),
      ).toBeTruthy();
    },
  );
  it.each(closed)(
    "hides the acknowledgement form from the employee when the policy is %s",
    async (status) => {
      const doc = policyDetail();
      doc.obligation.status = status;
      vi.mocked(getDocument).mockResolvedValue(doc);
      page(true);
      await screen.findByText("Be kind.");
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Acknowledge policy" }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: "Download policy copy" }),
      ).toBeTruthy();
    },
  );

  // BL-118 / D5: the owner is never asked, but may keep a copy on file.
  function excused(doc: DocumentDetail) {
    doc.obligation.status = "exempt";
    doc.obligation.exemption_locked = true;
    doc.obligation.mode = "optional";
    return doc;
  }
  it("lets the owner upload to their excused document and says it needs no review", async () => {
    vi.mocked(getDocument).mockResolvedValue(excused(missing()));
    page(true);
    const picker = await screen.findByLabelText("Upload document");
    expect(
      screen.getByText("Optional for you; what you submit goes on file without review."),
    ).toBeTruthy();
    const file = new File(["pdf"], "food-handler.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(picker, { target: { files: [file] } });
    await waitFor(() =>
      expect(uploadDocument).toHaveBeenCalledWith(
        employee,
        "requirement",
        1,
        file,
      ),
    );
  });
  it("lets the owner submit the draft of their excused document", async () => {
    vi.mocked(getDocument).mockResolvedValue(excused(withDraft()));
    page(true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Submit document" }),
    );
    await waitFor(() => expect(submitDocument).toHaveBeenCalledOnce());
  });
  it("reads on file once the owner's copy is accepted, and still takes a newer one", async () => {
    const doc = excused(detail());
    doc.obligation.submitted_id = "submission";
    doc.obligation.approved_id = "submission";
    doc.submissions[0]!.state = "accepted";
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(true);
    expect(await screen.findByText("On file")).toBeTruthy();
    expect(screen.queryByText("Exempt")).toBeNull();
    expect(screen.getByLabelText("Upload document")).toBeTruthy();
  });
});

// S2: a reviewer who cannot decide gets the row as its approved copy, or as
// missing, with the unreviewed upload, its reason and its file left out.
describe("a row whose unreviewed upload is hidden", () => {
  it("shows the approved copy and nothing to decide", async () => {
    const doc = detail();
    doc.obligation.status = "completed";
    doc.obligation.submitted_id = null;
    doc.obligation.approved_id = "submission";
    doc.obligation.remaining_seconds = null;
    doc.submissions[0]!.state = "accepted";
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    const files = await screen.findByRole("region", { name: "Files" });
    expect(within(files).getByText("Version 1")).toBeTruthy();
    expect(within(files).getByText("Approved", { selector: ".rd-chip" }).className).toBe("rd-chip ok");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    // Nothing under review here, so nothing to review again.
    expect(screen.queryByRole("button", { name: "Review again" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/null|undefined/);
  });
  it("shows a never-approved row as missing, with no reason and no version", async () => {
    const doc = missing();
    doc.obligation.remaining_seconds = null;
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    expect(await screen.findByText("Missing")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Files" })).getByText("Nothing sent yet")).toBeTruthy();
    expect(screen.queryByText(/^Version \d/)).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.body.textContent).not.toMatch(/null|undefined/);
  });
});

it("says in one sentence when the document is not theirs to open", async () => {
  vi.mocked(getDocument).mockRejectedValue(
    new RequestError("Not allowed", "authz.out_of_scope", undefined, 404),
  );
  page();
  expect(
    await screen.findByText("You don't have access to this document."),
  ).toBeTruthy();
  expect(screen.queryByText("Not allowed")).toBeNull();
});

// U59: the expiry date and the extra fields are stored nowhere until Submit,
// and uploading, removing a file or deferring each bump the revision first.
describe("typed draft fields", () => {
  beforeEach(() => {
    vi.mocked(deferInitialDocument).mockResolvedValue({});
    vi.mocked(removeDocumentDraftFile).mockResolvedValue({});
    vi.mocked(submitDocument).mockResolvedValue({});
    vi.mocked(uploadDocument).mockResolvedValue({});
  });
  const back = {
    ...detail().submissions[0]!.files[0]!,
    id: "back",
    filename: "back.pdf",
  };
  function licensed(revision = 1) {
    const doc = withDraft();
    doc.obligation.revision = revision;
    doc.obligation.tracks_expiry = true;
    doc.obligation.settings.extra_fields = [
      { key: "license_number", label: "License number", kind: "text", required: true },
    ];
    doc.initial_deferral = { allowed: true, reason: null };
    return doc;
  }
  // A correction draft opens with what the rejected version carried.
  function correction(revision = 1) {
    const doc = licensed(revision);
    doc.submissions[0]!.id = "correction";
    doc.submissions[0]!.expiry_date = "2026-12-31";
    doc.submissions[0]!.metadata = { license_number: "B-9" };
    return doc;
  }
  const fields = () => ({
    expiry: (
      screen.getByLabelText("Expiration date (required)") as HTMLInputElement
    ).value,
    license: (
      screen.getByLabelText("License number (required)") as HTMLInputElement
    ).value,
  });
  const typed = { expiry: "2027-03-31", license: "A-123" };
  async function type() {
    await screen.findByRole("button", { name: "Submit document" });
    fireEvent.change(screen.getByLabelText("Expiration date (required)"), {
      target: { value: typed.expiry },
    });
    fireEvent.change(screen.getByLabelText("License number (required)"), {
      target: { value: typed.license },
    });
  }
  const pick = () =>
    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: {
        files: [new File(["pdf"], "back.pdf", { type: "application/pdf" })],
      },
    });
  const close = () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Close document details" }),
    );

  it("keeps them through a second upload and submits them with the new revision", async () => {
    vi.mocked(getDocument).mockResolvedValue(licensed());
    page(true);
    await type();
    const after = licensed(2);
    after.submissions[0]!.files.push(back);
    vi.mocked(getDocument).mockResolvedValue(after);
    pick();
    await screen.findByRole("button", { name: "back.pdf" });
    expect(fields()).toEqual(typed);
    fireEvent.click(screen.getByRole("button", { name: "Submit document" }));
    await waitFor(() =>
      expect(submitDocument).toHaveBeenCalledWith(employee, "requirement", {
        revision: 2,
        submission_id: "submission",
        expiry_date: "2027-03-31",
        metadata: { license_number: "A-123" },
      }),
    );
  });
  it("keeps them when a draft file is removed", async () => {
    const before = licensed();
    before.submissions[0]!.files.push(back);
    vi.mocked(getDocument).mockResolvedValue(before);
    page(true);
    await type();
    vi.mocked(getDocument).mockResolvedValue(licensed(2));
    fireEvent.click(screen.getByRole("button", { name: "Remove back.pdf" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "back.pdf" })).toBeNull(),
    );
    expect(fields()).toEqual(typed);
  });
  it("keeps them when the deferral reason is saved", async () => {
    vi.mocked(getDocument).mockResolvedValue(licensed());
    page(true);
    await type();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Embassy appointment moved" },
    });
    const after = licensed(2);
    after.initial_deferral = { allowed: true, reason: "Embassy appointment moved" };
    vi.mocked(getDocument).mockResolvedValue(after);
    fireEvent.click(screen.getByRole("button", { name: "Save reason" }));
    // Save is off because the reason is now the saved one, while Submit is
    // back on: only the rebuilt content shows both.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save reason" }),
      ).toHaveProperty("disabled", true);
      expect(
        screen.getByRole("button", { name: "Submit document" }),
      ).toHaveProperty("disabled", false);
    });
    expect(fields()).toEqual(typed);
  });
  it("still asks before closing once a command has gone through", async () => {
    vi.mocked(getDocument).mockResolvedValue(licensed());
    const { onClose } = page(true);
    await type();
    const after = licensed(2);
    after.submissions[0]!.files.push(back);
    vi.mocked(getDocument).mockResolvedValue(after);
    pick();
    await screen.findByRole("button", { name: "back.pdf" });
    close();
    expect(await screen.findByText("Discard unsaved changes?")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
  it("keeps them when the upload fails", async () => {
    vi.mocked(getDocument).mockResolvedValue(licensed());
    vi.mocked(uploadDocument).mockRejectedValue(new Error("Upload unavailable"));
    page(true);
    await type();
    pick();
    await screen.findByText("Upload unavailable");
    expect(fields()).toEqual(typed);
  });
  it("shows the draft's saved values while nothing is typed, across a command", async () => {
    vi.mocked(getDocument).mockResolvedValue(correction());
    const { onClose } = page(true);
    await screen.findByRole("button", { name: "Submit document" });
    const saved = { expiry: "2026-12-31", license: "B-9" };
    expect(fields()).toEqual(saved);
    const after = correction(2);
    after.submissions[0]!.files.push(back);
    vi.mocked(getDocument).mockResolvedValue(after);
    pick();
    await screen.findByRole("button", { name: "back.pdf" });
    expect(fields()).toEqual(saved);
    close();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("drops them when the document comes back with another draft", async () => {
    vi.mocked(getDocument).mockResolvedValue(licensed());
    const { cache, onClose } = page(true);
    await type();
    // Submitted in another tab, rejected, reopened as a correction draft.
    vi.mocked(getDocument).mockResolvedValue(correction(2));
    await cache.invalidateQueries();
    await waitFor(() =>
      expect(fields()).toEqual({ expiry: "2026-12-31", license: "B-9" }),
    );
    close();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("drops them when the drawer moves to another document and back", async () => {
    const other = correction();
    other.obligation.id = "other";
    vi.mocked(getDocument).mockImplementation(async (_audience, id) =>
      id === "other" ? other : licensed(),
    );
    const { show } = page(true);
    await type();
    show("other");
    await waitFor(() =>
      expect(fields()).toEqual({ expiry: "2026-12-31", license: "B-9" }),
    );
    show("requirement");
    await waitFor(() => expect(fields()).toEqual({ expiry: "", license: "" }));
  });
});

// U60: the three commands no test reached. Two are the manager's alone.
describe("download, document time zone and deadline extension", () => {
  const manager = { workspaceId: "workspace", selfOnly: false };
  it("downloads a file by its version and file, and refreshes nothing", async () => {
    const doc = detail();
    doc.submissions[0]!.files.push({
      ...doc.submissions[0]!.files[0]!,
      id: "discarded",
      filename: "blurry.pdf",
      decision: "discard",
    });
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(downloadDocument)
      .mockRejectedValueOnce(new Error("Link unavailable"))
      .mockResolvedValue(undefined);
    const { invalidate } = page();
    const file = await screen.findByRole("button", { name: "certificate.pdf" });
    // A discarded file is listed but no longer handed out.
    expect(screen.getByRole("button", { name: "blurry.pdf" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(file);
    await screen.findByText("Link unavailable");
    fireEvent.click(file);
    await waitFor(() => expect(downloadDocument).toHaveBeenCalledTimes(2));
    expect(downloadDocument).toHaveBeenLastCalledWith(
      manager,
      "requirement",
      "submission",
      "file",
    );
    expect(invalidate).not.toHaveBeenCalled();
  });
  // K1 fix pass: a disabled button drops its focus to the page, and inside the Employee drawer Escape then closes
  // both drawers. While a file opens, its button stays focusable, says it is busy, and opens nothing more.
  it("keeps a file's button in reach while the file opens, and opens it once", async () => {
    let opened: () => void = () => undefined;
    vi.mocked(downloadDocument).mockReturnValue(new Promise<void>((resolve) => (opened = resolve)));
    page();
    const file = await screen.findByRole("button", { name: "certificate.pdf" });
    file.focus();
    fireEvent.click(file);
    await waitFor(() => expect(file.getAttribute("aria-disabled")).toBe("true"));
    expect(file).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(file);
    fireEvent.click(file);
    expect(downloadDocument).toHaveBeenCalledOnce();
    opened();
    await waitFor(() => expect(file.getAttribute("aria-disabled")).toBeNull());
  });
  it("keeps a History file's button in reach while it opens", async () => {
    const doc = detail();
    doc.history = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        action: "document.submitted",
        occurred_at: "2026-09-15T12:00:00Z",
        metadata: { submission_id: "submission" },
      },
    ];
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(downloadDocument).mockReturnValue(new Promise<void>(() => undefined));
    page();
    fireEvent.click(await screen.findByRole("tab", { name: "History" }));
    const file = within(screen.getByRole("list", { name: "History" })).getByRole("button", { name: "certificate.pdf" });
    fireEvent.click(file);
    await waitFor(() => expect(file.getAttribute("aria-disabled")).toBe("true"));
    expect(file).toHaveProperty("disabled", false);
    fireEvent.click(file);
    expect(downloadDocument).toHaveBeenCalledOnce();
  });
  it("saves a changed document time zone against the employee's revision, then refreshes", async () => {
    const doc = detail();
    doc.timezone_settings = {
      value: "America/Chicago",
      configured_value: "America/Chicago",
      employee_revision: 4,
      can_manage: true,
    };
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(setDocumentTimezone).mockResolvedValue({});
    const { invalidate } = page();
    const save = await screen.findByRole("button", {
      name: "Save document time zone",
    });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), {
      target: { value: "America/Denver" },
    });
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);
    await waitFor(() =>
      expect(setDocumentTimezone).toHaveBeenCalledWith(manager, "requirement", {
        employee_revision: 4,
        timezone: "America/Denver",
      }),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  // K1 fix pass: the time zone's Save turns itself off once saved (and while saving), which drops focus to the page;
  // focus goes back to the time zone choice.
  it("gives focus back to the time zone choice once it is saved", async () => {
    const doc = detail();
    doc.timezone_settings = {
      value: "America/Chicago",
      configured_value: "America/Chicago",
      employee_revision: 4,
      can_manage: true,
    };
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(setDocumentTimezone).mockResolvedValue({});
    page();
    const save = await screen.findByRole("button", { name: "Save document time zone" });
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), { target: { value: "America/Denver" } });
    const saved = detail();
    saved.obligation.revision = 2;
    saved.timezone_settings = { ...doc.timezone_settings, configured_value: "America/Denver", value: "America/Denver" };
    vi.mocked(getDocument).mockResolvedValue(saved);
    save.focus();
    fireEvent.click(save);
    await waitFor(() => expect(setDocumentTimezone).toHaveBeenCalledOnce());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Time zone" })));
  });
  // BL-828: someone changed the person's record first; the document revision
  // is the same, the person's is newer. The drawer reloads and says so.
  it("says the document changed when the person's record moved on before a time zone save", async () => {
    const doc = detail();
    doc.timezone_settings = {
      value: "America/Chicago",
      configured_value: "America/Chicago",
      employee_revision: 4,
      can_manage: true,
    };
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(setDocumentTimezone).mockRejectedValueOnce(
      new RequestError("employee changed; refresh required", "employee.revision_conflict", undefined, 409),
    );
    page();
    fireEvent.change(await screen.findByRole("combobox", { name: "Time zone" }), {
      target: { value: "America/Denver" },
    });
    const later = detail();
    later.timezone_settings = { ...doc.timezone_settings, employee_revision: 5 };
    vi.mocked(getDocument).mockResolvedValue(later);
    fireEvent.click(screen.getByRole("button", { name: "Save document time zone" }));

    expect(
      await screen.findByText("This document changed. You're seeing the latest version."),
    ).toBeTruthy();
    expect(screen.queryByText("employee changed; refresh required")).toBeNull();
  });
  it("hides the document time zone from whoever cannot manage it", async () => {
    const doc = detail();
    doc.timezone_settings = {
      value: null,
      configured_value: null,
      employee_revision: 4,
      can_manage: false,
    };
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    await screen.findByText("certificate.pdf");
    expect(
      screen.queryByRole("button", { name: "Save document time zone" }),
    ).toBeNull();
  });
  it("extends the deadline with the days and reason typed, then refreshes", async () => {
    const doc = missing();
    doc.obligation.deadline_at = new Date(Date.now() + 86_400_000).toISOString();
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(extendDocumentDeadline).mockResolvedValue({});
    const time = clock();
    try {
      const { invalidate } = page();
      fireEvent.click(await screen.findByRole("button", { name: /^Extend deadline/ }));
      time.tick(450);
      // The days and a reason are required; nothing is picked at first.
      expect(save().getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "Other" }));
      fireEvent.change(screen.getByLabelText("Days to add"), {
        target: { value: "5" },
      });
      expect(save().getAttribute("aria-disabled")).toBe("true");
      fireEvent.change(screen.getByLabelText("Reason"), {
        target: { value: "Clinic closed this week" },
      });
      expect(save().getAttribute("aria-disabled")).toBeNull();
      fireEvent.click(save());
      await waitFor(() =>
        expect(extendDocumentDeadline).toHaveBeenCalledWith(
          manager,
          "requirement",
          { revision: 1, additional_days: 5, reason: "Clinic closed this week" },
        ),
      );
      await waitFor(() => expectRefreshed(invalidate));
    } finally {
      time.restore();
    }
  });
  // K1 decision 1: Extend only where today's drawer offers it. Each case keeps a deadline ahead, so only the named
  // condition hides it; Excuse stays wherever the document is not excused already.
  it.each<[string, (doc: DocumentDetail) => void, boolean, boolean]>([
    ["the deadline has passed", (doc) => {
      doc.obligation.deadline_at = "2020-01-01T00:00:00Z";
    }, false, true],
    ["there is no deadline", (doc) => {
      doc.obligation.deadline_at = null;
    }, false, true],
    ["the document is waiting for review", (doc) => {
      doc.obligation.status = "pending_review";
    }, false, true],
    ["the document is optional", (doc) => {
      doc.obligation.mode = "optional";
    }, false, true],
    ["the person is suspended", (doc) => {
      doc.obligation.suspended = true;
    }, false, true],
    ["the document is completed", (doc) => {
      doc.obligation.status = "completed";
    }, false, true],
    ["the document is excused", (doc) => {
      doc.obligation.status = "exempt";
    }, false, false],
    ["the document's changes are paused", (doc) => {
      doc.obligation.status = "paused";
    }, false, true],
    ["the document is no longer asked", (doc) => {
      doc.obligation.status = "removed";
    }, false, true],
    ["the viewer is the employee", () => undefined, true, false],
  ])("offers no deadline extension when %s", async (_, change, selfOnly, excuse) => {
    const doc = missing();
    doc.obligation.deadline_at = new Date(Date.now() + 86_400_000).toISOString();
    change(doc);
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(selfOnly);
    await screen.findByRole("dialog", { name: /Safety certificate/ });
    await screen.findByText(selfOnly ? "Upload a new version" : "Name");
    expect(screen.queryByRole("button", { name: /^Extend deadline/ })).toBeNull();
    if (!selfOnly) expect(screen.queryByRole("button", { name: /^Excuse Test/ }) !== null).toBe(excuse);
  });
  it("offers a deadline extension on an owed document with a deadline ahead", async () => {
    const doc = missing();
    doc.obligation.deadline_at = new Date(Date.now() + 86_400_000).toISOString();
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    expect(await screen.findByRole("button", { name: /^Extend deadline/ })).toBeTruthy();
  });
});

// BL-467: everything else typed into the drawer survives a new revision the
// same way (another command, someone else's change), until its own command
// uses it or the thing it was typed for is replaced.
describe("typed fields beyond the draft", () => {
  const manager = { workspaceId: "workspace", selfOnly: false };
  const value = (label: string) =>
    (screen.getByLabelText(label) as HTMLInputElement).value;
  let base: () => DocumentDetail = detail;
  // Someone else's change: the same document comes back one revision later.
  async function bump(
    cache: QueryClient,
    change: (doc: DocumentDetail) => void,
  ) {
    const calls = vi.mocked(getDocument).mock.calls.length;
    vi.mocked(getDocument).mockImplementation(async () => {
      const doc = base();
      doc.obligation.revision = 2;
      change(doc);
      return doc;
    });
    await cache.invalidateQueries();
    await waitFor(() =>
      expect(vi.mocked(getDocument).mock.calls.length).toBeGreaterThan(calls),
    );
  }
  const close = () =>
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));

  it("keeps the file choices, their reasons and the time chosen through a new revision and a close, sending nothing until Save", async () => {
    base = () => {
      const doc = detail();
      doc.obligation.remaining_seconds = 3600;
      return doc;
    };
    vi.mocked(getDocument).mockResolvedValue(base());
    const { cache, onClose, reopen } = page(false, { sitting: createReviewSitting() });
    await decide("certificate.pdf", "Reject");
    fireEvent.change(why("certificate.pdf"), { target: { value: "Unreadable" } });
    fireEvent.click(screen.getByRole("button", { name: "What's left (less than a day)" }));
    const typed = () => ({
      reject: screen.getByRole("button", { name: "Reject" }).getAttribute("aria-pressed"),
      reason: why("certificate.pdf").value,
      left: screen.getByRole("button", { name: "What's left (less than a day)" }).getAttribute("aria-pressed"),
    });
    const kept = { reject: "true", reason: "Unreadable", left: "true" };
    await bump(cache, () => undefined);
    await waitFor(() => expect(typed()).toEqual(kept));
    // K1 decision 5: closing asks nothing and sends nothing; the draft waits with its document.
    close();
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(reviewDocument).not.toHaveBeenCalled();
    reopen();
    await waitFor(() => expect(typed()).toEqual(kept));
    expect(reviewDocument).not.toHaveBeenCalled();
    fireEvent.click(save());
    await waitFor(() =>
      expect(reviewDocument).toHaveBeenCalledWith(manager, "requirement", {
        revision: 2,
        submission_id: "submission",
        decision: "reject",
        reason: "Unreadable.",
        correction_period: "remaining",
        files: [{ id: "file", decision: "discard", note: "Unreadable" }],
      }),
    );
  });
  it("drops the review typed for a version once another version is under review", async () => {
    base = detail;
    vi.mocked(getDocument).mockResolvedValue(base());
    const { cache } = page();
    await decide("certificate.pdf", "Reject");
    fireEvent.change(why("certificate.pdf"), { target: { value: "Unreadable" } });
    await bump(cache, (doc) => {
      doc.obligation.submitted_id = "resubmitted";
      doc.submissions[0]!.id = "resubmitted";
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reject" }).getAttribute("aria-pressed")).toBe("false"),
    );
    expect(screen.queryByLabelText("Why reject certificate.pdf? Test sees this")).toBeNull();
    expect(dockLine()).toBe("Approve or reject each file · 1 left");
  });
  it("keeps an unsaved deferral reason through an upload", async () => {
    base = () => {
      const doc = withDraft();
      doc.initial_deferral = { allowed: true, reason: null };
      return doc;
    };
    vi.mocked(getDocument).mockResolvedValue(base());
    vi.mocked(uploadDocument).mockResolvedValue({});
    page(true);
    fireEvent.change(await screen.findByLabelText("Reason"), {
      target: { value: "Embassy appointment moved" },
    });
    const after = base();
    after.obligation.revision = 2;
    after.submissions[0]!.files.push({
      ...after.submissions[0]!.files[0]!,
      id: "back",
      filename: "back.pdf",
    });
    vi.mocked(getDocument).mockResolvedValue(after);
    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: {
        files: [new File(["pdf"], "back.pdf", { type: "application/pdf" })],
      },
    });
    await screen.findByRole("button", { name: "back.pdf" });
    expect(value("Reason")).toBe("Embassy appointment moved");
  });
  it("keeps the extension typed through a time zone change, and clears it once the extension is saved", async () => {
    base = () => {
      const doc = missing();
      doc.obligation.deadline_at = new Date(Date.now() + 86_400_000).toISOString();
      doc.timezone_settings = {
        value: "America/Chicago",
        configured_value: "America/Chicago",
        employee_revision: 4,
        can_manage: true,
      };
      return doc;
    };
    vi.mocked(getDocument).mockResolvedValue(base());
    vi.mocked(setDocumentTimezone).mockResolvedValue({});
    vi.mocked(extendDocumentDeadline).mockResolvedValue({});
    const time = clock();
    try {
      const { cache, onClose } = page();
      fireEvent.click(await screen.findByRole("button", { name: /^Extend deadline/ }));
      fireEvent.click(screen.getByRole("button", { name: "Other" }));
      fireEvent.change(screen.getByLabelText("Days to add"), {
        target: { value: "5" },
      });
      fireEvent.change(screen.getByLabelText("Reason"), {
        target: { value: "Clinic closed this week" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), {
        target: { value: "America/Denver" },
      });
      // The time zone is its own command; the extension waits on screen.
      fireEvent.click(
        screen.getByRole("button", { name: "Save document time zone" }),
      );
      await waitFor(() => expect(setDocumentTimezone).toHaveBeenCalled());
      await bump(cache, (doc) => {
        doc.timezone_settings!.configured_value = "America/Denver";
        doc.timezone_settings!.employee_revision = 5;
      });
      await waitFor(() => expect(value("Days to add")).toBe("5"));
      expect(value("Reason")).toBe("Clinic closed this week");
      time.tick(450);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(extendDocumentDeadline).toHaveBeenCalledWith(
          manager,
          "requirement",
          { revision: 2, additional_days: 5, reason: "Clinic closed this week" },
        ),
      );
      // Used up: the panel closes, and opened again it starts afresh.
      await waitFor(() => expect(screen.queryByLabelText("Reason")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: /^Extend deadline/ }));
      expect(screen.getByRole("button", { name: "Other" }).getAttribute("aria-pressed")).toBe("false");
      expect(value("Reason")).toBe("");
      close();
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      time.restore();
    }
  });
  it("keeps a chosen document time zone through a new revision", async () => {
    base = () => {
      const doc = detail();
      doc.timezone_settings = {
        value: null,
        configured_value: null,
        employee_revision: 4,
        can_manage: true,
      };
      return doc;
    };
    vi.mocked(getDocument).mockResolvedValue(base());
    const { cache } = page();
    fireEvent.change(await screen.findByRole("combobox", { name: "Time zone" }), {
      target: { value: "America/Denver" },
    });
    await bump(cache, () => undefined);
    await waitFor(() =>
      expect(
        (screen.getByRole("combobox", { name: "Time zone" }) as HTMLSelectElement)
          .value,
      ).toBe("America/Denver"),
    );
  });
  it("keeps the ticked intent and typed name through a new revision of the same policy text", async () => {
    base = policyDetail;
    vi.mocked(getDocument).mockResolvedValue(base());
    const { cache } = page(true);
    fireEvent.click(await screen.findByRole("checkbox", { name: intent }));
    fireEvent.change(screen.getByLabelText("Type your full name"), {
      target: { value: "Test Employee" },
    });
    await bump(cache, () => undefined);
    await waitFor(() => expect(value("Type your full name")).toBe("Test Employee"));
    expect(screen.getByRole("checkbox", { name: intent })).toHaveProperty(
      "checked",
      true,
    );
  });
  it("drops the signature once the policy text itself changed", async () => {
    base = policyDetail;
    vi.mocked(getDocument).mockResolvedValue(base());
    const { cache } = page(true);
    fireEvent.click(await screen.findByRole("checkbox", { name: intent }));
    fireEvent.change(screen.getByLabelText("Type your full name"), {
      target: { value: "Test Employee" },
    });
    await bump(cache, (doc) => {
      doc.policy!.content_text = "Be kind, and be on time.";
      doc.policy!.content_digest = "b".repeat(64);
    });
    await screen.findByText("Be kind, and be on time.");
    expect(screen.getByRole("checkbox", { name: intent })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.queryByLabelText("Type your full name")).toBeNull();
  });
});

// Loading and error in the "B" look (Mert 2026-10-14).
it("outlines the document while it loads", async () => {
  vi.mocked(getDocument).mockReturnValueOnce(new Promise(() => {}));
  page();
  expect(await screen.findByText("Loading document")).toBeTruthy();
  expect(screen.queryByText("Loading document…")).toBeNull();
});

it("shows the load-error card with Try again, not the server's sentence", async () => {
  vi.mocked(getDocument)
    .mockRejectedValueOnce(new Error("Document service unavailable"))
    .mockResolvedValue(detail());
  page();
  expect(
    await screen.findByRole("heading", { level: 3, name: "We couldn't load this document" }),
  ).toBeTruthy();
  expect(screen.queryByText("Document service unavailable")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "We couldn't load this document" })).toBeNull(),
  );
  expect(screen.queryByText("Loading document")).toBeNull();
});

// A2 Tur 6, file buttons design a (Mert 23 Oct): the manager's drawer is one card that stays open while it walks
// the list: the strip (Previous / Next and the X), the person's head, Details · History, the facts. The files, the
// dock and More options are drawn in their own slots.
describe("manager review drawer", () => {
  const sam = () =>
    row({ id: "second", employee_id: "other", employee_name: "Sam Lee", title: "Food handler card" });
  function second(): DocumentDetail {
    const doc = detail();
    doc.obligation = { ...doc.obligation, ...sam(), submitted_id: "second-submission" };
    doc.submissions[0]!.id = "second-submission";
    return doc;
  }
  beforeEach(() => {
    vi.mocked(getDocument).mockImplementation(async (_audience, id) =>
      id === "second" ? second() : detail(),
    );
  });

  it("heads the drawer with the person, the status and the document, and gives the person's name the first focus", async () => {
    page();
    const dialog = await screen.findByRole("dialog", {
      name: "Test Employee · Safety certificate",
    });
    const name = within(dialog).getByRole("heading", {
      level: 2,
      name: "Test Employee Needs review",
    });
    expect(document.activeElement).toBe(name);
    expect(dialog.querySelector(".rd-kicker")?.textContent).toBe("Safety certificate");
    await waitFor(() =>
      expect(dialog.querySelector(".rd-sub")?.textContent).toMatch(/^Sent: Tue, Sep 15/),
    );
    const tile = dialog.querySelector(".docr-avatar")!;
    expect([tile.textContent, tile.getAttribute("aria-hidden")]).toEqual(["TE", "true"]);
  });

  // K1 decision 4.
  it.each([
    ["rejected", "Missing", "red"],
    ["exempt", "Excused", "grey"],
    ["pending_review", "Needs review", "warn"],
  ] as const)("reads a %s document as %s", async (status, label, tone) => {
    const doc = detail();
    doc.obligation.status = status;
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    const chip = await screen.findByText(label, { selector: ".rd-chip" });
    expect(chip.className).toBe(`rd-chip ${tone}`);
  });

  it("shows the person from the list while the document loads", async () => {
    vi.mocked(getDocument).mockReturnValue(new Promise(() => {}));
    page(false, { queue: [row()] });
    expect(
      screen.getByRole("dialog", { name: "Test Employee · Safety certificate" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Test Employee Needs review" }),
    ).toBeTruthy();
    expect(await screen.findByText("Loading document")).toBeTruthy();
  });

  // K1 decisions 6 and 7: the strip walks the list as it was shown, naming the neighbour.
  it("names each neighbour by its person, or by its document when it is the same person's", async () => {
    const ana = row({ id: "first", employee_id: "ana", employee_name: "Ana Ruiz", title: "I-9" });
    const own = row({ id: "own", title: "Food handler card" });
    const { onOpen } = page(false, { queue: [ana, row(), own] });
    await screen.findByRole("dialog", { name: "Test Employee · Safety certificate" });
    const strip = screen.getByRole("navigation", { name: "Documents in this list" });
    const previous = within(strip).getByRole("button", { name: "Previous: Ana Ruiz" });
    const next = within(strip).getByRole("button", { name: "Next: Food handler card" });
    expect(previous.getAttribute("title")).toBe("Previous: Ana Ruiz · I-9");
    expect(next.getAttribute("title")).toBe("Next: Food handler card");
    expect(within(strip).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(next);
    expect(onOpen).toHaveBeenLastCalledWith("own");
    fireEvent.click(previous);
    expect(onOpen).toHaveBeenLastCalledWith("first");
  });

  it("keeps Previous and Next in place at the ends, where they do nothing", async () => {
    const { onOpen } = page(false, { queue: [row()] });
    await screen.findByRole("dialog", { name: /Safety certificate/ });
    for (const name of ["Previous", "Next"]) {
      const end = screen.getByRole("button", { name });
      expect(end.getAttribute("aria-disabled")).toBe("true");
      expect(end.textContent).toBe(name);
      fireEvent.click(end);
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("stays one drawer when it moves, keeps focus on the pressed button and says where it landed", async () => {
    const { onOpen, show } = page(false, { queue: [row(), sam()] });
    const dialog = await screen.findByRole("dialog", {
      name: "Test Employee · Safety certificate",
    });
    const next = screen.getByRole("button", { name: "Next: Sam Lee" });
    next.focus();
    fireEvent.click(next);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("second");
    show("second");
    expect(
      await screen.findByRole("dialog", { name: "Sam Lee · Food handler card" }),
    ).toBe(dialog);
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute("aria-label")).toBe("Next");
    expect(screen.getByRole("button", { name: "Previous: Test Employee" })).toBeTruthy();
    await waitFor(() =>
      expect(dialog.querySelector("[aria-live='polite']")?.textContent).toBe(
        "Sam Lee · Food handler card",
      ),
    );
  });

  // A2 Tur 6: a move slides the person, the tabs and the body in from its side; the strip and the dock stay.
  it.each([
    [false, "requirement", "second", "translateX(24px)", 220],
    [false, "second", "requirement", "translateX(-24px)", 220],
    [true, "requirement", "second", undefined, 120],
  ] as const)(
    "slides a move in from its side (reduced motion %s, %s to %s)",
    async (calm, from, to, transform, duration) => {
      const animate = vi.fn();
      const original = HTMLElement.prototype.animate;
      HTMLElement.prototype.animate = animate as unknown as typeof original;
      const matchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: calm && query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
      try {
        const { show } = page(false, { queue: [row(), sam()] });
        show(from);
        await screen.findByRole("dialog", { name: from === "second" ? /Sam Lee/ : /Test Employee/ });
        animate.mockClear();
        show(to);
        await screen.findByRole("dialog", { name: to === "second" ? /Sam Lee/ : /Test Employee/ });
        const moved = animate.mock.contexts.map((el) => (el as HTMLElement).className);
        expect(moved).toEqual(["rd-head-row", "rd-tabs", "rd-body"]);
        for (const [frames, timing] of animate.mock.calls) {
          expect(frames[0]).toEqual(transform ? { opacity: 0.2, transform } : { opacity: 0.2 });
          expect(timing).toEqual({ duration, easing: "ease-out" });
        }
      } finally {
        HTMLElement.prototype.animate = original;
        window.matchMedia = matchMedia;
      }
    },
  );

  // A2 Tur 6: the second click of the double click that opened the drawer lands on the dim; it must not close it.
  it("ignores the dim for a moment after opening", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(10_000);
    try {
      const { onClose } = page();
      await screen.findByRole("dialog", { name: /Safety certificate/ });
      const dim = document.querySelector<HTMLElement>(".catalog-drawer-backdrop")!;
      now.mockReturnValue(10_300);
      fireEvent.pointerDown(dim);
      fireEvent.click(dim);
      expect(onClose).not.toHaveBeenCalled();
      now.mockReturnValue(10_600);
      fireEvent.pointerDown(dim);
      fireEvent.click(dim);
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      now.mockRestore();
    }
  });

  // K1 fix pass: on a phone the bottom card leaves only the top bar under the dim. Closed on the press, the dim is gone
  // before the tap's click, which then presses the workspace switcher (or an outer drawer's X) under it; the press
  // only arms the dim, and its click closes the drawer.
  it("closes on the dim's click, never on its press", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(10_000);
    try {
      const { onClose } = page();
      await screen.findByRole("dialog", { name: /Safety certificate/ });
      const dim = document.querySelector<HTMLElement>(".catalog-drawer-backdrop")!;
      now.mockReturnValue(10_600);
      fireEvent.pointerDown(dim);
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(dim);
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      now.mockRestore();
    }
  });

  // Today's view-only manager keeps reading: the strip and the facts, nothing to decide.
  it("shows a manager who may only read the document, with nothing to decide", async () => {
    page(false, { canReview: false, queue: [row(), sam()] });
    await screen.findByText("Test Employee", { selector: "dd" });
    expect(screen.getByRole("button", { name: "Next: Sam Lee" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByRole("group", { name: /^Approve or reject/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("region", { name: "More options" })).toBeNull();
  });

  it("closes from its X or Escape at once", async () => {
    const { onClose } = page();
    const dialog = await screen.findByRole("dialog", { name: /Safety certificate/ });
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // K1 decision 5: what was typed stays with its document while the drawer walks the list.
  it("keeps what was typed for a document when the drawer moves away and back", async () => {
    const { show } = page(false, { queue: [row(), sam()], sitting: createReviewSitting() });
    await decide("certificate.pdf", "Reject");
    fireEvent.change(why("certificate.pdf"), { target: { value: "Unreadable" } });
    show("second");
    await screen.findByRole("dialog", { name: "Sam Lee · Food handler card" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reject" }).getAttribute("aria-pressed")).toBe("false"),
    );
    expect(screen.queryByLabelText(/^Why reject/)).toBeNull();
    show("requirement");
    await waitFor(() => expect(why("certificate.pdf").value).toBe("Unreadable"));
    expect(screen.getByRole("button", { name: "Reject" }).getAttribute("aria-pressed")).toBe("true");
    expect(reviewDocument).not.toHaveBeenCalled();
  });

  it("holds the strip and the X while a decision is being saved", async () => {
    vi.mocked(reviewDocument).mockReturnValue(new Promise(() => {}));
    page(false, { queue: [row(), sam()] });
    await approveAndSave();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close details" })).toHaveProperty("disabled", true),
    );
    expect(screen.getByRole("button", { name: "Next: Sam Lee" })).toHaveProperty("disabled", true);
  });
  // Nothing closes the drawer while a decision is being saved: not Escape, not the dim.
  it("refuses Escape and the dim while a decision is being saved", async () => {
    const time = clock();
    try {
      vi.mocked(reviewDocument).mockReturnValue(new Promise(() => {}));
      const { onClose } = page(false, { queue: [row(), sam()] });
      const dialog = await screen.findByRole("dialog", { name: /Safety certificate/ });
      await approveAndSave();
      await waitFor(() => expect(green().getAttribute("aria-busy")).toBe("true"));
      fireEvent.keyDown(dialog, { key: "Escape" });
      time.tick(600);
      const dim = document.querySelector<HTMLElement>(".catalog-drawer-backdrop")!;
      fireEvent.pointerDown(dim);
      fireEvent.click(dim);
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      time.restore();
    }
  });

  it("has Details and History on a desktop, the files a section of Details", async () => {
    const doc = detail();
    doc.history = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        action: "document.submitted",
        occurred_at: "2026-09-15T12:00:00Z",
        metadata: { submission_id: "submission" },
      },
    ];
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    const tabs = await screen.findByRole("tablist", { name: "Document sections" });
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Details",
      "History",
    ]);
    const files = await screen.findByRole("region", { name: "Files" });
    expect(within(files).getByRole("button", { name: "certificate.pdf" })).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Test Employee", { selector: "dd" })).toBeTruthy();
    fireEvent.keyDown(within(tabs).getByRole("tab", { name: "Details" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "History" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("region", { name: "Files" })).toBeNull();
    expect(screen.getByText("Version 1 sent")).toBeTruthy();
  });

  // K1 decisions 16 and 17: a file opens as today's signed download (no inline preview), and the drawer never takes
  // the Requests page's class, whose CSS loads only with that page.
  it("draws no file preview and no Requests page class", async () => {
    const doc = detail();
    doc.submissions[0]!.files.push({ ...doc.submissions[0]!.files[0]!, id: "photo", filename: "front.jpg", media_type: "image/jpeg" });
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    await screen.findByRole("region", { name: "Files" });
    expect(document.querySelector(".requests-catalog-page, .rd img, .rd iframe, .rd object, .rd embed")).toBeNull();
  });

  it("keeps the restriction note of a suspended person in Details", async () => {
    const doc = detail();
    doc.obligation.suspended = true;
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    expect(
      await screen.findByText(
        "Workspace access is restricted until the outstanding requirements are completed.",
      ),
    ).toBeTruthy();
  });

  describe("on a phone", () => {
    const matchMedia = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        matches: query === "(max-width: 720px)",
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = matchMedia;
    });
    it("adds a Files tab named by its count, reached from a row in Details", async () => {
      page();
      const files = await screen.findByRole("tab", { name: "Files, 1 file" });
      expect(
        screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label") ?? tab.textContent),
      ).toEqual(["Details", "Files, 1 file", "History"]);
      expect(screen.queryByRole("button", { name: "Open certificate.pdf" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /^1 file to review/ }));
      expect(files.getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(files);
      expect(screen.getByRole("button", { name: "Open certificate.pdf" })).toBeTruthy();
    });
    // A pull on the card's head while a decision is being saved puts the card back instead of closing it.
    it("puts the card back when it is pulled while a decision is being saved", async () => {
      vi.mocked(reviewDocument).mockReturnValue(new Promise(() => {}));
      const { onClose } = page();
      fireEvent.click(await screen.findByRole("tab", { name: "Files, 1 file" }));
      await approveAndSave();
      await waitFor(() => expect(green().getAttribute("aria-busy")).toBe("true"));
      const head = document.querySelector(".rd-head")!;
      const at = (type: string, y: number) =>
        head.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y }));
      at("pointerdown", 100);
      at("pointermove", 300);
      at("pointerup", 300);
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(onClose).not.toHaveBeenCalled();
      expect(document.querySelector<HTMLElement>(".requests-review-drawer")!.style.transform).toBe("");
    });
    // K1 fix pass (mockup tur2-a2.js:294-296): an expired document has no Files tab; its last approved copy is in
    // Details, each file opening from its row.
    it("keeps an expired document's last approved copy in Details, with no Files tab", async () => {
      const doc = detail();
      doc.obligation.status = "expired";
      doc.obligation.approved_id = "submission";
      doc.obligation.expiry_date = "2026-10-14";
      doc.submissions[0]!.state = "accepted";
      doc.submissions[0]!.reviewed_at = "2024-10-11T18:00:00Z";
      vi.mocked(getDocument).mockResolvedValue(doc);
      page();
      const last = await screen.findByRole("region", { name: "Last approved" });
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Details", "History"]);
      expect(within(last).getByRole("button", { name: "Open certificate.pdf" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^1 file/ })).toBeNull();
      // The mockup's dates: the day it expired with its weekday, the day it was approved as a plain date.
      expect(document.querySelector(".docr-call b")?.textContent).toBe(
        `Expired on ${formatCalendarDay("2026-10-14", new Date())}`,
      );
      expect(within(last).getByText("PDF · 100 B · approved Oct 11, 2024")).toBeTruthy();
    });
    // The server hands out kept files only (23 Oct rule: refused means hidden): a rejected file shows no eye.
    it("shows the eye only on files that open", async () => {
      const doc = detail();
      doc.obligation.status = "rejected";
      doc.submissions[0]!.state = "rejected";
      doc.submissions[0]!.files = [
        { ...doc.submissions[0]!.files[0]!, decision: "discard", note: "Blurry" },
        { ...doc.submissions[0]!.files[0]!, id: "kept", filename: "front.pdf", decision: "keep" },
      ];
      vi.mocked(getDocument).mockResolvedValue(doc);
      page();
      fireEvent.click(await screen.findByRole("tab", { name: "Files, 2 files" }));
      const rejected = screen.getByRole("button", { name: "Open certificate.pdf · Rejected" });
      const kept = screen.getByRole("button", { name: "Open front.pdf · Kept" });
      expect(rejected.querySelector(".docr-file-eye")).toBeNull();
      expect(rejected.querySelector(".docr-file-noeye")).toBeTruthy();
      expect(kept.querySelector(".docr-file-eye")).toBeTruthy();
    });
  });

  // K1 fix pass (mockup tur2-a2.js:291-293): "Nothing sent yet" belongs to a document still owed, not to one excused.
  // (A missing one says it: "offers no card to excuse a policy to sign, and no options to a manager who may only read".)
  it("says nothing was sent only while the document is owed", async () => {
    const excused = detail();
    excused.obligation.status = "exempt";
    excused.obligation.submitted_id = null;
    excused.submissions = [];
    vi.mocked(getDocument).mockResolvedValue(excused);
    page();
    await screen.findByText("Test Employee", { selector: "dd" });
    expect(screen.queryByText("Nothing sent yet")).toBeNull();
    expect(screen.queryByRole("region", { name: "Files" })).toBeNull();
  });
});

// K1 decision 14: a decision in the drawer also refreshes the Employee drawer's onboarding card, which reads the
// onboarding under its own key.
it("refreshes the Employee drawer's onboarding review after a decision", async () => {
  const { invalidate } = page();
  await approveAndSave();
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["employee-onboarding-review", "workspace"],
    }),
  );
});
it("refreshes the Employee drawer's onboarding review after a deadline extension too", async () => {
  const doc = detail();
  doc.obligation.status = "missing";
  doc.obligation.submitted_id = null;
  doc.submissions = [];
  doc.obligation.deadline_at = new Date(Date.now() + 86_400_000).toISOString();
  vi.mocked(getDocument).mockResolvedValue(doc);
  vi.mocked(extendDocumentDeadline).mockResolvedValue({});
  const time = clock();
  try {
    const { invalidate } = page();
    fireEvent.click(await screen.findByRole("button", { name: /^Extend deadline/ }));
    fireEvent.click(screen.getByRole("button", { name: "+3 days" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Clinic closed" } });
    time.tick(450);
    fireEvent.click(save());
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["employee-onboarding-review", "workspace"],
      }),
    );
  } finally {
    time.restore();
  }
});

// A2 Tur 6, file buttons design a (K1 stage 2): each file of the version under review is approved or rejected on its
// own row; the dock holds one line and one green button. The rules stay today's (Mert 23 Oct).
describe("file decisions and the dock", () => {
  const sam = () =>
    row({ id: "second", employee_id: "other", employee_name: "Sam Lee", title: "Food handler card" });
  const back = {
    id: "back",
    filename: "back.pdf",
    media_type: "application/pdf",
    size_bytes: 2048,
    decision: "keep" as const,
    note: "",
  };
  function twoFiles(): DocumentDetail {
    const doc = detail();
    doc.submissions[0]!.files.push({ ...back });
    doc.obligation.remaining_seconds = 3 * 86_400 + 60;
    return doc;
  }
  const filesRegion = () => screen.getByRole("region", { name: "Files" });
  const chipOf = (file: string) =>
    screen
      .getAllByText(file)
      .map((name) => name.closest(".docr-file"))
      .find(Boolean)
      ?.querySelector(".rd-chip") ?? null;

  // K1 decision 13: a file stores "keep" until it is decided; that is no choice of the manager's.
  it("starts every file undecided, whatever it stores, with Save off and the line saying how many are left", async () => {
    vi.mocked(getDocument).mockResolvedValue(twoFiles());
    page();
    for (const file of ["certificate.pdf", "back.pdf"]) {
      const pair = await screen.findByRole("group", { name: `Approve or reject ${file}` });
      expect(
        within(pair)
          .getAllByRole("button")
          .map((button) => [button.textContent, button.getAttribute("aria-pressed")]),
      ).toEqual([
        ["Approve", "false"],
        ["Reject", "false"],
      ]);
    }
    expect(dockLine()).toBe("Approve or reject each file · 2 left");
    expect(save().getAttribute("aria-disabled")).toBe("true");
    expect(save().getAttribute("aria-describedby")).toBe(
      document.querySelector(".rd-foot .docr-note")!.id,
    );
    fireEvent.click(save());
    expect(reviewDocument).not.toHaveBeenCalled();
    // Each row: the file's name opens it, then its type and size.
    const name = within(filesRegion()).getByRole("button", { name: "back.pdf" });
    expect(name.getAttribute("title")).toBe("back.pdf");
    expect(within(filesRegion()).getByText("PDF · 2 KB")).toBeTruthy();
    expect(within(filesRegion()).getByText("Version 1")).toBeTruthy();
  });

  it("approves once every file is approved, saying until when it is on file", async () => {
    const doc = detail();
    doc.submissions[0]!.expiry_date = "2029-09-30";
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    await decide("certificate.pdf", "Approve");
    expect(dockLine()).toBe("Save approves it · On file until Sep 30, 2029");
    expect(save().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(save());
    await waitFor(() =>
      expect(reviewDocument).toHaveBeenCalledWith(expect.anything(), "requirement", {
        revision: 1,
        submission_id: "submission",
        decision: "approve",
        reason: "",
        correction_period: "full",
        files: [{ id: "file", decision: "keep", note: "" }],
      }),
    );
  });

  // K1 decision 10: the document's reason is made of the rejected files' reasons; each file keeps its own as its note.
  it("sends the document back with a quick reason, the time chosen and one reason made of the files'", async () => {
    vi.mocked(getDocument).mockResolvedValue(twoFiles());
    page();
    await decide("certificate.pdf", "Approve");
    await decide("back.pdf", "Reject");
    expect(dockLine()).toBe("Add a reason for each rejected file");
    expect(save().getAttribute("aria-disabled")).toBe("true");
    const reasons = screen.getByRole("group", { name: "Common reasons for back.pdf" });
    expect(within(reasons).getAllByRole("button").map((chip) => chip.textContent)).toEqual([
      "Blurry photo",
      "Wrong document",
      "Expired",
      "Name doesn't match",
      "A side is missing",
    ]);
    const input = why("back.pdf");
    expect([input.placeholder, input.maxLength, input.getAttribute("aria-required")]).toEqual([
      "Why? Test sees this",
      500,
      "true",
    ]);
    expect(input.getAttribute("aria-describedby")).toBe(document.querySelector(".rd-foot .docr-note")!.id);
    fireEvent.click(within(reasons).getByRole("button", { name: "Blurry photo" }));
    expect(input.value).toBe("Blurry photo.");
    expect(within(reasons).getByRole("button", { name: "Blurry photo" }).getAttribute("aria-pressed")).toBe("true");
    expect(dockLine()).toBe("Save sends it back to Test · 1 of 2 files rejected");
    const time = screen.getByRole("group", { name: "Time to send a new one" });
    expect(
      within(time)
        .getAllByRole("button")
        .map((choice) => [choice.textContent, choice.getAttribute("aria-pressed")]),
    ).toEqual([
      ["A new 7 days", "true"],
      ["What's left (3 days)", "false"],
    ]);
    fireEvent.click(within(time).getByRole("button", { name: "What's left (3 days)" }));
    fireEvent.click(within(time).getByRole("button", { name: "What's left (3 days)" }));
    expect(within(time).getByRole("button", { name: "What's left (3 days)" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(save());
    await waitFor(() =>
      expect(reviewDocument).toHaveBeenCalledWith(expect.anything(), "requirement", {
        revision: 1,
        submission_id: "submission",
        decision: "reject",
        reason: "back.pdf: Blurry photo.",
        correction_period: "remaining",
        files: [
          { id: "file", decision: "keep", note: "" },
          { id: "back", decision: "discard", note: "Blurry photo." },
        ],
      }),
    );
  });

  it("takes a file's reason away on Approve and brings it back on Reject", async () => {
    page();
    await decide("certificate.pdf", "Reject");
    fireEvent.change(why("certificate.pdf"), { target: { value: "Wrong card" } });
    expect(screen.getByRole("group", { name: "Time to send a new one" })).toBeTruthy();
    await decide("certificate.pdf", "Approve");
    expect(screen.queryByLabelText("Why reject certificate.pdf? Test sees this")).toBeNull();
    expect(screen.queryByRole("group", { name: "Time to send a new one" })).toBeNull();
    await decide("certificate.pdf", "Reject");
    expect(why("certificate.pdf").value).toBe("Wrong card");
  });

  // K1 decision 9: without a period of its own, "full" clears the deadline; it keeps today's words.
  it("words the full time as today when the document has no period of its own", async () => {
    const doc = detail();
    doc.obligation.settings = { ...doc.obligation.settings, period_days: null };
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    await decide("certificate.pdf", "Reject");
    expect(screen.getByRole("button", { name: "Full correction period" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows what was saved in the drawer: the result line, the real decisions, and the next one still waiting", async () => {
    const time = clock();
    try {
      const { onOpen } = page(false, { queue: [row(), sam()] });
      await decide("certificate.pdf", "Reject");
      fireEvent.change(why("certificate.pdf"), { target: { value: "Blurry photo" } });
      const after = detail();
      after.obligation.revision = 2;
      after.obligation.status = "rejected";
      after.obligation.rejection_reason = "Blurry photo.";
      after.submissions[0]!.state = "rejected";
      after.submissions[0]!.files[0] = { ...after.submissions[0]!.files[0]!, decision: "discard", note: "Blurry photo" };
      vi.mocked(getDocument).mockResolvedValue(after);
      fireEvent.click(save());
      await waitFor(() => expect(green().textContent).toBe("Next: Sam Lee"));
      const result = document.querySelector<HTMLElement>(".rd-foot .docr-note")!;
      expect(result.getAttribute("role")).toBe("status");
      expect(result.textContent).toBe("Sent back · Test is told why and has a new 7 days.");
      expect(result.className).toBe("rd-foot-note docr-note docr-result red");
      expect(document.activeElement).toBe(green());
      // The real decision, read only: the file rejected with its reason, the head in the manager's word.
      expect(screen.queryByRole("group", { name: /^Approve or reject/ })).toBeNull();
      expect(chipOf("certificate.pdf")?.textContent).toBe("Rejected");
      expect(within(filesRegion()).getByText("Blurry photo")).toBeTruthy();
      expect(screen.getByText("Missing", { selector: ".rd-head .rd-chip" })).toBeTruthy();
      // The decision takes the due date's place among the facts.
      expect(screen.getByText("Sent back", { selector: "dt" }).nextElementSibling?.textContent).toMatch(/ · You$/);
      fireEvent.click(green());
      time.tick(250);
      fireEvent.click(green());
      expect(onOpen).not.toHaveBeenCalled();
      time.tick(200);
      fireEvent.click(green());
      expect(onOpen).toHaveBeenCalledExactlyOnceWith("second");
    } finally {
      time.restore();
    }
  });

  // mockup-spec 19.1: the drawer's one polite region says what a Save did and where the green goes.
  it("says a Save's result in the drawer's polite region", async () => {
    page(false, { queue: [row(), sam()] });
    await approveAndSave();
    const polite = () => document.querySelector(".document-review-drawer [aria-live='polite']")?.textContent;
    await waitFor(() => expect(polite()).toBe("Approved. Next waiting: Sam Lee."));
  });

  it("closes once nobody else waits, saying all caught up", async () => {
    const time = clock();
    try {
      const { onClose } = page(false, { queue: [row(), { ...sam(), status: "completed" }] });
      const approved = detail();
      approved.obligation.revision = 2;
      approved.obligation.status = "completed";
      approved.obligation.approved_id = "submission";
      approved.submissions[0]!.state = "accepted";
      vi.mocked(getDocument).mockResolvedValue(approved);
      await approveAndSave();
      await waitFor(() => expect(green().textContent).toBe("Close"));
      expect(dockLine()).toBe("Approved · Test is told. All caught up.");
      await waitFor(() =>
        expect(document.querySelector(".document-review-drawer [aria-live='polite']")?.textContent).toBe(
          "Approved. All caught up.",
        ),
      );
      expect(chipOf("certificate.pdf")?.textContent).toBe("Approved");
      time.tick(450);
      fireEvent.click(green());
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      time.restore();
    }
  });

  it("sends once, whatever a double click, a triple click or a quick second click does", async () => {
    page();
    await decide("certificate.pdf", "Approve");
    const button = save();
    fireEvent.click(button);
    fireEvent.click(button, { detail: 2 });
    fireEvent.click(button, { detail: 3 });
    fireEvent.click(button);
    await waitFor(() => expect(green().textContent).toBe("Close"));
    expect(reviewDocument).toHaveBeenCalledOnce();
  });

  it("drops the second click of a double click on any control, and counts a deliberate one later", async () => {
    const time = clock();
    try {
      page();
      const pair = await screen.findByRole("group", { name: "Approve or reject certificate.pdf" });
      const approve = within(pair).getByRole("button", { name: "Approve" });
      const reject = within(pair).getByRole("button", { name: "Reject" });
      fireEvent.click(approve, { detail: 1 });
      time.tick(150);
      fireEvent.click(reject, { detail: 2 });
      expect([approve.getAttribute("aria-pressed"), reject.getAttribute("aria-pressed")]).toEqual(["true", "false"]);
      time.tick(450);
      fireEvent.click(reject, { detail: 2 });
      expect(reject.getAttribute("aria-pressed")).toBe("true");
    } finally {
      time.restore();
    }
  });

  // K1 fix pass (mockup-spec 17.2): the row's click opened the drawer; the second click of that double click lands on
  // the card drawn under it and must neither press a file's Approve nor move focus off the name.
  it("drops the second click of the double click that opened it", async () => {
    const time = clock();
    try {
      page();
      const pair = await screen.findByRole("group", { name: "Approve or reject certificate.pdf" });
      const approve = within(pair).getByRole("button", { name: "Approve" });
      time.tick(150);
      const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail: 2 });
      approve.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
      fireEvent.click(approve, { detail: 2 });
      expect(approve.getAttribute("aria-pressed")).toBe("false");
      time.tick(450);
      fireEvent.click(approve, { detail: 1 });
      expect(approve.getAttribute("aria-pressed")).toBe("true");
    } finally {
      time.restore();
    }
  });

  // A double click on the strip's Next moves once; its second press, beside the narrower button, keeps focus put.
  it("keeps focus where it is on the second press of a double click, on a button or not", async () => {
    const time = clock();
    try {
      page();
      await screen.findByRole("group", { name: "Approve or reject certificate.pdf" });
      time.tick(600);
      fireEvent.click(screen.getByRole("button", { name: "Approve" }), { detail: 1 });
      time.tick(120);
      const line = document.querySelector<HTMLElement>(".rd-foot .docr-note")!;
      const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail: 2 });
      line.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
      // A double click in a text field still selects a word.
      fireEvent.click(screen.getByRole("button", { name: "Reject" }), { detail: 1 });
      time.tick(120);
      const word = new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail: 2 });
      why("certificate.pdf").dispatchEvent(word);
      expect(word.defaultPrevented).toBe(false);
    } finally {
      time.restore();
    }
  });

  it("never clicks again on a held key, and drops a second key press on the green that comes too soon", async () => {
    const time = clock();
    try {
      page();
      await decide("certificate.pdf", "Approve");
      const button = save();
      const reject = screen.getByRole("button", { name: "Reject" });
      expect(fireEvent.keyDown(reject, { key: " ", repeat: true })).toBe(false);
      expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
      expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
      time.tick(90);
      expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(false);
      time.tick(90);
      expect(fireEvent.keyDown(button, { key: " " })).toBe(false);
      expect(fireEvent.keyUp(button, { key: " " })).toBe(false);
      time.tick(500);
      expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
    } finally {
      time.restore();
    }
  });

  it("says when Save turns on", async () => {
    page();
    await decide("certificate.pdf", "Approve");
    await waitFor(() =>
      expect(document.querySelector(".docr-strip [aria-live='polite']")?.textContent).toBe(
        "Ready · Save approves it",
      ),
    );
  });

  // K1 decision 2: an approved document can be reviewed again; its files read Approved until then.
  it("reviews an approved document again only when asked, and takes the request back", async () => {
    const doc = detail();
    doc.obligation.status = "completed";
    doc.obligation.approved_id = "submission";
    doc.submissions[0]!.state = "accepted";
    doc.submissions[0]!.reviewed_at = "2026-09-16T12:00:00Z";
    vi.mocked(getDocument).mockResolvedValue(doc);
    const time = clock();
    try {
      page();
      await screen.findByRole("button", { name: "Review again" });
      expect(chipOf("certificate.pdf")?.textContent).toBe("Approved");
      expect(screen.queryByRole("group", { name: /^Approve or reject/ })).toBeNull();
      expect(dockLine()).toBe("Approved · Nothing to decide here.");
      expect(green().textContent).toBe("Close");
      fireEvent.click(screen.getByRole("button", { name: "Review again" }));
      const pair = screen.getByRole("group", { name: "Approve or reject certificate.pdf" });
      expect(within(pair).getAllByRole("button").map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
      expect(dockLine()).toBe("Approve or reject each file · 1 left");
      expect(save().getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "Cancel review" }));
      expect(screen.queryByRole("group", { name: /^Approve or reject/ })).toBeNull();
      expect(green().textContent).toBe("Close");
      fireEvent.click(screen.getByRole("button", { name: "Review again" }));
      await decide("certificate.pdf", "Reject");
      fireEvent.change(why("certificate.pdf"), { target: { value: "Wrong person" } });
      // Close turned into Save: it holds for a moment first.
      fireEvent.click(save());
      expect(reviewDocument).not.toHaveBeenCalled();
      time.tick(450);
      fireEvent.click(save());
      await waitFor(() =>
        expect(reviewDocument).toHaveBeenCalledWith(
          expect.anything(),
          "requirement",
          expect.objectContaining({ submission_id: "submission", decision: "reject", reason: "Wrong person." }),
        ),
      );
    } finally {
      time.restore();
    }
  });

  it("turns the green back into Save on a new change after a Save", async () => {
    const approved = detail();
    approved.obligation.revision = 2;
    approved.obligation.status = "completed";
    approved.obligation.approved_id = "submission";
    approved.submissions[0]!.state = "accepted";
    page();
    vi.mocked(getDocument).mockResolvedValue(approved);
    await approveAndSave();
    await waitFor(() => expect(green().textContent).toBe("Close"));
    expect(dockLine()).toBe("Approved · Test is told. All caught up.");
    fireEvent.click(screen.getByRole("button", { name: "Review again" }));
    expect(green().textContent).toBe("Save");
    expect(dockLine()).toBe("Approve or reject each file · 1 left");
  });

  it("shows a document sent back earlier with what was decided on each file", async () => {
    const doc = twoFiles();
    doc.obligation.status = "rejected";
    doc.obligation.rejection_reason = "back.pdf: Blurry photo.";
    doc.submissions[0]!.state = "rejected";
    doc.submissions[0]!.files[1] = { ...back, decision: "discard", note: "Blurry photo." };
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    await screen.findByRole("region", { name: "Files" });
    expect([chipOf("certificate.pdf")?.textContent, chipOf("certificate.pdf")?.className]).toEqual([
      "Kept",
      "rd-chip grey",
    ]);
    expect([chipOf("back.pdf")?.textContent, chipOf("back.pdf")?.className]).toEqual(["Rejected", "rd-chip red"]);
    expect(within(filesRegion()).getByText("Blurry photo.")).toBeTruthy();
    // A rejected file is no longer handed out.
    expect(within(filesRegion()).getByRole("button", { name: "back.pdf" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("group", { name: /^Approve or reject/ })).toBeNull();
    expect(screen.getByText("Missing", { selector: ".rd-head .rd-chip" })).toBeTruthy();
    expect(dockLine()).toBe("Nothing to review · Excuse Test below");
    expect(save().getAttribute("aria-disabled")).toBe("true");
    // The document's reason is made of the files' reasons, which stand under their files.
    expect(screen.queryByText("back.pdf: Blurry photo.")).toBeNull();
  });

  it("keeps a send-back reason that no file carries", async () => {
    const doc = detail();
    doc.obligation.status = "rejected";
    doc.obligation.rejection_reason = "Please send the whole card.";
    doc.submissions[0]!.state = "rejected";
    doc.submissions[0]!.files[0] = { ...doc.submissions[0]!.files[0]!, decision: "discard", note: "" };
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    expect((await screen.findByText("Please send the whole card.")).getAttribute("role")).toBe("note");
  });

  // K1 decision 11: a renewal sent back while the old copy is still valid stays Completed.
  it("follows the refreshed status when a renewal is sent back and its old copy stays", async () => {
    const renewal = () => {
      const doc = detail();
      doc.obligation.approved_id = "old";
      doc.obligation.expiry_date = "2026-12-31";
      doc.submissions[0]!.version = 2;
      doc.submissions.push({
        ...doc.submissions[0]!,
        id: "old",
        version: 1,
        state: "accepted",
        reviewed_at: "2025-12-01T12:00:00Z",
        expiry_date: "2026-12-31",
        files: [{ ...doc.submissions[0]!.files[0]!, id: "old-file", filename: "old.pdf" }],
      });
      return doc;
    };
    vi.mocked(getDocument).mockResolvedValue(renewal());
    page();
    await decide("certificate.pdf", "Reject");
    fireEvent.change(why("certificate.pdf"), { target: { value: "Expired" } });
    const after = renewal();
    after.obligation.revision = 2;
    after.obligation.status = "completed";
    after.submissions[0]!.state = "rejected";
    after.submissions[0]!.files[0] = { ...after.submissions[0]!.files[0]!, decision: "discard", note: "Expired" };
    vi.mocked(getDocument).mockResolvedValue(after);
    fireEvent.click(save());
    await waitFor(() =>
      expect(dockLine()).toBe(
        "Sent back · Test is told why. The approved copy stays on file until Dec 31, 2026. All caught up.",
      ),
    );
    expect(screen.getByText("Completed", { selector: ".rd-head .rd-chip" })).toBeTruthy();
    expect(screen.queryByText("Missing", { selector: ".rd-head .rd-chip" })).toBeNull();
    // What the document is now is the copy on file; the renewal stands apart, as sent back.
    expect(screen.getByText("Expires", { selector: "dt" }).nextElementSibling?.textContent).toBe("Dec 31, 2026");
    expect(chipOf("old.pdf")?.textContent).toBe("Approved");
    const renewalFiles = screen.getByRole("region", { name: "Version 2 · Sent back" });
    expect(within(renewalFiles).getByText("certificate.pdf").closest(".docr-file")?.querySelector(".rd-chip")?.textContent).toBe(
      "Rejected",
    );
    expect(within(renewalFiles).getByText("Expired")).toBeTruthy();
  });

  // K1 fix pass: a copy whose expiration date has passed is not promised "on file" (the server refuses to approve it
  // and says so in the band).
  it("promises no date on file for a copy that has already expired", async () => {
    const doc = detail();
    doc.submissions[0]!.expiry_date = "2026-01-01";
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    await decide("certificate.pdf", "Approve");
    expect(dockLine()).toBe("Save approves it");
  });
  // K1 decision 10: the field stops typing at 500, but a common reason added by its chip can pass it; what is sent
  // never does.
  it("sends 500 characters at most when a chip makes the reason longer", async () => {
    page();
    await decide("certificate.pdf", "Reject");
    fireEvent.change(why("certificate.pdf"), { target: { value: "x".repeat(495) } });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Common reasons for certificate.pdf" })).getByRole("button", {
        name: "Name doesn't match",
      }),
    );
    expect(why("certificate.pdf").value.length).toBeGreaterThan(500);
    fireEvent.click(save());
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledOnce());
    const command = vi.mocked(reviewDocument).mock.calls[0]![2];
    expect(command.files[0]!.note).toHaveLength(500);
    expect(command.reason).toHaveLength(500);
    expect(command.reason.endsWith("…")).toBe(true);
  });
  // A note the file stores stays with it when it is approved (the server writes what is sent).
  it("keeps a kept file's stored note when it is approved", async () => {
    const doc = detail();
    doc.submissions[0]!.files[0]!.note = "Copy from the front desk";
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    await approveAndSave();
    await waitFor(() => expect(reviewDocument).toHaveBeenCalledOnce());
    expect(vi.mocked(reviewDocument).mock.calls[0]![2].files).toEqual([
      { id: "file", decision: "keep", note: "Copy from the front desk" },
    ]);
  });

  // K1 fix pass: an answer is the answer to the version it decided; a version sent after it is new to decide.
  it("decides a version sent after its answer afresh", async () => {
    const time = clock();
    try {
      const sitting = createReviewSitting();
      const { show } = page(false, { queue: [row(), sam()], sitting });
      const approved = detail();
      approved.obligation.revision = 2;
      approved.obligation.status = "completed";
      approved.obligation.approved_id = "submission";
      approved.submissions[0]!.state = "accepted";
      vi.mocked(getDocument).mockResolvedValue(approved);
      await approveAndSave();
      await waitFor(() => expect(green().textContent).toBe("Next: Sam Lee"));
      // The person sends version 2, which waits for review.
      const sentAgain = detail();
      sentAgain.obligation.revision = 3;
      sentAgain.obligation.submitted_id = "v2";
      sentAgain.obligation.approved_id = "submission";
      sentAgain.submissions = [
        { ...approved.submissions[0]! },
        { ...detail().submissions[0]!, id: "v2", version: 2, files: [{ ...detail().submissions[0]!.files[0]!, id: "v2-file", filename: "renewed.pdf" }] },
      ];
      vi.mocked(getDocument).mockResolvedValue(sentAgain);
      show("second");
      await screen.findByRole("dialog", { name: /Sam Lee/ });
      show("requirement");
      await screen.findByRole("group", { name: "Approve or reject renewed.pdf" });
      await waitFor(() => expect(green().textContent).toBe("Save"));
      expect(green().getAttribute("aria-disabled")).toBe("true");
      expect(dockLine()).toBe("Approve or reject each file · 1 left");
      expect(screen.queryByText("Approved", { selector: "dt" })).toBeNull();
      // Nor does the walk skip it: from Sam, the green comes back to it.
      expect(sitting.answered(sentAgain.obligation)).toBe(false);
    } finally {
      time.restore();
    }
  });

  // gaps A3: a row that waits for an administrator's time zone stays in the strip, but the green never goes to it.
  it("closes rather than going to a row that waits for a time zone", async () => {
    page(false, { queue: [row(), { ...sam(), status: "timezone_required" }] });
    await approveAndSave();
    await waitFor(() => expect(green().textContent).toBe("Close"));
    expect(screen.getByRole("button", { name: "Next: Sam Lee" })).toBeTruthy();
  });

  // K1 fix pass (gaps A2): opened fresh, the same document reads as the copy on file, with the renewal apart.
  it("opens a renewal sent back while its old copy stays on the copy on file", async () => {
    const doc = detail();
    doc.obligation.status = "completed";
    doc.obligation.approved_id = "old";
    doc.obligation.expiry_date = "2026-12-31";
    doc.obligation.rejection_reason = "Blurry photo.";
    doc.submissions[0] = {
      ...doc.submissions[0]!,
      version: 2,
      state: "rejected",
      expiry_date: "2029-09-30",
      rejection_reason: "Blurry photo.",
      files: [{ ...doc.submissions[0]!.files[0]!, filename: "lena-2026.jpg", decision: "discard", note: "Blurry photo" }],
    };
    doc.submissions.push({
      ...doc.submissions[0]!,
      id: "old",
      version: 1,
      state: "accepted",
      submitted_at: "2025-11-28T18:00:00Z",
      reviewed_at: "2025-12-02T18:00:00Z",
      expiry_date: "2026-12-31",
      rejection_reason: null,
      files: [{ ...doc.submissions[0]!.files[0]!, id: "old-file", filename: "lena-2025.jpg", decision: "keep", note: "" }],
    });
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    const files = await screen.findByRole("region", { name: "Files" });
    expect(screen.getByText("Expires", { selector: "dt" }).nextElementSibling?.textContent).toBe("Dec 31, 2026");
    expect(within(files).getByText("Version 1")).toBeTruthy();
    expect(chipOf("lena-2025.jpg")?.textContent).toBe("Approved");
    expect(within(files).queryByText("lena-2026.jpg")).toBeNull();
    const renewal = screen.getByRole("region", { name: "Version 2 · Sent back" });
    expect(chipOf("lena-2026.jpg")?.textContent).toBe("Rejected");
    expect(within(renewal).getByText("Blurry photo")).toBeTruthy();
    // Each rejected file says its own reason; the document's reason is not said twice.
    expect(screen.queryByText("Blurry photo.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Review again" })).toBeNull();
  });

  // K1 decision 12: a row that waits for the person's document time zone keeps today's time zone parts.
  it.each([
    [true, "Time zone needed · Choose the document time zone above and save it"],
    [false, "Time zone needed · An administrator needs to set the document time zone"],
  ])("says what a time zone row needs (can set it: %s)", async (canManage, line) => {
    const doc = detail();
    doc.obligation.status = "timezone_required";
    doc.obligation.timezone = null;
    doc.obligation.tracks_expiry = true;
    doc.obligation.approved_id = "submission";
    doc.submissions[0]!.state = "accepted";
    doc.submissions[0]!.expiry_date = "2027-03-31";
    doc.timezone_settings = { value: null, configured_value: null, employee_revision: 4, can_manage: canManage };
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(false, { queue: [row({ status: "timezone_required" }), sam()] });
    await screen.findByRole("region", { name: "Files" });
    expect(screen.getByText("Time zone needed", { selector: ".rd-head .rd-chip" })).toBeTruthy();
    expect(dockLine()).toBe(line);
    expect(Boolean(screen.queryByRole("button", { name: "Save document time zone" }))).toBe(canManage);
    expect(
      screen.getByText(
        "An administrator needs to set this employee's document time zone before expiration dates can be checked.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: /^Approve or reject/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review again" })).toBeNull();
    expect(green().textContent).toBe("Next: Sam Lee");
  });

  it("says a document changed meanwhile in the dock's line", async () => {
    page();
    vi.mocked(reviewDocument).mockRejectedValueOnce(
      new RequestError("document changed; refresh required", "document.changed", undefined, 409),
    );
    await approveAndSave();
    await waitFor(() => expect(dockLine()).toBe("This document changed. You're seeing the latest version."));
    expect(document.querySelector(".rd-foot .docr-note")?.getAttribute("role")).toBe("status");
  });

  // A2 Tur 6 (mockup-spec 14; K1 decision 8): one timeline, newest first, in plain words; nobody named as the doer,
  // a draft's uploads left out; every version's files by name with what was decided on each, a kept one opening.
  it("tells the history as one timeline, each version's files by name, a kept one opening", async () => {
    const manager = { workspaceId: "workspace", selfOnly: false };
    const doc = detail();
    doc.submissions[0]!.version = 2;
    const file = doc.submissions[0]!.files[0]!;
    doc.submissions.push({
      ...doc.submissions[0]!,
      id: "first",
      version: 1,
      state: "rejected",
      rejection_reason: "Blurry.",
      files: [
        { ...file, id: "first-file", filename: "old.jpg", media_type: "image/jpeg", decision: "discard", note: "Blurry" },
        { ...file, id: "kept-file", filename: "kept.pdf", decision: "keep", note: "" },
      ],
    });
    const event = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
    doc.history = [
      { id: event(4), action: "document.submitted", occurred_at: "2026-09-15T12:00:00Z", metadata: { submission_id: "submission" } },
      { id: event(3), action: "document.draft_file_added", occurred_at: "2026-09-15T11:58:00Z", metadata: { submission_id: "submission" } },
      {
        id: event(2),
        action: "document.reject",
        occurred_at: "2026-09-10T16:30:00Z",
        metadata: {
          submission_id: "first",
          reason: "Blurry.",
          correction_period: "full",
          new_deadline: "2026-09-17T16:30:00Z",
          files: [
            { id: "first-file", decision: "discard", note: "Blurry" },
            { id: "kept-file", decision: "keep", note: "" },
          ],
        },
      },
      { id: event(1), action: "document.submitted", occurred_at: "2026-09-09T16:00:00Z", metadata: { submission_id: "first" } },
    ];
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(downloadDocument).mockResolvedValue(undefined);
    page();
    fireEvent.click(await screen.findByRole("tab", { name: "History" }));
    const timeline = screen.getByRole("list", { name: "History" });
    const events = Array.from(timeline.children) as HTMLElement[];
    expect(events.map((item) => [item.querySelector(".docr-ev-title b")?.textContent, item.className])).toEqual([
      ["Version 2 sent", "docr-ev"],
      ["Version 1 sent back", "docr-ev red"],
      ["Version 1 sent", "docr-ev"],
    ]);
    expect(events[0]!.querySelector(".docr-ev-when")?.textContent).toBe("Tue, Sep 15, 5:00 AM");
    expect(within(events[0]!).getByText("Needs review", { selector: ".rd-chip" })).toBeTruthy();
    expect(within(events[0]!).getByRole("button", { name: "certificate.pdf" })).toBeTruthy();
    const back = events[1]!;
    expect(back.querySelector(".rd-quote")?.textContent).toBe("Blurry.");
    expect(
      Array.from(back.querySelectorAll(".docr-ev-file")).map((row) => [
        row.querySelector(".docr-ev-fname")?.textContent,
        row.querySelector(".rd-chip")?.textContent,
        row.querySelector(".docr-ev-fnote")?.textContent ?? null,
      ]),
    ).toEqual([
      ["old.jpg", "Rejected", "Blurry"],
      ["kept.pdf", "Kept", null],
    ]);
    // A rejected file is no longer handed out; a kept one opens as today, by its version.
    expect(within(back).queryByRole("button", { name: "old.jpg" })).toBeNull();
    fireEvent.click(within(back).getByRole("button", { name: "kept.pdf" }));
    await waitFor(() =>
      expect(downloadDocument).toHaveBeenCalledWith(manager, "requirement", "first", "kept-file"),
    );
    expect(back.querySelector(".docr-ev-meta")?.textContent).toBe("A new 7 days to send it again · Due Thu, Sep 17");
    expect(timeline.textContent).not.toMatch(/You|Test Employee|draft|document\./);
  });

  describe("on a phone", () => {
    const matchMedia = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        matches: query === "(max-width: 720px)",
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = matchMedia;
    });
    it("draws each file as one open button over its two halves, and the row in Details says where the review stands", async () => {
      page();
      fireEvent.click(await screen.findByRole("button", { name: /^1 file to review/ }));
      expect(screen.getByRole("heading", { name: "Version 1" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Open certificate.pdf" })).toBeTruthy();
      await decide("certificate.pdf", "Approve");
      expect(dockLine()).toBe("Save approves it");
      fireEvent.click(screen.getByRole("tab", { name: "Details" }));
      expect(screen.getByRole("button", { name: /^File checked/ })).toBeTruthy();
    });
    it("says a sent-back result in its short words", async () => {
      page();
      fireEvent.click(await screen.findByRole("button", { name: /^1 file to review/ }));
      await decide("certificate.pdf", "Reject");
      fireEvent.change(why("certificate.pdf"), { target: { value: "Blurry photo" } });
      const after = detail();
      after.obligation.revision = 2;
      after.obligation.status = "rejected";
      after.submissions[0]!.state = "rejected";
      after.submissions[0]!.files[0] = { ...after.submissions[0]!.files[0]!, decision: "discard", note: "Blurry photo" };
      vi.mocked(getDocument).mockResolvedValue(after);
      fireEvent.click(save());
      await waitFor(() => expect(dockLine()).toBe("Sent back · Test has a new 7 days. All caught up."));
      expect(document.querySelector(".rd-foot .docr-note")?.getAttribute("title")).toBe(
        "Sent back · Test is told why and has a new 7 days. All caught up.",
      );
      expect(screen.getByRole("button", { name: "Open certificate.pdf · Rejected" })).toBeTruthy();
    });
  });
});

// A2 Tur 6 (K1 stage 3): More options at the end of Details, selectable cards, one open at a time, one change per
// Save. Today's rules decide the cards (K1 decisions 1 and 3); Save then goes on to the next one waiting (decision 1).
describe("More options", () => {
  const manager = { workspaceId: "workspace", selfOnly: false };
  const sam = () =>
    row({ id: "second", employee_id: "other", employee_name: "Sam Lee", title: "Food handler card" });
  function second(): DocumentDetail {
    const doc = detail();
    doc.obligation = { ...doc.obligation, ...sam(), submitted_id: "second-submission" };
    doc.submissions[0]!.id = "second-submission";
    return doc;
  }
  const deadline = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const later = (days: number) => new Date(Date.parse(deadline) + days * 86_400_000).toISOString();
  const day = (iso: string) => formatDay(iso, "America/Los_Angeles", new Date());
  // Nothing sent yet, due in a week.
  function owed(revision = 1): DocumentDetail {
    const doc = detail();
    doc.obligation.status = "missing";
    doc.obligation.revision = revision;
    doc.obligation.submitted_id = null;
    doc.obligation.deadline_at = deadline;
    doc.submissions = [];
    return doc;
  }
  const options = () => screen.getByRole("region", { name: "More options" });
  const head = (name: RegExp) => within(options()).getByRole("button", { name });
  // Each card's head: one disclosure button, its label then what it says on the right.
  const heads = () =>
    within(options())
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-expanded"))
      .map((button) => button.textContent);
  beforeEach(() => {
    vi.mocked(extendDocumentDeadline).mockResolvedValue({});
  });

  it("offers Extend deadline and Excuse as cards, one open at a time; a click on the open head closes it", async () => {
    vi.mocked(getDocument).mockResolvedValue(owed());
    page();
    await screen.findByRole("region", { name: "More options" });
    expect(heads()).toEqual([`Extend deadline Due ${day(deadline)}`, "Excuse Test Stop asking for this document"]);
    const extend = head(/^Extend deadline/);
    const excuse = head(/^Excuse Test/);
    expect([extend.getAttribute("aria-expanded"), extend.getAttribute("aria-controls")]).toEqual(["false", null]);
    extend.focus();
    fireEvent.click(extend);
    const panel = screen.getByRole("group", { name: "Extend deadline" });
    expect([extend.getAttribute("aria-expanded"), extend.getAttribute("aria-controls")]).toEqual(["true", panel.id]);
    expect(extend.closest(".docr-card")?.className).toBe("docr-card is-open");
    expect(document.activeElement).toBe(extend);
    fireEvent.click(excuse);
    expect(extend.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "Extend deadline" })).toBeNull();
    expect(screen.getByRole("group", { name: "Excuse Test" })).toBeTruthy();
    fireEvent.click(excuse);
    expect(excuse.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "Excuse Test" })).toBeNull();
    expect(excuse.closest(".docr-card")?.className).toBe("docr-card");
  });

  it("extends by a pick or Other's days with a reason, says the new due date, and tells nobody", async () => {
    const time = clock();
    try {
      vi.mocked(getDocument).mockResolvedValue(owed());
      const { onOpen } = page(false, { queue: [row(), sam()] });
      await screen.findByRole("region", { name: "More options" });
      expect(dockLine()).toBe("Nothing to review · Extend the deadline or excuse Test below");
      fireEvent.click(head(/^Extend deadline/));
      const panel = screen.getByRole("group", { name: "Extend deadline" });
      const add = within(panel).getByRole("group", { name: "Add time" });
      expect(
        within(add)
          .getAllByRole("button")
          .map((pick) => [pick.textContent, pick.getAttribute("aria-pressed")]),
      ).toEqual([
        ["+3 days", "false"],
        ["+7 days", "false"],
        ["+14 days", "false"],
        ["Other", "false"],
      ]);
      expect(panel.querySelector(".docr-due")?.textContent).toBe(`Due now: ${day(deadline)}`);
      expect(dockLine()).toBe("Choose how much time to add");
      expect(save().getAttribute("aria-disabled")).toBe("true");
      const seven = within(add).getByRole("button", { name: "+7 days" });
      fireEvent.click(seven);
      expect(seven.getAttribute("aria-pressed")).toBe("true");
      expect(panel.querySelector(".docr-due")?.textContent).toBe(`New due date: ${day(later(7))}`);
      expect(dockLine()).toBe("Add a reason Test will see");
      // The chosen one pressed again takes it back.
      fireEvent.click(seven);
      expect(seven.getAttribute("aria-pressed")).toBe("false");
      expect(dockLine()).toBe("Choose how much time to add");
      fireEvent.click(within(add).getByRole("button", { name: "Other" }));
      const other = within(panel).getByLabelText("Days to add") as HTMLInputElement;
      expect(document.activeElement).toBe(other);
      expect([other.inputMode, other.maxLength]).toEqual(["numeric", 4]);
      const hint = document.getElementById(other.getAttribute("aria-describedby")!)!;
      expect([hint.textContent, hint.className]).toEqual(["1 to 3,650", "docr-hint"]);
      fireEvent.change(other, { target: { value: "0" } });
      expect(dockLine()).toBe("Enter 1 to 3,650 days");
      expect(hint.className).toBe("docr-hint is-bad");
      fireEvent.change(other, { target: { value: "5" } });
      const reason = within(panel).getByLabelText("Reason") as HTMLTextAreaElement;
      expect([reason.maxLength, reason.placeholder, reason.getAttribute("aria-required")]).toEqual([
        500,
        "Why Test needs more time",
        "true",
      ]);
      fireEvent.change(reason, { target: { value: "Clinic closed this week" } });
      expect(dockLine()).toBe(`Save moves the due date to ${day(later(5))}`);
      const after = owed(2);
      after.obligation.deadline_at = later(5);
      vi.mocked(getDocument).mockResolvedValue(after);
      time.tick(450);
      fireEvent.click(save());
      await waitFor(() =>
        expect(extendDocumentDeadline).toHaveBeenCalledWith(manager, "requirement", {
          revision: 1,
          additional_days: 5,
          reason: "Clinic closed this week",
        }),
      );
      await waitFor(() => expect(green().textContent).toBe("Next: Sam Lee"));
      // K1 decision 15: an extension sends no notice.
      expect(dockLine()).toBe(`Deadline extended 5 days · New due date ${day(later(5))}.`);
      expect(document.activeElement).toBe(green());
      expect(screen.queryByRole("group", { name: "Extend deadline" })).toBeNull();
      expect(head(/^Extend deadline/).textContent).toBe(`Extend deadline Due ${day(later(5))}`);
      time.tick(450);
      fireEvent.click(green());
      expect(onOpen).toHaveBeenCalledExactlyOnceWith("second");
    } finally {
      time.restore();
    }
  });

  it("turns the file controls off while a panel is open, saying so, with its own Cancel", async () => {
    // A deadline ahead: only waiting for review keeps Extend away (K1 decision 1).
    vi.mocked(getDocument).mockResolvedValue({ ...detail(), obligation: { ...detail().obligation, deadline_at: deadline } });
    page();
    await screen.findByRole("region", { name: "More options" });
    // K1 decision 1: no extension on a document waiting for review; it can still be excused.
    expect(within(options()).queryByRole("button", { name: /^Extend deadline/ })).toBeNull();
    fireEvent.click(head(/^Excuse Test/));
    const pair = screen.getByRole("group", { name: "Approve or reject certificate.pdf" });
    const approve = within(pair).getByRole("button", { name: "Approve" });
    expect(approve.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(approve);
    expect(approve.getAttribute("aria-pressed")).toBe("false");
    const off = screen.getByText("Save or cancel Excuse Test first").closest("p")!;
    expect(within(off).getAllByRole("button").map((button) => button.textContent)).toEqual(["Cancel"]);
    fireEvent.click(within(off).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Excuse Test" })).toBeNull();
    expect(screen.queryByText("Save or cancel Excuse Test first")).toBeNull();
    expect(document.activeElement).toBe(head(/^Excuse Test/));
    expect(approve.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(approve);
    expect(approve.getAttribute("aria-pressed")).toBe("true");
    expect(dockLine()).toBe("Save approves it");
  });

  it("excuses the person with a reason; the green then goes on, and the person's onboarding card is refreshed", async () => {
    const time = clock();
    try {
      const { invalidate, onOpen } = page(false, { queue: [row(), sam()] });
      fireEvent.click(await screen.findByRole("button", { name: /^Excuse Test/ }));
      const panel = screen.getByRole("group", { name: "Excuse Test" });
      expect(panel.querySelector(".docr-info")?.textContent).toBe(
        "What happens: Test won't be asked for this document. You can ask again later.",
      );
      expect(dockLine()).toBe("Add a reason to excuse Test");
      expect(save().getAttribute("aria-disabled")).toBe("true");
      const reason = within(panel).getByLabelText("Reason") as HTMLTextAreaElement;
      expect([reason.placeholder, reason.maxLength, reason.getAttribute("aria-required")]).toEqual([
        "Why Test doesn't need it",
        500,
        "true",
      ]);
      expect(document.getElementById(reason.getAttribute("aria-describedby")!)?.textContent).toBe(
        "Kept in the history",
      );
      fireEvent.change(reason, { target: { value: "  Role exception " } });
      expect(dockLine()).toBe("Save excuses Test from this document");
      const after = detail();
      after.obligation.revision = 2;
      after.obligation.status = "exempt";
      vi.mocked(getDocument).mockResolvedValue(after);
      time.tick(450);
      fireEvent.click(save());
      await waitFor(() =>
        expect(setDocumentExemption).toHaveBeenCalledWith(manager, "requirement", {
          revision: 1,
          exempt: true,
          reason: "Role exception",
        }),
      );
      await waitFor(() => expect(green().textContent).toBe("Next: Sam Lee"));
      expect(dockLine()).toBe("Excused · Test won't be asked for it.");
      expect(screen.getByText("Excused", { selector: ".rd-head .rd-chip" })).toBeTruthy();
      expect(screen.getByText("Excused", { selector: "dt" }).nextElementSibling?.textContent).toMatch(/ · You$/);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["employee-onboarding-review", "workspace"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["employees", "workspace"] });
      // Excused now: its one card asks for it again.
      expect(heads()).toEqual(["Ask for it again Start asking for this document"]);
      time.tick(450);
      fireEvent.click(green());
      expect(onOpen).toHaveBeenCalledExactlyOnceWith("second");
    } finally {
      time.restore();
    }
  });

  // K1 decision 3: today's Remove exemption, as the excused document's one card.
  it("asks again for an excused document with a reason, and says by when", async () => {
    const time = clock();
    try {
      const excused = detail();
      excused.obligation.status = "exempt";
      vi.mocked(getDocument).mockResolvedValue(excused);
      page();
      await screen.findByRole("region", { name: "More options" });
      expect(heads()).toEqual(["Ask for it again Start asking for this document"]);
      fireEvent.click(head(/^Ask for it again/));
      const panel = screen.getByRole("group", { name: "Ask for it again" });
      expect(panel.querySelector(".docr-info")?.textContent).toBe(
        "What happens: Test is asked for this document again. If they still need it, the full time to send it starts again. A valid approved copy stays on file.",
      );
      expect(dockLine()).toBe("Add a reason to ask Test again");
      fireEvent.change(within(panel).getByLabelText("Reason"), { target: { value: "Back on the line" } });
      expect(dockLine()).toBe("Save asks Test for this document again");
      vi.mocked(getDocument).mockResolvedValue(owed(2));
      time.tick(450);
      fireEvent.click(save());
      await waitFor(() =>
        expect(setDocumentExemption).toHaveBeenCalledWith(manager, "requirement", {
          revision: 1,
          exempt: false,
          reason: "Back on the line",
        }),
      );
      await waitFor(() => expect(green().textContent).toBe("Close"));
      expect(dockLine()).toBe(`Asked again · Test needs to send it by ${day(deadline)}. All caught up.`);
      expect(screen.getByText("Missing", { selector: ".rd-head .rd-chip" })).toBeTruthy();
    } finally {
      time.restore();
    }
  });

  // K1 fix pass: with a valid approved copy on file the server asks nothing (no due date, status Completed); the
  // line says so instead of asking the person to send it.
  it("says nothing new is asked when the approved copy still counts", async () => {
    const time = clock();
    try {
      const excused = detail();
      excused.obligation.status = "exempt";
      excused.obligation.approved_id = "submission";
      excused.submissions[0]!.state = "accepted";
      vi.mocked(getDocument).mockResolvedValue(excused);
      page();
      fireEvent.click(await screen.findByRole("button", { name: /^Ask for it again/ }));
      fireEvent.change(within(screen.getByRole("group", { name: "Ask for it again" })).getByLabelText("Reason"), {
        target: { value: "Back on the line" },
      });
      const kept = detail();
      kept.obligation.revision = 2;
      kept.obligation.status = "completed";
      kept.obligation.approved_id = "submission";
      kept.obligation.deadline_at = null;
      kept.submissions[0]!.state = "accepted";
      vi.mocked(getDocument).mockResolvedValue(kept);
      time.tick(450);
      fireEvent.click(save());
      await waitFor(() => expect(green().textContent).toBe("Close"));
      expect(dockLine()).toBe("Asked again · The approved copy still counts. Nothing new is asked. All caught up.");
      expect(screen.getByText("Completed", { selector: ".rd-head .rd-chip" })).toBeTruthy();
    } finally {
      time.restore();
    }
  });

  // K1 fix pass: a waiting row with nothing to review and no card (an overdue policy to sign: no Extend past its
  // deadline, no Excuse for a policy) has nothing to save; the green goes on or closes, as today's drawer did.
  it("goes on from a waiting row that has nothing to save", async () => {
    const policy = owed();
    policy.obligation.kind = "acknowledgement";
    policy.obligation.deadline_at = "2026-01-05T08:00:00Z";
    vi.mocked(getDocument).mockImplementation(async (_audience, id) => (id === "second" ? owed() : policy));
    page(false, { queue: [row({ kind: "acknowledgement", status: "missing" }), sam()] });
    await waitFor(() => expect(green().textContent).toBe("Next: Sam Lee"));
    expect(green().getAttribute("aria-disabled")).toBeNull();
    expect(dockLine()).toBe("Missing · Nothing to decide here.");
    expect(screen.queryByRole("region", { name: "More options" })).toBeNull();
  });

  // K1 fix pass: one red band, for the last command; a refusal does not outlive a later command that went through.
  it("drops an earlier refusal's band once a later command goes through", async () => {
    const time = clock();
    try {
      vi.mocked(getDocument).mockResolvedValue(owed());
      vi.mocked(setDocumentExemption).mockRejectedValue(
        new RequestError("Not allowed", "authz.missing_permission", undefined, 403),
      );
      page();
      fireEvent.click(await screen.findByRole("button", { name: /^Excuse Test/ }));
      fireEvent.change(within(screen.getByRole("group", { name: "Excuse Test" })).getByLabelText("Reason"), {
        target: { value: "Role exception" },
      });
      time.tick(450);
      fireEvent.click(save());
      expect((await screen.findByRole("alert")).textContent).toBe("Not allowed");
      fireEvent.click(head(/^Extend deadline/));
      const panel = screen.getByRole("group", { name: "Extend deadline" });
      fireEvent.click(within(panel).getByRole("button", { name: "+3 days" }));
      fireEvent.change(within(panel).getByLabelText("Reason"), { target: { value: "Clinic closed" } });
      vi.mocked(getDocument).mockResolvedValue({ ...owed(2), obligation: { ...owed(2).obligation, deadline_at: later(3) } });
      time.tick(450);
      fireEvent.click(save());
      await waitFor(() => expect(dockLine()).toMatch(/^Deadline extended 3 days · /));
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      time.restore();
    }
  });

  it("offers no card to excuse a policy to sign, and no options to a manager who may only read", async () => {
    const policy = owed();
    policy.obligation.kind = "acknowledgement";
    policy.policy = {
      content_text: "Be kind.",
      content_digest: "a".repeat(64),
      intent_statement: "I have read it",
      can_withdraw: false,
      history: [],
      evidence: null,
    };
    vi.mocked(getDocument).mockResolvedValue(policy);
    const { reopen } = page();
    await screen.findByText("Be kind.");
    expect(heads()).toEqual([`Extend deadline Due ${day(deadline)}`]);
    vi.mocked(getDocument).mockResolvedValue(owed());
    reopen().unmount();
    page(false, { canReview: false });
    await screen.findByText("Nothing sent yet");
    expect(screen.queryByRole("region", { name: "More options" })).toBeNull();
  });

  it("closes an open panel on Escape, then the drawer", async () => {
    vi.mocked(getDocument).mockResolvedValue(owed());
    const { onClose } = page();
    const dialog = await screen.findByRole("dialog", { name: /Safety certificate/ });
    fireEvent.click(await screen.findByRole("button", { name: /^Extend deadline/ }));
    const panel = screen.getByRole("group", { name: "Extend deadline" });
    fireEvent.keyDown(within(panel).getByRole("button", { name: "+3 days" }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Extend deadline" })).toBeNull();
    expect(document.activeElement).toBe(head(/^Extend deadline/));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  // K1 decision 5: what was typed in a panel stays with its document while the page is open.
  it("keeps the open panel, its pick, Other's days and its reason with the document across a move and a close", async () => {
    vi.mocked(getDocument).mockImplementation(async (_audience, id) => (id === "second" ? second() : owed()));
    const { show, reopen, onClose } = page(false, { queue: [row(), sam()], sitting: createReviewSitting() });
    fireEvent.click(await screen.findByRole("button", { name: /^Extend deadline/ }));
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByLabelText("Days to add"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Clinic closed" } });
    const typed = () => ({
      open: head(/^Extend deadline/).getAttribute("aria-expanded"),
      other: screen.getByRole("button", { name: "Other" }).getAttribute("aria-pressed"),
      days: (screen.getByLabelText("Days to add") as HTMLInputElement).value,
      reason: (screen.getByLabelText("Reason") as HTMLTextAreaElement).value,
    });
    const kept = { open: "true", other: "true", days: "9", reason: "Clinic closed" };
    expect(typed()).toEqual(kept);
    show("second");
    await screen.findByRole("dialog", { name: "Sam Lee · Food handler card" });
    await waitFor(() => expect(screen.queryByLabelText("Days to add")).toBeNull());
    expect(screen.getByRole("button", { name: /^Excuse Sam/ }).getAttribute("aria-expanded")).toBe("false");
    show("requirement");
    await waitFor(() => expect(typed()).toEqual(kept));
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(onClose).toHaveBeenCalledOnce();
    reopen();
    await waitFor(() => expect(typed()).toEqual(kept));
    expect(extendDocumentDeadline).not.toHaveBeenCalled();
  });
});
