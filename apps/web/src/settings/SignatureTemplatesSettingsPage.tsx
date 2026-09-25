import { LifecycleAssignmentFields } from "../documents/DocumentLifecycleFields";
import { DocumentDefinitionApply } from "../documents/DocumentDefinitionApply";
import { CatalogDrawer } from "./CatalogDrawer";
import {
  defaultDocumentLifecycleSettings,
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
  BookOpenCheck,
  Check,
  FileCheck2,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { CatalogRowMenu } from "./CatalogRowMenu";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  approveSignatureRetentionPolicy,
  listSignatureSettings,
  publishSignatureTemplate,
  saveSignatureRetentionPolicy,
  saveSignatureTemplateDraft,
  setSignatureRetentionPolicyArchived,
  setSignatureTemplateArchived,
  unapproveSignatureRetentionPolicy,
  unpublishSignatureTemplate,
} from "./signature-templates-data";
import "./jobs-settings.css";

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
    lifecycle_settings: {
      ...defaultDocumentLifecycleSettings,
      mode: "required",
    },
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

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const [search, setSearch] = useState("");
  const [editingPolicy, setEditingPolicy] = useState<
    SignatureRetentionPolicy | "new" | null
  >(null);
  const [policyDraft, setPolicyDraft] =
    useState<SignatureRetentionPolicyInput>(defaultPolicyDraft);
  const [editingTemplate, setEditingTemplate] = useState<
    SignatureTemplate | "new" | null
  >(null);
  const [policyApplying, setPolicyApplying] = useState(false);
  const [templateDraft, setTemplateDraft] =
    useState<SignatureTemplateDraftInput>(defaultTemplateDraft());
  const policyContentRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const input = policyContentRef.current;
    if (!input) return;

    const resize = () => {
      input.style.height = "auto";
      const style = window.getComputedStyle(input);
      const borders =
        parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      input.style.height = `${input.scrollHeight + borders}px`;
    };

    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resize();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [editingTemplate, templateDraft.content_text]);

  const [previewVersion, setPreviewVersion] =
    useState<SignatureTemplateVersion | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "approve" | "publish" | "unapprove" | "unpublish";
    id: string;
  } | null>(null);
  const [confirmPolicyDelete, setConfirmPolicyDelete] = useState(false);
  const [confirmTemplateDelete, setConfirmTemplateDelete] = useState(false);
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
  const policyUnapproveMutation = useMutation({
    mutationFn: (id: string) =>
      unapproveSignatureRetentionPolicy(workspaceId, id),
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
  const templateUnpublishMutation = useMutation({
    mutationFn: (id: string) => unpublishSignatureTemplate(workspaceId, id),
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

  useEffect(() => {
    if (!editingPolicy || editingPolicy === "new") return;
    const latest = data.policies.find(
      (policy) => policy.id === editingPolicy.id,
    );
    if (!latest || sameJson(latest, editingPolicy)) return;
    setEditingPolicy(latest);
    setPolicyDraft(signatureRetentionPolicyInputSchema.parse(latest));
  }, [data.policies, editingPolicy]);

  const activePolicies = data.policies.filter((policy) => !policy.archived_at);
  const versionsFor = (templateId: string) =>
    data.versions.filter((version) => version.template_id === templateId);
  const draftFor = (templateId: string) =>
    versionsFor(templateId).find((version) => version.status === "draft");
  const publishedFor = (templateId: string) =>
    versionsFor(templateId).find((version) => version.status === "published");

  const openPolicyEditor = (policy?: SignatureRetentionPolicy): void => {
    setEditingPolicy(policy ?? "new");
    setConfirmPolicyDelete(false);
    setConfirmAction(null);
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
    setConfirmTemplateDelete(false);
    setConfirmAction(null);
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
    if (!canSavePolicy) return;
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
    if (!canSaveTemplate) return;
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Check the template fields",
      );
      return;
    }
    setFormError(null);
    templateSaveMutation.mutate();
  };
  const parsedPolicyDraft =
    signatureRetentionPolicyInputSchema.safeParse(policyDraft);
  const policyBaseline =
    editingPolicy && editingPolicy !== "new"
      ? signatureRetentionPolicyInputSchema.parse(editingPolicy)
      : defaultPolicyDraft;
  const policyStatusMutationPending =
    policySaveMutation.isPending ||
    policyApproveMutation.isPending ||
    policyUnapproveMutation.isPending ||
    policyArchiveMutation.isPending;
  const policyFieldsLocked =
    editingPolicy !== null &&
    editingPolicy !== "new" &&
    editingPolicy.status === "approved";
  const canSavePolicy =
    !policyStatusMutationPending &&
    Boolean(editingPolicy) &&
    !policyFieldsLocked &&
    parsedPolicyDraft.success &&
    (editingPolicy === "new" ||
      !sameJson(parsedPolicyDraft.data, policyBaseline));
  const templateBaselineVersion =
    editingTemplate && editingTemplate !== "new"
      ? (draftFor(editingTemplate.id) ?? publishedFor(editingTemplate.id))
      : null;
  const parsedTemplateDraft =
    signatureTemplateDraftInputSchema.safeParse(templateDraft);
  const templateBaseline = templateBaselineVersion
    ? signatureTemplateDraftInputSchema.parse(templateBaselineVersion)
    : defaultTemplateDraft(activePolicies[0]?.id);
  const templateStatusMutationPending =
    policyApplying ||
    templateSaveMutation.isPending ||
    templatePublishMutation.isPending ||
    templateUnpublishMutation.isPending ||
    templateArchiveMutation.isPending;
  const canSaveTemplate =
    !templateStatusMutationPending &&
    Boolean(editingTemplate) &&
    parsedTemplateDraft.success &&
    (editingTemplate === "new" ||
      !sameJson(parsedTemplateDraft.data, templateBaseline));

  return (
    <section
      className="settings-page jobs-settings-page acknowledgement-page"
      aria-labelledby="acknowledgements-settings-title"
    >
      <SettingsHeader
        icon={<BookOpenCheck size={21} aria-hidden />}
        title="Acknowledgements"
        description="Create policies for employees to read and accept, and choose how long records are kept."
        action={
          <div className="shift-catalog-header-actions acknowledgement-header-actions">
            <div
              className="requests-tabs"
              role="tablist"
              aria-label="Acknowledgement settings"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === "templates"}
                className={view === "templates" ? "active" : ""}
                onClick={() => {
                  setView("templates");
                  setEditingPolicy(null);
                  setEditingTemplate(null);
                }}
              >
                Templates
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "retention"}
                className={view === "retention" ? "active" : ""}
                onClick={() => {
                  setView("retention");
                  setEditingPolicy(null);
                  setEditingTemplate(null);
                }}
              >
                Retention
              </button>
            </div>
            {canManage ? (
              <Button
                className="job-primary-button"
                type="button"
                disabled={view === "templates" && activePolicies.length === 0}
                onClick={() =>
                  view === "templates"
                    ? openTemplateEditor()
                    : openPolicyEditor()
                }
              >
                <Plus size={16} aria-hidden />
                {view === "templates" ? "Add template" : "Add policy"}
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="job-catalog-toolbar">
        <label className="job-search">
          <Search size={16} aria-hidden />
          <input
            aria-label="Search acknowledgements"
            placeholder={
              view === "templates"
                ? "Search templates"
                : "Search retention policies"
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="job-archive-filter">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>
      {view === "templates" && activePolicies.length === 0 ? (
        <p className="settings-notice">
          Create a retention policy before adding an acknowledgement template.
        </p>
      ) : null}
      {formError && !editingPolicy && !editingTemplate ? (
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
        <CatalogDrawer
          label={
            editingPolicy === "new"
              ? "Add retention policy"
              : `Edit ${editingPolicy.name}`
          }
          className="acknowledgement-page"
          onClose={() => setEditingPolicy(null)}
          busy={policyStatusMutationPending}
        >
          <form
            className="job-catalog-editor"
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
              busy={policyStatusMutationPending}
            />
            <div className="catalog-drawer-body">
              <fieldset
                className="catalog-drawer-fields"
                disabled={policyStatusMutationPending || policyFieldsLocked}
              >
                <div className="retention-fields">
                  <label className="job-field">
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
                  <label className="job-field">
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
                  <label className="job-field">
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
                  <label className="job-field">
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
                  <label className="job-field retention-authority-field">
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
              </fieldset>
              {formError && (
                <p className="job-error" role="alert">
                  {formError}
                </p>
              )}
            </div>
            <div className="job-editor-footer">
              {editingPolicy !== "new" ? (
                <RetentionPolicyFooterActions
                  policy={editingPolicy}
                  confirmAction={confirmAction}
                  setConfirmAction={setConfirmAction}
                  confirmDelete={confirmPolicyDelete}
                  setConfirmDelete={setConfirmPolicyDelete}
                  busy={policyStatusMutationPending}
                  approve={(id) => policyApproveMutation.mutate(id)}
                  unapprove={(id) => policyUnapproveMutation.mutate(id)}
                  deletePolicy={(id) =>
                    policyArchiveMutation.mutate(
                      { id, archived: true },
                      { onSuccess: () => setEditingPolicy(null) },
                    )
                  }
                />
              ) : (
                <span />
              )}
              <div className="job-editor-actions">
                <Button
                  type="button"
                  className="job-secondary-button"
                  disabled={policyStatusMutationPending}
                  onClick={() => setEditingPolicy(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="job-primary-button"
                  type="submit"
                  disabled={!canSavePolicy}
                >
                  {policySaveMutation.isPending
                    ? "Saving"
                    : "Save draft policy"}
                </Button>
              </div>
            </div>
          </form>
        </CatalogDrawer>
      ) : null}

      {view === "templates" && editingTemplate ? (
        <CatalogDrawer
          label={
            editingTemplate === "new"
              ? "Add acknowledgement template"
              : `Edit ${editingTemplate.name}`
          }
          className="acknowledgement-page"
          onClose={() => setEditingTemplate(null)}
          busy={templateStatusMutationPending}
        >
          <form
            className="job-catalog-editor"
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
              busy={templateStatusMutationPending}
            />
            <div className="catalog-drawer-body">
              <fieldset
                className="catalog-drawer-fields"
                disabled={templateStatusMutationPending}
              >
                <div className="acknowledgement-fields">
                  <label className="job-field">
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
                  <label className="job-field">
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
                  <label className="job-field">
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
                  <label className="job-field">
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
                  <label className="job-field field-wide">
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
                  <label className="job-field field-wide">
                    <span>Policy content</span>
                    <textarea
                      ref={policyContentRef}
                      className="policy-content-input"
                      required
                      rows={2}
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
                  <label className="job-field field-wide">
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
                  <LifecycleAssignmentFields
                    kind="acknowledgement"
                    workspaceId={workspaceId}
                    settings={
                      templateDraft.lifecycle_settings ?? {
                        ...defaultDocumentLifecycleSettings,
                        mode: templateDraft.required_at_onboarding
                          ? "required"
                          : "optional",
                      }
                    }
                    onChange={(settings) =>
                      setTemplateDraft((current) => ({
                        ...current,
                        lifecycle_settings: settings,
                        required_at_onboarding: settings.mode === "required",
                        blocks_activation: settings.mode === "required",
                      }))
                    }
                  />
                </div>
              </fieldset>
              {editingTemplate &&
                editingTemplate !== "new" &&
                publishedFor(editingTemplate.id) && (
                  <DocumentDefinitionApply
                    workspaceId={workspaceId}
                    id={publishedFor(editingTemplate.id)!.id}
                    disabled={templateStatusMutationPending || canSaveTemplate}
                    onBusyChange={setPolicyApplying}
                  />
                )}
              {formError && (
                <p className="job-error" role="alert">
                  {formError}
                </p>
              )}
            </div>
            <div className="job-editor-footer">
              {editingTemplate !== "new" ? (
                <TemplateFooterActions
                  template={editingTemplate}
                  draft={draftFor(editingTemplate.id)}
                  published={publishedFor(editingTemplate.id)}
                  confirmAction={confirmAction}
                  setConfirmAction={setConfirmAction}
                  confirmDelete={confirmTemplateDelete}
                  setConfirmDelete={setConfirmTemplateDelete}
                  busy={templateStatusMutationPending}
                  publish={(id) => templatePublishMutation.mutate(id)}
                  unpublish={(id) => templateUnpublishMutation.mutate(id)}
                  deleteTemplate={(id) =>
                    templateArchiveMutation.mutate(
                      { id, archived: true },
                      { onSuccess: () => setEditingTemplate(null) },
                    )
                  }
                />
              ) : (
                <span />
              )}
              <div className="job-editor-actions">
                <Button
                  type="button"
                  className="job-secondary-button"
                  disabled={templateStatusMutationPending}
                  onClick={() => setEditingTemplate(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="job-primary-button"
                  type="submit"
                  disabled={!canSaveTemplate}
                >
                  {templateSaveMutation.isPending
                    ? "Saving"
                    : "Save draft template"}
                </Button>
              </div>
            </div>
          </form>
        </CatalogDrawer>
      ) : null}

      {!query.isLoading && !query.error && view === "retention" ? (
        <RetentionList
          policies={data.policies.filter(
            (item) =>
              (showArchived || !item.archived_at) &&
              `${item.name} ${item.jurisdiction_scope}`
                .toLowerCase()
                .includes(search.trim().toLowerCase()),
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
            (item) =>
              (showArchived || !item.archived_at) &&
              item.name.toLowerCase().includes(search.trim().toLowerCase()),
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
  busy,
}: {
  readonly title: string;
  readonly description: string;
  readonly close: () => void;
  readonly busy: boolean;
}) {
  return (
    <div className="job-editor-title">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <button
        type="button"
        className="job-icon-button"
        aria-label="Close editor"
        title="Close"
        onClick={close}
        disabled={busy}
      >
        <X size={17} aria-hidden />
      </button>
    </div>
  );
}

function retentionTriggerLabel(policy: SignatureRetentionPolicy): string {
  return policy.retention_trigger === "employment_end"
    ? "Employment end"
    : "Acknowledged date";
}

function RetentionPolicyFooterActions({
  policy,
  confirmAction,
  setConfirmAction,
  confirmDelete,
  setConfirmDelete,
  busy,
  approve,
  unapprove,
  deletePolicy,
}: {
  readonly policy: SignatureRetentionPolicy;
  readonly confirmAction: {
    type: "approve" | "publish" | "unapprove" | "unpublish";
    id: string;
  } | null;
  readonly setConfirmAction: (
    value: {
      type: "approve" | "publish" | "unapprove" | "unpublish";
      id: string;
    } | null,
  ) => void;
  readonly confirmDelete: boolean;
  readonly setConfirmDelete: (value: boolean) => void;
  readonly busy: boolean;
  readonly approve: (id: string) => void;
  readonly unapprove: (id: string) => void;
  readonly deletePolicy: (id: string) => void;
}) {
  if (policy.archived_at) return <span />;

  const statusAction =
    policy.status === "approved"
      ? {
          type: "unapprove" as const,
          label: "Unapprove",
          confirm: "Confirm unapprove",
          run: unapprove,
        }
      : {
          type: "approve" as const,
          label: "Approve",
          confirm: "Confirm approval",
          run: approve,
        };
  const isConfirmingStatus =
    confirmAction?.type === statusAction.type && confirmAction.id === policy.id;

  if (confirmDelete) {
    return (
      <div
        className="catalog-delete-confirm policy-footer-confirm"
        role="group"
      >
        <div className="catalog-delete-copy" aria-live="polite">
          <strong>Delete "{policy.name}"?</strong>
          <span>
            This policy will be archived and hidden from active policy choices.
          </span>
        </div>
        <div className="catalog-delete-buttons">
          <button
            type="button"
            className="job-secondary-button"
            disabled={busy}
            onClick={() => setConfirmDelete(false)}
          >
            Keep policy
          </button>
          <button
            type="button"
            className="catalog-delete-confirm-button"
            disabled={busy}
            onClick={() => deletePolicy(policy.id)}
          >
            Delete policy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="policy-footer-actions">
      {isConfirmingStatus ? (
        <>
          <button
            type="button"
            className="job-secondary-button"
            disabled={busy}
            onClick={() => setConfirmAction(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="job-primary-button"
            disabled={busy}
            onClick={() => statusAction.run(policy.id)}
          >
            {statusAction.confirm}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="job-secondary-button"
          disabled={busy}
          onClick={() =>
            setConfirmAction({ type: statusAction.type, id: policy.id })
          }
        >
          {statusAction.label}
        </button>
      )}
      <button
        type="button"
        className="catalog-delete-trigger"
        disabled={busy}
        onClick={() => {
          setConfirmAction(null);
          setConfirmDelete(true);
        }}
      >
        Delete policy
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
  readonly confirmAction: {
    type: "approve" | "publish" | "unapprove" | "unpublish";
    id: string;
  } | null;
  readonly setConfirmAction: (
    value: {
      type: "approve" | "publish" | "unapprove" | "unpublish";
      id: string;
    } | null,
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
    <div className="job-catalog" aria-label="Retention policies">
      <div className="job-column-headings acknowledgement-catalog-row">
        <span>Policy</span>
        <span>Trigger</span>
        <span>Status</span>
        <span />
      </div>
      {policies.map((policy) => (
        <div
          className="job-catalog-row acknowledgement-catalog-row"
          key={policy.id}
          data-archived={Boolean(policy.archived_at)}
        >
          <button
            type="button"
            className="job-row-identity"
            disabled={!canManage || Boolean(policy.archived_at)}
            onClick={() => edit(policy)}
          >
            <span className="document-catalog-marker" aria-hidden>
              <BookOpenCheck size={16} />
            </span>
            <span className="job-name-stack">
              <span className="job-row-name" title={policy.name}>
                {policy.name}
              </span>
              <span
                className="document-catalog-description"
                title={policy.jurisdiction_scope}
              >
                {policy.jurisdiction_scope}
              </span>
              <span className="job-mobile-meta">
                {retentionTriggerLabel(policy)} -{" "}
                {policy.duration_days.toLocaleString()} days
              </span>
            </span>
          </button>
          <span className="job-department-cell">
            {retentionTriggerLabel(policy)}
          </span>
          <span
            className={`job-count-pill${policy.status === "approved" ? " approved" : ""}`}
          >
            {policy.archived_at
              ? "Archived"
              : policy.status === "approved"
                ? "Approved"
                : "Draft"}
          </span>
          {canManage ? (
            <CatalogRowMenu name={policy.name}>
              {policy.status === "draft" && !policy.archived_at ? (
                <>
                  {confirmAction?.type === "approve" &&
                  confirmAction.id === policy.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmAction(null)}
                      >
                        Cancel
                      </button>
                      <button type="button" onClick={() => approve(policy.id)}>
                        Confirm approval
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmAction({ type: "approve", id: policy.id })
                      }
                    >
                      Approve policy
                    </button>
                  )}
                  <button type="button" onClick={() => edit(policy)}>
                    Edit policy
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className={policy.archived_at ? undefined : "job-danger-text"}
                onClick={() => archive(policy.id, !policy.archived_at)}
              >
                {policy.archived_at ? "Restore" : "Archive"}
              </button>
            </CatalogRowMenu>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TemplateFooterActions({
  template,
  draft,
  published,
  confirmAction,
  setConfirmAction,
  confirmDelete,
  setConfirmDelete,
  busy,
  publish,
  unpublish,
  deleteTemplate,
}: {
  readonly template: SignatureTemplate;
  readonly draft?: SignatureTemplateVersion;
  readonly published?: SignatureTemplateVersion;
  readonly confirmAction: {
    type: "approve" | "publish" | "unapprove" | "unpublish";
    id: string;
  } | null;
  readonly setConfirmAction: (
    value: {
      type: "approve" | "publish" | "unapprove" | "unpublish";
      id: string;
    } | null,
  ) => void;
  readonly confirmDelete: boolean;
  readonly setConfirmDelete: (value: boolean) => void;
  readonly busy: boolean;
  readonly publish: (id: string) => void;
  readonly unpublish: (id: string) => void;
  readonly deleteTemplate: (id: string) => void;
}) {
  if (template.archived_at) return <span />;

  const statusAction = draft
    ? {
        type: "publish" as const,
        label: "Publish",
        confirm: "Confirm publish",
        run: publish,
      }
    : published
      ? {
          type: "unpublish" as const,
          label: "Unpublish",
          confirm: "Confirm unpublish",
          run: unpublish,
        }
      : null;
  const isConfirmingStatus =
    statusAction &&
    confirmAction?.type === statusAction.type &&
    confirmAction.id === template.id;

  if (confirmDelete) {
    return (
      <div
        className="catalog-delete-confirm policy-footer-confirm"
        role="group"
      >
        <div className="catalog-delete-copy" aria-live="polite">
          <strong>Delete "{template.name}"?</strong>
          <span>
            This acknowledgement will be archived and hidden from active
            choices.
          </span>
        </div>
        <div className="catalog-delete-buttons">
          <button
            type="button"
            className="job-secondary-button"
            disabled={busy}
            onClick={() => setConfirmDelete(false)}
          >
            Keep acknowledgement
          </button>
          <button
            type="button"
            className="catalog-delete-confirm-button"
            disabled={busy}
            onClick={() => deleteTemplate(template.id)}
          >
            Delete acknowledgement
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="policy-footer-actions">
      {statusAction ? (
        isConfirmingStatus ? (
          <>
            <button
              type="button"
              className="job-secondary-button"
              disabled={busy}
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="job-primary-button"
              disabled={busy}
              onClick={() => statusAction.run(template.id)}
            >
              {statusAction.confirm}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="job-secondary-button"
            disabled={busy}
            onClick={() =>
              setConfirmAction({ type: statusAction.type, id: template.id })
            }
          >
            {statusAction.label}
          </button>
        )
      ) : null}
      <button
        type="button"
        className="catalog-delete-trigger"
        disabled={busy}
        onClick={() => {
          setConfirmAction(null);
          setConfirmDelete(true);
        }}
      >
        Delete acknowledgement
      </button>
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
  readonly confirmAction: {
    type: "approve" | "publish" | "unapprove" | "unpublish";
    id: string;
  } | null;
  readonly setConfirmAction: (
    value: {
      type: "approve" | "publish" | "unapprove" | "unpublish";
      id: string;
    } | null,
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
    <div className="job-catalog" aria-label="Acknowledgement templates">
      <div className="job-column-headings acknowledgement-catalog-row">
        <span>Template</span>
        <span>Version</span>
        <span>Status</span>
        <span />
      </div>
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
            className="job-catalog-row acknowledgement-catalog-row"
            key={template.id}
            data-archived={Boolean(template.archived_at)}
          >
            <button
              type="button"
              className="job-row-identity"
              disabled={!canManage || Boolean(template.archived_at)}
              onClick={() => edit(template)}
            >
              <span className="document-catalog-marker" aria-hidden>
                <FileCheck2 size={16} />
              </span>
              <span className="job-name-stack">
                <span className="job-row-name" title={template.name}>
                  {template.name}
                </span>
                <span
                  className="document-catalog-description"
                  title={policy?.name ?? "Missing retention policy"}
                >
                  {policy?.name ?? "Missing retention policy"}
                </span>
                <span className="job-mobile-meta">
                  {current
                    ? `${current.status === "draft" ? "Draft" : "Published"} v${current.version_number} - ${current.locale}`
                    : "No version"}
                </span>
              </span>
            </button>
            <span className="job-department-cell">
              {current
                ? `v${current.version_number} - ${current.locale} - ${current.effective_date}`
                : "No version"}
            </span>
            <span
              className={`job-count-pill${published && !draft ? " approved" : ""}`}
            >
              {template.archived_at
                ? "Archived"
                : draft
                  ? "Draft"
                  : "Published"}
            </span>
            <CatalogRowMenu name={template.name}>
              {current ? (
                <button type="button" onClick={() => preview(current)}>
                  Preview template
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
                          onClick={() => setConfirmAction(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => publish(template.id)}
                        >
                          Confirm publish
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({ type: "publish", id: template.id })
                        }
                      >
                        Publish template
                      </button>
                    )
                  ) : null}
                  {!template.archived_at ? (
                    <button type="button" onClick={() => edit(template)}>
                      Edit template
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={
                      template.archived_at ? undefined : "job-danger-text"
                    }
                    onClick={() => archive(template.id, !template.archived_at)}
                  >
                    {template.archived_at ? "Restore" : "Archive"}
                  </button>
                </>
              ) : null}
            </CatalogRowMenu>
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
