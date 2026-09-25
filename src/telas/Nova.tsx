import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { A, ACEITA_ANEXO, enviarArquivos, enviarFotos, prepararArquivos } from "../lib/acoes";
import { fmtDateTime, inicial, mesmaPessoa, soDigitos } from "../lib/regras";
import { EditFab } from "./Cadastros";

const VAZIO = { pvOrigem: "cliente", pvPeca: "", tipo: "", cliente: "", clienteDoc: "", telefone: "", pedido: "", dataVenda: "", pedidoFabrica: "", produto: "", fabrica: "", prazoTatico: "", slaManual: "", motivo: "", email: "", consultorId: "", dataVisita: "", endereco: "" };
type NovoAnexo = { tipo: "img" | "link" | "video" | "pdf"; nome: string; url: string; blob?: Blob };

export default function Nova({ escopo }: { escopo: "cc" | "mkt" | "pv" }) {
  const { R, st, toast, recarregar, irPara, abrirDetalhe, setModal, preset } = useApp() as any;
  // "+ Nova solicitação" na ficha: já vem com os dados do cliente e fica ligada ao atendimento de origem
  const pre = preset && preset.prefill ? preset.prefill : null;
  const inicialF = () => ({ ...VAZIO, tipo: escopo === "pv" ? "posvenda" : "", ...(pre ? { cliente: pre.cliente || "", clienteDoc: pre.clienteDoc || "", telefone: pre.telefone || "", pedido: pre.pedido || "", dataVenda: pre.dataVenda ? String(pre.dataVenda).slice(0, 10) : "", produto: pre.produto || "" } : {}) });
  const [origem, setOrigem] = useState<string | null>(pre ? pre.vinculadoA || null : null);
  const [f, setF] = useState<any>(inicialF);
  const [anexos, setAnexos] = useState<NovoAnexo[]>([]);
  const [link, setLink] = useState("");
  const [dups, setDups] = useState<any[]>([]);
  const [enviando, setEnviando] = useState(false);
  const tDup = useRef<any>();
  const set = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));

  const tipos = Object.entries(R.TIPOS).filter(([k, t]: any) => R.podeCriarTipo(k) && (escopo === "pv" ? k === "posvenda" : escopo === "mkt" ? !!t.presale : !t.presale)).sort((a: any, b: any) => 0);
  const t = f.tipo ? R.TIPOS[f.tipo] : null;
  const ehMkt = t ? !!t.presale : escopo === "mkt";
  const presale = !!(t && t.presale), direto = !!(t && t.direto);
  // rápido = previsão do frete / montagem já agendada: registra e encerra na mesma ligação, sem produto/CPF/venda
  const rapido = !!(t && t.rapido);
  const podeFinalizarJa = !!t && !presale && (rapido || R.destinoDe(f.tipo) === "callcenter");
  const souCC = R.mySetores().includes("callcenter");
  const [resposta, setResposta] = useState("");
  const [acionar, setAcionar] = useState(false);
  const [motivoSup, setMotivoSup] = useState("");
  const modo = useRef<"aberto" | "finalizar">("aberto");
  const dest = f.tipo ? R.destinoDe(f.tipo) : null;
  const u = R.me()!;

  // detecção de cliente já registrado — marketing e call center nunca se misturam
  const buscaDuplicados = () => {
    if (!f.tipo) return [];
    const presaleAgora = presale;
    const dados = { clienteDoc: f.clienteDoc, telefone: f.telefone, pedido: f.pedido, cliente: f.cliente };
    if (!soDigitos(dados.clienteDoc) && !soDigitos(dados.telefone) && !dados.pedido.trim() && (dados.cliente || "").trim().length <= 5) return [];
    return st.chamados.map(c => {
      if (R.domMarketing(c) !== presaleAgora) return null;
      if (!R.podeVer(c)) return null;
      const por = mesmaPessoa(c, dados);
      return por ? { c, por } : null;
    }).filter(Boolean).sort((a: any, b: any) => +new Date(b.c.criadoEm) - +new Date(a.c.criadoEm)).slice(0, 6);
  };
  useEffect(() => { clearTimeout(tDup.current); tDup.current = setTimeout(() => setDups(buscaDuplicados()), 350); }, [f.cliente, f.clienteDoc, f.telefone, f.pedido, f.tipo]);

  const [preparando, setPreparando] = useState("");
  async function addFotos(files: FileList | null) {
    if (!files || !files.length) return;
    setPreparando("Preparando…");
    try {
      const { fotos, outros, recusados } = await prepararArquivos(Array.from(files), t => setPreparando(t));
      if (recusados.length) toast("Não anexado: " + recusados.join(", "));
      const novos: NovoAnexo[] = [...fotos.map(x => ({ tipo: "img" as const, nome: x.nome, url: URL.createObjectURL(x.blob), blob: x.blob })),
        ...outros.map(x => ({ tipo: x.tipo, nome: x.nome, url: URL.createObjectURL(x.blob), blob: x.blob }))];
      setAnexos(a => [...a, ...novos]);
    } finally { setPreparando(""); }
  }
  const ehPv = f.tipo === "posvenda";
  function limpar() { setF({ ...VAZIO, tipo: escopo === "pv" ? "posvenda" : "" }); setOrigem(null); setAnexos([]); setLink(""); setDups([]); }
  const ehFab = f.tipo === "prazo_fabrica";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.tipo) { toast("Escolha o motivo do contato"); return; }
    if (!R.podeCriarTipo(f.tipo)) { toast("Você não tem permissão para abrir este motivo"); return; }
    const finalizar = modo.current === "finalizar" && podeFinalizarJa;
    if (finalizar && resposta.trim().length < 3) { toast("Escreva o que foi informado ao cliente"); return; }
    if (acionar && !finalizar && (motivoSup.trim() || f.motivo || "").trim().length < 5) { toast("Escreva por que a supervisão precisa acompanhar"); return; }
    if (String(f.telefone || "").replace(/\D/g, "").length < 10) { toast("Informe o telefone do cliente com DDD"); (document.querySelector('input[name="telefone"]') as HTMLInputElement | null)?.focus(); return; }
    setEnviando(true);
    try {
      const vinc = origem || (dups.length ? dups[0].c.id : null);
      const base = ehMkt ? { ...f, ...(R.ehGestao() || R.temMarketing() ? {} : { consultorId: "" }), clienteDoc: "", pedido: "", dataVenda: "", pedidoFabrica: "", fabrica: "", prazoTatico: "", slaManual: "" } : f;
      const id = await A.criarChamado({ ...base, fabrica: ehMkt ? "" : ehFab || ehPv ? f.fabrica : "", pedidoFabrica: ehFab ? f.pedidoFabrica : "", prazoTatico: ehFab || f.tipo === "entrega" ? f.prazoTatico : "", vinculadoA: vinc,
        ...(!ehMkt && finalizar ? { finalizar: true, resposta: resposta.trim() } : {}),
        ...(!ehMkt && acionar && !finalizar ? { acionarSupervisao: true, motivoSupervisao: motivoSup.trim() } : {}) });
      if (ehPv) await A.posvendaRelato(id, f.pvOrigem, f.pvPeca).catch(() => null);
      const fotos = anexos.filter(a => a.tipo === "img");
      const itens = fotos.length ? await enviarFotos(id, fotos.map(a => ({ nome: a.nome, blob: a.blob! }))) : [];
      const outros = anexos.filter(a => a.tipo === "video" || a.tipo === "pdf");
      if (outros.length) itens.push(...await enviarArquivos(id, outros.map(a => ({ nome: a.nome, blob: a.blob!, tipo: a.tipo as "video" | "pdf" }))));
      anexos.filter(a => a.tipo === "link").forEach(a => itens.push({ tipo: "link", url: a.url }));
      if (itens.length) await A.adicionarAnexos(id, itens, false);
      limpar();
      await recarregar();
      toast(finalizar ? "Atendimento " + id + " registrado e finalizado" : acionar ? "Solicitação " + id + " aberta — supervisão avisada" : "Solicitação " + id + " aberta");
      setResposta(""); setAcionar(false); setMotivoSup(""); modo.current = "aberto";
      const menu = R.menuPerfil().flatMap((g: any) => g.itens.map((i: string[]) => i[0]));
      irPara(menu.includes("fila") && !presale ? "fila" : menu.includes("acompmkt") && presale ? "acompmkt" : "dashboard");
      if (escopo === "pv") abrirDetalhe(id);
    } catch (err: any) { toast(err.message || "Não foi possível abrir"); }
    finally { setEnviando(false); }
  }

  return (
    <section className="view active" id="view-nova">
      <div className="view-head"><div>
        <h2 id="novaTitulo">{escopo === "pv" ? "Novo atendimento de pós-venda" : ehMkt ? "Novo cliente" : "Nova solicitação"}</h2>
        <p id="novaSub">{escopo === "pv" ? "Registre o cliente e o relato do problema como foi contado. A análise (responsabilidade, custo) você completa depois, na ficha." : ehMkt ? "Cadastro de cliente do marketing. Não se mistura com as solicitações do call center." : "Escolha o motivo do contato — ele define para qual setor a tratativa é encaminhada."}</p>
      </div></div>
      {origem && <div className="ro-note" style={{ marginBottom: 14 }}>Nova solicitação para <b>{f.cliente}</b>, ligada ao atendimento <a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(origem); }}>{origem}</a> — o histórico do cliente continua junto. Escolha o motivo do novo assunto. <a href="#" onClick={e => { e.preventDefault(); setOrigem(null); }}>Desligar</a></div>}
      {dups.length > 0 && !origem && (
        <div id="alertaDuplicado"><div className="dup">
          <div className="tit">⚠ {presale ? "Este cliente já está cadastrado" : "Este cliente já tem solicitação registrada"}</div>
          <div className="sub">Encontrei {dups.length} registro(s) {presale ? "deste cliente no marketing" : "deste cliente no call center"}. Veja antes de abrir outro — evite duplicar o atendimento.</div>
          {dups.map(({ c, por }: any) => {
            const aberto = c.status !== "concluida";
            return (
              <div className="dup item" key={c.id}>
                <div><div className="nm">{c.id} · {R.tipoNome(c.tipo)} <span className="pill" style={{ marginLeft: 6 }}>{aberto ? "em aberto" : "concluída"}</span></div>
                  <div className="mt">{c.cliente} · encontrado por <b>{por}</b> · {c.setorDestino ? R.setorNome(c.setorDestino) : "—"} · aberto em {fmtDateTime(c.criadoEm)}{c.solicitante ? " por " + c.solicitante : ""}</div></div>
                <div className="bt">
                  <button type="button" className="btn ghost sm" onClick={() => abrirDetalhe(c.id)}>Abrir</button>
                  {aberto && <button type="button" className="btn sm" onClick={() => { abrirDetalhe(c.id, "nota"); toast("Registre o novo contato na anotação interna"); }}>Complementar esta</button>}
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10 }}>Se o assunto for <b>diferente</b>, siga preenchendo: a nova {presale ? "ficha" : "solicitação"} será criada e ficará <b>vinculada</b> a este cliente no histórico.</div>
        </div></div>
      )}
      <div className="card"><form className="req" id="formReq" autoComplete="off" onSubmit={enviar} onReset={e => { e.preventDefault(); limpar(); }}>
        <div className="sec-label">Motivo do contato</div>
        <div className="grid">
          <div className="field full"><label>Motivo <span className="req-star">*</span></label>
            <select name="tipo" id="selTipoForm" required value={f.tipo} onChange={set("tipo")}>
              <option value="">Selecione o motivo…</option>
              {tipos.map(([k, tt]: any) => <option key={k} value={k}>{tt.nome}</option>)}
            </select>
            <div className="rota" id="rotaAviso">{dest ? <>Será encaminhada para: <b>{R.setorNome(dest)}</b></> : null}</div>
          </div>
        </div>
        <div className="sec-label">Quem está solicitando</div>
        <div className="loginfo" id="loginfo"><div className="av">{inicial(u.nome)}</div><div className="who"><b>{u.nome}</b><span>{(u.setores || []).length ? u.setores.map(id => <span key={id} className="perfil-tag">{R.setorNome(id)}</span>).reduce((a: any, b: any) => [a, " ", b] as any) : <span className="perfil-tag">sem setor</span>}</span></div><div className="tag">preenchido pelo seu login</div></div>
        <div className="sec-label">{ehMkt ? "Dados do cliente (lead)" : "Cliente e venda"}</div>
        <div className="grid">
          <div className="field"><label>Nome do cliente <span className="req-star">*</span></label><input name="cliente" required placeholder="Nome completo" value={f.cliente} onChange={set("cliente")} /></div>
          {!ehMkt && <div className="field" id="fieldClienteDoc"><label>CPF / CNPJ do cliente {rapido ? <span className="hint">(opcional)</span> : <span className="req-star">*</span>}</label><input name="clienteDoc" required={!rapido} placeholder="000.000.000-00" value={f.clienteDoc} onChange={set("clienteDoc")} /></div>}
          <div className="field"><label>Telefone / contato <span className="req-star">*</span></label><input name="telefone" placeholder="(00) 00000-0000" value={f.telefone} onChange={set("telefone")} /></div>
          {!ehMkt && <div className="field" id="fieldPedido"><label>Nº venda {rapido ? <span className="hint">(opcional)</span> : <span className="req-star">*</span>}</label><input name="pedido" required={!rapido} placeholder="Ex.: 48213" value={f.pedido} onChange={set("pedido")} /></div>}
          {!ehMkt && <div className="field" id="fieldDataVenda"><label>Data da venda</label><input name="dataVenda" type="date" value={f.dataVenda} onChange={set("dataVenda")} /></div>}
          {ehFab && <div className="field" id="fieldPedidoFabrica"><label>Nº do nosso pedido na fábrica <span className="hint">(opcional)</span></label><input name="pedidoFabrica" placeholder="Se souber" value={f.pedidoFabrica} onChange={set("pedidoFabrica")} /></div>}
        </div>
        {!ehMkt && !rapido && <div className="sec-label" id="secProdutoFabrica">{ehFab ? "Produto e fábrica" : "Produto"}</div>}
        <div className="grid">
          {!rapido && <div className="field full"><label id="lblProduto">{ehMkt ? "Ambiente de interesse " : "Produto "}<span className="req-star">*</span></label>
            <input name="produto" required placeholder={ehMkt ? "Ex.: Cozinha planejada (projeto de interesse)" : "Ex.: Guarda-roupa 6 portas Verona — Nogueira"} value={f.produto} onChange={set("produto")} /></div>}
          {(ehFab || ehPv) && <div className="field" id="fieldFabrica"><label>Fábrica / fornecedor {ehFab ? <span className="req-star">*</span> : <span className="hint">(se souber)</span>}</label>
            <select name="fabrica" required={ehFab} value={f.fabrica} onChange={set("fabrica")}><option value="">Selecione…</option>{st.fabricas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
            {R.temCadastros() ? <button type="button" className="btn ghost sm" style={{ marginTop: 6, alignSelf: "flex-start" }} onClick={() => setModal(<EditFab id={null} />)}>+ Cadastrar fábrica que não está na lista</button>
              : <span className="hint" style={{ marginTop: 4 }}>Fábrica não está na lista? Peça à Supervisão para cadastrar.</span>}</div>}
          {(ehFab || f.tipo === "entrega") && <div className="field" id="fieldPrazoTatico"><label>Prazo de entrega no Tático <span className="hint">(prazo original)</span></label><input name="prazoTatico" type="date" value={f.prazoTatico} onChange={set("prazoTatico")} /></div>}
          {!ehMkt && !rapido && <div className="field"><label>Prazo para responder <span className="hint">(vazio = 2 dias úteis)</span></label><input name="slaManual" type="date" value={f.slaManual} onChange={set("slaManual")} /></div>}
          {ehPv && <div className="field"><label>Quem acionou <span className="req-star">*</span></label><select value={f.pvOrigem} onChange={set("pvOrigem")}><option value="cliente">Cliente reclamou</option><option value="montador">Montador pediu suporte na obra</option></select></div>}
          {ehPv && <div className="field"><label>Ambiente / peça afetada</label><input placeholder="Ex.: Cozinha — porta do aéreo" value={f.pvPeca} onChange={set("pvPeca")} /></div>}
          <div className="field full"><label>{ehPv ? "Relato do problema" : ehMkt ? "Observações do lead" : "Detalhe do atendimento"} <span className="req-star">*</span></label><textarea name="motivo" required placeholder={ehPv ? "Como o cliente/montador contou: o que aconteceu, quando, o que está afetado." : ehMkt ? "O que o cliente procura, melhor horário para contato, observações para o consultor." : "O que o cliente precisa / relatou."} value={f.motivo} onChange={set("motivo")}></textarea></div>
        </div>
        {ehMkt && (
          <div id="blocoVisita">
            <div className="sec-label" id="secBlocoVisita">Dados do agendamento <span className="hint" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}> (o que faltar, a Supervisão Marketing completa depois)</span></div>
            <div className="grid">
              <div className="field"><label>E-mail do cliente</label><input name="email" placeholder="cliente@exemplo.com" value={f.email} onChange={set("email")} /></div>
              {!direto && (R.ehGestao() || R.temMarketing()) && <div className="field" id="fieldConsultor"><label>Consultor designado <span className="hint">(se já souber)</span></label>
                <select name="consultorId" value={f.consultorId} onChange={set("consultorId")}><option value="">Selecione…</option>{R.consultores().map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>}
              <div className="field"><label id="lblDataAgendamento">{direto ? <>Data/horário na loja <span className="hint">(cliente já vem direto)</span></> : <>Data/horário da visita <span className="hint">(se já souber)</span></>}</label>
                <input name="dataVisita" type="datetime-local" value={f.dataVisita} onChange={set("dataVisita")} /></div>
              {!direto && <div className="field full" id="fieldEndereco"><label>Endereço da visita</label><input name="endereco" placeholder="Rua, número, bairro, cidade" value={f.endereco} onChange={set("endereco")} /></div>}
            </div>
          </div>
        )}
        {t && t.anexos && (
          <div id="blocoAnexos">
            <div className="sec-label">Comprovações do cliente <span className="hint" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}> (fotos, vídeos e plantas em PDF)</span></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label className="btn sm" style={{ cursor: preparando ? "wait" : "pointer" }}>{preparando || "Anexar foto, vídeo ou PDF"}<input type="file" accept={ACEITA_ANEXO} disabled={!!preparando} multiple style={{ display: "none" }} onChange={e => { addFotos(e.target.files); e.target.value = ""; }} /></label>
              <input id="linkAnexo" placeholder="Colar link de vídeo (WhatsApp, Drive, YouTube…)" style={{ flex: 1, minWidth: 200 }} value={link} onChange={e => setLink(e.target.value)} />
              <button type="button" className="btn sm" onClick={() => { const v = link.trim(); if (!v) return; setAnexos(a => [...a, { tipo: "link", nome: v, url: v }]); setLink(""); }}>Adicionar link</button>
            </div>
            <div className="thumbs" id="thumbsNovo">
              {anexos.map((a, i) => (
                <div className="thumb-wrap" key={i}>
                  {a.tipo === "img" ? <img className="thumb" src={a.url} /> : <a className="att-link" href={a.url} target="_blank" rel="noopener" title={a.nome}>{a.tipo === "pdf" ? "📄 " + a.nome.slice(0, 20) : a.tipo === "video" ? "🎬 " + a.nome.slice(0, 20) : "🔗 link"}</a>}
                  <button type="button" className="rm" onClick={() => setAnexos(x => x.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {podeFinalizarJa && <>
          <div className="sec-label">Resolvido na ligação?</div>
          <div className="grid"><div className="field full"><label>O que foi informado ao cliente {rapido ? <span className="req-star">*</span> : <span className="hint">(para registrar e finalizar agora)</span>}</label>
            <textarea value={resposta} onChange={e => setResposta(e.target.value)} placeholder={f.tipo === "previsao_frete" ? "Ex.: Frete chega amanhã (26/09) entre 13h e 17h — confirmado com o freteiro" : f.tipo === "horario_montagem" ? "Ex.: Montador João confirmado para 27/09 às 8h" : "Resposta/solução passada ao cliente"} /></div></div>
        </>}
        {!ehMkt && souCC && <div className="acomp-cad">
          <label><input type="checkbox" checked={acionar} onChange={e => setAcionar(e.target.checked)} /> <b>🚨 Acionar supervisão</b> — avisa a supervisão no celular na hora. O atendimento continua sendo seu.</label>
          {acionar && <input placeholder="Por que a supervisão precisa acompanhar? (se vazio, usa o detalhe do atendimento)" value={motivoSup} onChange={e => setMotivoSup(e.target.value)} />}
        </div>}
        <div className="form-foot">
          {podeFinalizarJa && !acionar && <button type="submit" className="btn primary" disabled={enviando || !!preparando} onClick={() => { modo.current = "finalizar"; }}>{enviando ? "Registrando…" : "✓ Registrar e finalizar"}</button>}
          <button type="submit" className={"btn " + (podeFinalizarJa && !acionar ? "" : "primary")} disabled={enviando || !!preparando} onClick={() => { modo.current = "aberto"; }}>{enviando ? "Abrindo…" : ehPv ? "Abrir atendimento de pós-venda" : ehMkt ? "Cadastrar cliente" : podeFinalizarJa ? "Registrar em aberto" : "Abrir solicitação"}</button>
          <button type="reset" className="btn ghost">Limpar</button>
          {!ehMkt && !rapido && <span className="sla-note">Prazo automático: <b>2 dias úteis</b></span>}
        </div>
      </form></div>
    </section>
  );
}
