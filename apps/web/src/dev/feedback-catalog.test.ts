import { readFileSync } from "node:fs";
import { toastCatalog } from "./feedback-catalog";

describe("feedback gallery toast catalog", () => {
  it.each(toastCatalog)("$title still exists in $source", (entry) => {
    expect(readFileSync(entry.source, "utf8")).toContain(`"${entry.title}"`);
  });
});
