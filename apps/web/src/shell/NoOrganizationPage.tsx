import { Button } from "@newfork/ui";
import { Building2, MailCheck } from "lucide-react";
import { Link, useNavigate } from "react-router";

export default function NoOrganizationPage() {
  const navigate = useNavigate();
  return (
    <main className="sign-in-page">
      <section className="sign-in-panel" aria-labelledby="no-org-title">
        <p className="product-mark">NEWFORK</p>
        <Building2 size={28} aria-hidden />
        <h1 id="no-org-title">No organization found</h1>
        <p className="muted">
          This account is not connected to an active or pending organization.
          You can create a business organization or wait for a new invitation.
        </p>
        <Link className="nf-button" to="/account/workspaces">
          Create your business organization
        </Link>
        <Button
          className="secondary"
          type="button"
          onClick={() => navigate("/invitations/pending", { replace: true })}
        >
          <MailCheck size={16} aria-hidden />
          I'm waiting for another invitation
        </Button>
      </section>
    </main>
  );
}
