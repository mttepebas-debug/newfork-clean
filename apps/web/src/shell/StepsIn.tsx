/**
 * Steps in (Mert, 2026-10-14 00:28): a person and an arrow coming in, the icon of a cover asked of a
 * teammate by name. Requests draws it on the request's tile, Notifications on the notice's (S-251).
 */
export function StepsIn({ size = 22 }: { size?: number }) {
  return (
    <svg className="steps-in" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 20a7 7 0 0 1 11.5-5.4" />
      <path d="M22 17h-7" />
      <path d="m18 13.5-3.5 3.5 3.5 3.5" />
    </svg>
  );
}
