import { useAuth } from "../auth/AuthContext";
import { MemberAvatar } from "../avatar/MemberAvatar";
import { useOwnAvatar } from "../avatar/avatar-data";

/**
 * AVATAR-IKON (design 4.3): the signed-in person's avatar in the workspace they are in, a photo,
 * a drawing or the initials. Outside a workspace there is no avatar to read: the initials.
 */
export function AccountAvatar({ className, size }: { readonly className: string; readonly size: number }) {
  const { account, context } = useAuth();
  const own = useOwnAvatar(context?.workspace.id);
  return (
    <MemberAvatar
      key={context?.workspace.id ?? "none"}
      avatar={own.data?.avatar ?? null}
      name={account?.displayName ?? "Account"}
      size={size}
      className={className}
    />
  );
}

/** The app shell's person circle (rail, phone bars, phone menus). */
export function CurrentUserAvatar() {
  return <AccountAvatar className="current-user-avatar" size={24} />;
}
