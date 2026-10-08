import { z } from "zod";

/*
 * The form rules of a US product, in one place (KARARLAR "Form ve girdi
 * kuralları (ABD)", Mert 2026-10-01; ILKELER P11, P12). Every form and the API
 * read them from here: the letters a text field refuses, and the one shape a
 * phone number takes.
 */

/** The letters only Turkish uses; other Latin accents ("José Peña") pass, and so do hyphens. */
const turkishOnlyLetters = /[şŞğĞıİ]/;

export const usLettersMessage = "Use English letters instead of ş, ğ, ı or İ.";

/**
 * Read in composed form: pasted from macOS or a PDF, "ş" can arrive as "s"
 * and a combining mark, and it is the same letter (BL-969). The database's
 * CHECKs read it the same way (normalize(…, NFC)).
 */
export function hasTurkishOnlyLetters(value: string): boolean {
  return turkishOnlyLetters.test(value.normalize("NFC"));
}

/** A text field under the US letter rule. */
export function usText<T extends z.ZodString>(schema: T) {
  return schema.refine((value) => !hasTurkishOnlyLetters(value), usLettersMessage);
}

export const usPhoneMessage = "Enter a 10-digit US phone number.";

/**
 * A country code other than 1, wherever the "+" stands: "+44 …", "(+44) …",
 * "+(44) …", "tel:+44…". The database's app_private.account_phone_e164 reads
 * a number the same way (BL-969).
 */
const otherCountryCode = /\+[\s().-]*[02-9]/;

/** Fullwidth "＋" and digits, and a no-break space, read as the plain ones. */
function plainPhone(value: string): string {
  return value.normalize("NFKC");
}

/**
 * Up to ten US digits from whatever was typed or saved; a leading country 1 is
 * dropped. A number from outside the US gives none: cut to ten digits it
 * would read as a wrong US number.
 */
export function usPhoneDigits(value: string): string {
  const text = plainPhone(value);
  if (otherCountryCode.test(text)) return "";
  return text.replace(/[^0-9]/g, "").replace(/^1/, "").slice(0, 10);
}

/** A workspace's name as owner setup and Create workspace take it. */
export const workspaceNameInputSchema = usText(z.string().trim().min(1).max(120));

/**
 * "(415) 555-0100", built while typing; the "+1" stays outside the field. A
 * number with another country code stays as typed, so it reads as what it is
 * and is refused on save, and a "+" typed on its own waits for the next key.
 */
export function formatUsPhone(value: string): string {
  // Kept as typed, the space before the next group too.
  const text = plainPhone(value).trimStart();
  if (otherCountryCode.test(text) || /^\+[\s().-]*$/.test(text)) return text;
  const digits = usPhoneDigits(text);
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * "+14155550100" for a whole US number: ten digits, or eleven after a country
 * 1, the area code not starting with 0 or 1. A foreign number ("+44 …") or too
 * many digits is null, never cut down.
 */
export function toUsPhone(value: string): string | null {
  const text = plainPhone(value);
  if (otherCountryCode.test(text)) return null;
  const digits = text.replace(/[^0-9]/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(local) ? `+1${local}` : null;
}

/** A saved number, a US one in E.164 (BL-969), as "+1 (415) 555-0100". */
export function displayUsPhone(value: string | null | undefined): string | null {
  return value ? `+1 ${formatUsPhone(value)}` : null;
}

/** The one stored shape: +1 and ten digits, the area code not starting with 0 or 1. */
export const usPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+1[2-9]\d{9}$/, usPhoneMessage);
