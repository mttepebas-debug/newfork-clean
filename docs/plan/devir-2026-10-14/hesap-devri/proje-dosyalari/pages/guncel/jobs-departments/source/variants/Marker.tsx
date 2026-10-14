// A numbered decision marker. It sits on top of the page without moving it, and
// opens its line in the lab legend. Hidden when the lab's markers are off.
import { decisions, stateLabel } from "./decisions";
import { setLab, useLab } from "./lab-state";

export function Marker({ n, className = "", inline = false }: { n: number; className?: string; inline?: boolean }) {
  const lab = useLab();
  const decision = decisions.find((item) => item.n === n);
  if (!lab.notes || !decision) return null;
  const Tag = inline ? "span" : "button";
  const open = (event: { stopPropagation(): void; preventDefault(): void }) => {
    event.stopPropagation();
    event.preventDefault();
    setLab({ focus: n });
  };
  return (
    <Tag
      {...(inline ? { role: "button", tabIndex: 0, onKeyDown: (event: { key: string; stopPropagation(): void; preventDefault(): void }) => (event.key === "Enter" || event.key === " ") && open(event) } : { type: "button" as const })}
      className={`lab-marker lab-marker--${decision.state} ${inline ? "lab-marker--inline" : ""} ${className}`}
      title={`${n} · ${stateLabel[decision.state]}: ${decision.what}`}
      aria-label={`Karar ${n}: ${stateLabel[decision.state]}`}
      onClick={open}
    >
      {n}
    </Tag>
  );
}
