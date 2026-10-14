/** A quiet line where the grid would be, e.g. when a filter leaves no location. */
export function ScheduleState({
  detail,
  title,
}: {
  readonly detail: string;
  readonly title: string;
}) {
  return (
    <section className="schedule-state" role="status">
      <strong>{title}</strong>
      <span>{detail}</span>
    </section>
  );
}
