// Local stand-in for the Supabase gateway: /rest/v1 goes to PostgREST,
// /auth/v1 is a small password + JWT server over auth.users, storage and
// realtime answer "not here". Only for recording the app; never hosted.
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const PORT = 55321;
const PGRST = "http://127.0.0.1:55330";
export const SECRET = "[GIZLI-CIKARILDI]";

const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
export function sign(claims) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(claims);
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [head, body, sig] = String(token ?? "").split(".");
  if (!sig) return null;
  const want = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  if (want !== sig) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

function sql(query, env = {}) {
  const script = Object.keys(env).map((k) => `\\getenv ${k.toLowerCase()} ${k}`).join("\n") + "\n" + query + "\n";
  const out = execFileSync("psql", ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "app", "-At", "-q", "-v", "ON_ERROR_STOP=1"], {
    input: script,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return out.trim();
}

const userSelect = `select json_build_object('id', id, 'aud', 'authenticated', 'role', 'authenticated', 'email', email,
  'email_confirmed_at', email_confirmed_at, 'phone', coalesce(phone, ''), 'confirmed_at', coalesce(confirmed_at, email_confirmed_at),
  'last_sign_in_at', last_sign_in_at, 'app_metadata', coalesce(raw_app_meta_data, '{}'), 'user_metadata', coalesce(raw_user_meta_data, '{}'),
  'identities', '[]'::json, 'created_at', created_at, 'updated_at', updated_at, 'is_anonymous', false) from auth.users`;

function userById(id) {
  const row = sql(`${userSelect} where id = :'uid'::uuid`, { UID: id });
  return row ? JSON.parse(row) : null;
}

function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 24 * 3600;
  const access_token = sign({ sub: user.id, role: "authenticated", aud: "authenticated", email: user.email, exp, iat: now, session_id: crypto.randomUUID() });
  return { access_token, token_type: "bearer", expires_in: 24 * 3600, expires_at: exp, refresh_token: b64(user.id), user };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function auth(req, res, url, raw) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  const body = raw.length ? JSON.parse(raw.toString() || "{}") : {};
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
  if (path === "/token") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const row = sql(`${userSelect} where lower(email) = lower(:'em') and encrypted_password = extensions.crypt(:'pw', encrypted_password)`, { EM: body.email ?? "", PW: body.password ?? "" });
      if (!row) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return send(res, 200, session(JSON.parse(row)));
    }
    if (grant === "refresh_token") {
      const id = Buffer.from(String(body.refresh_token ?? ""), "base64url").toString();
      const user = /^[0-9a-f-]{36}$/.test(id) ? userById(id) : null;
      if (!user) return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      return send(res, 200, session(user));
    }
  }
  if (path === "/user") {
    const claims = verify(bearer);
    const user = claims?.sub ? userById(claims.sub) : null;
    if (!user) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return send(res, 200, user);
  }
  if (path === "/logout") return send(res, 204);
  if (path.startsWith("/admin/users")) {
    const id = path.split("/")[3];
    if (id) return send(res, 200, userById(id) ?? {});
    const rows = sql(`select coalesce(json_agg(t.x), '[]') from (${userSelect}) as t(x)`);
    return send(res, 200, { users: JSON.parse(rows || "[]"), aud: "authenticated" });
  }
  if (path === "/settings") return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
  return send(res, 404, { msg: `auth stub: ${path} not available` });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      });
      return res.end();
    }
    const raw = await readBody(req);
    try {
      if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url, raw);
      if (url.pathname.startsWith("/rest/v1")) {
        const target = PGRST + url.pathname.replace(/^\/rest\/v1/, "") + url.search;
        const headers = { ...req.headers };
        delete headers.host;
        delete headers["content-length"];
        if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
        const upstream = await fetch(target, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : raw });
        const out = Buffer.from(await upstream.arrayBuffer());
        const pass = {};
        for (const [k, v] of upstream.headers) if (!["content-encoding", "transfer-encoding", "content-length", "connection"].includes(k)) pass[k] = v;
        res.writeHead(upstream.status, { ...pass, "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" });
        return res.end(out);
      }
      if (url.pathname.startsWith("/storage/v1")) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      return send(res, 404, { msg: "not here" });
    } catch (error) {
      console.error(req.method, url.pathname, error);
      return send(res, 500, { msg: String(error?.message ?? error) });
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gateway on ${PORT}`));
