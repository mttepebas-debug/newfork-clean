import { type ReactNode } from "react";
import { PrivacyChoices } from "./PrivacyChoices";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function SiteLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="site-main">
        {children}
      </main>
      <SiteFooter />
      <PrivacyChoices />
    </>
  );
}
