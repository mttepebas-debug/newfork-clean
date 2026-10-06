import { BRAND_NAME } from "../site/config";

/**
 * Temporary typographic wordmark. The final logo replaces this component;
 * nothing else draws the name as a logo.
 */
export function Wordmark({ tone = "ink" }: { readonly tone?: "ink" | "paper" }) {
  return (
    <span className={`wordmark wordmark--${tone}`}>
      <span className="wordmark__mark" aria-hidden="true" />
      <span className="wordmark__name">{BRAND_NAME}</span>
    </span>
  );
}
