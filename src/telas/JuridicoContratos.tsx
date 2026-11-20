// Todos os contratos do checklist, com a prova da assinatura, num lugar só.
//
// Antes eles só existiam dentro da ficha do checklist de cada cliente — para responder um
// Procon era preciso saber de antemão qual cliente abrir. Aqui o Jurídico busca por cliente,
// venda ou assinante, e vê a prova completa: quem assinou, quando, de qual IP, com qual
// navegador e o hash do documento, que é o que garante que o arquivo não foi alterado depois.
import { useEffect, useState } from "react";
import { A } from "../lib/acoes";
import { Vazio } from "../comp/Ticket";

const dt = (v: any) => { if (!v) return "—"; const d = new Date(v); return isNaN(+d) ? String(v) : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const COR: Record<string, string> = { assinado: "var(--st-concluida)", pendente: "var(--warn)", aguardando_titular: "var(--st-respondida)", cancelado: "var(--ink-faint)" };
const ROTULO: Record<string, string> = { assinado: "✅ Assinado", pendente: "⏳ Aguardando assinatura", aguardando_titular: "👤 Aguardando o titular", cancelado: "✖ Cancelado" };

export function JuridicoContratos() {
  const [q, setQ] = useState("");
  const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  const [l, setL] = useState<any[] | null>(null);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState("");
  const [so, setSo] = useState("");

  const buscar = async () => {
    setIndo(true); setErro("");
    try { setL(await A.juridicoContratos(q.trim(), de || null, ate || null)); }
    catch (e: any) { setErro(e.message || "Não consegui carregar os contratos"); }
    finally { setIndo(false); }
  };
  useEffect(() => { buscar(); }, []);

  const vis = (l || []).filter(k => !so || (so === "assinado" ? !!k.assinado_em : !k.assinado_em));

  return (
    <section className="view active">
      <div className="view-head"><div><h2>✍️ Contratos assinados</h2>
        <p>Todos os contratos gerados no checklist, com a prova da assinatura: quem assinou, quando, de qual IP e o hash do documento.</p></div></div>

      <div className="toolbar">
        <div className="search" style={{ flex: "1 1 260px" }}>
          <input placeholder="Cliente, venda, assinante ou protocolo" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") buscar(); }} />
        </div>
        <input type="date" value={de} onChange={e => setDe(e.target.value)} title="De" />
        <input type="date" value={ate} onChange={e => setAte(e.target.value)} title="Até" />
        <select value={so} onChange={e => setSo(e.target.value)}>
          <option value="">Todos</option><option value="assinado">Só assinados</option><option value="pendente">Só não assinados</option>
        </select>
        <button className="btn" disabled={indo} onClick={buscar}>{indo ? "Buscando…" : "Buscar"}</button>
      </div>

      {erro && <div className="alert" style={{ background: "#fff8e8", borderColor: "#f0d9a8" }}>⚠️ {erro}</div>}

      {l && <div className="hint" style={{ marginBottom: 8 }}>{vis.length} contrato(s){vis.length !== (l || []).length ? " de " + l.length : ""}.</div>}

      {l && !vis.length ? <Vazio big="Nenhum contrato aqui">Ajuste a busca ou o período.</Vazio> :
        (vis || []).map((k: any, i: number) => <div key={i} className="card" style={{ marginBottom: 8, borderLeft: "4px solid " + (COR[k.status] || "var(--line)") }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
            <span><b>{k.cliente || "—"}</b> · venda {k.venda || "—"} · protocolo {k.chamado}</span>
            <span className="pill" style={{ background: COR[k.status] || "var(--line)", color: "#fff", fontWeight: 700 }}>{ROTULO[k.status] || k.status}</span>
          </div>
          <div className="hint">Gerado {dt(k.gerado_em)}{k.gerado_por ? " por " + k.gerado_por : ""}{k.repr ? " · representante: " + k.repr : ""}</div>

          {k.assinado_em ? <div style={{ marginTop: 6, padding: "6px 8px", background: "var(--bg-soft,#f7f8fa)", borderRadius: 8 }}>
            <div>Assinado por <b>{k.assinante}</b>{k.cpf ? " · CPF " + k.cpf : ""} em <b>{dt(k.assinado_em)}</b></div>
            <div className="hint">IP {k.ip || "—"} · {String(k.navegador || "").slice(0, 80)}</div>
            <div className="hint">Hash: <code style={{ wordBreak: "break-all" }}>{k.hash || "—"}</code></div>
            {k.titular && <div className="hint">Titular: {k.titular}{k.titular_cpf ? " (CPF " + k.titular_cpf + ")" : ""}{k.titular_assinado_em ? " · assinou " + dt(k.titular_assinado_em) : " · ainda não assinou"}</div>}
            {k.exact === false && <div className="hint">⚠️ ainda não subiu para o Exact</div>}
          </div> : <div className="hint" style={{ marginTop: 6 }}>Sem assinatura registrada.{k.expira_em ? " Link válido até " + dt(k.expira_em) + "." : ""}</div>}
        </div>)}

      <div className="hint" style={{ marginTop: 10 }}>O hash é a impressão digital do arquivo assinado: se o documento for alterado depois, ele deixa de bater. É isso que sustenta o contrato como prova.</div>
    </section>
  );
}
