import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineupArt } from "./LineupArt";
import { loadLineupArtSvgs } from "./useLineupArt";

// The real chunk (~370 KB to transform): under a whole-repo run it takes more than waitFor's 1 s.
const CHUNK_TIMEOUT = 15000;

describe("LineupArt", () => {
  it("LineupArt shows initials until the chunk loads", async () => {
    // A fresh module, so the drawings are not loaded yet whatever ran before.
    vi.resetModules();
    const { LineupArt: Fresh } = await import("./LineupArt");
    const { container } = render(<Fresh artKey="001-server" name="Maria Alvarez" size={38} />);
    expect(screen.getByText("MA")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();

    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull(), { timeout: CHUNK_TIMEOUT });
    expect(screen.queryByText("MA")).toBeNull();
    const art = container.querySelector("svg")!.parentElement!;
    expect(art.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("shows the initials when the person has no drawing", async () => {
    await loadLineupArtSvgs();
    const { container } = render(<LineupArt artKey={null} name="Maria Alvarez" size={38} />);
    expect(screen.getByText("MA")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows the initials for a key the archive does not have, without throwing", async () => {
    await loadLineupArtSvgs();
    const { container } = render(<LineupArt artKey="999-nope" name="Eli" size={38} />);
    expect(screen.getByText("E")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("counts only the archive's own drawings, not what every object inherits", async () => {
    await loadLineupArtSvgs();
    for (const artKey of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const { container, unmount } = render(<LineupArt artKey={artKey} name="Maria Alvarez" size={38} />);
      expect(screen.getByText("MA")).toBeTruthy();
      expect(container.querySelector(".lineup-art--initials")).not.toBeNull();
      unmount();
    }
  });

  it("keeps the initials when the chunk does not load", async () => {
    vi.resetModules();
    vi.doMock("./art-svgs.generated", () => {
      throw new Error("chunk failed to load");
    });
    try {
      await expect(import("./art-svgs.generated")).rejects.toThrow();
      const { LineupArt: Fresh } = await import("./LineupArt");
      const { container } = render(<Fresh artKey="001-server" name="Maria Alvarez" size={38} />);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.getByText("MA")).toBeTruthy();
      expect(container.querySelector("svg")).toBeNull();
    } finally {
      vi.doUnmock("./art-svgs.generated");
    }
  });
});
