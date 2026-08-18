import {
  signatureRetentionPolicyInputSchema,
  signatureTemplateDraftInputSchema,
  type SignatureRetentionPolicy,
  type SignatureRetentionPolicyInput,
  type SignatureTemplate,
  type SignatureTemplateDraftInput,
  type SignatureTemplateVersion,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BookOpenCheck,
  Check,
  Eye,
  FileCheck2,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  approveSignatureRetentionPolicy,
  listSignatureSettings,
  publishSignatureTemplate,
  saveSignatureRetentionPolicy,
  saveSignatureTemplateDraft,
  setSignatureRetentionPolicyArchived,
  setSignatureTemplateArchived,
} from "./signature-templates-data";

type View = "templates" | "retention";

const defaultPolicyDraft: SignatureRetentionPolicyInput = {
  name: "",
  retention_trigger: "employment_end",
  duration_days: 1095,
  jurisdiction_scope: "",
  authority_reference: "",
};

function defaultTemplateDraft(
  retentionPolicyId = "",
): SignatureTemplateDraftInput {
  return {
    title: "",
    summary: "",
    content_text: "",
    intent_statement: "I acknowledge that I received and reviewed this policy.",
    locale: "en-US",
    effective_date: new Date().toISOString().slice(0, 10),
    required_at_onboarding: true,
    blocks_activation: true,
    retention_policy_id: retentionPolicyId,
  };
}

export default function SignatureTemplatesSettingsPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const canManage =
    context?.permissions.includes("signature_templates.manage") ?? false;
  const queryKey = ["signature-settings", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => listSignatureSettings(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [view, setView] = useState<View>("templates");
  const [showArchived, setShowArchived] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<
    SignatureRetentionPolicy | "new" | null
  >(null);
  const [policyDraft, setPolicyDraft] =
    useState<SignatureRetentionPolicyInput>(defaultPolicyDraft);
  const [editingTemplate, setEditingTemplate] = useState<
    SignatureTemplate | "new" | null
  >(null);
  const [templateDraft, setTemplateDraft] =
    useState<SignatureTemplateDraftInput>(defaultTemplateDraft());
  const [previewVersion, setPreviewVersion] =
    useState<SignatureTemplateVersion | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "approve" | "publish";
    id: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const policySaveMutation = useMutation({
    mutationFn: () =>
      saveSignatureRetentionPolicy(
        workspaceId,
        policyDraft,
        editingPolicy && editingPolicy !== "new" ? editingPolicy.id : undefined,
      ),
    onSuccess: async () => {
      await refresh();
      setEditingPolicy(null);
      setFormError(null);
    },
    onError: (error) => setFormError(errorText(error)),
  });
  const policyApproveMutation = useMutation({
    mutationFn: (id: string) =>
      approveSignatureRetentionPolicy(workspaceId, id),
    onSuccess: async () => {
      await refresh();
      setConfirmAction(null);
      setFormError(null);
    },
    onError: (error) => {
      setConfirmAction(null);
      setFormError(errorText(error));
    },
  });
  const policyArchiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setSignatureRetentionPolicyArchived(workspaceId, id, archived),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });
  const templateSaveMutation = useMutation({
    mutationFn: () =>
      saveSignatureTemplateDraft(
        workspaceId,
        templateDraft,
        editingTemplate && editingTemplate !== "new"
          ? editingTemplate.id
          : undefined,
      ),
    onSuccess: async () => {
      await refresh();
      setEditingTemplate(null);
      setFormError(null);
    },
    onError: (error) => setFormError(errorText(error)),
  });
  const templatePublishMutation = useMutation({
    mutationFn: (id: string) => publishSignatureTemplate(workspaceId, id),
    onSuccess: async () => {
      await refresh();
      setConfirmAction(null);
      setFormError(null);
    },
    onError: (error) => {
      setConfirmAction(null);
      setFormError(errorText(error));
    },
  });
  const templateArchiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setSignatureTemplateArchived(workspaceId, id, archived),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });

  const data = query.data ?? { policies: [], templates: [], versions: [] };
  const activePolicies = data.policies.filter((policy) => !policy.archived_at);
  const versionsFor = (templateId: string) =>
    data.versions.filter((version) => version.template_id === templateId);
  const draftFor = (templateId: string) =>
    versionsFor(templateId).find((version) => version.status === "draft");
  const publishedFor = (templateId: string) =>
    versionsFor(templateId).find((version) => version.status === "published");

  const openPolicyEditor = (policy?: SignatureRetentionPolicy): void => {
    setEditingPolicy(policy ?? "new");
    setPolicyDraft(
      policy
        ? signatureRetentionPolicyInputSchema.parse(policy)
        : defaultPolicyDraft,
    );
    setFormError(null);
  };
  const openTemplateEditor = (template?: SignatureTemplate): void => {
    const current = template
      ? (draftFor(template.id) ?? publishedFor(template.id))
      : undefined;
    setEditingTemplate(template ?? "new");
    setTemplateDraft(
      current
        ? signatureTemplateDraftInputSchema.parse(current)
        : defaultTemplateDraft(activePolicies[0]?.id),
    );
    setFormError(null);
  };
  const submitPolicy = (event: FormEvent): void => {
    event.preventDefault();
    const parsed = signatureRetentionPolicyInputSchema.safeParse(policyDraft);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Check the retention fields",
      );
      return;
    }
    setFormError(null);
    policySaveMutation.mutate();
  };
  const submitTemplate = (event: FormEvent): void => {
    event.preventDefault();
    const parsed = signatureTemplateDraftInputSchema.safeParse(templateDraft);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Check the template fields",
      );
      return;
    }
    setFormError(null);
    templateSaveMutation.mutate();
  };

  return (
    <section
      className="settings-page acknowledgement-page"
      aria-labelledby="acknowledgements-settings-title"
    >
      <SettingsHeader
        icon={<BookOpenCheck size={21} aria-hidden />}
        title="Acknowledgements"
        description="Versioned policy acknowledgements that Phase 4 onboarding will assign to employees."
      />
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Acknowledgement settings"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "templates"}
          onClick={() => setView("templates")}
        >
          <FileCheck2 size={15} aria-hidden />
          Templates
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "retention"}
          onClick={() => setView("retention")}
        >
          <BookOpenCheck size={15} aria-hidden />
          Retention policies
        </button>
      </div>
      <div className="settings-toolbar">
        <label className="archive-filter">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
        {canManage ? (
          <Button
            type="button"
            disabled={view === "templates" && activePolicies.length === 0}
            onClick={() =>
              view === "templates" ? openTemplateEditor() : openPolicyEditor()
            }
          >
            <Plus size={16} aria-hidden />
            {view === "templates" ? "Add template" : "Add retention policy"}
          </Button>
        ) : null}
      </div>
      {view === "templates" && activePolicies.length === 0 ? (
        <p className="settings-notice">
          Create a retention policy before adding an acknowledgement template.
        </p>
      ) : null}
      {formError ? (
        <p className="settings-state error" role="alert">
          {formError}
        </p>
      ) : null}
      {query.isLoading ? (
        <p className="settings-state">Loading acknowledgement settings...</p>
      ) : null}
      {query.error ? (
        <p className="settings-state error" role="alert">
          {errorText(query.error)}
        </p>
      ) : null}

      {view === "retention" && editingPolicy ? (
        <form
          className="entity-editor"
          aria-label={
            editingPolicy === "new"
              ? "Add retention policy"
              : `Edit ${editingPolicy.name}`
          }
          onSubmit={submitPolicy}
        >
          <EditorHeading
            title={
              editingPolicy === "new"
                ? "New retention policy"
                : "Edit retention policy"
            }
            description="Approval makes these retention terms immutable."
            close={() => setEditingPolicy(null)}
          />
          <div className="retention-fields">
            <label className="form-field">
              <span>Name</span>
              <input
                required
                maxLength={80}
                value={policyDraft.name}
                onChange={(event) =>
                  setPolicyDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Trigger</span>
              <select
                value={policyDraft.retention_trigger}
                onChange={(event) =>
                  setPolicyDraft((current) => ({
                    ...current,
                    retention_trigger: event.target
                      .value as SignatureRetentionPolicyInput["retention_trigger"],
                  }))
                }
              >
                <option value="employment_end">Employment end</option>
                <option value="signed_at">Acknowledged date</option>
              </select>
            </label>
            <label className="form-field">
              <span>Duration</span>
              <div className="number-suffix-input">
                <input
                  type="number"
                  min={1}
                  max={36500}
                  value={policyDraft.duration_days}
                  onChange={(event) =>
                    setPolicyDraft((current) => ({
                      ...current,
                      duration_days: Number(event.target.value),
                    }))
                  }
                />
                <span>days</span>
              </div>
            </label>
            <label className="form-field">
              <span>Jurisdiction / scope</span>
              <input
                required
                maxLength={120}
                value={policyDraft.jurisdiction_scope}
                onChange={(event) =>
                  setPolicyDraft((current) => ({
                    ...current,
                    jurisdiction_scope: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field retention-authority-field">
              <span>Authority or records schedule reference</span>
              <textarea
                required
                rows={3}
                maxLength={500}
                value={policyDraft.authority_reference}
                onChange={(event) =>
                  setPolicyDraft((current) => ({
                    ...current,
                    authority_reference: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="entity-editor-actions">
            <Button
              type="button"
              className="secondary-button"
              onClick={() => setEditingPolicy(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={policySaveMutation.isPending}>
              {policySaveMutation.isPending ? "Saving" : "Save draft policy"}
            </Button>
          </div>
        </form>
      ) : null}

      {view === "templates" && editingTemplate ? (
        <form
          className="entity-editor"
          aria-label={
            editingTemplate === "new"
              ? "Add acknowledgement template"
              : `Edit ${editingTemplate.name}`
          }
          onSubmit={submitTemplate}
        >
          <EditorHeading
            title={
              editingTemplate === "new"
                ? "New acknowledgement template"
                : "Edit acknowledgement draft"
            }
            description="Published content is immutable; later edits create a new draft version."
            close={() => setEditingTemplate(null)}
          />
          <div className="acknowledgement-fields">
            <label className="form-field">
              <span>Title</span>
              <input
                required
                maxLength={80}
                value={templateDraft.title}
                onChange={(event) =>
                  setTemplateDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Locale</span>
              <input
                required
                maxLength={20}
                value={templateDraft.locale}
                onChange={(event) =>
                  setTemplateDraft((current) => ({
                    ...current,
                    locale: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Effective date</span>
              <input
                required
                type="date"
                value={templateDraft.effective_date}
                onChange={(event) =>
                  setTemplateDraft((current) => ({
                    ...current,
                    effective_date: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Retention policy</span>
              <select
                required
                value={templateDraft.retention_policy_id}
                onChange={(event) =>
                  setTemplateDraft((current) => ({
                    ...current,
                    retention_policy_id: event.target.value,
                  }))
                }
              >
                <option value="">Select a policy</option>
                {activePolicies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                    {policy.status === "draft" ? " (draft)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field field-wide">
              <span>Summary</span>
              <textarea
                rows={2}
                maxLength={240}
                value={templateDraft.summary}
                onChange={(event) =>
                  setTemplateDraft((current) => ({
                    ...current,
                    summary: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field field-wide">
              <span>Policy content</span>
              <textarea
                className="policy-content-input"
                required
                rows={12}
                maxLength={50000}
                value={templateDraft.content_text}
                onChange={(event) =>
                  setTemplateDraft((current) => ({
                    ...current,
                    content_text: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field field-wide">
              <span>Intent statement</span>
              <textarea
                required
                rows={2}
                maxLength={500}
                value={templateDraft.intent_statement}
                onChange={(event) =>
                  setTemplateDraft((current) => ({
                    ...current,
                    intent_statement: event.target.value,
                  }))
                }
              />
            </label>
            <fieldset className="document-options acknowledgement-options">
              <legend>Onboarding behavior</legend>
              <label>
                <input
                  type="checkbox"
                  checked={templateDraft.required_at_onboarding}
                  onChange={(event) =>
                    setTemplateDraft((current) => ({
                      ...current,
                      required_at_onboarding: event.target.checked,
                      blocks_activation: event.target.checked
                        ? current.blocks_activation
                        : false,
                    }))
                  }
                />
                <span>
                  <strong>Required during onboarding</strong>
                  <small>
                    Phase 4 will snapshot this template onto onboarding cases.
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={templateDraft.blocks_activation}
                  disabled={!templateDraft.required_at_onboarding}
                  onChange={(event) =>
                    setTemplateDraft((current) => ({
                      ...current,
                      blocks_activation: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Block activation until complete</strong>
                  <small>
                    Completion remains separate from account membership state.
                  </small>
                </span>
              </label>
            </fieldset>
          </div>
          <div className="entity-editor-actions">
            <Button
              type="button"
              className="secondary-button"
              onClick={() => setEditingTemplate(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={templateSaveMutation.isPending}>
              {templateSaveMutation.isPending
                ? "Saving"
                : "Save draft template"}
            </Button>
          </div>
        </form>
      ) : null}

      {!query.isLoading && !query.error && view === "retention" ? (
        <RetentionList
          policies={data.policies.filter(
            (item) => showArchived || !item.archived_at,
          )}
          canManage={canManage}
          confirmAction={confirmAction}
          setConfirmAction={setConfirmAction}
          edit={openPolicyEditor}
          approve={(id) => policyApproveMutation.mutate(id)}
          archive={(id, archived) =>
            policyArchiveMutation.mutate({ id, archived })
          }
        />
      ) : null}
      {!query.isLoading && !query.error && view === "templates" ? (
        <TemplateList
          templates={data.templates.filter(
            (item) => showArchived || !item.archived_at,
          )}
          policies={data.policies}
          versionsFor={versionsFor}
          canManage={canManage}
          confirmAction={confirmAction}
          setConfirmAction={setConfirmAction}
          edit={openTemplateEditor}
          preview={setPreviewVersion}
          publish={(id) => templatePublishMutation.mutate(id)}
          archive={(id, archived) =>
            templateArchiveMutation.mutate({ id, archived })
          }
        />
      ) : null}

      {previewVersion ? (
        <TemplatePreview
          version={previewVersion}
          policy={data.policies.find(
            (item) => item.id === previewVersion.retention_policy_id,
          )}
          close={() => setPreviewVersion(null)}
        />
      ) : null}
    </section>
  );
}

function EditorHeading({
  title,
  description,
  close,
}: {
  readonly title: string;
  readonly description: string;
  readonly close: () => void;
}) {
  return (
    <div className="entity-editor-heading">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label="Close editor"
        title="Close"
        onClick={close}
      >
        <X size={17} aria-hidden />
      </button>
    </div>
  );
}

function RetentionList({
  policies,
  canManage,
  confirmAction,
  setConfirmAction,
  edit,
  approve,
  archive,
}: {
  readonly policies: SignatureRetentionPolicy[];
  readonly canManage: boolean;
  readonly confirmAction: { type: "approve" | "publish"; id: string } | null;
  readonly setConfirmAction: (
    value: { type: "approve" | "publish"; id: string } | null,
  ) => void;
  readonly edit: (policy: SignatureRetentionPolicy) => void;
  readonly approve: (id: string) => void;
  readonly archive: (id: string, archived: boolean) => void;
}) {
  if (policies.length === 0)
    return (
      <Empty
        title="No retention policies yet"
        text="Define an approved records schedule before publishing acknowledgements."
      />
    );
  return (
    <div className="entity-list" aria-label="Retention policies">
      {policies.map((policy) => (
        <div
          className="entity-row retention-policy-row"
          key={policy.id}
          data-archived={Boolean(policy.archived_at)}
        >
          <span className="entity-marker document-marker" aria-hidden>
            <BookOpenCheck size={16} />
          </span>
          <div className="entity-summary">
            <strong>{policy.name}</strong>
            <span>
              {policy.duration_days.toLocaleString()} days after{" "}
              {policy.retention_trigger === "employment_end"
                ? "employment end"
                : "acknowledgement"}
            </span>
            <small>{policy.jurisdiction_scope}</small>
          </div>
          <span
            className={`status-label${policy.status === "approved" ? " approved" : ""}`}
          >
            {policy.archived_at
              ? "Archived"
              : policy.status === "approved"
                ? "Approved"
                : "Draft"}
          </span>
          {canManage ? (
            <div className="row-actions">
              {policy.status === "draft" && !policy.archived_at ? (
                <>
                  {confirmAction?.type === "approve" &&
                  confirmAction.id === policy.id ? (
                    <>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => setConfirmAction(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="text-action confirm"
                        onClick={() => approve(policy.id)}
                      >
                        Confirm approval
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Approve ${policy.name}`}
                      title="Approve"
                      onClick={() =>
                        setConfirmAction({ type: "approve", id: policy.id })
                      }
                    >
                      <Check size={16} aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${policy.name}`}
                    title="Edit"
                    onClick={() => edit(policy)}
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="icon-button"
                aria-label={`${policy.archived_at ? "Restore" : "Archive"} ${policy.name}`}
                title={policy.archived_at ? "Restore" : "Archive"}
                onClick={() => archive(policy.id, !policy.archived_at)}
              >
                {policy.archived_at ? (
                  <RotateCcw size={16} aria-hidden />
                ) : (
                  <Archive size={16} aria-hidden />
                )}
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TemplateList({
  templates,
  policies,
  versionsFor,
  canManage,
  confirmAction,
  setConfirmAction,
  edit,
  preview,
  publish,
  archive,
}: {
  readonly templates: SignatureTemplate[];
  readonly policies: SignatureRetentionPolicy[];
  readonly versionsFor: (id: string) => SignatureTemplateVersion[];
  readonly canManage: boolean;
  readonly confirmAction: { type: "approve" | "publish"; id: string } | null;
  readonly setConfirmAction: (
    value: { type: "approve" | "publish"; id: string } | null,
  ) => void;
  readonly edit: (template: SignatureTemplate) => void;
  readonly preview: (version: SignatureTemplateVersion) => void;
  readonly publish: (id: string) => void;
  readonly archive: (id: string, archived: boolean) => void;
}) {
  if (templates.length === 0)
    return (
      <Empty
        title="No acknowledgement templates yet"
        text="Create policy content only after its retention policy is defined."
      />
    );
  return (
    <div className="entity-list" aria-label="Acknowledgement templates">
      {templates.map((template) => {
        const versions = versionsFor(template.id);
        const draft = versions.find((item) => item.status === "draft");
        const published = versions.find((item) => item.status === "published");
        const current = draft ?? published;
        const policy = policies.find(
          (item) => item.id === current?.retention_policy_id,
        );
        return (
          <div
            className="entity-row acknowledgement-row"
            key={template.id}
            data-archived={Boolean(template.archived_at)}
          >
            <span className="entity-marker document-marker" aria-hidden>
              <FileCheck2 size={16} />
            </span>
            <div className="entity-summary">
              <strong>{template.name}</strong>
              <span>
                {current
                  ? `${current.status === "draft" ? "Draft" : "Published"} v${current.version_number} · ${current.locale} · ${current.effective_date}`
                  : "No version"}
              </span>
              <small>
                {[
                  current?.required_at_onboarding ? "Required" : "Optional",
                  current?.blocks_activation
                    ? "Blocks activation"
                    : "No activation block",
                  policy?.name ?? "Missing retention policy",
                ].join(" · ")}
              </small>
            </div>
            <span
              className={`status-label${published && !draft ? " approved" : ""}`}
            >
              {template.archived_at
                ? "Archived"
                : draft
                  ? "Draft"
                  : "Published"}
            </span>
            <div className="row-actions">
              {current ? (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Preview ${template.name}`}
                  title="Preview"
                  onClick={() => preview(current)}
                >
                  <Eye size={16} aria-hidden />
                </button>
              ) : null}
              {canManage ? (
                <>
                  {!template.archived_at && draft ? (
                    confirmAction?.type === "publish" &&
                    confirmAction.id === template.id ? (
                      <>
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => setConfirmAction(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="text-action confirm"
                          onClick={() => publish(template.id)}
                        >
                          Confirm publish
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Publish ${template.name}`}
                        title="Publish"
                        onClick={() =>
                          setConfirmAction({ type: "publish", id: template.id })
                        }
                      >
                        <Send size={16} aria-hidden />
                      </button>
                    )
                  ) : null}
                  {!template.archived_at ? (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${template.name}`}
                      title="Edit"
                      onClick={() => edit(template)}
                    >
                      <Pencil size={16} aria-hidden />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${template.archived_at ? "Restore" : "Archive"} ${template.name}`}
                    title={template.archived_at ? "Restore" : "Archive"}
                    onClick={() => archive(template.id, !template.archived_at)}
                  >
                    {template.archived_at ? (
                      <RotateCcw size={16} aria-hidden />
                    ) : (
                      <Archive size={16} aria-hidden />
                    )}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TemplatePreview({
  version,
  policy,
  close,
}: {
  readonly version: SignatureTemplateVersion;
  readonly policy?: SignatureRetentionPolicy;
  readonly close: () => void;
}) {
  return (
    <section
      className="template-preview"
      aria-label={`Preview ${version.title}`}
    >
      <div className="template-preview-heading">
        <div>
          <span>Acknowledgement preview</span>
          <h2>{version.title}</h2>
          <p>{version.summary}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close preview"
          title="Close"
          onClick={close}
        >
          <X size={17} aria-hidden />
        </button>
      </div>
      <dl>
        <div>
          <dt>Version</dt>
          <dd>
            {version.version_number} · {version.status}
          </dd>
        </div>
        <div>
          <dt>Effective</dt>
          <dd>{version.effective_date}</dd>
        </div>
        <div>
          <dt>Retention</dt>
          <dd>{policy?.name ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Digest</dt>
          <dd title={version.content_digest}>
            {version.content_digest.slice(0, 12)}...
          </dd>
        </div>
      </dl>
      <article>{version.content_text}</article>
      <div className="template-intent">
        <Check size={16} aria-hidden />
        <span>{version.intent_statement}</span>
      </div>
    </section>
  );
}

function Empty({
  title,
  text,
}: {
  readonly title: string;
  readonly text: string;
}) {
  return (
    <div className="settings-empty">
      <FileCheck2 size={22} aria-hidden />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
