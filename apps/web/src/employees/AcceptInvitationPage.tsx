import { Button } from "@newfork/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { useAuth } from "../auth/AuthContext";
import { PreBizFrame } from "../shell/prebiz/PreBiz";
import {
  acceptEmployeeInvitation,
  previewEmployeeInvitation,
} from "./employee-data";

export default function AcceptInvitationPage() {
  const { authenticated, ready } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const invitePath = `/invite/accept${location.search}`;
  const preview = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: () => previewEmployeeInvitation(token),
    enabled: token.length >= 32,
  });
  const acceptance = useMutation({
    mutationFn: () => acceptEmployeeInvitation(token),
  });

  // Before auth settles nobody is known to be signed in, so no account block yet.
  if (!ready)
    return <main className="auth-loading" aria-label="Loading invitation" />;
  if (!authenticated) {
    return (
      <Navigate
        to="/sign-in"
        replace
        state={{ from: invitePath }}
      />
    );
  }

  // The server's sentence only picks the state; the screen never prints it.
  const acceptanceError =
    acceptance.error instanceof Error ? acceptance.error.message : "";
  const wrongAccount =
    acceptanceError ===
    "invitation email does not match authenticated account";

  if (acceptance.isSuccess)
    return (
      <PreBizFrame
        titleId="accept-invite-title"
        title="Invitation accepted"
        description={`Start onboarding to finish joining ${preview.data?.workspaceName ?? "your new team"}.`}
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

  return (
    <PreBizFrame
      titleId="accept-invite-title"
      title="Accept your invitation"
      description={
        preview.data
          ? `Join ${preview.data.workspaceName} with ${preview.data.emailHint}.`
          : "Continue with the account matching the invited email address."
      }
    >
      {preview.error ? (
        <p className="form-error" role="alert">
          This invitation could not be loaded — it may have expired, so ask
          your manager for a new one.
        </p>
      ) : null}
      {wrongAccount ? (
        // The frame's Sign out is the way to the other account: once signed
        // out, the guard above sends to /sign-in and keeps this link.
        <p className="form-error" role="alert">
          {`This invitation is for ${preview.data?.emailHint ?? "the invited email address"}. Sign out and sign in with that address.`}
        </p>
      ) : acceptance.error ? (
        <p className="form-error" role="alert">
          This invitation could not be accepted — try again, or ask your
          manager for a new one.
        </p>
      ) : null}
      {wrongAccount ? null : (
        <div className="pb-footer">
          <Button
            className="pb-btn pb-btn-primary"
            type="button"
            disabled={token.length < 32 || acceptance.isPending}
            onClick={() => acceptance.mutate()}
          >
            {acceptance.isPending ? "Accepting" : "Accept invitation"}
          </Button>
        </div>
      )}
    </PreBizFrame>
  );
}
