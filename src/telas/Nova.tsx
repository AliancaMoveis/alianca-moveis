import { useEffect, useMemo, useRef, useState } from "react";
import { BC, docValido, enderecoTxt, fmtTel } from "../lib/baseClientes";
import { useApp } from "../estado";
import { A, ACEITA_ANEXO, enviarArquivos, enviarFotos, prepararArquivos } from "../lib/acoes";
import { PV_SITUACAO, PV_TIPOS, fmtDateTime, inicial, mesmaPessoa, soDigitos } from "../lib/regras";
import { EditFab } from "./Cadastros";
import { BotaoWhats } from "../comp/Whats";
import { cfgAgenda } from "./Checklist";

const VAZIO: any = { evVendedor: "", evComprado: "", evLancado: "", rmMontador: "", rmAtendente: "", pvSituacao: "", pvProjetista: "", pvProjOutro: false, pvOrigem: "cliente", pvPeca: "", pvMontador: "", pvParado: false, pvTipo: "", tipo: "", cliente: "", clienteDoc: "", telefone: "", pedido: "", dataVenda: "", pedidoFabrica: "", produto: "", fabrica: "", prazoTatico: "", slaManual: "", motivo: "", email: "", consultorId: "", dataVisita: "", endereco: "" };
type NovoAnexo = { tipo: "img" | "link" | "video" | "pdf"; nome: string; url: string; blob?: Blob };

export default function Nova({ escopo, pvFixo }: { escopo: "cc" | "mkt" | "pv"; pvFixo?: "cliente" | "montador" }) {
  const { R, st, toast, recarregar, irPara, abrirDetalhe, setModal, preset } = useApp() as any;
  // "+ Nova solicitação" na ficha: já vem com os dados do cliente e fica ligada ao atendimento de origem
  const pre = preset && preset.prefill ? preset.prefill : null;
  const inicialF = () => ({ ...VAZIO, pvOrigem: pvFixo || "cliente", tipo: escopo === "pv" ? "posvenda" : "", ...(pre ? { cliente: pre.cliente || "", clienteDoc: pre.clienteDoc || "", telefone: pre.telefone || "", pedido: pre.pedido || "", dataVenda: pre.dataVenda ? String(pre.dataVenda).slice(0, 10) : "", produto: pre.produto || "" } : {}) });
  const [origem, setOrigem] = useState<string | null>(pre ? pre.vinculadoA || null : null);
  const [f, setF] = useState<any>(inicialF);
  const [anexos, setAnexos] = useState<NovoAnexo[]>([]);
  // prazo de fábrica: o mesmo cliente pode ter itens de várias fábricas — uma cobrança por fábrica, todas ligadas
  const [extras, setExtras] = useState<{ fabrica: string; produto: string; pedidoFabrica: string }[]>([]);
  const setEx = (i: number, k: string, v: string) => setExtras(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x));
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
  const pvMont = ehPv && f.pvOrigem === "montador";
  const projetistas: string[] = cfgAgenda(st).projetistas || [];
  // nº da venda → puxa do checklist o projetista que fez o checklist (e o nome/telefone do cliente, se ainda vazios)
  const ckDaVenda = useMemo(() => { const v = String(f.pedido || "").replace(/\D/g, ""); return v.length >= 6 ? st.chamados.find((c: any) => c.tipo === "checklist" && String(c.pedido) === v) : null; }, [f.pedido, st.chamados]);
  useEffect(() => {
    if (!ehPv || !ckDaVenda) return;
    const pj = (ckDaVenda.tratativa && ckDaVenda.tratativa.checklist && ckDaVenda.tratativa.checklist.projetista) || "";
    setF((x: any) => ({ ...x, pvProjetista: x.pvProjetista || pj, pvProjOutro: x.pvProjetista ? x.pvProjOutro : !!pj && !projetistas.includes(pj),
      cliente: x.cliente || ckDaVenda.cliente || "", telefone: x.telefone || ckDaVenda.telefone || "" }));
  }, [ckDaVenda && ckDaVenda.id, ehPv]);
  function limpar() { setF({ ...VAZIO, pvOrigem: pvFixo || "cliente", tipo: escopo === "pv" ? "posvenda" : "" }); setOrigem(null); setAnexos([]); setLink(""); setDups([]); setExtras([]); }
  const ehFab = f.tipo === "prazo_fabrica";
  // CPF/CNPJ que está na base de clientes → preenche só o cadastro (nome, telefone, endereço). Vendedor e valores não entram.
  const [baseCli, setBaseCli] = useState<any>(null);
  const docDig = soDigitos(f.clienteDoc);
  useEffect(() => {
    setBaseCli(null);
    if (ehMkt || !docValido(docDig)) return;
    let vivo = true;
    BC.porDoc(docDig).then(b => { if (!vivo || !b) return; setBaseCli(b);
      const tels = [b.telefone1, b.telefone2].filter(Boolean).map(fmtTel).join(" / ");
      setF((x: any) => ({ ...x, cliente: x.cliente.trim() ? x.cliente : b.nome, telefone: String(x.telefone || "").replace(/\D/g, "").length >= 10 ? x.telefone : tels, endereco: x.endereco || enderecoTxt(b) }));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [docDig, ehMkt]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.tipo) { toast("Escolha o motivo do contato"); return; }
    if (!R.podeCriarTipo(f.tipo)) { toast("Você não tem permissão para abrir este motivo"); return; }
    if (f.tipo === "retorno_montador" && (!f.rmMontador || !f.rmAtendente)) { toast("Selecione o montador e a atendente da montagem"); return; }
    if (ehFab && extras.length) {
      if (extras.some(x => !x.fabrica)) { toast("Escolha a fábrica de cada item incluído (ou remova a linha)"); return; }
      const fs = [f.fabrica, ...extras.map(x => x.fabrica)]; if (new Set(fs).size !== fs.length) { toast("A mesma fábrica foi escolhida duas vezes"); return; }
    }
    if (f.tipo === "erro_venda" && (!f.evVendedor || f.evComprado.trim().length < 2 || f.evLancado.trim().length < 2)) { toast("Informe o vendedor, o que o cliente comprou e o que foi lançado/enviado"); return; }
    if (pvMont && !f.pvMontador) { toast("Informe qual montador pediu suporte"); return; }
    if (pvMont && !f.pvSituacao) { toast("Informe a situação do montador na obra"); return; }
    const finalizar = modo.current === "finalizar" && podeFinalizarJa;
    if (finalizar && resposta.trim().length < 3) { toast("Escreva o que foi informado ao cliente"); return; }
    if (acionar && !finalizar && (motivoSup.trim() || f.motivo || "").trim().length < 5) { toast("Escreva por que a supervisão precisa acompanhar"); return; }
    if (!f.cliente.trim()) { toast("Informe o nome do cliente"); return; }
    if (!ehMkt && !pvMont && soDigitos(f.clienteDoc).length < 11) { toast("Informe o CPF/CNPJ do cliente"); (document.querySelector('input[name="clienteDoc"]') as HTMLInputElement | null)?.focus(); return; }
    if (!pvMont && String(f.telefone || "").replace(/\D/g, "").length < 10) { toast("Informe o telefone do cliente com DDD"); (document.querySelector('input[name="telefone"]') as HTMLInputElement | null)?.focus(); return; }
    setEnviando(true);
    try {
      const vinc = origem || (dups.length ? dups[0].c.id : null);
      const base = ehMkt ? { ...f, ...(R.ehGestao() || R.temMarketing() ? {} : { consultorId: "" }), clienteDoc: "", pedido: "", dataVenda: "", pedidoFabrica: "", fabrica: "", prazoTatico: "", slaManual: "" } : f;
      const id = await A.criarChamado({ ...base, ...(pvMont ? { produto: f.produto || "Projetados" } : {}), fabrica: ehMkt ? "" : ehFab || ehPv ? f.fabrica : "", pedidoFabrica: ehFab ? f.pedidoFabrica : "", prazoTatico: ehFab || f.tipo === "entrega" ? f.prazoTatico : "", vinculadoA: vinc,
        ...(!ehMkt && finalizar ? { finalizar: true, resposta: resposta.trim() } : {}),
        ...(!ehMkt && acionar && !finalizar ? { acionarSupervisao: true, motivoSupervisao: motivoSup.trim() } : {}) });
      if (f.tipo === "erro_venda") await A.erroVendaDefinir(id, { vendedorId: f.evVendedor, comprado: f.evComprado, lancado: f.evLancado }).catch((e: any) => toast("Solicitação aberta, mas: " + e.message));
      if (f.tipo === "retorno_montador") await A.retornoMontadorDefinir(id, { montadorId: f.rmMontador, atendenteId: f.rmAtendente }).catch((e: any) => toast("Solicitação aberta, mas: " + e.message));
      if (ehPv) await A.posvendaAbertura(id, { origem: f.pvOrigem, peca: f.pvPeca, montadorId: f.pvMontador, paradoObra: f.pvParado, categoria: pvMont ? "" : f.pvTipo, situacao: pvMont ? f.pvSituacao : "", projetista: pvMont ? f.pvProjetista : "" }).catch((e: any) => toast("Atendimento aberto, mas: " + e.message));
      const fotos = anexos.filter(a => a.tipo === "img");
      const itens = fotos.length ? await enviarFotos(id, fotos.map(a => ({ nome: a.nome, blob: a.blob! }))) : [];
      const outros = anexos.filter(a => a.tipo === "video" || a.tipo === "pdf");
      if (outros.length) itens.push(...await enviarArquivos(id, outros.map(a => ({ nome: a.nome, blob: a.blob!, tipo: a.tipo as "video" | "pdf" }))));
      anexos.filter(a => a.tipo === "link").forEach(a => itens.push({ tipo: "link", url: a.url }));
      if (itens.length) await A.adicionarAnexos(id, itens, false);
      const extrasIds: string[] = [];
      if (ehFab) for (const x of extras) {
        try { extrasIds.push(await A.criarChamado({ ...base, fabrica: x.fabrica, pedidoFabrica: x.pedidoFabrica, produto: x.produto.trim() || f.produto, prazoTatico: f.prazoTatico, vinculadoA: id })); }
        catch (e: any) { toast("Cobrança de " + (st.fabricas.find((y: any) => y.id === x.fabrica)?.nome || "fábrica") + " não abriu: " + e.message); }
      }
      limpar();
      await recarregar();
      if (extrasIds.length) { toast("Cobranças abertas: " + [id, ...extrasIds].join(", ") + " (uma por fábrica, ligadas)"); }
      else toast(finalizar ? "Atendimento " + id + " registrado e finalizado" : acionar ? "Solicitação " + id + " aberta — supervisão avisada" : "Solicitação " + id + " aberta");
      setResposta(""); setAcionar(false); setMotivoSup(""); modo.current = "aberto";
      const menu = R.menuPerfil().flatMap((g: any) => g.itens.map((i: string[]) => i[0]));
      irPara(menu.includes("fila") && !presale ? "fila" : menu.includes("acompmkt") && presale ? "acompmkt" : menu.includes("carteira") && presale ? "carteira" : "dashboard");
      if (escopo === "pv") abrirDetalhe(id);
    } catch (err: any) { toast(err.message || "Não foi possível abrir"); }
    finally { setEnviando(false); }
  }

  return (
    <section className="view active" id="view-nova">
      <div className="view-head"><div>
        <h2 id="novaTitulo">{escopo === "pv" ? (pvFixo === "montador" ? "Nova solicitação do montador" : "Nova solicitação do cliente") : ehMkt ? "Novo cliente" : "Nova solicitação"}</h2>
        <p id="novaSub">{escopo === "pv" ? (pvFixo === "montador" ? "Montador pediu suporte na obra (WhatsApp / telefone): registre o montador, a situação, o projetista do checklist e o que ele descreveu." : "Registre o cliente e o relato do problema como foi contado. A análise (responsabilidade, custo) você completa depois, na ficha.") : ehMkt ? "Cadastro de cliente do marketing. Não se mistura com as solicitações do call center." : "Escolha o motivo do contato — ele define para qual setor a tratativa é encaminhada."}</p>
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
        {ehPv && escopo === "pv" && !pvFixo && <>
          <div className="sec-label">Tipo de solicitação</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            {([["cliente", "👤 Solicitação do cliente", "Reclamação do cliente — relato como no call center"], ["montador", "🔧 Solicitação do montador", "Montador pediu suporte na obra (WhatsApp / telefone)"]] as [string, string, string][]).map(([k, l, d]) => (
              <button type="button" key={k} onClick={() => setF((x: any) => ({ ...x, pvOrigem: k }))} className="btn"
                style={{ flex: 1, minWidth: 240, textAlign: "left", padding: "12px 14px", display: "block", border: "2px solid " + (f.pvOrigem === k ? "var(--primary)" : "var(--line)"), background: f.pvOrigem === k ? "var(--primary-soft, rgba(30,90,200,.08))" : undefined }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{l}</div><div className="hint" style={{ fontWeight: 400 }}>{d}</div></button>))}
          </div>
        </>}
        <div className="sec-label">Quem está solicitando</div>
        <div className="loginfo" id="loginfo"><div className="av">{inicial(u.nome)}</div><div className="who"><b>{u.nome}</b><span>{(u.setores || []).length ? u.setores.map(id => <span key={id} className="perfil-tag">{R.setorNome(id)}</span>).reduce((a: any, b: any) => [a, " ", b] as any) : <span className="perfil-tag">sem setor</span>}</span></div><div className="tag">preenchido pelo seu login</div></div>
        <div className="sec-label">{ehMkt ? "Dados do cliente (lead)" : "Cliente e venda"}</div>
        <div className="grid">
          <div className="field"><label>Nome do cliente <span className="req-star">*</span></label><input name="cliente" required placeholder="Nome completo" value={f.cliente} onChange={set("cliente")} /></div>
          {!ehMkt && <div className="field" id="fieldClienteDoc"><label>CPF / CNPJ do cliente {pvMont ? <span className="hint">(se souber)</span> : <span className="req-star">*</span>}</label><input name="clienteDoc" required={!pvMont} placeholder="000.000.000-00" value={f.clienteDoc} onChange={set("clienteDoc")} /></div>}
          <div className="field"><label>Telefone {pvMont ? "do cliente " : "/ contato "}{pvMont ? <span className="hint">(se souber)</span> : <span className="req-star">*</span>}</label><input name="telefone" placeholder="(00) 00000-0000" value={f.telefone} onChange={set("telefone")} /></div>
          {!ehMkt && baseCli && <div className="field full"><div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--st-concluida-bg, rgba(15,138,95,.08))", border: "1px solid var(--st-concluida, #0f8a5f)", fontSize: 13.5 }}>
            📇 Cliente na base{baseCli.compras ? <> — já comprou <b>{baseCli.compras} {baseCli.compras === 1 ? "vez" : "vezes"}</b>{baseCli.ultimaCompra ? <>, última compra em <b>{new Date(baseCli.ultimaCompra).toLocaleDateString("pt-BR")}</b></> : null}</> : null}. Nome, telefone e endereço preenchidos pelo cadastro — confira com o cliente.</div></div>}
          {!ehMkt && (baseCli || f.endereco) && <div className="field full"><label>Endereço do cliente</label><input name="endereco" value={f.endereco} onChange={set("endereco")} placeholder="Rua, número, bairro, cidade" /></div>}
          {!ehMkt && <div className="field" id="fieldPedido"><label>Nº venda {rapido ? <span className="hint">(opcional)</span> : <span className="req-star">*</span>}</label><input name="pedido" required={!rapido} placeholder="Ex.: 48213" value={f.pedido} onChange={set("pedido")} /></div>}
          {!ehMkt && <div className="field" id="fieldDataVenda"><label>Data da venda</label><input name="dataVenda" type="date" value={f.dataVenda} onChange={set("dataVenda")} /></div>}
          {ehFab && <div className="field" id="fieldPedidoFabrica"><label>Nº do nosso pedido na fábrica <span className="hint">(opcional)</span></label><input name="pedidoFabrica" placeholder="Se souber" value={f.pedidoFabrica} onChange={set("pedidoFabrica")} /></div>}
        </div>
        {!ehMkt && !rapido && <div className="sec-label" id="secProdutoFabrica">{ehFab ? "Produto e fábrica" : "Produto"}</div>}
        <div className="grid">
          {!rapido && <div className="field full"><label id="lblProduto">{ehMkt ? "Ambiente de interesse " : "Produto "}{pvMont ? <span className="hint">(se souber)</span> : <span className="req-star">*</span>}</label>
            <input name="produto" required={!pvMont} placeholder={ehMkt ? "Ex.: Cozinha planejada (projeto de interesse)" : "Ex.: Guarda-roupa 6 portas Verona — Nogueira"} value={f.produto} onChange={set("produto")} /></div>}
          {(ehFab || ehPv) && <div className="field" id="fieldFabrica"><label>Fábrica / fornecedor {ehFab ? <span className="req-star">*</span> : <span className="hint">(se souber)</span>}</label>
            <select name="fabrica" required={ehFab} value={f.fabrica} onChange={set("fabrica")}><option value="">Selecione…</option>{st.fabricas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
            {R.temCadastros() ? <button type="button" className="btn ghost sm" style={{ marginTop: 6, alignSelf: "flex-start" }} onClick={() => setModal(<EditFab id={null} />)}>+ Cadastrar fábrica que não está na lista</button>
              : <span className="hint" style={{ marginTop: 4 }}>Fábrica não está na lista? Peça à Supervisão para cadastrar.</span>}</div>}
          {ehFab && <div className="field full">
            {extras.map((x, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) minmax(160px,1.4fr) minmax(120px,.8fr) auto", gap: 8, alignItems: "end", padding: "10px 12px", border: "1px dashed var(--line)", borderRadius: 9, marginBottom: 8 }}>
              <div className="field"><label>Fábrica {i + 2} <span className="req-star">*</span></label><select value={x.fabrica} onChange={e => setEx(i, "fabrica", e.target.value)}><option value="">Selecione…</option>{st.fabricas.map(y => <option key={y.id} value={y.id}>{y.nome}</option>)}</select></div>
              <div className="field"><label>Produto desta fábrica</label><input value={x.produto} onChange={e => setEx(i, "produto", e.target.value)} placeholder="Vazio = mesmo produto acima" /></div>
              <div className="field"><label>Nº pedido na fábrica</label><input value={x.pedidoFabrica} onChange={e => setEx(i, "pedidoFabrica", e.target.value)} placeholder="Se souber" /></div>
              <button type="button" className="btn ghost sm" onClick={() => setExtras(l => l.filter((_, j) => j !== i))}>Remover</button>
            </div>)}
            <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setExtras(l => [...l, { fabrica: "", produto: "", pedidoFabrica: "" }])}>+ Incluir mais fábricas</button>
            {extras.length > 0 && <span className="hint" style={{ marginTop: 4 }}>Abre uma cobrança para cada fábrica (cada uma com sua resposta e previsão), todas ligadas ao mesmo cliente. Os anexos ficam na primeira.</span>}
          </div>}
          {(ehFab || f.tipo === "entrega") && <div className="field" id="fieldPrazoTatico"><label>Prazo de entrega no Tático <span className="hint">(prazo original)</span></label><input name="prazoTatico" type="date" value={f.prazoTatico} onChange={set("prazoTatico")} /></div>}
          {!ehMkt && !rapido && <div className="field"><label>Prazo para responder <span className="hint">(vazio = 2 dias úteis)</span></label><input name="slaManual" type="date" value={f.slaManual} onChange={set("slaManual")} /></div>}
          {f.tipo === "erro_venda" && <div className="field full"><label>Vendedor que fez a venda <span className="req-star">*</span> <span className="hint">(ele recebe no app para tratar)</span></label>
            <select value={f.evVendedor} onChange={set("evVendedor")}><option value="">Selecione…</option>{R.projetistas().map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}
          {f.tipo === "erro_venda" && <div className="field"><label>O que o cliente comprou <span className="req-star">*</span></label><textarea value={f.evComprado} onChange={set("evComprado")} placeholder="Ex.: mesa com 4 cadeiras" /></div>}
          {f.tipo === "erro_venda" && <div className="field"><label>O que foi lançado / enviado <span className="req-star">*</span></label><textarea value={f.evLancado} onChange={set("evLancado")} placeholder="Ex.: pedido saiu com 5 cadeiras" /></div>}
          {f.tipo === "desmontagem_estofado" && <div className="field full"><div className="hint">🛋 Vai para a <b>Salete</b>: ela encaminha para a Tatiana (depósito), que aciona o Valdir (estofador).</div></div>}
          {f.tipo === "retorno_montador" && <div className="field"><label>Montador <span className="req-star">*</span></label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}><select style={{ flex: 1 }} value={f.rmMontador} onChange={set("rmMontador")}><option value="">Selecione…</option>{(st.montadores || []).filter((m: any) => m.ativo).map((m: any) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
              {(() => { const m = (st.montadores || []).find((x: any) => x.id === f.rmMontador); return m ? <BotaoWhats tel={m.telefone} /> : null; })()}</div></div>}
          {f.tipo === "retorno_montador" && <div className="field"><label>Atendente da montagem <span className="req-star">*</span> <span className="hint">(fica como pendência dela)</span></label>
            <select value={f.rmAtendente} onChange={set("rmAtendente")}><option value="">Selecione…</option>{st.usuarios.filter((u: any) => u.ativo && (u.setores || []).includes("montagem")).map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}
          {pvMont && <div className="field"><label>Montador <span className="req-star">*</span></label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}><select style={{ flex: 1 }} value={f.pvMontador} onChange={set("pvMontador")}><option value="">Selecione…</option>{(st.montadores || []).filter((m: any) => m.ativo).map((m: any) => <option key={m.id} value={m.id}>{m.nome}{m.regiao ? " · " + m.regiao : ""}</option>)}</select>
              {(() => { const m = (st.montadores || []).find((x: any) => x.id === f.pvMontador); return m ? <BotaoWhats tel={m.telefone} /> : null; })()}</div>
            {!(st.montadores || []).length && <span className="hint">Peça à Gestão para cadastrar os montadores (Cadastros → Montadores).</span>}</div>}
          {pvMont && <div className="field"><label>Situação <span className="req-star">*</span></label><select value={f.pvSituacao} onChange={e => { const v = e.target.value; setF((x: any) => ({ ...x, pvSituacao: v, pvParado: v === "parado" ? true : x.pvParado })); }}><option value="">Selecione…</option>{Object.entries(PV_SITUACAO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
          {pvMont && <div className="field"><label>Projetista que fez o checklist {ckDaVenda && ckDaVenda.tratativa?.checklist?.projetista ? <span className="hint">(puxado do checklist da venda)</span> : <span className="hint">(se não puxar, escolha)</span>}</label>
            {f.pvProjOutro ? <div style={{ display: "flex", gap: 6 }}><input style={{ flex: 1 }} value={f.pvProjetista} onChange={set("pvProjetista")} placeholder="Nome do projetista" /><button type="button" className="btn ghost sm" onClick={() => setF((x: any) => ({ ...x, pvProjOutro: false, pvProjetista: "" }))}>lista</button></div>
              : <select value={f.pvProjetista} onChange={e => { const v = e.target.value; setF((x: any) => v === "__outro" ? { ...x, pvProjOutro: true, pvProjetista: "" } : { ...x, pvProjetista: v }); }}>
                <option value="">Não informado</option>{projetistas.map(n => <option key={n} value={n}>{n}</option>)}<option value="__outro">＋ Outro (digitar)</option></select>}</div>}
          {ehPv && !pvMont && <div className="field"><label>Tipo de problema <span className="hint">(se já souber)</span></label><select value={f.pvTipo} onChange={set("pvTipo")}><option value="">Definir na análise</option>{Object.entries(PV_TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
          {pvMont && <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" style={{ width: "auto" }} checked={!!f.pvParado} onChange={e => setF((x: any) => ({ ...x, pvParado: e.target.checked }))} /><span><b>🚨 Montador parado na obra</b> — avisa o Pós-venda na hora</span></label>}
          {ehPv && <div className="field"><label>Ambiente / peça afetada</label><input placeholder="Ex.: Cozinha — porta do aéreo" value={f.pvPeca} onChange={set("pvPeca")} /></div>}
          <div className="field full"><label>{pvMont ? "O que o montador descreveu" : ehPv ? "Relato do cliente" : ehMkt ? "Observações do lead" : "Detalhe do atendimento"} <span className="req-star">*</span></label><textarea name="motivo" required placeholder={pvMont ? "Como o montador contou (WhatsApp / telefone): o que encontrou na obra, o que falta ou não confere, fotos que mandou." : ehPv ? "Como o cliente contou: o que aconteceu, quando, o que está afetado." : ehMkt ? "O que o cliente procura, melhor horário para contato, observações para o consultor." : "O que o cliente precisa / relatou."} value={f.motivo} onChange={set("motivo")}></textarea></div>
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
            <div className="sec-label">{pvMont ? "Fotos e vídeos do montador" : "Comprovações do cliente"} <span className="hint" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}> (fotos, vídeos e plantas em PDF)</span></div>
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
