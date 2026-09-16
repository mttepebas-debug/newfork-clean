import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPdfPngs } from "./png";

const engine = vi.hoisted(() => ({ getDocument: vi.fn(), worker: { workerSrc: "" } }));
vi.mock("pdfjs-dist", () => ({ getDocument: engine.getDocument, GlobalWorkerOptions: engine.worker }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/assets/pdf.worker.min.mjs" }));

describe("PDF-to-PNG delivery adapter", () => {
  const cleanup = vi.fn();
  const destroy = vi.fn().mockResolvedValue(undefined);
  const render = vi.fn<({ canvas }: { canvas: HTMLCanvasElement }) => { promise: Promise<void> }>();
  const getViewport = vi.fn();
  const pdf = { numPages: 2, getPage: vi.fn() };
  const input = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) } as Blob;
  beforeEach(() => {
    vi.clearAllMocks();
    render.mockReturnValue({ promise: Promise.resolve() });
    destroy.mockResolvedValue(undefined);
    getViewport.mockReturnValue({ width: 2325, height: 7438 });
    pdf.getPage.mockResolvedValue({ getViewport, render, cleanup });
    engine.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["png"], { type: "image/png" })));
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders every page at 180 DPI and releases the canvas and worker", async () => {
    const pages = await renderPdfPngs(input);
    expect(pages).toHaveLength(2);
    expect(pages.every(page => page.type === "image/png")).toBe(true);
    expect(getViewport).toHaveBeenCalledWith({ scale: 2.5 });
    expect(engine.worker.workerSrc).toBe("/assets/pdf.worker.min.mjs");
    expect(cleanup).toHaveBeenCalledTimes(2);
    for (const [options] of render.mock.calls) {
      expect(options.canvas.width).toBe(0); expect(options.canvas.height).toBe(0);
    }
    expect(destroy).toHaveBeenCalledOnce();
  });
  it("rejects a device-limit page without returning partial output", async () => {
    getViewport.mockReturnValueOnce({ width: 800, height: 600 }).mockReturnValueOnce({ width: 20000, height: 1000 });
    await expect(renderPdfPngs(input)).rejects.toThrow("safe browser limits");
    expect(render).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });
  it("releases resources when canvas encoding fails", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(callback => callback(null));
    await expect(renderPdfPngs(input)).rejects.toThrow("safe browser limits");
    expect(cleanup).toHaveBeenCalledOnce(); expect(destroy).toHaveBeenCalledOnce();
  });
  it("destroys a failed PDF loading task too", async () => {
    engine.getDocument.mockReturnValue({ promise: Promise.reject(new Error("Invalid PDF")), destroy });
    await expect(renderPdfPngs(input)).rejects.toThrow("Invalid PDF");
    expect(destroy).toHaveBeenCalledOnce();
  });
});
