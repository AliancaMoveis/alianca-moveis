// Modo escuro: percorre telas (computador: todos os itens do menu; celular: todas as abas) e lista elementos com fundo claro
import { chromium } from "playwright";
const BASE = "http://localhost:5199/mock.html";
const U = n => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const desk = (process.argv[2] || "7").split(",").filter(Boolean).map(Number);
const mob = (process.argv[3] || "7,22,18,6,13,11,15,10,20,23,8,9").split(",").filter(Boolean).map(Number);
const shot = process.argv[4] || "";
const browser = await chromium.launch();
const achados = {};
const det = () => {
  const lum = c => { const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/); if (!m) return -1; if (m[4] !== undefined && +m[4] < .5) return -1; const f = x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }; return .2126 * f(+m[1]) + .7152 * f(+m[2]) + .0722 * f(+m[3]); };
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect(); if (r.width * r.height < 600 || r.width < 20) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < .3) continue;
    if (["IMG", "SVG", "CANVAS", "VIDEO", "IFRAME"].includes(el.tagName.toUpperCase())) continue;
    if (lum(cs.backgroundColor) > .6) {
      const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".");
      const pai = el.parentElement && typeof el.parentElement.className === "string" ? el.parentElement.className.trim().split(/\s+/)[0] : "";
      out.push(el.tagName.toLowerCase() + (cls ? "." + cls : "") + " < " + pai + " | bg " + cs.backgroundColor + " | inline " + (el.getAttribute("style") || "").slice(0, 60) + " | txt " + (el.textContent || "").trim().slice(0, 30));
    }
  }
  return [...new Set(out)];
};
const add = (onde, l) => l.forEach(x => (achados[x] = achados[x] || new Set()).add(onde));
for (const n of desk) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, colorScheme: "dark" });
  page.on("dialog", d => d.dismiss());
  await page.goto(BASE + "?uid=" + U(n)); await page.waitForSelector(".side", { timeout: 10000 });
  const grupos = await page.$$eval(".grupo", els => els.map(e => e.getAttribute("data-g")));
  for (const g of grupos) {
    const gl = page.locator(`.grupo[data-g="${g}"]`);
    if (!(await gl.getAttribute("class")).includes("aberto")) await gl.locator(".gcab").click();
    const n2 = await gl.locator(".it").count();
    for (let i = 0; i < n2; i++) {
      const it = gl.locator(".it").nth(i); const nome = (await it.textContent()).trim();
      try { await it.click({ timeout: 2000 }); } catch { continue; }
      await page.waitForTimeout(300);
      add("PC " + n + " " + g + " > " + nome, await page.evaluate(det));
      if (!(await gl.getAttribute("class")).includes("aberto")) await gl.locator(".gcab").click();
    }
  }
  await page.close();
}
for (const n of mob) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
  page.on("dialog", d => d.dismiss());
  await page.goto(BASE + "?uid=" + U(n));
  try { await page.waitForSelector(".mv-tabs button", { timeout: 8000 }); } catch { continue; }
  const abas = await page.$$eval(".mv-tabs button", els => els.map(e => e.textContent.trim()));
  for (let i = 0; i < abas.length; i++) {
    await page.locator(".mv-tabs button").nth(i).click(); await page.waitForTimeout(300);
    add("CEL " + n + " " + abas[i], await page.evaluate(det));
    if (shot) await page.screenshot({ path: `${shot}-${n}-${i}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
const ks = Object.keys(achados);
console.log(ks.length + " elementos claros");
for (const k of ks.sort()) console.log(k, "  @", [...achados[k]].slice(0, 3).join(" ; "), achados[k].size > 3 ? "(+" + (achados[k].size - 3) + ")" : "");
