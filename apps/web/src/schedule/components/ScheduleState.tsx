import { Button } from "@newfork/ui";

export function ScheduleState({
  detail,
  error = false,
  title,
  onRetry,
}: {
  readonly detail: string;
  readonly error?: boolean;
  readonly title: string;
  readonly onRetry?: () => void;
}) {
  return (
    <section className="schedule-state" role={error ? "alert" : "status"}>
      <strong>{title}</strong>
      <span>{detail}</span>
      {onRetry ? <Button onClick={onRetry}>Retry</Button> : null}
    </section>
  );
}
