import { useEffect, useMemo, useState } from "react";
import { useApp } from "../estado";
import { inicial } from "../lib/regras";
import { entrarComo, sair, simulacao, voltarGestao } from "../lib/teste";
import Nova from "./Nova";
import { Fila, AcompMkt, Direcionamento, Consulta } from "./Listas";
import Definir from "./Definir";
import Dashboard from "./Dashboard";
import { Pendencias, Aprovacoes } from "./Pendencias";
import Agenda from "./Agenda";
import { Pessoas, Carteira, Clientes } from "./Pessoas";
import Financeiro from "./Financeiro";
import Atividades from "./Atividades";
import Relatorios from "./Relatorios";
import PosVenda from "./PosVenda";
import Treino from "./Treino";
import { Cadastros, Admin } from "./Cadastros";
import Detalhe from "../comp/Detalhe";
import { AlterarSenha } from "../comp/Modal";

const DOTS: Record<string, string> = { definir: "dotDefinir", fila: "dotFila", direcionamento: "dotDirecionamento", aprovacoes: "dotAprovacoes", pendencias: "dotPendencias" };

export default function Shell() {
  const { R, st, view, irPara, detalheId, modal, setModal, toast } = useApp();
  const sim = simulacao();
  const podeTestar = (R.ehGestao() || !!sim) && st.config.modoTeste !== false;
  const [trocando, setTrocando] = useState(false);
  async function trocar(id: string) {
    if (!id) return;
    const alvo = st.usuarios.find(u => u.id === id);
    setTrocando(true);
    try { await entrarComo(id, alvo?.nome || "", R.me()?.nome || ""); }
    catch (e: any) { toast(e.message); setTrocando(false); }
  }
  async function voltar() { setTrocando(true); try { await voltarGestao(); } catch (e: any) { toast(e.message); setTrocando(false); } }
  const G = R.menuPerfil();
  const existe = G.some((gr: any) => gr.itens.some(([v]: string[]) => v === view));
  const atual = existe ? view : "dashboard";
  const grupoDe = (v: string) => (G.find((gr: any) => gr.itens.some(([x]: string[]) => x === v)) || G[0]).g;
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set([grupoDe(atual)]));
  const [mini, setMini] = useState(false);
  const [mob, setMob] = useState(false);

  useEffect(() => { if (!existe) irPara("dashboard"); }, [existe]);
  useEffect(() => { setAbertos(new Set([grupoDe(atual)])); }, [atual]);

  const u = R.me()!;
  const contagens = useMemo(() => {
    const n: Record<string, number> = {};
    n.fila = R.state.chamados.filter(c => !R.domMarketing(c) && R.naMinhaFila(c) && (c.status === "aberta" || c.status === "tratativa" || (c.status === "informar" && R.ehCallcenter()))).length;
    n.direcionamento = R.pendentesDirecionamento().length;
    n.definir = R.podeEditarAgenda() ? R.state.chamados.filter(c => R.domMarketing(c) && c.setorDestino === "suporte_consultores" && !c.atendenteId && (R.ehGestao() || R.souRespLoja(c))).length : 0;
    n.aprovacoes = R.ehGestao() ? R.pendenciasGestao().total : 0;
    n.pendencias = R.minhasPendencias().total;
    return n;
  }, [R]);

  const itemAtual = G.flatMap((gr: any) => gr.itens.map((it: string[]) => ({ g: gr.g, v: it[0], l: it[1] }))).find((x: any) => x.v === atual);

  const clicarGrupo = (g: string) => setAbertos(prev => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const clicarItem = (v: string, g: string) => {
    setAbertos(new Set([g])); irPara(v);
    if (window.innerWidth <= 900) setMob(false);
  };

  return (
    <div id="telaApp">
      <div className={"backdrop" + (mob ? " on" : "")} id="backdrop" onClick={() => setMob(false)}></div>
      <div className="app">
        <aside className={"side" + (mini ? " mini" : "") + (mob ? " abertoMob" : "")} id="side">
          <div className="side-topo"><div className="mark">AM</div><div className="side-nome">Aliança Móveis<span>ALIANÇA 360</span></div></div>
          <div className="side-rolar" id="tabs">
            {G.map((gr: any) => {
              const aberto = abertos.has(gr.g);
              const soma = gr.itens.reduce((t: number, [v]: string[]) => t + (DOTS[v] ? contagens[v] || 0 : 0), 0);
              return (
                <div key={gr.g} className={"grupo" + (aberto ? " aberto" : "")} data-g={gr.g}>
                  <div className="gcab" onClick={() => clicarGrupo(gr.g)}>
                    <span className="ic">{gr.ic}</span><span className="lbl">{gr.g}</span>
                    {soma > 0 && <span className={"dot grp" + (aberto ? "" : " cinza")} style={{ display: "inline-block" }}>{soma}</span>}
                    <span className="seta">▶</span>
                  </div>
                  <div className="sub">
                    {gr.itens.map(([v, l]: string[]) => (
                      <div key={v} className={"it" + (v === atual ? " on" : "")} onClick={() => clicarItem(v, gr.g)}>
                        <span className="pt"></span>{l}
                        {DOTS[v] && contagens[v] > 0 && <span className="dot" id={DOTS[v]} style={{ display: "inline-block" }}>{contagens[v]}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="side-pe">
            <div className="side-av" id="sideAv">{inicial(u.nome.includes("— ") ? u.nome.split("— ")[1] : u.nome)}</div>
            <div className="side-txt" style={{ flex: 1, minWidth: 0 }}>
              <b id="sideNome">{u.nome}</b><span id="sideSetor">{R.setoresLabel(u)}</span>
              <button id="btSair" onClick={() => setModal(<AlterarSenha />)} style={estiloBtSide}>Alterar minha senha</button>
              {podeTestar && (
                <select value="" disabled={trocando} onChange={e => trocar(e.target.value)} style={{ ...estiloBtSide, appearance: "auto" }} title="Modo de teste: entrar como outro usuário">
                  <option value="">{trocando ? "Trocando…" : "Entrar como… (teste)"}</option>
                  {st.usuarios.filter(x => x.ativo && x.id !== R.currentUserId).map(x => <option key={x.id} value={x.id}>{x.nome} · {R.setoresLabel(x)}</option>)}
                </select>
              )}
              {sim && <button onClick={voltar} disabled={trocando} style={{ ...estiloBtSide, color: "#f5d67a", borderColor: "rgba(245,214,122,.4)" }}>← Voltar para {sim.nome}</button>}
              <button id="btSair2" className="btSair" onClick={() => sair()} style={estiloBtSide}>← Sair</button>
            </div>
          </div>
        </aside>
        <div className="main-col">
          <div className="barra-topo">
            <button className="hb" id="btMenu" title="Recolher menu" onClick={() => { if (window.innerWidth <= 900) setMob(m => !m); else setMini(m => !m); }}>☰</button>
            <div className="trilha"><span id="trGrupo">{itemAtual ? itemAtual.g : "Pessoal"}</span><b id="trItem">{itemAtual ? itemAtual.l : "Dashboard"}</b></div>
            {sim && <div style={{ marginLeft: 16, fontSize: 12, background: "var(--warn-bg)", color: "var(--warn)", border: "1px solid var(--warn)", borderRadius: 8, padding: "4px 10px" }}>Modo de teste: você está como <b>{R.me()?.nome}</b> · <a href="#" onClick={e => { e.preventDefault(); voltar(); }} style={{ color: "inherit" }}>voltar para {sim.nome}</a></div>}
            <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-faint)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#5fb87a", display: "inline-block", animation: "pulse2 2s infinite" }}></span>
              ALIANÇA 360
            </div>
          </div>
          <main>
            {(atual === "nova" || atual === "novocli" || atual === "novopv") && <Nova key={atual} escopo={atual === "novocli" ? "mkt" : atual === "novopv" ? "pv" : "cc"} />}
            {atual === "fila" && <Fila />}
            {atual === "acompmkt" && <AcompMkt />}
            {atual === "direcionamento" && <Direcionamento />}
            {atual === "definir" && <Definir />}
            {atual === "consulta" && <Consulta />}
            {atual === "dashboard" && <Dashboard />}
            {atual === "pendencias" && <Pendencias />}
            {atual === "aprovacoes" && <Aprovacoes />}
            {atual === "agenda" && <Agenda />}
            {atual === "vendedores" && <Pessoas key="v" qual="vendedores" />}
            {atual === "consultores" && <Pessoas key="c" qual="consultores" />}
            {atual === "carteira" && <Carteira />}
            {atual === "clientes" && <Clientes />}
            {atual === "financeiro" && <Financeiro />}
            {atual === "atividades" && <Atividades />}
            {atual === "cadastros" && <Cadastros />}
            {atual === "admin" && <Admin />}
            {atual === "relatorios" && <Relatorios />}
            {atual === "posvenda" && <PosVenda />}
            {atual === "treino" && <Treino />}
          </main>
        </div>
      </div>
      {detalheId && <Detalhe id={detalheId} />}
      {modal}
    </div>
  );
}
const estiloBtSide: React.CSSProperties = { marginTop: 8, width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#9dabbf", padding: "6px 10px", borderRadius: 8, fontFamily: "inherit", fontSize: 11.5, cursor: "pointer", textAlign: "left" };
