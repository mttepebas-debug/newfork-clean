import {
  Accessibility,
  ArrowRight,
  Cookie,
  Mail,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";

const RELEASE_DATE = "August 17, 2026";

function TrustPage({
  children,
  eyebrow,
  icon,
  intro,
  title,
}: {
  readonly children: ReactNode;
  readonly eyebrow: string;
  readonly icon: ReactNode;
  readonly intro: string;
  readonly title: string;
}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | Newfork`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  return (
    <article className="public-document">
      <meta name="description" content={intro} />
      <header className="public-document-heading">
        <span className="public-document-icon" aria-hidden>
          {icon}
        </span>
        <div>
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          <div>{intro}</div>
        </div>
      </header>
      <div className="public-document-status">
        <strong>Pre-release</strong>
        <span>
          This page documents the current clean rebuild and is not a final
          production legal notice.
        </span>
        <time dateTime="2026-08-17">Updated {RELEASE_DATE}</time>
      </div>
      <div className="public-document-body">{children}</div>
    </article>
  );
}

function DocumentSection({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPage() {
  return (
    <TrustPage
      eyebrow="Trust center"
      icon={<ShieldCheck size={22} />}
      intro="A plain-language inventory of the information used by the current product foundation."
      title="Privacy"
    >
      <DocumentSection title="Information in the current product">
        <dl className="public-data-list">
          <div>
            <dt>Account and workspace</dt>
            <dd>
              Email, display name, theme preference, workspace membership,
              assigned role, and location access.
            </dd>
          </div>
          <div>
            <dt>Employee onboarding</dt>
            <dd>
              Profile and availability details, uploaded documents,
              acknowledgement records, and an encrypted SSN field when the
              onboarding flow requires it.
            </dd>
          </div>
          <div>
            <dt>Restaurant operations</dt>
            <dd>
              Locations, jobs, schedules, requests, announcements,
              notifications, and related audit events.
            </dd>
          </div>
          <div>
            <dt>Service context</dt>
            <dd>
              Authentication session data and limited workspace identifiers
              needed to authorize requests and investigate support issues.
            </dd>
          </div>
        </dl>
      </DocumentSection>

      <DocumentSection title="How the foundation uses information">
        <ul>
          <li>Authenticate users and resolve the correct workspace.</li>
          <li>Enforce role and location access at the service boundary.</li>
          <li>
            Provide scheduling, onboarding, and team coordination workflows.
          </li>
          <li>Record security-relevant and operational audit events.</li>
          <li>Maintain personal preferences and notification state.</li>
        </ul>
      </DocumentSection>

      <DocumentSection title="Not configured in this rebuild">
        <p>
          The clean rebuild does not configure advertising, cross-context
          behavioral tracking, an optional analytics SDK, biometric collection,
          geofencing, payroll processing, or compliance evaluation.
        </p>
      </DocumentSection>

      <DocumentSection title="Required before production">
        <p>
          A deployment owner must publish the responsible legal entity, verified
          contact channels, retention periods, subprocessors, regional transfer
          details, applicable rights, request procedures, and an effective date
          before relying on this page as a production privacy notice.
        </p>
        <Link className="public-inline-link" to="/your-privacy-choices">
          Review current privacy choices
          <ArrowRight size={15} aria-hidden />
        </Link>
      </DocumentSection>
    </TrustPage>
  );
}

export function TermsPage() {
  return (
    <TrustPage
      eyebrow="Trust center"
      icon={<ScrollText size={22} />}
      intro="The current use boundary for a product foundation that is not yet offered as a commercial service."
      title="Terms"
    >
      <DocumentSection title="Current status">
        <p>
          Newfork Clean is a pre-release development product. These notes
          explain the current boundary; they are not final commercial terms and
          do not create a paid service commitment.
        </p>
      </DocumentSection>

      <DocumentSection title="Expected use">
        <ul>
          <li>
            Use only workspaces and employee information you are authorized to
            manage.
          </li>
          <li>
            Keep account credentials private and report suspected access issues.
          </li>
          <li>
            Review schedule and communication changes before relying on them
            operationally.
          </li>
          <li>
            Do not treat the product as payroll, legal, tax, or compliance
            advice.
          </li>
        </ul>
      </DocumentSection>

      <DocumentSection title="Not part of the current service">
        <p>
          Billing, subscriptions, service levels, production support guarantees,
          payroll processing, labor-law decisions, kiosk operations, and
          external message delivery are not offered by this build.
        </p>
      </DocumentSection>

      <DocumentSection title="Required before commercial launch">
        <p>
          Final terms require verified provider identity, service scope,
          acceptable-use rules, account termination and data-export procedures,
          warranty and liability review, billing terms, governing law, dispute
          process, and an effective date approved for the deployment.
        </p>
      </DocumentSection>
    </TrustPage>
  );
}

export function AccessibilityPage() {
  return (
    <TrustPage
      eyebrow="Product access"
      icon={<Accessibility size={22} />}
      intro="Current accessibility work and known evidence limits for the clean rebuild."
      title="Accessibility"
    >
      <DocumentSection title="Assessment status">
        <p>
          Newfork Clean has not completed a formal accessibility evaluation. It
          does not currently claim conformance with a specific WCAG level.
        </p>
      </DocumentSection>

      <DocumentSection title="Measures in the current interface">
        <ul>
          <li>Semantic landmarks, headings, labels, and named controls.</li>
          <li>
            Keyboard-visible focus styles and keyboard-operable navigation.
          </li>
          <li>Responsive layouts that support narrow mobile viewports.</li>
          <li>Light and dark themes with restrained operational color use.</li>
          <li>Status text that does not rely only on color.</li>
        </ul>
      </DocumentSection>

      <DocumentSection title="Known evidence limits">
        <p>
          Automated component checks and focused browser inspection do not
          replace assistive-technology testing, keyboard-only route review,
          zoom/reflow evaluation, or a WCAG audit. Those remain Phase 10 work.
        </p>
      </DocumentSection>

      <DocumentSection title="Report a barrier">
        <p>
          Describe the page, action, browser, assistive technology, and the
          alternative you need. Do not include passwords, SSNs, employee files,
          or other sensitive information in an initial report.
        </p>
        <Link className="public-inline-link" to="/contact">
          Contact Newfork
          <ArrowRight size={15} aria-hidden />
        </Link>
      </DocumentSection>
    </TrustPage>
  );
}

export function ContactPage() {
  const { authenticated } = useAuth();
  const configuredEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim();
  const supportEmail =
    configuredEmail || (import.meta.env.DEV ? "support@newfork.test" : null);

  return (
    <TrustPage
      eyebrow="Support"
      icon={<Mail size={22} />}
      intro="Use a configured channel without silently submitting personal or workspace information."
      title="Contact"
    >
      <DocumentSection title="Public inquiries">
        {supportEmail ? (
          <>
            <p>
              Email opens in your mail application. Newfork does not attach
              account, workspace, or diagnostic data automatically.
            </p>
            <a className="public-contact-link" href={`mailto:${supportEmail}`}>
              <Mail size={17} aria-hidden />
              {supportEmail}
            </a>
          </>
        ) : (
          <p>
            A public support email has not been configured for this deployment.
            No contact form is shown because there is no approved delivery or
            retention service behind it.
          </p>
        )}
      </DocumentSection>

      <DocumentSection title="Workspace support">
        <p>
          Signed-in users can open Support to copy non-sensitive workspace
          context when a support representative requests it.
        </p>
        <Link
          className="public-inline-link"
          to={authenticated ? "/app/settings/support" : "/sign-in"}
        >
          {authenticated
            ? "Open workspace support"
            : "Sign in for workspace support"}
          <ArrowRight size={15} aria-hidden />
        </Link>
      </DocumentSection>

      <DocumentSection title="Before sending information">
        <p>
          Do not send passwords, authentication codes, SSNs, identity documents,
          payment information, or full employee records in an initial message.
        </p>
      </DocumentSection>
    </TrustPage>
  );
}

export function CookiesPage() {
  return (
    <TrustPage
      eyebrow="Cookies"
      icon={<Cookie size={22} />}
      intro="What Newfork stores in your browser, why, and how to clear it."
      title="Cookie policy"
    >
      <DocumentSection title="Essential storage only">
        <p>
          Newfork uses browser storage only where the service cannot work
          without it. There are no advertising cookies, no cross-site tracking
          and no optional analytics in this build, so there is nothing to opt
          in or out of.
        </p>
      </DocumentSection>

      <DocumentSection title="What we store">
        <ul>
          <li>
            <strong>Sign-in session.</strong> Keeps you signed in between
            visits and protects your account. Removed when you sign out.
          </li>
          <li>
            <strong>Interface preferences.</strong> Remembers choices you make
            in the app, such as the selected workspace or view.
          </li>
          <li>
            <strong>Cookie notice.</strong> Remembers that you have seen the
            notice on the home page so it does not appear again.
          </li>
        </ul>
      </DocumentSection>

      <DocumentSection title="Managing storage">
        <p>
          You can clear cookies and site data at any time in your browser
          settings. Clearing them signs you out and resets your preferences.
        </p>
      </DocumentSection>

      <DocumentSection title="Changes">
        <p>
          If Newfork ever adds optional cookies, this page will list them and
          you will be asked for consent before they are set.
        </p>
        <Link className="public-inline-link" to="/your-privacy-choices">
          Your privacy choices
          <ArrowRight size={15} aria-hidden />
        </Link>
      </DocumentSection>
    </TrustPage>
  );
}

export function PrivacyChoicesPage() {
  return (
    <TrustPage
      eyebrow="Privacy controls"
      icon={<SlidersHorizontal size={22} />}
      intro="The actual storage and tracking choices available in the current clean rebuild."
      title="Your privacy choices"
    >
      <DocumentSection title="Optional tracking status">
        <div className="public-choice-status">
          <span aria-hidden />
          <div>
            <strong>Optional tracking is not configured</strong>
            <p>
              No advertising, cross-context behavioral tracking, or optional
              analytics SDK is active in this build.
            </p>
          </div>
        </div>
      </DocumentSection>

      <DocumentSection title="Essential browser storage">
        <p>
          Supabase authentication may store session information so signed-in
          users can remain authenticated. Newfork also stores the selected theme
          and product preferences needed to provide the requested interface.
        </p>
      </DocumentSection>

      <DocumentSection title="Why there is no opt-out switch">
        <p>
          A switch would imply that optional tracking exists and that a durable
          preference service honors the choice. Neither is true in the current
          build. Any future analytics, advertising, or consent technology
          requires a separately reviewed data inventory and a real enforcement
          mechanism.
        </p>
      </DocumentSection>

      <DocumentSection title="Production rights requests">
        <p>
          The responsible deployment owner must publish applicable access,
          correction, deletion, portability, and opt-out procedures before
          production. This pre-release build does not claim a jurisdiction-wide
          request workflow.
        </p>
        <Link className="public-inline-link" to="/privacy">
          Read the privacy summary
          <ArrowRight size={15} aria-hidden />
        </Link>
      </DocumentSection>
    </TrustPage>
  );
}
