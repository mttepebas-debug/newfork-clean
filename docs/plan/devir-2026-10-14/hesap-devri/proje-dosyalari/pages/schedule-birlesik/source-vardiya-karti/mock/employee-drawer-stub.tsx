// The employee card is the Employees screen, not Schedule: on this test page
// clicking a name says so and closes again.
import { useEffect } from "react";
import { notice } from "../harness";

export function EmployeeDrawer({ onClose }: { readonly onClose: () => void; readonly [key: string]: unknown }) {
  useEffect(() => {
    notice("Employee profiles are not part of this test page. Only Schedule works here.");
    onClose();
  }, [onClose]);
  return null;
}
