// Setor de Medidas — cruzamento Minha Visita (customers) × Exact (tickets "aguardando medição") pelo telefone.
// Cliente comprador que foi visitado por um consultor do Minha Visita = medidas oficiais ok; sem visita = sem medidas.
// O resultado fica gravado por nº de venda e aparece nos clientes do Checklist.
import { Ticket } from "../comp/Ticket";
import { Selo360, visitados360, Galeria360, achar360 } from "../comp/Visita360";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { lerXlsx } from "../lib/planilha";
import { linhaMedida } from "../lib/medidasPlanilha";
import { Modal } from "../comp/Modal";
import { ETAPA_MEDIDA, fmtDateTime, grupoMedida, itensVenda } from "../lib/regras";
import { tipoPlanilha } from "../lib/cruzarVendas";

type Linha = Record<string, string>;
type Arq = { nome: string; linhas: Linha[] };
type Res = { venda: string; comprador: string; telefone: string; visitado: string; consultor: string; statusMv: string; visitaEm: string; medidor: string; situacao: string; resultado: "ok" | "sem"; outros: number };

export const so = (s: string) => (s || "").replace(/\D/g, "");
/** chave do telefone: os 8 últimos dígitos (ignora +55, DDD e o 9 da frente) */
export const chave = (s: string) => { const d = so(s); return d.length >= 8 ? d.slice(-8) : ""; };
export const fmtTel = (s: string) => { let d = so(s); if (d.length > 11 && d.startsWith("55")) d = d.slice(2); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : s; };
export const tira = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** CSV do Minha Visita (separado por ; ou ,, com aspas) */
function lerCsv(txt: string): Linha[] {
  txt = txt.replace(/^﻿/, "");
  const sep = (txt.split("\n")[0].match(/;/g) || []).length >= (txt.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const linhas: string[][] = []; let campo = "", lin: string[] = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (aspas) { if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; }
    else if (ch === '"') aspas = true;
    else if (ch === sep) { lin.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; lin.push(campo); campo = ""; if (lin.some(x => x.trim())) linhas.push(lin); lin = []; }
    else campo += ch;
  }
  lin.push(campo); if (lin.some(x => x.trim())) linhas.push(lin);
  const cab = (linhas.shift() || []).map(h => h.trim());
  return linhas.map(l => Object.fromEntries(cab.map((h, i) => [h, (l[i] || "").trim()])));
}
export async function lerArquivo(f: File): Promise<Linha[]> {
  if (/\.xlsx$/i.test(f.name)) return lerXlsx(f);
  const buf = await f.arrayBuffer();
  let txt = new TextDecoder("utf-8").decode(buf);
  if (txt.includes("�")) txt = new TextDecoder("windows-1252").decode(buf);
  return lerCsv(txt);
}
export const col = (l: Linha, ...nomes: string[]) => { for (const n of nomes) { const k = Object.keys(l).find(x => tira(x) === tira(n)); if (k && l[k]) return l[k]; } return ""; };

/** nº da venda: "1296255 / NOME", "Venda 1139444" ou citado na descrição ("conf a venda 1285168") */
function vendaDe(l: Linha) {
  const t = col(l, "Título"), d = col(l, "Descrição");
  const m = t.match(/^\s*(\d{6,})/) || t.match(/venda\s*(\d{6,})/i) || d.match(/(?:venda|vd)\D{0,6}(1\d{6})/i) || (t + " " + d).match(/\b(1\d{6})\b/);
  return m ? m[1] : "";
}
function telefonesDe(l: Linha) {
  const d = col(l, "Descrição");
  return [col(l, "Telefone 1"), col(l, "Telefone 2"), ...(d.match(/\(?\d{2}\)?\s?9?[\s-]?\d{4}[\s-]?\d{4}/g) || [])];
}

function cruzar(mv: Linha[], ex: Linha[]): Res[] {
  const idx: Record<string, Linha[]> = {};
  mv.forEach(c => { const k = chave(col(c, "Celular", "Telefone", "Whatsapp")); if (k) (idx[k] = idx[k] || []).push(c); });
  const vistos = new Set<string>();
  return ex.map(t => {
    const tels = telefonesDe(t);
    const achados: Linha[] = []; tels.forEach(x => (idx[chave(x)] || []).forEach(c => { if (!achados.includes(c)) achados.push(c); }));
    // mais recente primeiro (último check / atualização)
    achados.sort((a, b) => (col(b, "Data de atualização") || "").localeCompare(col(a, "Data de atualização") || ""));
    const c = achados[0];
    const uc = c ? col(c, "Último Check") : "";
    return {
      venda: vendaDe(t), comprador: col(t, "Contato"), telefone: fmtTel(tels.find(x => so(x).length >= 8) || ""),
      visitado: c ? col(c, "Nome") : "", consultor: c ? col(c, "Contato de") || uc.split("|")[0].trim() : "",
      statusMv: c ? col(c, "Status") : "", visitaEm: c ? (uc.split("|")[2] || col(c, "Data de cadastro")).trim() : "",
      medidor: col(t, "Medidor"), situacao: col(t, "Situação"), resultado: c ? "ok" : "sem", outros: Math.max(0, achados.length - 1),
    } as Res;
  }).filter(r => { const k = r.venda || r.comprador; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

const TRATATIVAS = ["", "Medidas oficiais conferidas", "Agendar medição", "Pedir medidas ao consultor", "Conferir com o vendedor", "Medida feita pelo medidor", "Outro"];

/** conferido = já recebeu tratativa */
const conferido = (m: any) => !!(m && m.tratativa);
type Conf = "nao" | "sim" | "todos";
function ChipsConf({ v, set, nNao, nSim }: { v: Conf; set: (x: Conf) => void; nNao: number; nSim: number }) {
  return (
    <div className="chips">
      <button className={"chip" + (v === "nao" ? " on" : "")} onClick={() => set("nao")}>🔎 Não conferidos<span className="n">{nNao}</span></button>
      <button className={"chip" + (v === "sim" ? " on" : "")} onClick={() => set("sim")}>✔️ Conferidos<span className="n">{nSim}</span></button>
      <button className={"chip" + (v === "todos" ? " on" : "")} onClick={() => set("todos")}>Todos<span className="n">{nNao + nSim}</span></button>
    </div>
  );
}

export default function Medidas({ aba = "cruzar" }: { aba?: string }) {
  if (aba === "resultados") return <Resultados />;
  if (aba === "cruzar") return <Cruzar />;
  if (aba === "callcenter") return <FilaCallcenter />;
  if (aba === "visitados") return <Visitados360 />;
  return <ListaMedidas aba={aba} />;
}

// ---------- clientes que o consultor visitou no ALIANÇA 360: tem medida no Exact? (cruza telefone, CPF e nome) ----------
/** mesmo cliente? primeiro nome igual e mais um nome em comum (ou um dos lados só tem um nome) */
const SEMN = new Set(["da", "de", "do", "das", "dos", "e"]);
const toksN = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s*[-–(].*$/, "").replace(/[^a-z ]/g, " ").split(/\s+/).filter(t => t.length > 1 && !SEMN.has(t));
export function mesmoNome(a: string, b: string) {
  const x = toksN(a), y = toksN(b); if (!x.length || !y.length) return false;
  if (x[0] !== y[0]) return false;
  if (x.length === 1 || y.length === 1) return true;
  return x.slice(1).some(t => y.slice(1).includes(t));
}
const COMO_MD: Record<string, string> = { venda: "🧾 nº da venda lançado no 360", tel: "📞 telefone", doc: "🪪 CPF", nome: "👤 nome" };

function Visitados360() {
  const { R, st, abrirDetalhe, setModal } = useApp() as any;
  const [q, setQ] = useState(""); const [f, setF] = useState<"todos" | "com" | "sem" | "validar" | "fotos">("todos");
  const nomeK = (s: string) => tira(String(s || "").replace(/\s*[-–(].*$/, ""));
  const idx = useMemo(() => {
    const tel: Record<string, any[]> = {}, nome: Record<string, any[]> = {}, doc: Record<string, any[]> = {}, ped: Record<string, any[]> = {};
    st.chamados.filter((c: any) => c.tipo === "medidas" || c.tipo === "checklist").forEach((c: any) => {
      if (c.pedido) (ped[String(c.pedido)] = ped[String(c.pedido)] || []).push(c);
      String(c.telefone || "").split(/[\/,;]/).forEach((t: string) => { const k = chave(t); if (k) (tel[k] = tel[k] || []).push(c); });
      const n = nomeK(c.cliente); if (n.length >= 8) (nome[n] = nome[n] || []).push(c);
      const d = so(c.clienteDoc || ""); if (d.length >= 11) (doc[d] = doc[d] || []).push(c);
    });
    return { tel, nome, doc, ped };
  }, [st.chamados]);
  const linhas = useMemo(() => visitados360(R, st).map((v: any) => {
    const m = new Map<string, { c: any; como: string }>();
    const add = (x: any, como: string) => { if (!m.has(x.id)) m.set(x.id, { c: x, como }); };
    // primeiro pela venda lançada no 360 (nº igual = mesma compra), depois CPF, telefone e nome
    itensVenda(v.venda).filter((i: any) => i.status !== "cancelada" && i.numero).forEach((i: any) => (idx.ped[String(i.numero)] || []).forEach((x: any) => add(x, "venda")));
    const d = so(v.clienteDoc || ""); if (d.length >= 11) (idx.doc[d] || []).forEach((x: any) => add(x, "doc"));
    String(v.telefone || "").split(/[\/,;]/).forEach((t: string) => (idx.tel[chave(t)] || []).forEach((x: any) => add(x, "tel")));
    (idx.nome[nomeK(v.cliente)] || []).forEach((x: any) => add(x, "nome"));
    const achados = Array.from(m.values()).map(a => ({ ...a, igual: a.como === "venda" || mesmoNome(v.cliente, a.c.cliente) }));
    const med = achados.filter(a => a.c.tipo === "medidas"), ck = achados.filter(a => a.c.tipo === "checklist");
    return { v, med, ck, achados, difere: achados.some(a => !a.igual), nImg: (v.anexos || []).filter((a: any) => a.tipo === "img").length };
  }).sort((a: any, b: any) => String(b.v.dataVisita || b.v.criadoEm).localeCompare(String(a.v.dataVisita || a.v.criadoEm))), [st.chamados, idx]);
  const busca = tira(q), dig = so(q);
  const vis = linhas.filter((l: any) => (f === "todos" || (f === "com" ? l.med.length > 0 : f === "sem" ? !l.achados.length : f === "validar" ? l.difere : l.nImg > 0))
    && (!q || tira(l.v.cliente + " " + l.achados.map((a: any) => a.c.cliente + " " + (a.c.pedido || "")).join(" ") + " " + R.nomeUser(l.v.consultorId)).includes(busca) || (dig.length >= 3 && (so(l.v.telefone).includes(dig) || l.achados.some((a: any) => so(a.c.pedido).includes(dig))))));
  const nCom = linhas.filter((l: any) => l.med.length).length, nSem = linhas.filter((l: any) => !l.achados.length).length, nVal = linhas.filter((l: any) => l.difere).length;
  const th: any = { textAlign: "left", padding: "8px 10px", fontSize: 12, color: "var(--ink-faint)", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--card)" };
  const td: any = { padding: "8px 10px", verticalAlign: "top", borderBottom: "1px solid var(--line-soft)", fontSize: 13 };
  return (
    <section className="view active">
      <div className="view-head"><div><h2>📷 Visitados pelo consultor (360)</h2><p>À esquerda, o cliente que o consultor visitou no ALIANÇA 360; à direita, quem comprou (cliente da medida/checklist importado do Exact), cruzado pelo CPF, telefone ou nome. Quando o nome é diferente (ex.: a visita foi para a Dona Maria e a compra saiu no nome do Seu João), aparece “⚠️ validar”.</p></div></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0", flexWrap: "wrap" }}>
        <div className="chips" style={{ margin: 0 }}>{([["todos", "Todos (" + linhas.length + ")"], ["com", "Com medida no Exact (" + nCom + ")"], ["validar", "⚠️ Nome diferente — validar (" + nVal + ")"], ["sem", "Sem compra encontrada (" + nSem + ")"], ["fotos", "Com fotos"]] as any[]).map(([k, l]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}</button>)}</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nome, telefone, venda ou consultor" style={{ marginLeft: "auto", maxWidth: 300 }} />
      </div>
      {!vis.length ? <div className="card" style={{ padding: 20, textAlign: "center", color: "var(--ink-faint)" }}>Nenhum cliente aqui.</div> :
        <div className="card" style={{ padding: 0, overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead><tr><th style={th}>Visitado pelo consultor (360)</th><th style={th}>Quem comprou (Exact)</th><th style={th}>Validação</th></tr></thead>
          <tbody>{vis.slice(0, 300).map((l: any) => (
            <tr key={l.v.id} style={{ background: l.difere ? "rgba(214,150,40,.08)" : undefined }}>
              <td style={{ ...td, width: "38%" }}>
                <a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(l.v.id); }}><b>{l.v.cliente}</b></a> <span className="hint">{l.v.id}</span>
                <div className="hint">{l.v.telefone || "sem telefone"}{l.v.clienteDoc ? " · CPF " + l.v.clienteDoc : ""}</div>
                <div className="hint">consultor {R.nomeUser(l.v.consultorId)}{l.v.dataVisita ? " · visita " + fmtDateTime(l.v.dataVisita) : ""}</div>
                <span className="pill" style={{ marginTop: 4, cursor: "pointer" }} onClick={() => setModal(<Galeria360 lista={[l.v]} titulo={l.v.cliente} />)}>📷 {l.nImg} foto(s) · ver</span>
              </td>
              <td style={{ ...td, width: "40%" }}>
                {!l.achados.length ? <span className="hint">nenhuma medida/checklist do Exact encontrada</span> :
                  l.achados.map((a: any) => <div key={a.c.id} style={{ marginBottom: 6 }}>
                    <a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(a.c.id); }}><b>{a.c.cliente}</b></a>
                    <div className="hint">{a.c.tipo === "medidas" ? "📐 medida" : "✓ checklist"} · venda {a.c.pedido || "—"}{a.c.tipo === "medidas" && ETAPA_MEDIDA[R.etapaMedida(a.c)] ? " · " + ETAPA_MEDIDA[R.etapaMedida(a.c)] : ""}{a.c.telefone ? " · " + a.c.telefone : ""}</div>
                    <div className="hint">cruzou pelo {COMO_MD[a.como]}</div>
                    {a.c.tipo === "medidas" && (() => { const w = ondeMedida(R, st, a.c); return w.k ? <span className={"md-onde " + w.k} style={{ marginLeft: 0 }}>{w.txt}</span> : null; })()}
                  </div>)}
              </td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                {!l.achados.length ? <span className="pill">sem compra</span> :
                  l.achados.map((a: any) => <div key={a.c.id} style={{ marginBottom: 6 }}>{a.igual ? <span className="pill" style={{ background: "var(--st-concluida)", color: "#fff" }}>✔ mesmo cliente</span> : <span className="pill" style={{ background: "var(--warn)", color: "#fff" }} title="O nome de quem comprou é diferente do cliente visitado — confira se é a mesma família/compra">⚠️ nome diferente · validar</span>}</div>)}
              </td>
            </tr>))}</tbody></table></div>}
      {vis.length > 300 && <div className="hint">Mostrando 300 de {vis.length}. Use a busca.</div>}
    </section>
  );
}

// ---------- solicitações que o call center abriu para o setor de Medidas (não são ordens de medida) ----------
function FilaCallcenter() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const [f, setF] = useState<"abertas" | "finalizadas">("abertas");
  const todas = st.chamados.filter((c: any) => c.tipo === "solicitacao_medida" && R.podeVer(c));
  const abertas = todas.filter((c: any) => c.status !== "concluida"), fin = todas.filter((c: any) => c.status === "concluida");
  const lista = (f === "abertas" ? R.ordenar(abertas) : fin.slice().sort((a: any, b: any) => String(b.criadoEm).localeCompare(String(a.criadoEm))));
  return (
    <section className="view active">
      <div className="view-head"><div><h2>📞 Fila do call center</h2><p>Solicitações de medida abertas pelo call center. Trate cada uma e finalize o ticket com a resposta — o call center vê. Só use “Encaminhar para medir” quando o cliente precisar de medição; se foi só uma tratativa, finalize direto.</p></div></div>
      <div className="subnav" style={{ marginBottom: 12 }}>
        <button className={f === "abertas" ? "on" : ""} onClick={() => setF("abertas")}>Em aberto ({abertas.length})</button>
        <button className={f === "finalizadas" ? "on" : ""} onClick={() => setF("finalizadas")}>Finalizadas ({fin.length})</button>
      </div>
      {!lista.length ? <div className="card" style={{ padding: 20, textAlign: "center", color: "var(--ink-faint)" }}>{f === "abertas" ? "Nenhuma solicitação do call center em aberto. 👍" : "Nenhuma finalizada ainda."}</div> :
        <div className="list">{lista.map((c: any) => <Ticket key={c.id} c={c} resposta />)}</div>}
    </section>
  );
}

// ---------- listas da Supervisão de Medidas e "Medidas para fazer" (consultor / medidor) ----------
const ABAS_MD: Record<string, [string, string]> = {
  pendentes: ["Pendentes para medir", "Medidas a programar: direcione para um medidor (Cesar, Gilberto) ou para um consultor externo, com data e endereço."],
  agendadas: ["Aguardando medição", "Medições direcionadas, aguardando quem mede anexar as fotos/planta e finalizar."],
  analise: ["Aguardando análise", "Medidas feitas (medidores / consultores) e as que vieram do cruzamento com o Minha Visita. Aprove como medida oficial ou peça para refazer."],
  aprovados: ["Aprovados — medida oficial", "Medidas aprovadas: o checklist da venda mostra “medida oficial” e as fotos ficam disponíveis para o projetista."],
  obra: ["Em obra", "Clientes em obra: não permite a medida oficial. Volte para pendente quando a obra terminar."],
  minhasfeitas: ["Medidas finalizadas", "Medidas que você já fez: aguardando análise da supervisão ou aprovadas. Cada medida paga R$ 40, sem comissão."],
  minhas: ["Medidas para fazer", "Solicitações de MEDIDA — não é visita de venda: paga R$ 40 por cliente, sem comissão. Depois de medir, anexe as fotos/planta e finalize."],
};
function ListaMedidas({ aba }: { aba: string }) {
  const { R, st, abrirDetalhe, executar: ex } = useApp() as any;
  // aprovar direto da lista (quando a análise foi feita em outro sistema)
  const aprovar = (c: any) => { if (!confirm("Aprovar a medida de " + c.cliente + " (venda " + (c.pedido || "—") + ") como medida oficial?")) return; ex(() => A.medidaLiberar(c.id, "Aprovada pela lista"), "Medida aprovada — medida oficial"); };
  const [q, setQ] = useState("");
  // filtros da Supervisão: quem mede, data da medição e data do checklist
  const [fQuem, setFQuem] = useState(""); const [dDe, setDDe] = useState(""); const [dAte, setDAte] = useState(""); const [cDe, setCDe] = useState(""); const [cAte, setCAte] = useState("");
  const [t, d] = ABAS_MD[aba] || ABAS_MD.pendentes;
  const eu = R.currentUserId;
  const ckPorVenda: Record<string, any> = {};
  st.chamados.filter((c: any) => c.tipo === "checklist" && c.status !== "concluida").forEach((c: any) => (ckPorVenda[c.pedido] = c));
  let lista = st.chamados.filter((c: any) => c.tipo === "medidas" && R.podeVer(c));
  lista = aba === "minhas" ? lista.filter((c: any) => c.medidorId === eu && ["agendada"].includes(R.etapaMedida(c)))
    : aba === "minhasfeitas" ? lista.filter((c: any) => c.medidorId === eu && ["realizada", "validar", "liberada"].includes(R.etapaMedida(c)))
    : lista.filter((c: any) => grupoMedida(R.etapaMedida(c)) === aba);
  const [onde, setOnde] = useState<"" | "no360" | "visita" | "fora">("");
  const contaOnde = aba === "aprovados" ? lista.reduce((acc: any, c: any) => { const k = ondeMedida(R, st, c).k; acc[k] = (acc[k] || 0) + 1; return acc; }, {}) : {};
  if (aba === "aprovados" && onde) lista = lista.filter((c: any) => ondeMedida(R, st, c).k === onde);
  const busca = tira(q), dig = so(q);
  if (q) lista = lista.filter((c: any) => tira(c.cliente + " " + R.nomeUser(c.medidorId || "")).includes(busca) || (dig.length >= 3 && (String(c.pedido).includes(dig) || so(c.telefone).includes(dig))));
  const [ckMeu, setCkMeu] = useState<Record<string, string>>({});
  useEffect(() => { if (aba === "minhas" || aba === "minhasfeitas") A.minhasMedidasChecklist().then(setCkMeu).catch(() => setCkMeu({})); }, [aba]);
  const diaCk = (c: any) => { const k = ckPorVenda[c.pedido]; return k && k.tratativa?.checklist?.etapa === "agendado" ? String(k.tratativa.checklist.agendadoPara || "").slice(0, 16) : String(ckMeu[c.pedido] || "").slice(0, 16); };
  // uma pessoa = uma opção: medidor ou consultor, tudo que é dela junto (pelo usuário; o nome em texto é casado com o usuário)
  const nk = (x: string) => tira(String(x || "").trim().split(/\s+/)[0]);
  const quemMede = (c: any) => { const m = c.tratativa?.medida || {};
    const id = c.medidorId || m.consultorVisita || m.realizadaPor;
    if (id && R.nomeUser(id) !== "—") return R.nomeUser(id);
    if (m.consultorNome) { const u = (st.usuarios || []).find((x: any) => x.ativo !== false && nk(x.nome) === nk(m.consultorNome)); return u ? u.nome : m.consultorNome; }
    return "Sem medidor"; };
  // data da medição: agendada → dia marcado; feita → quando foi medida; aprovada → quando foi aprovada; pendente → quando entrou
  const dataMed = (c: any) => { const m = c.tratativa?.medida || {}, e = R.etapaMedida(c);
    return String((e === "agendada" ? c.dataMedida : e === "liberada" ? (m.liberadaEm || m.realizadaEm || c.dataMedida) : ["realizada", "validar"].includes(e) ? (m.realizadaEm || c.dataMedida) : null) || c.criadoEm || "").slice(0, 10); };
  const opQuem = Array.from(new Set(lista.map(quemMede))).sort((a: any, b: any) => (a === "Sem medidor" ? 1 : 0) - (b === "Sem medidor" ? 1 : 0) || String(a).localeCompare(String(b), "pt-BR"));
  if (fQuem) lista = lista.filter((c: any) => quemMede(c) === fQuem);
  if (dDe || dAte) lista = lista.filter((c: any) => { const x = dataMed(c); return !!x && (!dDe || x >= dDe) && (!dAte || x <= dAte); });
  if (cDe || cAte) lista = lista.filter((c: any) => { const x = diaCk(c).slice(0, 10); return !!x && (!cDe || x >= cDe) && (!cAte || x <= cAte); });
  const temFiltro = !!(fQuem || dDe || dAte || cDe || cAte);
  // "para fazer": o checklist mais próximo vem primeiro (urgência), depois a data marcada da medição
  const ord = (c: any) => aba === "minhas" ? (diaCk(c) || "9") + String(c.dataMedida || "9") : aba === "agendadas" ? String(c.dataMedida || "9") : aba === "minhasfeitas" ? "9" : diaCk(c) || "9" + String(c.criadoEm);
  lista = lista.slice().sort((a: any, b: any) => ord(a).localeCompare(ord(b)));
  const em3 = (iso: string) => { if (!iso) return false; const lim = new Date(); lim.setDate(lim.getDate() + 3); return iso.slice(0, 10) <= lim.toISOString().slice(0, 10); };
  return (
    <section className="view active">
      <div className="view-head"><div><h2>📐 {t}</h2><p>{d}</p></div></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0", flexWrap: "wrap" }}>
        <span className="pill">{lista.length} cliente(s)</span>
        {aba === "aprovados" && <div className="chips" style={{ margin: 0 }}>{([["", "Todas"], ["no360", "📎 Medidas no 360"], ["visita", "📷 Fotos da visita do consultor"], ["fora", "🗂 No outro sistema"]] as [any, string][]).map(([k, l]) =>
          <button key={k} className={"chip" + (onde === k ? " on" : "")} onClick={() => setOnde(k)}>{l}{k ? " (" + (contaOnde[k] || 0) + ")" : ""}</button>)}</div>}
        {aba !== "minhas" && aba !== "minhasfeitas" && R.ehSupMedidas() && <ImportarExact />}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nome, venda, telefone ou quem mede" style={{ marginLeft: "auto", maxWidth: 320 }} />
      </div>
      {aba !== "minhas" && aba !== "minhasfeitas" && <div className="md-filtros" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", margin: "0 0 12px" }}>
        <div className="field" style={{ margin: 0 }}><label>Quem mede</label><select value={fQuem} onChange={e => setFQuem(e.target.value)} style={{ minWidth: 190 }}><option value="">Todos</option>{opQuem.map((x: any) => <option key={x} value={x}>{x}</option>)}</select></div>
        <div className="field" style={{ margin: 0 }}><label>{aba === "agendadas" ? "Data da medição" : aba === "aprovados" ? "Data da aprovação" : aba === "analise" ? "Data em que mediu" : "Data de entrada"} — de</label><input type="date" value={dDe} onChange={e => setDDe(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>até</label><input type="date" value={dAte} onChange={e => setDAte(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>Data do checklist — de</label><input type="date" value={cDe} onChange={e => setCDe(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>até</label><input type="date" value={cAte} onChange={e => setCAte(e.target.value)} /></div>
        {temFiltro && <button className="btn sm" onClick={() => { setFQuem(""); setDDe(""); setDAte(""); setCDe(""); setCAte(""); }}>Limpar filtros</button>}
      </div>}
      {!lista.length ? <div className="card" style={{ padding: 20, textAlign: "center", color: "var(--ink-faint)" }}>Nenhum cliente aqui.</div> :
        <div className="card" style={{ padding: 0 }}>{lista.map((c: any) => {
          const m = (c.tratativa && c.tratativa.medida) || {}, dck = diaCk(c), alerta = aba !== "aprovados" && dck && em3(dck);
          // aguardando análise: linha em roxo claro quando tem foto (da medida ou da visita do consultor no 360)
          const temFoto = aba === "analise" && ((c.anexos || []).some((x: any) => x.tipo === "img") || achar360(R, st, c).some((v: any) => (v.anexos || []).some((x: any) => x.tipo === "img")));
          return (
            <div key={c.id} className={"acao" + (temFoto ? " md-comfoto" : "")} title={temFoto ? "Tem foto" : undefined} style={{ borderLeftColor: alerta ? "var(--critico)" : temFoto ? "#7a3fb0" : "var(--line)", margin: 0, borderRadius: 0, borderBottom: "1px solid var(--line-soft)" }} onClick={() => abrirDetalhe(c.id)}>
              <span><b>{c.cliente}</b> · venda {c.pedido || "—"} <Selo360 c={c} />
                {/* dois tipos de medida, bem separados: do CONSULTOR (antes da venda) e do MEDIDOR (pedida depois da venda — mesmo que quem foi seja um consultor) */}
                {(() => { const o = origemMedida(R, c); return o.txt ? <> <span className={"md-tipo " + o.cls}>{o.txt}</span> {o.quem}</> : o.quem ? <> · {o.quem}</> : null; })()}
                {(() => { const w = ondeMedida(R, st, c); return w.k ? <span className={"md-onde " + w.k}>{w.txt}</span> : null; })()}
                {c.dataMedida && ["agendada"].includes(R.etapaMedida(c)) ? <> · {fmtDateTime(c.dataMedida)}</> : null}
                {m.origem === "minha_visita" && <span className="pill" style={{ marginLeft: 6 }}>Minha Visita · sem pagamento</span>}
                {m.etapa === "em_obra" && m.previsaoObra && <span className="pill" style={{ marginLeft: 6 }}>previsão {String(m.previsaoObra).split("-").reverse().join("/")}</span>}
                {(aba === "minhas" || aba === "minhasfeitas") && <span className="pill" style={{ marginLeft: 6 }}>{ETAPA_MEDIDA[R.etapaMedida(c)] || ""}</span>}
                {aba === "minhas" && <span className="pill" style={{ marginLeft: 6, background: "var(--st-concluida)", color: "#fff" }}>MEDIDA · R$ 40 · sem comissão</span>}
                {c.endereco ? <span className="hint"> · {c.endereco}</span> : null}</span>
              <span className="g" style={alerta ? { color: "var(--critico)", fontWeight: 700 } : undefined}>{dck ? (alerta ? "⚠️ " : "") + "checklist " + fmtDateTime(dck) : ""}
                {aba === "analise" && R.ehSupMedidas() && <button className="btn primary sm" style={{ marginLeft: 8 }} onClick={e => { e.stopPropagation(); aprovar(c); }}>✅ Aprovar</button>}</span>
            </div>);
        })}</div>}
    </section>
  );
}

function Cruzar() {
  const { st, toast, recarregar } = useApp() as any;
  const [mvs, setMvs] = useState<Arq[]>([]);
  const [ex, setEx] = useState<Arq | null>(null);
  const [res, setRes] = useState<Res[] | null>(null);
  const [f, setF] = useState<"todos" | "ok" | "sem">("todos");
  const [fc, setFc] = useState<Conf>("nao");
  const [salvando, setSalvando] = useState(false);
  const inMv = useRef<HTMLInputElement>(null), inEx = useRef<HTMLInputElement>(null);
  const totalMv = mvs.reduce((a, b) => a + b.linhas.length, 0);

  async function addMv(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const l = await lerArquivo(file);
        if (!l.length || !Object.keys(l[0]).some(k => /celular|telefone/i.test(k))) { toast(file.name + ": não achei a coluna de celular — é a planilha do Minha Visita (customers)?"); continue; }
        setMvs(x => [...x, { nome: file.name, linhas: l }]); setRes(null);
      } catch (e: any) { toast(file.name + ": " + (e.message || "não consegui ler")); }
    }
    if (inMv.current) inMv.current.value = "";
  }
  async function addEx(file: File | undefined) {
    if (!file) return;
    try {
      const l = await lerArquivo(file);
      if (tipoPlanilha(l) === "exact") throw new Error("este é o relatório de vendas do Exact — para cruzar vendas use o menu 🔎 Encontrar vendas");
      if (!l.length || !("Título" in l[0] || "Contato" in l[0])) throw new Error("não reconheci — preciso das colunas Título e Contato (planilha Tickets do Exact)");
      setEx({ nome: file.name, linhas: l }); setRes(null);
    } catch (e: any) { toast(file.name + ": " + (e.message || "não consegui ler")); }
    if (inEx.current) inEx.current.value = "";
  }
  async function gravar() {
    if (!res) return;
    const l = res.filter(r => r.venda);
    if (!l.length) { toast("Nenhuma linha com nº de venda para gravar"); return; }
    setSalvando(true);
    try { const r = await A.medidasCruzSalvar(l); await recarregar(); toast(`Gravado: ${r.novos} nova(s) venda(s) · ${r.atualizados} atualizada(s) — já aparece no Checklist`); }
    catch (e: any) { toast(e.message); } finally { setSalvando(false); }
  }
  const salvoDe = (r: any) => (st.medidasCruz || {})[r.venda];
  const nConf = (res || []).filter(r => conferido(salvoDe(r))).length;
  const daSit = (res || []).filter(r => fc === "todos" || (fc === "sim") === conferido(salvoDe(r)));
  const lista = daSit.filter(r => f === "todos" || r.resultado === f);
  const nOk = daSit.filter(r => r.resultado === "ok").length, nSem = daSit.length - nOk;
  const caixa: React.CSSProperties = { flex: 1, minWidth: 280, border: "2px dashed var(--line)", borderRadius: 12, padding: 14, background: "var(--surface-2)" };

  return (
    <section className="view active">
      <div className="view-head"><div><h2>Cruzar Minha Visita × Exact</h2>
        <p>Anexe as planilhas do Minha Visita (customers — quantas precisar) e a do Exact (Tickets aguardando medição). O cruzamento é pelo telefone: comprador que foi visitado por consultor = <b>medidas oficiais ok</b>; sem visita = <b>sem medidas</b>.</p></div></div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "10px 0" }}>
        <div style={caixa}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>🏠 Minha Visita (customers) <span className="pill">{totalMv} clientes</span></div>
          {mvs.map((a, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 0" }}>📄 <span style={{ flex: 1 }}>{a.nome}</span><span className="pill">{a.linhas.length}</span>
            <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { setMvs(x => x.filter((_, j) => j !== i)); setRes(null); }}>✕</button></div>)}
          <input ref={inMv} type="file" accept=".csv,.xlsx" multiple style={{ display: "none" }} onChange={e => addMv(e.target.files)} />
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => inMv.current?.click()}>＋ {mvs.length ? "Adicionar outra planilha" : "Adicionar planilha"}</button>
        </div>
        <div style={caixa}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>🧾 Exact (Tickets) {ex && <span className="pill">{ex.linhas.length} compradores</span>}</div>
          {ex ? <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>📄 <span style={{ flex: 1 }}>{ex.nome}</span>
            <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { setEx(null); setRes(null); }}>✕</button></div> : <div className="hint">Nenhuma planilha ainda.</div>}
          <input ref={inEx} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={e => addEx(e.target.files?.[0])} />
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => inEx.current?.click()}>{ex ? "Trocar planilha" : "＋ Adicionar planilha"}</button>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className="btn primary" disabled={!mvs.length || !ex} onClick={() => { setRes(cruzar(mvs.flatMap(a => a.linhas), ex!.linhas)); setF("todos"); }}>🔀 Cruzar</button>
        </div>
      </div>

      {res && <>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "14px 0 8px" }}>
          <ChipsConf v={fc} set={setFc} nNao={res.length - nConf} nSim={nConf} />
          <div className="chips">
            <button className={"chip" + (f === "todos" ? " on" : "")} onClick={() => setF("todos")}>Todos<span className="n">{daSit.length}</span></button>
            <button className={"chip" + (f === "ok" ? " on" : "")} onClick={() => setF("ok")}>✅ Medidas oficiais ok<span className="n">{nOk}</span></button>
            <button className={"chip" + (f === "sem" ? " on" : "")} onClick={() => setF("sem")}>⚠️ Sem medidas<span className="n">{nSem}</span></button>
          </div>
          <button className="btn primary" style={{ marginLeft: "auto" }} disabled={salvando} onClick={gravar}>{salvando ? "Gravando…" : "💾 Gravar resultado (vai para o Checklist)"}</button>
        </div>
        <Tabela linhas={lista.map(r => ({ ...r, salvo: salvoDe(r) }))} />
      </>}
    </section>
  );
}

function Tabela({ linhas }: { linhas: any[] }) {
  const th: React.CSSProperties = { textAlign: "left", padding: "8px 8px", fontSize: 12, color: "var(--ink-soft)", borderBottom: "2px solid var(--line)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--surface)" };
  const td: React.CSSProperties = { padding: "7px 8px", fontSize: 13, borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" };
  if (!linhas.length) return <div className="card" style={{ padding: 20, textAlign: "center", color: "var(--ink-faint)" }}>Nenhum cliente neste filtro.</div>;
  return (
    <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "70vh" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>Cliente comprador (Exact)</th><th style={th}>Venda</th><th style={th}>Telefone</th><th style={th}>Cliente visitado (Minha Visita)</th><th style={th}>Consultor</th><th style={th}>Medidas</th><th style={th}>Tratativa</th></tr></thead>
        <tbody>{linhas.map((r, i) => (
          <tr key={r.venda || r.comprador + i}>
            <td style={td}><b>{r.comprador}</b>{r.medidor ? <div className="hint">medidor: {r.medidor}</div> : null}</td>
            <td style={td}>{r.venda || <span className="hint">sem nº</span>}</td>
            <td style={{ ...td, whiteSpace: "nowrap" }}>{r.telefone}</td>
            <td style={td}>{r.visitado || <span className="hint">—</span>}{r.statusMv ? <div className="hint">{r.statusMv}{r.visitaEm ? " · " + r.visitaEm : ""}</div> : null}{r.outros ? <div className="hint">+{r.outros} cadastro(s) com o mesmo telefone</div> : null}</td>
            <td style={td}>{r.consultor || <span className="hint">—</span>}</td>
            <td style={td}><SeloMedidas resultado={(r.salvo?.resultado) || r.resultado} /></td>
            <td style={{ ...td, minWidth: 230 }}>{r.venda ? (r.salvo ? <Tratar m={r.salvo} /> : <span className="hint">grave o resultado para registrar a tratativa</span>) : <span className="hint">sem nº de venda</span>}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

export function SeloMedidas({ resultado, peq }: { resultado?: string; peq?: boolean }) {
  if (!resultado) return null;
  const ok = resultado === "ok";
  return <span className="pill" style={{ background: ok ? "var(--st-concluida, #0f8a5f)" : "var(--danger)", color: "#fff", fontWeight: 700, fontSize: peq ? 11.5 : 12.5, whiteSpace: "nowrap" }}>{ok ? "📐 Medidas oficiais ok" : "📐 Sem medidas"}</span>;
}

function Tratar({ m }: { m: any }) {
  const { toast, recarregar } = useApp() as any;
  const [t, setT] = useState(m.tratativa || ""); const [o, setO] = useState(m.obs || ""); const [sal, setSal] = useState(false);
  const mudou = t !== (m.tratativa || "") || o !== (m.obs || "");
  async function salvar(res?: string) {
    setSal(true);
    try { await A.medidasCruzTratar(m.venda, t, o, res); await recarregar(); toast("Tratativa salva"); } catch (e: any) { toast(e.message); } finally { setSal(false); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <select value={t} onChange={e => setT(e.target.value)} style={{ padding: "4px 6px", fontSize: 12.5 }}>{TRATATIVAS.map(x => <option key={x} value={x}>{x || "— escolha —"}</option>)}</select>
      <input value={o} onChange={e => setO(e.target.value)} placeholder="observação" style={{ padding: "4px 6px", fontSize: 12.5 }} />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {mudou && <button className="btn primary sm" disabled={sal} onClick={() => salvar()}>Salvar</button>}
        <button className="btn ghost sm" disabled={sal} title="Corrigir o resultado manualmente" onClick={() => salvar(m.resultado === "ok" ? "sem" : "ok")}>{m.resultado === "ok" ? "marcar sem medidas" : "marcar medidas ok"}</button>
      </div>
      {conferido(m) && <span className="pill" style={{ alignSelf: "flex-start", fontSize: 11 }}>✔️ Conferido</span>}
      {m.atualizadoPor && <span className="hint" style={{ fontSize: 11 }}>{m.atualizadoPor} · {fmtDateTime(m.atualizadoEm)}</span>}
    </div>
  );
}

function Resultados() {
  const { st } = useApp() as any;
  const [f, setF] = useState<"todos" | "ok" | "sem">("todos"); const [q, setQ] = useState(""); const [fc, setFc] = useState<Conf>("nao");
  const todos: any[] = useMemo(() => Object.values(st.medidasCruz || {}).sort((a: any, b: any) => String(b.cruzadoEm).localeCompare(String(a.cruzadoEm))), [st.medidasCruz]);
  const ck = new Set(st.chamados.filter((c: any) => c.tipo === "checklist").map((c: any) => c.pedido));
  const busca = tira(q), dig = so(q);
  const nConf = todos.filter(conferido).length;
  const daSit = todos.filter(m => fc === "todos" || (fc === "sim") === conferido(m));
  const lista = daSit.filter(m => (f === "todos" || m.resultado === f)
    && (!q || tira(m.comprador + m.visitado + m.consultor).includes(busca) || (dig.length >= 3 && (m.venda.includes(dig) || so(m.telefone).includes(dig)))));
  return (
    <section className="view active">
      <div className="view-head"><div><h2>Medidas oficiais</h2>
        <p>Resultado gravado dos cruzamentos, por nº de venda. É isso que aparece nos clientes do Checklist (📐 Medidas oficiais ok / 📐 Sem medidas).</p></div></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "10px 0" }}>
        <ChipsConf v={fc} set={setFc} nNao={todos.length - nConf} nSim={nConf} />
        <div className="chips">
          {([["todos", "Todos", daSit.length], ["ok", "✅ Medidas oficiais ok", daSit.filter(m => m.resultado === "ok").length], ["sem", "⚠️ Sem medidas", daSit.filter(m => m.resultado === "sem").length]] as [any, string, number][])
            .map(([k, l, n]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{n}</span></button>)}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nome, venda, telefone ou consultor" style={{ marginLeft: "auto", maxWidth: 320 }} />
      </div>
      <div className="hint" style={{ marginBottom: 6 }}>{todos.filter(m => ck.has(m.venda)).length} dessas vendas estão no Checklist.</div>
      <Tabela linhas={lista.map(m => ({ ...m, salvo: m }))} />
    </section>
  );
}

/** situação da medida de uma venda (para o checklist): medida oficial aprovada, em análise, agendada, pendente ou em obra */
/** onde estão as medidas: anexadas no 360, nas fotos da visita do consultor, ou (aprovada sem anexo) no outro sistema */
export function ondeMedida(R: any, st: any, c: any): { k: "no360" | "visita" | "fora" | ""; txt: string; n: number } {
  if (!c) return { k: "", txt: "", n: 0 };
  const n = (c.anexos || []).length;
  if (n) return { k: "no360", txt: "📎 Medidas no 360 (" + n + " anexo" + (n > 1 ? "s" : "") + ")", n };
  const m = c.tratativa?.medida || {};
  const vis = [m.visita360 && st.chamados.find((x: any) => x.id === m.visita360), ...achar360(R, st, c)].filter(Boolean);
  const nv = vis.reduce((s: number, v: any) => s + (v.anexos || []).length, 0);
  if (nv) return { k: "visita", txt: "📷 Fotos da visita do consultor (" + nv + ")", n: nv };
  if (R.etapaMedida(c) === "liberada") return { k: "fora", txt: "🗂 Medidas no outro sistema (sem anexo no 360)", n: 0 };
  return { k: "", txt: "", n: 0 };
}
/** quem mediu: consultor (antes da venda), medidor (depois da venda), pós-venda ou aprovada fora do 360 */
export function origemMedida(R: any, c: any): { cls: string; txt: string; quem: string } {
  const m = c?.tratativa?.medida || {};
  if (/p[óo]s-?venda/i.test(c?.setor || "")) return { cls: "pv", txt: "🛠 PÓS-VENDA", quem: c.medidorId ? R.nomeUser(c.medidorId) : "" };
  if (c?.medidorId) return { cls: "med", txt: "📐 MEDIDOR · depois da venda", quem: R.nomeUser(c.medidorId) };
  if (m.etapa === "validar" || m.origem === "consultor_360" || m.origem === "minha_visita") return { cls: "cons", txt: "📷 CONSULTOR · antes da venda", quem: m.consultorNome || "" };
  if (m.origem === "outro_sistema") return { cls: "fora", txt: "🗂 OUTRO SISTEMA", quem: "" };
  return { cls: "", txt: "", quem: m.consultorNome || "" };
}
export function medidaDaVenda(st: any, pedido: string) {
  if (!pedido) return null;
  const l = st.chamados.filter((c: any) => c.tipo === "medidas" && c.pedido === pedido);
  return l.find((c: any) => c.tratativa?.medida?.etapa === "liberada") || l.find((c: any) => c.status !== "concluida") || l[0] || null;
}
export function SeloMedidaVenda({ pedido, peq, comLink }: { pedido: string; peq?: boolean; comLink?: boolean }) {
  const { st, R, abrirDetalhe } = useApp() as any;
  const m = medidaDaVenda(st, pedido);
  if (!m) { const x = (st.medidasCruz || {})[pedido]; return x ? <SeloMedidas peq={peq} resultado={x.resultado} /> : null; }
  const e = R.etapaMedida(m), md = m.tratativa?.medida || {};
  const [txt, cor] = e === "liberada" ? ["📐 Medida oficial aprovada", "var(--st-concluida, #0f8a5f)"] : e === "realizada" || e === "validar" ? ["📐 Medida em análise", "var(--primary)"]
    : e === "agendada" ? ["📐 Medição " + (m.dataMedida ? fmtDateTime(m.dataMedida) : "agendada") + (m.medidorId ? " · " + R.nomeUser(m.medidorId) : ""), "var(--warn)"]
    : e === "em_obra" ? ["🚧 Em obra — sem medida oficial", "var(--ink-soft)"] : ["📐 Medida pendente", "var(--danger)"];
  const quem = m.medidorId ? R.nomeUser(m.medidorId) : md.consultorNome || "";
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
    <span className="pill" style={{ background: cor, color: "#fff", fontWeight: 700, fontSize: peq ? 11.5 : 12.5, whiteSpace: "nowrap" }}>{txt}</span>
    {!peq && ["liberada", "realizada", "validar"].includes(e) && quem ? <span className="hint">medido por {quem}</span> : null}
    {(() => { const o = origemMedida(R, m); return ["liberada", "realizada", "validar"].includes(e) && o.txt ? <span className={"md-tipo " + o.cls} style={{ marginLeft: 0 }}>{o.txt}{peq && o.quem ? " · " + o.quem : ""}</span> : null; })()}
    {(() => { const w = ondeMedida(R, st, m); return e === "liberada" && w.k ? <span className={"md-onde " + w.k}>{w.txt}</span> : null; })()}
    {comLink && <a href="#" onClick={ev => { ev.preventDefault(); ev.stopPropagation(); abrirDetalhe(m.id); }} style={{ fontSize: 12.5 }}>ver medida e fotos ({(m.anexos || []).length})</a>}
  </span>;
}

// ---------- importar as planilhas de tickets do Exact (Situação: PENDENTES · AGUARDANDO MEDIÇÃO · ANÁLISE · APROVADOS) ----------
const ROT_ETAPA: Record<string, string> = { pendente: "Pendentes para medir", agendada: "Aguardando medição", realizada: "Aguardando análise", liberada: "Aprovados" };
function ImportarExact() {
  const { setModal, toast } = useApp() as any;
  const ref = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  async function ler(files: FileList | null) {
    if (!files || !files.length) return;
    setLendo(true);
    try {
      let dados: any[] = [];
      for (const f of Array.from(files)) {
        const l = await lerXlsx(f);
        if (!l.length || !("Situação" in l[0]) || !("Título" in l[0])) throw new Error(f.name + ": não reconheci — preciso da planilha de tickets do Exact (colunas Título e Situação)");
        dados = dados.concat(l.map(linhaMedida));
      }
      const semEtapa = dados.filter(d => !d.etapa).length;
      const ok = dados.filter(d => d.etapa);
      if (!ok.length) throw new Error("Nenhuma linha com Situação PENDENTES, AGUARDANDO MEDIÇÃO, ANÁLISE ou APROVADOS");
      const prev = await A.medidasImportar(ok, false);
      setModal(<ModalImportarMedidas dados={ok} prev={prev} semEtapa={semEtapa} />);
    } catch (e: any) { toast(e.message || "Não foi possível ler a planilha"); }
    finally { setLendo(false); if (ref.current) ref.current.value = ""; }
  }
  return <>
    <input ref={ref} type="file" accept=".xlsx" multiple style={{ display: "none" }} onChange={e => ler(e.target.files)} />
    <button className="btn primary sm" disabled={lendo} onClick={() => ref.current?.click()}>{lendo ? "Lendo…" : "📥 Importar planilha do Exact"}</button>
  </>;
}
function ModalImportarMedidas({ dados, prev, semEtapa }: { dados: any[]; prev: any; semEtapa: number }) {
  const { setModal, toast, recarregar, R, st } = useApp() as any;
  // clientes da planilha que já tiveram visita de consultor no 360 (fotos prontas para o Exact)
  const com360 = dados.map(d => ({ d, v: achar360(R, st, { id: "", telefone: d.telefone, cliente: d.cliente }) })).filter(x => x.v.length);
  const nFotos360 = (x: any) => x.v.reduce((s: number, v: any) => s + (v.anexos || []).length, 0);
  const [sal, setSal] = useState(false); const [ver, setVer] = useState("");
  const fechar = () => setModal(null);
  const porEtapa: Record<string, number> = {}; dados.forEach(d => (porEtapa[d.etapa] = (porEtapa[d.etapa] || 0) + 1));
  async function ok() {
    setSal(true);
    try { const r = await A.medidasImportar(dados, true); await recarregar(); fechar(); toast(`${r.novos} medida(s) nova(s) · ${r.avancam} avançaram de etapa`); }
    catch (x: any) { toast(x.message); setSal(false); }
  }
  const L = ({ n, t, lista, id, cor }: any) => <>
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <b style={{ fontSize: 20, minWidth: 48, textAlign: "right", color: cor }}>{n}</b><span style={{ flex: 1 }}>{t}</span>
      {n > 0 && lista && <button className="btn ghost sm" onClick={() => setVer(ver === id ? "" : id)}>{ver === id ? "esconder" : "ver"}</button>}
    </div>
    {ver === id && <ul style={{ maxHeight: 200, overflow: "auto", fontSize: 12.5, margin: "4px 0 8px", padding: "6px 8px 6px 26px", background: "var(--surface-2)", borderRadius: 8 }}>{lista.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>}
  </>;
  return (
    <Modal titulo="Importar medidas do Exact" onFechar={fechar}>
      <div className="hint" style={{ marginBottom: 6 }}>Na planilha: {Object.entries(porEtapa).map(([e, n]) => `${ROT_ETAPA[e]} ${n}`).join(" · ")}</div>
      {Object.entries(prev.listaNovos || {}).map(([e, l]: any) => <L key={e} id={"n" + e} n={l.length} t={<>novas em <b>{ROT_ETAPA[e]}</b></>} lista={l} cor="var(--st-concluida)" />)}
      {!prev.novos && <L n={0} t="medidas novas" />}
      <L id="a" n={prev.avancam} t="já estão no 360 e avançam de etapa" lista={prev.listaAvancam} cor="var(--primary)" />
      <L n={prev.iguais} t="já estão no 360 na mesma etapa (ou mais adiante, em obra ou aprovadas) — não mudam" />
      <L id="v360" n={com360.length} t={<>tiveram <b>visita do consultor no 360</b> (antes da venda) — as fotos aparecem na ficha para baixar e salvar no Exact</>} cor="#7a3fb0"
        lista={com360.map(x => `${x.d.cliente} · venda ${x.d.venda} — consultor ${x.v.map((v: any) => R.nomeUser(v.consultorId)).join(", ")} · ${nFotos360(x)} arquivo(s)`)} />
      {prev.semVenda > 0 && <div className="hint" style={{ marginTop: 6, color: "var(--warn)" }}>{prev.semVenda} linha(s) sem nº de venda (no Título nem na Descrição) — ignoradas.</div>}
      {semEtapa > 0 && <div className="hint" style={{ marginTop: 4 }}>{semEtapa} linha(s) com outra Situação — ignoradas.</div>}
      {(prev.medidorDesconhecido || []).length > 0 && <div className="hint" style={{ marginTop: 4, color: "var(--warn)" }}>Medidor não encontrado no 360 (fica só o nome do Exact): <b>{prev.medidorDesconhecido.join(", ")}</b></div>}
      <div className="hint" style={{ marginTop: 8 }}>Medidas já feitas fora do 360 (análise / aprovados) entram sem o pagamento de R$ 40 no 360. Aprovados ficam como medida oficial no checklist da venda.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn primary" disabled={sal || (!prev.novos && !prev.avancam)} onClick={ok}>{sal ? "Importando…" : "OK, importar"}</button>
      </div>
    </Modal>
  );
}
