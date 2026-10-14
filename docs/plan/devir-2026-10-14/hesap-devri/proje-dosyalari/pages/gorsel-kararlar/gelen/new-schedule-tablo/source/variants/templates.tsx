// Stands in for apps/web/src/schedule/components/ScheduleTemplateDialogs.
// Original: main's Templates window. A and B: the window draws nothing; it
// hands its props (the page's own template list and save, rename, delete and
// apply handlers) to the New Schedule window.
import { useLayoutEffect } from "react";
import { ScheduleTemplatesDialog as Original } from "../../../src/schedule/components/ScheduleTemplateDialogs";
import { templatesSlot, type TemplatesProps } from "./bridge";
import { useChoice } from "./store";

export function ScheduleTemplatesDialog(props: TemplatesProps) {
  const choice = useChoice("newSchedule");
  useLayoutEffect(() => {
    if (choice === "original") return;
    templatesSlot.set(props);
  });
  useLayoutEffect(() => () => templatesSlot.set(null), []);
  return choice === "original" ? <Original {...props} /> : null;
}
