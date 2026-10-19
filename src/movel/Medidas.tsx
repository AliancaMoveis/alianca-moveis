// App de campo: medidas (medidor e consultor) e pedidos de reembolso (pedágio, estacionamento…).
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { A, comprimir } from "../lib/acoes";
import { DataCalendario } from "../comp/DataCalendario";
import { ETAPA_MEDIDA, TIPO_REEMBOLSO, fmtDate, fmtDateTime, fmtMoeda, hojeISO, isoLocal, parseMoeda } from "../lib/regras";

const hora = (v: any) => { const s = String(v || ""); return s.length > 10 ? s.slice(11, 16) : ""; };
const dia = (v: any) => String(v || "").slice(0, 10);
const diaCurto = (v: any) => { const d = dia(v); if (!d) return "sem data"; if (d === hojeISO()) return "hoje"; const a = new Date(); a.setDate(a.getDate() + 1); if (d === isoLocal(a)) return "amanhã"; return fmtDate(d).slice(0, 5); };

export function medDados(R: any) {
  const todas = R.medidasDe(R.currentUserId).slice().sort((a: any, b: any) => String(a.dataMedida || "9").localeCompare(String(b.dataMedida || "9")));
  const aFazer = todas.filter((c: any) => R.etapaMedida(c) === "agendada");
  const hoje = aFazer.filter((c: any) => dia(c.dataMedida) === hojeISO());
  const atrasadas = aFazer.filter((c: any) => c.dataMedida && dia(c.dataMedida) < hojeISO());
  const feitas = todas.filter((c: any) => c.tratativa && c.tratativa.medida && c.tratativa.medida.realizadaEm).sort((a: any, b: any) => String(b.tratativa.medida.realizadaEm).localeCompare(String(a.tratativa.medida.realizadaEm)));
  return { todas, aFazer, hoje, atrasadas, feitas };
}

/** data do checklist da mesma venda e o limite da medida (5 dias antes) */
export function prazoMedida(st: any, c: any): { ck: string; limite: string } | null {
  const p = String(c.pedido || "").trim(); if (!p) return null;
  const ds = st.chamados.filter((k: any) => k.tipo === "checklist" && String(k.pedido || "").trim() === p && ["agendado", "realizado"].includes(((k.tratativa || {}).checklist || {}).etapa))
    .map((k: any) => String(k.tratativa.checklist.agendadoPara || "")).filter(Boolean).sort();
  if (!ds.length) return null;
  const d = new Date(ds[0].slice(0, 10) + "T12:00:00"); d.setDate(d.getDate() - 5);
  return { ck: ds[0], limite: isoLocal(d).slice(0, 10) };
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
      <div className="mv-card-h"><b>{hora(c.dataMedida)}</b><small>{diaCurto(c.dataMedida)}</small></div>
      <div className="mv-card-c"><div className="nm"><span className="tag-med">📐 MEDIDA</span> {c.cliente}{!(c.anexos || []).length && aFazer ? " ⚠️" : ""}</div>
        <div className="sb">{pz ? "Checklist " + fmtDate(pz.ck).slice(0, 5) + " · medir até " + fmtDate(pz.limite).slice(0, 5) : (c.endereco || c.produto || "—")}</div>
        {estourou && <div className="sb" style={{ color: "var(--danger)", fontWeight: 700 }}>⚠️ Fora do prazo (5 dias antes do checklist)</div>}</div>
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
export function MedLista({ abrir }: any) {
  const { R } = useApp() as any;
  const d = medDados(R);
  const [f, setF] = useState<"fazer" | "feitas" | "todas">("fazer");
  const lista = f === "fazer" ? d.aFazer : f === "feitas" ? d.feitas : d.todas;
  return <>
    <div className="mv-seg">{([["fazer", "A fazer", d.aFazer.length], ["feitas", "Feitas", d.feitas.length], ["todas", "Todas", d.todas.length]] as any[]).map(([k, l, n]) =>
      <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{l}<i>{n}</i></button>)}</div>
    {lista.length ? lista.map((c: any) => <CartaoMedida key={c.id} c={c} abrir={abrir} />) : <div className="mv-vazio">Nada aqui.</div>}
  </>;
}

// ficha da medida no celular
export function FolhaMedida({ c, Contato, Anexar }: any) {
  const { R, executar: ex, toast, abrirDetalhe } = useApp() as any;
  const m = (c.tratativa && c.tratativa.medida) || {};
  const etapa = R.etapaMedida(c);
  const [med, setMed] = useState(m.medidas || ""); const [obs, setObs] = useState(m.obs || "");
  const souEu = c.medidorId === R.currentUserId;
  return <>
    <div className="mv-cli">📐 {c.cliente}</div>
    <div className="mv-cli-s">Medida · {c.produto || "—"} · <b>{ETAPA_MEDIDA[etapa] || etapa}</b></div>
    <div className="mv-info">
      {c.dataMedida && <div><span>Medida</span><b>{fmtDateTime(c.dataMedida)}</b></div>}
      {c.endereco && <div><span>Endereço</span><b>{c.endereco}</b></div>}
      {m.consultorVisita && <div><span>Consultor da visita</span><b>{R.nomeUser(m.consultorVisita)}</b></div>}
      {m.medidasConsultor && <div><span>Medidas do consultor</span><b>{m.medidasConsultor}</b></div>}
      {m.refazer && etapa === "agendada" && <div><span>Refazer</span><b style={{ color: "var(--danger)" }}>{m.refazer}</b></div>}
      {m.realizadaEm && <div><span>Feita em</span><b>{fmtDateTime(m.realizadaEm)}</b></div>}
    </div>
    {(() => { const pz = prazoMedida(R.state, c); return pz ? <div className={"mv-prazo-med" + (hojeISO() > pz.limite && etapa === "agendada" ? " atras" : "")}>
      <div><span>Checklist</span><b>{fmtDateTime(pz.ck)}</b></div><div><span>Medir até</span><b>{fmtDate(pz.limite)}</b></div>
      <small>As medidas precisam estar prontas 5 dias antes do checklist.</small></div> : null; })()}
    <Contato c={c} rota />
    {(souEu || R.ehSupMedidas()) && etapa === "agendada" && <ContatoMedida c={c} />}
    <Anexar c={c} />
    {souEu && etapa === "agendada" && <div className="mv-bloco">
      <div className="mv-bloco-t">Registrar a medida</div>
      <textarea rows={3} value={med} onChange={e => setMed(e.target.value)} placeholder="Medidas: parede 3,20m x pé-direito 2,60m…" />
      <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)" />
      <button className="mv-principal" onClick={() => { if (!(c.anexos || []).length) { toast("Anexe as fotos/planta da medição primeiro"); return; } ex(() => A.medidaRealizada(c.id, med.trim(), obs.trim()), "Medida registrada ✓"); }}>✓ Medida realizada</button>
      <div className="mv-dica">A medida paga {fmtMoeda(R.cfg().pagamentoVisita)} (sem comissão). A supervisora confere e libera para o checklist.</div>
    </div>}
    {etapa === "realizada" && <div className="mv-ok">✓ Medida enviada — aguardando a supervisora conferir</div>}
    {etapa === "liberada" && <div className="mv-ok">✓ Medidas liberadas para o checklist</div>}
    <button className="mv-link" onClick={() => abrirDetalhe(c.id)}>Ver ficha completa e histórico ›</button>
  </>;
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
    if (pz && dt.slice(0, 10) > pz.limite) { toast("A medida precisa ser até " + fmtDate(pz.limite) + " (5 dias antes do checklist)"); return; }
    ex(() => A.medidaContato(c.id, dt), "Data da medida combinada ✓");
  };
  return <div className="mv-bloco">
    <div className="mv-passo"><span className={m.contatoEm ? "ok" : ""}>1</span><div>Contato com o cliente{m.contatoEm ? <small style={{ display: "block", color: "var(--ink-faint)" }}>{fmtDateTime(m.contatoEm)}</small> : null}</div>
      <button className={"mv-tg" + (m.contatoEm ? " on" : "")} disabled={!!m.contatoEm} onClick={() => ex(() => A.medidaContato(c.id, null), "Contato registrado")}>{m.contatoEm ? "Feito ✓" : "Marcar"}</button></div>
    <div className="mv-passo col"><div className="mv-passo-l"><span className={m.dataCombinadaEm ? "ok" : ""}>2</span><div>Dia combinado com o cliente{pz ? <small style={{ display: "block", color: "var(--ink-faint)" }}>até {fmtDate(pz.limite)}</small> : null}</div></div>
      <DataCalendario value={dt} onChange={setDt} min={hojeISO() + "T00:00"} />
      <button className="btn sm" onClick={salvarData}>{m.dataCombinadaEm ? "Alterar a data combinada" : "Salvar a data combinada"}</button></div>
  </div>;
}
