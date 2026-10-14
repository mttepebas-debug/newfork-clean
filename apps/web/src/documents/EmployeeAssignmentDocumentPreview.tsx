import { useQuery } from "@tanstack/react-query";
import { previewEmployeeDocumentAssignments } from "./document-data";
import { LinesOutline, LoadError } from "../shell/LoadState";

export function useEmployeeDocumentAssignmentPreview(input: {
  enabled: boolean;
  workspaceId: string;
  employeeId: string;
  actorId: string;
  locationIds: string[];
  jobIds: string[];
}) {
  const locations = [...new Set(input.locationIds)].sort();
  const jobs = [...new Set(input.jobIds)].sort();
  return useQuery({
    queryKey: [
      "document-assignment-preview",
      input.actorId,
      input.workspaceId,
      input.employeeId,
      locations,
      jobs,
    ],
    queryFn: () =>
      previewEmployeeDocumentAssignments(
        input.workspaceId,
        input.employeeId,
        locations,
        jobs,
      ),
    enabled: input.enabled,
    retry: false,
    staleTime: 0,
  });
}
export function EmployeeAssignmentDocumentPreview({
  query,
}: {
  query: ReturnType<typeof useEmployeeDocumentAssignmentPreview>;
}) {
  return (
    <section aria-label="Document assignment impact">
      <h3>Document assignment impact</h3>
      {query.isFetching ? (
        <LinesOutline label="Checking document requirements" lines={2} />
      ) : query.error ? (
        <LoadError
          inset
          level={3}
          title="We couldn't check document requirements"
          detail="The document check didn't load. Nothing was changed."
          onRetry={() => void query.refetch()}
        />
      ) : query.data?.length ? (
        <ul>
          {query.data.map((item, index) => (
            <li key={index}>
              {item.title}:{" "}
              {item.action === "remove"
                ? "request closes"
                : item.action === "reopen"
                  ? "request reopens"
                  : "new request"}
              {item.clears_block ? "; its access restriction clears" : ""}
              {item.deadline_at ? `; ${item.period_days} days from saving` : ""}
              .
            </li>
          ))}
        </ul>
      ) : (
        <p>No document requirements will change.</p>
      )}
      <p>These changes apply when you save the employee.</p>
    </section>
  );
}
