// Pós-venda Projetados — números de qualidade (ocorrências, custos, montadores e impacto do checklist) e cadastro de montadores.
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { PV_CATEGORIAS, PV_ORIGEM, STATUS, fmtMoeda, inicial } from "../lib/regras";
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
  const { R, st, abrirDetalhe } = useApp();
  const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  let arr = st.chamados.filter((c: any) => c.tipo === "posvenda" && R.podeVer(c));
  if (de) arr = arr.filter((c: any) => new Date(c.criadoEm) >= new Date(de + "T00:00:00"));
  if (ate) arr = arr.filter((c: any) => new Date(c.criadoEm) <= new Date(ate + "T23:59:59"));
  const reg = arr.filter((c: any) => c.posvenda);
  const semReg = arr.filter((c: any) => !c.posvenda && c.status !== "concluida");
  const abertos = arr.filter((c: any) => c.status !== "concluida").length;
  const custo = reg.reduce((s: number, c: any) => s + (c.posvenda.custo || 0), 0);
  const desconto = reg.reduce((s: number, c: any) => s + (c.posvenda.descontoMontador || 0), 0);
  const avaliados = reg.filter((c: any) => c.posvenda.erroChecklist);
  const erroChk = avaliados.filter((c: any) => c.posvenda.erroChecklist === "sim").length;
  const pctErro = avaliados.length ? Math.round(erroChk / avaliados.length * 100) : 0;

  const agrupar = (chave: (c: any) => string) => {
    const m: Record<string, { n: number; custo: number; desc: number; erro: number; ok: number; itens: any[] }> = {};
    reg.forEach((c: any) => { const k = chave(c); if (!k) return; const g = (m[k] = m[k] || { n: 0, custo: 0, desc: 0, erro: 0, ok: 0, itens: [] }); g.n++; g.custo += c.posvenda.custo || 0; g.desc += c.posvenda.descontoMontador || 0; if (c.posvenda.erroChecklist === "sim") g.erro++; if (c.posvenda.erroChecklist === "nao") g.ok++; g.itens.push(c); });
    return Object.entries(m).sort((a, b) => b[1].n - a[1].n);
  };
  const porCat = agrupar((c: any) => c.posvenda.categoria);
  const porMont = agrupar((c: any) => c.posvenda.montadorId);
  const porChk = agrupar((c: any) => c.posvenda.checklistResp);
  const porOrig = agrupar((c: any) => c.posvenda.origem);
  const mx = (rows: any[]) => Math.max(1, ...rows.map(r => r[1].n));
  const encaminhados = st.chamados.filter((x: any) => x.vinculadoA && arr.some((c: any) => c.id === x.vinculadoA));
  const porEnc: Record<string, number> = {}; encaminhados.forEach((x: any) => (porEnc[x.tipo] = (porEnc[x.tipo] || 0) + 1));

  return (
    <>
      <div className="card" style={{ padding: "14px 18px", margin: "14px 0 16px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          <button className="btn ghost sm" onClick={() => { setDe(""); setAte(""); }}>Limpar</button>
        </div>
      </div>
      <div className="kpis">
        <Kpi n={arr.length} l="Atendimentos" />
        <Kpi n={abertos} l="Em aberto" />
        <Kpi n={semReg.length} l="Sem registro preenchido" cls={semReg.length ? "alert" : ""} />
        <Kpi n={fmtMoeda(custo)} l="Custo para a loja" fs={20} />
        <Kpi n={fmtMoeda(desconto)} l="Descontos de montadores" fs={20} />
        <Kpi n={avaliados.length ? pctErro + "%" : "—"} l={`Falha no checklist (${erroChk} de ${avaliados.length} avaliados)`} cls={erroChk ? "alert" : ""} />
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Por tipo de ocorrência</h3>
          {porCat.length ? porCat.map(([k, g]) => <div key={k}><BarRow nm={PV_CATEGORIAS[k] || k} pct={g.n / mx(porCat) * 100} v={g.n} /><div style={{ fontSize: 11.5, color: "var(--ink-faint)", margin: "-6px 0 8px 0" }}>custo {fmtMoeda(g.custo)}{g.desc ? " · descontos " + fmtMoeda(g.desc) : ""}</div></div>) : <Nada t="Nenhum registro ainda." />}
        </div>
        <div className="panel"><h3>Por montador</h3>
          {porMont.length ? porMont.map(([k, g]) => <div key={k}><BarRow nm={R.nomeMontador(k)} pct={g.n / mx(porMont) * 100} v={g.n} cor="var(--danger)" /><div style={{ fontSize: 11.5, color: "var(--ink-faint)", margin: "-6px 0 8px 0" }}>{g.itens.filter((c: any) => c.posvenda.categoria === "avaria_montador").length} avaria(s) · desconto {fmtMoeda(g.desc)} · custo {fmtMoeda(g.custo)}</div></div>) : <Nada t="Nenhum montador informado ainda." />}
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Checklist — por responsável</h3>
          {porChk.length ? porChk.map(([k, g]) => { const av = g.erro + g.ok; return <div key={k}><BarRow nm={R.nomeUser(k)} pct={g.n / mx(porChk) * 100} v={g.n} cor="var(--st-tratativa)" /><div style={{ fontSize: 11.5, color: "var(--ink-faint)", margin: "-6px 0 8px 0" }}>{g.erro} com falha no checklist · {g.ok} checklist correto{av ? " · " + Math.round(g.erro / av * 100) + "% de falha" : ""}{g.custo ? " · custo " + fmtMoeda(g.custo) : ""}</div></div>; }) : <Nada t="Nenhum responsável de checklist informado ainda." />}
        </div>
        <div className="panel"><h3>Quem acionou e encaminhamentos</h3>
          {porOrig.map(([k, g]) => <BarRow key={k} nm={PV_ORIGEM[k] || k} pct={g.n / mx(porOrig) * 100} v={g.n} cor="var(--st-respondida)" />)}
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-soft)" }}>{Object.keys(porEnc).length ? <>Encaminhados a outros setores: {Object.entries(porEnc).map(([t, n]) => `${R.tipoNome(t)} (${n})`).join(" · ")}</> : "Nenhum encaminhamento a outro setor."}</div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}><h3>Atendimentos do período</h3>
        {arr.length ? arr.map((c: any) => {
          const p = c.posvenda;
          return (
            <div className="acao" key={c.id} style={{ borderLeftColor: p ? "var(--st-concluida)" : "var(--warn)" }} onClick={() => abrirDetalhe(c.id)}>
              <span>{c.id} · {c.cliente} · {p ? <b>{PV_CATEGORIAS[p.categoria] || "—"}</b> : <b style={{ color: "var(--warn)" }}>sem registro</b>}{p && p.montadorId ? " · " + R.nomeMontador(p.montadorId) : ""}{p && p.custo ? " · " + fmtMoeda(p.custo) : ""}</span>
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
