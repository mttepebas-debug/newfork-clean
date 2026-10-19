import { useEffect, useRef, useState } from "react";
import { Button } from "@newfork/ui";
import { cropAvatar, squareCrop } from "./avatar-crop";
import { WindowAlert } from "../shell/WindowAlert";

export function AvatarCropDialog({ file, onCancel, onConfirm }: {
  file: File; onCancel: () => void; onConfirm: (file: File) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    dialog.current?.showModal();
    return () => { URL.revokeObjectURL(objectUrl); previousFocus?.focus(); };
  }, [file]);
  const crop = squareCrop(dimensions.width, dimensions.height, zoom, horizontal, vertical);
  const confirm = async () => {
    if (!image.current || !crop.size) return;
    setBusy(true);
    setError(null);
    try { onConfirm(await cropAvatar(image.current, zoom, horizontal, vertical)); }
    catch (error) { setError(error instanceof Error ? error.message : "Photo could not be cropped"); setBusy(false); }
  };
  return <dialog ref={dialog} className="account-confirmation-dialog account-crop-dialog"
    aria-labelledby="avatar-crop-title" aria-describedby="avatar-crop-help"
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="avatar-crop-title">Crop profile photo</h2>
    <p id="avatar-crop-help">Adjust the square preview. Use the arrow keys on each slider. Your photo is uploaded only when you save.</p>
    <div className="account-crop-preview" role="img" aria-label="Square photo preview">
      {url ? <img ref={image} src={url} alt="" onError={() => setError("This image could not be decoded. Choose another photo.")}
        onLoad={event => {
          const image = event.currentTarget;
          if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40_000_000) {
            setError("Choose an image with no more than 40 million pixels"); return;
          }
          setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
        }} style={crop.size ? { width: `${dimensions.width / crop.size * 100}%`, maxWidth: "none",
          left: `${-crop.x / crop.size * 100}%`, top: `${-crop.y / crop.size * 100}%` } : { visibility: "hidden" }} /> : null}
    </div>
    <fieldset disabled={busy || !crop.size} className="account-crop-controls">
      <label>Zoom<input autoFocus type="range" min="1" max="3" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
      <label>Horizontal position<input type="range" min="0" max="100" value={horizontal} onChange={e => setHorizontal(Number(e.target.value))} /></label>
      <label>Vertical position<input type="range" min="0" max="100" value={vertical} onChange={e => setVertical(Number(e.target.value))} /></label>
    </fieldset>
    <div className="account-form-actions">
      {/* Over the controls' bottom edge, above the buttons (UI-FIELDMSG). */}
      <WindowAlert message={error} />
      <Button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel crop</Button>
      <Button type="button" disabled={busy || !crop.size} onClick={() => void confirm()}>{busy ? "Preparing" : "Use photo"}</Button>
    </div>
  </dialog>;
}
