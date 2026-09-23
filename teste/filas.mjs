// Confere, para cada perfil, que os números dos filtros batem com a lista e que cada chamado está em uma só faixa de prioridade.
import { chromium } from "playwright";
const BASE = "http://localhost:5199/mock.html";
const U = n => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const perfis = [7, 6, 13, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 14, 15, 16];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let falhas = 0;
const falha = (m) => { falhas++; console.log("   FALHA " + m); };
async function ir(page, nomeItem) {
  await page.locator(".side-rolar .gcab").evaluateAll(els => els.forEach(e => { if (!e.parentElement.classList.contains("aberto")) e.click(); }));
  const loc = page.locator(".side-rolar .it", { hasText: nomeItem }).first();
  if (!(await loc.count())) return false;
  await loc.click(); await page.waitForTimeout(80); return true;
}
async function conferirChips(page, lista, chipsSel, rotulo, faixas) {
  const chips = await page.$$(chipsSel + " .chip");
  const porFaixa = {};
  for (let i = 0; i < chips.length; i++) {
    const ch = (await page.$$(chipsSel + " .chip"))[i];
    const txt = (await ch.textContent()).trim();
    const n = Number(await ch.$eval(".n", e => e.textContent));
    await ch.click(); await page.waitForTimeout(40);
    const ids = await page.$$eval(lista + " .ticket", els => els.map(e => e.dataset.id));
    if (ids.length !== n) falha(`${rotulo}: botão "${txt}" diz ${n}, lista mostra ${ids.length}`);
    if (new Set(ids).size !== ids.length) falha(`${rotulo}: botão "${txt}" com chamado repetido`);
    for (const f of faixas) if (txt.startsWith(f)) porFaixa[f] = ids;
  }
  const vistos = {};
  for (const [f, ids] of Object.entries(porFaixa)) for (const id of ids) { if (vistos[id]) falha(`${rotulo}: ${id} está em "${vistos[id]}" e em "${f}"`); vistos[id] = f; }
  return Object.fromEntries(Object.entries(porFaixa).map(([k, v]) => [k, v.length]));
}
for (const n of perfis) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  page.on("pageerror", e => falha("pageerror " + e.message));
  await page.goto(BASE + "?uid=" + U(n));
  await page.waitForSelector(".side-rolar .it");
  const nome = await page.textContent("#sideNome");
  const res = [];
  for (const item of ["Acompanhamento", "Minha fila"]) {
    if (!(await ir(page, item))) continue;
    const id = await page.$eval("main .view.active", e => e.id);
    if (id === "view-fila") {
      const escopos = await page.$$("main .view.active .subnav button");
      for (let i = 0; i < Math.max(1, escopos.length); i++) {
        if (escopos.length) { await (await page.$$("main .view.active .subnav button"))[i].click(); await page.waitForTimeout(50); }
        const r = await conferirChips(page, "#listaFila", "#filtros", nome + " fila" + (escopos.length ? "#" + i : ""), ["Críticos", "Atrasados", "Urgentes"]);
        res.push("fila " + JSON.stringify(r));
      }
    } else if (id === "view-acompmkt") {
      const r = await conferirChips(page, "#listaMkt", "#mkFiltros", nome + " mkt", ["Críticos"]);
      res.push("mkt " + JSON.stringify(r));
    }
  }
  if (await ir(page, "Minhas pendências")) {
    const ids = await page.$$eval("#pdSecoes .ap-item .pill", els => els.map(e => e.textContent));
    const total = Number(await page.$eval("#pdKpis .kpi .n", e => e.textContent));
    if (new Set(ids).size !== ids.length) falha(nome + ": pendência repetida " + ids.filter((x, i) => ids.indexOf(x) !== i).join(","));
    if (total !== ids.length) falha(nome + `: total de pendências ${total} ≠ itens ${ids.length}`);
    res.push("pend " + ids.length);
  }
  if (await ir(page, "Dashboard")) {
    const acao = await page.$$eval("#acaoList .acao", els => els.map(e => e.textContent));
    if (new Set(acao).size !== acao.length) falha(nome + ": 'Precisam de ação' repetido");
  }
  console.log(`${nome}: ${res.join(" | ")}`);
  await page.close();
}
await browser.close();
console.log(falhas ? `${falhas} falha(s)` : "Filas, filtros e pendências consistentes em todos os perfis");
process.exit(falhas ? 1 : 0);
