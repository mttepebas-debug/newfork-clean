// PAGES setups for the sign-in, onboarding, workspace hub and account pages
// (tools/sc/10-giris-hesap.py). Each one changes freshly seeded demo data
// before the screen opens; scenarios.ts lists them with the others.
import { accountSetups } from "./account-service";
import { hubSetups } from "./hub-onboarding-hub";
import { ownerSetupSetups } from "./hub-onboarding-owner";
import { welcomeSetups } from "./onboarding-service";

// Every name carries a "g-" prefix, so it never meets another area's setup of the same name.
export const girisSetups: Record<string, () => void> = Object.fromEntries(Object.entries({
  // Sign-in pages open signed in (fake-supabase reads the setup's name).
  "signed-in": () => undefined,
  ...hubSetups,
  ...ownerSetupSetups,
  ...welcomeSetups,
  ...accountSetups,
}).map(([name, run]) => [`g-${name}`, run]));
