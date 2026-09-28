// Venda: validação pela Gestão (efetivada / entrada + promissória / promissória / cancelada),
// promissórias (nº próprio, vencimento, quitação total ou parcial) e o selo com o nº da venda.
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { VENDA_STATUS, fmtDate, fmtMoeda, hojeISO, parseMoeda, promAbertas, valorPendente } from "../lib/regras";
import { TIPO_VENDA_INFORMADO } from "../lib/regras";

type Prom = { numero: string; valor: string; vencimento: string };
const total = (v: any) => (v.valorNum != null ? Number(v.valorNum) : parseMoeda(v.valor));
const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ValidarVenda({ c, onFeito }: { c: any; onFeito?: () => void }) {
  const { executar: ex, toast } = useApp() as any;
  const v = c.venda || {};
  const T = total(v);
  const abertas = promAbertas(v);
  const [st, setSt] = useState<string>(v.status === "registrada" ? (v.tipoInformado || "") : v.status);
  const [ent, setEnt] = useState(v.entrada ? fmt(v.entrada) : v.entradaInformada ? fmt(v.entradaInformada) : "");
  const [proms, setProms] = useState<Prom[]>(abertas.length ? abertas.map((p: any) => ({ numero: p.numero, valor: fmt(p.valor), vencimento: p.vencimento })) : [{ numero: "", valor: "", vencimento: "" }]);
  const entN = st === "entrada" ? parseMoeda(ent) : 0;
  const resto = Math.max(0, T - entN);
  const soma = proms.reduce((s, p) => s + parseMoeda(p.valor), 0);
  const setP = (i: number, k: keyof Prom, val: string) => setProms(l => l.map((p, j) => j === i ? { ...p, [k]: val } : p));
  // uma promissória só: o valor acompanha a entrada automaticamente
  const valorAuto = proms.length === 1;
  const lista = valorAuto ? [{ ...proms[0], valor: fmt(resto) }] : proms;
  const salvar = async () => {
    if (!st) { toast("Escolha a situação da venda"); return; }
    if (st === "entrada" && (!entN || entN >= T)) { toast("Informe a entrada (menor que o total)"); return; }
    if (st === "entrada" || st === "promissoria") {
      if (lista.some(p => !p.numero.trim())) { toast("Informe o nº da venda da promissória"); return; }
      if (lista.some(p => !p.vencimento)) { toast("Informe o vencimento da promissória"); return; }
      const s = lista.reduce((a, p) => a + parseMoeda(p.valor), 0);
      if (Math.abs(s - resto) > 0.01) { toast("A soma das promissórias precisa dar " + fmtMoeda(resto)); return; }
    }
    const payload = st === "entrada" || st === "promissoria" ? lista.map(p => ({ numero: p.numero.trim(), valor: parseMoeda(p.valor), vencimento: p.vencimento })) : [];
    if (await ex(() => A.validarVenda(c.id, st, entN, payload), "Venda validada: " + VENDA_STATUS[st])) onFeito && onFeito();
  };
  const Op = ({ k, l, d }: any) => <button type="button" className={"vv-op" + (st === k ? " on" : "") + (k === "cancelada" ? " canc" : "")} onClick={() => setSt(k)}><b>{l}</b><small>{d}</small></button>;
  return (
    <div className="vv">
      {v.status === "registrada" && v.tipoInformado && <div className="vv-info">O vendedor informou: <b>{TIPO_VENDA_INFORMADO[v.tipoInformado]}</b>{v.entradaInformada ? <> · entrada <b>R$ {fmt(v.entradaInformada)}</b></> : null} — confira e valide.</div>}
      <div className="vv-ops">
        <Op k="efetivada" l="✅ Efetivada" d="pago — comissão sobre o total" />
        <Op k="entrada" l="🟡 Entrada + promissória" d="comissão sobre a entrada" />
        <Op k="promissoria" l="📄 Promissória" d="sem pagamento ainda" />
        <Op k="cancelada" l="❌ Cancelar" d="não houve venda" />
      </div>
      {(st === "entrada" || st === "promissoria") && <div className="vv-form">
        <div className="vv-tot">Total da venda <b>{fmtMoeda(T)}</b>{st === "entrada" && <> · em promissória <b>{fmtMoeda(resto)}</b></>}</div>
        {st === "entrada" && <label className="vv-campo">Entrada paga (R$)<input inputMode="decimal" value={ent} onChange={e => setEnt(e.target.value)} placeholder="Ex.: 3.000,00" /></label>}
        {lista.map((p, i) => <div className="vv-prom" key={i}>
          <label className="vv-campo">Nº da venda da promissória<input value={p.numero} onChange={e => setP(i, "numero", e.target.value)} placeholder="Ex.: 48311" /></label>
          <label className="vv-campo">Valor (R$)<input inputMode="decimal" value={p.valor} readOnly={valorAuto} onChange={e => setP(i, "valor", e.target.value)} /></label>
          <label className="vv-campo">Vencimento<input type="date" value={p.vencimento} min={hojeISO()} onChange={e => setP(i, "vencimento", e.target.value)} /></label>
          {proms.length > 1 && <button type="button" className="btn ghost sm" onClick={() => setProms(l => l.filter((_, j) => j !== i))}>Remover</button>}
        </div>)}
        <button type="button" className="btn ghost sm" onClick={() => setProms(l => [...(valorAuto ? [{ ...l[0], valor: fmt(resto) }] : l), { numero: "", valor: "", vencimento: "" }])}>+ outra promissória</button>
        {!valorAuto && <div className="vv-soma" style={{ color: Math.abs(soma - resto) > 0.01 ? "var(--danger)" : "var(--st-concluida)" }}>Soma das promissórias {fmtMoeda(soma)} de {fmtMoeda(resto)}</div>}
      </div>}
      <button className="btn primary sm" style={{ marginTop: 10 }} onClick={salvar}>Validar venda</button>
    </div>
  );
}

export function Promissorias({ c }: { c: any }) {
  const { R, executar: ex, toast } = useApp() as any;
  const v = c.venda || {};
  const ps = (v.promissorias || []).slice().sort((a: any, b: any) => String(a.vencimento).localeCompare(String(b.vencimento)));
  const [aberta, setAberta] = useState("");
  const [pago, setPago] = useState(""); const [num, setNum] = useState(""); const [venc, setVenc] = useState("");
  if (!ps.length && !v.entrada) return null;
  const hoje = hojeISO();
  const quitar = async (p: any) => {
    const vp = pago.trim() ? parseMoeda(pago) : p.valor;
    if (vp <= 0 || vp > p.valor + 0.001) { toast("Valor pago inválido"); return; }
    const parcial = vp < p.valor - 0.001;
    if (parcial && (!num.trim() || !venc)) { toast("Pagamento parcial: informe o nº e o vencimento da nova promissória"); return; }
    if (await ex(() => A.quitarPromissoria(p.id, vp, parcial ? num.trim() : "", parcial ? venc : null), parcial ? "Pagamento parcial registrado — nova promissória criada" : "Promissória quitada")) { setAberta(""); setPago(""); setNum(""); setVenc(""); }
  };
  return (
    <div className="vv-lista">
      {v.entrada > 0 && <div className="vv-linha paga"><span>Entrada</span><b>{fmtMoeda(v.entrada)}</b><small>paga · gerou comissão</small></div>}
      {ps.map((p: any) => {
        const venc2 = p.vencimento && p.vencimento < hoje && p.status === "aberta";
        return <div key={p.id}>
          <div className={"vv-linha " + (p.status === "aberta" ? (venc2 ? "vencida" : "aberta") : "paga")}>
            <span>Promissória nº <b>{p.numero}</b></span><b>{fmtMoeda(p.valor)}</b>
            <small>{p.status === "aberta" ? (venc2 ? "⚠️ vencida em " : "vence ") + fmtDate(p.vencimento) : p.status === "quitada" ? "✓ paga em " + fmtDate(p.quitadaEm) : "paga " + fmtMoeda(p.valorPago) + " em " + fmtDate(p.quitadaEm) + " · restante em nova promissória"}</small>
            {p.status === "aberta" && R.ehGestao() && aberta !== p.id && <button className="btn sm" onClick={() => { setAberta(p.id); setPago(fmt(p.valor)); }}>💰 Registrar pagamento</button>}
          </div>
          {aberta === p.id && <div className="vv-quitar">
            <label className="vv-campo">Valor pago (R$)<input inputMode="decimal" value={pago} onChange={e => setPago(e.target.value)} /></label>
            {parseMoeda(pago) < p.valor - 0.001 && parseMoeda(pago) > 0 && <>
              <div className="vv-soma">Pagamento parcial: o restante ({fmtMoeda(p.valor - parseMoeda(pago))}) vira uma nova promissória.</div>
              <label className="vv-campo">Nº da nova promissória<input value={num} onChange={e => setNum(e.target.value)} /></label>
              <label className="vv-campo">Vencimento<input type="date" value={venc} min={hoje} onChange={e => setVenc(e.target.value)} /></label>
            </>}
            <div style={{ display: "flex", gap: 8 }}><button className="btn primary sm" onClick={() => quitar(p)}>Confirmar pagamento</button><button className="btn ghost sm" onClick={() => setAberta("")}>Cancelar</button></div>
          </div>}
        </div>;
      })}
      {valorPendente(v) > 0 && <div className="vv-pend">Pendente em promissória: <b>{fmtMoeda(valorPendente(v))}</b> — a comissão desta parte é liberada quando for paga.</div>}
    </div>
  );
}

// selo com nº da venda (+ promissória pendente) — listas, ficha e app
export function SeloVenda({ c, curto }: { c: any; curto?: boolean }) {
  const { R } = useApp() as any;
  const v = c.venda; if (!v || !v.numero) return null;
  const ab = promAbertas(v);
  const verVal = R.podeVerValor(c);
  const hoje = hojeISO();
  const venc = ab.some((p: any) => p.vencimento && p.vencimento < hoje);
  const cor = v.status === "efetivada" ? "ok" : v.status === "cancelada" ? "canc" : ab.length ? (venc ? "venc" : "prom") : v.status === "registrada" ? "pend" : "ok";
  return <span className={"selo-venda " + cor} title={VENDA_STATUS[v.status]}>
    Venda {v.numero}{ab.length ? <> · Prom. {ab.map((p: any) => p.numero).join(", ")}{verVal ? " · " + fmtMoeda(valorPendente(v)) + " pendente" : ""}{!curto && ab[0].vencimento ? " · " + (venc ? "vencida " : "vence ") + fmtDate(ab[0].vencimento).slice(0, 5) : ""}</> : v.status === "registrada" ? " · pendente de análise" : v.status === "cancelada" ? " · cancelada" : " · efetivada"}
  </span>;
}

// relatório: promissórias em aberto (clientes e valores pendentes)
export function PromissoriasAbertas({ titulo = "Promissórias em aberto" }: { titulo?: string }) {
  const { R, st, abrirDetalhe } = useApp() as any;
  const hoje = hojeISO();
  const [f, setF] = useState<"todas" | "vencidas" | "semana">("todas");
  const linhas = st.chamados.filter((c: any) => c.venda && c.venda.status !== "cancelada" && R.podeVerValor(c))
    .flatMap((c: any) => promAbertas(c.venda).map((p: any) => ({ c, p, atraso: p.vencimento && p.vencimento < hoje ? Math.round((+new Date(hoje) - +new Date(p.vencimento)) / 86400000) : 0 })))
    .sort((a: any, b: any) => b.atraso - a.atraso || String(a.p.vencimento).localeCompare(String(b.p.vencimento)));
  const em7 = (d: string) => { const x = new Date(hoje); x.setDate(x.getDate() + 7); return d >= hoje && d <= x.toISOString().slice(0, 10); };
  const vis = linhas.filter((l: any) => f === "todas" || (f === "vencidas" ? l.atraso > 0 : em7(l.p.vencimento)));
  const soma = (l: any[]) => l.reduce((s, x) => s + x.p.valor, 0);
  const venc = linhas.filter((l: any) => l.atraso > 0), sem = linhas.filter((l: any) => em7(l.p.vencimento));
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3>{titulo}</h3>
      <div className="vv-res">
        <button className={f === "todas" ? "on" : ""} onClick={() => setF("todas")}><b>{fmtMoeda(soma(linhas))}</b><span>{linhas.length} em aberto</span></button>
        <button className={"r" + (f === "vencidas" ? " on" : "")} onClick={() => setF("vencidas")}><b>{fmtMoeda(soma(venc))}</b><span>{venc.length} vencida(s)</span></button>
        <button className={f === "semana" ? "on" : ""} onClick={() => setF("semana")}><b>{fmtMoeda(soma(sem))}</b><span>{sem.length} vencem em 7 dias</span></button>
      </div>
      {vis.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Cliente</th><th>Venda</th><th>Promissória</th><th>Valor pendente</th><th>Vencimento</th><th>Vendedor</th><th>Consultor</th></tr></thead><tbody>
        {vis.map(({ c, p, atraso }: any) => <tr key={p.id} onClick={() => abrirDetalhe(c.id)} style={{ cursor: "pointer" }}>
          <td><b>{c.cliente}</b></td><td>{c.venda.numero}</td><td>{p.numero}</td><td style={{ fontWeight: 700 }}>{fmtMoeda(p.valor)}</td>
          <td style={atraso ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{p.vencimento ? fmtDate(p.vencimento) : "—"}{atraso ? " · " + atraso + "d atraso" : ""}</td>
          <td>{c.atendenteId ? R.nomeUser(c.atendenteId) : c.venda.vendedor || "—"}</td><td>{c.consultorId ? R.nomeUser(c.consultorId) : "marketing"}</td></tr>)}
      </tbody></table></div> : <div className="dn-vazio">Nenhuma promissória {f === "vencidas" ? "vencida" : f === "semana" ? "vencendo nos próximos 7 dias" : "em aberto"}.</div>}
    </div>
  );
}
