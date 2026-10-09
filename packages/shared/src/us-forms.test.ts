import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  displayUsPhone,
  editUsPhone,
  formatUsPhone,
  hasTurkishOnlyLetters,
  toUsPhone,
  usLettersMessage,
  usPhoneDigits,
  usPhoneSchema,
  usText,
} from "./us-forms";

// KARARLAR "Form ve girdi kuralları (ABD)" (Mert, 2026-10-01), ILKELER P12.
describe("the US letter rule", () => {
  it("refuses the letters only Turkish uses", () => {
    for (const name of ["Ayşe", "Tepebaş", "Doğan", "Işık", "İrem", "ŞULE", "Ğ"]) {
      expect(hasTurkishOnlyLetters(name)).toBe(true);
    }
  });

  // Pasted from macOS or a PDF, ş and İ can arrive as a letter plus a mark
  // (BL-969 review): they are the same letters and the rule holds for them.
  it("refuses the letters written as a base letter and a combining mark", () => {
    for (const name of ["S\u0327is\u0327li", "Ag\u0306ca", "I\u0307stanbul"]) {
      expect(hasTurkishOnlyLetters(name), name).toBe(true);
    }
    expect(hasTurkishOnlyLetters("Jose\u0301")).toBe(false);
  });

  it("lets other Latin accents and hyphens through", () => {
    for (const name of ["José Peña", "Zoë", "Anne-Marie", "Müller", "Çelik", "Öztürk", "O'Brien"]) {
      expect(hasTurkishOnlyLetters(name)).toBe(false);
    }
  });

  it("says what to do in a text field's schema", () => {
    const schema = usText(z.string().trim().min(1));
    expect(schema.safeParse("José Peña").success).toBe(true);
    const refused = schema.safeParse("Ayşe");
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe(usLettersMessage);
  });
});

describe("the US phone rule", () => {
  it("keeps ten digits, a leading country 1 dropped", () => {
    expect(usPhoneDigits("+1 (415) 555-0100")).toBe("4155550100");
    expect(usPhoneDigits("415.555.0100 ext")).toBe("4155550100");
    expect(usPhoneDigits("1")).toBe("");
    expect(usPhoneDigits("41555501001234")).toBe("4155550100");
  });

  // BL-969 review: cut to ten digits, "+44 …" read as a wrong US number. A
  // number with another country code stays as typed, so it reads as what it is
  // and is refused on save; a "+" typed on its own stays until the next key.
  it("shows a number from outside the US as typed, never as a US one", () => {
    for (const typed of ["+44 20 7946 0958", "(+44) 20 7946 0958", "+(44) 2079 4609", "tel:+442079460958"]) {
      expect(usPhoneDigits(typed), typed).toBe("");
      expect(formatUsPhone(typed), typed).toBe(typed);
    }
    expect(formatUsPhone("\uFF0B44 2079")).toBe("+44 2079");
    expect(formatUsPhone("+")).toBe("+");
    expect(formatUsPhone("+4")).toBe("+4");
    // Typed key by key, the space before the next group stays.
    expect(formatUsPhone("+44 ")).toBe("+44 ");
    expect(formatUsPhone("+1")).toBe("");
    expect(formatUsPhone("+1 415 555 0100")).toBe("(415) 555-0100");
  });

  // Mert, 2026-10-09 (mask A): a separator comes with the digit that closes its
  // group, the brackets with the 3rd digit and the dash with the 6th.
  it("masks while typing, a separator with the digit that closes its group", () => {
    const shown = [
      "",
      "4",
      "41",
      "(415)",
      "(415) 5",
      "(415) 55",
      "(415) 555-",
      "(415) 555-0",
      "(415) 555-01",
      "(415) 555-010",
      "(415) 555-0100",
    ];
    shown.forEach((expected, length) =>
      expect(formatUsPhone("4155550100".slice(0, length)), String(length)).toBe(expected),
    );
    expect(formatUsPhone("+14155550100")).toBe("(415) 555-0100");
    expect(formatUsPhone("(415)5")).toBe("(415) 5");
  });

  // Backspace on a separator the mask would put straight back takes the digit
  // before it as well, so a separator leaves with the digit that brought it.
  it("erases a separator together with the digit before it", () => {
    expect(editUsPhone("(415)", "(415", 4)).toBe("41");
    expect(editUsPhone("(415) 555-", "(415) 555", 9)).toBe("(415) 55");
    expect(editUsPhone("(415) 5", "(415)5", 5)).toBe("(415)");
    expect(editUsPhone("(415) 5", "(415) ", 6)).toBe("(415)");
    // Inside the number: the digit before the caret goes.
    expect(editUsPhone("(415) 555-0100", "(415 555-0100", 4)).toBe("(415) 550-100");
    // A digit erased, typed or pasted is masked as it stands.
    expect(editUsPhone("(415) 555-01", "(415) 555-0", 11)).toBe("(415) 555-0");
    expect(editUsPhone("(415) 55", "(415) 555", 9)).toBe("(415) 555-");
    expect(editUsPhone("", "+1 (415) 555-0100", 17)).toBe("(415) 555-0100");
    // A number from outside the US stays as typed, spaces erased one by one.
    expect(editUsPhone("+44 ", "+44", 3)).toBe("+44");
  });

  // The same table is in supabase/tests/account_avatar_phone_contract.test.sql:
  // the database's app_private.account_phone_e164 answers it the same way.
  it("reads every way a number is written the way the database does", () => {
    const table: ReadonlyArray<readonly [string, string | null]> = [
      ["(415) 555-0100", "+14155550100"],
      ["+1 (415) 555-0100", "+14155550100"],
      ["1-415-555-0100", "+14155550100"],
      ["415.555.0100", "+14155550100"],
      ["\t+1 415 555 0100", "+14155550100"],
      ["\uFF0B1 415 555 0100", "+14155550100"],
      ["\uFF14\uFF11\uFF15\uFF15\uFF15\uFF15\uFF10\uFF11\uFF10\uFF10", "+14155550100"],
      ["+44 20 7946 0958", null],
      ["(+44) 20 7946 0958", null],
      ["+(44) 2079 4609", null],
      ["\t+32 2 123 45 67", null],
      ["\u00A0+47 1234 5678", null],
      ["\uFF0B44 2079460958", null],
      ["tel:+442079460958", null],
      ["(015) 555-0100", null],
      ["555-0100", null],
      ["4155550100 ext 12", null],
      // A line separator is no separator in either reading (BL-969 review D-1).
      ["+\u20282 415 555 010", "+12415555010"],
      ["", null],
    ];
    for (const [typed, stored] of table) expect(toUsPhone(typed), JSON.stringify(typed)).toBe(stored);
  });

  it("stores ten digits as +1 and nothing less", () => {
    expect(toUsPhone("(415) 555-0100")).toBe("+14155550100");
    expect(toUsPhone("415555")).toBeNull();
    expect(toUsPhone("")).toBeNull();
    // A whole number decides: a foreign one is not cut down to ten digits.
    expect(toUsPhone("+44 20 7946 0958")).toBeNull();
    expect(toUsPhone("+44 2079 4609")).toBeNull();
    expect(toUsPhone("+1 415 555 0100")).toBe("+14155550100");
    expect(toUsPhone("41555501009")).toBeNull();
    // No US area code starts with 0 or 1, so the stored shape never takes one.
    expect(toUsPhone("(015) 555-0100")).toBeNull();
    expect(toUsPhone("1 115 555 0100")).toBeNull();
  });

  // A saved number is a US one in E.164 (BL-969): it reads one way.
  it("shows a saved number as +1 (415) 555-0100", () => {
    expect(displayUsPhone("+14155550100")).toBe("+1 (415) 555-0100");
    expect(displayUsPhone(null)).toBeNull();
  });

  it("accepts only a US number in E.164", () => {
    expect(usPhoneSchema.safeParse("+14155550100").success).toBe(true);
    expect(usPhoneSchema.safeParse("+442079460958").success).toBe(false);
    expect(usPhoneSchema.safeParse("4155550100").success).toBe(false);
    expect(usPhoneSchema.safeParse("+10155550100").success).toBe(false);
  });
});
