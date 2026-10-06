import { ArrowRight, Menu, X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { CookieNotice } from "./CookieNotice";
import { EmployeeShowcase } from "./EmployeeShowcase";
import { FeatureBento } from "./FeatureBento";
import { HeroStage } from "./HeroStage";
import {
  FAQS,
  NAV_LINKS,
  PRICING,
  SECTION_ROUTES,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from "./landing-content";
import {
  BeforeAfter,
  ContactBand,
  FaqSection,
  FinalCta,
  LandingFooter,
  LogoMark,
  Principles,
  TeamControlFlow,
  Testimonials,
  TrustBand,
} from "./LandingSections";
import { PricingSection } from "./PricingSection";
import { ScrollStory } from "./ScrollStory";
import "./landing.css";

const PAGE_TITLE = "Newfork — Restaurant scheduling and team operations";
const PAGE_DESCRIPTION =
  "Build the week, catch conflicts before they happen, publish to every phone, and handle swaps and time off without a group text. Scheduling for US restaurants.";

const CUISINES = [
  "Taquerias",
  "Pizzerias",
  "Bistros",
  "Ramen bars",
  "Cafés",
  "Steakhouses",
  "Diners",
  "Bakeries",
  "Sushi counters",
  "Burger joints",
  "Wine bars",
  "Food halls",
];

export default function LandingPage() {
  const { authenticated, ready } = useAuth();
  const location = useLocation();
  const sectionId = SECTION_ROUTES[location.pathname];

  useDocumentHead();

  useEffect(() => {
    if (!sectionId) return;
    const frame = window.requestAnimationFrame(() =>
      document.getElementById(sectionId)?.scrollIntoView?.({ block: "start" }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [sectionId]);

  // A signed-in account goes straight to work, as "/" always did; this also
  // finishes an email-confirmation link, which lands on the site root.
  if (ready && authenticated) return <Navigate to="/app" replace />;

  return (
    <div className="lp">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <span className="lp-progress" aria-hidden="true" />
      <SiteHeader />
      <main id="main">
        <Hero />
        <CuisineMarquee />
        <FeatureBento />
        <ScrollStory />
        <TeamControlFlow />
        <EmployeeShowcase />
        <BeforeAfter />
        <Principles />
        <Testimonials />
        <TrustBand />
        <PricingSection />
        <FaqSection />
        <ContactBand />
        <FinalCta />
      </main>
      <LandingFooter />
      <CookieNotice />
      <StructuredData />
    </div>
  );
}

function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <header
      className={`lp-header${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}
    >
      <div className="lp-container lp-header-inner">
        <Link className="lp-logo" to="/" aria-label="Newfork home">
          <LogoMark />
          <span>Newfork</span>
        </Link>
        <nav className="lp-nav" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="lp-header-actions">
          <Link className="lp-signin" to={SIGN_IN_PATH}>
            Sign in
          </Link>
          <Link className="lp-btn lp-btn-primary lp-btn-sm" to={SIGN_UP_PATH}>
            Start free trial
          </Link>
          <button
            aria-controls="lp-mobile-menu"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="lp-menu-button"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? (
              <X size={20} aria-hidden />
            ) : (
              <Menu size={20} aria-hidden />
            )}
          </button>
        </div>
      </div>
      <nav
        className="lp-mobile-menu"
        id="lp-mobile-menu"
        aria-label="Main"
        hidden={!open}
      >
        {NAV_LINKS.map((link) => (
          <a href={link.href} key={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </a>
        ))}
        <Link to={SIGN_IN_PATH}>Sign in</Link>
        <Link className="lp-btn lp-btn-primary" to={SIGN_UP_PATH}>
          Start free trial
        </Link>
      </nav>
    </header>
  );
}

const HEADLINE = ["Run", "every", "shift", "from", "one"];

function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="hero-title">
      <div className="lp-hero-bg" aria-hidden="true">
        <span className="lp-blob lp-blob-a" />
        <span className="lp-blob lp-blob-b" />
        <span className="lp-blob lp-blob-c" />
        <span className="lp-hero-grid" />
      </div>
      <div className="lp-container lp-hero-inner">
        <div className="lp-hero-copy">
          <p className="lp-pill">
            <span className="lp-pill-dot" aria-hidden="true" />
            Scheduling for restaurants in the US
          </p>
          <h1 id="hero-title" className="lp-headline">
            {HEADLINE.map((word, index) => (
              <Fragment key={word}>
                <span
                  className="lp-word"
                  style={{ animationDelay: `${80 + index * 70}ms` }}
                >
                  {word}
                </span>{" "}
              </Fragment>
            ))}
            <span
              className="lp-word lp-word-accent"
              style={{ animationDelay: `${80 + HEADLINE.length * 70}ms` }}
            >
              cockpit.
              <svg
                viewBox="0 0 300 18"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M3 13 C 70 3, 160 3, 297 9" />
              </svg>
            </span>
          </h1>
          <p className="lp-hero-sub">
            Build the week, catch conflicts before they happen, publish to every
            phone, and handle swaps and time off without a single group text.
          </p>
          <div className="lp-hero-actions">
            <Link className="lp-btn lp-btn-primary lp-btn-lg" to={SIGN_UP_PATH}>
              Start free trial
              <ArrowRight size={18} aria-hidden />
            </Link>
            <a
              className="lp-btn lp-btn-secondary lp-btn-lg"
              href="#how-it-works"
            >
              See how it works
            </a>
          </div>
          <ul className="lp-hero-facts">
            <li>{PRICING.trialDays}-day free trial</li>
            <li>No credit card</li>
            <li>Nothing for employees to install</li>
          </ul>
        </div>
        <HeroStage />
      </div>
    </section>
  );
}

function CuisineMarquee() {
  const row = [...CUISINES, ...CUISINES];
  return (
    <section
      className="lp-marquee"
      aria-label="Built for every kind of restaurant"
    >
      <p>Built for the way restaurants actually run</p>
      <div className="lp-marquee-track">
        <ul>
          {row.map((name, index) => (
            <li aria-hidden={index >= CUISINES.length} key={`${name}-${index}`}>
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function useDocumentHead() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = meta?.content;
    if (meta) meta.content = PAGE_DESCRIPTION;
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== undefined)
        meta.content = previousDescription;
    };
  }, []);
}

function StructuredData() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Newfork",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: PAGE_DESCRIPTION,
      offers: {
        "@type": "Offer",
        price: String(PRICING.monthlyPerLocation),
        priceCurrency: PRICING.currency,
        description: "Per location per month",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ];
  return (
    <script
      type="application/ld+json"
      // Static content from landing-content.ts; "<" is escaped so no answer can close the tag.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
