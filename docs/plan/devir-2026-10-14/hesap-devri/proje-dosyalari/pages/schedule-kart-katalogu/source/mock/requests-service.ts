// Demo backend for the requests area: Requests > Time off and the time-off
// commands (apps/api schedule-requests-routes.ts, time-off/*). Shift changes
// are answered by the hub area (hub-service.ts), as in the API.
import type { Handler } from "./api";
import {
  decideTimeOff, requestCancellation, requestsReadModel, revokeTimeOff, shortenTimeOff, submitTimeOff,
} from "./requests-time-off";

export function requestsRoutes(route: (method: string, path: string, handler: Handler) => void): void {
  // The web reads the queue from the unprefixed path; the prefixed one is the same read.
  route("GET", "/schedule/requests", ({ query }) => requestsReadModel(query));
  route("GET", "/v1/workspaces/:workspaceId/schedule/requests", ({ query }) => requestsReadModel(query));

  route("POST", "/v1/workspaces/:workspaceId/time-off", ({ body }) => submitTimeOff(body));
  route("POST", "/v1/workspaces/:workspaceId/time-off/:requestId/cancellation", ({ params, body }) => requestCancellation(params.requestId, body));
  route("POST", "/v1/workspaces/:workspaceId/time-off/:requestId/verdict", ({ params, body }) => decideTimeOff(params.requestId, body));
  route("POST", "/v1/workspaces/:workspaceId/time-off/:requestId/revoke", ({ params, body }) => revokeTimeOff(params.requestId, body));
  route("POST", "/v1/workspaces/:workspaceId/time-off/:requestId/shorten", ({ params, body }) => shortenTimeOff(params.requestId, body));
}
