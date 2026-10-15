// Percorre as abas do app do celular de alguns perfis e tira prints (dados de exemplo)
import { chromium } from "playwright";
const BASE = "http://localhost:5199/mock.html";
const U = n => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const perfis = (process.argv[2] || "7,22,18,6,13,11,15,10,20").split(",").map(Number);
const out = process.argv[3] || "/tmp/claude-0/mv";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let falhas = 0;
for (const n of perfis) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
  const erros = [];
  page.on("pageerror", e => erros.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/supabase|fetch|WebSocket|Failed to load|net::|realtime/i.test(m.text())) erros.push("console: " + m.text()); });
  page.on("dialog", d => d.dismiss());
  await page.goto(BASE + "?uid=" + U(n));
  try { await page.waitForSelector(".mv-tabs button", { timeout: 8000 }); } catch { console.log("SEM APP", n); await page.close(); continue; }
  const abas = await page.$$eval(".mv-tabs button", els => els.map(e => e.textContent.trim()));
  for (let i = 0; i < abas.length; i++) {
    await page.locator(".mv-tabs button").nth(i).click(); await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}-${n}-${i}.png`, fullPage: true });
  }
  console.log(erros.length ? "ERRO" : "OK  ", n, abas.join(" | "), erros.slice(0, 3).join(" ; "));
  if (erros.length) falhas++;
  await page.close();
}
await browser.close();
process.exit(falhas ? 1 : 0);
