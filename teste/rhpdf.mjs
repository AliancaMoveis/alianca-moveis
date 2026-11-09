import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ acceptDownloads: true }); const erros = []; p.on("pageerror", e => erros.push(e.message));
await p.goto("http://localhost:5199/mock.html?uid=00000000-0000-4000-a000-000000000007"); await p.waitForTimeout(2500);
const dl = p.waitForEvent("download", { timeout: 15000 });
await p.evaluate(async () => { const m = await import("/src/lib/rhPdf.ts"); await m.pdfFicha({ nome: "Maria Teste", cpf: "123.456.789-00", nascimento: "1990-05-02", estado_civil: "Casado(a)", conjuge_nome: "João", tem_dependentes: "sim", dependentes: [{ nome: "Ana", nascimento: "2015-01-01", cpf: "" }], santander: "sim", agencia: "1234", conta: "5678-9", emergencia_nome: "Mãe", emergencia_tel: "41 99999-0000", endereco: "Rua X, 10" }, [], "Ficha do candidato"); });
const d = await dl; await d.saveAs("/tmp/claude-0/ficha.pdf"); console.log("ok", d.suggestedFilename(), erros);
await b.close();
