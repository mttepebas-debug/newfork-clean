import { describe, expect, it } from "vitest";
import { myLineupsSchema } from "./index";

const workspace = "00000000-0000-4000-8000-000000000001";
const lineup = {
  id: "00000000-0000-4000-8000-000000000002",
  version_id: "00000000-0000-4000-8000-000000000003",
  version: 1,
  location: { id: "00000000-0000-4000-8000-000000000004", name: "Downtown", timezone: "America/Los_Angeles" },
  shift_type_id: null,
  shift_type_name: null,
  color: null,
  shared_at: "2026-10-24T16:00:00+00:00",
  ask_ack: true,
  notes: { specials: "", n86: "", shift_notes: "" },
  team: [],
};

// Mert 2026-10-24: a published lineup at her location shows to her even when she is not on it.
describe("her lineups of a day", () => {
  it("reads the lineups she is not on beside her own", () => {
    const read = myLineupsSchema.parse({ workspace_id: workspace, date: "2026-10-24", lineups: [], others: [lineup] });

    expect(read.others).toHaveLength(1);
    expect(read.others[0]).not.toHaveProperty("mine");
  });

  it("reads none when an older read leaves them out", () => {
    expect(myLineupsSchema.parse({ workspace_id: workspace, date: "2026-10-24", lineups: [] }).others).toEqual([]);
  });
});
