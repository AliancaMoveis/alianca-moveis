// Definir vendedor: tela de trabalho do Suporte Consultores (Carla), Supervisão Marketing e Gestão.
// Clientes com data na loja e sem vendedor, agrupados por dia, com a agenda de cada vendedor ao lado.
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { hojeISO, isoLocal, parseData } from "../lib/regras";

const dia = (c: any) => String(c.dataLoja || "").slice(0, 10);
const hora = (c: any) => { const s = String(c.dataLoja || ""); return s.length > 10 ? s.slice(11, 16) : "—"; };
const minutos = (c: any) => { const h = hora(c); return h === "—" ? null : +h.slice(0, 2) * 60 + +h.slice(3, 5); };
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const rotuloDia = (iso: string) => { const d = parseData(iso + "T12:00"); return DIAS[d.getDay()] + ", " + d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); };

export default function Definir() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const [aba, setAba] = useState<"sem" | "definidos">("sem");
  const hoje = hojeISO();
  const d = new Date(); d.setDate(d.getDate() + 1); const amanha = isoLocal(d);
  const d7 = new Date(); d7.setDate(d7.getDate() + 7); const ate7 = isoLocal(d7);

  const mkt = st.chamados.filter((c: any) => R.domMarketing(c) && R.podeVer(c));
  const sem = mkt.filter((c: any) => c.setorDestino === "suporte_consultores" && !c.atendenteId)
    .sort((a: any, b: any) => String(a.dataLoja || "9").localeCompare(String(b.dataLoja || "9")));
  const comVend = mkt.filter((c: any) => c.atendenteId && c.dataLoja && dia(c) >= hoje && !c.venda && R.statusClienteDe(c) !== "nao_compareceu");
  const definidos = comVend.filter((c: any) => dia(c) <= ate7).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const vendedores = R.projetistas();

  const passou = sem.filter((c: any) => c.dataLoja && dia(c) < hoje), nHoje = sem.filter((c: any) => dia(c) === hoje), nAm = sem.filter((c: any) => dia(c) === amanha);
  // grupos por dia (data vencida primeiro)
  const grupos: [string, string, any[]][] = [];
  if (passou.length) grupos.push(["passou", "Data da loja já passou", passou]);
  const semData = sem.filter((c: any) => !c.dataLoja);
  const futuros: Record<string, any[]> = {};
  sem.filter((c: any) => c.dataLoja && dia(c) >= hoje).forEach((c: any) => (futuros[dia(c)] = futuros[dia(c)] || []).push(c));
  Object.keys(futuros).sort().forEach(k => grupos.push([k, k === hoje ? "Hoje · " + rotuloDia(k) : k === amanha ? "Amanhã · " + rotuloDia(k) : rotuloDia(k), futuros[k]]));
  if (semData.length) grupos.push(["semdata", "Sem data na loja", semData]);

  const agendaDe = (uid: string) => comVend.filter((c: any) => c.atendenteId === uid);

  return (
    <section className="view active" id="view-definir">
      <div className="view-head"><div><h2>Definir vendedor</h2>
        <p>Clientes com vinda à loja agendada que ainda não têm vendedor. Escolha quem atende: o cliente vai para a fila do vendedor na hora.</p></div></div>

      <div className="dv-kpis">
        <button className={"dv-kpi" + (sem.length ? " on" : "")} onClick={() => setAba("sem")}><b>{sem.length}</b><span>Sem vendedor</span></button>
        <div className={"dv-kpi" + (passou.length ? " alerta" : "")}><b>{passou.length}</b><span>Data já passou</span></div>
        <div className={"dv-kpi" + (nHoje.length ? " hoje" : "")}><b>{nHoje.length}</b><span>Vêm hoje</span></div>
        <div className="dv-kpi"><b>{nAm.length}</b><span>Vêm amanhã</span></div>
        <button className="dv-kpi" onClick={() => setAba("definidos")}><b>{definidos.length}</b><span>Já definidos (7 dias)</span></button>
      </div>

      <div className="subnav" style={{ marginBottom: 14 }}>
        <button className={aba === "sem" ? "on" : ""} onClick={() => setAba("sem")}>Sem vendedor{sem.length ? ` (${sem.length})` : ""}</button>
        <button className={aba === "definidos" ? "on" : ""} onClick={() => setAba("definidos")}>Já definidos — próximos 7 dias</button>
      </div>

      <div className="dv-grid">
        <div>
          {aba === "sem" ? (
            grupos.length ? grupos.map(([k, titulo, arr]) => (
              <div key={k} className="dv-dia">
                <div className={"dv-dia-tit" + (k === "passou" ? " alerta" : k === hoje ? " hoje" : "")}>{titulo}<span>{arr.length}</span></div>
                {arr.map((c: any) => <Cartao key={c.id} c={c} vendedores={vendedores} comVend={comVend} abrir={() => abrirDetalhe(c.id)} />)}
              </div>
            )) : <div className="empty"><div className="big">Tudo definido</div>Nenhum cliente agendado está sem vendedor.</div>
          ) : (
            definidos.length ? <div className="dv-dia">{definidos.map((c: any) => <Cartao key={c.id} c={c} vendedores={vendedores} comVend={comVend} abrir={() => abrirDetalhe(c.id)} troca />)}</div>
              : <div className="empty"><div className="big">Nada nos próximos 7 dias</div>Nenhum cliente com vendedor definido vem à loja nesse período.</div>
          )}
        </div>

        <aside className="dv-side">
          <div className="dv-side-tit">Agenda dos vendedores</div>
          <div className="dv-side-sub">Para distribuir melhor: quantos clientes cada um já tem.</div>
          {vendedores.length ? vendedores.map((v: any) => {
            const ag = agendaDe(v.id), h = ag.filter((c: any) => dia(c) === hoje), s = ag.filter((c: any) => dia(c) <= ate7);
            const prox = ag.slice().sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja))).slice(0, 3);
            return (
              <div key={v.id} className="dv-vend">
                <div className="dv-vend-top"><b>{v.nome}</b><span className="dv-n" title="Hoje">{h.length} hoje</span><span className="dv-n cinza" title="Próximos 7 dias">{s.length} na semana</span></div>
                {prox.length ? prox.map((c: any) => <div key={c.id} className="dv-vend-l" onClick={() => abrirDetalhe(c.id)}>{dia(c) === hoje ? "hoje" : rotuloDia(dia(c)).split(",")[1].trim()} {hora(c)} · {c.cliente}</div>)
                  : <div className="dv-vend-l vazio">Sem clientes agendados</div>}
              </div>
            );
          }) : <div className="dv-vend-l vazio">Nenhum vendedor cadastrado.</div>}
        </aside>
      </div>
    </section>
  );
}

function Cartao({ c, vendedores, comVend, abrir, troca }: any) {
  const { R, executar: ex, toast } = useApp() as any;
  const [v, setV] = useState(troca ? c.atendenteId : "");
  const hoje = hojeISO();
  const noDia = (uid: string) => comVend.filter((x: any) => x.atendenteId === uid && x.id !== c.id && dia(x) === dia(c));
  // sugestão: quem tem menos clientes no dia
  const sug = !troca && c.dataLoja ? vendedores.slice().sort((a: any, b: any) => noDia(a.id).length - noDia(b.id).length)[0] : null;
  const m = minutos(c);
  const choque = v && m !== null ? noDia(v).find((x: any) => { const mx = minutos(x); return mx !== null && Math.abs(mx - m) < 60; }) : null;
  const imgs = (c.anexos || []).filter((a: any) => a.tipo === "img").length;
  const t = c.tratativa || {};
  const cor = !c.dataLoja ? "var(--ink-faint)" : dia(c) < hoje ? "var(--danger)" : dia(c) === hoje ? "var(--warn)" : "var(--primary)";
  const definir = () => {
    if (!v) { toast("Escolha o vendedor"); return; }
    if (troca) { if (v === c.atendenteId) { toast("Já é este vendedor"); return; } ex(() => A.trocarVendedor(c.id, v), "Vendedor alterado"); }
    else ex(() => A.designarProjetista(c.id, v), "Vendedor definido — cliente na fila dele");
  };
  return (
    <div className="dv-card" style={{ borderLeftColor: cor }}>
      <div className="dv-hora" style={{ color: cor }}><b>{hora(c)}</b><span>{c.dataLoja ? (dia(c) === hoje ? "hoje" : rotuloDia(dia(c)).split(",")[1].trim()) : "sem data"}</span></div>
      <div className="dv-info" onClick={abrir}>
        <div className="dv-nome">{c.cliente} <span className="dv-id">{c.id}</span></div>
        <div className="dv-meta">{c.produto || "—"}{c.consultorId ? " · consultor " + R.nomeUser(c.consultorId) : " · direto na loja"}{c.telefone ? " · " + c.telefone : ""}</div>
        <div className="dv-tags">{imgs > 0 && <span className="pill">📐 planta/fotos ({imgs})</span>}{t.medidas && <span className="pill">medidas</span>}{t.obs && <span className="pill" title={t.obs}>obs. do consultor</span>}{troca && <span className="pill">com {R.nomeUser(c.atendenteId)}</span>}</div>
      </div>
      <div className="dv-acao">
        <select value={v} onChange={e => setV(e.target.value)}>
          <option value="">{troca ? "Trocar para…" : "Escolher vendedor…"}</option>
          {vendedores.map((x: any) => { const n = c.dataLoja ? noDia(x.id).length : 0; return <option key={x.id} value={x.id}>{x.nome}{c.dataLoja ? ` — ${n} no dia` : ""}{sug && sug.id === x.id ? " (sugerido)" : ""}</option>; })}
        </select>
        <button className="btn primary sm" onClick={definir}>{troca ? "Trocar" : "Definir"}</button>
        {choque && <div className="dv-aviso">⚠ {R.nomeUser(v)} já tem {choque.cliente} às {hora(choque)}</div>}
      </div>
    </div>
  );
}
