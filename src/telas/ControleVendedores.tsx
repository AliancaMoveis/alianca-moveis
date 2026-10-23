// Controle dos vendedores (gerentes, Gestão, Supervisão Marketing e Suporte): tipo, folga da semana, horário,
// rodízio de domingo (trabalha 2, folga 1), trocas de folga por dia, férias e "fora da agenda".
// Sábado e domingo: todos 9:00–18:00 com 1h de almoço livre. O banco confere a permissão (_gere_vendedores).
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { DIAS_SEMANA, TURNOS, calcMapaDomingos, domingoDeFolga, fmtDate, folgaEm, hojeISO, type EscalaDom } from "../lib/regras";
import { ModalFerias, textoFerias } from "../comp/Ferias";
import Senha from "../comp/Senha";
import { SeloFreela } from "../comp/SelVendedor";

// cadastrar / descadastrar vendedor (gera o acesso só com a função de vendedor): gerentes e Gestão — o banco confere (_cadastra_vendedores)
export const podeCadastrarVendedores = (R: any) => R.ehGestao() || R.mySetores().includes("gerente_loja");
export const podeGerirVendedores = (R: any) => R.ehGestao() || R.mySetores().some((x: string) => ["gerente_loja", "marketing_supervisao", "suporte_consultores"].includes(x));

const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
const proxDomingos = (n: number) => { const h = hojeISO(); const p = somaDias(h, (7 - dow(h)) % 7); return Array.from({ length: n }, (_, i) => somaDias(p, i * 7)); };
const DS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const nomeCurto = (n: string) => (n || "").replace(/^(Consultora?|Vendedora?)\s+—\s+/, "");

export default function ControleVendedores({ movel }: { movel?: boolean }) {
  const { R } = useApp() as any;
  const [q, setQ] = useState(""); const [aberto, setAberto] = useState("");
  const [novo, setNovo] = useState(false); const [verInat, setVerInat] = useState(false);
  // vendedores descadastrados (só com a função de vendedor) — podem ser reativados
  const inativos = (R.state.usuarios || []).filter((u: any) => !u.ativo && (u.setores || []).length === 1 && u.setores[0] === "atendente_cliente");
  const dias = R.state.vendedorDias || {};
  const todos = R.projetistas();
  const lista = todos.filter((u: any) => !q.trim() || u.nome.toLowerCase().includes(q.trim().toLowerCase()));
  const doms = proxDomingos(3);
  const pode = podeGerirVendedores(R);
  return (
    <section className={movel ? "cv mv-cv" : "view active cv"}>
      {!movel && <div className="view-head"><div><h2>Controle dos vendedores</h2><p>Folga da semana, domingos de folga (trabalha 2, folga 1), trocas de folga, horário de almoço e férias.</p></div></div>}
      <div className="cv-info">🗓 <b>Sábado e domingo:</b> todos entram às 9:00 e saem às 18:00, com 1h de almoço em qualquer horário. <b>Folga no domingo</b> = trabalha a semana toda; <b>trabalhou o domingo</b> = tem a folga do dia da semana.</div>
      <div className="cv-doms">{doms.map(d => { const f = todos.filter((u: any) => u.naAgenda !== false && folgaEm(u, d, dias[u.id])); return (
        <div key={d} className="cv-dom"><b>Domingo {fmtDate(d).slice(0, 5)}</b><span>{f.length ? f.map((u: any) => nomeCurto(u.nome)).join(", ") : "ninguém de folga"}</span><small>{f.length} de folga</small></div>); })}</div>
      <EscalaABC todos={todos} pode={pode} />
      {podeCadastrarVendedores(R) && (novo ? <NovoVendedor fechar={() => setNovo(false)} /> : <div className="cv-bts" style={{ margin: "0 0 10px" }}><button className="btn primary" onClick={() => setNovo(true)}>＋ Cadastrar vendedor</button>
        <span className="cv-dica" style={{ margin: 0 }}>Gera o acesso ao 360 só com a função de vendedor.</span></div>)}
      <input className={movel ? "mv-busca" : "cv-busca"} type="search" placeholder="🔎 Buscar vendedor" value={q} onChange={e => setQ(e.target.value)} />
      {lista.map((u: any) => <Linha key={u.id} u={u} dias={dias[u.id] || {}} aberto={aberto === u.id} abrir={() => setAberto(aberto === u.id ? "" : u.id)} pode={pode} doms={doms} />)}
      {!lista.length && <div className="mv-vazio">Nenhum vendedor encontrado.</div>}
      {podeCadastrarVendedores(R) && inativos.length > 0 && <div className="cv-inat"><button className="btn ghost sm" onClick={() => setVerInat(!verInat)}>{verInat ? "▾" : "▸"} Descadastrados ({inativos.length})</button>
        {verInat && inativos.map((u: any) => <ReativarLinha key={u.id} u={u} />)}</div>}
    </section>
  );
}

function Linha({ u, dias, aberto, abrir, pode, doms }: any) {
  const { R, executar: ex, setModal, toast } = useApp() as any;
  const fer = textoFerias(u);
  const tu = TURNOS[u.turno || ""];
  const domFolga = doms.find((d: string) => domingoDeFolga(u, d, dias));
  const resumo = [u.fazProjeto !== false ? "📐 projetista" : "só vendedor", u.folga != null ? "folga " + DIAS_SEMANA[u.folga] : "sem folga na semana",
    u.domingoRef ? "domingo de folga: " + (domFolga ? fmtDate(domFolga).slice(0, 5) : "—") : "sem rodízio de domingo", tu ? (u.turno === "manha" ? "manhã" : "tarde") : ""].filter(Boolean).join(" · ");
  const [fp, setFp] = useState(u.fazProjeto !== false);
  // Tipo: projetista · só vendedor · freelance (freelance não entra na sugestão automática; o gerente escolhe à mão quando precisar)
  const [fr, setFr] = useState(!!u.freelancer);
  const podeCat = podeCadastrarVendedores(R);
  const [fo, setFo] = useState(u.folga == null ? "" : String(u.folga));
  const [t, setT] = useState(u.turno || "");
  const [dm, setDm] = useState(u.domingoRef ? (doms.find((d: string) => domingoDeFolga(u, d, {})) || "") : "");
  const [ag, setAg] = useState(u.naAgenda !== false);
  const [esc, setEsc] = useState<string>(u.escalaDom || "");
  const mapa: Record<string, string> = ((R.state.config || {}).escalaDomingos || {}).mapa || {};
  const grupos: Record<string, string> = { A: proxDoGrupo(mapa, "A"), B: proxDoGrupo(mapa, "B"), C: proxDoGrupo(mapa, "C") };
  const domGrupo = (l: string) => grupos[l] || "";
  const salvar = () => ex(async () => {
    if (esc !== (u.escalaDom || "")) await A.vendedorEscalaAbc(u.id, esc);
    await A.vendedorEscalaV2(u.id, fp, fo === "" ? null : Number(fo), t, (esc && domGrupo(esc)) || dm || null, ag);
    if (fr !== !!u.freelancer) await A.vendedorFreelancer(u.id, fr);
  }, "Escala de " + nomeCurto(u.nome) + " salva");
  const h = hojeISO(); const cal = Array.from({ length: 21 }, (_, i) => somaDias(h, i));
  const trocar = (d: string) => {
    if (!pode) return;
    const ex0 = dias[d]; const folga = folgaEm(u, d, dias);
    const txt = ex0 ? "Voltar " + fmtDate(d).slice(0, 5) + " para a escala normal?" : folga ? "Trocar: " + nomeCurto(u.nome) + " TRABALHA em " + DS[dow(d)] + " " + fmtDate(d).slice(0, 5) + "?" : "Marcar FOLGA de " + nomeCurto(u.nome) + " em " + DS[dow(d)] + " " + fmtDate(d).slice(0, 5) + "?";
    if (!confirm(txt)) return;
    ex(() => A.vendedorDia(u.id, d, ex0 ? "" : folga ? "trabalha" : "folga"), ex0 ? "Dia voltou para a escala" : folga ? "Marcado: trabalha" : "Folga marcada").catch(() => toast("Não foi possível salvar"));
  };
  return (
    <div className={"cv-v" + (aberto ? " on" : "") + (u.naAgenda === false ? " fora" : "")}>
      <button className="cv-h" onClick={abrir}>
        <b>{nomeCurto(u.nome)}</b><SeloFreela u={u} />{fer && <span className="cv-fer">{fer}</span>}{u.naAgenda === false && <span className="cv-fora">fora da agenda</span>}
        <small>{resumo}</small>
      </button>
      {aberto && <div className="cv-x">
        <div className="cv-cal">{cal.map(d => { const f = folgaEm(u, d, dias), e = !!dias[d], fe = !!(u.feriasAte && d <= u.feriasAte && d >= (u.feriasDe || d)); return (
          <button key={d} className={"cv-dia" + (f ? " folga" : "") + (e ? " troca" : "") + (fe ? " ferias" : "") + (dow(d) === 0 ? " dom" : "")} onClick={() => trocar(d)} disabled={!pode} title={e ? "troca de folga (toque para desfazer)" : ""}>
            <span>{DS[dow(d)]}</span><b>{d.slice(8, 10)}</b><i>{fe ? "férias" : f ? "folga" : "trab."}</i></button>); })}</div>
        {pode && <div className="cv-dica">Toque num dia para trocar a folga (folga ⇄ trabalha). Dias com borda tracejada são trocas.</div>}
        {pode ? <>
          <div className="cv-form">
            <label>Tipo<select value={fp ? "1" : "0"} onChange={e => setFp(e.target.value === "1")}><option value="1">📐 Projetista (faz projeto)</option><option value="0">Só vendedor (não faz projeto)</option></select></label>
            <label>Categoria<select value={fr ? "1" : "0"} disabled={!podeCat} onChange={e => setFr(e.target.value === "1")}><option value="0">Vendedor da loja</option><option value="1">🔵 Freelance (fora da sugestão automática)</option></select>
              {fr && <small className="hint">Não entra na sugestão automática de agendamento. Fica disponível para o gerente escolher à mão quando precisar.</small>}</label>
            <label>Folga da semana<select value={fo} onChange={e => setFo(e.target.value)}><option value="">Sem folga na semana</option>{DIAS_SEMANA.map((d, i) => i > 0 ? <option key={i} value={i}>{d}</option> : null)}</select></label>
            <label>Horário (seg–sex)<select value={t} onChange={e => setT(e.target.value)}><option value="">Não informado</option>{Object.entries(TURNOS).map(([k, x]) => <option key={k} value={k}>{x.rot}</option>)}</select></label>
            <label>Escala de domingo<select value={esc} onChange={e => setEsc(e.target.value)}><option value="">Sem escala ABC (definir à mão)</option>{["A", "B", "C"].map(l => <option key={l} value={l}>Escala {l}{grupos[l] ? " — folga " + fmtDate(domGrupo(l)).slice(0, 5) + " e a cada 3 domingos" : " (data ainda não definida)"}</option>)}</select></label>
            {esc ? <label>Próximo domingo de folga<div className="cv-escfix">{domGrupo(esc) ? fmtDate(domGrupo(esc)) + " · escala " + esc : "defina o domingo da escala " + esc + " acima"}</div></label>
              : <label>Próximo domingo de folga<select value={dm} onChange={e => setDm(e.target.value)}><option value="">Sem rodízio de domingo</option>{doms.map((d: string) => <option key={d} value={d}>{fmtDate(d)} (e a cada 3 domingos)</option>)}</select></label>}
            <label>Agenda<select value={ag ? "1" : "0"} onChange={e => setAg(e.target.value === "1")}><option value="1">Entra na agenda (definir vendedor e fila)</option><option value="0">Fora da agenda (ex.: freelance)</option></select></label>
          </div>
          <div className="cv-bts"><button className="btn primary sm" onClick={salvar}>Salvar escala</button><button className="btn sm" onClick={() => setModal(<ModalFerias u={u} />)}>🏖 {fer ? "Alterar férias" : "Marcar férias"}</button>
            {podeCadastrarVendedores(R) && (u.setores || []).length === 1 && <button className="btn sm danger" onClick={async () => {
              if (!confirm("Descadastrar " + nomeCurto(u.nome) + "?\n\nO acesso ao 360 é bloqueado e os clientes agendados de hoje em diante (sem venda) voltam para a fila sem vendedor.")) return;
              await ex(() => A.vendedorDescadastrar(u.id), nomeCurto(u.nome) + " descadastrado(a)"); }}>🚫 Descadastrar</button>}</div>
        </> : <div className="cv-dica">Só gerentes, Gestão, Supervisão Marketing e Suporte alteram a escala.</div>}
      </div>}
    </div>
  );
}

function NovoVendedor({ fechar }: { fechar: () => void }) {
  const { executar: ex, toast } = useApp() as any;
  const [f, setF] = useState({ nome: "", email: "", senha: "Alianca@2026", freelancer: false, fazProjeto: true });
  const salvar = async () => {
    if (!f.nome.trim()) { toast("Informe o nome"); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { toast("Informe um e-mail válido"); return; }
    if (f.senha.length < 8) { toast("A senha precisa ter pelo menos 8 caracteres"); return; }
    if (!confirm("Cadastrar " + f.nome.trim() + " como " + (f.freelancer ? "vendedor freelancer" : "vendedor") + "?\nLogin: " + f.email.trim().toLowerCase() + "\nSenha: " + f.senha)) return;
    if (await ex(() => A.vendedorCadastrar(f.nome.trim(), f.email.trim(), f.senha, f.freelancer, f.fazProjeto), "Vendedor cadastrado — já pode entrar no 360")) fechar();
  };
  return <div className="cv-novo"><h4>＋ Novo vendedor</h4>
    <div className="cv-form">
      <label>Nome<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Pedro Almeida" autoFocus /></label>
      <label>E-mail (login)<input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="pedro@alianca360.com.br" inputMode="email" /></label>
      <label>Senha inicial<Senha value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} autoComplete="new-password" /></label>
      <label>Categoria<select value={f.freelancer ? "1" : "0"} onChange={e => setF({ ...f, freelancer: e.target.value === "1" })}><option value="0">Vendedor da loja</option><option value="1">Freelancer</option></select></label>
      <label>Tipo<select value={f.fazProjeto ? "1" : "0"} onChange={e => setF({ ...f, fazProjeto: e.target.value === "1" })}><option value="1">📐 Projetista (faz projeto)</option><option value="0">Só vendedor (não faz projeto)</option></select></label>
    </div>
    <div className="cv-bts"><button className="btn primary sm" onClick={salvar}>Cadastrar e gerar acesso</button><button className="btn ghost sm" onClick={fechar}>Cancelar</button></div>
    <div className="cv-dica">O acesso é só de vendedor (vê os próprios clientes, a agenda da loja e dá parecer). Peça para trocar a senha no primeiro acesso.</div>
  </div>;
}

function ReativarLinha({ u }: any) {
  const { executar: ex } = useApp() as any;
  return <div className="cv-inat-l"><span>{nomeCurto(u.nome)}{u.freelancer ? " · Freelancer" : ""} <small>{u.email}</small></span>
    <button className="btn sm" onClick={() => { if (confirm("Reativar " + nomeCurto(u.nome) + "? O acesso ao 360 volta a funcionar.")) ex(() => A.vendedorReativar(u.id), nomeCurto(u.nome) + " reativado(a)"); }}>Reativar</button></div>;
}

/** próximo domingo (de hoje em diante) em que o grupo folga, pelo mapa da escala */
function proxDoGrupo(mapa: Record<string, string>, l: string) { const h = hojeISO(); return Object.keys(mapa).sort().find(d => d >= h && mapa[d] === l) || ""; }
/** Escala ABC de domingos: domingo a domingo (vários para frente). O gerente escolhe o primeiro domingo e o grupo, marca os
 *  domingos com a LOJA FECHADA (não gasta a vez de ninguém: a sequência anda) e pode trocar o grupo de um domingo — dali em diante segue A → B → C. */
function EscalaABC({ todos, pode }: { todos: any[]; pode: boolean }) {
  const { R, executar: ex } = useApp() as any;
  const e0: EscalaDom = (R.state.config || {}).escalaDomingos || {};
  const doms0 = proxDomingos(1);
  const [ini, setIni] = useState<{ data: string; letra: string }>(e0.inicio?.data ? e0.inicio : { data: doms0[0], letra: "A" });
  const [fech, setFech] = useState<string[]>(e0.fechados || []);
  const [man, setMan] = useState<Record<string, string>>(e0.manual || {});
  const [aberto, setAberto] = useState(false); const [semanas, setSemanas] = useState(16);
  const mapa = calcMapaDomingos({ inicio: ini, fechados: fech, manual: man }, 52);
  const h = hojeISO();
  const lista = Object.keys(mapa).sort().filter(d => d >= h).slice(0, semanas);
  const membros = (l: string) => todos.filter((u: any) => u.escalaDom === l);
  const mapaSalvo: Record<string, string> = e0.mapa || {};
  const mudou = JSON.stringify(mapa) !== JSON.stringify(mapaSalvo);
  const marcar = (d: string, v: string) => {
    const f = fech.filter(x => x !== d); const m = { ...man }; delete m[d];
    if (v === "fechada") f.push(d); else if (v) m[d] = v;
    setFech(f.sort()); setMan(m);
  };
  const domsIni = [...new Set([ini.data, ...proxDomingos(6)])].sort();
  return <div className="cv-abc">
    <div className="cv-abc-cab" onClick={() => setAberto(!aberto)}><b>🗓 Escala ABC de domingos</b>
      <span>{["A", "B", "C"].map(l => <i key={l}>{l}: {proxDoGrupo(mapaSalvo, l) ? fmtDate(proxDoGrupo(mapaSalvo, l)).slice(0, 5) : "—"} · {membros(l).length} vend.</i>)}</span><small>{aberto ? "▾" : "▸"}</small></div>
    {aberto && <div className="cv-abc-corpo">
      <p className="cv-dica" style={{ margin: "0 0 8px" }}>Cada domingo folga um grupo, na ordem A → B → C. <b>Loja fechada</b> não gasta a vez de ninguém: a sequência anda para o domingo seguinte. Pode trocar o grupo de qualquer domingo — dali em diante continua a ordem. O vendedor entra no grupo pelo campo <b>Escala de domingo</b> na linha dele.</p>
      <div className="cv-abc-ini">Começa em <select value={ini.data} disabled={!pode} onChange={e => setIni({ ...ini, data: e.target.value })}>{domsIni.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}</select>
        com a escala <select value={ini.letra} disabled={!pode} onChange={e => setIni({ ...ini, letra: e.target.value })}>{["A", "B", "C"].map(l => <option key={l} value={l}>{l}</option>)}</select></div>
      <div className="cv-abc-tira">{lista.map(d => { const v = mapa[d]; const f = v === "fechada"; const manual = !!man[d];
        return <div key={d} className={"cv-abc-dom" + (f ? " fech" : " g" + v)}>
          <small>dom</small><b>{fmtDate(d).slice(0, 5)}</b>
          <span className="cv-abc-v">{f ? "🚫 fechada" : "folga " + v}</span>
          <em>{f ? "loja fechada" : membros(v).map((u: any) => nomeCurto(u.nome)).join(", ") || "ninguém no grupo"}</em>
          {pode && <select value={f ? "fechada" : manual ? man[d] : ""} onChange={e => marcar(d, e.target.value)} title="Mudar este domingo">
            <option value="">automático ({f ? "—" : v})</option><option value="A">grupo A</option><option value="B">grupo B</option><option value="C">grupo C</option><option value="fechada">🚫 loja fechada</option></select>}
        </div>; })}</div>
      <div className="cv-bts" style={{ marginTop: 8 }}>
        <button className="btn ghost sm" onClick={() => setSemanas(semanas + 12)}>Mostrar mais domingos ›</button>
        {pode && <button className="btn primary sm" disabled={!mudou} onClick={() => ex(() => A.escalaDomingosSalvar({ inicio: ini, fechados: fech, manual: man, mapa }), "Escala ABC salva — " + Object.keys(mapa).length + " domingos para frente")}>{mudou ? "Salvar escala ABC" : "Escala salva"}</button>}
      </div>
    </div>}
  </div>;
}
