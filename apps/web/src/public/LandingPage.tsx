import {
  ArrowRight,
  BellRing,
  CalendarCheck2,
  CalendarRange,
  Check,
  ChevronDown,
  FileSignature,
  Layers3,
  MapPin,
  Megaphone,
  Menu,
  Repeat2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Umbrella,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import "./landing.css";

const signUpPath = "/sign-in?mode=signup";
const cookieConsentKey = "nf-cookie-consent";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Cockpit", href: "#cockpit" },
  { label: "Crew app", href: "#crew" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;

const rotatingWords = ["schedule", "swap", "cover", "publish"] as const;

// Hero grid: one week, five people. Each shift drops in on its own delay.
const heroDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const heroCrew = [
  { name: "Ayşe K.", job: "Server", tone: "server" },
  { name: "José P.", job: "Line cook", tone: "kitchen" },
  { name: "Maya R.", job: "Host", tone: "host" },
  { name: "Ali D.", job: "Bartender", tone: "bar" },
  { name: "Sam T.", job: "Dish", tone: "kitchen" },
] as const;
const heroShifts: { row: number; day: number; label: string; off?: boolean; ghost?: boolean }[] = [
  { row: 0, day: 0, label: "9–5" },
  { row: 0, day: 1, label: "9–5" },
  { row: 0, day: 3, off: true, label: "Time off" },
  { row: 0, day: 4, label: "4–11" },
  { row: 0, day: 5, label: "4–11" },
  { row: 1, day: 0, label: "7–3" },
  { row: 1, day: 2, label: "7–3" },
  { row: 1, day: 3, label: "7–3" },
  { row: 1, day: 5, label: "2–10" },
  { row: 1, day: 6, label: "2–10" },
  { row: 2, day: 1, label: "5–10" },
  { row: 2, day: 2, ghost: true, label: "Beşiktaş" },
  { row: 2, day: 4, label: "5–10" },
  { row: 2, day: 5, label: "5–11" },
  { row: 3, day: 3, label: "6–2" },
  { row: 3, day: 4, label: "6–2" },
  { row: 3, day: 5, label: "6–2" },
  { row: 3, day: 6, label: "4–12" },
  { row: 4, day: 0, label: "11–7" },
  { row: 4, day: 2, label: "11–7" },
  { row: 4, day: 6, label: "11–7" },
];

const features = [
  {
    icon: CalendarRange,
    title: "Drag-and-drop weekly schedule",
    body: "Build the week in a grid that reads like your floor. Drafts stay private until you publish.",
  },
  {
    icon: BellRing,
    title: "Conflicts before they happen",
    body: "Availability, approved time off, overlaps and rest gaps are flagged the moment you place a shift.",
  },
  {
    icon: Repeat2,
    title: "Swaps and pickups, approved up the chain",
    body: "Crew trade shifts among people who are actually eligible. The right manager approves in one tap.",
  },
  {
    icon: MapPin,
    title: "Built for more than one location",
    body: "Each location keeps its own manager. Shifts someone works elsewhere show as ghosts, so nobody gets double-booked.",
  },
  {
    icon: Umbrella,
    title: "Time off without the text thread",
    body: "Requests land with the person who decides. Approved days block the grid automatically.",
  },
  {
    icon: Megaphone,
    title: "Announcements people acknowledge",
    body: "Post the new menu or the health inspection date and see exactly who has read it.",
  },
  {
    icon: FileSignature,
    title: "Documents and e-signatures",
    body: "Collect certifications and signed policies during onboarding, with expiry reminders built in.",
  },
  {
    icon: Layers3,
    title: "Templates and exports",
    body: "Save a good week as a template. Print or share a clean PDF for the back-of-house wall.",
  },
  {
    icon: ShieldCheck,
    title: "Roles that match your restaurant",
    body: "Owner, admin, location manager and crew each see what they need, and nothing they should not.",
  },
] as const;

const steps = [
  { n: "01", title: "Create your workspace", body: "Add your locations and the jobs you staff: server, line, host, bar." },
  { n: "02", title: "Invite your team", body: "Send invites by email. People join from their phone in under two minutes." },
  { n: "03", title: "Build and publish", body: "Lay out the week, resolve the flags, press Publish. Everyone is notified." },
  { n: "04", title: "Let the crew self-serve", body: "Swaps, pickups, time off and availability flow to you for one-tap decisions." },
] as const;

// Placeholder pricing until the launch price is decided; edit here only.
const plans = [
  {
    name: "Early access",
    price: "$0",
    cadence: "while in early access",
    blurb: "Everything Newfork does today, for restaurants joining early.",
    items: ["Unlimited locations", "Unlimited team members", "Schedule, requests and time off", "Announcements and documents", "Email support"],
    cta: "Start free",
    featured: true,
  },
  {
    name: "Team",
    price: "Coming soon",
    cadence: "per location / month",
    blurb: "For a single restaurant that wants the full cockpit.",
    items: ["One location", "Unlimited team members", "Schedule templates and exports", "Crew app for every employee"],
    cta: "Join early access",
  },
  {
    name: "Group",
    price: "Coming soon",
    cadence: "per location / month",
    blurb: "For 2–5 location groups with a manager at each door.",
    items: ["Multiple locations", "Location managers and admins", "Cross-location ghost shifts", "Priority support"],
    cta: "Join early access",
  },
] as const;

const faqs = [
  {
    q: "Who is Newfork for?",
    a: "Restaurants in the United States, from a single location to groups of a few locations with a manager at each one and an owner overseeing them all.",
  },
  {
    q: "Do my employees need to download anything?",
    a: "No. The crew app runs in the phone's browser. They sign in with the invite you send and see their shifts, requests and announcements right away.",
  },
  {
    q: "Can employees swap or pick up shifts on their own?",
    a: "They can ask. Newfork only offers a shift to people who work that job at that location, and the request goes to the manager who decides.",
  },
  {
    q: "What happens if I schedule someone during their time off?",
    a: "Newfork warns you while you are placing the shift. Availability is always a warning; approved time off is shown in red so it is hard to miss.",
  },
  {
    q: "Does Newfork do payroll or time clocks?",
    a: "Not today. Newfork focuses on scheduling and team operations so it does that job well. Time tracking is on our roadmap.",
  },
  {
    q: "How is my data protected?",
    a: "Every workspace is isolated at the database level, access follows each person's role, and connections are encrypted. See our Privacy page for details.",
  },
  {
    q: "Can I try it before paying?",
    a: "Yes. Early access is free. Create a workspace, invite a few people and run a real week.",
  },
] as const;

function useReveal() {
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function RotatingWord() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setIndex((current) => (current + 1) % rotatingWords.length),
      2200,
    );
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="lp-rotator" aria-live="off">
      <span key={rotatingWords[index]} className="lp-rotator-word">
        {rotatingWords[index]}
      </span>
    </span>
  );
}

function HeroCockpit() {
  const stageRef = useRef<HTMLDivElement>(null);

  // A light parallax tilt that follows the pointer on desktop.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      stage.style.setProperty("--tilt-x", `${(-y * 6).toFixed(2)}deg`);
      stage.style.setProperty("--tilt-y", `${(x * 8).toFixed(2)}deg`);
    };
    const onLeave = () => {
      stage.style.setProperty("--tilt-x", "0deg");
      stage.style.setProperty("--tilt-y", "0deg");
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="lp-stage" ref={stageRef} aria-hidden="true">
      <div className="lp-orbit lp-orbit-a" />
      <div className="lp-orbit lp-orbit-b" />

      <div className="lp-cockpit">
        <div className="lp-cockpit-bar">
          <span className="lp-dots"><i /><i /><i /></span>
          <span className="lp-cockpit-title">Schedule · Kadıköy · Oct 12–18</span>
          <span className="lp-publish">
            <span className="lp-publish-label">Publish</span>
            <span className="lp-publish-done"><Check size={13} /> Published</span>
          </span>
        </div>
        <div className="lp-grid">
          <div className="lp-grid-head lp-grid-corner">Team</div>
          {heroDays.map((day) => (
            <div className="lp-grid-head" key={day}>{day}</div>
          ))}
          {heroCrew.map((person, row) => (
            <div className="lp-grid-row" key={person.name} style={{ "--row": row } as CSSProperties}>
              <div className="lp-person">
                <span className={`lp-avatar tone-${person.tone}`}>{person.name.slice(0, 1)}</span>
                <span>
                  <b>{person.name}</b>
                  <small>{person.job}</small>
                </span>
              </div>
              {heroDays.map((day, dayIndex) => {
                const shift = heroShifts.find((s) => s.row === row && s.day === dayIndex);
                return (
                  <div className="lp-cell" key={day}>
                    {shift ? (
                      <span
                        className={`lp-shift tone-${person.tone}${shift.off ? " is-off" : ""}${shift.ghost ? " is-ghost" : ""}`}
                        style={{ "--d": `${(row * 7 + dayIndex) * 0.07}s` } as CSSProperties}
                      >
                        {shift.label}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          <span className="lp-drag">
            <span className="lp-shift tone-server lp-drag-chip">5–11</span>
            <svg className="lp-cursor" viewBox="0 0 24 24" width="22" height="22">
              <path d="M4 2l16 9-7 2-3 7z" />
            </svg>
          </span>
          <span className="lp-flag">
            <BellRing size={13} /> Ayşe prefers not to work Sun
          </span>
        </div>
      </div>

      <div className="lp-phone">
        <div className="lp-phone-notch" />
        <div className="lp-phone-screen">
          <p className="lp-phone-hello">Hi Ayşe</p>
          <p className="lp-phone-sub">Your next shift</p>
          <div className="lp-phone-card">
            <strong>Tue · 9:00 AM – 5:00 PM</strong>
            <span>Server · Kadıköy</span>
          </div>
          <div className="lp-phone-toast">
            <CalendarCheck2 size={15} />
            <span><b>Schedule published</b><br />Oct 12–18 is live</span>
          </div>
          <div className="lp-phone-toast lp-phone-toast-2">
            <Repeat2 size={15} />
            <span><b>Swap approved</b><br />José takes Fri 4–11</span>
          </div>
          <div className="lp-phone-tabs"><i /><i /><i /><i /></div>
        </div>
      </div>

      <div className="lp-chip lp-chip-a"><Users size={14} /> 42 people · 3 locations</div>
      <div className="lp-chip lp-chip-b"><Sparkles size={14} /> 0 conflicts</div>
    </div>
  );
}

function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      setVisible(!window.localStorage.getItem(cookieConsentKey));
    } catch {
      setVisible(true);
    }
  }, []);
  if (!visible) return null;
  const decide = (choice: "essential" | "all") => {
    try {
      window.localStorage.setItem(cookieConsentKey, choice);
    } catch {
      // Storage blocked: the banner simply returns next visit.
    }
    setVisible(false);
  };
  return (
    <div className="lp-cookies" role="region" aria-label="Cookie notice">
      <p>
        We use essential cookies to keep you signed in and secure. Optional analytics help us
        improve Newfork. <Link to="/your-privacy-choices">Your privacy choices</Link>
      </p>
      <div>
        <button type="button" className="lp-btn lp-btn-ghost" onClick={() => decide("essential")}>
          Essential only
        </button>
        <button type="button" className="lp-btn lp-btn-primary" onClick={() => decide("all")}>
          Accept all
        </button>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { authenticated, context } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useReveal();

  useEffect(() => {
    const previous = document.title;
    document.title = "Newfork · Restaurant scheduling that runs itself";
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.title = previous;
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const appDestination = context ? "/app" : authenticated ? "/account/workspaces" : "/sign-in";

  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <header className={`lp-nav${scrolled ? " is-scrolled" : ""}`}>
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand" aria-label="Newfork home">
            <span className="lp-brand-mark" aria-hidden="true">
              <i /><i /><i />
            </span>
            NEWFORK
          </Link>
          <nav aria-label="Primary" className={menuOpen ? "is-open" : undefined}>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
                {link.label}
              </a>
            ))}
            <Link to="/contact" onClick={() => setMenuOpen(false)}>Contact</Link>
          </nav>
          <div className="lp-nav-actions">
            {authenticated ? (
              <Link className="lp-btn lp-btn-primary" to={appDestination}>
                Open workspace <ArrowRight size={15} aria-hidden />
              </Link>
            ) : (
              <>
                <Link className="lp-nav-signin" to="/sign-in">Sign in</Link>
                <Link className="lp-btn lp-btn-primary" to={signUpPath}>
                  Start free <ArrowRight size={15} aria-hidden />
                </Link>
              </>
            )}
            <button
              type="button"
              className="lp-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero">
          <div className="lp-hero-bg" aria-hidden="true">
            <span className="lp-blob lp-blob-a" />
            <span className="lp-blob lp-blob-b" />
            <span className="lp-gridlines" />
          </div>
          <div className="lp-hero-inner">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow"><span className="lp-pulse" /> Scheduling for US restaurants</p>
              <h1>
                The cockpit to <RotatingWord />
                <br />your whole crew.
              </h1>
              <p className="lp-lede">
                Newfork turns the Sunday-night spreadsheet into a five-minute job. Managers build
                the week with conflicts flagged in real time. Crew get every shift, swap and
                announcement on their phone.
              </p>
              <div className="lp-hero-ctas">
                <Link className="lp-btn lp-btn-primary lp-btn-lg" to={authenticated ? appDestination : signUpPath}>
                  {authenticated ? "Open workspace" : "Start free"} <ArrowRight size={17} aria-hidden />
                </Link>
                <a className="lp-btn lp-btn-ghost lp-btn-lg" href="#cockpit">See how it works</a>
              </div>
              <ul className="lp-hero-proof">
                <li><Check size={15} aria-hidden /> Free during early access</li>
                <li><Check size={15} aria-hidden /> No app install for crew</li>
                <li><Check size={15} aria-hidden /> Set up in an afternoon</li>
              </ul>
            </div>
            <HeroCockpit />
          </div>
        </section>

        <section className="lp-marquee" aria-label="What Newfork handles">
          <div className="lp-marquee-track">
            {[0, 1].map((copy) => (
              <div className="lp-marquee-set" key={copy} aria-hidden={copy === 1}>
                {["Weekly schedules", "Shift swaps", "Open shift pickups", "Time off", "Availability", "Multi-location", "Announcements", "E-signatures", "Onboarding", "Schedule templates", "PDF exports", "Role-based access"].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section" id="features">
          <div className="lp-section-head" data-reveal>
            <p className="lp-kicker">Features</p>
            <h2>Everything between &ldquo;who&rsquo;s on tonight?&rdquo; and a full house.</h2>
            <p>One tool for the schedule, the requests and the conversations around it.</p>
          </div>
          <div className="lp-feature-grid">
            {features.map((feature, index) => (
              <article
                className="lp-feature"
                key={feature.title}
                data-reveal
                style={{ "--i": index } as CSSProperties}
              >
                <span className="lp-feature-icon"><feature.icon size={20} aria-hidden /></span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-split" id="cockpit">
          <div className="lp-split-copy" data-reveal>
            <p className="lp-kicker">Manager cockpit</p>
            <h2>See the whole week. Fix it before it breaks.</h2>
            <p>
              Your schedule, requests and team in one desktop view built for the person running
              the floor. Every warning shows where it matters, every decision takes one click.
            </p>
            <ul className="lp-checks">
              <li><Check size={16} aria-hidden /> Draft privately, publish when ready</li>
              <li><Check size={16} aria-hidden /> Availability and time off right in the grid</li>
              <li><Check size={16} aria-hidden /> Swap, pickup and time off requests in one inbox</li>
              <li><Check size={16} aria-hidden /> Each location manager sees their own door</li>
            </ul>
          </div>
          <div className="lp-panel" data-reveal aria-hidden="true">
            <div className="lp-panel-head">
              <span>Requests</span>
              <span className="lp-badge">3 waiting</span>
            </div>
            {[
              { who: "José P.", what: "Swap Fri 4–11 with Ali D.", tag: "Swap" },
              { who: "Maya R.", what: "Time off Sat Oct 17", tag: "Time off" },
              { who: "Sam T.", what: "Pick up open shift Sun 11–7", tag: "Pickup" },
            ].map((req, i) => (
              <div className="lp-request" key={req.who} style={{ "--i": i } as CSSProperties}>
                <span className="lp-avatar tone-kitchen">{req.who.slice(0, 1)}</span>
                <span className="lp-request-text">
                  <b>{req.who}</b>
                  <small>{req.what}</small>
                </span>
                <span className="lp-tag">{req.tag}</span>
                <span className="lp-approve"><Check size={14} /></span>
              </div>
            ))}
            <div className="lp-meter">
              <span>Week coverage</span>
              <span className="lp-meter-bar"><i /></span>
              <b>96%</b>
            </div>
          </div>
        </section>

        <section className="lp-section lp-split lp-split-rev" id="crew">
          <div className="lp-split-copy" data-reveal>
            <p className="lp-kicker">Crew app</p>
            <h2>Your crew already has it. It&rsquo;s their phone.</h2>
            <p>
              No downloads and no group chats. Crew open the link, see their week, set their
              availability and trade shifts with people who can actually cover them.
            </p>
            <ul className="lp-checks">
              <li><Check size={16} aria-hidden /> Next shift front and center</li>
              <li><Check size={16} aria-hidden /> Request time off in three taps</li>
              <li><Check size={16} aria-hidden /> Sign documents and read announcements</li>
              <li><Check size={16} aria-hidden /> Notified the moment the schedule goes live</li>
            </ul>
          </div>
          <div className="lp-phones" data-reveal aria-hidden="true">
            <div className="lp-phone lp-phone-static">
              <div className="lp-phone-notch" />
              <div className="lp-phone-screen">
                <p className="lp-phone-hello">This week</p>
                {["Tue 9–5", "Wed 9–5", "Fri 4–11", "Sat 4–11"].map((s, i) => (
                  <div className="lp-phone-row" key={s} style={{ "--i": i } as CSSProperties}>
                    <span className="lp-phone-day">{s.split(" ")[0]}</span>
                    <span>{s.split(" ")[1]}</span>
                    <span className="lp-phone-loc">Kadıköy</span>
                  </div>
                ))}
                <div className="lp-phone-cta"><Repeat2 size={14} /> Offer a swap</div>
              </div>
            </div>
            <div className="lp-phone lp-phone-static lp-phone-back">
              <div className="lp-phone-notch" />
              <div className="lp-phone-screen">
                <p className="lp-phone-hello">Announcement</p>
                <div className="lp-phone-card">
                  <strong>New fall menu</strong>
                  <span>Tasting Thursday 3 PM, all FOH.</span>
                </div>
                <div className="lp-phone-ack"><Check size={14} /> Acknowledged</div>
              </div>
            </div>
            <span className="lp-chip lp-chip-c"><Smartphone size={14} /> Works on any phone</span>
          </div>
        </section>

        <section className="lp-section" id="how">
          <div className="lp-section-head" data-reveal>
            <p className="lp-kicker">How it works</p>
            <h2>From sign-up to a published week in one afternoon.</h2>
          </div>
          <ol className="lp-steps">
            {steps.map((step, index) => (
              <li key={step.n} data-reveal style={{ "--i": index } as CSSProperties}>
                <span className="lp-step-n">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-trust" data-reveal>
          <div>
            <ShieldCheck size={28} aria-hidden />
            <h2>Serious about your data.</h2>
            <p>
              Every workspace is isolated at the database level. People see only what their role
              allows. We never ask for Social Security numbers.
            </p>
          </div>
          <div className="lp-trust-links">
            <Link to="/privacy">Privacy policy <ArrowRight size={14} aria-hidden /></Link>
            <Link to="/terms">Terms of service <ArrowRight size={14} aria-hidden /></Link>
            <Link to="/accessibility">Accessibility <ArrowRight size={14} aria-hidden /></Link>
          </div>
        </section>

        <section className="lp-section" id="pricing">
          <div className="lp-section-head" data-reveal>
            <p className="lp-kicker">Pricing</p>
            <h2>Simple pricing. Free while we&rsquo;re in early access.</h2>
            <p>Join now and keep early-access terms when paid plans launch.</p>
          </div>
          <div className="lp-plans">
            {plans.map((plan, index) => (
              <article
                className={`lp-plan${"featured" in plan && plan.featured ? " is-featured" : ""}`}
                key={plan.name}
                data-reveal
                style={{ "--i": index } as CSSProperties}
              >
                {"featured" in plan && plan.featured ? <span className="lp-plan-flag">Available now</span> : null}
                <h3>{plan.name}</h3>
                <p className="lp-plan-price">{plan.price}</p>
                <p className="lp-plan-cadence">{plan.cadence}</p>
                <p className="lp-plan-blurb">{plan.blurb}</p>
                <ul>
                  {plan.items.map((item) => (
                    <li key={item}><Check size={15} aria-hidden /> {item}</li>
                  ))}
                </ul>
                <Link
                  className={`lp-btn ${"featured" in plan && plan.featured ? "lp-btn-primary" : "lp-btn-ghost"}`}
                  to={signUpPath}
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-faq" id="faq">
          <div className="lp-section-head" data-reveal>
            <p className="lp-kicker">FAQ</p>
            <h2>Questions, answered.</h2>
          </div>
          <div className="lp-faq-list" data-reveal>
            {faqs.map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <ChevronDown size={18} aria-hidden />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-cta" data-reveal>
          <div className="lp-cta-inner">
            <h2>Next week&rsquo;s schedule could already be done.</h2>
            <p>Create your workspace, invite your crew and publish your first week today.</p>
            <div className="lp-hero-ctas">
              <Link className="lp-btn lp-btn-light lp-btn-lg" to={authenticated ? appDestination : signUpPath}>
                {authenticated ? "Open workspace" : "Start free"} <ArrowRight size={17} aria-hidden />
              </Link>
              <Link className="lp-btn lp-btn-outline-light lp-btn-lg" to="/contact">Talk to us</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <Link to="/" className="lp-brand">
              <span className="lp-brand-mark" aria-hidden="true"><i /><i /><i /></span>
              NEWFORK
            </Link>
            <p>Restaurant scheduling and team operations.</p>
          </div>
          <nav aria-label="Product">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#cockpit">Manager cockpit</a>
            <a href="#crew">Crew app</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <nav aria-label="Company">
            <h4>Company</h4>
            <Link to="/contact">Contact</Link>
            <a href="#faq">FAQ</a>
            <Link to="/sign-in">Sign in</Link>
            <Link to={signUpPath}>Create account</Link>
          </nav>
          <nav aria-label="Legal">
            <h4>Legal</h4>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/accessibility">Accessibility</Link>
            <Link to="/your-privacy-choices">Cookies &amp; privacy choices</Link>
          </nav>
        </div>
        <p className="lp-footer-legal">© {new Date().getFullYear()} Newfork. All rights reserved.</p>
      </footer>
      <CookieBanner />
    </div>
  );
}
