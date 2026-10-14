// The Export preview counts PDF pages with pdf.js. The Artifact viewer does not
// let the page start a worker or load script from a data: URL, so pdf.js would
// fall back to a "fake worker", warn about it on screen, and still fail. Here
// pdf.js gets its worker code up front and runs on the page's own thread.
const FAKE_WORKER_WARNING = "Warning: Setting up fake worker.";

export async function installPdfWorker(): Promise<void> {
  const original = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (args[0] === FAKE_WORKER_WARNING) return;
    original(...args);
  };
  // @ts-expect-error pdf.js ships no types for the worker module.
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs");
}
