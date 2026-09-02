export function scrollScheduleEmployeeRowIntoView(
  employeeId: string,
  root: ParentNode = document,
): void {
  const row = Array.from(
    root.querySelectorAll<HTMLElement>("[data-schedule-employee-row]"),
  ).find((element) => element.dataset.scheduleEmployeeRow === employeeId);

  row?.scrollIntoView({
    block: "center",
    inline: "nearest",
    behavior: "smooth",
  });
}
