import { useEffect, useId, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button, ConfirmButton } from "@newfork/ui";
import { lineupArtByKey, lineupArtKeySchema, type Avatar, type AvatarChoice, type LineupArtKey } from "@newfork/shared";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import { LineupArtGrid } from "../lineup-art/LineupArtGrid";
import { AvatarCropDialog } from "../account/AvatarCropDialog";
import { validateAvatarFile } from "../account/avatar-crop";
import { WindowAlert } from "../shell/WindowAlert";
import { MemberAvatar } from "./MemberAvatar";
import { avatarErrorText, uploadAvatarPhoto } from "./avatar-data";
import "./avatar-picker.css";

// AVATAR-IKON (design 4.3; Mert, 19 Oct: B, desktop and phone): one window, one list. The preview on
// top says what Save keeps; under it the archive's grid with "Upload photo" as its first tile. A photo
// is cropped first (AvatarCropDialog) and uploaded only on Save. On a phone the window is a sheet from
// the bottom. Profile and onboarding open the same window.

type Draft =
  | { readonly kind: "none" }
  | { readonly kind: "art"; readonly key: LineupArtKey }
  | { readonly kind: "current-photo"; readonly url: string | null }
  | { readonly kind: "new-photo"; readonly file: File };

function fromAvatar(avatar: Avatar | null): Draft {
  if (!avatar) return { kind: "none" };
  return avatar.kind === "art" ? { kind: "art", key: avatar.art_key } : { kind: "current-photo", url: avatar.url };
}

type Props = {
  readonly open: boolean;
  /** Where a new photo is uploaded to: the workspace the avatar belongs to. */
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly personName: string;
  readonly initial: Avatar | null;
  readonly suggested: readonly string[];
  readonly onSave: (choice: AvatarChoice) => Promise<void>;
  /** Given when there is an avatar to remove. */
  readonly onRemove?: () => Promise<void>;
  readonly onClose: () => void;
};

export function AvatarPicker(props: Props) {
  // A window of its own each time it opens: a closed one keeps no draft.
  return props.open ? <AvatarWindow {...props} /> : null;
}

function AvatarWindow({ workspaceId, workspaceName, personName, initial, suggested, onSave, onRemove, onClose }: Props) {
  const phone = useListPhoneWidth();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(() => fromAvatar(initial));
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newFile = draft.kind === "new-photo" ? draft.file : null;

  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal?.();
    dialog?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    return () => {
      dialog?.close?.();
      opener?.focus({ preventScroll: true });
    };
    // Once per window: showModal again would replay the sheet's slide and the focus.
  }, []);

  useEffect(() => {
    if (!newFile) return;
    const url = URL.createObjectURL(newFile);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newFile]);

  const changed =
    draft.kind === "new-photo" ||
    (draft.kind === "art" && !(initial?.kind === "art" && initial.art_key === draft.key));
  const preview: Avatar | null =
    draft.kind === "art"
      ? { kind: "art", art_key: draft.key }
      : draft.kind === "current-photo"
        ? { kind: "photo", url: draft.url }
        : draft.kind === "new-photo"
          ? { kind: "photo", url: photoUrl }
          : null;
  const chosen =
    draft.kind === "art"
      ? (lineupArtByKey.get(draft.key)?.name ?? "Drawing")
      : draft.kind === "none"
        ? "No avatar yet"
        : "Your photo";

  function close() {
    if (!busy) onClose();
  }

  function pickFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    setError(null);
    try {
      validateAvatarFile(file);
      setCropFile(file);
    } catch (refusal: unknown) {
      setError(refusal instanceof Error ? refusal.message : "This photo couldn't be used.");
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (draft.kind === "art") await onSave({ art_key: draft.key });
      else if (draft.kind === "new-photo") await onSave({ photo_path: await uploadAvatarPhoto(workspaceId, draft.file) });
      onClose();
    } catch (failure: unknown) {
      setError(avatarErrorText(failure));
      setBusy(false);
    }
  }

  async function remove() {
    if (!onRemove) return;
    setBusy(true);
    setError(null);
    try {
      await onRemove();
      onClose();
    } catch (failure: unknown) {
      setError(avatarErrorText(failure));
      setBusy(false);
    }
  }

  const uploadTile = (
    <button
      type="button"
      className="lineup-art-tile avatar-upload-tile"
      disabled={busy}
      onClick={() => fileInput.current?.click()}
    >
      <Upload size={22} aria-hidden />
      <span>Upload photo</span>
    </button>
  );

  return (
    <dialog
      ref={ref}
      className={`avatar-picker ${phone ? "avatar-picker--sheet" : "avatar-picker--window"}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="avatar-picker-inner">
        <header className="avatar-picker-head">
          <div>
            <h2 id={titleId} tabIndex={-1}>
              Your avatar
            </h2>
            <p>For {workspaceName}. Upload your photo or pick one of ours.</p>
          </div>
          <button type="button" className="avatar-picker-close" aria-label="Close" disabled={busy} onClick={close}>
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="avatar-picker-body">
          <div className="avatar-picker-preview">
            <MemberAvatar avatar={preview} name={personName} size={phone ? 64 : 88} />
            <div className="avatar-picker-preview-text">
              <strong>{personName}</strong>
              <span className="avatar-picker-chosen">{chosen}</span>
              <small>Only in {workspaceName}. Other workspaces keep their own.</small>
            </div>
          </div>
          <LineupArtGrid
            mode="single"
            label="Avatars"
            selected={draft.kind === "art" ? [draft.key] : []}
            suggested={suggested}
            leadTile={uploadTile}
            disabled={busy}
            onToggle={(picked) => {
              const key = lineupArtKeySchema.safeParse(picked);
              if (!key.success) return;
              setError(null);
              setDraft({ kind: "art", key: key.data });
            }}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose a photo"
            hidden
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
        </div>
        <footer className="avatar-picker-foot">
          <WindowAlert message={error} />
          {initial && onRemove ? (
            <ConfirmButton
              className="danger-button avatar-picker-remove"
              confirmLabel="Confirm remove"
              disabled={busy}
              onConfirm={() => void remove()}
            >
              Remove avatar
            </ConfirmButton>
          ) : null}
          <Button type="button" className="secondary-button avatar-picker-cancel" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={!changed || busy} onClick={() => void save()}>
            {busy ? "Saving" : "Save"}
          </Button>
        </footer>
      </div>
      {cropFile ? (
        <AvatarCropDialog
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(file) => {
            setCropFile(null);
            setDraft({ kind: "new-photo", file });
          }}
        />
      ) : null}
    </dialog>
  );
}
