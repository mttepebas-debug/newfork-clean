// The person's circle on a lineup row, the phone's and the desktop's (LINEUP-EDIT W1). One place: the job icons and
// avatars (AVATAR-IKON) replace the initials here once, for both.

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function LineupPersonCircle({ name }: { readonly name: string }) {
  return (
    <span className="lineup-phone-avatar" aria-hidden>
      {initials(name)}
    </span>
  );
}
