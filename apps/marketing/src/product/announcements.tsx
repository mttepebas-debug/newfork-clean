// Announcements (apps/web/src/views/AnnouncementsPage.tsx): list, audience
// rule, the reader's Acknowledge button. There is no "N of M acknowledged"
// view in the app today, so none is drawn here.

import { type HTMLAttributes, type ReactNode } from "react";
import { Icon } from "./icons";

type Div = HTMLAttributes<HTMLDivElement>;

export function ListHeader({ eyebrow, title, lead }: { readonly eyebrow: string; readonly title: string; readonly lead: string }) {
  return (
    <div className="list-head">
      <span className="req-eyebrow">{eyebrow}</span>
      <span className="list-head__title">{title}</span>
      <span className="list-head__lead">{lead}</span>
    </div>
  );
}

export function AnnouncementTableHead({ reader }: { readonly reader?: boolean }) {
  return reader ? (
    <div className="ann-table__head">
      <span>Announcement</span>
      <span>Published by</span>
      <span>Published date</span>
      <span>Status</span>
    </div>
  ) : (
    <div className="ann-table__head">
      <span>Announcement</span>
      <span>Audience</span>
      <span>Status</span>
      <span>Publish date</span>
    </div>
  );
}

type AnnouncementRowProps = Div & {
  readonly title: string;
  readonly preview: string;
  readonly cells: readonly [ReactNode, ReactNode, ReactNode];
};

export function AnnouncementRow({ title, preview, cells, className, ...rest }: AnnouncementRowProps) {
  return (
    <div className={["ann-row", className].filter(Boolean).join(" ")} {...rest}>
      <span className="ann-row__title">
        <Icon name="Megaphone" />
        <span style={{ minWidth: 0 }}>
          <strong>{title}</strong>
          <small>{preview}</small>
        </span>
      </span>
      {cells[0]}
      {cells[1]}
      {cells[2]}
    </div>
  );
}

export function AcknowledgeButton(props: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className="ack-btn" {...props}>
      Acknowledge
    </span>
  );
}

export function Acknowledged({ date, ...rest }: HTMLAttributes<HTMLSpanElement> & { readonly date?: string }) {
  return (
    <span className="ack-done" title={date ? `Acknowledged ${date}` : "Acknowledged"} {...rest}>
      <Icon name="CircleCheck" />
      {date ? `Acknowledged ${date}` : null}
    </span>
  );
}

type Picker = { readonly label: string; readonly value: string; readonly count: string };

export function AudiencePickers({ pickers, ...rest }: Div & { readonly pickers: readonly Picker[] }) {
  return (
    <div className="audience" {...rest}>
      {pickers.map((picker) => (
        <span key={picker.label} className="audience__picker">
          <span className="audience__label">
            {picker.label}
            <span className="audience__count">{picker.count}</span>
          </span>
          <span className="audience__value">{picker.value}</span>
        </span>
      ))}
    </div>
  );
}

export function AppToast({ children, ...rest }: Div) {
  return (
    <div className="app-toast" role="presentation" {...rest}>
      <Icon name="CircleCheck" />
      {children}
    </div>
  );
}
