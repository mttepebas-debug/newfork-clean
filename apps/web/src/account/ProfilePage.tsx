import {
  emergencyIsOwnPhoneMessage,
  normalizeAccountPhone,
  sameUsPhone,
  toUsPhone,
  type EmploymentContactRecord,
  type OwnerLegalName,
} from "@newfork/shared";
import { Button, ConfirmButton } from "@newfork/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Camera, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { listOwnEmploymentRecords, supabaseClient } from "../lib/supabase";
import {
  requestPreferredName,
  saveOwnEmploymentContact,
} from "../employees/employee-data";
import { AccountPageHeader, unfinishedSetup } from "./components";
import {
  legalNameErrorMessage,
  onboardingUnfinished,
  ownedWorkspaces,
  useAccountWorkspaces,
  useOwnLegalName,
  useSaveOwnLegalName,
} from "./legal-name-data";
import { useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { AvatarPicker } from "../avatar/AvatarPicker";
import { MemberAvatar } from "../avatar/MemberAvatar";
import { avatarErrorText, useOwnAvatar, useRemoveAvatar, useSaveAvatar } from "../avatar/avatar-data";
import { RequestError } from "../lib/request-error";
import { FieldNote, fieldNoteId } from "../shell/FieldNote";
import { LinesOutline, LoadError, RefreshError } from "../shell/LoadState";
import { UsPhoneInput } from "../shell/UsPhoneInput";
import { breaksLetterRule, LetterRuleNote, letterRuleProps } from "../shell/us-text";
import { useListPhoneWidth } from "../lib/usePhoneWidth";

/**
 * What the page's one Save needs from each legal name form. The legal name is
 * written per owned workspace and the rest of the profile to the account, so
 * the forms keep their own draft and report it up instead of saving alone.
 */
type LegalNameHandle = {
  readonly dirty: boolean;
  /** First and last name are both there; the middle name may stay empty. */
  readonly filled: boolean;
  /** No part breaks the US letter rule (BL-503). */
  readonly lettersOk: boolean;
  readonly save: () => Promise<void>;
  readonly reset: () => void;
};
type RegisterLegalName = (
  workspaceId: string,
  handle: LegalNameHandle | null,
) => void;

type Contact = {
  readonly name: string;
  readonly relationship: string;
  readonly phone: string;
};

/** "a", "a and b", "a, b and c". */
const preferredNameHelp = "Shown everywhere except documents. A manager approves it.";

function listWords(words: readonly string[]): string {
  return words.length < 2
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function workspaceNames(records: readonly EmploymentContactRecord[]): string {
  return listWords(records.map((record) => record.workspaceName));
}

/** The same contact is kept on every workspace record; the first filled one leads. */
function leadingContact(records: readonly EmploymentContactRecord[]): Contact {
  const lead = records.find((record) => record.emergencyContactName) ?? records[0];
  return {
    name: lead?.emergencyContactName ?? "",
    relationship: lead?.emergencyContactRelationship ?? "",
    phone: lead?.emergencyContactPhone ?? "",
  };
}

/**
 * Did the core refuse for good? Access ended there, access taken away while
 * the form was open (no longer a member, a 404), or the workspace is closed.
 * Trying again changes none of them.
 */
function accessEnded(cause: unknown): boolean {
  return (
    cause instanceof RequestError &&
    (cause.reason === "authz.not_active" ||
      cause.reason === "authz.not_member" ||
      cause.reason === "authz.workspace_closed")
  );
}

export default function ProfilePage() {
  const { account, context, updateAccount } = useAuth();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const workspaces = useAccountWorkspaces();
  const records = useQuery({
    queryKey: ["account-employment-records"],
    queryFn: () =>
      supabaseClient ? listOwnEmploymentRecords(supabaseClient) : [],
  });
  const [preferredDraft, setPreferredDraft] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState<Contact | null>(null);
  // Workspaces that already took the preferred name being typed. A request a
  // manager still has to approve leaves the record as it was, so the record
  // alone cannot say it was sent.
  const [preferredSent, setPreferredSent] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const legalForms = useRef(new Map<string, LegalNameHandle>());
  const [legalState, setLegalState] = useState<
    Record<
      string,
      { readonly dirty: boolean; readonly filled: boolean; readonly lettersOk: boolean }
    >
  >({});
  const registerLegalName = useCallback<RegisterLegalName>(
    (workspaceId, handle) => {
      if (handle) legalForms.current.set(workspaceId, handle);
      else legalForms.current.delete(workspaceId);
      setLegalState((current) => {
        const before = current[workspaceId];
        if (
          handle &&
          before?.dirty === handle.dirty &&
          before.filled === handle.filled &&
          before.lettersOk === handle.lettersOk
        )
          return current;
        if (!handle && !before) return current;
        const next = { ...current };
        if (handle)
          next[workspaceId] = {
            dirty: handle.dirty,
            filled: handle.filled,
            lettersOk: handle.lettersOk,
          };
        else delete next[workspaceId];
        return next;
      });
    },
    [],
  );

  // A workspace whose person has not finished onboarding has no private record
  // yet, so the database would refuse a contact on it. A workspace its owner is
  // still setting up keeps its employee routes shut, so it would be refused too.
  const recordList = records.data ?? [];
  const unfinishedRecords = recordList.filter((record) =>
    onboardingUnfinished(workspaces.data, record.workspaceId),
  );
  const setupRecords = recordList.filter((record) => {
    const workspace = workspaces.data?.find(
      (item) => item.id === record.workspaceId,
    );
    return workspace ? unfinishedSetup(workspace) : false;
  });
  const contactRecords = recordList.filter(
    (record) =>
      !unfinishedRecords.includes(record) && !setupRecords.includes(record),
  );
  const hasContactForm = contactRecords.length > 0;
  // The name a person goes by: what a workspace already holds for them, else
  // the name the account was made with.
  const preferredOnFile =
    contactRecords.find((record) => record.preferredName)?.preferredName ??
    account?.displayName ??
    "";
  const preferred = preferredDraft ?? preferredOnFile;
  const contactOnFile = leadingContact(contactRecords);
  const contact = contactDraft ?? contactOnFile;

  const legalDirty = Object.values(legalState).some((form) => form.dirty);
  const legalFilled = Object.values(legalState).every((form) => form.filled);
  // Each workspace is compared on its own, so one that refused the last Save
  // keeps Save open and is the only one sent again.
  const preferredBehind =
    preferredDraft === null
      ? []
      : contactRecords.filter(
          (record) =>
            record.preferredName !== preferred.trim() &&
            !preferredSent.has(record.workspaceId),
        );
  const preferredDirty =
    preferredDraft !== null &&
    (preferred !== preferredOnFile || preferredBehind.length > 0);
  const contactBehind =
    contactDraft === null
      ? []
      : contactRecords.filter(
          (record) =>
            record.emergencyContactName !== contact.name ||
            record.emergencyContactRelationship !== contact.relationship ||
            record.emergencyContactPhone !== (toUsPhone(contact.phone) ?? contact.phone),
        );
  const contactDirty = contactBehind.length > 0;
  const formDirty = dirty || legalDirty || preferredDirty || contactDirty;
  // Only the preferred name and the middle name may stay empty.
  // What is still missing, by the labels on screen; Save waits for all of it.
  const missing = [
    legalFilled ? null : "legal name",
    toUsPhone(phone) ? null : "phone number",
    hasContactForm && contact.name.trim() === "" ? "contact name" : null,
    hasContactForm && contact.relationship.trim() === "" ? "relationship" : null,
    hasContactForm && !toUsPhone(contact.phone) ? "contact phone" : null,
  ].filter((part): part is string => part !== null);
  // A field that breaks the US letter rule says so under itself.
  const lettersOk =
    Object.values(legalState).every((form) => form.lettersOk) &&
    !breaksLetterRule(preferred) &&
    !(hasContactForm && breaksLetterRule(contact.name, contact.relationship));
  // TEL-2 (Mert, 2026-10-09): the emergency contact is somebody else.
  const contactIsOwn = hasContactForm && sameUsPhone(phone, contact.phone);
  // The avatar is saved in its own window (AVATAR-IKON), so Save here waits for every field.
  const canSave = missing.length === 0 && lettersOk && !contactIsOwn;

  useEffect(() => {
    if (!account || dirty) return;
    setPhone(account.phone ?? "");
  }, [account, dirty]);

  const navigationDialog = useAvailabilityNavigationGuard({
    dirty: formDirty, busy: saving, onDiscard: () => discard(),
    labels: { saving: "Saving profile", discard: "Discard profile changes?", saved: "Profile saved",
      unsaved: "Your unsaved profile changes will be lost." },
  });

  if (!account) return null;

  const markDirty = () => {
    setDirty(true);
    setSaved(null);
  };

  const discard = () => {
    setPreferredDraft(null);
    setPreferredSent(new Set());
    setContactDraft(null);
    setPhone(account.phone ?? "");
    for (const form of legalForms.current.values()) form.reset();
    setDirty(false);
    setSaved(null);
    setError(null);
  };

  /** Saves the account part; returns what went wrong, or null. */
  const saveProfile = async (): Promise<string | null> => {
    try {
      // Emptying the preferred name leaves the account's own name as it is.
      await updateAccount(
        preferred.trim() || account.displayName,
        account.theme,
        normalizeAccountPhone(phone),
      );
      setDirty(false);
      return null;
    } catch (saveError: unknown) {
      return saveError instanceof Error ? saveError.message : "Profile could not be saved";
    }
  };

  /**
   * Sends the preferred name to each workspace that does not have it yet.
   * Says how many hold it for a manager's answer and which ones refused,
   * keeping apart the ones where trying again changes nothing (BL-471).
   */
  const savePreferredName = async () => {
    let waiting = 0;
    const sent: string[] = [];
    const refused: EmploymentContactRecord[] = [];
    const ended: EmploymentContactRecord[] = [];
    for (const record of preferredBehind) {
      try {
        const outcome = await requestPreferredName(
          record.workspaceId,
          record.employeeId,
          preferred.trim(),
        );
        if (outcome === "waiting") waiting += 1;
        sent.push(record.workspaceId);
      } catch (cause: unknown) {
        (accessEnded(cause) ? ended : refused).push(record);
      }
    }
    return { waiting, sent, refused, ended };
  };

  /**
   * Writes the contact to each workspace that differs; returns the ones that
   * refused, apart from the ones where trying again changes nothing: access
   * ended there or the workspace is closed (the core's reason, BL-444).
   */
  const saveContact = async (): Promise<{
    refused: EmploymentContactRecord[];
    ended: EmploymentContactRecord[];
  }> => {
    const refused: EmploymentContactRecord[] = [];
    const ended: EmploymentContactRecord[] = [];
    for (const record of contactBehind) {
      try {
        // personalPhone left out: the number a workspace has on file stays.
        await saveOwnEmploymentContact(record.workspaceId, record.employeeId, {
          name: contact.name,
          relationship: contact.relationship,
          phone: toUsPhone(contact.phone) ?? contact.phone,
          email: record.emergencyContactEmail,
        });
      } catch (cause: unknown) {
        (accessEnded(cause) ? ended : refused).push(record);
      }
    }
    return { refused, ended };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(null);
    setError(null);
    const failures: string[] = [];
    let waiting = 0;
    // Said after the rest, whichever went first; and never in the way of it.
    const contactFailures: string[] = [];
    const contactStep = async () => {
      const failures = contactFailures;
      const { refused, ended } = await saveContact();
      if (refused.length === 0 && ended.length === 0) setContactDraft(null);
      if (refused.length > 0)
        failures.push(
          `Your emergency contact could not be saved in ${workspaceNames(refused)}. Try again.`,
        );
      if (ended.length > 0)
        failures.push(
          `Your emergency contact can no longer be changed in ${workspaceNames(ended)}: your access there has ended or the workspace is closed.`,
        );
    };
    // A record refuses an emergency number equal to its own at every step
    // (TEL-2): the contact moves first, unless it takes the account's old number.
    const contactFirst = !sameUsPhone(contact.phone, account.phone);
    if (contactDirty && contactFirst) await contactStep();
    if (dirty || preferredDirty) {
      const failure = await saveProfile();
      if (failure) failures.push(failure);
    }
    for (const form of legalForms.current.values()) {
      if (!form.dirty) continue;
      try {
        await form.save();
      } catch (legalError: unknown) {
        failures.push(legalNameErrorMessage(legalError));
      }
    }
    if (preferredDirty && failures.length === 0) {
      const outcome = await savePreferredName();
      waiting = outcome.waiting;
      if (outcome.refused.length === 0 && outcome.ended.length === 0) {
        setPreferredDraft(null);
        setPreferredSent(new Set());
      } else {
        // The draft stays, so Save stays open for the ones that refused.
        setPreferredSent((current) => new Set([...current, ...outcome.sent]));
        if (outcome.refused.length > 0)
          failures.push(
            `Your preferred name could not be sent to ${workspaceNames(outcome.refused)}. Try again.`,
          );
        if (outcome.ended.length > 0)
          failures.push(
            `Your preferred name can no longer be changed in ${workspaceNames(outcome.ended)}: your access there has ended or the workspace is closed.`,
          );
      }
    }
    if (contactDirty && !contactFirst) await contactStep();
    failures.push(...contactFailures);
    if (contactDirty || preferredDirty)
      await cache.invalidateQueries({ queryKey: ["account-employment-records"] });
    if (failures.length > 0) setError(failures.join(" "));
    else
      setSaved(
        waiting > 0
          ? "Profile saved. A manager needs to approve your preferred name."
          : "Profile saved",
      );
    setSaving(false);
  };

  const editContact = (part: keyof Contact, value: string) => {
    setSaved(null);
    setContactDraft({ ...contact, [part]: value });
  };

  return (
    <section className="account-page" aria-labelledby="profile-title">
      {navigationDialog}
      <AccountPageHeader
        title="Profile"
        titleId="profile-title"
        description="Your name, avatar and phone, and who to call in an emergency."
      />
      <form className="account-profile-form" aria-label="Profile" noValidate onSubmit={submit}>
        <div className="account-profile-head">
          {context ? (
            <ProfileAvatar
              workspaceId={context.workspace.id}
              workspaceName={context.workspace.name}
              name={account.displayName}
              email={account.email}
            />
          ) : (
            <ProfileIdentity name={account.displayName} email={account.email} />
          )}
        </div>

        <OwnerLegalNames register={registerLegalName} onEdit={() => setSaved(null)} />

        <div className="account-field-grid account-profile-grid">
          <label className="account-field" htmlFor="account-preferred-name">
            <span>
              Preferred name<span className="field-optional">optional</span>
            </span>
            <input
              id="account-preferred-name"
              aria-label="Preferred name"
              value={preferred}
              maxLength={80}
              onChange={(event) => {
                setPreferredDraft(event.target.value);
                // A new name goes to every workspace again.
                setPreferredSent(new Set());
                setSaved(null);
              }}
              {...letterRuleProps(preferred, "account-preferred-name", null, preferredNameHelp)}
            />
            {/* One line under the field: the rule while it is broken, else the help. */}
            <LetterRuleNote value={preferred} id="account-preferred-name" help={preferredNameHelp} />
          </label>
          <label className="account-field account-field-span-2" htmlFor="account-phone-number">
            <span>Phone number</span>
            <UsPhoneInput
              id="account-phone-number"
              aria-label="Phone number"
              value={phone}
              onChange={(next) => {
                setPhone(next);
                markDirty();
              }}
              required
            />
          </label>
        </div>

        {hasContactForm ||
        unfinishedRecords.length > 0 ||
        setupRecords.length > 0 ? (
          <fieldset className="account-fieldset account-fieldset-divided">
            <legend>Emergency contact</legend>
            {hasContactForm ? (
              <div className="account-field-grid account-contact-grid">
                <label className="account-field" htmlFor="account-contact-name">
                  <span>Contact name</span>
                  <input
                    id="account-contact-name"
                    aria-label="Contact name"
                    value={contact.name}
                    maxLength={120}
                    onChange={(event) => editContact("name", event.target.value)}
                    placeholder="Morgan Reyes"
                    required
                    {...letterRuleProps(contact.name, "account-contact-name")}
                  />
                  <LetterRuleNote value={contact.name} id="account-contact-name" />
                </label>
                <label className="account-field" htmlFor="account-contact-relationship">
                  <span>Relationship</span>
                  <input
                    id="account-contact-relationship"
                    aria-label="Relationship"
                    value={contact.relationship}
                    maxLength={80}
                    onChange={(event) => editContact("relationship", event.target.value)}
                    placeholder="Spouse"
                    required
                    {...letterRuleProps(contact.relationship, "account-contact-relationship")}
                  />
                  <LetterRuleNote value={contact.relationship} id="account-contact-relationship" />
                </label>
                <label className="account-field" htmlFor="account-contact-phone">
                  <span>Contact phone</span>
                  <UsPhoneInput
                    id="account-contact-phone"
                    aria-label="Contact phone"
                    value={contact.phone}
                    onChange={(next) => editContact("phone", next)}
                    required
                    aria-invalid={contactIsOwn ? true : undefined}
                    aria-describedby={fieldNoteId(
                      "account-contact-phone",
                      contactIsOwn ? emergencyIsOwnPhoneMessage : null,
                    )}
                  />
                  <FieldNote
                    id="account-contact-phone"
                    error={contactIsOwn ? emergencyIsOwnPhoneMessage : null}
                  />
                </label>
              </div>
            ) : null}
            {setupRecords.map((record) => (
              <div key={record.workspaceId} className="account-employment-record">
                <strong>{record.workspaceName}</strong>
                <p className="account-record-note">
                  Finish setting up this workspace, then you can add your
                  emergency contact. Continue it in{" "}
                  <Link to="/account/workspaces">Account › Workspaces</Link>.
                </p>
              </div>
            ))}
            {unfinishedRecords.map((record) => (
              <div key={record.workspaceId} className="account-employment-record">
                <strong>{record.workspaceName}</strong>
                <p className="account-record-note">
                  Finish setting up your account here, then you can add your
                  emergency contact.
                </p>
                <div className="account-button-row">
                  <Button
                    type="button"
                    aria-label={`Continue setup for ${record.workspaceName}`}
                    onClick={() => navigate(`/welcome/${record.workspaceId}`)}
                  >
                    Continue setup
                  </Button>
                </div>
              </div>
            ))}
          </fieldset>
        ) : null}

        {/* The form's own error above Save, said whole (UI-FIELDMSG-2). */}
        <FieldNote id="profile-form" error={error} />
        {saved ? <p className="form-success" role="status">{saved}</p> : null}
        {/* Why Save is off: the missing fields, by name. */}
        {missing.length > 0 ? (
          <p className="account-form-missing" id="profile-missing">
            To save, fill in {listWords(missing)}.
          </p>
        ) : null}
        <div className="account-form-actions">
          {formDirty ? (
            <Button type="button" className="secondary-button" disabled={saving} onClick={() => void discard()}>
              Discard
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={!formDirty || saving || !canSave}
            aria-describedby={missing.length > 0 ? "profile-missing" : undefined}
          >
            {saving ? "Saving" : "Save"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Who this is, without an avatar: outside a workspace there is no avatar to show or change. */
function ProfileIdentity({ name, email, children }: { readonly name: string; readonly email: string; readonly children?: ReactNode }) {
  return (
    <div className="account-profile-identity">
      <strong>{name}</strong>
      <span>{email}</span>
      {children}
    </div>
  );
}

/**
 * AVATAR-IKON (design 4.3): the person's avatar in the workspace they are in (the one "Back to
 * workspace" returns to), changed in its own window and saved there, apart from the page's Save.
 */
function ProfileAvatar({
  workspaceId,
  workspaceName,
  name,
  email,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly name: string;
  readonly email: string;
}) {
  const phone = useListPhoneWidth();
  const own = useOwnAvatar(workspaceId);
  const save = useSaveAvatar(workspaceId);
  const remove = useRemoveAvatar(workspaceId);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = useRef<HTMLDivElement>(null);
  const avatar = own.data?.avatar ?? null;
  // A read that failed with nothing read before: whether there is an avatar is not known, so
  // nothing is offered as if there were none. A later refresh that fails keeps what was read.
  const unknown = own.isError && own.data === undefined;
  const waiting = own.isPending || remove.isPending;
  const choose = () => {
    setError(null);
    // The window gives focus back to what had it: the named button, never the hidden circle.
    actions.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    setPicking(true);
  };
  return (
    <>
      {/* The circle opens the window too, for a pointer; the named button is the one to tab to. */}
      <button
        type="button"
        className="account-avatar-button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={waiting || unknown}
        onClick={choose}
      >
        <MemberAvatar avatar={avatar} name={name} size={phone ? 80 : 104} className="account-profile-avatar" />
        <span className="account-avatar-camera">
          <Camera size={15} />
        </span>
      </button>
      <ProfileIdentity name={name} email={email}>
        {unknown ? (
          <p className="account-avatar-unread" role="status">
            Your avatar couldn't be loaded. Try again in a moment.
          </p>
        ) : (
          <div ref={actions} className="account-photo-actions">
            <Button type="button" disabled={waiting} onClick={choose}>
              {avatar ? "Change avatar" : "Add avatar"}
            </Button>
            {avatar ? (
            <ConfirmButton
              className="danger-button"
              confirmLabel="Confirm remove"
              disabled={waiting}
              onConfirm={() => {
                setError(null);
                remove.mutateAsync().catch((failure: unknown) => setError(avatarErrorText(failure)));
              }}
            >
              <Trash2 size={15} aria-hidden /> Remove
            </ConfirmButton>
            ) : null}
          </div>
        )}
        <FieldNote id="profile-avatar" error={error} />
        <small className="account-avatar-note">
          Your avatar in {workspaceName}. Other workspaces keep their own. Lineups show an avatar, never a photo.
        </small>
      </ProfileIdentity>
      {createPortal(
        <AvatarPicker
          open={picking}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          personName={name}
          initial={avatar}
          suggested={own.data?.suggested ?? []}
          onSave={async (choice) => {
            await save.mutateAsync(choice);
          }}
          onRemove={
            avatar
              ? async () => {
                  await remove.mutateAsync();
                }
              : undefined
          }
          onClose={() => setPicking(false)}
        />,
        document.body,
      )}
    </>
  );
}

/**
 * The owner's legal name: the name on their ID, which documents and
 * signatures read. Given at the first step of setup; changed here, and each
 * change goes to the audit log. Shown only where this account is the owner.
 */
function OwnerLegalNames({
  register,
  onEdit,
}: {
  readonly register: RegisterLegalName;
  readonly onEdit: () => void;
}) {
  const workspaces = useAccountWorkspaces();
  const owned = ownedWorkspaces(workspaces.data);
  if (owned.length === 0) return null;

  return (
    <fieldset className="account-fieldset">
      <legend>Legal name</legend>
      <p className="account-fieldset-hint">
        As it appears on your ID. Documents and signatures use it; every change
        is recorded.
      </p>
      {owned.map((workspace) => (
        <OwnerLegalNameBlock
          key={workspace.id}
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          showName={owned.length > 1}
          register={register}
          onEdit={onEdit}
        />
      ))}
    </fieldset>
  );
}

function OwnerLegalNameBlock({
  workspaceId,
  workspaceName,
  showName,
  register,
  onEdit,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly showName: boolean;
  readonly register: RegisterLegalName;
  readonly onEdit: () => void;
}) {
  const legalName = useOwnLegalName(workspaceId);
  // Kept above the fields, which start over when the saved name comes back.
  const save = useSaveOwnLegalName(workspaceId);
  if (legalName.isPending)
    return <LinesOutline label="Loading your legal name" lines={3} />;
  // A failed read is not a failed save: the save wording would send the owner
  // looking for a change they never made.
  if (legalName.isError && legalName.data === undefined)
    return (
      <LoadError
        inset
        title={showName ? `We couldn't load your legal name for ${workspaceName}` : "We couldn't load your legal name"}
        detail="Your legal name didn't load. Nothing was changed."
        retrying={legalName.isFetching}
        onRetry={() => void legalName.refetch()}
      />
    );
  return (
    <>
    {legalName.isError ? (
      <RefreshError
        message="Your legal name didn't refresh. This is the last one that loaded."
        retrying={legalName.isFetching}
        onRetry={() => void legalName.refetch()}
      />
    ) : null}
    <OwnerLegalNameFields
      // A saved name comes back from the server and starts a clean draft.
      key={JSON.stringify(legalName.data)}
      workspaceId={workspaceId}
      workspaceName={showName ? workspaceName : null}
      initial={legalName.data ?? { firstName: "", middleName: "", lastName: "" }}
      saveName={save.mutateAsync}
      register={register}
      onEdit={onEdit}
    />
    </>
  );
}

function OwnerLegalNameFields({
  workspaceId,
  workspaceName,
  initial,
  saveName,
  register,
  onEdit,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string | null;
  readonly initial: OwnerLegalName;
  readonly saveName: (name: OwnerLegalName) => Promise<void>;
  readonly register: RegisterLegalName;
  readonly onEdit: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const dirty =
    draft.firstName !== initial.firstName ||
    draft.middleName !== initial.middleName ||
    draft.lastName !== initial.lastName;
  const filled = draft.firstName.trim() !== "" && draft.lastName.trim() !== "";
  const lettersOk = !breaksLetterRule(draft.firstName, draft.middleName, draft.lastName);

  useEffect(() => {
    register(workspaceId, {
      dirty,
      filled,
      lettersOk,
      save: () =>
        saveName({
          firstName: draft.firstName.trim(),
          middleName: draft.middleName.trim(),
          lastName: draft.lastName.trim(),
        }),
      reset: () => setDraft(initial),
    });
  }, [dirty, draft, initial, filled, lettersOk, register, saveName, workspaceId]);
  useEffect(() => () => register(workspaceId, null), [register, workspaceId]);

  const field = (suffix: string) => `legal-name-${workspaceId}-${suffix}`;
  const input = (part: keyof OwnerLegalName, label: string, suffix: string) => (
    <label className="account-field" htmlFor={field(suffix)}>
      <span>
        {label}
        {part === "middleName" ? (
          <span className="field-optional">optional</span>
        ) : null}
      </span>
      <input
        id={field(suffix)}
        aria-label={`Legal ${label.toLowerCase()}`}
        value={draft[part]}
        maxLength={80}
        required={part !== "middleName"}
        onChange={(event) => {
          onEdit();
          setDraft({ ...draft, [part]: event.target.value });
        }}
        {...letterRuleProps(draft[part], field(suffix))}
      />
      <LetterRuleNote value={draft[part]} id={field(suffix)} />
    </label>
  );

  return (
    <div className="account-legal-name">
      {workspaceName ? <strong>{workspaceName}</strong> : null}
      <div className="account-field-grid account-legal-name-grid">
        {input("firstName", "First name", "first")}
        {input("middleName", "Middle name", "middle")}
        {input("lastName", "Last name", "last")}
      </div>
    </div>
  );
}
