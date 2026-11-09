// Rota do dia do consultor: escolhe os clientes que vai visitar (pela data da visita ou buscando por cidade/bairro, ex.: litoral),
// abre a rota no Google Maps (saindo de onde ele está) e baixa o PDF da rota para ter no celular.
import { useMemo, useState } from "react";
import { useApp } from "../estado";
import { hojeISO } from "../lib/regras";
import { fmtTel } from "../lib/baseClientes";

const dia = (s?: string) => String(s || "").slice(0, 10);
const hora = (s?: string) => String(s || "").slice(11, 16);
const somaDia = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const brD = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
const semAc = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** endereço para o mapa: sem complemento de apartamento e com o estado */
export const endMapa = (end: string) => { const e = String(end || "").replace(/\s+-\s+(CASA|CS|SOB|SOBRADO|AP|APTO|APT|BL|BLOCO)[^,]*,/i, ",").trim(); return /\b(PR|SC|SP|paran[aá])\b/i.test(e) ? e : e + ", PR"; };
const MAX_PARADAS = 10; // o Google Maps aceita até 9 paradas + o destino num link
/** links de rota: cada um com até 10 endereços, saindo da localização atual (o 1º) ou do último endereço do link anterior */
export function linksRota(ends: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < ends.length; i += MAX_PARADAS) {
    const parte = ends.slice(i, i + MAX_PARADAS); const dest = parte[parte.length - 1]; const meio = parte.slice(0, -1);
    const u = new URL("https://www.google.com/maps/dir/");
    u.searchParams.set("api", "1"); if (i > 0) u.searchParams.set("origin", endMapa(ends[i - 1]));
    u.searchParams.set("destination", endMapa(dest)); if (meio.length) u.searchParams.set("waypoints", meio.map(endMapa).join("|")); u.searchParams.set("travelmode", "driving");
    out.push(u.toString());
  }
  return out;
}

export function RotaVisitas({ clientes, abrir }: { clientes: any[]; abrir: (id: string) => void }) {
  const { R } = useApp() as any;
  const h = hojeISO();
  const [data, setData] = useState(h);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]); // ordem da rota
  const doDia = useMemo(() => clientes.filter(c => dia(c.dataVisita) === data).sort((a, b) => hora(a.dataVisita).localeCompare(hora(b.dataVisita))), [clientes, data]);
  const outros = clientes.filter(c => dia(c.dataVisita) !== data && (!q.trim() || semAc(c.cliente + " " + (c.endereco || "") + " " + (c.produto || "")).includes(semAc(q.trim()))));
  const porId = (id: string) => clientes.find(c => c.id === id);
  const rota = sel.map(porId).filter(Boolean) as any[];
  const alterna = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const mover = (i: number, d: number) => setSel(s => { const n = s.slice(); const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const semEnd = rota.filter(c => !String(c.endereco || "").trim());
  const ends = rota.filter(c => String(c.endereco || "").trim()).map(c => c.endereco);
  const links = linksRota(ends);
  const usarDia = () => setSel(doDia.map(c => c.id));
  const pdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Rota de visitas — " + brD(data), 14, 15);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(R.nomeUser(R.currentUserId) + " · " + rota.length + " cliente(s) · toque no endereço para abrir no mapa", 14, 21);
    autoTable(doc, {
      startY: 26,
      head: [["#", "Hora", "Cliente", "Telefone", "Endereço", "Ambientes"]],
      body: rota.map((c, i) => [String(i + 1), dia(c.dataVisita) === data ? hora(c.dataVisita) : (c.dataVisita ? brD(dia(c.dataVisita)).slice(0, 5) + " " + hora(c.dataVisita) : "—"), c.cliente, c.telefone ? fmtTel(String(c.telefone).split(/[\/,;]/)[0]) : "", c.endereco || "SEM ENDEREÇO", c.produto || ""]),
      styles: { fontSize: 9, cellPadding: 2, valign: "middle" }, headStyles: { fillColor: [31, 56, 100], textColor: 255 },
      columnStyles: { 0: { cellWidth: 7, halign: "center" }, 1: { cellWidth: 14 }, 2: { cellWidth: 38, fontStyle: "bold" }, 3: { cellWidth: 28 }, 4: { cellWidth: 68, textColor: [20, 70, 160] }, 5: { cellWidth: 27 } },
      didDrawCell: (d: any) => { if (d.section === "body" && d.column.index === 4) { const c = rota[d.row.index]; if (c && c.endereco) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(endMapa(c.endereco)) }); } },
    });
    let y = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    links.forEach((u, i) => { doc.setTextColor(20, 70, 160); doc.textWithLink("» Abrir rota no Google Maps" + (links.length > 1 ? " — parte " + (i + 1) + " de " + links.length : ""), 14, y, { url: u }); y += 7; });
    doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text("Gerado em " + new Date().toLocaleString("pt-BR").slice(0, 17) + " · ALIANÇA 360", 14, doc.internal.pageSize.getHeight() - 6);
    doc.save("rota_" + data + ".pdf");
  };
  const Item = ({ c, marcado }: { c: any; marcado: boolean }) => <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
    <input type="checkbox" style={{ width: 20, height: 20 }} checked={marcado} onChange={() => alterna(c.id)} />
    <div style={{ flex: 1, minWidth: 0 }} onClick={() => alterna(c.id)}>
      <b>{c.dataVisita ? (dia(c.dataVisita) === data ? hora(c.dataVisita) : brD(dia(c.dataVisita)).slice(0, 5) + " " + hora(c.dataVisita)) + " · " : ""}{c.cliente}</b>
      <div style={{ fontSize: 12.5, color: c.endereco ? "var(--ink-soft)" : "var(--danger)" }}>{c.endereco || "⚠️ sem endereço"}</div></div>
    <button className="mv-mini" onClick={() => abrir(c.id)}>ver</button></div>;
  return <div>
    <div className="mv-resg-dica" style={{ background: "var(--surface-2)", borderColor: "var(--line)" }}>Escolha o dia, marque os clientes que vai visitar (na ordem da rota) e toque em <b>Abrir rota</b> — o Google Maps sai de onde você está. O <b>PDF</b> fica no celular com os endereços clicáveis.</div>
    <div className="mv-seg">{[[h, "Hoje"], [somaDia(h, 1), "Amanhã"], [somaDia(h, 2), brD(somaDia(h, 2)).slice(0, 5)]].map(([d, l]) => <button key={d} className={data === d ? "on" : ""} onClick={() => { setData(d); setSel([]); }}>{l}<i>{clientes.filter(c => dia(c.dataVisita) === d).length}</i></button>)}
      <input type="date" value={data} onChange={e => { setData(e.target.value || h); setSel([]); }} style={{ maxWidth: 150 }} /></div>
    <div className="mv-sec">Visitas marcadas para {brD(data)} <i>{doDia.length}</i>{doDia.length > 0 && <button className="mv-mini" style={{ marginLeft: 8 }} onClick={usarDia}>marcar todas</button>}</div>
    {doDia.length ? doDia.map(c => <Item key={c.id} c={c} marcado={sel.includes(c.id)} />) : <div className="mv-dica">Nenhuma visita marcada para este dia. Busque abaixo os clientes para incluir na rota.</div>}
    <div className="mv-sec">Incluir outros clientes (busque por cidade, bairro ou nome)</div>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder="ex.: Matinhos, Guaratuba, Pontal…" style={{ width: "100%", marginBottom: 6 }} />
    {q.trim().length >= 2 && (outros.length ? outros.slice(0, 40).map(c => <Item key={c.id} c={c} marcado={sel.includes(c.id)} />) : <div className="mv-dica">Nenhum cliente encontrado.</div>)}
    <div className="mv-sec">🗺 Sua rota <i>{rota.length}</i></div>
    {rota.length ? <>
      {rota.map((c, i) => <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 10px", borderBottom: "1px solid var(--line)" }}>
        <b style={{ width: 22 }}>{i + 1}.</b><div style={{ flex: 1, minWidth: 0 }}><b>{c.cliente}</b><div style={{ fontSize: 12 }} className="hint">{c.endereco || "⚠️ sem endereço (fica fora do mapa)"}</div></div>
        <button className="mv-mini" onClick={() => mover(i, -1)} disabled={i === 0}>▲</button><button className="mv-mini" onClick={() => mover(i, 1)} disabled={i === rota.length - 1}>▼</button><button className="mv-mini" onClick={() => alterna(c.id)}>✕</button></div>)}
      {semEnd.length > 0 && <div className="mv-dica" style={{ color: "var(--danger)" }}>{semEnd.length} cliente(s) sem endereço ficam fora do mapa.</div>}
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {links.map((u, i) => <a key={i} className="mv-principal" style={{ textAlign: "center", textDecoration: "none" }} href={u} target="_blank" rel="noopener">🗺 Abrir rota no Google Maps{links.length > 1 ? " — parte " + (i + 1) + " de " + links.length : ""}</a>)}
        <button className="mv-principal" style={{ background: "var(--surface)", color: "var(--primary)", border: "2px solid var(--primary)" }} onClick={() => pdf().catch(e => alert("Não foi possível gerar o PDF: " + e.message))}>📄 Baixar PDF da rota</button>
      </div>
    </> : <div className="mv-dica">Marque os clientes acima para montar a rota.</div>}
  </div>;
}
