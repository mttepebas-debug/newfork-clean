// schema.org JSON-LD per page. Only facts the site states elsewhere: no
// ratings, no prices, no customer counts.

import { FAQ } from "../content/faq";
import { BRAND_NAME, SITE_DESCRIPTION, SITE_URL } from "../site/config";
import { breadcrumbTrail, type SiteRoute } from "../site/routes";

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const SOFTWARE_ID = `${SITE_URL}/#software`;

function url(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

export function organization() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: BRAND_NAME,
    url: url("/"),
    logo: `${SITE_URL}/icon-512.png`,
  };
}

export function website() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: BRAND_NAME,
    url: url("/"),
    inLanguage: "en-US",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export function softwareApplication() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: BRAND_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Restaurant employee scheduling",
    operatingSystem: "Web browser",
    description: SITE_DESCRIPTION,
    url: url("/"),
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export function faqPage() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.flatMap((category) =>
      category.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    ),
  };
}

export function breadcrumbList(route: SiteRoute) {
  const trail = breadcrumbTrail(route);
  if (trail.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      item: url(crumb.path),
    })),
  };
}

export function structuredData(route: SiteRoute): unknown[] {
  if (route.noindex) return [];
  const blocks: unknown[] = [];
  if (route.path === "/") blocks.push(organization(), website(), softwareApplication());
  if (route.path === "/product" || route.path === "/pricing") blocks.push(softwareApplication());
  if (route.path === "/faq" && FAQ.length > 0) blocks.push(faqPage());
  const crumbs = breadcrumbList(route);
  if (crumbs) blocks.push(crumbs);
  return blocks;
}
