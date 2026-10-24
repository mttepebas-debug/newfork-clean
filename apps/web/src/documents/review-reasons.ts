// A rejected file's common reasons (A2 Tur 6, Mert 23 Oct): chips that fill the file's reason. A chip is on only
// when its reason is a whole sentence of the text, at its start or after . ! ? ; and ending the text or with its own
// period, so "The card expired in 2024" or "Blurry photos" never turn a chip on. A tap adds the reason as a sentence
// ("Blurry photo.") or takes that sentence out again, leaving the rest as it was typed (mockup tur2-a2.js:180-189).

export const quickReasons = [
  "Blurry photo",
  "Wrong document",
  "Expired",
  "Name doesn't match",
  "A side is missing",
] as const;

function sentence(reason: string): RegExp {
  const literal = reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[.!?;]\\s*)${literal}(\\.(?=\\s|$)|$)`, "i");
}

/** The reason is a sentence of its own in the text. */
export function hasReason(text: string, reason: string): boolean {
  return sentence(reason).test(text.trim());
}

/** Adds the reason as a sentence, or takes its sentence out again. */
export function toggleReason(text: string, reason: string): string {
  const typed = text.trim();
  if (!hasReason(typed, reason))
    return `${typed ? `${typed.replace(/[;,]$/, "").replace(/([^.!?])$/, "$1.")} ` : ""}${reason}.`;
  return typed
    .replace(sentence(reason), "$1")
    .replace(/^[\s.;,]+/, "")
    .replace(/\s*([.;,])\s*[.;,]/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[;,]$/, ".");
}
