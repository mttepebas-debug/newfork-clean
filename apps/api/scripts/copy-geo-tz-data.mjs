import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(require.resolve("geo-tz")), "..");
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
if (version !== "8.1.8") throw new Error("Review the geographic assets when changing geo-tz version");
const destination = resolve(apiRoot, "dist/geo-tz-data");
await mkdir(destination, { recursive: true });
await copyFile(resolve(packageRoot, "data/timezones-1970.geojson.geo.dat"), resolve(destination, "timezones-1970.geojson.geo.dat"));
await copyFile(resolve(packageRoot, "LICENSE.md"), resolve(destination, "geo-tz-MIT-LICENSE.md"));
for (const name of ["timezone-data-ODbL.txt", "timezone-data-NOTICE.md"]) {
  await copyFile(resolve(apiRoot, "licenses", name), resolve(destination, name));
}
console.log("Copied geo-tz 8.1.8 1970 boundary data and separate code/data notices.");
