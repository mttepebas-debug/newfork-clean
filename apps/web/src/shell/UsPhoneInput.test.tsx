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
    expect(field.value).toBe("(415) 555");
    fireEvent.change(field, { target: { value: "+1 415 555 0100 99" } });
    expect(field.value).toBe("(415) 555-0100");
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
