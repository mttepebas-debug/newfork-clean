import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { documentTitle } from "../seo/head";
import { breadcrumbTrail, findRoute, NOT_FOUND_ROUTE, ROUTES } from "../site/routes";

describe("site routes", () => {
  it("has one entry per path and a page module for each", () => {
    const paths = ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const route of [...ROUTES, NOT_FOUND_ROUTE]) {
      expect(existsSync(resolve(__dirname, "../pages", `${route.page}.tsx`)), route.page).toBe(true);
    }
  });

  it("keeps titles and descriptions inside what search results show", () => {
    for (const route of ROUTES) {
      expect(documentTitle(route).length, route.path).toBeLessThanOrEqual(70);
      expect(route.description.length, route.path).toBeGreaterThanOrEqual(50);
      expect(route.description.length, route.path).toBeLessThanOrEqual(230);
    }
  });

  it("resolves trailing slashes and unknown paths", () => {
    expect(findRoute("/pricing/").path).toBe("/pricing");
    expect(findRoute("/nope")).toBe(NOT_FOUND_ROUTE);
  });

  it("puts legal pages under the legal hub in breadcrumbs", () => {
    const trail = breadcrumbTrail(findRoute("/privacy")).map((route) => route.path);
    expect(trail).toEqual(["/", "/legal", "/privacy"]);
    expect(breadcrumbTrail(findRoute("/"))).toEqual([]);
  });
});
