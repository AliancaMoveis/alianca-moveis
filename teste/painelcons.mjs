import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
const erros = []; p.on("pageerror", e => erros.push(e.message));
await p.goto("http://localhost:5199/mock.html?uid=00000000-0000-4000-a000-000000000011");
await p.waitForSelector(".mv-tabs button", { timeout: 10000 });
const abas = await p.$$eval(".mv-tabs button", els => els.map(e => e.textContent.trim())); console.log(abas.join(" | "));
const i = abas.findIndex(a => /painel/i.test(a)); await p.locator(".mv-tabs button").nth(i).click(); await p.waitForTimeout(400);
for (const t of ["Para visitar", "Visitas realizadas", "Visitas atrasadas"]) {
  await p.locator(".mv-tile", { hasText: t }).first().click(); await p.waitForTimeout(300);
  const box = await p.locator(".mv-lista-painel").count(); const txt = box ? (await p.locator(".mv-lista-painel .mv-sec").first().textContent()) : "-";
  console.log(t, "→ lista:", box, txt);
}
await p.screenshot({ path: "/tmp/claude-0/painelcons.png", fullPage: false });
console.log("erros", erros);
await b.close();
