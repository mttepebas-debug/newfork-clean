import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260908112000_notification_outbox_relay.sql",
  ),
  "utf8",
);
const resolverMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260908114000_notification_in_app_policy_resolver.sql",
  ),
  "utf8",
);
const workspaceRevalidationMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260908164000_notification_outbox_workspace_revalidation.sql",
  ),
  "utf8",
);

describe("notification outbox relay migration", () => {
  it("binds recipient selection to the schedule publish transaction", () => {
    expect(migration).toMatch(
      /create or replace function public\.publish_schedule_draft_service\([\s\S]*target_notify_employee_ids uuid\[\]/i,
    );
    expect(migration).toMatch(
      /result := public\.publish_schedule_draft_service\(/i,
    );
    expect(migration).toMatch(
      /perform public\.enqueue_notification_outbox_service\(/i,
    );
  });

  it("leases bounded work with skip-locked crash recovery", () => {
    expect(migration).toMatch(/for update skip locked/i);
    expect(migration).toMatch(/outbox\.lease_expires_at <= now\(\)/i);
    expect(migration).toMatch(/target_batch_size not between 1 and 100/i);
  });

  it("separates event, audience, and inbox projection stages", () => {
    expect(migration).toMatch(/project_notification_event_service/i);
    expect(migration).toMatch(
      /project_schedule_notification_recipients_service/i,
    );
    expect(migration).toMatch(/project_notification_inbox_service/i);
    expect(migration).toMatch(
      /on conflict \(recipient_projection_id\) do nothing/i,
    );
    expect(resolverMigration).toMatch(
      /resolve_notification_in_app_policy_v1_service/i,
    );
    expect(resolverMigration).toMatch(/reason_chain/i);
  });

  it("bounds poison retries and keeps worker RPCs service-only", () => {
    expect(migration).toMatch(
      /next_status := case when outbox\.attempt_count >= target_max_attempts then 'dead_letter'/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.lease_notification_outbox_service\(text, integer, integer\) to service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.lease_notification_outbox_service\(text, integer, integer\) from public, anon, authenticated/i,
    );
  });

  it("revalidates workspace lifecycle before projecting leased work", () => {
    expect(workspaceRevalidationMigration).toMatch(
      /app_private\.workspace_allows_interactive_access\(outbox\.workspace_id\)/i,
    );
    expect(workspaceRevalidationMigration).toMatch(
      /notification\.outbox\.cancelled_workspace/i,
    );
    expect(workspaceRevalidationMigration).toMatch(
      /grant execute on function public\.process_notification_outbox_service\(text, uuid\)\s*to service_role/i,
    );
  });
});
