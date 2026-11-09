// RH · PDF da ficha cadastral (vertical, para imprimir): todos os dados preenchidos, a foto e as imagens dos documentos.
import { sb } from "./supabase";
import { DOCS_FICHA } from "./rhFicha";
import { TIPOS_DOC, EMPRESAS } from "./rh";

export type DocPdf = { campo: string; nome: string; caminho: string };
const br = (s?: string | null) => { const x = String(s || ""); return /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(8, 10) + "/" + x.slice(5, 7) + "/" + x.slice(0, 4) : x; };
const sn = (v: any) => v === "sim" ? "Sim" : v === "nao" ? "Não" : v;
const rotDoc = (campo: string) => (DOCS_FICHA.find(d => d[0] === campo) || TIPOS_DOC.find(d => d[0] === campo) || [campo, campo === "outro" ? "Outros documentos" : campo])[1];

async function imagem(caminho: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const r = await sb.storage.from("rh").createSignedUrl(caminho, 600); if (r.error) return null;
    const blob = await (await fetch(r.data.signedUrl)).blob(); if (!blob.type.startsWith("image/")) return null;
    const url = URL.createObjectURL(blob);
    const img: HTMLImageElement = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height)); const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
    return { data: cv.toDataURL("image/jpeg", 0.85), w: cv.width, h: cv.height };
  } catch { return null; }
}

export async function pdfFicha(f: any, docs: DocPdf[], titulo = "Ficha cadastral") {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const foto = docs.find(d => d.campo === "foto"); const fotoImg = foto ? await imagem(foto.caminho) : null;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("Aliança Móveis — " + titulo, 14, 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.text(String(f.nome || "—"), 14, 24);
  doc.setFontSize(9); doc.setTextColor(110); doc.text("Gerado em " + new Date().toLocaleString("pt-BR").slice(0, 17), 14, 30); doc.setTextColor(0);
  if (fotoImg) { const fw = 30, fh = Math.min(40, fw * fotoImg.h / fotoImg.w); doc.addImage(fotoImg.data, "JPEG", W - 14 - fw, 8, fw, fh); }
  let y = fotoImg ? 52 : 36;
  const secao = (tit: string, campos: [string, any][]) => {
    const linhas = campos.filter(([, v]) => v != null && String(v).trim() !== "").map(([l, v]) => [l, String(v)]);
    if (!linhas.length) return;
    autoTable(doc, { startY: y, head: [[{ content: tit, colSpan: 2 }]], body: linhas, theme: "grid",
      styles: { fontSize: 9.5, cellPadding: 1.8 }, headStyles: { fillColor: [31, 56, 100], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 55, fontStyle: "bold", fillColor: [243, 246, 251] }, 1: { cellWidth: W - 28 - 55 } }, margin: { left: 14, right: 14 } });
    y = (doc as any).lastAutoTable.finalY + 4;
  };
  const casado = !!f.conjuge_nome || ["Casado(a)", "União estável"].includes(f.estado_civil);
  secao("Dados pessoais", [["Nome completo", f.nome], ["Nome social", f.nome_social], ["Data de nascimento", br(f.nascimento)], ["Naturalidade", [f.municipio_nasc, f.uf_nasc, f.pais_nasc].filter(Boolean).join(" / ")],
    ["Sexo", f.sexo], ["Raça / cor", f.raca], ["Grau de instrução", f.escolaridade], ["CPF", f.cpf], ["Telefone / WhatsApp", f.telefone], ["E-mail", f.email], ["Endereço", f.endereco]]);
  secao("Documentos", [["RG", [f.rg, f.rg_orgao, f.rg_uf].filter(Boolean).join(" · ")], ["RG — emissão", br(f.rg_emissao)], ["Título de eleitor", [f.titulo_num, f.titulo_zona && "zona " + f.titulo_zona, f.titulo_secao && "seção " + f.titulo_secao].filter(Boolean).join(" · ")],
    ["Reservista", [f.reservista_num, f.reservista_cat && "cat. " + f.reservista_cat].filter(Boolean).join(" · ")], ["CNH", [f.cnh_num, f.cnh_cat && "cat. " + f.cnh_cat, f.cnh_venc && "venc. " + br(f.cnh_venc)].filter(Boolean).join(" · ")],
    ["Carteira de trabalho (CTPS)", f.ctps], ["PIS", f.pis]]);
  secao("Família", [["Estado civil", f.estado_civil], ...(casado ? [["Cônjuge", f.conjuge_nome]] as [string, any][] : []), ["Nome do pai", f.pai_nome], ["Nome da mãe", f.mae_nome], ["Possui dependentes", sn(f.tem_dependentes)]]);
  const deps = (f.dependentes || []).filter((x: any) => String(x.nome || "").trim());
  if (deps.length) { autoTable(doc, { startY: y, head: [["Dependente", "Nascimento", "CPF"]], body: deps.map((x: any) => [x.nome, br(x.nascimento), x.cpf || ""]), theme: "grid", styles: { fontSize: 9.5, cellPadding: 1.8 }, headStyles: { fillColor: [80, 100, 140] }, margin: { left: 14, right: 14 } }); y = (doc as any).lastAutoTable.finalY + 4; }
  secao("Pessoa com deficiência", [["Portador de deficiência", sn(f.pcd)], ["Qual", f.pcd_qual]]);
  secao("Contatos de emergência", [["1 · Nome / parentesco", f.emergencia_nome], ["1 · Telefone", f.emergencia_tel], ["2 · Nome / parentesco", f.emergencia2_nome], ["2 · Telefone", f.emergencia2_tel]]);
  secao("Dados bancários", [["Conta Santander", sn(f.santander)], ["Banco", f.banco], ["Agência", f.agencia], ["Conta", f.conta], ["Pix", f.pix]]);
  secao("Contrato", [["Empresa", (EMPRESAS.find(e => e[0] === f.empresa) || [, f.empresa])[1]], ["Nº da folha", f.folha], ["Cargo / função", f.cargo], ["Setor", f.setor], ["Admissão", br(f.admissao)], ["Horário", f.horario]]);
  secao("Observação", [["Observação", f.obs]]);
  // lista dos documentos anexados
  const outros = docs.filter(d => d !== foto);
  if (outros.length) secao("Documentos anexados (" + outros.length + ")", outros.map(d => [rotDoc(d.campo), d.nome + (/\.pdf$/i.test(d.nome) ? "  (PDF — imprimir à parte)" : "")]));
  // uma página por imagem de documento
  for (const d of outros) {
    const im = await imagem(d.caminho); if (!im) continue;
    doc.addPage(); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(rotDoc(d.campo) + " — " + String(f.nome || ""), 14, 14);
    const mw = W - 28, mh = H - 30; const k = Math.min(mw / im.w, mh / im.h); const w = im.w * k, h = im.h * k;
    doc.addImage(im.data, "JPEG", 14 + (mw - w) / 2, 20, w, h);
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120); doc.text("ALIANÇA 360 · RH · página " + i + " de " + n, 14, H - 6); doc.setTextColor(0); }
  doc.save("ficha_" + String(f.nome || "funcionario").replace(/\s+/g, "_") + ".pdf");
}
