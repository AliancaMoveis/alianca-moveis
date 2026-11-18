// App de campo: medidas (medidor e consultor) e pedidos de reembolso (pedágio, estacionamento…).
import { useEffect, useState } from "react";
import { ImagensVenda, Anteriores } from "../comp/MedidaArquivos";
import { useApp } from "../estado";
import { A, comprimir } from "../lib/acoes";
import { DataCalendario } from "../comp/DataCalendario";
import { ETAPA_MEDIDA, TIPO_REEMBOLSO, fmtDate, fmtDateTime, fmtMoeda, hojeISO, isoLocal, parseMoeda } from "../lib/regras";

const hora = (v: any) => { const s = String(v || ""); return s.length > 10 ? s.slice(11, 16) : ""; };
const dia = (v: any) => String(v || "").slice(0, 10);
const diaCurto = (v: any) => { const d = dia(v); if (!d) return "sem data"; if (d === hojeISO()) return "hoje"; const a = new Date(); a.setDate(a.getDate() + 1); if (d === isoLocal(a)) return "amanhã"; return fmtDate(d).slice(0, 5); };

/** ordem de quem está a medir: primeiro quem tem checklist marcado (o limite mais próximo — 5 dias antes do checklist — vem primeiro);
 *  sem data de checklist, pela data da venda (a venda mais antiga primeiro) */
export function ordemMedir(st: any, c: any) {
  const pz = prazoMedida(st, c);
  return pz ? "0" + pz.limite + String(c.dataMedida || "9") : "1" + String(c.dataVenda || "9") + String(c.criadoEm || "");
}
export function medDados(R: any) {
  const todas = R.medidasDe(R.currentUserId).slice().sort((a: any, b: any) => String(a.dataMedida || "9").localeCompare(String(b.dataMedida || "9")));
  const aFazer = todas.filter((c: any) => R.etapaMedida(c) === "agendada").sort((a: any, b: any) => ordemMedir(R.state, a).localeCompare(ordemMedir(R.state, b)));
  const hoje = aFazer.filter((c: any) => dia(c.dataMedida) === hojeISO());
  const atrasadas = aFazer.filter((c: any) => c.dataMedida && dia(c.dataMedida) < hojeISO());
  const feitas = todas.filter((c: any) => c.tratativa && c.tratativa.medida && c.tratativa.medida.realizadaEm).sort((a: any, b: any) => String(b.tratativa.medida.realizadaEm).localeCompare(String(a.tratativa.medida.realizadaEm)));
  return { todas, aFazer, hoje, atrasadas, feitas };
}

/** os 3 tipos de cliente do consultor no celular:
 *  pré-venda (visita para vender, gera comissão) · medida pós-venda (cliente já comprou, só medir, sem comissão)
 *  · confirmação (medida que já foi feita, não foi aprovada e voltou com a lista do que está faltando). */
export type TipoCliente = "pre" | "pos" | "confirmacao";
export const TIPO_CLIENTE: Record<TipoCliente, { ic: string; t: string; s: string; cor: string; bg: string }> = {
  pre: { ic: "🟢", t: "VISITA DE VENDA", s: "pré-venda · você vai vender · gera comissão", cor: "#1f7a3a", bg: "rgba(47,122,63,.12)" },
  pos: { ic: "🟣", t: "MEDIDA PÓS-VENDA", s: "o cliente já comprou · só medir · não é venda · sem comissão", cor: "#7c3aed", bg: "rgba(124,58,237,.12)" },
  confirmacao: { ic: "🔵", t: "CONFIRMAÇÃO DE MEDIDA", s: "cliente que você já visitou ou medida devolvida · confirme e complete", cor: "#1d6fd1", bg: "rgba(29,111,209,.12)" },
};
const tel8 = (x: any) => String(x || "").replace(/\D/g, "").slice(-8);
/** medida: confirmação (foi feita, não foi aprovada e voltou — no 360 ou pelo Exact) ou pós-venda; a Gestão / Medidas pode trocar */
export function tipoMedida(c: any, _st?: any): "pos" | "confirmacao" {
  const m = (c.tratativa && c.tratativa.medida) || {};
  if (m.tipoVisita === "pos") return "pos";
  if (m.tipoVisita === "confirmacao") return "confirmacao";
  // medida devolvida (faltou algo / refazer / nova medição no Exact)
  if ((m.faltando && m.faltando.length) || m.refazer || m.motivoNovaExact) return "confirmacao";
  // quem vai medir é o mesmo consultor que visitou o cliente antes da venda → confirmação do que ele já mediu
  if (m.consultorVisita && m.consultorVisita === c.medidorId) return "confirmacao";
  const t = tel8(c.telefone);
  if (t.length < 8 || !c.medidorId || !_st) return "pos";
  return (_st.chamados || []).some((v: any) => v.tipo === "visita_consultor" && v.consultorId === c.medidorId && tel8(v.telefone) === t && String(v.criadoEm || "") < String(c.criadoEm || "9")) ? "confirmacao" : "pos";
}
export function SeloTipo({ tipo, grande }: { tipo: TipoCliente; grande?: boolean }) {
  const x = TIPO_CLIENTE[tipo];
  return grande ? <div style={{ background: x.bg, border: "2px solid " + x.cor, borderRadius: 12, padding: "10px 12px", margin: "6px 0 10px" }}>
    <div style={{ color: x.cor, fontWeight: 900, fontSize: 16 }}>{x.ic} {x.t}</div><div style={{ fontSize: 13.5, marginTop: 2 }}>{x.s}</div></div>
    : <span style={{ display: "inline-block", fontSize: 10, fontWeight: 900, letterSpacing: ".03em", background: x.cor, color: "#fff", borderRadius: 5, padding: "1px 6px", verticalAlign: 2 }}>{x.ic} {x.t}</span>;
}

/** prazo da medida: a data limite definida pela Supervisão de Medidas (Luciene) no 360 vale acima de tudo;
 *  senão, a mais cedo entre a data limite do Exact e 5 dias antes do checklist marcado. */
export type Prazo = { ck: string; limite: string; fonte: "360" | "exact" | "checklist" };
const ROT_FONTE: Record<string, string> = { "360": "definida pela Supervisão de Medidas", exact: "data limite do Exact", checklist: "5 dias antes do checklist" };
export const rotPrazo = (pz: Prazo) => ROT_FONTE[pz.fonte];
export function prazoMedida(st: any, c: any): Prazo | null {
  const m = (c.tratativa && c.tratativa.medida) || {};
  const p = String(c.pedido || "").trim();
  const ds = !p ? [] : (st.chamados || []).filter((k: any) => k.tipo === "checklist" && String(k.pedido || "").trim() === p && ["agendado", "realizado"].includes(((k.tratativa || {}).checklist || {}).etapa))
    .map((k: any) => String(k.tratativa.checklist.agendadoPara || "")).filter(Boolean).sort();
  const ex = String(m.dataChecklistExact || "").slice(0, 16);
  if (!ds.length && ex) ds.push(ex);
  const ck = ds[0] || "";
  if (m.dataLimite) return { ck, limite: String(m.dataLimite).slice(0, 10), fonte: "360" };
  const op: Prazo[] = [];
  if (ck) { const d = new Date(ck.slice(0, 10) + "T12:00:00"); d.setDate(d.getDate() - 5); op.push({ ck, limite: isoLocal(d), fonte: "checklist" }); }
  if (m.prazoExact) { const d = new Date(String(m.prazoExact).replace(" ", "T").replace(/\+00$/, "+00:00")); if (!isNaN(+d)) op.push({ ck, limite: isoLocal(d), fonte: "exact" }); }
  if (!op.length) return null;
  return op.sort((a, b) => a.limite.localeCompare(b.limite))[0];
}

export function CartaoMedida({ c, abrir }: any) {
  const { R, st } = useApp() as any;
  const etapa = R.etapaMedida(c);
  const m = (c.tratativa && c.tratativa.medida) || {};
  const pz = prazoMedida(st, c);
  const aFazer = etapa === "agendada";
  const estourou = aFazer && pz && ((c.dataMedida && dia(c.dataMedida) > pz.limite) || hojeISO() > pz.limite);
  return (
    <button className={"mv-card med" + (estourou ? " atras" : "")} onClick={() => abrir(c.id)}>
      <div className="mv-card-h"><b>{hora(c.dataMedida)}</b><small>{c.dataMedida ? diaCurto(c.dataMedida) : aFazer ? "combine a data" : "sem data"}</small></div>
      <div className="mv-card-c"><div className="nm"><SeloTipo tipo={tipoMedida(c, st)} /> {c.cliente}{!(c.anexos || []).length && aFazer ? " ⚠️" : ""}</div>
        <div className="sb">{pz ? (pz.ck ? "Checklist " + fmtDate(pz.ck).slice(0, 5) + " · " : "") + "medir até " + fmtDate(pz.limite).slice(0, 5) : "sem data limite · venda " + (c.dataVenda ? fmtDate(c.dataVenda).slice(0, 5) : "—")}</div>
        <div className="sb">🧾 venda {c.pedido || "—"}{(() => { const a = [m.qtdAmbientes ? m.qtdAmbientes + (m.qtdAmbientes === 1 ? " ambiente" : " ambientes") : "", m.ambientes].filter(Boolean).join(" · "); return a ? " · " + a : ""; })()}</div>
        <div className="sb">📍 {c.endereco || "sem endereço"}</div>
        {estourou && <div className="sb" style={{ color: "var(--danger)", fontWeight: 700 }}>⚠️ Fora do prazo ({rotPrazo(pz!)})</div>}</div>
      <div className="mv-card-d"><span className={"sc sc-med-" + etapa}>{etapa === "agendada" ? "A medir" : etapa === "realizada" ? "Feita" : etapa === "liberada" ? "Liberada" : "Validar"}</span>
        {aFazer && <span className={"mv-cor " + (m.contatoEm ? "ctt" : "semctt")}>{m.contatoEm ? (m.dataCombinadaEm ? "📅 Data combinada" : "📞 Em contato") : "⏳ Sem contato"}</span>}</div>
    </button>
  );
}

// Hoje do medidor
export function MedHoje({ abrir, ir }: any) {
  const { R } = useApp() as any;
  const d = medDados(R);
  const prox = d.atrasadas[0] || d.hoje[0] || d.aFazer[0];
  return <>
    <div className="mv-nums">
      <button className="mv-num" onClick={() => ir("medidas")}><b>{d.hoje.length}</b><span>Medidas hoje</span></button>
      <button className="mv-num" onClick={() => ir("medidas")} style={d.atrasadas.length ? { color: "var(--danger)" } : undefined}><b>{d.atrasadas.length}</b><span>Atrasadas</span></button>
      <button className="mv-num" onClick={() => ir("medidas")}><b>{d.aFazer.length}</b><span>A fazer</span></button>
    </div>
    {prox ? <div className="mv-hero" onClick={() => abrir(prox.id)}>
      <div className="mv-hero-l">{d.atrasadas.includes(prox) ? "Medida atrasada" : "Próxima medida"}</div>
      <div className="mv-hero-q">{diaCurto(prox.dataMedida)} {hora(prox.dataMedida)}</div>
      <div className="mv-hero-n">{prox.cliente}</div>
      <div className="mv-hero-s">{prox.endereco || "sem endereço"}</div>
    </div> : <div className="mv-vazio">Nenhuma medida a fazer. 👍</div>}
    {d.hoje.filter((c: any) => c !== prox).length > 0 && <><div className="mv-sec">Mais medidas hoje</div>{d.hoje.filter((c: any) => c !== prox).map((c: any) => <CartaoMedida key={c.id} c={c} abrir={abrir} />)}</>}
  </>;
}

// lista de medidas (medidor e consultor)
const semAcento = (x: any) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const soDig = (x: any) => String(x || "").replace(/\D/g, "");
export function MedLista({ abrir }: any) {
  const { R } = useApp() as any;
  const d = medDados(R);
  const [f, setF] = useState<"fazer" | "feitas" | "todas">("fazer");
  const [q, setQ] = useState("");
  // busca em TODAS as medidas, em qualquer etapa: nome, CPF, nº da venda, telefone ou nº do chamado
  const txt = semAcento(q.trim()), dig = soDig(q);
  const achados = !q.trim() ? null : d.todas.filter((c: any) =>
    (txt.length >= 2 && semAcento(c.cliente + " " + (c.id || "")).includes(txt))
    || (dig.length >= 3 && (String(c.pedido || "").includes(dig) || soDig(c.telefone).includes(dig) || soDig(c.clienteDoc).includes(dig))));
  const lista = achados || (f === "fazer" ? d.aFazer : f === "feitas" ? d.feitas : d.todas);
  return <>
    <input className="mv-busca" type="search" value={q} onChange={e => setQ(e.target.value)}
      placeholder="🔎 Buscar cliente: nome, CPF, venda ou telefone" />
    {achados ? <div className="mv-dica" style={{ margin: "2px 0 8px" }}>{achados.length} cliente(s) · busca em todas as etapas</div>
      : <div className="mv-seg">{([["fazer", "A fazer", d.aFazer.length], ["feitas", "Feitas", d.feitas.length], ["todas", "Todas", d.todas.length]] as any[]).map(([k, l, n]) =>
        <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{l}<i>{n}</i></button>)}</div>}
    {lista.length ? lista.map((c: any) => <CartaoMedida key={c.id} c={c} abrir={abrir} />) : <div className="mv-vazio">{q.trim() ? "Nenhum cliente encontrado." : "Nada aqui."}</div>}
  </>;
}

/** A venda que gerou a medida: é ela que diz o que medir.
 *  Vinha só no 360 do computador; quem vai a campo abria a ficha e não via nem o número do pedido. */
export function VendaMedida({ c }: { c: any }) {
  const m = (c.tratativa && c.tratativa.medida) || {};
  const amb = [m.qtdAmbientes ? m.qtdAmbientes + (m.qtdAmbientes === 1 ? " ambiente" : " ambientes") : "", m.ambientes].filter(Boolean).join(" · ");
  const linhas: [string, any][] = [
    ["Venda", c.pedido || "—"],
    ["Ambientes", amb],
    ["O que o vendedor pediu", m.obsVenda],
    ["Vendedor", m.vendedor],
    ["Data da venda", c.dataVenda ? fmtDate(c.dataVenda) : ""],
  ].filter(([, v]) => v) as [string, any][];
  return <div style={{ border: "1.5px solid rgba(128,140,160,.35)", borderRadius: 12, padding: "10px 12px", margin: "8px 0" }}>
    <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 2 }}>🧾 A venda <span style={{ fontWeight: 600, fontSize: 12, opacity: .75 }}>· o que o cliente comprou</span></div>
    <div className="mv-info" style={{ margin: 0 }}>{linhas.map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div>
    {!amb && <div style={{ fontSize: 12.5, opacity: .75, marginTop: 4 }}>A venda não diz quais ambientes medir — confirme com o cliente ou com a Supervisão de Medidas.</div>}
  </div>;
}

// ficha da medida no celular
export function FolhaMedida({ c, Contato, Anexar }: any) {
  const { R, executar: ex, toast, abrirDetalhe } = useApp() as any;
  const m = (c.tratativa && c.tratativa.medida) || {};
  const etapa = R.etapaMedida(c);
  const [med, setMed] = useState(m.medidas || ""); const [obs, setObs] = useState(m.obs || "");
  const souEu = c.medidorId === R.currentUserId;
  const conf = tipoMedida(c, R.state) === "confirmacao";
  const devolvida = !!((m.faltando || []).length || m.refazer || m.motivoNovaExact);
  const [aba, setAba] = useState<"falta" | "anteriores">(devolvida ? "falta" : "anteriores");
  return <>
    <div className="mv-cli">📐 {c.cliente}</div>
    <SeloTipo tipo={tipoMedida(c, R.state)} grande />
    <div className="mv-cli-s">Medida · {c.produto || "—"} · <b>{ETAPA_MEDIDA[etapa] || etapa}</b></div>
    <VendaMedida c={c} />
    <div className="mv-info">
      {c.dataMedida && <div><span>Medida</span><b>{fmtDateTime(c.dataMedida)}</b></div>}
      {c.endereco && <div><span>Endereço</span><b>{c.endereco}</b></div>}
      {m.consultorVisita && <div><span>Consultor da visita</span><b>{R.nomeUser(m.consultorVisita)}</b></div>}
      {m.medidasConsultor && <div><span>Medidas do consultor</span><b>{m.medidasConsultor}</b></div>}
      {m.refazer && etapa === "agendada" && !(m.faltando || []).length && <div><span>Refazer</span><b style={{ color: "var(--danger)" }}>{m.refazer}</b></div>}
      {m.motivoNovaExact && etapa === "agendada" && <div><span>Motivo (Exact)</span><b style={{ color: "var(--danger)" }}>{m.motivoNovaExact}</b></div>}
      {m.realizadaEm && <div><span>Feita em</span><b>{fmtDateTime(m.realizadaEm)}</b></div>}
    </div>
    {(() => { const pz = prazoMedida(R.state, c); return pz ? <div className={"mv-prazo-med" + (hojeISO() > pz.limite && etapa === "agendada" ? " atras" : "")}>
      {pz.ck && <div><span>Checklist</span><b>{fmtDateTime(pz.ck)}</b></div>}<div><span>Medir até</span><b>{fmtDate(pz.limite)}</b></div>
      <small>Data limite: {rotPrazo(pz)}{pz.fonte === "360" && m.dataLimitePor ? " (" + m.dataLimitePor + ")" : ""}.</small></div> : null; })()}
    {R.ehSupMedidas() && ["agendada", "pendente"].includes(etapa) && <DataLimite c={c} />}
    {conf ? <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, margin: "6px 0 8px" }}>{([["falta", "⚠️", "O que falta"], ["anteriores", "📷", "Fotos e medidas anteriores"]] as const).map(([k, ic, l]) =>
        <button key={k} type="button" onClick={() => setAba(k)} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "9px 4px", minHeight: 64, borderRadius: 12, font: "inherit", fontSize: 12.5, fontWeight: 800, lineHeight: 1.15, textAlign: "center", cursor: "pointer",
          border: "1.5px solid " + (aba === k ? "#1d6fd1" : "var(--line)"), background: aba === k ? "#1d6fd1" : "var(--surface)", color: aba === k ? "#fff" : "var(--ink)" }}>
          <span style={{ fontSize: 20 }}>{ic}</span>{l}</button>)}</div>
      {aba === "falta" && ((m.faltando || []).length > 0 ? <Faltando c={c} pode={souEu || R.ehSupMedidas()} />
        : <div className="mv-dica" style={{ margin: "6px 0 10px" }}>{m.refazer || m.motivoNovaExact || "Você já visitou este cliente antes da venda. Confira as fotos e medidas anteriores e confirme as medidas."}</div>)}
      {aba === "anteriores" && <Anteriores c={c} />}
    </> : null}
    {/* o projeto que o cliente comprou aparece sempre, em qualquer tipo de medida:
        é a referência de quem vai medir, não pode depender de achar uma aba */}
    <ImagensVenda c={c} />
    <Contato c={c} rota />
    {(souEu || R.ehSupMedidas()) && etapa === "agendada" && <ContatoMedida c={c} />}
    <Anexar c={c} />
    {souEu && etapa === "agendada" && <div className="mv-bloco">
      <div className="mv-bloco-t">Registrar a medida</div>
      <textarea rows={3} value={med} onChange={e => setMed(e.target.value)} placeholder="Medidas: parede 3,20m x pé-direito 2,60m…" />
      <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)" />
      <button className="mv-principal" onClick={() => { if (!(c.anexos || []).length) { toast("Anexe as fotos/planta da medição primeiro"); return; }
        const fl = (m.faltando || []).filter((x: any) => !x.ok); if (fl.length && !confirm("Ainda falta marcar " + fl.length + " item(ns) do que estava faltando:\n\n• " + fl.map((x: any) => x.t).join("\n• ") + "\n\nEnviar mesmo assim?")) return;
        ex(() => A.medidaRealizada(c.id, med.trim(), obs.trim()), "Medida enviada para Medidas ✓"); }}>✓ {(m.faltando || []).length ? "Finalizar e enviar a medida completa" : "Finalizar e enviar para Medidas"}</button>
      <div className="mv-dica" style={{ color: (c.anexos || []).length ? undefined : "#8a5d00", fontWeight: (c.anexos || []).length ? undefined : 700 }}>
        {(c.anexos || []).length ? "📷 " + (c.anexos || []).length + " arquivo(s) anexado(s)." : "📷 Anexe as fotos/planta da medição antes de finalizar."}</div>
      <div className="mv-dica">A medida fica como <b>realizada</b> e vai para a Supervisão de Medidas conferir e liberar para o checklist. Paga {fmtMoeda(R.cfg().pagamentoVisita)} (sem comissão).</div>
    </div>}
    {etapa === "realizada" && <div className="mv-ok">✓ Medida enviada — aguardando a supervisora conferir</div>}
    {etapa === "liberada" && <div className="mv-ok">✓ Medidas liberadas para o checklist</div>}
    <button className="mv-link" onClick={() => abrirDetalhe(c.id)}>Ver ficha completa e histórico ›</button>
  </>;
}

/** a Supervisão de Medidas define a data limite da medida (vale acima da do Exact e do checklist) */
export function DataLimite({ c, compacto }: { c: any; compacto?: boolean }) {
  const { executar: ex } = useApp() as any;
  const m = (c.tratativa && c.tratativa.medida) || {};
  const [d, setD] = useState(String(m.dataLimite || "").slice(0, 10));
  useEffect(() => { setD(String(m.dataLimite || "").slice(0, 10)); }, [m.dataLimite]);
  const salvar = (v: string) => ex(() => A.medidaDataLimite(c.id, v || null), v ? "Data limite: " + fmtDate(v) : "Data limite removida");
  return <div className={compacto ? "" : "mv-bloco"} style={compacto ? { display: "inline-flex", gap: 4, alignItems: "center" } : undefined} onClick={e => e.stopPropagation()}>
    {!compacto && <div className="mv-bloco-t">📅 Data limite da medida</div>}
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="date" value={d} onChange={e => setD(e.target.value)} style={{ width: compacto ? 140 : "auto", flex: compacto ? "none" : 1 }} title="Data limite da medida" />
      <button type="button" className={compacto ? "btn sm" : "mv-principal"} style={compacto ? undefined : { width: "auto", padding: "8px 14px" }} disabled={d === String(m.dataLimite || "").slice(0, 10)} onClick={() => salvar(d)}>Salvar</button>
      {m.dataLimite && <button type="button" className={compacto ? "btn sm ghost" : "mv-link"} onClick={() => { setD(""); salvar(""); }}>limpar</button>}
    </div>
    {!compacto && <div className="mv-dica">Vale acima da data limite do Exact e do checklist.</div>}
  </div>;
}

/** o que a supervisora apontou como faltando: quem mede vai marcando o que já resolveu */
function Faltando({ c, pode }: { c: any; pode: boolean }) {
  const { executar: ex } = useApp() as any;
  const m = (c.tratativa && c.tratativa.medida) || {};
  const f: any[] = m.faltando || [];
  const ok = f.filter(x => x.ok).length;
  return <div style={{ border: "2px solid #1d6fd1", background: "rgba(29,111,209,.10)", borderRadius: 12, padding: "10px 12px", margin: "8px 0 12px" }}>
    <div style={{ fontWeight: 900, color: "#1d6fd1", fontSize: 15 }}>⚠️ O QUE ESTÁ FALTANDO <span style={{ fontWeight: 700, fontSize: 12.5 }}>· {ok} de {f.length} resolvido{f.length === 1 ? "" : "s"}</span></div>
    {m.devolvidaEm && <div style={{ fontSize: 12, opacity: .85, margin: "2px 0 6px" }}>Devolvida {m.devolvidaPor ? "por " + m.devolvidaPor + " " : ""}em {fmtDateTime(m.devolvidaEm)}{m.devolucoes > 1 ? " · " + m.devolucoes + "ª devolução" : ""}</div>}
    {f.map((x, i) => <label key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: i ? "1px solid rgba(29,111,209,.25)" : 0, cursor: pode ? "pointer" : "default" }}>
      <input type="checkbox" checked={!!x.ok} disabled={!pode} onChange={e => ex(() => A.medidaFaltandoMarcar(c.id, i, e.target.checked), e.target.checked ? "Marcado como resolvido" : "Desmarcado")} style={{ width: 22, height: 22, flex: "none", accentColor: "#1d6fd1" }} />
      <span style={{ fontSize: 14.5, fontWeight: 600, textDecoration: x.ok ? "line-through" : "none", opacity: x.ok ? .65 : 1 }}>{x.t}</span></label>)}
    {m.faltandoObs && <div style={{ fontSize: 13.5, marginTop: 6 }}><b>Observação:</b> {m.faltandoObs}</div>}
    <div style={{ fontSize: 12, marginTop: 6, opacity: .85 }}>Anexe as fotos do que faltava e envie a medida de novo.</div>
  </div>;
}

// ---------- reembolso ----------
export function Reembolsos({ de, ate }: { de?: string; ate?: string }) {
  const { R, executar: ex, toast } = useApp() as any;
  const [abrir, setAbrir] = useState(false);
  const [tipo, setTipo] = useState(""); const [valor, setValor] = useState(""); const [data, setData] = useState(hojeISO()); const [desc, setDesc] = useState("");
  const [foto, setFoto] = useState<Blob | null>(null); const [prev, setPrev] = useState(""); const [nomeArq, setNomeArq] = useState(""); const [cli, setCli] = useState(""); const [env, setEnv] = useState(false);
  useEffect(() => () => { if (prev) URL.revokeObjectURL(prev); }, [prev]);
  const meus = R.reembolsosDe(R.currentUserId).filter((r: any) => (!de || r.data >= de) && (!ate || r.data <= ate)).sort((a: any, b: any) => String(b.data).localeCompare(String(a.data)));
  const clientes = [...R.medidasDe(R.currentUserId), ...R.state.chamados.filter((c: any) => c.consultorId === R.currentUserId && R.domMarketing(c))]
    .sort((a: any, b: any) => String(b.dataMedida || b.dataVisita || "").localeCompare(String(a.dataMedida || a.dataVisita || ""))).slice(0, 40);
  const escolherFoto = async (f?: File | null) => {
    if (!f) return;
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      if (f.size > 10 * 1024 * 1024) { toast("PDF muito grande (máx. 10 MB)"); return; }
      setFoto(new Blob([f], { type: "application/pdf" })); setPrev(""); setNomeArq(f.name); return;
    }
    const b = await comprimir(f); if (!b) { toast("Envie uma foto ou PDF do comprovante"); return; }
    setFoto(b); setPrev(URL.createObjectURL(b)); setNomeArq("");
  };
  const enviar = async () => {
    const v = parseMoeda(valor);
    if (!tipo) { toast("Escolha o tipo de despesa"); return; }
    if (!v || v <= 0) { toast("Informe o valor"); return; }
    if (!data) { toast("Informe a data"); return; }
    if (tipo === "outro" && desc.trim().length < 3) { toast("Descreva a despesa"); return; }
    if (!foto) { toast("Tire a foto ou anexe o comprovante"); return; }
    setEnv(true);
    const ok = await ex(() => A.solicitarReembolso(R.currentUserId, tipo, v, data, desc.trim(), foto, cli || undefined), "Reembolso enviado — a Gestão vai aprovar");
    setEnv(false);
    if (ok) { setAbrir(false); setTipo(""); setValor(""); setDesc(""); setFoto(null); setPrev(""); setNomeArq(""); setCli(""); }
  };
  const cor = (s: string) => s === "aprovado" ? "var(--st-concluida)" : s === "recusado" ? "var(--danger)" : "var(--warn)";
  return <>
    <div className="mv-sec">Reembolsos {meus.length ? <i>{meus.length}</i> : null}</div>
    {!abrir ? <button className="mv-principal" style={{ background: "#27468f" }} onClick={() => setAbrir(true)}>＋ Pedir reembolso (pedágio, estacionamento…)</button>
      : <div className="mv-bloco">
        <div className="mv-bloco-t">Pedir reembolso</div>
        <div className="mv-2">{Object.entries(TIPO_REEMBOLSO).map(([k, l]) => <button key={k} className={"mv-op" + (tipo === k ? " on" : "")} onClick={() => setTipo(k)}>{l}</button>)}</div>
        <div className="mv-2"><input inputMode="decimal" placeholder="Valor (R$)" value={valor} onChange={e => setValor(e.target.value)} /><input type="date" value={data} max={hojeISO()} onChange={e => setData(e.target.value)} /></div>
        <input placeholder={tipo === "outro" ? "Descreva a despesa *" : "Descrição (opcional)"} value={desc} onChange={e => setDesc(e.target.value)} />
        <select className="mv-sel" value={cli} onChange={e => setCli(e.target.value)}><option value="">Cliente relacionado (opcional)</option>{clientes.map((c: any) => <option key={c.id} value={c.id}>{c.tipo === "medidas" ? "📐 " : ""}{c.cliente} · {c.id}</option>)}</select>
        {prev ? <img src={prev} alt="comprovante" style={{ width: "100%", borderRadius: 10, marginTop: 8 }} /> : null}
        {nomeArq ? <div className="mv-ok" style={{ marginTop: 8 }}>📄 {nomeArq}</div> : null}
        <div className="mv-2" style={{ marginTop: 8 }}>
          <label className="mv-grande">📷 {foto ? "Tirar outra foto" : "Tirar foto *"}<input type="file" accept="image/*" capture="environment" hidden onChange={e => { escolherFoto(e.target.files && e.target.files[0]); e.target.value = ""; }} /></label>
          <label className="mv-grande">📎 {foto ? "Trocar arquivo" : "Anexar arquivo *"}<input type="file" accept="image/*,application/pdf,.pdf" hidden onChange={e => { escolherFoto(e.target.files && e.target.files[0]); e.target.value = ""; }} /></label>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 4 }}>Foto da câmera, imagem da galeria ou PDF (nota, recibo, comprovante do app).</div>
        <div className="mv-2" style={{ marginTop: 8 }}><button className="mv-principal" disabled={env} onClick={enviar}>{env ? "Enviando…" : "Enviar pedido"}</button><button className="btn" onClick={() => setAbrir(false)}>Cancelar</button></div>
      </div>}
    {meus.map((r: any) => <div key={r.id} className="mv-card" style={{ cursor: "default" }}>
      <div className="mv-card-h"><b>{fmtDate(r.data).slice(0, 5)}</b><small>{TIPO_REEMBOLSO[r.tipo] || r.tipo}</small></div>
      <div className="mv-card-c"><div className="nm">{fmtMoeda(r.valor)}</div><div className="sb">{r.descricao || (r.chamadoId ? "cliente " + r.chamadoId : "—")}{r.status === "recusado" && r.motivo ? " · " + r.motivo : ""}</div></div>
      <span className="sc" style={{ background: cor(r.status), color: "#fff" }}>{r.status === "pendente" ? "Aguardando" : r.status === "aprovado" ? "Aprovado" : "Recusado"}</span>
    </div>)}
  </>;
}

// medida chega sem contato: o consultor/medidor liga para o cliente e combina o dia (dentro do prazo do checklist)
function ContatoMedida({ c }: any) {
  const { R, executar: ex, toast } = useApp() as any;
  const m = (c.tratativa && c.tratativa.medida) || {};
  const pz = prazoMedida(R.state, c);
  const [dt, setDt] = useState(c.dataMedida ? String(c.dataMedida).slice(0, 16).replace(" ", "T") : "");
  const salvarData = () => {
    if (!dt || dt.length < 16) { toast("Escolha o dia e o horário combinados"); return; }
    if (pz && dt.slice(0, 10) > pz.limite && !confirm("A data limite desta medida é " + fmtDate(pz.limite) + " (" + rotPrazo(pz) + ").\n\nMarcar mesmo assim, depois do limite?")) return;
    ex(() => A.medidaContato(c.id, dt), "Data da medida combinada ✓");
  };
  return <div className="mv-bloco">
    <div className="mv-passo"><span className={m.contatoEm ? "ok" : ""}>1</span><div>Contato com o cliente{m.contatoEm ? <small style={{ display: "block", color: "var(--ink-faint)" }}>{fmtDateTime(m.contatoEm)}</small> : null}</div>
      <button className={"mv-tg" + (m.contatoEm ? " on" : "")} disabled={!!m.contatoEm} onClick={() => ex(() => A.medidaContato(c.id, null), "Contato registrado")}>{m.contatoEm ? "Feito ✓" : "Marcar"}</button></div>
    <div className="mv-passo col"><div className="mv-passo-l"><span className={m.dataCombinadaEm ? "ok" : ""}>2</span><div>Dia combinado com o cliente{pz ? <small style={{ display: "block", color: "var(--ink-faint)" }}>até {fmtDate(pz.limite)}</small> : null}</div></div>
      {/* sem data mínima: a medida pode ter sido combinada para um dia que já passou
          (cliente remarcou, a pessoa só registrou depois) — travar isso deixava o
          compromisso fora da agenda, que é pior do que aceitar uma data antiga */}
      <DataCalendario value={dt} onChange={setDt} min="" />
      <button className="btn sm" onClick={salvarData}>{m.dataCombinadaEm ? "Alterar a data combinada" : "Salvar a data combinada"}</button></div>
  </div>;
}
