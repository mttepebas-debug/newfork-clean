import {
  locationInputSchema,
  suggestLocationShortName,
  toUsPhone,
  usLettersMessage,
  type Location,
  type LocationInput,
} from "@newfork/shared";

// Phone starts as the saved E.164 number and becomes the masked text once
// typed in; the save turns either into E.164.
export type LocationDraft = Omit<LocationInput, "phone"> & { phone: string };

/** A saved location as the form edits it, in Settings › Locations and in setup. */
export function locationDraft(location: Location): LocationDraft {
  return {
    name: location.name,
    short_name: location.short_name,
    phone: location.phone ?? "",
    street_address: location.street_address,
    city: location.city,
    region: location.region,
    postal_code: location.postal_code,
    country_code: location.country_code,
    timezone: location.timezone,
  };
}
export type LocationFieldErrors = Partial<
  Record<"name" | "short_name" | "phone" | "street_address" | "city" | "region", string>
>;

// The fields under the US letter rule (BL-503).
const letterFields = new Set(["name", "street_address", "city", "region"]);

// An empty short name falls back to the suggestion; phone goes to E.164.
// Short name, phone and letter problems are reported on submit, next to the
// input, so they do not count against `complete`.
export function checkLocationDraft(draft: LocationDraft) {
  const digits = draft.phone.replace(/\D/g, "");
  const input = {
    ...draft,
    short_name: draft.short_name.trim() || suggestLocationShortName(draft.name),
    phone: digits ? (toUsPhone(draft.phone) ?? `+1${digits}`) : null,
  };
  const parsed = locationInputSchema.safeParse(input);
  const errors: LocationFieldErrors = {};
  let complete = true;
  for (const issue of parsed.error?.issues ?? []) {
    const field = String(issue.path[0]);
    if (field === "phone") errors.phone = issue.message;
    else if (field === "short_name")
      errors.short_name = input.short_name
        ? issue.message
        : "Short name is required. Use 2–12 characters: letters A–Z, numbers or hyphens.";
    else if (letterFields.has(field) && issue.message === usLettersMessage)
      errors[field as keyof LocationFieldErrors] = issue.message;
    else complete = false;
  }
  return { input, parsed, errors, complete };
}
