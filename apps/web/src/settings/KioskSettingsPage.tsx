import type {
  KioskEnrollment,
  KioskManagedDevice,
  Permission,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Clipboard,
  KeyRound,
  MonitorSmartphone,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  createKioskEnrollment,
  createKioskReenrollment,
  getKioskManagement,
  resetEmployeeKioskPin,
  revokeKioskDevice,
  updateKioskDeviceLabel,
} from "./kiosk-management-data";

type View = "devices" | "pins" | "activity";

export default function KioskSettingsPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const permissions = new Set<Permission>(context?.permissions ?? []);
  const queryKey = ["kiosk-management", workspaceId];
  const management = useQuery({
    queryKey,
    queryFn: () => getKioskManagement(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [view, setView] = useState<View>("devices");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollment, setEnrollment] = useState<KioskEnrollment | null>(null);
  const [locationId, setLocationId] = useState("");
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<KioskManagedDevice | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [confirming, setConfirming] = useState<{
    device: KioskManagedDevice;
    action: "revoke" | "replace";
  } | null>(null);
  const [pinLocationId, setPinLocationId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const cancelConfirmationRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirming) return;
    const trigger = document.activeElement as HTMLElement | null;
    cancelConfirmationRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirming(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      trigger?.focus();
    };
  }, [confirming]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };
  const createMutation = useMutation({
    mutationFn: () =>
      createKioskEnrollment(workspaceId, {
        location_id: locationId,
        label,
      }),
    onSuccess: (result) => {
      setEnrollment(result);
      setEnrolling(false);
      setOperationError(null);
    },
    onError: (error) => setOperationError(errorText(error)),
  });
  const labelMutation = useMutation({
    mutationFn: () =>
      updateKioskDeviceLabel(workspaceId, editing?.id ?? "", {
        label: editingLabel,
      }),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
      setNotice("Device name saved.");
      setOperationError(null);
    },
    onError: (error) => setOperationError(errorText(error)),
  });
  const revokeMutation = useMutation({
    mutationFn: (deviceId: string) => revokeKioskDevice(workspaceId, deviceId),
    onSuccess: async () => {
      await refresh();
      setConfirming(null);
      setNotice("Device revoked.");
    },
    onError: (error) => setOperationError(errorText(error)),
  });
  const replaceMutation = useMutation({
    mutationFn: (deviceId: string) =>
      createKioskReenrollment(workspaceId, deviceId),
    onSuccess: async (result) => {
      await refresh();
      setConfirming(null);
      setEnrollment(result);
      setNotice(null);
    },
    onError: (error) => setOperationError(errorText(error)),
  });
  const pinMutation = useMutation({
    mutationFn: () =>
      resetEmployeeKioskPin(workspaceId, employeeId, pinLocationId, pin),
    onSuccess: async () => {
      await refresh();
      setPin("");
      setPinConfirm("");
      setNotice("Employee kiosk PIN reset.");
      setOperationError(null);
    },
    onError: (error) => setOperationError(errorText(error)),
  });

  const pinEmployees = useMemo(
    () =>
      (management.data?.employees ?? []).filter(
        (employee) =>
          !pinLocationId || employee.location_ids.includes(pinLocationId),
      ),
    [management.data?.employees, pinLocationId],
  );
  if (!context) return null;

  const canEnroll = permissions.has("kiosk.device.enroll.location");
  const canRevoke = permissions.has("kiosk.device.revoke.location");
  const canResetPin = permissions.has("kiosk.pin.reset.location");
  const canReadAudit = permissions.has("kiosk.audit.read.location");
  const activeCount =
    management.data?.devices.filter((device) => device.status === "active")
      .length ?? 0;

  const beginEnrollment = () => {
    const firstLocation = management.data?.locations.find(
      (location) => location.can_enroll,
    );
    setLocationId(firstLocation?.id ?? "");
    setLabel("");
    setEnrolling(true);
    setEnrollment(null);
    setOperationError(null);
  };

  return (
    <section className="settings-page" aria-labelledby="kiosk-settings-title">
      <SettingsHeader
        icon={<MonitorSmartphone size={21} aria-hidden />}
        title="Kiosk"
        description="Shared time-clock devices, employee PIN access, and operational security history."
        action={
          canEnroll ? (
            <Button type="button" onClick={beginEnrollment}>
              <Plus size={16} aria-hidden /> Enroll device
            </Button>
          ) : undefined
        }
      />

      <div className="kiosk-management-summary" aria-label="Kiosk summary">
        <div>
          <strong>{activeCount}</strong>
          <span>Active devices</span>
        </div>
        <div>
          <strong>{management.data?.locations.length ?? 0}</strong>
          <span>Available locations</span>
        </div>
        <div>
          <strong>
            {management.data?.employees.filter(
              (employee) => employee.pin_configured,
            ).length ?? 0}
          </strong>
          <span>PINs configured</span>
        </div>
      </div>

      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Kiosk settings views"
      >
        <button
          role="tab"
          aria-selected={view === "devices"}
          onClick={() => setView("devices")}
        >
          <MonitorSmartphone aria-hidden />
          Devices
        </button>
        {canResetPin ? (
          <button
            role="tab"
            aria-selected={view === "pins"}
            onClick={() => setView("pins")}
          >
            <KeyRound aria-hidden />
            PIN access
          </button>
        ) : null}
        {canReadAudit ? (
          <button
            role="tab"
            aria-selected={view === "activity"}
            onClick={() => setView("activity")}
          >
            <Activity aria-hidden />
            Activity
          </button>
        ) : null}
      </div>

      {enrollment ? (
        <OneTimeCode
          enrollment={enrollment}
          onClose={() => setEnrollment(null)}
        />
      ) : null}
      {enrolling ? (
        <form
          className="entity-editor"
          aria-label="Enroll kiosk device"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="entity-editor-heading">
            <div>
              <strong>New shared device</strong>
              <span>The code expires after 10 minutes.</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close device enrollment"
              onClick={() => setEnrolling(false)}
            >
              <X aria-hidden />
            </button>
          </div>
          <div className="kiosk-manager-fields">
            <label className="form-field">
              <span>Location</span>
              <select
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                required
              >
                {management.data?.locations
                  .filter((location) => location.can_enroll)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field">
              <span>Device name</span>
              <input
                value={label}
                maxLength={80}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Front counter tablet"
                required
              />
            </label>
          </div>
          <div className="entity-editor-actions">
            <Button
              type="button"
              className="secondary-button"
              onClick={() => setEnrolling(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !locationId || !label.trim() || createMutation.isPending
              }
            >
              {createMutation.isPending ? "Creating" : "Create code"}
            </Button>
          </div>
        </form>
      ) : null}

      {notice ? (
        <p className="form-success" role="status">
          {notice}
        </p>
      ) : null}
      {operationError ? (
        <p className="form-error" role="alert">
          {operationError}
        </p>
      ) : null}
      {management.isLoading ? (
        <p className="settings-state">Loading kiosk controls...</p>
      ) : null}
      {management.error ? (
        <p className="settings-state error" role="alert">
          {errorText(management.error)}
        </p>
      ) : null}

      {view === "devices" && management.data ? (
        <DeviceList
          devices={management.data.devices}
          canEdit={canEnroll}
          canRevoke={canRevoke}
          editing={editing}
          editingLabel={editingLabel}
          saving={labelMutation.isPending}
          onEditingLabel={setEditingLabel}
          onEdit={(device) => {
            setEditing(device);
            setEditingLabel(device.label);
            setNotice(null);
          }}
          onCancelEdit={() => setEditing(null)}
          onSave={() => labelMutation.mutate()}
          onConfirm={(device, action) => {
            setConfirming({ device, action });
            setOperationError(null);
          }}
        />
      ) : null}
      {view === "pins" && management.data ? (
        <PinReset
          locations={management.data.locations.filter(
            (location) => location.can_reset_pin,
          )}
          employees={pinEmployees}
          locationId={pinLocationId}
          employeeId={employeeId}
          pin={pin}
          pinConfirm={pinConfirm}
          pending={pinMutation.isPending}
          onLocation={(value) => {
            setPinLocationId(value);
            setEmployeeId("");
          }}
          onEmployee={setEmployeeId}
          onPin={setPin}
          onPinConfirm={setPinConfirm}
          onSubmit={(event) => {
            event.preventDefault();
            if (pin === pinConfirm) pinMutation.mutate();
          }}
        />
      ) : null}
      {view === "activity" && management.data ? (
        <AuditList events={management.data.events} />
      ) : null}

      <section
        className="kiosk-deployment-boundary"
        aria-labelledby="deployment-boundary-title"
      >
        <ShieldCheck aria-hidden />
        <div>
          <h2 id="deployment-boundary-title">Deployment boundary</h2>
          <p>
            <strong>Browser mode</strong> provides the shared capture surface in
            an ordinary browser, but a user can leave the page.
          </p>
          <p>
            <strong>Managed-device mode</strong> is required for
            operating-system lockdown, remote administration, and enforced app
            allowlisting.
          </p>
        </div>
      </section>

      {confirming ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiosk-confirm-title"
          >
            <h2 id="kiosk-confirm-title">
              {confirming.action === "replace"
                ? "Replace device enrollment?"
                : "Revoke this device?"}
            </h2>
            <p>
              {confirming.action === "replace"
                ? "The current device stops immediately. A new one-time enrollment code will be created for the same location."
                : "The device and any open employee action stop immediately."}
            </p>
            <div className="confirm-dialog-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="nf-button secondary-button"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </button>
              <Button
                onClick={() =>
                  confirming.action === "replace"
                    ? replaceMutation.mutate(confirming.device.id)
                    : revokeMutation.mutate(confirming.device.id)
                }
                disabled={replaceMutation.isPending || revokeMutation.isPending}
              >
                {confirming.action === "replace" ? (
                  <RefreshCw aria-hidden />
                ) : (
                  <Trash2 aria-hidden />
                )}
                {confirming.action === "replace"
                  ? "Replace device"
                  : "Revoke device"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function OneTimeCode({
  enrollment,
  onClose,
}: {
  enrollment: KioskEnrollment;
  onClose(): void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <section
      className="kiosk-enrollment-result"
      aria-labelledby="enrollment-code-title"
    >
      <div>
        <span>One-time enrollment</span>
        <h2 id="enrollment-code-title">{enrollment.label}</h2>
        <code>{enrollment.code}</code>
        <time dateTime={enrollment.expires_at}>
          Expires{" "}
          {new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(enrollment.expires_at))}
        </time>
      </div>
      <div className="kiosk-code-actions">
        <button
          className="icon-button"
          aria-label="Copy enrollment code"
          title="Copy code"
          onClick={() =>
            void navigator.clipboard
              .writeText(enrollment.code)
              .then(() => setCopied(true))
          }
        >
          <Clipboard aria-hidden />
        </button>
        <button
          className="icon-button"
          aria-label="Close enrollment code"
          title="Close"
          onClick={onClose}
        >
          <X aria-hidden />
        </button>
      </div>
      {copied ? <p role="status">Code copied.</p> : null}
    </section>
  );
}

function DeviceList(props: {
  devices: KioskManagedDevice[];
  canEdit: boolean;
  canRevoke: boolean;
  editing: KioskManagedDevice | null;
  editingLabel: string;
  saving: boolean;
  onEditingLabel(value: string): void;
  onEdit(device: KioskManagedDevice): void;
  onCancelEdit(): void;
  onSave(): void;
  onConfirm(device: KioskManagedDevice, action: "revoke" | "replace"): void;
}) {
  if (props.devices.length === 0)
    return (
      <div className="settings-empty">
        <MonitorSmartphone aria-hidden />
        <strong>No kiosk devices</strong>
      </div>
    );
  return (
    <div className="kiosk-device-list">
      {props.devices.map((device) => (
        <div
          className="kiosk-device-row"
          key={device.id}
          data-status={device.status}
        >
          <span className="kiosk-device-icon">
            <MonitorSmartphone aria-hidden />
          </span>
          <div className="kiosk-device-details">
            {props.editing?.id === device.id ? (
              <div className="kiosk-label-editor">
                <label>
                  <span className="sr-only">Device name</span>
                  <input
                    value={props.editingLabel}
                    maxLength={80}
                    onChange={(event) =>
                      props.onEditingLabel(event.target.value)
                    }
                    autoFocus
                  />
                </label>
                <Button
                  onClick={props.onSave}
                  disabled={!props.editingLabel.trim() || props.saving}
                >
                  Save
                </Button>
                <button
                  className="icon-button"
                  aria-label="Cancel device name edit"
                  onClick={props.onCancelEdit}
                >
                  <X aria-hidden />
                </button>
              </div>
            ) : (
              <>
                <strong>{device.label}</strong>
                <span>{device.location_name}</span>
              </>
            )}
            <small>
              {device.last_seen_at
                ? `Last contact ${relativeTime(device.last_seen_at)}`
                : "No device contact yet"}
            </small>
          </div>
          <span className={`kiosk-status-badge ${device.status}`}>
            {device.status}
          </span>
          <div className="kiosk-device-actions">
            {props.canEdit ? (
              <button
                className="icon-button"
                aria-label={`Edit ${device.label}`}
                title="Edit name"
                onClick={() => props.onEdit(device)}
              >
                <Pencil aria-hidden />
              </button>
            ) : null}
            {device.status === "active" && props.canEdit && props.canRevoke ? (
              <button
                className="icon-button"
                aria-label={`Replace ${device.label}`}
                title="Replace enrollment"
                onClick={() => props.onConfirm(device, "replace")}
              >
                <RefreshCw aria-hidden />
              </button>
            ) : null}
            {device.status === "active" && props.canRevoke ? (
              <button
                className="icon-button danger"
                aria-label={`Revoke ${device.label}`}
                title="Revoke"
                onClick={() => props.onConfirm(device, "revoke")}
              >
                <Trash2 aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function PinReset(props: {
  locations: Array<{ id: string; name: string }>;
  employees: Array<{
    id: string;
    display_name: string;
    employee_code: string;
    pin_configured: boolean;
  }>;
  locationId: string;
  employeeId: string;
  pin: string;
  pinConfirm: string;
  pending: boolean;
  onLocation(value: string): void;
  onEmployee(value: string): void;
  onPin(value: string): void;
  onPinConfirm(value: string): void;
  onSubmit(event: FormEvent): void;
}) {
  const valid =
    /^\d{6}$/.test(props.pin) &&
    props.pin === props.pinConfirm &&
    Boolean(props.employeeId && props.locationId);
  return (
    <form className="kiosk-pin-management" onSubmit={props.onSubmit}>
      <div className="kiosk-manager-fields">
        <label className="form-field">
          <span>Location</span>
          <select
            value={props.locationId}
            onChange={(event) => props.onLocation(event.target.value)}
            required
          >
            <option value="">Select location</option>
            {props.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Employee</span>
          <select
            value={props.employeeId}
            onChange={(event) => props.onEmployee(event.target.value)}
            disabled={!props.locationId}
            required
          >
            <option value="">Select employee</option>
            {props.employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.display_name} · {employee.employee_code}
                {employee.pin_configured ? " · PIN set" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>New 6-digit PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={props.pin}
            onChange={(event) =>
              props.onPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
        </label>
        <label className="form-field">
          <span>Confirm PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={props.pinConfirm}
            onChange={(event) =>
              props.onPinConfirm(
                event.target.value.replace(/\D/g, "").slice(0, 6),
              )
            }
          />
        </label>
      </div>
      {props.pin && props.pinConfirm && props.pin !== props.pinConfirm ? (
        <p className="form-error" role="alert">
          PINs must match.
        </p>
      ) : null}
      <div className="entity-editor-actions">
        <Button type="submit" disabled={!valid || props.pending}>
          <KeyRound aria-hidden />
          {props.pending ? "Resetting" : "Reset PIN"}
        </Button>
      </div>
    </form>
  );
}

function AuditList({
  events,
}: {
  events: Array<{
    id: string;
    action: string;
    occurred_at: string;
    location_name: string | null;
    device_label: string | null;
    employee_name: string | null;
    actor_name: string | null;
  }>;
}) {
  if (events.length === 0)
    return (
      <div className="settings-empty">
        <Activity aria-hidden />
        <strong>No kiosk activity</strong>
      </div>
    );
  return (
    <div className="kiosk-audit-list">
      {events.map((event) => (
        <div className="kiosk-audit-row" key={event.id}>
          <span className="kiosk-audit-marker" aria-hidden />
          <div>
            <strong>{auditLabel(event.action)}</strong>
            <span>
              {[event.device_label, event.employee_name, event.location_name]
                .filter(Boolean)
                .join(" · ") || "Workspace kiosk"}
            </span>
          </div>
          <div>
            <time dateTime={event.occurred_at}>
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(event.occurred_at))}
            </time>
            <small>{event.actor_name ?? "Device action"}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function auditLabel(action: string) {
  return action
    .replace(/^kiosk\./, "")
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function relativeTime(value: string) {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(value)) / 60_000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
