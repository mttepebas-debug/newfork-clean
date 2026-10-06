import { AnnouncementRow, AnnouncementTableHead, AcknowledgeButton, Acknowledged, AudiencePickers, ListHeader, AppToast } from "../product/announcements";
import { AppWindow, AppSidebar, EMPLOYEE_NAV } from "../product/AppWindow";
import { DocRow, DocTableHead, PolicyAcknowledgement, UploadCard } from "../product/documents";
import { HubContext, HubGreeting, NextShiftCard, RadarCard, RadarRow, Shortcuts } from "../product/employee";
import { Phone, PhoneHeader } from "../product/phone";
import { ProductStage } from "../product/ProductStage";
import { ApprovalsPanel, HubCard, RequestListHead, RequestRow, ResponsibilityBanner } from "../product/requests";
import { EmployeeRow, EmployeeTableHead, WizardFrame } from "../product/team";
import { PEOPLE, WORKSPACE } from "../product/data";

export default function HomePage() {
  return (
    <section style={{ padding: 32, display: "grid", gap: 32, gridTemplateColumns: "repeat(3, 1fr)", alignItems: "start" }}>
      <h1 style={{ gridColumn: "1/-1" }}>Kit gallery</h1>
      <ProductStage width={390}>
        <Phone active="Home">
          <HubContext workspace={WORKSPACE.name} initial="H" unread={3} />
          <HubGreeting name="Alex" meta="Tuesday, October 13 · 9:41 AM" />
          <NextShiftCard label="TODAY’S SHIFT" day="Today" start="4:00 PM" end="11:00 PM" location="Main St" job="Server" note="Starts in 6h 19m · America/New_York" />
          <RadarCard count={2}>
            <RadarRow title="Respond to a shift swap" sub="Fri, Oct 16 · Riverside · Server" />
          </RadarCard>
          <Shortcuts />
        </Phone>
      </ProductStage>
      <ProductStage width={390}>
        <Phone active="Requests">
          <PhoneHeader eyebrow="Work better together" title="Shift Hub" lead="Ask for cover, pick up an open shift, or swap with a teammate." />
          <HubCard kind="Open shift" status="Eligible" date="Fri, Oct 16" time="4:00 PM – 11:00 PM" hours="7 scheduled hours · 30m unpaid break" place="Riverside · Server" who="No assigned employee" help="Job and location match · No assignment blockers" action="Request to pick up" />
          <ResponsibilityBanner>Responsibility changes only after final manager approval.</ResponsibilityBanner>
        </Phone>
      </ProductStage>
      <div style={{ display: "grid", gap: 24 }}>
        <ProductStage width={560}>
          <div className="app-dialog" style={{ padding: "calc(14 * var(--u))", display: "grid", gap: "calc(10 * var(--u))" }}>
            <ApprovalsPanel decideBy="Oct 15, 5:00 PM" lines={[{ location: "Main St", by: "Dana O. · 9:12 AM" }, { location: "Riverside" }]} />
            <AppToast>Published for 24 recipients.</AppToast>
          </div>
        </ProductStage>
        <ProductStage width={560}>
          <PolicyAcknowledgement title="Food safety & allergens policy" text="Wash hands before every shift. Label and date every container. Tell the kitchen about every allergy on a ticket." typedName="Alex Rivera" />
        </ProductStage>
      </div>
      <ProductStage width={900} style={{ gridColumn: "span 2" }}>
        <AppWindow path="/app/schedule/requests" sidebar={<AppSidebar workspace={WORKSPACE.name} initials="HR" active="Requests" counts={{ Requests: 3 }} />}>
          <div className="req-head">
            <span className="req-eyebrow">Team changes. Reviewed with control.</span>
            <span className="req-title">Requests</span>
            <span className="req-lead">Review time off and shift change requests in one place.</span>
          </div>
          <div className="req-tabs"><span aria-current="true">Time off 2</span><span>Shift changes</span></div>
          <div className="req-list">
            <RequestListHead />
            <RequestRow name="Maya Chen" kind="Time off" when="Oct 15 – Oct 16" decideBy="Oct 14, 4:00 PM" status="Pending" impact={2} />
            <RequestRow name="Jordan Brooks" kind="Leave cancellation" when="Oct 20" decideBy="Oct 19, 5:00 PM" status="Pending" />
          </div>
        </AppWindow>
      </ProductStage>
      <ProductStage width={560}>
        <div className="app-dialog" style={{ padding: "calc(14 * var(--u))", display: "grid", gap: "calc(10 * var(--u))" }}>
          <div className="emp-table">
            <EmployeeTableHead />
            <EmployeeRow name={PEOPLE.alex.name} code="E-1001" initials="AR" status="Active" location="Main St" moreLocations={1} job="Server" />
            <EmployeeRow name={PEOPLE.lucia.name} code="E-1014" initials="LG" status="Onboarding" location="Riverside" job="Prep Cook" />
            <EmployeeRow name={PEOPLE.noah.name} code="E-1015" initials="NK" status="Invited" location="Main St" job="Dishwasher" />
          </div>
          <div className="doc-table">
            <DocTableHead />
            <DocRow employee="Lucía Gómez" location="Riverside" document="Food handler card" status="Needs review" />
            <DocRow employee="Noah Kim" location="Main St" document="Food handler card" status="Missing" />
          </div>
          <UploadCard />
        </div>
      </ProductStage>
      <ProductStage width={900} style={{ gridColumn: "span 2" }}>
        <AppWindow path="/app/announcements" sidebar={<AppSidebar workspace={WORKSPACE.name} initials="HR" items={EMPLOYEE_NAV} active="Announcements" />}>
          <ListHeader eyebrow="The right update. The right people." title="Announcements" lead="Updates your managers have shared with your team." />
          <div className="ann-table">
            <AnnouncementTableHead reader />
            <AnnouncementRow title="New patio hours" preview="Starting Friday the patio opens at 4 PM." cells={["Dana Ortiz", "Oct 12, 2026", <AcknowledgeButton key="a" />]} />
            <AnnouncementRow title="Allergen menu update" preview="Sesame is now listed on the brunch menu." cells={["Dana Ortiz", "Oct 9, 2026", <Acknowledged key="b" />]} />
          </div>
          <div style={{ padding: "0 calc(22 * var(--u)) calc(16 * var(--u))" }}>
            <AudiencePickers pickers={[{ label: "Roles", value: "All roles", count: "All" }, { label: "Locations", value: "Main St", count: "1" }, { label: "Departments", value: "Front of house", count: "1" }, { label: "Jobs", value: "All jobs", count: "All" }]} />
          </div>
        </AppWindow>
      </ProductStage>
      <ProductStage width={700}>
        <WizardFrame workspace="Harbor & Rye" subtitle="Employee onboarding" steps={[{ label: "Welcome", state: "done" }, { label: "Profile", state: "done" }, { label: "Documents", state: "current" }, { label: "Availability", state: "todo", optional: true }, { label: "Review", state: "todo" }]}>
          <span className="pb-stage__title">Your documents</span>
          <span className="pb-stage__lead">Open each one to send a photo or file, or to read it and confirm.</span>
          <UploadCard />
        </WizardFrame>
      </ProductStage>
    </section>
  );
}
