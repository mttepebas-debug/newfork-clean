// One description of a page's <head>, used twice: the prerenderer turns it
// into HTML, the browser applies it on client-side navigation. Both read the
// same function, so a page can never be indexed with one title and shown
// with another.

import { BRAND_NAME, SITE_URL } from "../site/config";
import { type SiteRoute } from "../site/routes";
import { structuredData } from "./structured-data";

export type HeadTag =
  | { readonly kind: "title"; readonly text: string }
  | { readonly kind: "meta"; readonly attrs: Readonly<Record<string, string>> }
  | { readonly kind: "link"; readonly attrs: Readonly<Record<string, string>> }
  | { readonly kind: "jsonld"; readonly json: unknown };

export const OG_IMAGE = {
  path: "/og/newfork-og.png",
  width: "1200",
  height: "630",
  alt: `${BRAND_NAME}: a restaurant schedule with shifts across two locations, published to the team's phones.`,
} as const;

export function absoluteUrl(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

export function documentTitle(route: SiteRoute): string {
  return route.path === "/"
    ? `${BRAND_NAME} — ${route.title}`
    : `${route.title} | ${BRAND_NAME}`;
}

export function buildHead(route: SiteRoute): HeadTag[] {
  const title = documentTitle(route);
  const url = absoluteUrl(route.path);
  const image = `${SITE_URL}${OG_IMAGE.path}`;
  const tags: HeadTag[] = [
    { kind: "title", text: title },
    { kind: "meta", attrs: { name: "description", content: route.description } },
    {
      kind: "meta",
      attrs: { name: "robots", content: route.noindex ? "noindex, follow" : "index, follow" },
    },
    { kind: "meta", attrs: { name: "theme-color", content: "#F4EFE6" } },
    { kind: "meta", attrs: { property: "og:type", content: "website" } },
    { kind: "meta", attrs: { property: "og:site_name", content: BRAND_NAME } },
    { kind: "meta", attrs: { property: "og:locale", content: "en_US" } },
    { kind: "meta", attrs: { property: "og:title", content: title } },
    { kind: "meta", attrs: { property: "og:description", content: route.description } },
    { kind: "meta", attrs: { property: "og:image", content: image } },
    { kind: "meta", attrs: { property: "og:image:width", content: OG_IMAGE.width } },
    { kind: "meta", attrs: { property: "og:image:height", content: OG_IMAGE.height } },
    { kind: "meta", attrs: { property: "og:image:alt", content: OG_IMAGE.alt } },
    { kind: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
    { kind: "meta", attrs: { name: "twitter:title", content: title } },
    { kind: "meta", attrs: { name: "twitter:description", content: route.description } },
    { kind: "meta", attrs: { name: "twitter:image", content: image } },
    { kind: "meta", attrs: { name: "twitter:image:alt", content: OG_IMAGE.alt } },
  ];
  if (!route.noindex) {
    tags.push({ kind: "meta", attrs: { property: "og:url", content: url } });
    tags.push({ kind: "link", attrs: { rel: "canonical", href: url } });
  }
  for (const json of structuredData(route)) tags.push({ kind: "jsonld", json });
  return tags;
}

const ATTR_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&"<>]/g, (char) => ATTR_ESCAPES[char] ?? char);
}

function attrs(record: Readonly<Record<string, string>>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(" ");
}

/** JSON inside <script> must never be able to close the tag. */
export function safeJson(json: unknown): string {
  return JSON.stringify(json)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function renderHead(tags: readonly HeadTag[]): string {
  return tags
    .map((tag) => {
      switch (tag.kind) {
        case "title":
          return `<title>${escapeHtml(tag.text)}</title>`;
        case "meta":
          return `<meta data-head ${attrs(tag.attrs)} />`;
        case "link":
          return `<link data-head ${attrs(tag.attrs)} />`;
        case "jsonld":
          return `<script data-head type="application/ld+json">${safeJson(tag.json)}</script>`;
      }
    })
    .join("\n    ");
}

/** Client-side navigation: swap the managed tags for the next page's. */
export function applyHead(tags: readonly HeadTag[]): void {
  const head = document.head;
  head.querySelectorAll("[data-head]").forEach((node) => node.remove());
  for (const tag of tags) {
    if (tag.kind === "title") {
      document.title = tag.text;
      continue;
    }
    const element =
      tag.kind === "jsonld"
        ? document.createElement("script")
        : document.createElement(tag.kind);
    element.setAttribute("data-head", "");
    if (tag.kind === "jsonld") {
      element.setAttribute("type", "application/ld+json");
      element.textContent = JSON.stringify(tag.json);
    } else {
      for (const [key, value] of Object.entries(tag.attrs)) element.setAttribute(key, value);
    }
    head.appendChild(element);
  }
}
