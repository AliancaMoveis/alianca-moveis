// Modo freteiro (celular) — SIMULAÇÃO, só no usuário do Bruno. Abre em /frete.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { linkWhats } from "../lib/regras";
import { carregarFretes, endCompleto, incluirExtra, moeda, podeFretes, resumo, rotaMaps, salvarEntrega, salvarRomaneio, SITUACAO, type Entrega, type Romaneio } from "../lib/fretes";

const AZ = "#1F3864", VD = "#1F6B3E", FUNDO = "#F4F6FA";
const card: any = { background: "#fff", border: "1px solid #DCE2EC", borderRadius: 14, padding: "12px 14px" };
const bt = (cor: string, cheio = true): any => ({ minHeight: 48, borderRadius: 12, border: cheio ? 0 : "2px solid " + cor, background: cheio ? cor : "#fff", color: cheio ? "#fff" : cor, fontSize: 16, fontWeight: 800, width: "100%", cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 });
const inp: any = { minHeight: 46, boxSizing: "border-box", fontSize: 18, fontWeight: 800, padding: "0 12px", border: "1px solid #C9D1DE", borderRadius: 10, width: "100%" };
const num = (s: string) => { const t = String(s || "").replace(/[^\d,.-]/g, ""); const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")); return isFinite(n) ? n : 0; };
const kmNum = (s: string) => { const d = String(s || "").replace(/\D/g, ""); return d ? Number(d) : null; };

export default function Freteiro() {
  const { R, toast } = useApp() as any;
  const [dados, setDados] = useState<{ rom: Romaneio[]; ent: Entrega[] } | null>(null);
  const [erro, setErro] = useState("");
  const [romId, setRomId] = useState<number | null>(null);
  const [tela, setTela] = useState<string>("lista");
  // simulação: o freteiro é o José Elias; abre primeiro o romaneio que ainda está com ele (liberado, em rota ou devolvido)
  const meus = (d: { rom: Romaneio[] }) => d.rom.filter(r => r.freteiro === "José Elias da Silva");
  const recarregar = () => carregarFretes().then(d => { setDados(d); if (romId == null) { const m = meus(d); const a = m.find(r => ["conferido", "em_rota", "devolvido"].includes(r.status)) || m[0] || d.rom[0]; if (a) setRomId(a.id); } }).catch(e => setErro(e.message));
  useEffect(() => { recarregar(); }, []);
  const sair = () => { location.href = "/"; };

  if (!podeFretes(R.currentUserId)) return <div style={{ padding: 24, fontFamily: "system-ui" }}>Modo freteiro em simulação: disponível só para o usuário do Bruno. <a href="/">Voltar</a></div>;
  if (erro) return <div style={{ padding: 24 }}>{erro}</div>;
  if (!dados) return <div style={{ padding: 24 }}>Carregando…</div>;
  const r = dados.rom.find(x => x.id === romId) || dados.rom[0];
  if (!r) return <div style={{ padding: 24 }}>Nenhum romaneio liberado para você.</div>;
  const s = resumo(r, dados.ent);
  const travado = ["enviado", "aprovado"].includes(r.status);
  const topo = (titulo: string, sub: string, voltar?: () => void) => (
    <div style={{ background: AZ, color: "#fff", padding: "16px 16px 14px", display: "flex", gap: 12, alignItems: "center", position: "sticky", top: 0, zIndex: 2 }}>
      {voltar ? <button aria-label="Voltar" onClick={voltar} style={{ width: 44, height: 44, borderRadius: 10, border: 0, background: "#2E4A80", color: "#fff", fontSize: 22, fontWeight: 800 }}>‹</button> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}><span style={{ fontSize: 13, color: "#C9D6EE", fontWeight: 600 }}>{sub}</span><span style={{ fontSize: 19, fontWeight: 800 }}>{titulo}</span></div>
      {!voltar && <button onClick={sair} style={{ border: "1px solid #5C77A8", background: "transparent", color: "#fff", borderRadius: 10, padding: "8px 10px", fontSize: 12.5, fontWeight: 700 }}>Sair do modo</button>}
    </div>);
  const pagina = (filhos: any) => <div style={{ minHeight: "100vh", background: FUNDO, fontFamily: "Inter, system-ui, sans-serif", color: "#1B2333", maxWidth: 520, margin: "0 auto" }}>{filhos}</div>;

  if (tela.startsWith("entrega:")) {
    const e = s.l.find(x => String(x.id) === tela.slice(8));
    if (e) return pagina(<FormEntrega e={e} r={r} travado={travado} topo={topo} voltar={() => setTela("lista")} pronto={async () => { await recarregar(); setTela("lista"); }} toast={toast} />);
  }
  if (tela === "extra") return pagina(<FormExtra r={r} ordem={s.l.length + 1} topo={topo} voltar={() => setTela("lista")} pronto={async () => { await recarregar(); setTela("lista"); }} toast={toast} />);
  if (tela === "encerrar") return pagina(<Encerrar r={r} s={s} travado={travado} topo={topo} voltar={() => setTela("lista")} pronto={async () => { await recarregar(); setTela("lista"); }} toast={toast} />);

  const rota = rotaMaps(s.l);
  const pct = s.normais.length ? Math.round(s.feitas / s.normais.length * 100) : 0;
  return pagina(<>
    {topo("Romaneio " + r.numero, "🧪 SIMULAÇÃO · " + r.freteiro + " · " + r.placa)}
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      {meus(dados).length > 1 && <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>{meus(dados).slice().sort((a, b) => a.data.localeCompare(b.data)).map(x =>
        <button key={x.id} onClick={() => setRomId(x.id)} style={{ flexShrink: 0, minHeight: 40, padding: "0 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, border: x.id === r.id ? "2px solid #1F3864" : "1px solid #C9D1DE", background: x.id === r.id ? "#E8EEF8" : "#fff", color: "#1B2333" }}>{new Date(x.data + "T12:00").toLocaleDateString("pt-BR").slice(0, 5)} · {x.numero}</button>)}</div>}
      {r.status === "devolvido" && <div style={{ ...card, background: "#FDECEC", borderColor: "#F1B5B5", color: "#8A1C1C" }}><b>Devolvido pelo escritório:</b> {r.devolvido_motivo || "—"}. Corrija e envie de novo.</div>}
      {r.status === "enviado" && <div style={{ ...card, background: "#FFF4DC", borderColor: "#F0CF86", color: "#7A4F00" }}><b>Enviado para aprovação.</b> Aguarde o escritório.</div>}
      {r.status === "aprovado" && <div style={{ ...card, background: "#E8F3EC", borderColor: "#9FD3AE", color: VD }}><b>Romaneio aprovado</b> · {moeda(s.total)}</div>}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span>{new Date(r.data + "T12:00").toLocaleDateString("pt-BR")} · {s.feitas} de {s.normais.length} feitas</span><b>{moeda(s.vEnt)}</b></div>
        <div style={{ height: 8, borderRadius: 999, background: "#E6EAF1", overflow: "hidden" }}><div style={{ width: pct + "%", height: 8, background: "#3BA55C" }} /></div>
        {rota && !travado && <a href={rota} target="_blank" rel="noopener" style={bt(AZ)}>🗺 Abrir rota no Google Maps</a>}
      </div>
      {s.l.map(e => {
        const ok = e.situacao === "entregue", pend = e.situacao === "pendente";
        const cor = e.extra ? "#7A4F00" : ok ? VD : pend ? "#3B4558" : "#9A3412";
        return <button key={e.id} onClick={() => setTela("entrega:" + e.id)} style={{ ...card, display: "flex", gap: 12, alignItems: "center", textAlign: "left", cursor: "pointer", width: "100%" }}>
          <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, background: pend ? "#E6EAF1" : ok ? "#E8F3EC" : "#FDECEC", color: cor }}>{e.extra ? "+" : e.ordem}</span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <b style={{ fontSize: 15 }}>{e.cliente}</b>
            <span style={{ fontSize: 13, color: "#5B6577" }}>{e.bairro || e.endereco} {e.cidade ? "· " + e.cidade.replace(/ - PR$/i, "") : ""}</span>
            {e.obs ? <span style={{ fontSize: 12.5, color: "#8A5A00" }}>{e.obs}</span> : null}
          </span>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: pend ? "#EEF1F6" : ok ? "#E8F3EC" : "#FDECEC", color: cor }}>{e.extra ? "Extra" : SITUACAO[e.situacao]}</span>
            <span style={{ fontSize: 12, color: "#5B6577" }}>{e.extra ? (e.autorizado == null ? "aguarda escritório" : e.autorizado ? moeda(valorX(e)) : "recusada") : pend ? (e.vol_deposito ?? "?") + " vol" : (e.vol_entregue ?? 0) + " vol · " + moeda(Number(e.valor_freteiro ?? e.valor_tabela))}</span>
          </span>
        </button>;
      })}
      {!travado && <button onClick={() => setTela("extra")} style={bt(AZ, false)}>＋ Incluir parada fora do romaneio</button>}
      <button onClick={() => setTela("encerrar")} style={bt(travado ? AZ : VD, travado)}>{travado ? "Ver resumo do dia" : "Encerrar o dia · km e enviar"}</button>
    </div>
  </>);
}
const valorX = (e: Entrega) => Number(e.valor_freteiro ?? e.valor_tabela ?? 0);

function FormEntrega({ e, r, travado, topo, voltar, pronto, toast }: any) {
  const [sit, setSit] = useState<string>(e.situacao === "pendente" ? "entregue" : e.situacao);
  const [vol, setVol] = useState<string>(String(e.vol_entregue ?? e.vol_deposito ?? ""));
  const [val, setVal] = useState<string>(String(e.valor_freteiro ?? e.valor_tabela ?? "").replace(".", ","));
  const [mot, setMot] = useState<string>(e.motivo || "");
  const [can, setCan] = useState<boolean>(!!e.canhoto);
  const [sal, setSal] = useState(false);
  const tels = String(e.telefones || "").split(/[\/,;]/).map((t: string) => t.trim()).filter(Boolean);
  const msg = "Olá! Aqui é o " + String(r.freteiro).split(" ")[0] + ", motorista da Aliança Móveis. Estou a caminho com a entrega da venda " + e.venda + ". Chego em aproximadamente 1 hora. Alguém vai estar no local para receber?";
  const salvar = async () => {
    if (sit !== "nao_entregue" && !vol) { toast("Informe os volumes entregues"); return; }
    if (sit !== "entregue" && !mot.trim()) { toast("Explique o motivo (parcial / não entregue)"); return; }
    setSal(true);
    try {
      const v = num(val);
      await salvarEntrega(e.id, { situacao: sit, vol_entregue: sit === "nao_entregue" ? 0 : Number(vol), valor_freteiro: e.extra ? (val ? v : null) : (v !== Number(e.valor_tabela) ? v : null), motivo: mot.trim(), canhoto: can, entregue_em: new Date().toISOString() });
      if (r.status === "conferido") await salvarRomaneio(r.id, { status: "em_rota" });
      toast("Entrega salva");
      await pronto();
    } catch (x: any) { toast(x.message); setSal(false); }
  };
  const chip = (k: string, l: string) => <button key={k} disabled={travado} onClick={() => setSit(k)} style={{ flex: 1, minHeight: 46, borderRadius: 10, fontSize: 14, fontWeight: 800, border: sit === k ? "2px solid #1F3864" : "1px solid #C9D1DE", background: sit === k ? "#E8EEF8" : "#fff", color: "#1B2333" }}>{l}</button>;
  return <>
    {topo(e.cliente, (e.extra ? "Parada extra" : "Entrega " + e.ordem) + (e.venda ? " · venda " + e.venda : ""), voltar)}
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 6 }}>
        <b style={{ fontSize: 15 }}>{e.endereco}</b>
        <span style={{ fontSize: 13, color: "#5B6577" }}>{[e.bairro, e.cidade, e.cep, e.nf ? "NF " + e.nf : ""].filter(Boolean).join(" · ")}</span>
        {e.obs ? <span style={{ fontSize: 13, color: "#8A5A00", fontWeight: 600 }}>{e.obs}</span> : null}
        <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          {tels[0] && <a href={linkWhats(tels[0], msg)} target="_blank" rel="noopener" style={{ ...bt("#25A244"), flex: 1, minWidth: 160, fontSize: 14 }}>WhatsApp · estou a caminho</a>}
          {tels[0] && <a href={"tel:" + tels[0].replace(/\D/g, "")} style={{ ...bt(AZ, false), width: "auto", padding: "0 16px", fontSize: 14 }}>Ligar</a>}
          {!e.extra && <a href={"https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(endCompleto(e))} target="_blank" rel="noopener" style={{ ...bt(AZ, false), width: "auto", padding: "0 16px", fontSize: 14 }}>Mapa</a>}
        </div>
      </div>
      {!e.extra && <div style={{ display: "flex", gap: 8 }}>{chip("entregue", "Entregue")}{chip("parcial", "Parcial")}{chip("nao_entregue", "Não entregue")}</div>}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        {sit !== "nao_entregue" && <>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#3B4558" }}>Volumes entregues</label>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input disabled={travado} inputMode="numeric" value={vol} onChange={x => setVol(x.target.value.replace(/\D/g, ""))} style={{ ...inp, width: 100, textAlign: "center", fontSize: 22 }} />
            {e.vol_deposito != null && <span style={{ fontSize: 13, fontWeight: 600, color: Number(vol) === e.vol_deposito ? VD : "#9A3412" }}>Saíram {e.vol_deposito} do depósito {Number(vol) === e.vol_deposito ? "· confere ✓" : "· diferença, explique abaixo"}</span>}
          </div>
        </>}
        <label style={{ fontSize: 13, fontWeight: 700, color: "#3B4558" }}>Valor do frete</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input disabled={travado} inputMode="decimal" value={val} onChange={x => setVal(x.target.value)} placeholder="0,00" style={{ ...inp, width: 140 }} />
          <span style={{ fontSize: 13, color: "#5B6577" }}>{e.extra ? "Informe o valor: o escritório autoriza." : "Tabela: " + moeda(Number(e.valor_tabela)) + ". Mudou? O escritório aprova."}</span>
        </div>
        {(sit !== "entregue" || (e.vol_deposito != null && vol && Number(vol) !== e.vol_deposito) || (!e.extra && num(val) !== Number(e.valor_tabela))) && <>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#3B4558" }}>Motivo / observação</label>
          <textarea disabled={travado} value={mot} onChange={x => setMot(x.target.value)} placeholder="Ex.: cliente ausente, faltou 1 volume, subida por escada…" style={{ ...inp, fontSize: 15, fontWeight: 500, minHeight: 80, padding: 10 }} />
        </>}
      </div>
      {sit !== "nao_entregue" && <label style={{ ...card, display: "flex", gap: 12, alignItems: "center", cursor: travado ? "default" : "pointer", borderStyle: can ? "solid" : "dashed", borderColor: can ? "#9FD3AE" : "#8DA2C8" }}>
        <input type="file" accept="image/*" capture="environment" disabled={travado} style={{ display: "none" }} onChange={x => { if (x.target.files?.length) setCan(true); }} />
        <span style={{ fontSize: 26 }}>📷</span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ color: can ? VD : AZ }}>{can ? "Canhoto assinado ✓" : "Foto do canhoto assinado"}</b><span style={{ fontSize: 12.5, color: "#5B6577" }}>Na simulação a foto não é guardada — só marca que foi tirada.</span></span>
      </label>}
      {!travado && <button disabled={sal} onClick={salvar} style={bt(AZ)}>{sal ? "Salvando…" : "Salvar e voltar"}</button>}
    </div>
  </>;
}

function FormExtra({ r, ordem, topo, voltar, pronto, toast }: any) {
  const [cli, setCli] = useState(""); const [end, setEnd] = useState(""); const [mot, setMot] = useState(""); const [sal, setSal] = useState(false);
  const salvar = async () => {
    if (!cli.trim() || !mot.trim()) { toast("Informe o cliente e o motivo"); return; }
    setSal(true);
    try { await incluirExtra(r.id, ordem, cli.trim(), end.trim(), mot.trim()); toast("Parada incluída — o escritório autoriza o valor"); await pronto(); } catch (x: any) { toast(x.message); setSal(false); }
  };
  return <>
    {topo("Parada fora do romaneio", "Romaneio " + r.numero, voltar)}
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card, background: "#FFF4DC", borderColor: "#F0CF86", color: "#5C3B00", fontSize: 13.5 }}>Use quando fizer uma entrega, recolha ou retorno que não estava no romaneio. Ela só entra no total depois que o escritório autorizar.</div>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Cliente</label><input value={cli} onChange={x => setCli(x.target.value)} style={{ ...inp, fontSize: 16, fontWeight: 600 }} />
        <label style={{ fontSize: 13, fontWeight: 700 }}>Endereço (opcional)</label><input value={end} onChange={x => setEnd(x.target.value)} style={{ ...inp, fontSize: 16, fontWeight: 500 }} />
        <label style={{ fontSize: 13, fontWeight: 700 }}>O que foi feito e por quê</label><textarea value={mot} onChange={x => setMot(x.target.value)} placeholder="Ex.: frete extra a pedido da loja, recolha de peça…" style={{ ...inp, fontSize: 15, fontWeight: 500, minHeight: 90, padding: 10 }} />
      </div>
      <button disabled={sal} onClick={salvar} style={bt(AZ)}>{sal ? "Salvando…" : "Incluir parada"}</button>
    </div>
  </>;
}

function Encerrar({ r, s, travado, topo, voltar, pronto, toast }: any) {
  const [ki, setKi] = useState(r.km_ini != null ? String(r.km_ini) : ""); const [kf, setKf] = useState(r.km_fim != null ? String(r.km_fim) : "");
  const [fi, setFi] = useState(r.km_ini != null); const [ff, setFf] = useState(r.km_fim != null); const [sal, setSal] = useState(false);
  const a = kmNum(ki), b = kmNum(kf), km = a != null && b != null && b >= a ? b - a : null;
  const vKm = km != null ? km * Number(r.valor_km) : 0;
  const pend = s.normais.filter((e: Entrega) => e.situacao === "pendente").length;
  const enviar = async () => {
    if (pend) { toast("Ainda há " + pend + " entrega(s) pendente(s): marque entregue, parcial ou não entregue"); return; }
    if (km == null) { toast("Informe o km de saída e de chegada (a chegada maior que a saída)"); return; }
    if (!fi || !ff) { toast("Tire a foto do painel na saída e na chegada"); return; }
    setSal(true);
    try { await salvarRomaneio(r.id, { km_ini: a, km_fim: b, status: "enviado", enviado_em: new Date().toISOString(), devolvido_motivo: null }); toast("Enviado para aprovação ✅"); await pronto(); }
    catch (x: any) { toast(x.message); setSal(false); }
  };
  const foto = (ok: boolean, set: (v: boolean) => void) => <label style={{ fontSize: 12.5, fontWeight: 700, color: ok ? VD : AZ, cursor: "pointer" }}>
    <input type="file" accept="image/*" capture="environment" disabled={travado} style={{ display: "none" }} onChange={x => { if (x.target.files?.length) set(true); }} />{ok ? "✓ foto do painel" : "📷 foto do painel"}</label>;
  return <>
    {topo(travado ? "Resumo do dia" : "Encerrar o dia", "Romaneio " + r.numero, voltar)}
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <b>Km do painel</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: "#5B6577" }}>Saída do depósito</span><input disabled={travado} inputMode="numeric" value={ki} onChange={x => setKi(x.target.value)} style={inp} />{foto(fi, setFi)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: "#5B6577" }}>Chegada</span><input disabled={travado} inputMode="numeric" value={kf} onChange={x => setKf(x.target.value)} style={inp} />{foto(ff, setFf)}</div>
        </div>
        <span style={{ fontSize: 14 }}>{km != null ? <>Rodados: <b>{km} km</b> × {moeda(Number(r.valor_km))} = <b>{moeda(vKm)}</b></> : "Informe os dois km para calcular."}</span>
      </div>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
        <b>Resumo</b>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>{s.feitas} de {s.normais.length} entregas · {s.volEnt} volumes</span><b>{moeda(s.vEnt)}</b></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>{km ?? "—"} km rodados</span><b>{moeda(vKm)}</b></div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #E6EAF1", paddingTop: 8, fontSize: 16 }}><b>Total do dia</b><b style={{ fontSize: 18 }}>{moeda(s.vEnt + vKm)}</b></div>
        {pend > 0 && <span style={{ color: "#9A3412", fontWeight: 700 }}>{pend} entrega(s) ainda pendente(s)</span>}
        {s.semCanhoto > 0 && <span style={{ color: "#9A3412", fontWeight: 700 }}>{s.semCanhoto} entrega(s) sem foto do canhoto</span>}
        {s.extrasPend.length > 0 && <span style={{ color: "#7A4F00", fontWeight: 700 }}>{s.extrasPend.length} parada(s) extra aguardando o escritório (fora do total)</span>}
      </div>
      {!travado && <button disabled={sal} onClick={enviar} style={bt(VD)}>{sal ? "Enviando…" : "Enviar para aprovação"}</button>}
    </div>
  </>;
}
