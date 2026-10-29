// Relatório de pagamento dos montadores para o financeiro em PDF: só o essencial
// (montador, banco/agência/conta ou PIX, CPF/CNPJ e o valor total a pagar) — sem produtos e adicionais.
export type LinhaFin = { montador: string; titular?: string; doc?: string; banco?: string; agencia?: string; conta?: string; tipoConta?: string; pixTipo?: string; pixChave?: string; total: number };

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const so = (s: string) => String(s || "").replace(/\D/g, "");
export function fmtDoc(d?: string) {
  const x = so(d || "");
  if (x.length === 11) return "CPF " + x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (x.length === 14) return "CNPJ " + x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d || "";
}

export async function pdfFinanceiro(arquivo: string, titulo: string, periodo: string, linhas: LinhaFin[], obs = "") {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const total = linhas.reduce((s, l) => s + (Number(l.total) || 0), 0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text("Aliança Móveis — Pagamento dos montadores", 14, 15);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(titulo, 14, 22);
  doc.text("Período: " + periodo, 14, 28);
  doc.text("Total a pagar: " + moeda(total) + " · " + linhas.length + " montador(es)", 14, 34);
  if (obs) { doc.setFontSize(9); doc.setTextColor(150, 0, 0); doc.text(obs, 14, 39); doc.setTextColor(0, 0, 0); }
  autoTable(doc, {
    startY: obs ? 43 : 39,
    head: [["Montador", "Titular da conta", "CPF / CNPJ", "Banco", "Agência", "Conta", "PIX", "Valor total"]],
    body: linhas.map(l => [l.montador, l.titular || "", fmtDoc(l.doc), l.banco || "", l.agencia || "", [l.conta, l.tipoConta].filter(Boolean).join(" · "), l.pixChave ? (l.pixTipo ? l.pixTipo + ": " : "") + l.pixChave : "", moeda(Number(l.total) || 0)]),
    foot: [["TOTAL", "", "", "", "", "", "", moeda(total)]],
    styles: { fontSize: 9, cellPadding: 2, valign: "middle" },
    headStyles: { fillColor: [31, 56, 100], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [230, 236, 245], textColor: 0, fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 46 }, 7: { halign: "right", fontStyle: "bold", cellWidth: 30 } },
    didParseCell: (d: any) => { if (d.section === "body" && d.column.index === 5 && !d.cell.raw && !linhas[d.row.index]?.pixChave) { d.cell.text = ["SEM CONTA CADASTRADA"]; d.cell.styles.textColor = [180, 0, 0]; } },
  });
  const h = doc.internal.pageSize.getHeight();
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text("Gerado em " + new Date().toLocaleString("pt-BR").slice(0, 17) + " · ALIANÇA 360 · página " + i + " de " + n, 14, h - 6); }
  doc.save(arquivo);
}
