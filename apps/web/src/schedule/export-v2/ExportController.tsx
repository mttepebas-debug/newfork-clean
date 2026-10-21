import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authorizeScheduleExportV2 } from "../schedule-data";
import { ExportSettingsPanel } from "./ExportSettingsPanel";
import { ExportPreview } from "./ExportPreview";
import { downloadExportFile, exportAuthorizationScope, renderExportFiles, type ExportDownload } from "./files";
import { defaultExportPreferences, exportPreferencesKey, loadExportPreferences, saveExportPreferences, type ExportPreferences } from "./preferences";
import type { ScheduleExportSnapshot, SnapshotResult } from "./snapshot";
import { requestErrorText } from "../../lib/request-error";

/** Mount keyed by user/workspace. All schedule data and blob URLs live only in memory. */
export function ExportController({ userId, workspaceId, result, canManageLocations, sourceError }: {
  readonly userId: string; readonly workspaceId: string; readonly result: SnapshotResult;
  readonly canManageLocations: boolean; readonly sourceError?: string | null;
}) {
  const preferenceKey = exportPreferencesKey(userId, workspaceId);
  const [preferences, setPreferences] = useState<ExportPreferences>(() => {
    try { return loadExportPreferences(window.localStorage, preferenceKey); } catch { return { ...defaultExportPreferences }; }
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const requests = useRef(new Set<AbortController>());
  const urls = useRef(new Set<string>());
  const previewWindow = useRef<Window | null>(null);
  const [previewTarget, setPreviewTarget] = useState<HTMLElement | null>(null);
  const [inlineTarget, setInlineTarget] = useState<HTMLElement | null>(null);
  const onInlineTarget = useCallback((target: HTMLElement | null) => setInlineTarget(target), []);
  const previewing = Boolean(previewTarget || inlineTarget);
  const [downloads, setDownloads] = useState<{ snapshot: ScheduleExportSnapshot; files: readonly ExportDownload[] } | null>(null);
  // Last completed preview. It stays on screen while a newer render is in flight.
  const [preview, setPreview] = useState<{ key: string; files: readonly ExportDownload[]; error: string | null } | null>(null);
  const previewRef = useRef(preview);
  const rendering = useRef(false);
  const rerender = useRef(false);
  const [renderTick, setRenderTick] = useState(0);
  const inputKey = useMemo(() => JSON.stringify({ result, preferences }), [result, preferences]);
  const release = (files: readonly ExportDownload[]) => {
    for (const file of files) { URL.revokeObjectURL(file.url); urls.current.delete(file.url); }
  };
  const withUrls = (files: Awaited<ReturnType<typeof renderExportFiles>>) => files.map(file => {
    const url = URL.createObjectURL(file.blob); urls.current.add(url); return { ...file, url };
  });
  useEffect(() => {
    alive.current = true;
    const dispose = () => {
      alive.current = false;
      for (const request of requests.current) request.abort(); requests.current.clear();
      for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear();
      previewWindow.current?.close(); previewWindow.current = null;
    };
    window.addEventListener("pagehide", dispose);
    return () => { window.removeEventListener("pagehide", dispose); dispose(); };
  }, []);
  useEffect(() => {
    if (!previewTarget) return;
    const timer = window.setInterval(() => {
      if (!previewWindow.current || previewWindow.current.closed) { previewWindow.current = null; setPreviewTarget(null); }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [previewTarget]);
  useEffect(() => {
    if (!previewing) return;
    const publish = (next: { key: string; files: readonly ExportDownload[]; error: string | null }) => {
      if (previewRef.current) release(previewRef.current.files);
      previewRef.current = next; setPreview(next);
    };
    const timer = window.setTimeout(() => {
      if (result.status !== "ready") { publish({ key: inputKey, files: [], error: sourceError ?? null }); return; }
      // pdfmake cannot be cancelled: one render at a time, then once more with the latest input if it changed meanwhile.
      if (rendering.current) { rerender.current = true; return; }
      rendering.current = true;
      const request = new AbortController(); requests.current.add(request);
      const snapshot = result.snapshot, scope = exportAuthorizationScope(snapshot);
      void (async () => {
        await authorizeScheduleExportV2(workspaceId, scope, request.signal);
        const rendered = await renderExportFiles(snapshot, preferences);
        await authorizeScheduleExportV2(workspaceId, scope, request.signal);
        if (!alive.current || request.signal.aborted) return;
        publish({ key: inputKey, files: withUrls(rendered), error: null });
      })().catch((failure: unknown) => {
        if (!alive.current || request.signal.aborted) return;
        publish({ key: inputKey, files: [], error: requestErrorText(failure, "Could not prepare the preview") });
      }).finally(() => {
        requests.current.delete(request); rendering.current = false;
        if (rerender.current && alive.current) { rerender.current = false; setRenderTick(tick => tick + 1); }
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [inputKey, preferences, previewing, renderTick, result, sourceError, workspaceId]);

  const changePreferences = (value: ExportPreferences) => {
    setPreferences(value); setError(null);
    try { saveExportPreferences(window.localStorage, preferenceKey, value); }
    catch { setError("These settings work for this session, but your browser could not remember them."); }
  };
  const openPreview = () => {
    if (result.status !== "ready") return;
    if (previewWindow.current && !previewWindow.current.closed) { previewWindow.current.focus(); return; }
    const child = window.open("about:blank", "_blank");
    if (!child) { setError("Your browser blocked the preview tab. Allow pop-ups for this app, then try again. Direct download remains available."); return; }
    child.opener = null; child.document.title = "Schedule export preview";
    const root = child.document.createElement("main"); child.document.body.replaceChildren(root);
    previewWindow.current = child; setPreviewTarget(root); setError(null);
  };
  const runDownload = async () => {
    if (busyRef.current || result.status !== "ready") return;
    const snapshot = result.snapshot, prefs = { ...preferences }, scope = exportAuthorizationScope(snapshot);
    const request = new AbortController(); requests.current.add(request);
    busyRef.current = true; setBusy(true); setError(null);
    try {
      await authorizeScheduleExportV2(workspaceId, scope, request.signal);
      const files = await renderExportFiles(snapshot, prefs);
      await authorizeScheduleExportV2(workspaceId, scope, request.signal);
      if (!alive.current || request.signal.aborted) return;
      const ready = withUrls(files);
      if (downloads) release(downloads.files);
      setDownloads({ snapshot, files: ready });
      for (const file of ready) downloadExportFile(file);
    } catch (failure) {
      if (alive.current && !request.signal.aborted) setError(requestErrorText(failure, "Could not prepare this export"));
    } finally {
      requests.current.delete(request); busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const downloadAgain = async (file: ExportDownload) => {
    if (!downloads) return;
    const request = new AbortController(); requests.current.add(request);
    try {
      await authorizeScheduleExportV2(workspaceId, exportAuthorizationScope(downloads.snapshot), request.signal);
      if (alive.current && !request.signal.aborted) downloadExportFile(file);
    } catch (failure) {
      if (alive.current && !request.signal.aborted) setError(requestErrorText(failure, "Export access could not be verified"));
    } finally { requests.current.delete(request); }
  };
  const currentPreview = preview;
  const previewLoading = result.status === "ready" && preview?.key !== inputKey;
  const panelProps = {
    result, preferences, onChange: changePreferences, onPreview: openPreview,
    onExport: () => preferences.destination === "print" && preferences.format !== "xlsx" ? openPreview() : void runDownload(),
    busy, error: sourceError ?? error, canManageLocations,
    footer: downloads ? <div className="export-v2-downloads"><p>Last generated files{downloads.files.length > 1 ? ". If your browser blocks multiple downloads, save each file below." : ""}</p>
      {downloads.files.map(file => <button type="button" key={file.url} onClick={() => void downloadAgain(file)}>{file.name}</button>)}
    </div> : null,
  };
  const previewProps = {
    snapshot: result.status === "ready" ? result.snapshot : null, preferences, files: currentPreview?.files ?? [],
    loading: previewLoading, error: currentPreview?.error ?? sourceError ?? null, onDownload: () => void runDownload(),
  };
  return <>
    <ExportSettingsPanel {...panelProps} onInlineTarget={onInlineTarget} inline={{ files: previewProps.files, loading: previewProps.loading }} />
    {/* PDF and Image pages are drawn by the panel itself (3P #62); the sheet thumbnail is for Excel. */}
    {inlineTarget && preferences.format === "xlsx" ? <ExportPreview target={inlineTarget} {...previewProps} /> : null}
    {previewTarget ? <ExportPreview target={previewTarget} {...previewProps} /> : null}
  </>;
}
