// Regenerates src/product/icons.tsx from the lucide-react package apps/web uses,
// so the illustrations keep drawing the same icons as the app.
// Usage: node scripts/gen-product-icons.mjs  (add names to the list below)
import {readFileSync, writeFileSync, existsSync} from "fs";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
const here = path.dirname(fileURLToPath(import.meta.url));
const store = path.resolve(here, "../../../node_modules/.pnpm");
const pkg = readdirSync(store).find((name) => name.startsWith("lucide-react@"));
if (!pkg) throw new Error("lucide-react not installed (run pnpm install)");
const L = path.join(store, pkg, "node_modules/lucide-react");
const outFile = path.resolve(here, "../src/product/icons.tsx");
const names=["layout-dashboard","calendar-days","message-square-warning","users","file-text","calendar-check","house","clipboard-list","megaphone","bell","settings","chevron-left","chevron-right","chevron-down","map-pin","clock","briefcase","sliders-horizontal","eye-off","file-down","layout-template","send","check","pencil","cloud-off","lock","plus","x","arrow-left-right","shield-alert","circle-check","upload","triangle-alert","calendar","hand","user-round","file-check","file-clock","file-x","message-square","refresh-cw","undo-2","wand-sparkles","copy","search","log-in","arrow-right","menu","mail","phone","shield-check","printer","file-pen-line","signature","pen-line","eye","circle-alert","calendar-x","calendar-plus","building-2","circle-user-round","inbox","list-checks","badge-check","ellipsis","arrow-up-right","lightbulb","layout-grid","clock-3","calendar-off","scissors","history","bell-ring","circle"];
const out=[];
for (const n of names){
  const f=`${L}/dist/esm/icons/${n}.js`;
  if(!existsSync(f)){console.error("missing",n);continue}
  const s=readFileSync(f,"utf8");
  const m=s.match(/createLucideIcon\("(\w+)", (\[[\s\S]*?\])\);\n/);
  if(!m){console.error("noparse",n);continue}
  const nodes=eval(m[2]).map(([tag,attrs])=>{const {key,...rest}=attrs;return [tag,rest]});
  out.push([m[1],nodes]);
}
const version = JSON.parse(readFileSync(L+"/package.json","utf8")).version;
let ts=`// Icons as drawn in the app (lucide-react ${version}, which apps/web uses), copied
// as path data so the product illustrations match the real screens without
// the runtime package. Lucide is ISC-licensed:
//   Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as
//   part of Feather (MIT). All other copyright (c) for Lucide are held by
//   Lucide Contributors 2022. Permission to use, copy, modify, and/or
//   distribute this software for any purpose with or without fee is hereby
//   granted, provided that the above copyright notice and this permission
//   notice appear in all copies.

import { createElement, type SVGProps } from "react";

type IconNode = readonly (readonly [string, Readonly<Record<string, string>>])[];

const NODES = {\n`;
for (const [name,nodes] of out) ts+=`  ${name}: ${JSON.stringify(nodes)},\n`;
ts+=`} as const satisfies Record<string, IconNode>;

export type IconName = keyof typeof NODES;

type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "name"> & {
  readonly name: IconName;
  readonly size?: number | string;
  readonly strokeWidth?: number;
};

/** Decorative by default; pass aria-label (and role="img") when it carries meaning. */
export function Icon({ name, size = "1em", strokeWidth = 2, ...rest }: IconProps) {
  const labelled = rest["aria-label"] !== undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      {...rest}
    >
      {NODES[name].map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  );
}
`;
writeFileSync(outFile, ts);
console.log(out.length, "icons:", out.map(o=>o[0]).join(" "));
