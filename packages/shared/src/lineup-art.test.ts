import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lineupArt, lineupArtByKey, lineupArtKeySchema, suggestLineupArt } from "./index";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("the drawing archive", () => {
  it("holds the pack's 173 pieces and the 8 team drawings, in number order", () => {
    expect(lineupArt).toHaveLength(181);
    expect(lineupArt.filter((item) => item.kind === "team")).toHaveLength(8);
    expect(lineupArt.map((item) => item.no)).toEqual(Array.from({ length: 181 }, (_, index) => index + 1));
    expect(lineupArt[0]?.key).toBe("001-server");
    expect(lineupArt.at(-1)?.key).toBe("181-team-mustache");
  });

  it("has one entry per key", () => {
    expect(new Set(lineupArt.map((item) => item.key)).size).toBe(181);
    expect(lineupArtByKey.size).toBe(181);
    for (const item of lineupArt) expect(lineupArtByKey.get(item.key)).toBe(item);
  });

  it("keeps every suggested job lower case and trimmed; team drawings suggest no job", () => {
    for (const item of lineupArt) {
      for (const job of item.jobs) {
        expect(job).toBe(job.trim().toLowerCase());
        expect(job).not.toBe("");
      }
      if (item.kind === "team") expect(item.jobs).toEqual([]);
      else expect(item.jobs.length).toBeGreaterThan(0);
    }
  });

  it("accepts only archive keys", () => {
    expect(lineupArtKeySchema.parse("001-server")).toBe("001-server");
    expect(lineupArtKeySchema.parse("174-team-apron")).toBe("174-team-apron");
    expect(lineupArtKeySchema.safeParse("nope").success).toBe(false);
    expect(lineupArtKeySchema.safeParse("").success).toBe(false);
  });
});

describe("suggestLineupArt", () => {
  it("suggests the same drawings whatever the case and spacing of the name", () => {
    const suggested = suggestLineupArt("Line Cook");
    expect(suggested.length).toBeGreaterThan(0);
    expect(suggestLineupArt("line cook")).toEqual(suggested);
    expect(suggestLineupArt("  LINE   cook ")).toEqual(suggested);
  });

  it("suggests at most 8, colour drawings first, then by number", () => {
    for (const name of ["Line Cook", "Server", "Cook", "Manager", "Bartender", "Prep"]) {
      const items = suggestLineupArt(name).map((key) => lineupArtByKey.get(key)!);
      expect(items.length).toBeLessThanOrEqual(8);
      const rank = items.map((item) => [item.style === "color" ? 0 : 1, item.no] as const);
      const sorted = [...rank].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      expect(rank).toEqual(sorted);
    }
    const cook = suggestLineupArt("Cook").map((key) => lineupArtByKey.get(key)!);
    expect(cook).toHaveLength(8);
  });

  it("matches a whole job, a job inside the name, or the name inside a job of three letters or more", () => {
    // A whole job: "Owner" is the job of one drawing only.
    expect(suggestLineupArt("Owner")).toEqual(["097-owner-open-ill"]);
    expect(lineupArtByKey.get("097-owner-open-ill")?.jobs).toContain("owner");
    // The name holds the job: "Head Server" has "server" in it.
    const head = suggestLineupArt("Head Server").map((key) => lineupArtByKey.get(key)!);
    expect(head.length).toBeGreaterThan(0);
    for (const item of head) expect(item.jobs.some((job) => "head server".includes(job) || job.includes("head server"))).toBe(true);
    // The job holds the name, three letters and up: "bar" sits inside "bartender".
    expect(suggestLineupArt("Bar").length).toBeGreaterThan(0);
  });

  it("suggests nothing for an empty name or a short name that is no job", () => {
    expect(suggestLineupArt("")).toEqual([]);
    expect(suggestLineupArt("   ")).toEqual([]);
    expect(suggestLineupArt("Zz")).toEqual([]);
  });

  it("never suggests a team drawing", () => {
    const names = ["Team member", "Any job", "Team", "Member", ...new Set(lineupArt.flatMap((item) => item.jobs))];
    for (const name of names) {
      for (const key of suggestLineupArt(name)) expect(lineupArtByKey.get(key)?.kind).not.toBe("team");
    }
  });
});

describe("generated files", () => {
  it("generated files are current", () => {
    const run = spawnSync(process.execPath, ["scripts/lineup-art/gen.mjs", "--check"], { cwd: root, encoding: "utf8" });
    expect(run.stdout + run.stderr).not.toMatch(/stale/i);
    expect(run.status).toBe(0);
  });

  it("refuses to rewrite the archive migration once it is live", () => {
    // A copy of the generator whose archive migration is listed as applied, in a scratch repository.
    const migration = "supabase/migrations/20261019122405_lineup_art_archive.sql";
    const scratch = mkdtempSync(join(tmpdir(), "lineup-art-gen-"));
    try {
      for (const rel of [migration, "packages/shared/src/lineup-art-rule.ts", "scripts/lineup-art/archive.json"])
        cpSync(join(root, rel), join(scratch, rel));
      writeFileSync(join(scratch, "package.json"), '{ "type": "module" }\n');
      const gen = readFileSync(join(root, "scripts/lineup-art/gen.mjs"), "utf8");
      const listed = gen.replace("const APPLIED_ARCHIVE_MIGRATIONS = [];", `const APPLIED_ARCHIVE_MIGRATIONS = ["${migration}"];`);
      expect(listed).not.toBe(gen);
      writeFileSync(join(scratch, "scripts/lineup-art/gen.mjs"), listed);
      const runGen = () => spawnSync(process.execPath, ["scripts/lineup-art/gen.mjs"], { cwd: scratch, encoding: "utf8" });
      const before = readFileSync(join(scratch, migration), "utf8");

      // The archive as it went live: nothing to rewrite, so the generator runs.
      expect(runGen().status).toBe(0);
      expect(readFileSync(join(scratch, migration), "utf8")).toBe(before);

      // One drawing suits one more job: the live migration's block would change, so it stops.
      const archivePath = join(scratch, "scripts/lineup-art/archive.json");
      const archive = JSON.parse(readFileSync(archivePath, "utf8"));
      archive[0].jobs.push("zz test job");
      writeFileSync(archivePath, `${JSON.stringify(archive, null, 2)}\n`);
      const run = runGen();
      expect(run.status).toBe(2);
      expect(run.stderr).toContain(`archive changed after ${migration} went live`);
      expect(readFileSync(join(scratch, migration), "utf8")).toBe(before);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
