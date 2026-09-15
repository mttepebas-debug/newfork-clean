import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  activeNotificationCatalogEntries,
  notificationCatalog,
  notificationCatalogEntrySchema,
  notificationCatalogSeed,
  notificationEventClassSchema,
  notificationProducerInventory,
  notificationTemplateManifest,
} from "./notification-catalog";
import {
  displayForNotificationCategory,
  displayForNotificationType,
  notificationCategoryDisplay,
  notificationTypeDisplay,
} from "./notification-display";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("notification catalog governance", () => {
  it("has unique, schema-valid keys and safe application routes", () => {
    const entries = Object.values(notificationCatalog);
    const keys = entries.map((entry) => entry.type_key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of entries) {
      expect(notificationCatalogEntrySchema.parse(entry)).toEqual(entry);
      expect(entry.action_route_contract.route).toMatch(/^\/app(?:\/|$)/);
      expect(entry.action_route_contract.route).not.toMatch(/^[a-z]+:\/\//i);
    }
  });

  it("locks the eight approved event classes", () => {
    expect(notificationEventClassSchema.options).toEqual([
      "security",
      "schedule",
      "requests",
      "time_tracking",
      "payroll",
      "people",
      "communications",
      "system",
    ]);
  });

  it("keeps the catalog seed manifest in exact parity", () => {
    const catalogRows = Object.values(notificationCatalog)
      .map(
        (entry) =>
          [entry.type_key, entry.schema_version, entry.lifecycle] as const,
      )
      .sort(([left], [right]) => left.localeCompare(right));

    expect(notificationCatalogSeed).toEqual(catalogRows);

    const catalogSeedMigrations = [
      "20260908110000_notification_platform_core.sql",
      "20260908175000_document_expiry_schedule_conflict_preview.sql",
      "20260909013000_lineup_staffing_notification_inbox.sql",
      "20260914115233_account_security_deletion_lifecycle.sql",
    ];
    const catalogSeedSection = catalogSeedMigrations
      .flatMap((migration) => {
        const sql = readFileSync(
          resolve(repositoryRoot, "supabase/migrations", migration),
          "utf8",
        );
        return [
          ...sql.matchAll(
            /insert into public\.notification_catalog[\s\S]*?;/gi,
          ),
        ].map((match) => match[0]);
      })
      .join("\n");
    const sqlSeedKeys = [
      ...catalogSeedSection.matchAll(
        /^\s*'([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)', 1,/gm,
      ),
    ]
      .map((match) => match[1])
      .sort();

    expect(sqlSeedKeys).toEqual(catalogRows.map(([typeKey]) => typeKey));
  });

  it("inventories every logical current producer", () => {
    expect(
      notificationProducerInventory.map((item) => item.type_key).sort(),
    ).toEqual(Object.keys(notificationCatalog).sort());
    expect(
      new Set(notificationProducerInventory.map((item) => item.producer_id))
        .size,
    ).toBe(notificationProducerInventory.length);

    const expectedInsertCounts = new Map<string, number>([
      ["20260823100000_communication_operations.sql", 4],
      ["20260827100000_time_corrections_review.sql", 2],
      [
        "20260908105000_restore_schedule_publish_notification_actor_binding.sql",
        1,
      ],
      ["20260908112000_notification_outbox_relay.sql", 0],
      ["20260908121000_notification_request_producers_v1.sql", 0],
      ["20260908122000_notification_announcement_producer_v1.sql", 0],
      ["20260908123000_notification_time_correction_producers_v1.sql", 0],
      ["20260908175000_document_expiry_schedule_conflict_preview.sql", 0],
    ]);

    for (const [migration, expectedCount] of expectedInsertCounts) {
      const sql = readFileSync(
        resolve(repositoryRoot, "supabase/migrations", migration),
        "utf8",
      );
      expect(
        sql.match(/insert into public\.notifications/gi) ?? [],
      ).toHaveLength(expectedCount);
      for (const producer of notificationProducerInventory.filter(
        (item) => item.source_migration === migration,
      )) {
        expect(sql).toContain(producer.source_function);
      }
    }

    for (const producer of notificationProducerInventory) {
      if (producer.integration_status !== "outbox_v1") continue;
      const sql = readFileSync(
        resolve(
          repositoryRoot,
          "supabase/migrations",
          producer.source_migration,
        ),
        "utf8",
      );
      expect(sql).toContain(producer.source_function);
      expect(sql).toContain("notification_outbox");
    }
  });

  it("requires active types to have an outbox producer and template", () => {
    const templateKeys = new Set<string>(notificationTemplateManifest);
    for (const entry of activeNotificationCatalogEntries()) {
      expect(templateKeys.has(entry.template_key)).toBe(true);
      expect(
        notificationProducerInventory.some(
          (producer) =>
            producer.type_key === entry.type_key &&
            producer.integration_status === "outbox_v1",
        ),
      ).toBe(true);
      expect(entry.action_route_contract.route).toMatch(/^\/app(?:\/|$)/);
    }
  });

  it("requires every active notification type to have customer-facing display copy", () => {
    expect(Object.keys(notificationTypeDisplay).sort()).toEqual(
      Object.keys(notificationCatalog).sort(),
    );
    expect(Object.keys(notificationCategoryDisplay).sort()).toEqual(
      [...notificationEventClassSchema.options].sort(),
    );

    for (const entry of activeNotificationCatalogEntries()) {
      const display = displayForNotificationType(entry.type_key);
      expect(display).not.toBeNull();
      if (!display) continue;
      expect(display.label).not.toContain(".");
      expect(display.description.length).toBeGreaterThan(20);
      expect(display.categoryLabel).toBe(
        displayForNotificationCategory(entry.category).label,
      );
      expect(display.actionLabel.length).toBeGreaterThan(4);
      expect(display.audienceLabel.length).toBeGreaterThan(8);
    }
  });

  it("has no mandatory notification-orchestration SaaS dependency", () => {
    const manifests = [
      "package.json",
      "apps/api/package.json",
      "apps/web/package.json",
      "packages/shared/package.json",
    ].map((path) => readFileSync(resolve(repositoryRoot, path), "utf8"));
    const forbiddenPackages = [
      "@knocklabs/",
      "@novu/",
      "@trycourier/",
      "onesignal-node",
      "react-onesignal",
    ];

    for (const packageName of forbiddenPackages) {
      expect(manifests.join("\n")).not.toContain(`\"${packageName}`);
    }
  });
});
