import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  LockKeyhole,
  MapPin,
  Monitor,
  Moon,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import "./employee-onboarding-preview.css";

const steps = [
  "Welcome",
  "Personal information",
  "Emergency contact",
  "Availability",
  "Documents",
  "Policies & agreements",
  "Review & submit",
];
const states =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  );
type Mode = "light" | "system";
type Theme = "light" | "dark" | "system";

export default function EmployeeOnboardingPreview() {
  const [mode, setMode] = useState<Mode>("light");
  const [theme, setTheme] = useState<Theme>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [step, setStep] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [photo, setPhoto] = useState("");
  const [zoom, setZoom] = useState(1);
  const [photoEditor, setPhotoEditor] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [form, setForm] = useState({
    phone: "(650) 555-0142",
    code: "+1",
    street: "",
    apartment: "",
    city: "",
    state: "",
    zip: "",
    birthday: "",
    share: false,
  });
  const dark =
    mode === "system" &&
    (theme === "dark" || (theme === "system" && systemDark));

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(query.matches);
    const update = () => setSystemDark(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (photo) return () => URL.revokeObjectURL(photo);
  }, [photo]);
  const navigate = (next: number) => {
    setStep(next);
    setMobileMenu(false);
    setNotice("");
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => heading.current?.focus());
  };
  const update = (field: keyof typeof form, value: string | boolean) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setSaved(false);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.birthday) {
      setNotice("Enter your date of birth.");
      return;
    }
    setSaved(true);
    setNotice("Personal information complete.");
  };

  return (
    <div
      className="eo-preview"
      data-color={dark ? "dark" : "light"}
      data-direction={mode}
    >
      <div className="eo-lab" aria-label="Design comparison">
        <span className="eo-lab-label">
          ONBOARDING <span>/ Design preview</span>
        </span>
        <div className="eo-segment" aria-label="Design direction">
          <button
            aria-pressed={mode === "light"}
            onClick={() => setMode("light")}
          >
            01 <span>Light & airy</span>
          </button>
          <button
            aria-pressed={mode === "system"}
            onClick={() => setMode("system")}
          >
            03 <span>Adaptive theme</span>
          </button>
        </div>
        {mode === "system" ? (
          <div className="eo-theme" aria-label="Theme preview">
            {(["light", "dark", "system"] as const).map((value) => {
              const Icon =
                value === "light" ? Sun : value === "dark" ? Moon : Monitor;
              return (
                <button
                  key={value}
                  title={`${value} theme`}
                  aria-label={`${value} theme`}
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        ) : (
          <span className="eo-lab-tag">Sample workspace</span>
        )}
      </div>

      <div className="eo-shell">
        <aside className="eo-sidebar">
          <div className="eo-company">
            <span className="eo-company-mark" aria-hidden>
              J.
            </span>
            <div>
              <strong>Juniper</strong>
              <span>Employee onboarding</span>
            </div>
          </div>
          <button
            className="eo-mobile-step"
            aria-expanded={mobileMenu}
            aria-controls="eo-step-list"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <span>
              {step + 1} of 7 <strong>{steps[step]}</strong>
            </span>
            <ChevronDown size={18} />
          </button>
          <div
            className={`eo-sidebar-body ${mobileMenu ? "is-open" : ""}`}
            id="eo-step-list"
          >
            <div className="eo-progress-label">
              <span>Your progress</span>
              <strong>{saved ? "2" : step ? "1" : "0"} / 7</strong>
            </div>
            <div
              className="eo-progress"
              role="progressbar"
              aria-label="Completed steps"
              aria-valuemin={0}
              aria-valuemax={7}
              aria-valuenow={saved ? 2 : step ? 1 : 0}
            >
              <span
                style={{ width: `${((saved ? 2 : step ? 1 : 0) / 7) * 100}%` }}
              />
            </div>
            <nav aria-label="Onboarding steps">
              {steps.map((name, index) => (
                <button
                  key={name}
                  disabled={index > 1}
                  aria-current={step === index ? "step" : undefined}
                  className={step === index ? "is-current" : ""}
                  onClick={() => navigate(index)}
                >
                  <span
                    className={`eo-step-number ${index < step || (index === 1 && saved) ? "is-done" : ""}`}
                  >
                    {index < step || (index === 1 && saved) ? (
                      <Check size={14} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>{name}</span>
                  {step === index && (
                    <ChevronRight className="eo-step-arrow" size={15} />
                  )}
                </button>
              ))}
            </nav>
            <div className="eo-side-bottom">
              <span className="eo-avatar-small">AT</span>
              <div>
                <strong>Alex Taylor</strong>
                <span>alex.taylor@example.com</span>
              </div>
            </div>
            <span className="eo-powered">
              Powered by <strong>NEWFORK</strong>
            </span>
          </div>
        </aside>

        <main className="eo-main">
          <header className="eo-page-top">
            <span>YOUR NEXT CHAPTER</span>
            <span>
              <LockKeyhole size={13} /> Private & secure
            </span>
          </header>
          {step === 0 ? (
            <div className="eo-welcome eo-enter" key="welcome">
              <div className="eo-welcome-title">
                <span className="eo-eyebrow">A NEW BEGINNING</span>
                <h1 ref={heading} tabIndex={-1}>
                  Welcome to
                  <br />
                  the team, <span>Alex.</span>
                </h1>
                <p>
                  We're happy you're here. Let's get you settled in
                  <br className="eo-desktop-break" /> and ready for your first
                  day at Juniper.
                </p>
              </div>
              <div className="eo-placement">
                <div>
                  <span className="eo-placement-icon">
                    <MapPin size={21} />
                  </span>
                  <div>
                    <span className="eo-caption">YOUR LOCATION</span>
                    <strong>Palo Alto</strong>
                    <span className="eo-address">University Avenue</span>
                  </div>
                </div>
                <div className="eo-job">
                  <span className="eo-caption">YOUR ROLE</span>
                  <strong>Server</strong>
                  <span className="eo-address">Front of house</span>
                </div>
              </div>
              <div className="eo-welcome-action">
                <button className="eo-primary" onClick={() => navigate(1)}>
                  Let's set up your account <ArrowRight size={18} />
                </button>
                <span>Your progress stays with you.</span>
              </div>
              <div className="eo-welcome-foot">
                <span className="eo-small-line" />
                <span>A good start, together.</span>
              </div>
            </div>
          ) : (
            <form
              className="eo-profile eo-enter"
              key="profile"
              onSubmit={submit}
            >
              <div className="eo-form-body">
                <span className="eo-eyebrow">STEP 02 / 07</span>
                <h1 ref={heading} tabIndex={-1}>
                  Make yourself at home.
                </h1>
                <p className="eo-intro">
                  A few details to get your employee profile ready.
                </p>
                <section className="eo-profile-section">
                  <div className="eo-section-title">
                    <h2>Personal information</h2>
                    <span>01</span>
                  </div>
                  <div className="eo-photo-row">
                    <div className="eo-photo">
                      {photo ? (
                        <img
                          src={photo}
                          alt="Your profile"
                          style={{ transform: `scale(${zoom})` }}
                        />
                      ) : (
                        "AT"
                      )}
                    </div>
                    <div>
                      <strong>
                        Profile photo{" "}
                        <span className="eo-optional">Optional</span>
                      </strong>
                      <div className="eo-photo-buttons">
                        <button
                          type="button"
                          onClick={() => fileInput.current?.click()}
                        >
                          <Upload size={14} />
                          {photo ? "Change photo" : "Upload photo"}
                        </button>
                        {photo && (
                          <>
                            <button
                              type="button"
                              onClick={() => setPhotoEditor(!photoEditor)}
                            >
                              Crop
                            </button>
                            <button
                              type="button"
                              aria-label="Remove photo"
                              title="Remove photo"
                              onClick={() => {
                                setPhoto("");
                                setPhotoEditor(false);
                              }}
                            >
                              <X size={15} />
                            </button>
                          </>
                        )}
                      </div>
                      {photoEditor && (
                        <label className="eo-zoom">
                          Zoom
                          <input
                            type="range"
                            min="1"
                            max="2.5"
                            step="0.05"
                            value={zoom}
                            onChange={(event) =>
                              setZoom(Number(event.target.value))
                            }
                          />
                        </label>
                      )}
                    </div>
                    <input
                      hidden
                      ref={fileInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (
                          !/^image\/(jpeg|png|webp)$/.test(file.type) ||
                          file.size > 8 * 1024 * 1024
                        ) {
                          setNotice(
                            "Choose a JPG, PNG or WebP image smaller than 8 MB.",
                          );
                          return;
                        }
                        setPhoto(URL.createObjectURL(file));
                        setZoom(1);
                        setPhotoEditor(true);
                        event.target.value = "";
                      }}
                    />
                  </div>
                  <div className="eo-fields">
                    <label>
                      First name <LockKeyhole size={12} />
                      <input value="Alex" readOnly autoComplete="given-name" />
                    </label>
                    <label>
                      Last name <LockKeyhole size={12} />
                      <input
                        value="Taylor"
                        readOnly
                        autoComplete="family-name"
                      />
                    </label>
                    <label className="eo-wide">
                      Email address <LockKeyhole size={12} />
                      <input
                        value="alex.taylor@example.com"
                        type="email"
                        readOnly
                        autoComplete="email"
                      />
                    </label>
                    <label className="eo-wide">
                      Phone number
                      <div className="eo-phone">
                        <select
                          aria-label="Calling code"
                          value={form.code}
                          onChange={(e) => update("code", e.target.value)}
                        >
                          <option>+1</option>
                          <option>+44</option>
                          <option>+90</option>
                          <option>+49</option>
                          <option>+61</option>
                          <option>+91</option>
                        </select>
                        <input
                          aria-label="Phone number"
                          type="tel"
                          autoComplete="tel-national"
                          required
                          pattern={"[0-9\\(\\)\\+ .\\-]{7,25}"}
                          value={form.phone}
                          onChange={(e) => update("phone", e.target.value)}
                        />
                      </div>
                    </label>
                  </div>
                </section>
                <section className="eo-profile-section">
                  <div className="eo-section-title">
                    <h2>Home address</h2>
                    <span>02</span>
                  </div>
                  <div className="eo-fields">
                    <label className="eo-wide">
                      Street address
                      <input
                        autoComplete="address-line1"
                        placeholder="Street address"
                        required
                        value={form.street}
                        onChange={(e) => update("street", e.target.value)}
                      />
                    </label>
                    <label className="eo-wide">
                      Apartment, suite, etc.{" "}
                      <span className="eo-optional">Optional</span>
                      <input
                        autoComplete="address-line2"
                        value={form.apartment}
                        onChange={(e) => update("apartment", e.target.value)}
                      />
                    </label>
                    <label>
                      City
                      <input
                        autoComplete="address-level2"
                        required
                        value={form.city}
                        onChange={(e) => update("city", e.target.value)}
                      />
                    </label>
                    <div className="eo-state-zip">
                      <label>
                        State
                        <select
                          autoComplete="address-level1"
                          aria-label="State"
                          required
                          value={form.state}
                          onChange={(e) => update("state", e.target.value)}
                        >
                          <option value="">Select</option>
                          {states.map((state) => (
                            <option key={state}>{state}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        ZIP code
                        <input
                          autoComplete="postal-code"
                          inputMode="numeric"
                          required
                          pattern="[0-9]{5}(-[0-9]{4})?"
                          value={form.zip}
                          onChange={(e) => update("zip", e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                </section>
                <section className="eo-profile-section">
                  <div className="eo-section-title">
                    <h2>A little more about you</h2>
                    <span>03</span>
                  </div>
                  <div className="eo-fields">
                    <label>
                      Date of birth
                      <input
                        type="date"
                        required
                        max={new Date().toLocaleDateString("en-CA")}
                        autoComplete="bday"
                        onInput={(e) => update("birthday", e.currentTarget.value)}
                        value={form.birthday}
                        onChange={(e) => update("birthday", e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="eo-sharing">
                    <input
                      type="checkbox"
                      checked={form.share}
                      onChange={(e) => update("share", e.target.checked)}
                    />
                    <span>
                      <strong>Share my info with coworkers</strong>
                      <small>
                        Your phone, email and birthday. Your birth year stays
                        private.
                      </small>
                    </span>
                  </label>
                </section>
              </div>
              <footer className="eo-footer">
                <button
                  className="eo-back"
                  type="button"
                  onClick={() => navigate(0)}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <span className="eo-save-state" role="status">
                  {notice || (saved ? "Personal information complete" : "")}
                </span>
                <button className="eo-primary" type="submit">
                  {saved ? "Completed" : "Continue"}
                  {saved ? <Check size={17} /> : <ArrowRight size={17} />}
                </button>
              </footer>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
