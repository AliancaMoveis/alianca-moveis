// Fretes — escritório (SIMULAÇÃO, só o usuário do Bruno): acompanhar o romaneio, conferir e aprovar.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { carregarFretes, moeda, podeFretes, reiniciarSimulacao, resumo, salvarEntrega, salvarRomaneio, SITUACAO, STATUS_ROM, valorEntrega, type Entrega, type Romaneio } from "../lib/fretes";

const corSt: Record<string, [string, string]> = { conferido: ["#EEF1F6", "#3B4558"], em_rota: ["#E8EEF8", "#1F3864"], enviado: ["#FFF4DC", "#7A4F00"], devolvido: ["#FDECEC", "#8A1C1C"], aprovado: ["#E8F3EC", "#1F6B3E"] };

export default function Fretes() {
  const { R, toast } = useApp() as any;
  const [d, setD] = useState<{ rom: Romaneio[]; ent: Entrega[] } | null>(null); const [erro, setErro] = useState("");
  const rec = () => carregarFretes().then(setD).catch(e => setErro(e.message));
  useEffect(() => { rec(); const t = setInterval(rec, 15000); return () => clearInterval(t); }, []);
  if (!podeFretes(R.currentUserId)) return <section className="view active"><div className="empty">Fretes está em simulação, só no usuário do Bruno.</div></section>;
  const reiniciar = async () => { if (!confirm("Reiniciar a simulação? O romaneio 104997 volta ao início (sem entregas, km nem aprovação).")) return; try { await reiniciarSimulacao(); await rec(); toast("Simulação reiniciada"); } catch (e: any) { toast(e.message); } };
  return (
    <section className="view active">
      <div className="view-head"><div><h2>🚚 Fretes · romaneios <span className="pill" style={{ background: "#7a3fb0", color: "#fff", fontSize: 12, verticalAlign: 3 }}>SIMULAÇÃO</span></h2>
        <p>Teste do processo com o romaneio 104997 (José Elias, 13/10). O freteiro registra as entregas no celular; aqui o escritório confere e aprova. Visível só para você.</p></div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <a className="btn primary" href="/frete" target="_blank" rel="noopener">📱 Abrir modo freteiro</a>
        <button className="btn" onClick={rec}>↻ Atualizar</button>
        <button className="btn" onClick={reiniciar}>↺ Reiniciar simulação</button>
        <button className="btn" disabled title="Falta o PDF do romaneio direto do sistema para ligar a importação">📄 Importar PDF do romaneio (em breve)</button>
      </div>
      {erro ? <div className="empty">{erro}</div> : !d ? <div className="empty">Carregando…</div> : !d.rom.length ? <div className="empty">Nenhum romaneio. Use “Reiniciar simulação”.</div>
        : d.rom.map(r => <CartaoRomaneio key={r.id} r={r} ent={d.ent} rec={rec} />)}
    </section>
  );
}

function CartaoRomaneio({ r, ent, rec }: { r: Romaneio; ent: Entrega[]; rec: () => any }) {
  const { toast } = useApp() as any;
  const s = resumo(r, ent);
  const [cs, cc] = corSt[r.status] || corSt.conferido;
  const [vx, setVx] = useState<Record<number, string>>({});
  const ex = async (f: () => Promise<any>, ok: string) => { try { await f(); await rec(); toast(ok); } catch (e: any) { toast(e.message); } };
  const aprovar = () => {
    if (s.extrasPend.length) { toast("Autorize ou recuse as paradas extras antes de aprovar"); return; }
    if (!confirm("Aprovar o romaneio " + r.numero + " em " + moeda(s.total) + "?")) return;
    ex(() => salvarRomaneio(r.id, { status: "aprovado", aprovado_em: new Date().toISOString(), aprovado_por: "Bruno" }), "Romaneio aprovado ✅");
  };
  const devolver = () => { const m = prompt("Motivo da devolução (o freteiro vê no celular):"); if (!m) return; ex(() => salvarRomaneio(r.id, { status: "devolvido", devolvido_motivo: m }), "Devolvido ao freteiro"); };
  const kpi = (n: any, l: string, alerta?: string) => <div className="card" style={{ padding: "12px 14px", flex: "1 1 180px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{n}</div><div className="hint">{l}</div>{alerta ? <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--warn)" }}>{alerta}</div> : null}</div>;
  return (
    <div className="card" style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)" }}>
        <div><b style={{ fontSize: 17 }}>Romaneio {r.numero} · {new Date(r.data + "T12:00").toLocaleDateString("pt-BR")}</b>
          <div className="hint">Freteiro <b>{r.freteiro}</b> · {r.placa} · {r.tipo}{r.enviado_em ? " · enviado " + new Date(r.enviado_em).toLocaleString("pt-BR").slice(0, 17) : ""}{r.aprovado_em ? " · aprovado " + new Date(r.aprovado_em).toLocaleString("pt-BR").slice(0, 17) : ""}</div></div>
        <span className="pill" style={{ background: cs, color: cc, fontWeight: 800 }}>{STATUS_ROM[r.status] || r.status}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 14 }}>
        {kpi(s.feitas + " de " + s.normais.length, "entregas registradas", s.semCanhoto ? s.semCanhoto + " sem foto do canhoto" : "")}
        {kpi(s.volEnt + " vol.", "entregues · depósito: " + s.volDep, s.difVol.length ? s.difVol.length + " diferença(s) de volume" : "")}
        {kpi(s.km != null ? s.km + " km" : "—", s.km != null ? r.km_ini + " → " + r.km_fim + " × " + moeda(r.valor_km) : "km ainda não informado")}
        {kpi(moeda(s.total), "entregas " + moeda(s.vEnt) + " + km " + moeda(s.vKm), s.difValor.length ? s.difValor.length + " valor(es) fora da tabela" : "")}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="ma-tab" style={{ minWidth: 980 }}>
          <thead><tr><th>Rota</th><th>Venda · cliente</th><th>Local</th><th className="n">Vol. depósito</th><th className="n">Vol. entregues</th><th className="n">Tabela</th><th className="n">Freteiro</th><th>Situação</th><th>Canhoto</th><th>Conferência</th></tr></thead>
          <tbody>{s.l.map(e => {
            const dv = !e.extra && e.situacao !== "pendente" && e.vol_entregue != null && e.vol_deposito != null && e.vol_entregue !== e.vol_deposito;
            const dvl = !e.extra && e.valor_freteiro != null && Number(e.valor_freteiro) !== Number(e.valor_tabela);
            const alerta = dv || dvl || e.situacao === "nao_entregue" || e.situacao === "parcial";
            return <tr key={e.id} style={{ background: e.extra ? "rgba(214,150,40,.10)" : alerta ? "rgba(214,150,40,.06)" : undefined }}>
              <td><b>{e.extra ? "+" : e.ordem}</b></td>
              <td><b>{e.venda || "—"}</b> · {e.cliente}{e.obs ? <div className="hint">{e.obs}</div> : null}</td>
              <td>{e.bairro} · {String(e.cidade).replace(/ - PR$/i, "")}</td>
              <td className="n">{e.vol_deposito ?? "—"}</td>
              <td className="n"><b>{e.vol_entregue ?? "—"}</b></td>
              <td className="n">{e.extra ? "—" : moeda(e.valor_tabela)}</td>
              <td className="n"><b>{e.extra ? (e.valor_freteiro != null ? moeda(e.valor_freteiro) : "—") : moeda(Number(e.valor_freteiro ?? e.valor_tabela))}</b></td>
              <td>{e.extra ? "Parada extra" : SITUACAO[e.situacao]}{e.motivo ? <div className="hint">{e.motivo}</div> : null}</td>
              <td>{e.canhoto ? "✅" : e.situacao === "pendente" || e.situacao === "nao_entregue" ? "—" : <span style={{ color: "var(--danger)", fontWeight: 700 }}>falta</span>}</td>
              <td style={{ minWidth: 200 }}>{e.extra ? (e.autorizado == null ? <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input style={{ width: 90 }} placeholder="R$" value={vx[e.id] ?? (e.valor_freteiro != null ? String(e.valor_freteiro).replace(".", ",") : "")} onChange={x => setVx({ ...vx, [e.id]: x.target.value })} />
                  <button className="btn sm primary" onClick={() => { const v = Number(String(vx[e.id] ?? e.valor_freteiro ?? "").replace(/\./g, "").replace(",", ".")); if (!v) { toast("Informe o valor"); return; } ex(() => salvarEntrega(e.id, { autorizado: true, valor_freteiro: v }), "Parada autorizada"); }}>Autorizar</button>
                  <button className="btn sm" onClick={() => ex(() => salvarEntrega(e.id, { autorizado: false }), "Parada recusada")}>Recusar</button></span>
                : e.autorizado ? <span style={{ color: "var(--st-concluida)", fontWeight: 700 }}>autorizada · {moeda(valorEntrega(e))}</span> : <span style={{ color: "var(--danger)", fontWeight: 700 }}>recusada</span>)
                : e.situacao === "pendente" ? <span className="hint">aguardando</span>
                : <span style={{ fontWeight: 700, color: alerta ? "var(--warn)" : "var(--st-concluida)" }}>{[dv ? (e.vol_entregue! - e.vol_deposito! > 0 ? "+" : "") + (e.vol_entregue! - e.vol_deposito!) + " vol." : "", dvl ? "valor fora da tabela" : "", e.situacao === "nao_entregue" ? "não entregue" : e.situacao === "parcial" ? "parcial" : ""].filter(Boolean).join(" · ") || "OK"}</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--line)" }}>
        <span>Entregas <b>{moeda(s.vEnt)}</b> + {s.km ?? "—"} km × {moeda(r.valor_km)} <b>{moeda(s.vKm)}</b> = <b style={{ fontSize: 18 }}>{moeda(s.total)}</b></span>
        {r.status === "enviado" ? <span style={{ display: "flex", gap: 8 }}><button className="btn" onClick={devolver}>Devolver ao freteiro</button><button className="btn primary" onClick={aprovar}>✅ Aprovar romaneio</button></span>
          : r.status === "aprovado" ? <button className="btn sm" onClick={() => ex(() => salvarRomaneio(r.id, { status: "enviado", aprovado_em: null, aprovado_por: null }), "Aprovação desfeita")}>Desfazer aprovação</button>
          : <span className="hint">A aprovação libera quando o freteiro enviar o dia.</span>}
      </div>
    </div>
  );
}
