import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  displayUsPhone,
  formatUsPhone,
  hasTurkishOnlyLetters,
  toUsPhone,
  usLettersMessage,
  usPhoneDigits,
  usPhoneDraft,
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

  it("takes nothing from a pasted number from outside the US", () => {
    // Cut to ten digits, "+44 …" would become a wrong US number.
    expect(usPhoneDigits("+44 20 7946 0958")).toBe("");
    expect(formatUsPhone("+44 20 7946 0958")).toBe("");
    expect(formatUsPhone("+1 415 555 0100")).toBe("(415) 555-0100");
    expect(formatUsPhone("+")).toBe("");
  });

  it("masks while typing", () => {
    expect(formatUsPhone("")).toBe("");
    expect(formatUsPhone("41")).toBe("(41");
    expect(formatUsPhone("4155")).toBe("(415) 5");
    expect(formatUsPhone("4155550100")).toBe("(415) 555-0100");
    expect(formatUsPhone("+14155550100")).toBe("(415) 555-0100");
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

  it("starts a phone field from a saved US number, and leaves any other one empty", () => {
    expect(usPhoneDraft("+14155550100")).toBe("(415) 555-0100");
    expect(usPhoneDraft("4155550199")).toBe("(415) 555-0199");
    // Drawn into the mask, "+44 …" would read as a wrong US number.
    expect(usPhoneDraft("+442079460958")).toBe("");
    expect(usPhoneDraft(null)).toBe("");
    expect(usPhoneDraft(undefined)).toBe("");
  });

  it("shows a saved US number one way and anything else as saved", () => {
    expect(displayUsPhone("+14155550100")).toBe("+1 (415) 555-0100");
    expect(displayUsPhone("609 551 8910")).toBe("+1 (609) 551-8910");
    expect(displayUsPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(displayUsPhone(null)).toBeNull();
  });

  it("accepts only a US number in E.164", () => {
    expect(usPhoneSchema.safeParse("+14155550100").success).toBe(true);
    expect(usPhoneSchema.safeParse("+442079460958").success).toBe(false);
    expect(usPhoneSchema.safeParse("4155550100").success).toBe(false);
    expect(usPhoneSchema.safeParse("+10155550100").success).toBe(false);
  });
});
