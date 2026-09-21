import { normalizeAccountPhone } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  listWorkspaceIdentities,
  removeAccountAvatar,
  supabaseClient,
  uploadAccountAvatar,
} from "../lib/supabase";
import { AccountPageHeader } from "./components";
import { useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { validateAvatarFile } from "./avatar-crop";
import { AccountAvatar } from "./AccountAvatar";
import { roleLabel } from "../shell/prebiz/PreBiz";

const callingCodes = [
  { value: "1", label: "US/CA +1" },
  { value: "44", label: "GB +44" },
  { value: "61", label: "AU +61" },
  { value: "90", label: "TR +90" },
] as const;

export default function ProfilePage() {
  const { account, updateAccount } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [callingCode, setCallingCode] = useState("1");
  const [avatarObjectPath, setAvatarObjectPath] = useState(account?.avatarObjectPath ?? null);
  const [avatarUrl, setAvatarUrl] = useState(account?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  useEffect(() => {
    if (!draftFile) return;
    const url = URL.createObjectURL(draftFile);
    setAvatarUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draftFile]);

  useEffect(() => {
    if (!account || dirty) return;
    setDisplayName(account.displayName);
    setPhone(account.phone ?? "");
    setAvatarObjectPath(account.avatarObjectPath);
    setAvatarUrl(account.avatarUrl);
  }, [account, dirty]);

  const navigationDialog = useAvailabilityNavigationGuard({
    dirty, busy: saving || Boolean(cropFile), onDiscard: () => discard(),
    labels: { saving: "Saving profile", discard: "Discard profile changes?", saved: "Profile saved",
      unsaved: "Your unsaved profile changes will be lost." },
  });

  if (!account) return null;

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
  };

  const closeCropDialog = () => {
    setCropFile(null);
    requestAnimationFrame(() =>
      document.getElementById("profile-photo-upload-trigger")?.focus(),
    );
  };

  const discard = () => {
    setDraftFile(null);
    setDisplayName(account.displayName);
    setPhone(account.phone ?? "");
    setAvatarObjectPath(account.avatarObjectPath);
    setAvatarUrl(account.avatarUrl);
    setDirty(false);
    setSaved(false);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    let profileSaved = false;
    try {
      const normalizedPhone = normalizeAccountPhone(phone, callingCode);
      const previousAvatarPath = account.avatarObjectPath;
      let nextAvatar = { avatarObjectPath, avatarUrl };
      if (draftFile) {
        if (!supabaseClient) throw new Error("Account photo storage is not configured");
        nextAvatar = await uploadAccountAvatar(supabaseClient, account.userId, draftFile);
      }
      await updateAccount(displayName, account.theme, normalizedPhone, {
        ...nextAvatar,
      });
      profileSaved = true;
      setDraftFile(null);
      setAvatarObjectPath(nextAvatar.avatarObjectPath);
      setAvatarUrl(nextAvatar.avatarUrl);
      setDirty(false);
      setSaved(true);
      if (supabaseClient && previousAvatarPath && previousAvatarPath !== nextAvatar.avatarObjectPath) {
        await removeAccountAvatar(supabaseClient, account.userId, previousAvatarPath);
      }
    } catch (saveError: unknown) {
      // A failed save response may follow a committed profile write. Do not
      // delete the new object on that ambiguous outcome and break its reference.
      setError(profileSaved ? "Profile saved, but the previous photo could not be removed."
        : saveError instanceof Error ? saveError.message : "Profile could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const selectAvatar = (file: File | undefined) => {
    if (!file) return;
    if (!supabaseClient) {
      setError("Account photo storage is not configured");
      return;
    }
    setError(null);
    try {
      validateAvatarFile(file);
      setCropFile(file);
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Photo could not be uploaded");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <section className="account-page" aria-labelledby="profile-title">
      {navigationDialog}
      {cropFile ? <AvatarCropDialog file={cropFile} onCancel={closeCropDialog} onConfirm={file => {
        setDraftFile(file); closeCropDialog(); markDirty();
      }} /> : null}
      <AccountPageHeader
        title="Profile"
        titleId="profile-title"
        description="Personal details used across Newfork. Workspace employee records stay independent after onboarding."
      />
      <form onSubmit={submit}>
        <section className="account-section-block">
          <div className="account-section-copy">
            <h2>Profile photo</h2>
            <p>Add a recognizable image for account menus and collaboration surfaces.</p>
          </div>
          <div className="account-section-body">
            <div className="account-avatar-row">
              <AccountAvatar globalUrl={avatarUrl} className="account-avatar-large" name={displayName} />
              <div>
                <div className="account-button-row">
                  <Button id="profile-photo-upload-trigger" type="button" className="secondary-button" disabled={saving} onClick={() => fileInput.current?.click()}>
                    <Camera size={15} aria-hidden /> {avatarUrl ? "Replace" : "Upload"}
                  </Button>
                  <Button
                    type="button"
                    className="secondary-button danger-button"
                    disabled={saving || (!avatarObjectPath && !draftFile)}
                    onClick={() => {
                      setDraftFile(null);
                      setAvatarObjectPath(null);
                      setAvatarUrl(null);
                      markDirty();
                    }}
                  >
                    <Trash2 size={15} aria-hidden /> Remove
                  </Button>
                </div>
                <span className="field-help">JPG, PNG or WebP · up to 5 MB</span>
              </div>
              <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Choose profile photo"
                disabled={saving}
                onChange={(event) => selectAvatar(event.target.files?.[0])}
              />
            </div>
          </div>
        </section>

        <section className="account-section-block">
          <div className="account-section-copy">
            <h2>Personal details</h2>
            <p>Your display name is global. Changing it does not rewrite an existing employee legal name.</p>
          </div>
          <div className="account-section-body account-field-grid">
            <label className="account-field account-field-wide" htmlFor="account-display-name">
              <span>Display name</span>
              <input
                id="account-display-name"
                aria-label="Display name"
                value={displayName}
                maxLength={100}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  markDirty();
                }}
                required
              />
              <small>Shown throughout Newfork.</small>
            </label>
            <label className="account-field account-field-wide">
              <span>Phone number</span>
              <span className="account-phone-field">
                <select
                  aria-label="Country calling code"
                  value={callingCode}
                  onChange={(event) => {
                    setCallingCode(event.target.value);
                    markDirty();
                  }}
                >
                  {callingCodes.map((item) => (
                    <option key={item.label} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <input
                  id="account-phone-number"
                  aria-label="Phone number"
                  type="tel"
                  value={phone}
                  maxLength={30}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    markDirty();
                  }}
                  placeholder="415 555 0142"
                />
              </span>
              <small>Optional. Saved in international format and used only for your global account.</small>
            </label>
          </div>
        </section>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {saved ? <p className="form-success" role="status">Profile saved</p> : null}
        <div className="account-form-actions">
          <Button type="button" className="secondary-button" disabled={!dirty || saving} onClick={() => void discard()}>
            Discard
          </Button>
          <Button type="submit" disabled={!dirty || saving || !displayName.trim()}>
            {saving ? "Saving" : "Save changes"}
          </Button>
        </div>
      </form>
      <WorkspaceIdentities />
    </section>
  );
}

/**
 * The account is one thing; each workspace keeps its own record of the person.
 * Editing the name above changes what teammates see; it does not touch the name
 * a workspace files them under, and until now nothing said so.
 */
function WorkspaceIdentities() {
  const identities = useQuery({
    queryKey: ["account-workspace-identities"],
    queryFn: () =>
      supabaseClient ? listWorkspaceIdentities(supabaseClient) : [],
  });

  if (identities.isLoading || (identities.data ?? []).length === 0) return null;

  return (
    <section className="account-section-block" aria-labelledby="account-identities-title">
      <div className="account-section-copy">
        <h2 id="account-identities-title">How you appear in each workspace</h2>
        <p>
          Your account is yours. Each workspace keeps its own record of you, and
          a manager there can correct it.
        </p>
      </div>
      <div className="account-section-body">
        <ul className="account-identity-list">
          {(identities.data ?? []).map((identity) => (
            <li key={identity.workspaceId}>
              <span className="account-identity-where">
                <strong>{identity.workspaceName}</strong>
                <span>{roleLabel[identity.role]}</span>
              </span>
              <span className="account-identity-who">
                {identity.employeeName ?? "No record yet"}
                {identity.employeeCode ? (
                  <small>{identity.employeeCode}</small>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
