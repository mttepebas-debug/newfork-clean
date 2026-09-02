export function ScheduleState({
  detail,
  error = false,
  title,
}: {
  readonly detail: string;
  readonly error?: boolean;
  readonly title: string;
}) {
  return (
    <section className="schedule-state" role={error ? "alert" : "status"}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </section>
  );
}
