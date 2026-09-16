import { Navigate, useSearchParams } from "react-router";
import { documentObligationSchema } from "@newfork/shared";

export function documentNotificationDestination(search: URLSearchParams) {
  const query = new URLSearchParams();
  for (const key of ["workspace", "requirement"] as const) {
    const parsed = documentObligationSchema.shape.id.safeParse(search.get(key));
    if (parsed.success) query.set(key, parsed.data);
  }
  const kind = search.get("kind");
  if (kind === "document" || kind === "acknowledgement")
    query.set("kind", kind);
  return `/account/documents${query.size ? `?${query}` : ""}`;
}
export function DocumentNotificationRedirect() {
  const [search] = useSearchParams();
  return <Navigate replace to={documentNotificationDestination(search)} />;
}
