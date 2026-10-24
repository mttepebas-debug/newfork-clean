import { CurrentUserAvatar } from "../account/AccountAvatar";
import { PhoneNav, type PhoneNavLink } from "./PhoneNav";
import "./management-mobile-nav.css";

// The first pages sit in the bar; the rest, the view switch, Account and Sign out open under More.
const barSlots = 4;

/**
 * Phone navigation (720px and below) for owner, admin and manager (BL-192).
 * The links are the sidebar's own permission-filtered list, so a page the
 * person cannot open never shows here either.
 */
export function ManagementMobileNav({
  links,
  ownDocuments,
  viewSwitch,
  onSignOut,
}: {
  readonly links: readonly PhoneNavLink[];
  /** My documents, only when the workspace asks the person for any (MY-DOCUMENTS). */
  readonly ownDocuments?: PhoneNavLink | null;
  /** Employee view, for somebody who also works shifts; right above Account (Mert 2026-10-23). */
  readonly viewSwitch?: PhoneNavLink | null;
  readonly onSignOut: () => void;
}) {
  return (
    <PhoneNav
      label="Main navigation"
      bar={links.slice(0, barSlots)}
      more={[
        ...links.slice(barSlots),
        ...(ownDocuments ? [ownDocuments] : []),
        ...(viewSwitch ? [viewSwitch] : []),
        { to: "/account/profile", label: "Account", icon: CurrentUserAvatar },
      ]}
      onSignOut={onSignOut}
    />
  );
}
