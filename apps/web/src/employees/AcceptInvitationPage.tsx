import { Button } from "@newfork/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, KeyRound } from "lucide-react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  acceptEmployeeInvitation,
  previewEmployeeInvitation,
} from "./employee-data";

export default function AcceptInvitationPage() {
  const { authenticated, ready, signOut } = useAuth();
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

  const acceptanceError =
    acceptance.error instanceof Error ? acceptance.error.message : "";
  const wrongAccount =
    acceptanceError ===
    "invitation email does not match authenticated account";

  return (
    <main className="sign-in-page">
      <section className="sign-in-panel" aria-labelledby="accept-invite-title">
        <p className="product-mark">NEWFORK</p>
        {acceptance.isSuccess ? (
          <>
            <CheckCircle2 size={28} aria-hidden />
            <h1 id="accept-invite-title">Invitation accepted</h1>
            <p className="muted">
              Your workspace access is pending onboarding and manager
              activation.
            </p>
            <Button
              type="button"
              onClick={() => navigate("/welcome", { replace: true })}
            >
              Start onboarding
            </Button>
          </>
        ) : (
          <>
            <KeyRound size={28} aria-hidden />
            <h1 id="accept-invite-title">Accept employee invitation</h1>
            <p className="muted">
              {preview.data
                ? `Join ${preview.data.workspaceName} with ${preview.data.emailHint}.`
                : "Continue with the account matching the invited email address."}
            </p>
            {preview.error ? (
              <p className="form-error" role="alert">
                {preview.error instanceof Error
                  ? preview.error.message
                  : "Invitation unavailable"}
              </p>
            ) : null}
            {wrongAccount ? (
              <div className="form-error" role="alert">
                <p>
                  This invitation is for{" "}
                  {preview.data?.emailHint ?? "the invited email address"}.
                </p>
                <Button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void signOut().then(() =>
                      navigate("/sign-in", {
                        replace: true,
                        state: { from: invitePath },
                      }),
                    );
                  }}
                >
                  Switch account
                </Button>
              </div>
            ) : acceptance.error ? (
              <p className="form-error" role="alert">
                {acceptanceError || "Invitation acceptance failed"}
              </p>
            ) : null}
            {wrongAccount ? null : (
              <Button
                type="button"
                disabled={token.length < 32 || acceptance.isPending}
                onClick={() => acceptance.mutate()}
              >
                {acceptance.isPending ? "Accepting" : "Accept invitation"}
              </Button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
