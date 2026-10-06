import {
  ArrowRight,
  Ban,
  BellOff,
  Database,
  Eye,
  Fingerprint,
  Gauge,
  Lock,
  Mail,
  Minus,
  Plus,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  FAQS,
  PRICING,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  supportEmail,
} from "./landing-content";
import { useInView } from "./motion";

const FLOW = [
  {
    title: "Diego asks",
    body: "Swap Friday for Maya's Saturday, from his phone.",
  },
  {
    title: "Newfork checks",
    body: "Same job, same location, no approved time off. Eligible.",
  },
  {
    title: "The right manager decides",
    body: "Only the Mission St. managers see it. One tap.",
  },
  {
    title: "The schedule updates",
    body: "The grid changes and both of them are notified.",
  },
] as const;

export function TeamControlFlow() {
  const [ref, inView] = useInView<HTMLOListElement>({
    once: true,
    threshold: 0,
  });
  return (
    <section className="lp-section lp-flow" aria-labelledby="flow-title">
      <div className="lp-container">
        <header className="lp-section-head lp-section-head-center">
          <p className="lp-eyebrow lp-eyebrow-light">Team control</p>
          <h2 id="flow-title">
            A shift changes hands in under a minute. Nobody texts anybody.
          </h2>
        </header>
        <ol className={`lp-flow-track${inView ? " is-in" : ""}`} ref={ref}>
          <span className="lp-flow-line" aria-hidden="true">
            <i />
          </span>
          {FLOW.map((step, index) => (
            <li
              key={step.title}
              style={{ transitionDelay: `${200 + index * 380}ms` }}
            >
              <span className="lp-flow-dot" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const BEFORE = [
  "A photo of the whiteboard in the group chat",
  "“Can anyone cover Sunday?” at 11 PM",
  "Swaps agreed in DMs the manager never sees",
  "Time off on a sticky note behind the register",
  "Last week's spreadsheet, copied and fixed by hand",
];
const AFTER = [
  "One published schedule on every phone",
  "Cover offered only to people who can take it",
  "Every swap approved by the right manager",
  "Approved time off blocks the shift automatically",
  "Next week starts from a template",
];

export function BeforeAfter() {
  const [after, setAfter] = useState(true);
  return (
    <section className="lp-section lp-compare" aria-labelledby="compare-title">
      <div className="lp-container lp-compare-layout">
        <header className="lp-section-head">
          <p className="lp-eyebrow">Before and after</p>
          <h2 id="compare-title">Your Tuesday, with and without Newfork.</h2>
          <div className="lp-switch" role="group" aria-label="Compare">
            <button
              aria-pressed={!after}
              className={!after ? "is-active" : undefined}
              onClick={() => setAfter(false)}
              type="button"
            >
              Without
            </button>
            <button
              aria-pressed={after}
              className={after ? "is-active" : undefined}
              onClick={() => setAfter(true)}
              type="button"
            >
              With Newfork
            </button>
          </div>
        </header>
        <div
          className={`lp-compare-card${after ? " is-after" : " is-before"}`}
          aria-live="polite"
        >
          <ul key={after ? "after" : "before"}>
            {(after ? AFTER : BEFORE).map((line, index) => (
              <li key={line} style={{ animationDelay: `${index * 70}ms` }}>
                <span className="lp-compare-mark" aria-hidden="true">
                  {after ? "✓" : "✕"}
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const PRINCIPLES: readonly { icon: ReactNode; title: string; body: string }[] =
  [
    {
      icon: <SlidersHorizontal size={20} aria-hidden />,
      title: "No settings maze",
      body: "Sensible defaults out of the box. A setting exists only where restaurants really work differently.",
    },
    {
      icon: <BellOff size={20} aria-hidden />,
      title: "No notification noise",
      body: "Updates go to the person who decides and the people affected. Everyone else keeps working.",
    },
    {
      icon: <Gauge size={20} aria-hidden />,
      title: "No enterprise drag",
      body: "A manager's five-minute job takes five minutes. No extra approval steps for the sake of it.",
    },
    {
      icon: <Sparkles size={20} aria-hidden />,
      title: "No toy look",
      body: "A calm, serious tool for people running a business. No confetti, no badges, no gimmicks.",
    },
  ];

export function Principles() {
  const [ref, inView] = useInView<HTMLDivElement>({ once: true, threshold: 0 });
  return (
    <section
      className="lp-section lp-principles"
      aria-labelledby="principles-title"
    >
      <div className="lp-container">
        <header className="lp-section-head">
          <p className="lp-eyebrow">What Newfork will never be</p>
          <h2 id="principles-title">Designed by saying no.</h2>
          <p className="lp-lede">
            Restaurant software tends to grow until nobody can find anything.
            These are the four promises we hold every screen to.
          </p>
        </header>
        <div className={`lp-principle-grid${inView ? " is-in" : ""}`} ref={ref}>
          {PRINCIPLES.map((principle, index) => (
            <article
              key={principle.title}
              style={{ transitionDelay: `${index * 90}ms` }}
            >
              <span className="lp-principle-icon">{principle.icon}</span>
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const TRUST: readonly { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Database size={18} aria-hidden />,
    title: "Isolated workspaces",
    body: "Each business's data is separated at the database level, not just hidden in the interface.",
  },
  {
    icon: <Lock size={18} aria-hidden />,
    title: "Checked on every request",
    body: "Role and location are verified before anything is read or changed.",
  },
  {
    icon: <Eye size={18} aria-hidden />,
    title: "Need-to-know visibility",
    body: "Pending requests are seen by the people deciding and the person asking. Not by peers.",
  },
  {
    icon: <Fingerprint size={18} aria-hidden />,
    title: "Sensitive actions recorded",
    body: "Security-relevant actions, such as ownership and role changes, leave an audit trail.",
  },
  {
    icon: <Ban size={18} aria-hidden />,
    title: "No ad tracking",
    body: "No advertising cookies, no cross-site tracking, no selling your team's data.",
  },
  {
    icon: <ScrollText size={18} aria-hidden />,
    title: "Plain-language policies",
    body: "Our privacy, terms and cookie pages say what we do in words anyone can read.",
  },
];

export function TrustBand() {
  return (
    <section
      className="lp-section lp-trust"
      id="security"
      aria-labelledby="trust-title"
    >
      <div className="lp-container">
        <header className="lp-section-head">
          <p className="lp-eyebrow">Security and privacy</p>
          <h2 id="trust-title">
            Your team's information stays with your team.
          </h2>
        </header>
        <div className="lp-trust-grid">
          {TRUST.map((item) => (
            <article key={item.title}>
              <span className="lp-trust-icon">{item.icon}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  const email = supportEmail();
  return (
    <section className="lp-section lp-faq" id="faq" aria-labelledby="faq-title">
      <div className="lp-container lp-faq-layout">
        <header className="lp-section-head">
          <p className="lp-eyebrow">FAQ</p>
          <h2 id="faq-title">Questions owners ask us.</h2>
          <p className="lp-lede">
            Something else on your mind?{" "}
            {email ? (
              <a href={`mailto:${email}`}>Email {email}</a>
            ) : (
              <Link to="/contact">Contact us</Link>
            )}
            .
          </p>
        </header>
        <div className="lp-faq-list">
          {FAQS.map((faq) => (
            <details key={faq.question}>
              <summary>
                <span>{faq.question}</span>
                <span className="lp-faq-icon" aria-hidden="true">
                  <Plus size={18} className="lp-faq-plus" />
                  <Minus size={18} className="lp-faq-minus" />
                </span>
              </summary>
              <div className="lp-faq-answer">
                <p>{faq.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactBand() {
  const email = supportEmail();
  return (
    <section
      className="lp-section lp-contact"
      id="contact"
      aria-labelledby="contact-title"
    >
      <div className="lp-container lp-contact-grid">
        <article>
          <Mail size={20} aria-hidden />
          <h2 id="contact-title">Talk to a person</h2>
          <p>
            Questions about fit, a group with many locations, or help moving off
            spreadsheets. We read every message.
          </p>
          {email ? (
            <a className="lp-btn lp-btn-secondary" href={`mailto:${email}`}>
              {email}
              <ArrowRight size={16} aria-hidden />
            </a>
          ) : (
            <Link className="lp-btn lp-btn-secondary" to="/contact">
              Contact options
              <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </article>
        <article>
          <Lock size={20} aria-hidden />
          <h3>Already using Newfork?</h3>
          <p>
            Signed-in owners and managers can reach support from Settings with
            their workspace details ready to share.
          </p>
          <Link className="lp-btn lp-btn-secondary" to={SIGN_IN_PATH}>
            Sign in
            <ArrowRight size={16} aria-hidden />
          </Link>
        </article>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="lp-final" aria-labelledby="final-title">
      <div className="lp-final-bg" aria-hidden="true">
        {Array.from({ length: 28 }, (_, index) => (
          <i key={index} style={{ ["--i" as string]: index }} />
        ))}
      </div>
      <div className="lp-container lp-final-inner">
        <h2 id="final-title">Next week's schedule could already be done.</h2>
        <p>
          Set up your locations, invite your team and publish your first week
          today. Free for {PRICING.trialDays} days.
        </p>
        <div className="lp-hero-actions">
          <Link className="lp-btn lp-btn-primary lp-btn-lg" to={SIGN_UP_PATH}>
            Start free trial
            <ArrowRight size={18} aria-hidden />
          </Link>
          <Link
            className="lp-btn lp-btn-ghost-light lp-btn-lg"
            to={SIGN_IN_PATH}
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Manager cockpit", href: "#cockpit" },
      { label: "Employee app", href: "#employee-app" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Security", href: "#security" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Start free trial", to: SIGN_UP_PATH },
      { label: "Sign in", to: SIGN_IN_PATH },
      { label: "Forgot password", to: "/forgot-password" },
      { label: "FAQ", href: "#faq" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
      { label: "Cookies", to: "/cookies" },
      { label: "Accessibility", to: "/accessibility" },
      { label: "Your privacy choices", to: "/your-privacy-choices" },
    ],
  },
] as const;

export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-grid">
        <div className="lp-footer-brand">
          <Link className="lp-logo" to="/" aria-label="Newfork home">
            <LogoMark />
            <span>Newfork</span>
          </Link>
          <p>
            Restaurant scheduling and team operations, built for owners,
            managers and the people who work the floor.
          </p>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav aria-label={column.title} key={column.title}>
            <h2>{column.title}</h2>
            <ul>
              {column.links.map((link) => (
                <li key={link.label}>
                  {"to" in link ? (
                    <Link to={link.to}>{link.label}</Link>
                  ) : (
                    <a href={link.href}>{link.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="lp-container lp-footer-base">
        <span>
          © {new Date().getFullYear()} Newfork. Made for restaurants in the
          United States.
        </span>
        <span>No ad tracking. Essential storage only.</span>
      </div>
    </footer>
  );
}

export function LogoMark() {
  return (
    <svg className="lp-logo-mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <path
        d="M18 46V18h8.5l11 17.4V18H46v28h-8.5l-11-17.4V46H18Z"
        fill="#F9FAFB"
      />
    </svg>
  );
}
