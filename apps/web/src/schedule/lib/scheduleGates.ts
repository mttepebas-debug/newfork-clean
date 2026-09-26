import type { ActiveWorkspaceContext } from "@newfork/shared";

import { can } from "../../auth/can";

/**
 * What the Schedule screen offers, each answered by the authorization core.
 * No target: "may they do it somewhere" (app_private.actor_actions), so a
 * manager with no location gets no actions. The API still decides each call.
 */
export function scheduleGates(context: ActiveWorkspaceContext | null | undefined) {
  return {
    edit: can(context, "schedule.edit"),
    publish: can(context, "schedule.publish"),
    export: can(context, "schedule.export"),
    templates: can(context, "schedule.templates"),
    // The logo is written to the workspace row and its storage folder, which
    // RLS opens on settings.general.manage: settings.organization.write.
    manageLogo: can(context, "settings.organization.write"),
    manageLocations: can(context, "settings.locations.write"),
  };
}
