// Stands in for apps/web/src/schedule/components/ScheduleTemplateDialogs on
// the test page: shows main's window or one of the Stage 2 prototypes,
// whichever the "Test page" menu has chosen.
import { ScheduleTemplatesDialog as Today } from "../../../src/schedule/components/ScheduleTemplateDialogs";
import { useVariant } from "./store";
import type { TemplatesDialogProps } from "./shared";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import "./templates.css";

export { TEMPLATE_NO_DEPARTMENT_KEY } from "./shared";

export function ScheduleTemplatesDialog(props: TemplatesDialogProps) {
  const variant = useVariant();
  if (variant === "a") return <VariantA {...props} />;
  if (variant === "b") return <VariantB {...props} />;
  if (variant === "c") return <VariantC {...props} />;
  return <Today {...props} />;
}
