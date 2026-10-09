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
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
  const output: Blob[] = [];
  try {
    const document = await task.promise;
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 2.5 });
      const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
      assertSafeExportCanvas(width, height);
      const canvas = window.document.createElement("canvas");
      try {
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new ExportImageTooLargeError();
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        output.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new ExportImageTooLargeError()), "image/png")));
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
    }
    return output;
  } finally { await task.destroy(); }
}
