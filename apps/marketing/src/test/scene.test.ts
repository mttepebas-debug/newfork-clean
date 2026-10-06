import { scriptDuration, stepClasses, stepForProgress } from "../motion/scene";

describe("scene state machine", () => {
  it("lists every beat reached", () => {
    expect(stepClasses(0)).toBe("");
    expect(stepClasses(3)).toBe("s1 s2 s3");
  });

  it("maps scroll progress across all beats", () => {
    expect(stepForProgress(0, 4)).toBe(0);
    expect(stepForProgress(0.5, 4)).toBe(2);
    expect(stepForProgress(1, 4)).toBe(4);
    expect(stepForProgress(2, 4)).toBe(4);
  });

  it("sums a script's length", () => {
    expect(scriptDuration({ beats: [{ name: "a", delay: 100 }, { name: "b", delay: 200 }], endHold: 50 })).toBe(350);
  });
});
