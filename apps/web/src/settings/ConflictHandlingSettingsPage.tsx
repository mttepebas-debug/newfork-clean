import {
  scheduleConflictSettingsSchema,
  DEFAULT_SCHEDULE_CONFLICT_RULES,
  type ScheduleConflictRules,
  type ScheduleConflictSettings,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import { organizationRequest } from "./organization-data";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { LinesOutline, LoadError, RefreshError } from "../shell/LoadState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { FieldNote } from "../shell/FieldNote";
const conflictRuleChoices: readonly {
  key: keyof ScheduleConflictRules;
  label: string;
  description: string;
  actions: readonly string[];
  /** The rule's own names for its choices, where the shared ones would mislead. */
  actionLabels?: Readonly<Record<string, string>>;
}[] = [
  { key: "document_required", label: "Required documents", description: "Missing, expired or pending required employee documents.", actions: ["warn", "confirm", "block"] },
  { key: "document_conditional_grace", label: "Conditional documents during grace", description: "Unresolved documents while the delivery period is still open.", actions: ["warn", "confirm", "block"] },
  { key: "document_conditional_overdue", label: "Conditional documents after grace", description: "Unresolved documents after the delivery deadline. Cannot be softer than the grace rule.", actions: ["confirm", "block"] },
  {
    key: "closed_location",
    label: "Closed location",
    description: "Shifts on a closed day.",
    // K17: block, confirm each cell, or confirm once per editing session
    // (C2-A, Mert 2026-10-03: the same dropdown, these three names).
    actions: ["block", "confirm", "confirm_once"],
    actionLabels: { block: "Block", confirm: "Ask every time", confirm_once: "Ask once per edit" },
  },
  {
    key: "minimum_travel",
    label: "Minimum travel",
    description: "Time between assignments at different locations.",
    actions: ["warn", "confirm", "block"],
  },
  {
    key: "minimum_rest",
    label: "Minimum rest",
    description: "Time between consecutive shifts.",
    actions: ["warn", "confirm", "block"],
  },
];

const conflictActionLabels: Record<string, string> = {
  allow: "Allow",
  warn: "Warn",
  confirm: "Require confirmation",
  block: "Block",
};

export default function ConflictHandlingSettingsPage() {
  const { context } = useAuth();
  // A manager reads the rules and changes none of them (Mert 2026-10-20, K14 S1).
  const canEdit = can(context, "settings.conflict_rules.write");
  const workspaceId = context?.workspace.id ?? "";
  const client = useQueryClient();
  const queryKey = ["schedule-conflict-settings", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: async () =>
      scheduleConflictSettingsSchema.parse(
        await organizationRequest(
          workspaceId,
          "/scheduling-settings/conflicts",
        ),
      ),
    enabled: Boolean(workspaceId),
    retry: false,
  });
  const [draft, setDraft] = useState<ScheduleConflictSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    if (query.data && !dirty) setDraft(query.data);
  }, [query.data, dirty]);

  const mutation = useMutation({
    mutationFn: async (value: ScheduleConflictSettings) =>
      scheduleConflictSettingsSchema.parse(
        await organizationRequest(
          workspaceId,
          "/scheduling-settings/conflicts",
          { method: "PUT", body: JSON.stringify(value) },
        ),
      ),
    onSuccess: (value) => {
      client.setQueryData(queryKey, value);
      setDraft(value);
      setDirty(false);
      void client.invalidateQueries({
        queryKey: ["schedule-read", workspaceId],
      });
      void client.invalidateQueries({
        queryKey: ["weekly-preference-settings", workspaceId],
      });
    },
  });

  const stale =
    Boolean(draft) &&
    Boolean(query.data) &&
    draft!.conflict_rules_revision !== query.data!.conflict_rules_revision;

  const update = (patch: Partial<ScheduleConflictSettings>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    // BL-677 (2): a change undone leaves nothing unsaved.
    setDirty(JSON.stringify(next) !== JSON.stringify(query.data));
    setValidation(null);
    mutation.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    const parsed = scheduleConflictSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      setValidation(
        "Enter valid rules and whole minutes within the shown limits.",
      );
      return;
    }
    if (!stale && !mutation.isPending) mutation.mutate(parsed.data);
  };

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/settings/scheduling/conflicts")}
      />
    );
  return (
    <section
      className="settings-page"
      aria-labelledby="conflict-handling-settings-title"
    >
      <SettingsHeader
        icon={<ShieldAlert size={21} aria-hidden />}
        title="Conflict handling"
        description="Choose how scheduling conflicts are handled across this workspace."
      />
      {query.isLoading ? (
        <LinesOutline label="Loading conflict rules" lines={4} />
      ) : null}
      {query.error && !query.data ? (
        <LoadError
          title="We couldn't load conflict rules"
          detail="Conflict rules didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.error && query.data ? (
        <RefreshError
          message="Conflict rules didn't refresh. These are the last rules that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {draft ? (
        <form className="organization-form scheduling-form" onSubmit={submit}>
          <fieldset
            disabled={!canEdit || mutation.isPending}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            <ul className="conflict-settings-always">
              <li>Approved time off always keeps someone off the schedule.</li>
              <li>Availability is a preference: you'll see a warning, never a block.</li>
            </ul>
            {conflictRuleChoices.map((rule) => (
              <SettingsChoiceRow
                key={rule.key}
                label={rule.label}
                description={rule.description}
              >
                <div className="conflict-setting-controls">
                  <select
                    aria-label={`${rule.label} handling`}
                    value={draft.conflict_rules[rule.key] ?? DEFAULT_SCHEDULE_CONFLICT_RULES[rule.key]}
                    onChange={(event) =>
                      update({
                        conflict_rules: {
                          ...draft.conflict_rules,
                          [rule.key]: event.target.value,
                        },
                      })
                    }
                  >
                    {rule.actions.map((action) => (
                      <option key={action} value={action}>
                        {rule.actionLabels?.[action] ?? conflictActionLabels[action]}
                      </option>
                    ))}
                  </select>
                  {rule.key === "minimum_travel" ||
                  rule.key === "minimum_rest" ? (
                    <label className="conflict-minimum-field">
                      <span>
                        Minimum{" "}
                        {rule.key === "minimum_travel" ? "travel" : "rest"}{" "}
                        time (minutes)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={rule.key === "minimum_travel" ? 240 : 1440}
                        step={1}
                        required
                        aria-label={`Minimum ${rule.key === "minimum_travel" ? "travel" : "rest"} time (minutes)`}
                        value={
                          Number.isFinite(
                            draft[
                              rule.key === "minimum_travel"
                                ? "minimum_travel_minutes"
                                : "minimum_rest_minutes"
                            ],
                          )
                            ? draft[
                                rule.key === "minimum_travel"
                                  ? "minimum_travel_minutes"
                                  : "minimum_rest_minutes"
                              ]
                            : ""
                        }
                        onChange={(event) =>
                          update({
                            [rule.key === "minimum_travel"
                              ? "minimum_travel_minutes"
                              : "minimum_rest_minutes"]:
                              event.target.valueAsNumber,
                          })
                        }
                      />
                      <small>0 means no minimum configured.</small>
                    </label>
                  ) : null}
                </div>
              </SettingsChoiceRow>
            ))}
            <FieldNote
              id="conflict-handling"
              error={
                validation ??
                (mutation.error
                  ? errorText(mutation.error)
                  : stale
                    ? "Conflict rules changed. Reload before saving."
                    : null)
              }
            />
            {mutation.isSuccess && !dirty ? (
              <p className="form-success" role="status">
                Conflict rules saved.
              </p>
            ) : null}
            {canEdit ? (
              <div className="organization-form-actions">
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={async () => {
                    const result = await query.refetch();
                    if (result.data) {
                      setDraft(result.data);
                      setDirty(false);
                      setValidation(null);
                      mutation.reset();
                    }
                  }}
                >
                  Reload rules
                </Button>
                <Button
                  type="submit"
                  disabled={!dirty || stale || mutation.isPending}
                >
                  <Save size={16} aria-hidden />
                  {mutation.isPending ? "Saving" : "Save conflict rules"}
                </Button>
              </div>
            ) : null}
          </fieldset>
        </form>
      ) : null}
    </section>
  );
}

function SettingsChoiceRow({
  label,
  description,
  children,
}: {
  readonly label: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="scheduling-setting-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}
