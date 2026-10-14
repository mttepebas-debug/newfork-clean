import crypto from "node:crypto";
const SECRET = "[GIZLI-CIKARILDI]";
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const sign = (c) => { const h = b64({alg:"HS256",typ:"JWT"}), b = b64(c); return `${h}.${b}.${crypto.createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url")}`; };
const exp = 2000000000;
console.log(`ANON=${sign({role:"anon",iss:"supabase-demo",exp})}`);
console.log(`SERVICE=${sign({role:"service_role",iss:"supabase-demo",exp})}`);
