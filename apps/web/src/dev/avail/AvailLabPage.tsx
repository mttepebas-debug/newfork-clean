import type { JSX } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import type { LabSet } from "./lab";
import { s1Set, S1AvailabilityToggle } from "./S1AvailabilityToggle";
import { s2Set, S2ManagerNote } from "./S2ManagerNote";
import { s3Set, S3Preflight } from "./S3Preflight";
import { s4Set, S4EmployeeConsent } from "./S4EmployeeConsent";
import { s5Set, S5ManagerConsent } from "./S5ManagerConsent";

const sets: readonly (readonly [LabSet, () => JSX.Element])[] = [
  [s1Set, S1AvailabilityToggle],
  [s2Set, S2ManagerNote],
  [s3Set, S3Preflight],
  [s4Set, S4EmployeeConsent],
  [s5Set, S5ManagerConsent],
];

export default function AvailLabPage() {
  const { set } = useParams();
  const [params] = useSearchParams();
  const found = sets.find(([info]) => info.id === set);
  if (found) {
    const Screen = found[1];
    // A new variant starts from a clean screen.
    return <Screen key={params.get("variant") ?? "a"} />;
  }
  return (
    <section className="settings-page avail-index" aria-labelledby="avail-index-title">
      <h1 id="avail-index-title">Availability design preview (DEV only)</h1>
      <p className="avail-muted">Fake data. Nothing here is saved. Pick a set, then switch variants at the top.</p>
      <ul>
        {sets.map(([info]) => (
          <li key={info.id}>
            <strong>{info.id.toUpperCase()} · {info.title}</strong>
            <span className="avail-muted">{info.screen}</span>
            <span className="avail-index-links">
              {Object.entries(info.variants).map(([key, variant]) => (
                <Link key={key} to={`/app/dev/avail/${info.id}?variant=${key}`}>
                  {key.toUpperCase()} · {variant!.name}
                </Link>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
