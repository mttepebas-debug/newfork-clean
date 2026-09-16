// Fresh-process verification of the actual API bundle; no server or external requests.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const apiRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(apiRoot, "dist/geo-tz-data");
const mode = process.argv[2];
if (!mode) {
  for (const check of ["packaged", "missing"]) {
    const result = spawnSync(process.execPath, [__filename, check], { cwd: require("node:os").tmpdir(), encoding: "utf8" });
    process.stdout.write(result.stdout); process.stderr.write(result.stderr);
    assert.equal(result.status, 0, check);
  }
} else {
  (async () => {
    if (mode === "missing") process.env.GEO_TZ_DATA_PATH = path.join(dataRoot, "absent-for-verification");
    else delete process.env.GEO_TZ_DATA_PATH;
    // The real handler establishes a cwd-independent default before lazy bundle import.
    require(path.resolve(apiRoot, "../../api/index.js"));
    assert.equal(process.env.GEO_TZ_DATA_PATH, mode === "missing" ? path.join(dataRoot, "absent-for-verification") : dataRoot);
    const opened = [];
    const openSync = fs.openSync;
    fs.openSync = function (filename, ...args) {
      if (String(filename).endsWith(".geo.dat")) {
        opened.push(String(filename));
        assert.ok(path.resolve(String(filename)).startsWith(process.env.GEO_TZ_DATA_PATH + path.sep));
        assert.ok(!String(filename).includes("node_modules"));
      }
      return openSync.call(this, filename, ...args);
    };
    let coordinates;
    global.fetch = async (url) => {
      assert.equal(url, "https://api.zippopotam.us/us/verification");
      return new Response(JSON.stringify({ places: [{ latitude: String(coordinates[0]), longitude: String(coordinates[1]) }] }));
    };
    const { buildApp } = require(path.join(apiRoot, "dist/vercel-app.cjs"));
    const app = buildApp({ allowDevelopmentIdentity: false, contextResolver: { resolve: async () => ({}) } });
    let proof;
    // Arizona/Nevada boundary cells require the binary polygons, not just the embedded index.
    for (let latitude = 35; latitude <= 37 && !proof; latitude += 0.1) {
      coordinates = [latitude, -114.6];
      const result = await app.inject({ url: "/v1/location-timezone-suggestion?country=US&postal=verification", headers: { authorization: "Bearer synthetic-verification" } });
      assert.equal(result.statusCode, 200);
      if (opened.length) proof = { coordinates, result: result.json(), binaryReads: opened.length };
    }
    assert.ok(proof, "Verification must exercise a polygon file read");
    assert.equal(proof.result.status, mode === "missing" ? "unavailable" : "suggested");
    if (mode === "packaged") {
      assert.equal(fs.statSync(path.join(dataRoot, "timezones-1970.geojson.geo.dat")).size, 26229853);
      for (const name of ["geo-tz-MIT-LICENSE.md", "timezone-data-ODbL.txt", "timezone-data-NOTICE.md"]) assert.ok(fs.statSync(path.join(dataRoot, name)).size > 0);
    }
    await app.close();
    console.log(JSON.stringify({ mode, ...proof }));
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}
