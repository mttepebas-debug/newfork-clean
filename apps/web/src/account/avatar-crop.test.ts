import { describe, expect, it, vi } from "vitest";
import { cropAvatar, squareCrop, validateAvatarFile } from "./avatar-crop";
describe("square avatar crop", () => {
  it("crops landscape and portrait without leaving the image bounds", () => {
    expect(squareCrop(800,400,1,50,50)).toEqual({ size:400,x:200,y:0 });
    expect(squareCrop(400,800,2,100,0)).toEqual({ size:200,x:200,y:0 });
    expect(squareCrop(400,400,3,100,100).x + squareCrop(400,400,3,100,100).size).toBe(400);
  });
  it("rejects empty, large and unsupported originals", () => {
    for (const file of [new File([],"empty.png",{type:"image/png"}),
      new File([new Uint8Array(5*1024*1024+1)],"large.png",{type:"image/png"}),
      new File(["svg"],"photo.svg",{type:"image/svg+xml"})]) expect(() => validateAvatarFile(file)).toThrow();
  });
  it("exports exactly the preview rectangle as a 512px PNG", async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({drawImage} as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype,"toBlob").mockImplementation(function(this: HTMLCanvasElement, callback) {
      expect(this.width).toBe(512); expect(this.height).toBe(512);
      callback(new Blob(["png"],{type:"image/png"}));
    });
    const source = {naturalWidth:800,naturalHeight:400} as HTMLImageElement;
    const file = await cropAvatar(source,2,50,50);
    expect(drawImage).toHaveBeenCalledWith(source,300,100,200,200,0,0,512,512);
    expect(file.type).toBe("image/png");
    vi.restoreAllMocks();
  });
});
