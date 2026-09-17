import {
  locationInputSchema,
  suggestLocationShortName,
  type LocationInput,
} from "@newfork/shared";

// Phone is kept as the formatted text shown in the input until save.
export type LocationDraft = Omit<LocationInput, "phone"> & { phone: string };
export type LocationFieldErrors = Partial<Record<"short_name" | "phone", string>>;

// US numbers only: "(415) 555-0100", built progressively while typing.
export function formatUsPhone(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// An empty short name falls back to the suggestion; phone goes to E.164.
// Short name and phone problems are reported on submit, next to the input,
// so they do not count against `complete`.
export function checkLocationDraft(draft: LocationDraft) {
  const digits = draft.phone.replace(/\D/g, "");
  const input = {
    ...draft,
    short_name: draft.short_name.trim() || suggestLocationShortName(draft.name),
    phone: digits ? `+1${digits}` : null,
  };
  const parsed = locationInputSchema.safeParse(input);
  const errors: LocationFieldErrors = {};
  let complete = true;
  for (const issue of parsed.error?.issues ?? []) {
    if (issue.path[0] === "phone") errors.phone = issue.message;
    else if (issue.path[0] === "short_name")
      errors.short_name = input.short_name
        ? issue.message
        : "Short name is required. Use 2–12 characters: letters A–Z, numbers or hyphens.";
    else complete = false;
  }
  return { input, parsed, errors, complete };
}
