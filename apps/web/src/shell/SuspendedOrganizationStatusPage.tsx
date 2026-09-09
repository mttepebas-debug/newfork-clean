import { Link } from "react-router";

export default function SuspendedOrganizationStatusPage() {
  return (
    <section
      className="account-page"
      aria-labelledby="suspended-organization-title"
    >
      <header className="account-page-header">
        <div>
          <p>Organization access</p>
          <h1 id="suspended-organization-title">Access suspended</h1>
          <p>
            This organization cannot be opened right now. Contact an owner or
            admin if you think access should be restored.
          </p>
        </div>
      </header>

      <div className="workspace-list">
        <div className="workspace-row empty-workspace-row">
          <div>
            <strong>Limited account view only</strong>
            <span>
              Suspended organizations do not expose schedules, employees,
              documents, todos, notifications or settings here.
            </span>
          </div>
        </div>
      </div>

      <Link className="text-button" to="/organization-switcher">
        Back to organization switcher
      </Link>
    </section>
  );
}
