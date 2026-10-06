import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MOTION_BOOT_SCRIPT } from "../motion/env";

describe("content security policy", () => {
  it("allows exactly the inline motion boot script", () => {
    const vercel = readFileSync(resolve(__dirname, "../../vercel.json"), "utf8");
    const hash = createHash("sha256").update(MOTION_BOOT_SCRIPT).digest("base64");
    expect(vercel).toContain(`'sha256-${hash}'`);
  });
});
