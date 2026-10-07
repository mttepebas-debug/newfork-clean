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

export function hasTurkishOnlyLetters(value: string): boolean {
  return turkishOnlyLetters.test(value);
}

/** A text field under the US letter rule. */
export function usText<T extends z.ZodString>(schema: T) {
  return schema.refine((value) => !hasTurkishOnlyLetters(value), usLettersMessage);
}

export const usPhoneMessage = "Enter a 10-digit US phone number.";

/** Up to ten US digits from whatever was typed or saved; a leading country 1 is dropped. */
export function usPhoneDigits(value: string): string {
  return value.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
}

/** "(415) 555-0100", built while typing; the "+1" stays outside the field. */
export function formatUsPhone(value: string): string {
  const digits = usPhoneDigits(value);
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * "+14155550100" for a whole US number: ten digits, or eleven after a country
 * 1. A foreign number ("+44 …") or too many digits is null, never cut down.
 */
export function toUsPhone(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && !digits.startsWith("1")) return null;
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return local.length === 10 ? `+1${local}` : null;
}

/** A saved US number as "+1 (415) 555-0100"; anything else stays as it was saved. */
export function displayUsPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return value;
  return `+1 ${formatUsPhone(local)}`;
}

/** The one stored shape: +1 and ten digits, the area code not starting with 0 or 1. */
export const usPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+1[2-9]\d{9}$/, usPhoneMessage);
