import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
const erros = []; p.on("pageerror", e => erros.push(e.message));
await p.goto("http://localhost:5199/mock.html?uid=00000000-0000-4000-a000-000000000011");
await p.waitForSelector(".mv-tabs button"); await p.locator(".mv-tabs button", { hasText: "Clientes" }).click(); await p.waitForTimeout(300);
await p.locator(".mv-card").first().click(); await p.waitForTimeout(400);
const bt = p.locator("button", { hasText: /data da visita/ }); console.log("botões", await bt.count());
if (await bt.count()) { await bt.first().click(); await p.waitForTimeout(200); await p.locator("button", { hasText: "Amanhã" }).click(); await p.waitForTimeout(200);
  const el = p.locator("text=Nova data da visita").first(); await el.scrollIntoViewIfNeeded(); }
await p.screenshot({ path: "/tmp/claude-0/remarcar.png" }); console.log(erros, await p.evaluate(() => document.documentElement.scrollWidth));
await b.close();
