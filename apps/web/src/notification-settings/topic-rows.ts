import type { NotificationTopicPreference } from "@newfork/shared";

/**
 * A row in Account > Notifications: usually one topic; "My requests" is the
 * one place design A puts two together (time off and shift changes,
 * BILDIRIM-11b). The database still keeps a choice per topic, so a row's
 * toggle writes every topic in it.
 */
export interface TopicRow {
  readonly key: string;
  readonly name: string;
  readonly level: "important" | "optional";
  readonly description: string;
  readonly topics: readonly NotificationTopicPreference[];
}

const myRequests = {
  key: "my_requests",
  name: "My requests",
  parts: ["shift_changes", "time_off"],
} as const;

/** The rows for the topics the person can receive, in the database's order. */
export function topicRows(topics: readonly NotificationTopicPreference[]): TopicRow[] {
  const parts = topics.filter((topic) => (myRequests.parts as readonly string[]).includes(topic.key));
  const rows: TopicRow[] = [];
  for (const topic of topics) {
    if (parts.length < 2 || !parts.includes(topic)) {
      rows.push({ key: topic.key, name: topic.name, level: topic.level, description: topic.description, topics: [topic] });
    } else if (topic === parts[0]) {
      rows.push({
        key: myRequests.key,
        name: myRequests.name,
        level: parts.some((part) => part.level === "important") ? "important" : "optional",
        // The database's own lines, so the row cannot drift from them.
        description: parts.map((part) => part.description).join(" "),
        topics: parts,
      });
    }
  }
  return rows;
}

/** A row's box: ticked when every topic in it is on, mixed when only some are. */
export function rowState(values: readonly boolean[]): { readonly checked: boolean; readonly mixed: boolean } {
  const on = values.filter(Boolean).length;
  return { checked: on === values.length && on > 0, mixed: on > 0 && on < values.length };
}
