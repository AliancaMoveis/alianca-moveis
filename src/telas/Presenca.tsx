// ✅ Confirmação de presença (Camila e Gestão): quem vem à loja no dia, em três abas —
// Marketing (agendado pelas operadoras), Externo (veio do consultor) e Porta (entrou direto na loja, sem marketing e sem consultor).
// Aqui se confirma a vinda, define/troca o vendedor, vê as fotos e registra o cliente porta.
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtDate, hojeISO, isoLocal, parseData, STATUS_CLIENTE } from "../lib/regras";
import { ConfirmarVinda, SeloVinda, vindaConfirmada } from "../comp/Situacao";
import { SelVendedor, confirmarDisp, registrarIndisp } from "../comp/SelVendedor";
import { BotaoWhats, separarTelefones } from "../comp/Whats";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const maisDias = (iso: string, n: number) => { const d = parseData(iso + "T12:00"); d.setDate(d.getDate() + n); return isoLocal(d); };
const hora = (v: any) => { const s = String(v || ""); return s.length > 10 ? s.slice(11, 16) : "—"; };
type Aba = "todos" | "marketing" | "externo" | "porta";

export default function Presenca({ movel, novoPorta }: { movel?: boolean; novoPorta?: boolean }) {
  const { R, st } = useApp() as any;
  const [dia, setDia] = useState(hojeISO());
  const [aba, setAba] = useState<Aba>(novoPorta ? "porta" : "todos");
  const [novo, setNovo] = useState(!!novoPorta);
  const abrirNovo = () => { setAba("porta"); setNovo(true); setDia(hojeISO()); };
  const origem = (c: any): Aba | null => R.ehPorta(c) ? "porta" : R.domMarketing(c) ? (R.ehDireto(c) ? "marketing" : "externo") : null;
  // "Todos": a loja inteira do dia — marketing, externo, porta e quem mais estiver marcado na loja
  const doDia = st.chamados.filter((c: any) => c.dataLoja && String(c.dataLoja).slice(0, 10) === dia && R.podeVer(c)
    && !(c.tratativa && (c.tratativa.importadoVisita || c.tratativa.visitaImportada)))
    .sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const de = (k: Aba) => k === "todos" ? doDia : doDia.filter((c: any) => origem(c) === k);
  const lista = de(aba);
  const pend = (k: Aba) => k === "porta" ? 0 : de(k).filter((c: any) => origem(c) !== "porta" && !vindaConfirmada(c) && !c.venda).length;
  const semVend = lista.filter((c: any) => !c.atendenteId).length;
  const d = parseData(dia + "T12:00");
  const titulo = (dia === hojeISO() ? "Hoje · " : dia === maisDias(hojeISO(), 1) ? "Amanhã · " : "") + DIAS[d.getDay()] + ", " + fmtDate(dia);
  const Tab = ({ k, l }: { k: Aba; l: string }) => <button className={aba === k ? "on" : ""} onClick={() => { setAba(k); setNovo(false); }}>{l} <b>{de(k).length}</b>{pend(k) ? <i>{pend(k)}</i> : null}</button>;
  return (
    <section className={"view active pres" + (movel ? " pres-movel" : "")}>
      {!movel && <div className="view-head"><div><h2>✅ Confirmação de presença</h2><p>Quem vem à loja no dia: confirme a vinda, defina ou troque o vendedor, inicie o atendimento e veja as fotos. O cliente que entra direto na loja (porta) é registrado aqui, com o vendedor que atendeu.</p></div>{!novo && <button className="btn primary pres-mais" onClick={abrirNovo}>＋ Novo cliente</button>}</div>}
      {movel && !novo && <button className="pres-fab" onClick={abrirNovo} title="Novo cliente porta">＋ Novo cliente</button>}
      <div className="ag-nav">
        <button className="btn sm" onClick={() => setDia(maisDias(dia, -1))}>‹</button>
        <input type="date" value={dia} onChange={e => setDia(e.target.value || dia)} style={{ maxWidth: 170 }} />
        <button className="btn sm" onClick={() => setDia(maisDias(dia, 1))}>›</button>
        {dia !== hojeISO() && <button className="btn ghost sm" onClick={() => setDia(hojeISO())}>Hoje</button>}
        <b className="pres-tit">{titulo}</b>
      </div>
      <div className="subnav pres-abas"><Tab k="todos" l="🏬 Todos (loja)" /><Tab k="marketing" l="📣 Marketing" /><Tab k="externo" l="🧭 Externo" /><Tab k="porta" l="🚪 Porta" /></div>
      {aba === "porta" && <div className="pres-porta-top">
        {novo ? <NovoPorta fechar={() => setNovo(false)} /> : <button className="btn primary" onClick={abrirNovo}>＋ Registrar cliente porta</button>}
        <div className="pres-dica">Cliente porta é quem entrou direto na loja, sem vir do marketing nem do consultor externo. Não entra nos números do marketing nem dos consultores: aparece só na agenda da loja, para o vendedor que atendeu e para a Gestão.</div>
      </div>}
      <div className="pres-resumo">{lista.length} cliente{lista.length === 1 ? "" : "s"}{aba !== "porta" ? <> · <b>{lista.filter((c: any) => origem(c) !== "porta" && vindaConfirmada(c)).length}</b> com vinda confirmada</> : null}{semVend ? <> · <b style={{ color: "var(--warn)" }}>{semVend} sem vendedor</b></> : null}</div>
      {!lista.length ? <div className="empty" style={{ padding: "24px 10px" }}>{aba === "porta" ? "Nenhum cliente porta registrado neste dia." : "Nenhum cliente " + (aba === "todos" ? "" : aba === "marketing" ? "do marketing" : "de consultor externo") + " marcado na loja neste dia."}</div>
        : <div className="pres-lista">{lista.map((c: any) => <Cartao key={c.id} c={c} porta={origem(c) === "porta"} tag={aba === "todos" ? ({ marketing: "📣 Marketing", externo: "🧭 Externo", porta: "🚪 Porta" } as any)[origem(c) || ""] || "🏬 Loja" : ""} />)}</div>}
    </section>
  );
}

function Cartao({ c, porta, tag }: { c: any; porta: boolean; tag?: string }) {
  const { R, abrirDetalhe, executar: ex, toast } = useApp() as any;
  const [vend, setVend] = useState("");
  const fotos = (c.anexos || []).filter((a: any) => a.tipo === "img");
  const podeDefinir = !c.atendenteId && !c.venda;
  const podeTrocar = !!c.atendenteId && !c.venda;
  const sc = R.statusClienteDe(c);
  const salvarVend = async () => {
    if (!vend) { toast("Selecione o vendedor"); return; }
    const d = confirmarDisp(R, vend, c.dataLoja, c); if (!d.ok) return;
    const ok = podeTrocar ? await ex(() => A.trocarVendedor(c.id, vend), "Vendedor alterado") : await ex(() => A.designarProjetista(c.id, vend), "Vendedor definido");
    if (ok) { registrarIndisp(c.id, vend, d.motivo); setVend(""); }
  };
  return (
    <div className={"pres-card" + (porta ? " porta" : vindaConfirmada(c) ? " ok" : "")}>
      <div className="pres-hora">{hora(c.dataLoja)}</div>
      <div className="pres-corpo">
        <div className="pres-nome">{tag ? <span className="pill">{tag}</span> : null} <b>{c.cliente}</b> {!porta && <SeloVinda c={c} />} {c.venda && <span className="marca-loja ok">💰 venda {c.venda.numero}</span>}
          {!porta && sc && STATUS_CLIENTE[sc] && <span className="pill">{STATUS_CLIENTE[sc]}</span>}</div>
        <div className="pres-info">
          {c.telefone ? <span>📞 {c.telefone}</span> : null}
          {c.consultorId ? <span>🧭 consultor <b>{R.nomeUser(c.consultorId)}</b></span> : null}
          <span>{c.atendenteId ? <>🧑‍💼 vendedor <b>{R.nomeUser(c.atendenteId)}</b></> : <b style={{ color: "var(--warn)" }}>sem vendedor</b>}</span>
          {porta && c.produto ? <span>🏠 {c.produto}</span> : null}
          {porta ? <span>registrado por {c.solicitante}</span> : null}
          {c.tratativa && c.tratativa.querProjeto === "sim" ? <span className="marca-loja sim">📐 Quer projeto</span> : null}
        </div>
        {fotos.length > 0 && <div className="pres-fotos" onClick={() => abrirDetalhe(c.id)} title="Abrir a ficha para ver as fotos">{fotos.slice(0, 4).map((a: any) => <img key={a.id} src={a.url} alt="" loading="lazy" />)}{fotos.length > 4 && <span>+{fotos.length - 4}</span>}</div>}
        {!fotos.length && !porta && <div className="pres-semfoto">⚠️ Sem foto/planta anexada</div>}
        {R.atendendoAgora(c) ? <div className="pres-ematd">🟢 Em atendimento desde {new Date(c.tratativa.emAtendimento).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
          : porta && R.podeIniciarAtend(c) && String(c.dataLoja).slice(0, 10) === hojeISO() ? <button className="btn pres-iniciar" onClick={() => { if (confirm("Iniciar o atendimento de " + c.cliente + " com " + R.nomeUser(c.atendenteId) + "?")) ex(() => A.iniciarAtendimento(c.id), "Atendimento iniciado"); }}>▶️ Iniciar atendimento</button> : null}
        {!porta && <EsteveNaLoja c={c} />}
        {!porta && <ConfirmarVinda c={c} />}
        {(podeDefinir || podeTrocar) && R.podeEditarAgenda() && <div className="pres-vend">
          <SelVendedor value={vend} onChange={setVend} quando={c.dataLoja} c={c} placeholder={podeTrocar ? "Trocar o vendedor…" : "Definir o vendedor…"} />
          <button className="btn sm" disabled={!vend} onClick={salvarVend}>{podeTrocar ? "Trocar" : "Definir"}</button>
        </div>}
      </div>
      <div className="pres-acoes">
        <button className="btn sm primary" onClick={() => abrirDetalhe(c.id)}>Abrir ficha</button>
        {c.telefone && separarTelefones(c.telefone).map(t => <BotaoWhats key={t} tel={t} rotulo={separarTelefones(c.telefone).length > 1 ? "WhatsApp " + t : "WhatsApp"} />)}
      </div>
    </div>
  );
}

export const AMBIENTES = ["Cozinha", "Dormitório casal", "Dormitório solteiro", "Quarto infantil", "Closet", "Sala / Home", "Banheiro", "Área de serviço", "Escritório", "Área gourmet", "Estofados", "Outro"];
function NovoPorta({ fechar }: { fechar: () => void }) {
  const { R, executar: ex, toast } = useApp() as any;
  const [f, setF] = useState({ cliente: "", telefone: "", vendedorId: "", obs: "" });
  const [amb, setAmb] = useState<string[]>([]); const [outro, setOutro] = useState("");
  const s = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const alt = (a: string) => setAmb(amb.includes(a) ? amb.filter(x => x !== a) : [...amb, a]);
  const salvar = async () => {
    const ambientes = amb.map(a => a === "Outro" ? (outro.trim() || "Outro") : a);
    if (!f.cliente.trim()) { toast("Informe o nome do cliente"); return; }
    if (f.telefone.replace(/\D/g, "").length < 10) { toast("Informe o telefone do cliente com DDD"); return; }
    if (!ambientes.length) { toast("Marque os ambientes que o cliente quer"); return; }
    if (!f.vendedorId) { toast("Escolha o vendedor que vai atender"); return; }
    if (!confirm(`Registrar ${f.cliente.trim()} como cliente porta, atendido por ${R.nomeUser(f.vendedorId)}?`)) return;
    if (await ex(() => A.registrarPorta({ ...f, ambientes }), "Cliente porta registrado — já em atendimento com " + R.nomeUser(f.vendedorId))) fechar();
  };
  return (
    <div className="pres-novo">
      <h4>🚪 Novo cliente porta <small>— entrou direto na loja</small></h4>
      <div className="pres-novo-grid">
        <div className="field"><label>1. Nome do cliente *</label><input value={f.cliente} onChange={s("cliente")} placeholder="Ex.: Charles Silva" autoFocus /></div>
        <div className="field"><label>2. Telefone (com DDD) *</label><input value={f.telefone} onChange={s("telefone")} inputMode="tel" placeholder="41 99999-9999" /></div>
      </div>
      <div className="field"><label>3. Ambientes que o cliente quer *</label>
        <div className="pres-amb">{AMBIENTES.map(a => <button key={a} type="button" className={"chip" + (amb.includes(a) ? " on" : "")} onClick={() => alt(a)}>{amb.includes(a) ? "✓ " : ""}{a}</button>)}</div>
        {amb.includes("Outro") && <input style={{ marginTop: 6 }} value={outro} onChange={e => setOutro(e.target.value)} placeholder="Qual ambiente?" />}</div>
      <div className="field"><label>4. Vendedor que vai atender *</label><SelVendedor value={f.vendedorId} onChange={v => setF({ ...f, vendedorId: v })} quando={null} /></div>
      <div className="field"><label>Observação (opcional)</label><input value={f.obs} onChange={s("obs")} placeholder="Ex.: veio pela vitrine, já tem a planta" /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button className="btn primary" onClick={salvar}>✓ Registrar e iniciar atendimento</button><button className="btn ghost" onClick={fechar}>Cancelar</button></div>
    </div>
  );
}

/** confirmação visual de que o cliente ESTEVE na loja hoje: um toque — chegou (inicia o atendimento) ou não veio */
function EsteveNaLoja({ c }: { c: any }) {
  const { R, executar: ex, toast } = useApp() as any;
  const hoje = hojeISO(); const dia = String(c.dataLoja || "").slice(0, 10);
  if (!dia || dia > hoje || c.venda) return null;
  const sc = R.statusClienteDe(c); const t = c.tratativa || {};
  if (t.emAtendimento || R.compareceu(c)) return <div className="pres-esteve ok">✅ <b>ESTEVE NA LOJA</b>{t.emAtendimento ? <small> · atendimento desde {new Date(t.emAtendimento).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small> : null}</div>;
  if (sc === "nao_compareceu") return <div className="pres-esteve nao">❌ <b>NÃO VEIO</b> <button className="btn ghost sm" onClick={() => ex(() => A.marcarComparecimento(c.id, "voltou"), "Reaberto — cliente veio")}>Veio afinal</button></div>;
  const chegou = async () => {
    if (!c.atendenteId) { toast("Defina o vendedor primeiro (logo abaixo) e toque de novo em “Chegou”"); return; }
    if (R.podeIniciarAtend(c)) await ex(() => A.iniciarAtendimento(c.id), "✅ Cliente na loja — atendimento iniciado com " + R.nomeUser(c.atendenteId));
    else if (c.setorDestino === "atendente_cliente") await ex(() => A.marcarComparecimento(c.id, "chegou"), "✅ Cliente na loja");
    else toast("Não foi possível marcar — abra a ficha do cliente");
  };
  const naoVeio = () => {
    if (c.setorDestino !== "atendente_cliente") { toast("Abra a ficha para marcar que o cliente não veio"); return; }
    if (confirm(c.cliente + " não veio à loja?")) ex(() => A.marcarComparecimento(c.id, "nao_compareceu"), "Marcado: não veio");
  };
  return <div className="pres-esteve">
    <button className="pres-chegou" onClick={chegou}>✅ CHEGOU NA LOJA</button>
    {dia <= hoje && <button className="pres-naoveio" onClick={naoVeio}>✖ Não veio</button>}
  </div>;
}
