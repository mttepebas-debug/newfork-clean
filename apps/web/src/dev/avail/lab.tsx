// DEV-only availability design lab (AVAIL-TASARIM). Fake data, nothing is saved.
// ponytail: deleted with the folder once Mert picks; the picked variant moves into the real screen.
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import "./avail-lab.css";

export type Variant = "a" | "b" | "c" | "d" | "e";

export type VariantInfo = { readonly name: string; readonly hint: string };

export type LabSet = {
  readonly id: string;
  readonly title: string;
  readonly screen: string;
  readonly variants: Partial<Record<Variant, VariantInfo>>;
};

export function useVariant(set: LabSet): Variant {
  const [params] = useSearchParams();
  const asked = params.get("variant") as Variant | null;
  return asked && set.variants[asked] ? asked : "a";
}

export function LabBanner({ set, variant, children }: {
  readonly set: LabSet;
  readonly variant: Variant;
  readonly children?: ReactNode;
}) {
  const [params] = useSearchParams();
  const info = set.variants[variant];
  const href = (next: Variant) => {
    const copy = new URLSearchParams(params);
    copy.set("variant", next);
    return `?${copy.toString()}`;
  };
  return (
    <aside className="avail-banner" aria-label="Design preview">
      <div className="avail-banner-row">
        <strong>DEV preview · {set.id.toUpperCase()} · {set.title}</strong>
        <nav className="avail-variant-tabs" aria-label="Variant">
          {(Object.keys(set.variants) as Variant[]).map((key) => (
            <Link key={key} to={href(key)} replace aria-current={key === variant ? "page" : undefined}>
              {key.toUpperCase()} · {set.variants[key]!.name}
            </Link>
          ))}
        </nav>
      </div>
      <p>{set.screen} — {info?.hint}</p>
      {children}
    </aside>
  );
}

export function ScenarioTabs<T extends string>({ value, options, onChange }: {
  readonly value: T;
  readonly options: readonly (readonly [T, string])[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="avail-scenarios" role="group" aria-label="Scenario">
      <span>Scenario:</span>
      {options.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
