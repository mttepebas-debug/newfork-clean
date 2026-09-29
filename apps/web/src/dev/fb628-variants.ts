/**
 * FB-6.2.8 visual variants, DEV only. `?v8=a|b|c` shows that letter for all
 * three pieces (Remove from <location>, Manages, employee view); `?v8=off`
 * goes back to the screen as it is on main. Remembered for the tab so the
 * switch to the employee view keeps it. Production always gets null.
 *
 * ponytail: delete this file and every `v8` branch once the user has picked.
 */
export type V8 = "a" | "b" | "c";

const key = "newfork.v8";

function valid(value: string | null): value is V8 {
  return value === "a" || value === "b" || value === "c";
}

export function v8(): V8 | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("v8");
  try {
    if (fromUrl === "off") {
      window.sessionStorage.removeItem(key);
      return null;
    }
    if (valid(fromUrl)) {
      window.sessionStorage.setItem(key, fromUrl);
      return fromUrl;
    }
    const remembered = window.sessionStorage.getItem(key);
    return valid(remembered) ? remembered : null;
  } catch {
    return valid(fromUrl) ? fromUrl : null;
  }
}
