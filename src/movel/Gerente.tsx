// App do Gerente de Loja: dia a dia da loja — chamar vendedor, agenda, abrir chamado e consultar clientes.
// Sem resultados de consultores e sem valores de venda (o banco também não devolve valores para o gerente).
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { DIAS_SEMANA, TURNOS, STATUS, STATUS_CLIENTE, fmtDate, fmtDateTime, hhmm, hojeISO, soDigitos } from "../lib/regras";
import { fmtTel } from "../lib/baseClientes";
import { ModalFerias, textoFerias } from "../comp/Ferias";
import { feriasEm, folgaEm, fimDeSemana } from "../lib/regras";

const primeiro = (n: string) => (n || "").replace(/^(Consultora?|Vendedora?)\s+—\s+/, "");
const horaDe = (v: any) => String(v || "").slice(11, 16);

/** folga / ainda não entrou / almoço — mesma regra do banco (_vend_motivo_indisp) */
export function motivoIndisp(u: any, agora = new Date(), dias?: Record<string, string>): string {
  const hoje = agora.getFullYear() + "-" + String(agora.getMonth() + 1).padStart(2, "0") + "-" + String(agora.getDate()).padStart(2, "0");
  const fe = feriasEm(u, hoje);
  if (fe) return fe;
  if (folgaEm(u, hoje, dias)) return "folga (" + DIAS_SEMANA[agora.getDay()] + ")";
  const tu = TURNOS[u.turno || ""]; const m = agora.getHours() * 60 + agora.getMinutes();
  // sábado e domingo: todos 9:00–18:00, almoço de 1h livre
  if (fimDeSemana(agora)) return m < 540 ? "entra às 9:00" : m >= 1080 ? "saiu às 18:00" : "";
  if (tu) {
    if (m < tu.entra) return "entra às " + hhmm(tu.entra);
    if (m >= tu.almoco[0] && m < tu.almoco[1]) return "almoço até " + hhmm(tu.almoco[1]);
  }
  return "";
}

// ---------- Hoje ----------
export function GerHoje({ ir }: { ir: (aba: string) => void }) {
  const { R, st, abrirDetalhe } = useApp() as any;
  const hoje = hojeISO(), eu = R.currentUserId;
  const loja = st.chamados.filter((c: any) => R.domMarketing(c) && c.dataLoja && String(c.dataLoja).slice(0, 10) === hoje)
    .sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const semVend = loja.filter((c: any) => !c.atendenteId && !(c.tratativa && c.tratativa.atendenteExterno) && !["nao_compareceu", "reagendado"].includes(R.statusClienteDe(c)));
  const emAtd = loja.filter((c: any) => c.tratativa && c.tratativa.emAtendimento && !c.venda);
  const meus = st.chamados.filter((c: any) => !R.domMarketing(c) && c.solicitanteId === eu && c.status !== "concluida")
    .sort((a: any, b: any) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  const { grupos } = R.minhasPendencias();
  const pend = grupos.filter((g: any) => g.chave !== "gerabertos");
  const defN = st.chamados.filter((c: any) => R.domMarketing(c) && R.podeVer(c) && c.setorDestino === "suporte_consultores" && !c.atendenteId && R.statusClienteDe(c) === "agendado_loja" && R.precisaDefinirVendedor(c) && c.dataLoja && String(c.dataLoja).slice(0, 10) >= hoje).length;
  return <>
    <div className="gr-acoes">
      <button className="gr-chamar" onClick={() => ir("chamar")}><span>📣</span><b>Chamar vendedor</b><small>apita no app do vendedor</small></button>
      <button className="gr-urg" onClick={() => ir("chamar")}><span>🚨</span><b>Todos para a fila</b><small>urgente · só quem está disponível</small></button>
    </div>
    {defN > 0 && <button className="mv-principal" style={{ marginBottom: 10 }} onClick={() => ir("distribuir")}>🔀 Definir vendedor · {defN} pendente{defN > 1 ? "s" : ""}</button>}
    <button className="mv-mais" style={{ marginBottom: 10, width: "100%" }} onClick={() => ir("vendedores")}>👥 Controle dos vendedores — folgas, domingos, férias</button>
    <div className="mv-nums">
      <button className="mv-num" onClick={() => ir("loja")}><b>{loja.length}</b><span>clientes hoje</span></button>
      <button className="mv-num" onClick={() => ir("loja")} style={semVend.length ? { color: "var(--warn)" } : undefined}><b>{semVend.length}</b><span>sem vendedor</span></button>
      <button className="mv-num" onClick={() => ir("loja")}><b>{emAtd.length}</b><span>em atendimento</span></button>
    </div>
    {semVend.length > 0 && <>
      <div className="mv-sec">Sem vendedor hoje <i>{semVend.length}</i></div>
      {semVend.slice(0, 6).map((c: any) => (
        <button key={c.id} className="mv-linha" onClick={() => abrirDetalhe(c.id)}><b>{horaDe(c.dataLoja)} · {c.cliente}</b><span>{c.consultorId ? "Consultor " + primeiro(R.nomeUser(c.consultorId)) : "Marketing"}{c.telefone ? " · " + fmtTel(c.telefone) : ""}</span></button>))}
    </>}
    {pend.length > 0 && <>
      <div className="mv-sec">Minhas pendências <i>{pend.reduce((s: number, g: any) => s + g.itens.length, 0)}</i></div>
      {pend.map((g: any) => g.itens.slice(0, 5).map((c: any) => (
        <button key={g.chave + c.id} className="mv-linha" style={{ borderLeftColor: g.cor }} onClick={() => abrirDetalhe(c.id)}><b>{c.cliente}</b><span>{g.titulo}</span></button>)))}
    </>}
    <div className="mv-sec">Chamados que você abriu <i>{meus.length}</i></div>
    {!meus.length ? <div className="mv-vazio">Nenhum chamado seu em andamento. Use “Chamado” para abrir uma solicitação.</div> :
      meus.slice(0, 12).map((c: any) => { const s = STATUS[c.status]; return (
        <button key={c.id} className="mv-linha" onClick={() => abrirDetalhe(c.id)}><b>{c.cliente} <small style={{ color: "var(--ink-faint)" }}>{c.id}</small></b><span>{R.tipoNome(c.tipo)} → {R.setorNome(c.setorDestino)} · {s ? s.label : c.status} · {fmtDateTime(c.criadoEm)}</span></button>); })}
  </>;
}

// ---------- Chamar vendedor ----------
export function GerChamar() {
  const { R, toast, setModal } = useApp() as any;
  const [obs, setObs] = useState("");
  const [env, setEnv] = useState("");
  const [res, setRes] = useState<{ ok: boolean; t: string } | null>(null);
  const agora = new Date();
  const vend = R.vendAgenda().map((u: any) => ({ u, mot: motivoIndisp(u, agora, (R.state.vendedorDias || {})[u.id]) }))
    .sort((a: any, b: any) => Number(!!a.mot) - Number(!!b.mot) || a.u.nome.localeCompare(b.u.nome, "pt-BR"));
  const disp = vend.filter((v: any) => !v.mot).length;
  const chamar = async (u: any, mot: string) => {
    if (mot && !confirm(primeiro(u.nome) + " está em " + mot + ". Chamar mesmo assim?")) return;
    setEnv(u.id); setRes(null);
    try { await A.chamarVendedor(u.id, obs); setRes({ ok: true, t: "📣 " + primeiro(u.nome) + " foi chamado(a) no app." }); }
    catch (e: any) { setRes({ ok: false, t: e.message || "Não foi possível chamar" }); }
    finally { setEnv(""); }
  };
  const todos = async () => {
    if (!confirm("🚨 URGENTE: chamar os " + disp + " vendedores disponíveis para a fila?\n(quem está de folga, no almoço ou fora do horário não é chamado)")) return;
    setEnv("todos"); setRes(null);
    try {
      const r = await A.chamarVendedoresFila(obs);
      const n = (r.chamados || []).length, f = (r.fora || []) as any[];
      setRes({ ok: true, t: "🚨 " + n + " vendedor(es) chamado(s) para a fila." + (f.length ? " Não chamados: " + f.map((x: any) => primeiro(x.nome) + " (" + x.motivo + ")").join(", ") + "." : "") });
      toast(n + " vendedor(es) chamado(s)");
    } catch (e: any) { setRes({ ok: false, t: e.message || "Não foi possível chamar" }); }
    finally { setEnv(""); }
  };
  return <>
    <button className="gr-urg grande" disabled={env === "todos" || !disp} onClick={todos}><span>🚨</span><b>{env === "todos" ? "Chamando…" : "URGENTE — chamar todos para a fila"}</b><small>{disp} disponível(is) agora · sem folga, almoço ou fora do horário</small></button>
    <label className="gr-obs">Recado (opcional)<input value={obs} onChange={e => setObs(e.target.value)} maxLength={140} placeholder="Ex.: cliente aguardando no balcão" /></label>
    {res && <div className={"gr-res" + (res.ok ? "" : " erro")}>{res.t}</div>}
    <div className="mv-sec">Chamar um vendedor <i>{vend.length}</i></div>
    <div className="gr-vends">
      {vend.map(({ u, mot }: any) => (
        <button key={u.id} className={"gr-vend" + (mot ? " fora" : "")} disabled={env === u.id} onClick={() => chamar(u, mot)}>
          <b>{primeiro(u.nome)}</b><small>{env === u.id ? "chamando…" : mot || "disponível"}</small></button>))}
    </div>
    <div className="mv-sec">🏖 Férias dos vendedores</div>
    {vend.map(({ u }: any) => { const t = textoFerias(u); return (
      <button key={u.id} className="mv-linha" style={t ? { borderLeftColor: "var(--warn)" } : undefined} onClick={() => setModal(<ModalFerias u={u} />)}>
        <b>{primeiro(u.nome)}</b><span>{t || "trabalhando · toque para marcar férias"}</span></button>); })}
  </>;
}

// ---------- Consultar clientes ----------
export function GerClientes() {
  const { R, st, abrirDetalhe, toast } = useApp() as any;
  const [q, setQ] = useState("");
  const [base, setBase] = useState<any[] | null>(null);
  const [busc, setBusc] = useState(false);
  const [aberto, setAberto] = useState("");
  const t = q.trim().toLowerCase(), dg = soDigitos(q);
  const doSistema = t.length < 3 ? [] : st.chamados.filter((c: any) => R.podeVer(c) && (
    (c.cliente || "").toLowerCase().includes(t) || (dg.length >= 4 && (soDigitos(c.telefone).includes(dg) || soDigitos(c.clienteDoc).includes(dg) || soDigitos(c.pedido).includes(dg)))
    || (!dg && (c.endereco || "").toLowerCase().includes(t))))
    .sort((a: any, b: any) => String(b.criadoEm).localeCompare(String(a.criadoEm))).slice(0, 25);
  const buscar = async (e?: any) => {
    if (e) e.preventDefault();
    if (t.length < 3) { toast("Digite pelo menos 3 letras ou números"); return; }
    setBusc(true);
    try { setBase(await A.baseClientesConsulta(q.trim()) || []); } catch (er: any) { toast(er.message || "Não foi possível consultar"); setBase([]); }
    finally { setBusc(false); }
  };
  return <>
    <form className="gr-busca" onSubmit={buscar}>
      <input value={q} onChange={e => { setQ(e.target.value); setBase(null); }} placeholder="Nome, CPF, telefone, nº da venda ou endereço" autoFocus />
      <button type="submit" disabled={busc}>{busc ? "…" : "🔎"}</button>
    </form>
    {t.length >= 3 && <>
      <div className="mv-sec">No sistema (atendimentos) <i>{doSistema.length}</i></div>
      {!doSistema.length ? <div className="mv-vazio">Nenhum atendimento encontrado.</div> : doSistema.map((c: any) => (
        <button key={c.id} className="mv-linha" onClick={() => abrirDetalhe(c.id)}>
          <b>{c.cliente} <small style={{ color: "var(--ink-faint)" }}>{c.id}</small></b>
          <span>{R.domMarketing(c) ? (STATUS_CLIENTE[R.statusClienteDe(c)] || "Marketing") + (c.dataLoja ? " · loja " + fmtDate(String(c.dataLoja).slice(0, 10)) + " " + horaDe(c.dataLoja) : "") : R.tipoNome(c.tipo) + " · " + R.setorNome(c.setorDestino) + " · " + (STATUS[c.status]?.label || c.status)}{c.telefone ? " · " + fmtTel(c.telefone) : ""}</span>
        </button>))}
      <div className="mv-sec">Base de clientes (Tático) {base ? <i>{base.length}</i> : null}</div>
      {base === null ? <button className="mv-principal" onClick={() => buscar()} disabled={busc}>{busc ? "Consultando…" : "🔎 Consultar na base de clientes"}</button>
        : !base.length ? <div className="mv-vazio">Nenhum cliente na base com essa busca.</div>
        : base.map((b: any) => (
          <div key={b.id} className="gr-base" onClick={() => setAberto(aberto === b.id ? "" : b.id)}>
            <b>{b.nome}</b>
            <span>{[b.telefone1, b.telefone2].filter(Boolean).map(fmtTel).join(" · ") || "sem telefone"}{b.cpf_cnpj ? " · CPF/CNPJ " + b.cpf_cnpj : ""}</span>
            {b.endereco ? <span>📍 {b.endereco}</span> : null}
            <small>{(b.vendas || []).length} compra(s){(b.vendas || []).length ? " · toque para ver" : ""}</small>
            {aberto === b.id && (b.vendas || []).map((v: any, i: number) => <div key={i} className="gr-venda">Venda <b>{v.num}</b> · {v.data ? fmtDate(String(v.data).slice(0, 10)) : "—"} · {v.situacao || "—"}{v.vendedor ? " · " + v.vendedor : ""}</div>)}
          </div>))}
    </>}
  </>;
}
