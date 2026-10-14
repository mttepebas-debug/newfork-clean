import { chromium } from "/home/claude/newfork-clean/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const w of [1440, 390]) for (const h of ["o2"]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("response", r => { if (r.status() >= 400 && !r.url().includes("favicon")) errs.push(r.status() + " " + r.url()); });
  await p.goto("http://127.0.0.1:8765/test.html#" + h); await p.waitForTimeout(12000);
  const a = await p.evaluate(() => ({ t: document.getElementById("d-title").textContent, lab: document.querySelector(".pane-label")?.textContent, asks: [...document.querySelectorAll("#d-asks li")].map(l => l.textContent.slice(0, 40)), warn: !document.getElementById("d-warn").hidden, ov: document.documentElement.scrollWidth > innerWidth }));
  const fr = p.frames().find(f => f.url().includes(((h==="r4"||h==="r6")?"vardiya-degisim/":h==="e3"?"availability/":h==="k1"?"org-switcher/":h==="o2"?"tek-cumle/":h==="a7"?"jobs-renk/":h==="o1"?"erisim-karti/":h==="r5"?"vardiya-ikonlari/":h==="s21"?"kart-isaretleri/":"lineup/"))); const inner = fr ? (await fr.evaluate(() => document.body.innerText.slice(0, 80))).replace(/\s+/g, " ") : null;
  await p.screenshot({ path: `chk-${h}-${w}.png` });
  console.log(w, h, JSON.stringify(a), "| inner:", inner, "| errs:", errs); await p.close();
}
await b.close();
