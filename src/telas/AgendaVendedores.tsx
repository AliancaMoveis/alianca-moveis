// 👔 Vendedores — para os gerentes: todos os vendedores com os atendimentos marcados na loja hoje e nos próximos dias.
// Clique no vendedor para ver os clientes dele, dia a dia (mesma base da agenda da loja de quem coordena).
import { useMemo, useState } from "react";
import { SeloVinda } from "../comp/Situacao";
import { useApp } from "../estado";
import { fmtDate, hojeISO, isoLocal, parseData } from "../lib/regras";
import { SeloFreela } from "../comp/SelVendedor";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const maisDias = (iso: string, n: number) => { const d = parseData(iso + "T12:00"); d.setDate(d.getDate() + n); return isoLocal(d); };
const N_DIAS = 7;

const ROT: Record<string, string> = { marketing: "Marketing", externo: "Externo", porta: "🚪 Porta" };

export default function AgendaVendedores({ movel = false }: { movel?: boolean }) {
  const { R, st, abrirDetalhe } = useApp() as any;
  const hoje = hojeISO();
  const dias = useMemo(() => Array.from({ length: N_DIAS }, (_, i) => maisDias(hoje, i)), [hoje]);
  const [sel, setSel] = useState<string>(""); const [q, setQ] = useState("");
  // mesma base da agenda da loja de quem coordena (gerente e Gestão veem todos os clientes da loja)
  const todos = useMemo(() => (st.chamados || []).filter((c: any) => (R.domMarketing(c) || R.ehPorta(c)) && c.dataLoja && R.podeVer(c))
    .map((c: any) => ({ ...c, _dia: String(c.dataLoja).slice(0, 10) })).filter((c: any) => c._dia >= dias[0] && c._dia <= dias[N_DIAS - 1]), [st.chamados, dias.join()]);
  const origem = (c: any) => (c.tipo === "porta" || (c.tratativa && c.tratativa.porta)) ? "porta" : R.ehDireto(c) ? "marketing" : "externo";
  const vendedores: any[] = R.projetistas();
  const doVend = (id: string) => todos.filter(x => x.atendenteId === id);
  const sem = todos.filter(x => !x.atendenteId);
  const sem_ = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const lista = vendedores.filter(v => !q.trim() || sem_(v.nome).includes(sem_(q.trim())))
    .map(v => { const l = doVend(v.id); return { v, hoje: l.filter(x => x._dia === hoje).length, prox: l.filter(x => x._dia !== hoje).length }; })
    .sort((a, b) => b.hoje - a.hoje || b.prox - a.prox || a.v.nome.localeCompare(b.v.nome, "pt-BR"));
  const tit = (d: string) => (d === hoje ? "Hoje · " : d === maisDias(hoje, 1) ? "Amanhã · " : "") + DIAS[parseData(d + "T12:00").getDay()] + ", " + fmtDate(d).slice(0, 5);
  const escolhido = sel === "__fila" ? { id: "__fila", nome: "Sem vendedor (fila)" } : vendedores.find(v => v.id === sel);
  const clientes = sel === "__fila" ? sem : sel ? doVend(sel) : [];
  return <section className={movel ? "vd-movel" : "view active"}>
    {movel ? <div className="mv-sec">👔 Vendedores · hoje e próximos {N_DIAS - 1} dias</div> : <div className="view-head"><div><h2>👔 Vendedores</h2><p>Todos os vendedores e os clientes marcados na loja para cada um — hoje e nos próximos {N_DIAS - 1} dias. Clique no vendedor para ver os atendimentos.</p></div></div>}
        <div className="vd-wrap">
      {!(movel && sel) && <div className="vd-lista">
        <input type="search" placeholder="🔎 Buscar vendedor" value={q} onChange={e => setQ(e.target.value)} />
        <div className="vd-cab"><span>Vendedor</span><span>Hoje</span><span>Próx. dias</span></div>
        <>
          {lista.map(({ v, hoje: h, prox }) => <button key={v.id} type="button" className={"vd-it" + (sel === v.id ? " on" : "")} onClick={() => setSel(v.id)}>
            <span><b>{v.nome}</b><SeloFreela u={v} /></span><b className={h ? "n" : "n z"}>{h}</b><b className={prox ? "n" : "n z"}>{prox}</b></button>)}
          {sem.length > 0 && <button type="button" className={"vd-it fila" + (sel === "__fila" ? " on" : "")} onClick={() => setSel("__fila")}>
            <span><b>Sem vendedor (fila)</b></span><b className="n">{sem.filter(x => x._dia === hoje).length}</b><b className="n">{sem.filter(x => x._dia !== hoje).length}</b></button>}
        </>
      </div>}
      {!(movel && !sel) && <div className="vd-det">
        {movel && <button type="button" className="btn ghost sm" style={{ marginBottom: 8 }} onClick={() => setSel("")}>‹ Todos os vendedores</button>}
        {!escolhido ? <div className="empty" style={{ padding: 30 }}>Escolha um vendedor na lista para ver os atendimentos.</div> : <>
          <h3 style={{ margin: "0 0 4px" }}>{escolhido.nome}</h3>
          <p className="hint" style={{ margin: "0 0 12px" }}>{clientes.length ? clientes.length + " atendimento(s) marcado(s) de hoje a " + fmtDate(dias[N_DIAS - 1]).slice(0, 5) : "Nenhum atendimento marcado de hoje a " + fmtDate(dias[N_DIAS - 1]).slice(0, 5) + "."}</p>
          {dias.map(d => { const l = clientes.filter(x => x._dia === d).sort((a, b) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
            if (!l.length && d !== hoje) return null;
            return <div key={d} className="vd-dia"><div className="vd-dia-t">{tit(d)} <small>{l.length} cliente{l.length === 1 ? "" : "s"}</small></div>
              {!l.length ? <div className="hint" style={{ padding: "6px 0" }}>Nenhum cliente hoje.</div> : l.map((c: any) => { const og = origem(c); const t = c.tratativa || {};
                return <div key={c.id} className="vd-cli clic" onClick={() => abrirDetalhe(c.id)}>
                  <b className="hr">{String(c.dataLoja || "").slice(11, 16) || "—"}</b>
                  <div><div><span className={"origem " + og}>{ROT[og]}</span> <b>{c.cliente}</b> <SeloVinda c={c} />{c.venda ? <span className="pill" style={{ marginLeft: 6 }}>venda {c.venda.numero}</span> : null}</div>
                    <small>{[c.telefone, c.consultorId ? "consultor " + R.nomeUser(c.consultorId) : "", c.produto].filter(Boolean).join(" · ")}</small>
                    {t.emAtendimento ? <div><b className="ag-ematd">🟢 Em atendimento</b> desde {new Date(t.emAtendimento).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div> : null}</div>
                </div>; })}
            </div>; })}
        </>}
      </div>}
    </div>
  </section>;
}
