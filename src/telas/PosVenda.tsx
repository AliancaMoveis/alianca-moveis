// Pós-venda Projetados — números de qualidade (ocorrências, custos, montadores e impacto do checklist) e cadastro de montadores.
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { PV_ORIGEM, PV_RESP, PV_TIPOS, STATUS, fmtMoeda, inicial } from "../lib/regras";
import { BarRow, Kpi } from "./Dashboard";
import { Modal } from "../comp/Modal";

const Nada = ({ t }: { t: string }) => <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>{t}</div>;

export default function PosVenda() {
  const { R } = useApp();
  const [sub, setSub] = useState("numeros");
  return (
    <section className="view active" id="view-posvenda">
      <div className="view-head"><div><h2>Pós-venda Projetados</h2>
        <p>Reclamações e ocorrências de projetos: o que aconteceu, quanto custou, quais montadores e qual o impacto do checklist.</p></div></div>
      <div className="subnav"><button className={sub === "numeros" ? "on" : ""} onClick={() => setSub("numeros")}>Números</button>
        {R.podeMontadores() && <button className={sub === "montadores" ? "on" : ""} onClick={() => setSub("montadores")}>Montadores</button>}</div>
      {sub === "numeros" ? <Numeros /> : <Montadores />}
    </section>
  );
}

function Numeros() {
  const { R, st, abrirDetalhe, irPara } = useApp() as any;
  const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  let arr = st.chamados.filter((c: any) => c.tipo === "posvenda" && R.podeVer(c));
  if (de) arr = arr.filter((c: any) => new Date(c.criadoEm) >= new Date(de + "T00:00:00"));
  if (ate) arr = arr.filter((c: any) => new Date(c.criadoEm) <= new Date(ate + "T23:59:59"));
  const pv = (c: any) => c.posvenda || { responsabilidade: "analise", custo: 0, descontoMontador: 0 };
  const abertos = arr.filter((c: any) => c.status !== "concluida");
  const emAnalise = arr.filter((c: any) => pv(c).responsabilidade === "analise" && c.status !== "concluida");
  const custo = arr.reduce((t: number, c: any) => t + (pv(c).custo || 0), 0);
  const desconto = arr.reduce((t: number, c: any) => t + (pv(c).descontoMontador || 0), 0);
  const definidos = arr.filter((c: any) => pv(c).responsabilidade !== "analise");
  const projeto = definidos.filter((c: any) => ["medida", "checklist"].includes(pv(c).responsabilidade)).length;

  type G = { n: number; custo: number; desc: number; itens: any[] };
  const agrupar = (lista: any[], chave: (c: any) => string) => {
    const m: Record<string, G> = {};
    lista.forEach((c: any) => { const k = chave(c); if (!k) return; const g = (m[k] = m[k] || { n: 0, custo: 0, desc: 0, itens: [] }); g.n++; g.custo += pv(c).custo || 0; g.desc += pv(c).descontoMontador || 0; g.itens.push(c); });
    return Object.entries(m).sort((a, b) => b[1].n - a[1].n);
  };
  const porResp = agrupar(arr, (c: any) => pv(c).responsabilidade);
  const porTipo = agrupar(arr, (c: any) => pv(c).categoria);
  const porMont = agrupar(arr.filter((c: any) => pv(c).responsabilidade === "montador"), (c: any) => pv(c).montadorId);
  const porMed = agrupar(arr.filter((c: any) => pv(c).responsabilidade === "medida"), (c: any) => pv(c).medidorResp);
  const porChk = agrupar(arr.filter((c: any) => pv(c).responsabilidade === "checklist"), (c: any) => pv(c).checklistResp);
  const porFab = agrupar(arr.filter((c: any) => pv(c).responsabilidade === "fabrica"), (c: any) => c.fabrica);
  const mx = (rows: any[]) => Math.max(1, ...rows.map(r => r[1].n));
  const sub = (g: G, extra = "") => <div style={{ fontSize: 11.5, color: "var(--ink-faint)", margin: "-6px 0 8px 0" }}>custo {fmtMoeda(g.custo)}{g.desc ? " · descontos " + fmtMoeda(g.desc) : ""}{extra}</div>;
  const encaminhados = st.chamados.filter((x: any) => x.vinculadoA && arr.some((c: any) => c.id === x.vinculadoA));
  const porEnc: Record<string, number> = {}; encaminhados.forEach((x: any) => (porEnc[x.tipo] = (porEnc[x.tipo] || 0) + 1));
  const COR: Record<string, string> = { analise: "var(--warn)", montador: "var(--danger)", medida: "var(--st-tratativa)", checklist: "var(--st-tratativa)", fabrica: "var(--primary)", transporte: "var(--primary)", cliente: "var(--ink-faint)", nenhum: "var(--ink-faint)" };

  return (
    <>
      <div className="card" style={{ padding: "14px 18px", margin: "14px 0 16px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          <button className="btn ghost sm" onClick={() => { setDe(""); setAte(""); }}>Limpar</button>
          {R.ehPosvenda() && <button className="btn primary sm" style={{ marginLeft: "auto" }} onClick={() => irPara("novopv")}>+ Novo atendimento</button>}
        </div>
      </div>
      <div className="kpis">
        <Kpi n={arr.length} l="Atendimentos" />
        <Kpi n={abertos.length} l="Em aberto" />
        <Kpi n={emAnalise.length} l="Aguardando análise" cls={emAnalise.length ? "alert" : ""} />
        <Kpi n={fmtMoeda(custo)} l="Custo para a loja" fs={20} />
        <Kpi n={fmtMoeda(desconto)} l="Descontos de montadores" fs={20} />
        <Kpi n={definidos.length ? Math.round(projeto / definidos.length * 100) + "%" : "—"} l={`Erros de projeto — medição/checklist (${projeto} de ${definidos.length} analisados)`} cls={projeto ? "alert" : ""} />
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Por responsabilidade</h3>
          {porResp.length ? porResp.map(([k, g]) => <div key={k}><BarRow nm={PV_RESP[k] || k} pct={g.n / mx(porResp) * 100} v={g.n} cor={COR[k]} />{sub(g)}</div>) : <Nada t="Nenhum atendimento no período." />}
        </div>
        <div className="panel"><h3>Por tipo de problema</h3>
          {porTipo.length ? porTipo.map(([k, g]) => <div key={k}><BarRow nm={PV_TIPOS[k] || k} pct={g.n / mx(porTipo) * 100} v={g.n} />{sub(g)}</div>) : <Nada t="Tipo de problema ainda não informado." />}
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Montadores responsáveis</h3>
          {porMont.length ? porMont.map(([k, g]) => <div key={k}><BarRow nm={R.nomeMontador(k)} pct={g.n / mx(porMont) * 100} v={g.n} cor="var(--danger)" />{sub(g)}</div>) : <Nada t="Nenhuma ocorrência atribuída a montador." />}
        </div>
        <div className="panel"><h3>Projeto — medição e checklist</h3>
          {porMed.map(([k, g]) => <div key={"m" + k}><BarRow nm={"Medição · " + R.nomeUser(k)} pct={g.n / mx(porMed.concat(porChk)) * 100} v={g.n} cor="var(--st-tratativa)" />{sub(g)}</div>)}
          {porChk.map(([k, g]) => <div key={"c" + k}><BarRow nm={"Checklist · " + R.nomeUser(k)} pct={g.n / mx(porMed.concat(porChk)) * 100} v={g.n} cor="var(--st-tratativa)" />{sub(g)}</div>)}
          {!porMed.length && !porChk.length && <Nada t="Nenhum erro de projeto registrado." />}
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Fábricas responsáveis</h3>
          {porFab.length ? porFab.map(([k, g]) => <div key={k}><BarRow nm={R.nomeFab(k)} pct={g.n / mx(porFab) * 100} v={g.n} cor="var(--primary)" />{sub(g)}</div>) : <Nada t="Nenhuma ocorrência atribuída a fábrica." />}
        </div>
        <div className="panel"><h3>Quem acionou e encaminhamentos</h3>
          {agrupar(arr, (c: any) => pv(c).origem || "cliente").map(([k, g]) => <BarRow key={k} nm={PV_ORIGEM[k] || k} pct={g.n / Math.max(1, arr.length) * 100} v={g.n} cor="var(--st-respondida)" />)}
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-soft)" }}>{Object.keys(porEnc).length ? <>Encaminhados a outros setores: {Object.entries(porEnc).map(([t, n]) => `${R.tipoNome(t)} (${n})`).join(" · ")}</> : "Nenhum encaminhamento a outro setor."}</div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}><h3>Atendimentos do período</h3>
        {arr.length ? R.ordenar(arr.slice()).map((c: any) => {
          const p = pv(c);
          return (
            <div className="acao" key={c.id} style={{ borderLeftColor: COR[p.responsabilidade] || "var(--line)" }} onClick={() => abrirDetalhe(c.id)}>
              <span>{c.id} · {c.cliente}{p.pecaAfetada ? " · " + p.pecaAfetada : ""} · <b style={p.responsabilidade === "analise" ? { color: "var(--warn)" } : undefined}>{PV_RESP[p.responsabilidade]}</b>{p.categoria ? " · " + PV_TIPOS[p.categoria] : ""}{p.custo ? " · " + fmtMoeda(p.custo) : ""}</span>
              <span className="g">{STATUS[c.status].label}</span>
            </div>
          );
        }) : <Nada t="Nenhum atendimento de pós-venda no período." />}
      </div>
    </>
  );
}

function Montadores() {
  const { st, executar, setModal } = useApp() as any;
  const lista = (st.montadores || []).slice().sort((a: any, b: any) => (a.ativo === b.ativo ? a.nome.localeCompare(b.nome) : a.ativo ? -1 : 1));
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ marginBottom: 14 }}><button className="btn primary" onClick={() => setModal(<EditMontador id={null} />)}>Adicionar montador</button></div>
      {lista.length ? lista.map((m: any) => (
        <div className="fab" key={m.id} style={m.ativo ? undefined : { opacity: .6 }}><div className="fi">{inicial(m.nome)}</div>
          <div><div className="fn">{m.nome}{!m.ativo && <span className="pill" style={{ marginLeft: 6 }}>inativo</span>}</div><div className="fc">{m.telefone ? "Telefone " + m.telefone : "sem telefone"}</div></div>
          <div className="sp"><button className="btn ghost sm" onClick={() => setModal(<EditMontador id={m.id} />)}>Editar</button>
            <button className={"btn sm" + (m.ativo ? " danger" : "")} onClick={() => executar(() => A.ativarMontador(m.id, !m.ativo), m.ativo ? "Montador desativado" : "Montador reativado")}>{m.ativo ? "Desativar" : "Reativar"}</button></div>
        </div>
      )) : <div className="empty">Nenhum montador cadastrado.</div>}
    </div>
  );
}

function EditMontador({ id }: { id: string | null }) {
  const { st, executar, setModal, toast } = useApp() as any;
  const m = id ? st.montadores.find((x: any) => x.id === id) : { nome: "", telefone: "" };
  const [nome, setNome] = useState(m.nome); const [tel, setTel] = useState(m.telefone || "");
  const fechar = () => setModal(null);
  return (
    <Modal titulo={id ? "Editar montador" : "Novo montador"} onFechar={fechar}>
      <div className="field" style={{ marginBottom: 14 }}><label>Nome <span className="req-star">*</span></label><input value={nome} onChange={e => setNome(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 20 }}><label>Telefone / WhatsApp</label><input value={tel} onChange={e => setTel(e.target.value)} /></div>
      <button className="btn primary" onClick={async () => { if (!nome.trim()) { toast("Informe o nome"); return; } if (await executar(() => A.salvarMontador(id, nome.trim(), tel.trim()), "Montador salvo")) fechar(); }}>Salvar</button>
    </Modal>
  );
}
