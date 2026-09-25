// Percorre todas as telas de todos os perfis (dados de exemplo, sem Supabase) e abre todas as fichas visíveis.
import { chromium } from "playwright";
const BASE = "http://localhost:5199/mock.html";
const U = n => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const perfis = [7, 6, 13, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let falhas = 0;
for (const n of perfis) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const erros = [];
  page.on("pageerror", e => erros.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/supabase|fetch|WebSocket|Failed to load|net::|realtime/i.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(BASE + "?uid=" + U(n));
  await page.waitForSelector(".side-rolar .it");
  const nome = await page.textContent("#sideNome");
  // abre todos os grupos e lista itens
  const itens = await page.$$eval(".side-rolar .it", els => els.map(e => e.textContent.replace(/\d+$/, "").trim()));
  const visitados = [];
  for (const it of itens) {
    await page.locator(".side-rolar .gcab").evaluateAll(els => els.forEach(e => { if (!e.parentElement.classList.contains("aberto")) e.click(); }));
    await page.locator(".side-rolar .it", { hasText: it }).first().click();
    await page.waitForTimeout(120);
    const titulo = await page.textContent("main .view.active h2").catch(() => "?");
    visitados.push(`${it} → ${titulo}`);
    // sub-abas
    const nSub = (await page.$$("main .subnav button")).length;
    for (let i = 0; i < nSub; i++) { const bts = await page.$$("main .subnav button"); if (bts[i]) { await bts[i].click(); await page.waitForTimeout(50); } }
  }
  // abrir todas as fichas pela Consulta (ou Clientes/Minha fila quando não houver Consulta)
  let abertas = 0;
  const alvo = itens.includes("Consulta") ? "Consulta" : null;
  if (alvo) {
    await page.locator(".side-rolar .gcab").evaluateAll(els => els.forEach(e => { if (!e.parentElement.classList.contains("aberto")) e.click(); }));
    await page.locator(".side-rolar .it", { hasText: alvo }).first().click();
    const ids = await page.$$eval("#listaConsulta .ticket", els => els.map(e => e.dataset.id));
    for (const id of ids) {
      await page.click(`#listaConsulta .ticket[data-id="${id}"]`);
      await page.waitForSelector("#overlay.on .mb");
      abertas++;
      await page.click("#overlay.on #fechar");
    }
  }
  const ok = erros.length === 0;
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "ERRO"} ${nome} — ${itens.length} telas, ${abertas} fichas abertas`);
  if (!ok) erros.slice(0, 8).forEach(e => console.log("     " + e));
  if (n === 7) console.log("     " + visitados.join(" | "));
  await page.close();
}
await browser.close();
console.log(falhas ? `${falhas} perfil(is) com erro` : "Todos os perfis sem erro");
process.exit(falhas ? 1 : 0);
