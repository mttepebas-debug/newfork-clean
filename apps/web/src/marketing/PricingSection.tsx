import { ArrowRight, Check } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import {
  annualSavingsPercent,
  monthlyTotal,
  PLAN_INCLUDES,
  pricePerLocation,
  PRICING,
  SIGN_UP_PATH,
  type BillingCycle,
} from "./landing-content";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: PRICING.currency,
  maximumFractionDigits: 0,
});

export function PricingSection() {
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [locations, setLocations] = useState(2);
  const sliderId = useId();
  const perLocation = pricePerLocation(cycle);
  const total = monthlyTotal(locations, cycle);

  return (
    <section
      className="lp-section lp-pricing"
      id="pricing"
      aria-labelledby="pricing-title"
    >
      <div className="lp-container">
        <header className="lp-section-head lp-section-head-center">
          <p className="lp-eyebrow">Pricing</p>
          <h2 id="pricing-title">
            One plan. Every feature. Priced per location.
          </h2>
          <p className="lp-lede">
            No tiers to compare and no features held back. Start with a{" "}
            {PRICING.trialDays}-day free trial — no credit card needed.
          </p>
        </header>

        <div className="lp-cycle" role="radiogroup" aria-label="Billing cycle">
          {(["monthly", "annual"] as const).map((option) => (
            <button
              aria-checked={cycle === option}
              className={cycle === option ? "is-active" : undefined}
              key={option}
              onClick={() => setCycle(option)}
              role="radio"
              type="button"
            >
              {option === "monthly" ? "Monthly" : "Annual"}
              {option === "annual" ? (
                <span className="lp-cycle-save">
                  Save {annualSavingsPercent()}%
                </span>
              ) : null}
            </button>
          ))}
          <span
            className="lp-cycle-thumb"
            data-cycle={cycle}
            aria-hidden="true"
          />
        </div>

        <div className="lp-price-grid">
          <article className="lp-price-card lp-price-main">
            <div className="lp-price-glow" aria-hidden="true" />
            <h3>Newfork</h3>
            <p className="lp-price-sub">
              For restaurants with 1 to {PRICING.maxSelfServeLocations}{" "}
              locations
            </p>
            <p className="lp-price">
              <span className="lp-price-amount" key={perLocation}>
                {usd.format(perLocation)}
              </span>
              <span className="lp-price-unit">
                per location / month
                <small>
                  {cycle === "annual" ? "billed annually" : "billed monthly"}
                </small>
              </span>
            </p>

            <div className="lp-calc">
              <label htmlFor={sliderId}>
                <span>Locations</span>
                <output htmlFor={sliderId}>{locations}</output>
              </label>
              <input
                id={sliderId}
                max={PRICING.maxSelfServeLocations}
                min={1}
                onChange={(event) => setLocations(Number(event.target.value))}
                step={1}
                style={{
                  ["--fill" as string]: `${((locations - 1) / (PRICING.maxSelfServeLocations - 1)) * 100}%`,
                }}
                type="range"
                value={locations}
              />
              <p className="lp-calc-total" aria-live="polite">
                <span>Your total</span>
                <b key={total}>{usd.format(total)}</b>
                <small>/ month</small>
              </p>
            </div>

            <Link
              className="lp-btn lp-btn-primary lp-btn-block"
              to={SIGN_UP_PATH}
            >
              Start your {PRICING.trialDays}-day free trial
              <ArrowRight size={16} aria-hidden />
            </Link>
            <p className="lp-price-note">
              No credit card. Your whole team, from day one.
            </p>
          </article>

          <div className="lp-price-side">
            <article className="lp-price-card">
              <h3>Everything included</h3>
              <ul className="lp-check-list">
                {PLAN_INCLUDES.map((item) => (
                  <li key={item}>
                    <Check size={15} strokeWidth={2.6} aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            <article className="lp-price-card lp-price-group">
              <h3>Restaurant groups</h3>
              <p>
                More than {PRICING.maxSelfServeLocations} locations, or several
                businesses under one owner? We will set it up with you.
              </p>
              <Link className="lp-btn lp-btn-secondary" to="/contact">
                Talk to us
                <ArrowRight size={16} aria-hidden />
              </Link>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
