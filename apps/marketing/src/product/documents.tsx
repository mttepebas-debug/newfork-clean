// Documents (Employees → Documents, Account → Documents, onboarding) drawn
// from apps/web/src/documents. Statuses are the app's own list.

import { type HTMLAttributes } from "react";
import { Icon } from "./icons";

type Div = HTMLAttributes<HTMLDivElement>;

export type DocStatus =
  | "Completed"
  | "On file"
  | "Missing"
  | "Expired"
  | "Rejected"
  | "Needs review"
  | "Grace period"
  | "Exempt";

const TONE: Record<DocStatus, string> = {
  Completed: "list-chip--green",
  "On file": "list-chip--green",
  Missing: "list-chip--red",
  Expired: "list-chip--red",
  Rejected: "list-chip--red",
  "Needs review": "list-chip--amber",
  "Grace period": "list-chip--amber",
  Exempt: "",
};

export function DocChip({ status, ...rest }: HTMLAttributes<HTMLSpanElement> & { readonly status: DocStatus }) {
  return (
    <span className={["list-chip", TONE[status]].filter(Boolean).join(" ")} {...rest}>
      {status}
    </span>
  );
}

export function DocTableHead() {
  return (
    <div className="doc-table__head">
      <span>Employee</span>
      <span>Document</span>
      <span>Status</span>
    </div>
  );
}

type DocRowProps = Div & {
  readonly employee: string;
  readonly location: string;
  readonly document: string;
  readonly detail?: string;
  readonly status: DocStatus;
};

export function DocRow({ employee, location, document, detail, status, className, ...rest }: DocRowProps) {
  return (
    <div className={["doc-row", className].filter(Boolean).join(" ")} {...rest}>
      <span>
        {employee}
        <small>{location}</small>
      </span>
      <span className="doc-row__doc">
        <Icon name="FileText" />
        <span>
          {document}
          {detail ? <small>{detail}</small> : null}
        </span>
      </span>
      <DocChip status={status} />
    </div>
  );
}

type PolicyProps = Div & {
  readonly title: string;
  readonly text: string;
  readonly typedName?: string;
  readonly checked?: boolean;
};

/** Policy acknowledgement: read, tick the intent statement, type your full name. */
export function PolicyAcknowledgement({ title, text, typedName = "", checked = true, className, ...rest }: PolicyProps) {
  return (
    <div className={["policy", className].filter(Boolean).join(" ")} {...rest}>
      <span className="policy__title">{title}</span>
      <span className="policy__text">{text}</span>
      <span className="policy__intent">
        <span className="app-check" style={checked ? undefined : { background: "#fff", boxShadow: "inset 0 0 0 calc(1 * var(--u)) var(--app-border-strong)" }}>
          {checked ? <Icon name="Check" /> : null}
        </span>
        I acknowledge that I received and reviewed this policy.
      </span>
      <span className="policy__field">
        Type your full name
        <span className="policy__input">
          {typedName}
          <span className="policy__caret" />
        </span>
      </span>
      <span className="app-btn app-btn--primary">Acknowledge policy</span>
    </div>
  );
}

export function UploadCard(props: Div) {
  return (
    <div className="upload-card" {...props}>
      <Icon name="Upload" />
      <strong>Choose a file</strong>
      <span>PDF, JPEG, PNG, WEBP, up to 10 MB. A photo of the document is fine.</span>
    </div>
  );
}
