import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Layers,
  Mail,
  Menu,
  MessageSquare,
  PenLine,
  Plus,
  ShieldCheck,
  Smartphone,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { CockpitPreview } from "./CockpitPreview";
import { CookieNotice } from "./CookieNotice";
import { HeroStage } from "./HeroStage";
import {
  audiences,
  cockpitTabs,
  employeeScreens,
  faqs,
  features,
  plans,
  principles,
  steps,
  type CockpitKey,
} from "./landing-content";
import {
  usePrefersReducedMotion,
  useReveal,
  useRotation,
  useScrollProgress,
} from "./useLandingMotion";
import "./landing.css";

export const signUpPath = "/sign-in?mode=signup";

const navLinks = [
  { label: "Product", href: "#how" },
  { label: "Cockpit", href: "#cockpit" },
  { label: "Employee app", href: "#crew" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
] as const;

const featureIcons: Record<(typeof features)[number]["icon"], LucideIcon> = {
  layers: Layers,
  alert: AlertTriangle,
  check: CheckCircle2,
  copy: Copy,
  file: FileSpreadsheet,
  shield: ShieldCheck,
  pen: PenLine,
  calendar: CalendarDays,
  bell: Bell,
};

export function BrandMark({ size = 28 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <path d="M18 46V18h8.5l11 17.4V18H46v28h-8.5l-11-17.4V46H18Z" fill="var(--theme-surface)" />
    </svg>
  );
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const scrolled = useScrollProgress(rootRef);
  useReveal(rootRef);
  const { authenticated, context } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const appDestination = context ? "/app" : authenticated ? "/account/workspaces" : "/sign-in";

  useEffect(() => {
    const previous = document.title;
    document.title = "Newfork | Restaurant scheduling and crew control";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="lp" ref={rootRef} data-scrolled={scrolled ? "true" : "false"}>
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <header className="lp-nav">
        <div className="lp-progress" aria-hidden />
        <div className="lp-nav-inner">
          <a className="lp-brand" href="#top" aria-label="Newfork home">
            <BrandMark />
            <span>Newfork</span>
          </a>
          <nav aria-label="Main" className={`lp-nav-links ${menuOpen ? "is-open" : ""}`}>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
                {link.label}
              </a>
            ))}
            <div className="lp-nav-mobile-ctas">
              <Link to={appDestination}>{authenticated ? "Open workspace" : "Sign in"}</Link>
              {authenticated ? null : (
                <Link className="lp-btn lp-btn-primary" to={signUpPath}>
                  Start free
                </Link>
              )}
            </div>
          </nav>
          <div className="lp-nav-ctas">
            <Link className="lp-nav-signin" to={appDestination}>
              {authenticated ? "Open workspace" : "Sign in"}
            </Link>
            {authenticated ? null : (
              <Link className="lp-btn lp-btn-primary lp-btn-sm" to={signUpPath}>
                Start free
                <ArrowRight size={15} aria-hidden />
              </Link>
            )}
            <button
              type="button"
              className="lp-nav-menu"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero" id="top">
          <div className="lp-hero-backdrop" aria-hidden>
            <div className="lp-hero-grid" />
            <div className="lp-blob lp-blob-a" />
            <div className="lp-blob lp-blob-b" />
            <div className="lp-blob lp-blob-c" />
          </div>
          <div className="lp-container lp-hero-inner">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow lp-hero-in" style={{ "--n": 0 } as CSSProperties}>
                <span className="lp-eyebrow-dot" />
                Scheduling & crew control for restaurants
              </p>
              <h1 className="lp-hero-title">
                <span className="lp-hero-line" style={{ "--n": 1 } as CSSProperties}>
                  Run every shift
                </span>
                <span className="lp-hero-line" style={{ "--n": 2 } as CSSProperties}>
                  from <span className="lp-gradient-text">one cockpit.</span>
                </span>
              </h1>
              <p className="lp-hero-lede lp-hero-in" style={{ "--n": 3 } as CSSProperties}>
                Newfork gives owners and managers a calm command center for the
                week, and gives every crew member the schedule in their pocket.
                Build, publish, swap and approve without a single group text.
              </p>
              <div className="lp-hero-ctas lp-hero-in" style={{ "--n": 4 } as CSSProperties}>
                <Link className="lp-btn lp-btn-primary lp-btn-lg" to={authenticated ? appDestination : signUpPath}>
                  {authenticated ? "Open your workspace" : "Start free"}
                  <ArrowRight size={18} aria-hidden />
                </Link>
                <a className="lp-btn lp-btn-ghost lp-btn-lg" href="#how">
                  See how it works
                </a>
              </div>
              <ul className="lp-hero-proof lp-hero-in" style={{ "--n": 5 } as CSSProperties}>
                <li>
                  <Check size={15} aria-hidden /> Free for one location
                </li>
                <li>
                  <Check size={15} aria-hidden /> No card required
                </li>
                <li>
                  <Check size={15} aria-hidden /> Employees always free
                </li>
              </ul>
            </div>
            <HeroStage />
          </div>
        </section>

        <section className="lp-marquee" aria-label="Built for">
          <p>Built for every kind of kitchen</p>
          <div className="lp-marquee-track" data-paused={reducedMotion ? "true" : "false"}>
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1 ? true : undefined}>
                {audiences.map((audience) => (
                  <li key={audience}>{audience}</li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        <BeforeAfter />

        <section className="lp-section" id="how">
          <div className="lp-container">
            <SectionHeading
              eyebrow="How it works"
              title="From blank week to a running floor in four moves."
              body="Newfork follows the way a restaurant already works: the owner sets the stage, managers run their location, and the crew handles the rest from their phones."
            />
            <ol className="lp-steps">
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className="lp-step"
                  data-reveal
                  style={{ "--n": index } as CSSProperties}
                >
                  <span className="lp-step-no">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <CockpitSection />
        <CrewSection reducedMotion={reducedMotion} />

        <section className="lp-section" id="features">
          <div className="lp-container">
            <SectionHeading
              eyebrow="Everything in the box"
              title="The details that make a Friday night survivable."
            />
            <div className="lp-bento">
              {features.map((feature, index) => {
                const Icon = featureIcons[feature.icon];
                return (
                  <article
                    key={feature.title}
                    className={`lp-bento-card ${"wide" in feature && feature.wide ? "is-wide" : ""}`}
                    data-reveal
                    style={{ "--n": index % 3 } as CSSProperties}
                    onPointerMove={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
                      event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
                    }}
                  >
                    <span className="lp-bento-icon">
                      <Icon size={20} aria-hidden />
                    </span>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lp-section lp-principles">
          <div className="lp-container">
            <SectionHeading
              eyebrow="Our promise"
              title="Four things Newfork will never become."
              light
            />
            <div className="lp-principles-grid">
              {principles.map((principle, index) => (
                <div
                  key={principle.no}
                  className="lp-principle"
                  data-reveal
                  style={{ "--n": index } as CSSProperties}
                >
                  <strong>{principle.no}</strong>
                  <p>{principle.yes}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="security">
          <div className="lp-container lp-security">
            <div data-reveal>
              <SectionHeading
                eyebrow="Security"
                title="Your crew's data stays in your workspace."
                body="Every workspace is isolated at the database level. Every read and every change is checked against the person's role and location before it happens."
                align="left"
              />
              <ul className="lp-checklist">
                <li>
                  <ShieldCheck size={18} aria-hidden /> Row-level security on every table
                </li>
                <li>
                  <ShieldCheck size={18} aria-hidden /> Role- and location-scoped access
                </li>
                <li>
                  <ShieldCheck size={18} aria-hidden /> No SSNs collected, no ad tracking
                </li>
                <li>
                  <ShieldCheck size={18} aria-hidden /> Encrypted in transit and at rest
                </li>
              </ul>
            </div>
            <div className="lp-vault" data-reveal aria-hidden>
              <div className="lp-vault-ring lp-vault-ring-1" />
              <div className="lp-vault-ring lp-vault-ring-2" />
              <div className="lp-vault-ring lp-vault-ring-3" />
              <div className="lp-vault-core">
                <ShieldCheck size={40} />
              </div>
              {["Owner", "Admin", "Manager", "Employee"].map((role, index) => (
                <span key={role} className="lp-vault-role" style={{ "--n": index } as CSSProperties}>
                  {role}
                </span>
              ))}
            </div>
          </div>
        </section>

        <PricingSection authenticated={authenticated} />
        <FaqSection />
        <ContactSection />

        <section className="lp-cta">
          <div className="lp-container lp-cta-inner" data-reveal>
            <h2>Your next schedule could be live tonight.</h2>
            <p>Set up a workspace, invite your crew and publish the week. Free for your first location.</p>
            <div className="lp-hero-ctas">
              <Link className="lp-btn lp-btn-light lp-btn-lg" to={authenticated ? appDestination : signUpPath}>
                {authenticated ? "Open your workspace" : "Create your workspace"}
                <ArrowRight size={18} aria-hidden />
              </Link>
              <Link className="lp-btn lp-btn-outline-light lp-btn-lg" to={appDestination}>
                {authenticated ? "Go to the app" : "I already have an account"}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
      <CookieNotice />
    </div>
  );
}

function SectionHeading({
  align = "center",
  body,
  eyebrow,
  light = false,
  title,
}: {
  readonly align?: "center" | "left";
  readonly body?: string;
  readonly eyebrow: string;
  readonly light?: boolean;
  readonly title: string;
}) {
  return (
    <div className={`lp-heading is-${align} ${light ? "is-light" : ""}`} data-reveal>
      <p className="lp-eyebrow">
        <span className="lp-eyebrow-dot" />
        {eyebrow}
      </p>
      <h2>{title}</h2>
      {body ? <p className="lp-heading-body">{body}</p> : null}
    </div>
  );
}

const chaos = [
  { who: "Jess", text: "can anyone cover sat night??", side: "left" },
  { who: "Tom", text: "who's closing tmrw", side: "right" },
  { who: "Ana", text: "I TOLD you I was off friday", side: "left" },
  { who: "Lee", text: "which version of the schedule is right", side: "right" },
  { who: "Sam", text: "running 10 late, is that ok", side: "left" },
] as const;

const calm = [
  { icon: CheckCircle2, title: "Week published", text: "Everyone got the same schedule at 4:02 PM" },
  { icon: ArrowLeftRight, title: "Sat 5–11 PM covered", text: "Jess → Lee, approved by the Downtown manager" },
  { icon: CalendarDays, title: "Ana is off Friday", text: "Approved time off blocks the day automatically" },
] as const;

function BeforeAfter() {
  const [after, setAfter] = useState(true);
  return (
    <section className="lp-section lp-ba" aria-labelledby="ba-title">
      <div className="lp-container lp-ba-inner">
        <div className="lp-ba-copy" data-reveal>
          <p className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            Monday morning, two ways
          </p>
          <h2 id="ba-title">Trade the group chat for a single source of truth.</h2>
          <p className="lp-heading-body">
            Screenshots of a spreadsheet, three versions of the schedule and a
            dozen "can anyone cover" texts. Newfork replaces all of it with one
            live schedule that the right people can change.
          </p>
          <div className="lp-switch" role="group" aria-label="Compare">
            <button type="button" aria-pressed={!after} onClick={() => setAfter(false)}>
              Before
            </button>
            <button type="button" aria-pressed={after} onClick={() => setAfter(true)}>
              With Newfork
            </button>
            <span className="lp-switch-thumb" data-after={after ? "true" : "false"} aria-hidden />
          </div>
        </div>
        <div className="lp-ba-stage" data-after={after ? "true" : "false"} data-reveal>
          <div className="lp-ba-panel lp-ba-before" aria-hidden={after}>
            <div className="lp-ba-panel-head">
              <MessageSquare size={15} aria-hidden /> Staff group chat · 47 unread
            </div>
            {chaos.map((message, index) => (
              <div
                key={message.text}
                className={`lp-bubble is-${message.side}`}
                style={{ "--n": index } as CSSProperties}
              >
                <small>{message.who}</small>
                {message.text}
              </div>
            ))}
          </div>
          <div className="lp-ba-panel lp-ba-after" aria-hidden={!after}>
            <div className="lp-ba-panel-head">
              <Bell size={15} aria-hidden /> Newfork · Downtown
            </div>
            {calm.map((item, index) => (
              <div key={item.title} className="lp-calm" style={{ "--n": index } as CSSProperties}>
                <item.icon size={18} aria-hidden />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CockpitSection() {
  const [active, setActive] = useState<CockpitKey>("schedule");
  const tab = cockpitTabs.find((item) => item.key === active) ?? cockpitTabs[0];
  return (
    <section className="lp-section lp-cockpit-section" id="cockpit">
      <div className="lp-container">
        <SectionHeading
          eyebrow="Manager cockpit"
          title="Everything a manager touches, one click apart."
          body="Built for the desktop in the office: dense where it helps, calm where it counts."
        />
        <div className="lp-tabs" role="tablist" aria-label="Cockpit areas" data-reveal>
          {cockpitTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`cockpit-tab-${item.key}`}
              aria-selected={item.key === active}
              aria-controls="cockpit-panel"
              tabIndex={item.key === active ? 0 : -1}
              onClick={() => setActive(item.key)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                const position = cockpitTabs.findIndex((entry) => entry.key === active);
                const next =
                  cockpitTabs[
                    (position + (event.key === "ArrowRight" ? 1 : -1) + cockpitTabs.length) %
                      cockpitTabs.length
                  ]!;
                setActive(next.key);
                document.getElementById(`cockpit-tab-${next.key}`)?.focus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          className="lp-cockpit-panel"
          role="tabpanel"
          id="cockpit-panel"
          aria-labelledby={`cockpit-tab-${active}`}
          data-reveal
        >
          <div className="lp-cockpit-copy" key={`copy-${active}`}>
            <h3>{tab.title}</h3>
            <ul className="lp-checklist">
              {tab.points.map((point) => (
                <li key={point}>
                  <Check size={18} aria-hidden /> {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-cockpit-mock" key={`mock-${active}`} aria-hidden>
            <CockpitPreview view={active} />
          </div>
        </div>
      </div>
    </section>
  );
}

function CrewSection({ reducedMotion }: { readonly reducedMotion: boolean }) {
  const [held, setHeld] = useState(false);
  const [index, setIndex] = useRotation(employeeScreens.length, 4200, !reducedMotion && !held);
  const screen = employeeScreens[index]!;
  return (
    <section className="lp-section lp-crew" id="crew">
      <div className="lp-container lp-crew-inner">
        <div className="lp-crew-phone-wrap" data-reveal aria-hidden>
          <div className="lp-crew-halo" />
          <div className="lp-crew-phone" data-screen={screen.key}>
            <div className="lp-phone-notch" />
            <div className="lp-crew-screen">
              <div className="lp-crew-view lp-crew-week">
                <small>Your week</small>
                <strong>Oct 12 – Oct 18</strong>
                {[
                  ["Mon", "11:00 AM – 5:00 PM", "Server"],
                  ["Wed", "11:00 AM – 5:00 PM", "Server"],
                  ["Fri", "5:00 PM – 11:00 PM", "Server"],
                  ["Sat", "5:00 PM – 11:00 PM", "Server"],
                ].map(([day, time, job], row) => (
                  <div key={day} className="lp-crew-shift" style={{ "--n": row } as CSSProperties}>
                    <b>{day}</b>
                    <span>
                      {time}
                      <small>{job} · Downtown</small>
                    </span>
                  </div>
                ))}
              </div>
              <div className="lp-crew-view lp-crew-swap">
                <small>Swap Sat 5–11 PM</small>
                <strong>Who can take it?</strong>
                {["Marcus T. · Server", "Jess K. · Server", "Lee P. · Server"].map((name, row) => (
                  <div key={name} className={`lp-crew-pick ${row === 0 ? "is-picked" : ""}`} style={{ "--n": row } as CSSProperties}>
                    <span className="lp-avatar">{name[0]}</span>
                    {name}
                    {row === 0 ? <Check size={14} /> : null}
                  </div>
                ))}
                <span className="lp-crew-send">Send request</span>
              </div>
              <div className="lp-crew-view lp-crew-off">
                <small>Time off</small>
                <strong>Oct 24 – Oct 26</strong>
                <div className="lp-crew-cal">
                  {Array.from({ length: 21 }, (_, day) => (
                    <i key={day} className={day >= 10 && day <= 12 ? "is-off" : ""} />
                  ))}
                </div>
                <div className="lp-crew-timeline">
                  <span className="is-done">Sent</span>
                  <span className="is-done">Manager reviewing</span>
                  <span className="is-now">Approved</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="lp-crew-copy">
          <SectionHeading
            eyebrow="Employee app"
            title="The crew gets an app they will actually open."
            body="No downloads, no passwords on a sticky note. Every employee sees their own week, trades shifts with eligible coworkers and asks for time off in a few taps."
            align="left"
          />
          <div className="lp-crew-list" role="group" aria-label="Employee app screens">
            {employeeScreens.map((item, position) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={position === index}
                onClick={() => {
                  setIndex(position);
                  setHeld(true);
                }}
              >
                <Smartphone size={18} aria-hidden />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.body}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection({ authenticated }: { readonly authenticated: boolean }) {
  const [annual, setAnnual] = useState(true);
  return (
    <section className="lp-section lp-pricing" id="pricing">
      <div className="lp-container">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple pricing per location. Employees are always free."
        />
        <div className="lp-billing" data-reveal>
          <div className="lp-switch" role="group" aria-label="Billing period">
            <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>
              Monthly
            </button>
            <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>
              Annual <em>save 20%</em>
            </button>
            <span className="lp-switch-thumb" data-after={annual ? "true" : "false"} aria-hidden />
          </div>
        </div>
        <div className="lp-plans">
          {plans.map((plan, index) => {
            const price = annual ? plan.annual : plan.monthly;
            const to = plan.monthly === null ? "#contact" : authenticated ? "/app" : signUpPath;
            return (
              <article
                key={plan.name}
                className={`lp-plan ${plan.featured ? "is-featured" : ""}`}
                data-reveal
                style={{ "--n": index } as CSSProperties}
              >
                {plan.featured ? <span className="lp-plan-badge">Most popular</span> : null}
                <h3>{plan.name}</h3>
                <p className="lp-plan-blurb">{plan.blurb}</p>
                <p className="lp-plan-price">
                  {price === null ? (
                    <strong>Let's talk</strong>
                  ) : (
                    <>
                      <strong key={`${plan.name}-${annual}`} className="lp-plan-amount">
                        ${price}
                      </strong>
                      <span>{plan.unit}</span>
                    </>
                  )}
                </p>
                {plan.monthly === null ? (
                  <a className="lp-btn lp-btn-ghost lp-btn-block" href={to}>
                    {plan.cta}
                  </a>
                ) : (
                  <Link
                    className={`lp-btn lp-btn-block ${plan.featured ? "lp-btn-primary" : "lp-btn-ghost"}`}
                    to={to}
                  >
                    {plan.cta}
                  </Link>
                )}
                <ul className="lp-checklist">
                  {plan.includes.map((item) => (
                    <li key={item}>
                      <Check size={16} aria-hidden /> {item}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
        <p className="lp-pricing-note">
          Prices in USD. Annual plans are billed once a year. Taxes may apply.
        </p>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="lp-section lp-faq" id="faq">
      <div className="lp-container lp-faq-inner">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions owners ask us first."
          body="Something else on your mind? Write to us below."
          align="left"
        />
        <div className="lp-faq-list" data-reveal>
          {faqs.map((faq) => (
            <details key={faq.q} className="lp-faq-item">
              <summary>
                <span>{faq.q}</span>
                <Plus size={18} aria-hidden />
              </summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactSection() {
  const configuredEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim();
  const supportEmail = configuredEmail || (import.meta.env.DEV ? "support@newfork.test" : null);
  const [opened, setOpened] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supportEmail) return;
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? "").trim();
    const subject = `Newfork inquiry from ${field("restaurant") || field("name")}`;
    const body = [
      `Name: ${field("name")}`,
      `Restaurant: ${field("restaurant")}`,
      `Locations: ${field("locations")}`,
      `Reply to: ${field("email")}`,
      "",
      field("message"),
    ].join("\n");
    window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  };

  return (
    <section className="lp-section lp-contact" id="contact">
      <div className="lp-container lp-contact-inner">
        <div data-reveal>
          <SectionHeading
            eyebrow="Contact"
            title="Talk to a person, not a funnel."
            body="Tell us about your restaurant and we will help you set up your first week."
            align="left"
          />
          <ul className="lp-contact-points">
            <li>
              <Mail size={18} aria-hidden />
              {supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : <Link to="/contact">Contact options</Link>}
            </li>
            <li>
              <ShieldCheck size={18} aria-hidden />
              Never send passwords, SSNs or employee records by email.
            </li>
          </ul>
        </div>
        {supportEmail ? (
          <form className="lp-form" onSubmit={submit} data-reveal>
            <div className="lp-form-row">
              <label>
                Your name
                <input name="name" autoComplete="name" required />
              </label>
              <label>
                Work email
                <input name="email" type="email" autoComplete="email" required />
              </label>
            </div>
            <div className="lp-form-row">
              <label>
                Restaurant
                <input name="restaurant" autoComplete="organization" required />
              </label>
              <label>
                Locations
                <select name="locations" defaultValue="1">
                  <option value="1">1</option>
                  <option value="2-5">2–5</option>
                  <option value="6-20">6–20</option>
                  <option value="20+">20+</option>
                </select>
              </label>
            </div>
            <label>
              How can we help?
              <textarea name="message" rows={4} required />
            </label>
            <button type="submit" className="lp-btn lp-btn-primary lp-btn-block">
              Write to us
              <ArrowRight size={16} aria-hidden />
            </button>
            <p className="lp-form-note" role="status">
              {opened
                ? "Your mail app should open with the message ready to send."
                : "This opens your mail app with your message filled in. Nothing is sent until you press send."}
            </p>
          </form>
        ) : (
          <div className="lp-form lp-form-empty" data-reveal>
            <p>See our contact page for the channels available in your region.</p>
            <Link className="lp-btn lp-btn-primary" to="/contact">
              Contact options <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-inner">
        <div className="lp-footer-brand">
          <a className="lp-brand" href="#top" aria-label="Newfork home">
            <BrandMark />
            <span>Newfork</span>
          </a>
          <p>Restaurant scheduling and crew control. Made for the people who keep the lights on.</p>
        </div>
        <nav aria-label="Product">
          <strong>Product</strong>
          <a href="#how">How it works</a>
          <a href="#cockpit">Manager cockpit</a>
          <a href="#crew">Employee app</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <nav aria-label="Company">
          <strong>Company</strong>
          <a href="#faq">FAQ</a>
          <a href="#contact">Contact sales</a>
          <Link to="/contact">Support</Link>
          <Link to="/sign-in">Sign in</Link>
        </nav>
        <nav aria-label="Legal">
          <strong>Legal</strong>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/cookies">Cookies</Link>
          <Link to="/accessibility">Accessibility</Link>
          <Link to="/your-privacy-choices">Your privacy choices</Link>
        </nav>
      </div>
      <div className="lp-container lp-footer-base">
        <span>© {new Date().getFullYear()} Newfork. All rights reserved.</span>
        <span>Made for restaurants in the United States.</span>
      </div>
    </footer>
  );
}
