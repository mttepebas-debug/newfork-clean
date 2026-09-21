import type { InvitationPreviewState } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { useAuth } from "../auth/AuthContext";
import { hubPath } from "../auth/resolveLanding";
import { PreBizFrame } from "../shell/prebiz/PreBiz";
import {
  acceptEmployeeInvitation,
  InvitationError,
  previewEmployeeInvitation,
} from "./employee-data";

/** Every way an invitation link can end, one screen each. */
type Outcome =
  | InvitationPreviewState
  | "not_found"
  | "email_mismatch"
  | "already_member"
  | "failed";

export default function AcceptInvitationPage() {
  const { authenticated, ready, signOut } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  // A cut-off or missing link can never be previewed or accepted.
  const brokenLink = token.length < 32;
  const invitePath = `/invite/accept${location.search}`;
  const preview = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: () => previewEmployeeInvitation(token),
    enabled: !brokenLink,
  });
  const acceptance = useMutation({
    mutationFn: () => acceptEmployeeInvitation(token),
  });

  // Before auth settles nobody is known to be signed in, so no account block yet.
  if (!ready)
    return <main className="auth-loading" aria-label="Loading invitation" />;
  if (!authenticated)
    return <Navigate to="/sign-in" replace state={{ from: invitePath }} />;

  const workspaceName = preview.data?.workspaceName ?? "this workspace";
  const emailHint = preview.data?.emailHint ?? "the invited address";

  if (acceptance.isSuccess)
    return (
      <PreBizFrame
        titleId="accept-invite-title"
        title="You're in"
        description={`A few details before your first shift at ${workspaceName}.`}
      >
        <div className="pb-footer">
          <Button
            className="pb-btn pb-btn-primary"
            type="button"
            onClick={() =>
              navigate(`/welcome/${acceptance.data}`, { replace: true })
            }
          >
            Start onboarding
          </Button>
        </div>
      </PreBizFrame>
    );

  const outcome = resolveOutcome({
    brokenLink,
    previewFailed: preview.isError,
    state: preview.data?.state,
    previewMissing: preview.isSuccess && preview.data === null,
    acceptanceError: acceptance.error,
  });

  if (outcome === "valid")
    return (
      <PreBizFrame
        titleId="accept-invite-title"
        title="Accept your invitation"
        description={`Join the team at ${workspaceName} with ${emailHint}.`}
      >
        <div className="pb-footer">
          <Button
            className="pb-btn pb-btn-primary"
            type="button"
            disabled={acceptance.isPending}
            onClick={() => acceptance.mutate()}
          >
            {acceptance.isPending ? "Accepting" : "Accept invitation"}
          </Button>
        </div>
      </PreBizFrame>
    );

  // The address on the invitation is not this account's. The way across is to
  // sign out: the guard above then keeps the link and asks for the other one.
  if (outcome === "email_mismatch")
    return (
      <PreBizFrame
        titleId="accept-invite-title"
        title="This invitation is for another address"
        description={`It was sent to ${emailHint}. Sign out and sign in with that one.`}
      >
        <div className="pb-footer">
          {/*
            The frame already carries Sign out; this one says what signing out
            is for here, and the guard above keeps the link across it.
          */}
          <Button
            className="pb-btn pb-btn-primary"
            type="button"
            onClick={() => void signOut()}
          >
            Sign in with that address
          </Button>
        </div>
      </PreBizFrame>
    );

  const { title, description } = closedInvitation(outcome, workspaceName);
  return (
    <PreBizFrame
      titleId="accept-invite-title"
      title={title}
      description={description}
    >
      {/* No state is a dead end: there is always somewhere to go from here. */}
      <div className="pb-footer">
        <Button
          className="pb-btn pb-btn-secondary"
          type="button"
          onClick={() => navigate(hubPath, { replace: true })}
        >
          Go to your workspaces
        </Button>
      </div>
    </PreBizFrame>
  );
}

function resolveOutcome(input: {
  readonly brokenLink: boolean;
  readonly previewFailed: boolean;
  readonly previewMissing: boolean;
  readonly state: InvitationPreviewState | undefined;
  readonly acceptanceError: unknown;
}): Outcome {
  // What the attempt learned outranks what the preview guessed: an invitation
  // can be answered elsewhere between loading this page and pressing the button.
  if (input.acceptanceError instanceof InvitationError) {
    if (input.acceptanceError.code === "invitation_email_mismatch")
      return "email_mismatch";
    if (input.acceptanceError.code === "already_member") return "already_member";
    if (input.acceptanceError.code === "invitation_not_found")
      return "not_found";
    return "failed";
  }
  if (input.acceptanceError) return "failed";
  if (input.brokenLink || input.previewMissing) return "not_found";
  if (input.previewFailed) return "failed";
  return input.state ?? "valid";
}

function closedInvitation(
  outcome: Outcome,
  workspaceName: string,
): { readonly title: string; readonly description: string } {
  switch (outcome) {
    case "expired":
      return {
        title: "This link doesn't work anymore",
        description:
          "Invitations last 7 days. Ask your manager to send a new one.",
      };
    case "revoked":
      return {
        title: "This invitation was withdrawn",
        description: `${workspaceName} cancelled it. Ask your manager for a new one.`,
      };
    case "declined":
      return {
        title: "You declined this invitation",
        description:
          "Ask your manager to send a new one if you have changed your mind.",
      };
    case "accepted":
    case "already_member":
      return {
        title: `You have already joined ${workspaceName}`,
        description: "This link has nothing left to do.",
      };
    case "workspace_unavailable":
      return {
        title: `${workspaceName} isn't open right now`,
        description:
          "The workspace was closed or put on hold. Ask your manager about it.",
      };
    case "not_found":
      return {
        title: "This link doesn't work anymore",
        description:
          "It may have been replaced or cut off in an email. Ask your manager for a new one.",
      };
    default:
      return {
        title: "This invitation could not be opened",
        description: "Something went wrong on our side, not yours. Try again later.",
      };
  }
}
