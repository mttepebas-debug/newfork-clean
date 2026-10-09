const path = require("node:path");
process.env.GEO_TZ_DATA_PATH ??= path.join(__dirname, "../apps/api/dist/geo-tz-data");
let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = Promise.resolve()
      .then(() => require("../apps/api/dist/vercel-app.cjs"))
      .then(async ({ buildApp }) => {
        const app = buildApp();
        await app.ready();
        return app;
      });
  }

  return appPromise;
}

function rewriteRequestUrl(request) {
  const url = new URL(request.url ?? "/", "https://newfork.local");
  const targetPath = url.searchParams.get("__path");

  if (!targetPath) {
    request.url = "/";
    return;
  }

  url.searchParams.delete("__path");
  request.url = `${targetPath}${url.search}`;
}

module.exports = async function handler(request, response) {
  const app = await getApp();
  rewriteRequestUrl(request);
  app.server.emit("request", request, response);
};
