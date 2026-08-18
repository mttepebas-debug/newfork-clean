import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Clock3,
  Coffee,
  LogIn,
  LogOut,
  Search,
  ShieldCheck,
  Unplug,
  Wifi,
  WifiOff,
} from "lucide-react";
import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import type { KioskActionType, KioskEmployee } from "@newfork/shared";
import {
  cancelKioskAction,
  captureKioskAction,
  exchangeKioskEnrollment,
  getKioskActionState,
  getKioskDirectory,
  KioskRequestError,
  verifyKioskPin,
} from "./kiosk-data";

const actionLabels: Record<KioskActionType, string> = {
  clock_in: "Clock in",
  break_start: "Start break",
  break_end: "End break",
  clock_out: "Clock out",
  end_break_and_clock_out: "End break & clock out",
};

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

export default function KioskPage() {
  const queryClient = useQueryClient();
  const online = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    () => true,
  );
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<KioskEmployee | null>(null);
  const [pin, setPin] = useState("");
  const [actionReady, setActionReady] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    label: string;
    receivedAt: string;
  } | null>(null);

  const directory = useQuery({
    queryKey: ["kiosk", "directory"],
    queryFn: getKioskDirectory,
    retry: false,
  });
  const actionState = useQuery({
    queryKey: ["kiosk", "action", selected?.id],
    queryFn: getKioskActionState,
    enabled: actionReady && online,
    retry: false,
  });
  const enrollment = useMutation({
    mutationFn: exchangeKioskEnrollment,
    onSuccess: async () => {
      setEnrollmentCode("");
      await queryClient.invalidateQueries({ queryKey: ["kiosk", "directory"] });
    },
  });
  const verification = useMutation({
    mutationFn: ({
      employeeId,
      value,
    }: {
      employeeId: string;
      value: string;
    }) => verifyKioskPin(employeeId, value),
    onSuccess: () => {
      setPin("");
      setActionReady(true);
    },
  });
  const capture = useMutation({
    mutationFn: (action: KioskActionType) =>
      captureKioskAction({
        action,
        expected_revision: actionState.data?.expected_revision ?? 0,
        occurred_at: new Date().toISOString(),
        idempotency_key: crypto.randomUUID(),
      }),
    onSuccess: (result, action) => {
      if (result.status === "accepted")
        setConfirmation({
          label: actionLabels[action],
          receivedAt:
            result.events.at(-1)?.received_at ?? result.session.last_event_at,
        });
    },
  });

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(() => {
      setSelected(null);
      setPin("");
      setActionReady(false);
      setConfirmation(null);
      queryClient.removeQueries({ queryKey: ["kiosk", "action"] });
    }, 4_000);
    return () => window.clearTimeout(timeout);
  }, [confirmation, queryClient]);

  const reset = async () => {
    if (actionReady) await cancelKioskAction().catch(() => undefined);
    setSelected(null);
    setPin("");
    setActionReady(false);
    setConfirmation(null);
    verification.reset();
    capture.reset();
    queryClient.removeQueries({ queryKey: ["kiosk", "action"] });
  };

  if (directory.isLoading) return <KioskLoading />;
  if (
    directory.error instanceof KioskRequestError &&
    directory.error.status === 401
  )
    return (
      <EnrollmentScreen
        code={enrollmentCode}
        online={online}
        pending={enrollment.isPending}
        error={enrollment.error?.message}
        onCode={setEnrollmentCode}
        onSubmit={() => enrollment.mutate(enrollmentCode)}
      />
    );
  if (directory.isError || !directory.data)
    return (
      <KioskUnavailable online={online} retry={() => directory.refetch()} />
    );

  const employees = directory.data.employees.filter((employee) =>
    employee.display_name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <main className="kiosk-page">
      <header className="kiosk-header">
        <div>
          <span className="kiosk-brand">Newfork</span>
          <h1>Time Clock</h1>
        </div>
        <div className="kiosk-device-meta">
          <strong>{directory.data.device.location.name}</strong>
          <span>{directory.data.device.label}</span>
          <span className={online ? "is-online" : "is-offline"}>
            {online ? <Wifi aria-hidden /> : <WifiOff aria-hidden />}
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </header>

      {!online ? (
        <KioskUnavailable online={false} retry={() => directory.refetch()} />
      ) : confirmation ? (
        <section className="kiosk-confirmation" aria-live="polite">
          <span className="kiosk-success-icon">
            <Check aria-hidden />
          </span>
          <h2>{confirmation.label} recorded</h2>
          <p>{selected?.display_name}, your time was accepted.</p>
          <time dateTime={confirmation.receivedAt}>
            Recorded at{" "}
            {new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
              timeZone: directory.data.device.location.timezone,
            }).format(new Date(confirmation.receivedAt))}
          </time>
          <button className="kiosk-primary" onClick={() => void reset()}>
            Done
          </button>
        </section>
      ) : selected ? (
        <section className="kiosk-action-stage">
          <button className="kiosk-back" onClick={() => void reset()}>
            <ArrowLeft aria-hidden /> Cancel
          </button>
          <div className="kiosk-person-heading">
            <span>{selected.display_name.slice(0, 1).toUpperCase()}</span>
            <div>
              <p>Selected employee</p>
              <h2>{selected.display_name}</h2>
            </div>
          </div>
          {!actionReady ? (
            <PinStep
              pin={pin}
              pending={verification.isPending}
              error={verification.error?.message}
              onPin={setPin}
              onSubmit={() =>
                verification.mutate({ employeeId: selected.id, value: pin })
              }
            />
          ) : actionState.isLoading ? (
            <div className="kiosk-inline-loading">
              <Clock3 aria-hidden /> Checking current status
            </div>
          ) : actionState.isError || !actionState.data ? (
            <div className="kiosk-message" role="alert">
              <h3>Session expired</h3>
              <p>Select your name and enter your PIN again.</p>
              <button className="kiosk-primary" onClick={() => void reset()}>
                Return
              </button>
            </div>
          ) : actionState.data.blocked_reason ? (
            <div className="kiosk-message" role="alert">
              <h3>Another location is active</h3>
              <p>
                Use your personal app or ask a manager before recording time
                here.
              </p>
              <button className="kiosk-primary" onClick={() => void reset()}>
                Return
              </button>
            </div>
          ) : (
            <ActionStep
              state={
                actionState.data.current_session?.capture_state ??
                "not_clocked_in"
              }
              actions={actionState.data.allowed_actions}
              pending={capture.isPending}
              error={capture.error?.message}
              onAction={(action) => capture.mutate(action)}
            />
          )}
        </section>
      ) : (
        <section className="kiosk-directory">
          <div className="kiosk-directory-heading">
            <div>
              <p>Ready to record time</p>
              <h2>Choose your name</h2>
            </div>
            <label className="kiosk-search">
              <Search aria-hidden />
              <span className="sr-only">Search employees</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name"
              />
            </label>
          </div>
          <div className="kiosk-employee-grid">
            {employees.map((employee) => (
              <button
                key={employee.id}
                className="kiosk-employee"
                onClick={() => setSelected(employee)}
              >
                <span>{employee.display_name.slice(0, 1).toUpperCase()}</span>
                <strong>{employee.display_name}</strong>
              </button>
            ))}
          </div>
          {employees.length === 0 && (
            <p className="kiosk-empty">No matching employees.</p>
          )}
        </section>
      )}
    </main>
  );
}

function PinStep(props: {
  pin: string;
  pending: boolean;
  error?: string;
  onPin(value: string): void;
  onSubmit(): void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmit();
  };
  return (
    <form className="kiosk-pin" onSubmit={submit}>
      <ShieldCheck aria-hidden />
      <h3>Enter your 6-digit PIN</h3>
      <input
        aria-label="6-digit PIN"
        inputMode="numeric"
        autoComplete="off"
        type="password"
        maxLength={6}
        value={props.pin}
        onChange={(event) =>
          props.onPin(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        autoFocus
      />
      {props.error && (
        <p className="kiosk-error" role="alert">
          PIN could not be verified. Try again.
        </p>
      )}
      <button
        className="kiosk-primary"
        disabled={props.pin.length !== 6 || props.pending}
      >
        {props.pending ? "Checking..." : "Continue"}
      </button>
    </form>
  );
}

function ActionStep(props: {
  state: string;
  actions: KioskActionType[];
  pending: boolean;
  error?: string;
  onAction(action: KioskActionType): void;
}) {
  return (
    <div className="kiosk-actions">
      <p className="kiosk-status">
        Current status <strong>{props.state.replaceAll("_", " ")}</strong>
      </p>
      <div className="kiosk-action-buttons">
        {props.actions.map((action) => (
          <button
            key={action}
            disabled={props.pending}
            onClick={() => props.onAction(action)}
            className={`kiosk-action kiosk-action-${action}`}
          >
            {action === "clock_in" ? (
              <LogIn aria-hidden />
            ) : action === "clock_out" ||
              action === "end_break_and_clock_out" ? (
              <LogOut aria-hidden />
            ) : (
              <Coffee aria-hidden />
            )}
            <span>{actionLabels[action]}</span>
          </button>
        ))}
      </div>
      {props.error && (
        <p className="kiosk-error" role="alert">
          The status changed or the action expired. Start again.
        </p>
      )}
    </div>
  );
}

function EnrollmentScreen(props: {
  code: string;
  online: boolean;
  pending: boolean;
  error?: string;
  onCode(value: string): void;
  onSubmit(): void;
}) {
  return (
    <main className="kiosk-page kiosk-setup">
      <div className="kiosk-setup-mark">
        <Unplug aria-hidden />
      </div>
      <span className="kiosk-brand">Newfork</span>
      <h1>Connect this time clock</h1>
      <p>Enter the one-time enrollment code created by a workspace manager.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <input
          aria-label="Enrollment code"
          value={props.code}
          onChange={(event) => props.onCode(event.target.value.toUpperCase())}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          autoCapitalize="characters"
        />
        {props.error && (
          <p className="kiosk-error" role="alert">
            That code is invalid or expired.
          </p>
        )}
        <button
          className="kiosk-primary"
          disabled={
            !props.online || props.pending || props.code.trim().length < 20
          }
        >
          {props.pending ? "Connecting..." : "Connect device"}
        </button>
      </form>
    </main>
  );
}

function KioskUnavailable({
  online,
  retry,
}: {
  online: boolean;
  retry(): void;
}) {
  return (
    <section className="kiosk-unavailable" role="alert">
      <WifiOff aria-hidden />
      <h2>{online ? "Time clock unavailable" : "You're offline"}</h2>
      <p>
        Actions are not stored on this device. Reconnect before recording time.
      </p>
      {online && (
        <button className="kiosk-primary" onClick={retry}>
          Try again
        </button>
      )}
    </section>
  );
}

function KioskLoading() {
  return (
    <main className="kiosk-page kiosk-loading">
      <Clock3 aria-hidden />
      <span>Opening time clock</span>
    </main>
  );
}
