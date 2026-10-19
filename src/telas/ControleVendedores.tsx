// Controle dos vendedores (gerentes, Gestão, Supervisão Marketing e Suporte): tipo, folga da semana, horário,
// rodízio de domingo (trabalha 2, folga 1), trocas de folga por dia, férias e "fora da agenda".
// Sábado e domingo: todos 9:00–18:00 com 1h de almoço livre. O banco confere a permissão (_gere_vendedores).
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { DIAS_SEMANA, TURNOS, domingoDeFolga, fmtDate, folgaEm, hojeISO } from "../lib/regras";
import { ModalFerias, textoFerias } from "../comp/Ferias";

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
  const [fo, setFo] = useState(u.folga == null ? "" : String(u.folga));
  const [t, setT] = useState(u.turno || "");
  const [dm, setDm] = useState(u.domingoRef ? (doms.find((d: string) => domingoDeFolga(u, d, {})) || "") : "");
  const [ag, setAg] = useState(u.naAgenda !== false);
  const salvar = () => ex(() => A.vendedorEscalaV2(u.id, fp, fo === "" ? null : Number(fo), t, dm || null, ag), "Escala de " + nomeCurto(u.nome) + " salva");
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
        <b>{nomeCurto(u.nome)}</b>{u.freelancer && <span className="cv-freela">Freelancer</span>}{fer && <span className="cv-fer">{fer}</span>}{u.naAgenda === false && <span className="cv-fora">fora da agenda</span>}
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
            <label>Folga da semana<select value={fo} onChange={e => setFo(e.target.value)}><option value="">Sem folga na semana</option>{DIAS_SEMANA.map((d, i) => i > 0 ? <option key={i} value={i}>{d}</option> : null)}</select></label>
            <label>Horário (seg–sex)<select value={t} onChange={e => setT(e.target.value)}><option value="">Não informado</option>{Object.entries(TURNOS).map(([k, x]) => <option key={k} value={k}>{x.rot}</option>)}</select></label>
            <label>Próximo domingo de folga<select value={dm} onChange={e => setDm(e.target.value)}><option value="">Sem rodízio de domingo</option>{doms.map((d: string) => <option key={d} value={d}>{fmtDate(d)} (e a cada 3 domingos)</option>)}</select></label>
            <label>Agenda<select value={ag ? "1" : "0"} onChange={e => setAg(e.target.value === "1")}><option value="1">Entra na agenda (definir vendedor e fila)</option><option value="0">Fora da agenda (ex.: freelance)</option></select></label>
          </div>
          <div className="cv-bts"><button className="btn primary sm" onClick={salvar}>Salvar escala</button><button className="btn sm" onClick={() => setModal(<ModalFerias u={u} />)}>🏖 {fer ? "Alterar férias" : "Marcar férias"}</button>
            {podeCadastrarVendedores(R) && <button className="btn sm" onClick={() => { if (confirm(u.freelancer ? "Tirar " + nomeCurto(u.nome) + " da categoria Freelancer?" : "Marcar " + nomeCurto(u.nome) + " como Freelancer?")) ex(() => A.vendedorFreelancer(u.id, !u.freelancer), u.freelancer ? "Agora é vendedor da loja" : "Marcado como Freelancer"); }}>{u.freelancer ? "Tirar de Freelancer" : "Marcar como Freelancer"}</button>}
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
      <label>Senha inicial<input value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} /></label>
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
