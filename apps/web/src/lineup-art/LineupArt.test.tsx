import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineupArt } from "./LineupArt";

describe("LineupArt", () => {
  // First in the file on purpose: the drawings load once per module, so this is the render that waits.
  it("LineupArt shows initials until the chunk loads", async () => {
    const { container } = render(<LineupArt artKey="001-server" name="Maria Alvarez" size={38} />);
    expect(screen.getByText("MA")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();

    // The real chunk (~370 KB to transform): under a whole-repo run it takes more than waitFor's 1 s.
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull(), { timeout: 15000 });
    expect(screen.queryByText("MA")).toBeNull();
    const art = container.querySelector("svg")!.parentElement!;
    expect(art.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("shows the initials when the person has no drawing", async () => {
    const { container } = render(<LineupArt artKey={null} name="Maria Alvarez" size={38} />);
    // Even with the drawings loaded (the first test loaded them), no key means initials.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("MA")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows the initials for a key the archive does not have, without throwing", async () => {
    const { container } = render(<LineupArt artKey="999-nope" name="Eli" size={38} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("E")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
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
