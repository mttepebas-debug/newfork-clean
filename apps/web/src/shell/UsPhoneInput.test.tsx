import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { UsPhoneInput } from "./UsPhoneInput";

// BL-503: the one US phone field (KARARLAR "Form ve girdi kuralları (ABD)").
describe("UsPhoneInput", () => {
  it("draws a fixed +1 before the number, out of the field's value", () => {
    render(<UsPhoneInput aria-label="Phone" value="" onChange={vi.fn()} />);
    const field = screen.getByLabelText("Phone") as HTMLInputElement;
    expect(field.closest(".us-phone-field")?.querySelector(".us-phone-prefix")?.textContent).toBe("+1");
    expect(field.value).toBe("");
    expect(field.type).toBe("tel");
    expect(field.inputMode).toBe("numeric");
    expect(field.placeholder).toBe("(415) 555-0100");
  });

  it("shows a saved number masked", () => {
    render(<UsPhoneInput aria-label="Phone" value="+14155550100" onChange={vi.fn()} />);
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("(415) 555-0100");
  });

  it("masks what is typed and keeps only digits", () => {
    function Harness() {
      const [value, setValue] = useState("");
      return <UsPhoneInput aria-label="Phone" value={value} onChange={setValue} />;
    }
    render(<Harness />);
    const field = screen.getByLabelText("Phone") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "415a555" } });
    expect(field.value).toBe("(415) 555-");
    fireEvent.change(field, { target: { value: "+1 415 555 0100 99" } });
    expect(field.value).toBe("(415) 555-0100");
  });

  // Mert, 2026-10-09 (mask A): the brackets come with the 3rd digit and the dash
  // with the 6th, and each leaves with that digit when it is erased.
  it("brings and takes each separator with the digit that closes its group", () => {
    function Harness() {
      const [value, setValue] = useState("");
      return <UsPhoneInput aria-label="Phone" value={value} onChange={setValue} />;
    }
    render(<Harness />);
    const field = screen.getByLabelText("Phone") as HTMLInputElement;
    const typedShows: string[] = [];
    for (const key of "4155550100") {
      fireEvent.change(field, { target: { value: field.value + key } });
      typedShows.push(field.value);
    }
    expect(typedShows).toEqual([
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
    ]);
    const erasedShows: string[] = [];
    while (field.value) {
      // Backspace at the end takes the last character, a separator included.
      fireEvent.change(field, { target: { value: field.value.slice(0, -1) } });
      erasedShows.push(field.value);
    }
    expect(erasedShows).toEqual([
      "(415) 555-010",
      "(415) 555-01",
      "(415) 555-0",
      "(415) 555-",
      "(415) 55",
      "(415) 5",
      "(415)",
      "41",
      "4",
      "",
    ]);
  });

  // BL-969 code review: cut to ten digits, "+44 …" read as a wrong US number.
  // It stays as typed, key by key too, and the form refuses it on save.
  it("keeps a number from outside the US as typed, key by key too", () => {
    function Harness() {
      const [value, setValue] = useState("");
      return <UsPhoneInput aria-label="Phone" value={value} onChange={setValue} />;
    }
    render(<Harness />);
    const field = screen.getByLabelText("Phone") as HTMLInputElement;
    let typed = "";
    for (const key of "+44 20 7946 0958") {
      typed = field.value + key;
      fireEvent.change(field, { target: { value: typed } });
    }
    expect(field.value).toBe("+44 20 7946 0958");
    fireEvent.change(field, { target: { value: "(+44) 20 7946 0958" } });
    expect(field.value).toBe("(+44) 20 7946 0958");
  });

  // The browser cuts a paste to maxLength before the mask sees it: the app's
  // own "+1 (415) 555-0100" (17 characters) must fit.
  it("takes a paste of the number as the app shows it", () => {
    render(<UsPhoneInput aria-label="Phone" value="" onChange={vi.fn()} />);
    const field = screen.getByLabelText("Phone") as HTMLInputElement;
    expect(field.maxLength).toBeGreaterThanOrEqual("tel:+1-415-555-0100".length);
  });

  it("keeps the screen's own class and attributes", () => {
    render(
      <UsPhoneInput id="contact-phone" className="account-input" aria-invalid required value="" onChange={vi.fn()} />,
    );
    const field = document.getElementById("contact-phone") as HTMLInputElement;
    expect(field.className).toContain("account-input");
    expect(field.className).toContain("us-phone-input");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.required).toBe(true);
  });
});
