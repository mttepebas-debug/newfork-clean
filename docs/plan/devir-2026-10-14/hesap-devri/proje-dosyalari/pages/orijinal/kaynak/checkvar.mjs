import { chromium } from "/home/claude/newfork-clean/e2e/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [name, tag] of [["fb67/index.html","fb"],["musaitlik/index.html","mus"],["onboarding-docs.html","onb"],["republish.html","rep"],["employees-lab.html","emp"],["list-pages.html","list"],["requests-lab.html","req"]]) {
  for (const w of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto(`http://127.0.0.1:8099/${name}`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `/srv/orig/shots/var-${tag}-${w}.png` });
    await page.close();
  }
}
await browser.close();
