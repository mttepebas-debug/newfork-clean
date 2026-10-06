import { buildHead, renderHead, safeJson } from "../seo/head";
import { findRoute, NOT_FOUND_ROUTE } from "../site/routes";

describe("head", () => {
  it("gives indexable pages a canonical URL and social cards", () => {
    const html = renderHead(buildHead(findRoute("/pricing")));
    expect(html).toContain('rel="canonical" href="https://newfork.example/pricing"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain("index, follow");
  });

  it("keeps the 404 page out of the index", () => {
    const html = renderHead(buildHead(NOT_FOUND_ROUTE));
    expect(html).toContain("noindex");
    expect(html).not.toContain("canonical");
  });

  it("emits Organization, WebSite and SoftwareApplication on the home page", () => {
    const tags = buildHead(findRoute("/"));
    const types = tags.flatMap((tag) =>
      tag.kind === "jsonld" ? [(tag.json as { "@type": string })["@type"]] : [],
    );
    expect(types).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
  });

  it("never lets JSON-LD close its script tag", () => {
    expect(safeJson({ text: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
