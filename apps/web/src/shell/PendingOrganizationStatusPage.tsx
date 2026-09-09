import { Link } from "react-router";

export default function PendingOrganizationStatusPage() {
  return (
    <section className="account-page" aria-labelledby="pending-organization-title">
      <header className="account-page-header">
        <div>
          <p>Organization access</p>
          <h1 id="pending-organization-title">Onboarding pending</h1>
          <p>
            This organization is not available in the app shell yet. Complete
            onboarding or wait for the required approval before opening it.
          </p>
        </div>
      </header>

      <div className="workspace-list">
        <div className="workspace-row empty-workspace-row">
          <div>
            <strong>Normal app access is disabled</strong>
            <span>
              Pending organizations use a limited status surface until the
              membership becomes active.
            </span>
          </div>
        </div>
      </div>

      <div className="hub-action-buttons" aria-label="Pending organization actions">
        <Link className="secondary-button" to="/welcome">
          Continue onboarding
        </Link>
        <Link className="text-button" to="/organization-switcher">
          Back to organization switcher
        </Link>
      </div>
    </section>
  );
}
