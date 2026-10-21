import { ScreenError } from "../../lib/request-error";

export class ExportImageTooLargeError extends ScreenError {
  constructor() {
    super("This image exceeds safe browser limits. Choose PDF or turn off one long page to split the output. Nothing has been resized or split automatically.");
    this.name = "ExportImageTooLargeError";
  }
}

export function assertSafeExportCanvas(width: number, height: number): void {
  if (!Number.isFinite(width * height) || width <= 0 || height <= 0 || width > 16384 || height > 16384 || width * height > 64_000_000) {
    throw new ExportImageTooLargeError();
  }
}

export async function renderPdfPngs(pdf: Blob): Promise<readonly Blob[]> {
  return (await renderPdfPages(pdf, () => 2.5, false)).map(page => page.blob);
}

/** One page of the Export window's preview. Width and height are CSS pixels at actual size (96 DPI). */
export interface ExportPreviewPage { readonly blob: Blob; readonly width: number; readonly height: number; readonly lines: readonly string[] }
/** Preview pages: sharp enough at actual size, never larger than 4096 px on a side. */
export async function renderPdfPreviewPages(pdf: Blob): Promise<readonly ExportPreviewPage[]> {
  return renderPdfPages(pdf, (width, height) => Math.min(2, 4096 / Math.max(width, height)), true);
}

async function renderPdfPages(pdf: Blob, scaleFor: (width: number, height: number) => number, withText: boolean) {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
  const output: ExportPreviewPage[] = [];
  try {
    const document = await task.promise;
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const size = withText ? page.getViewport({ scale: 1 }) : null;
      const viewport = page.getViewport({ scale: size ? scaleFor(size.width, size.height) : scaleFor(0, 0) });
      const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
      assertSafeExportCanvas(width, height);
      const canvas = window.document.createElement("canvas");
      try {
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new ExportImageTooLargeError();
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new ExportImageTooLargeError()), "image/png"));
        const lines = withText ? (await page.getTextContent()).items.flatMap(item => "str" in item ? [item.str] : []) : [];
        output.push({ blob, width: Math.round((size?.width ?? 0) * 4 / 3), height: Math.round((size?.height ?? 0) * 4 / 3), lines });
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
    }
    return output;
  } finally { await task.destroy(); }
}
