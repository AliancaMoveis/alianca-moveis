// Dossiê do cliente — a varredura que o Jurídico fazia tela por tela.
//
// Uma busca só (CPF/CNPJ, telefone, nome ou nº da venda) e o 360 junta a história inteira:
// quem é, as vendas, os contratos com a prova da assinatura, os chamados com o histórico
// completo, o pós-venda, o WhatsApp e os anexos.
//
// A tela abre dizendo COMO achou — por CPF, por quais vendas, por quais telefones. Isso
// importa: o CPF sozinho não acha o que nasce dentro do 360 (checklist, medidas, visita),
// e quem vai responder um Procon precisa saber o que entrou e o que pode ter ficado de fora.
import { useState } from "react";
import { A } from "../lib/acoes";
import { fmtDate } from "../lib/regras";
import { Vazio } from "../comp/Ticket";

const dt = (v: any) => { if (!v) return ""; const d = new Date(v); return isNaN(+d) ? String(v) : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const dia = (v: any) => { if (!v) return ""; const d = new Date(v); return isNaN(+d) ? String(v).slice(0, 10) : d.toLocaleDateString("pt-BR"); };
const brl = (v: any) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const TIPO: Record<string, string> = {
  checklist: "Checklist", medidas: "Medidas", posvenda: "Pós-venda", montagem: "Montagem", assistencia: "Assistência",
  entrega: "Entrega", juridico: "Jurídico", visita: "Visita do consultor", agendamento: "Agendamento da loja", porta: "Portaria",
};

/** um bloco do dossiê, que abre e fecha — a Camila abre o que interessa no caso dela */
function Bloco({ t, n, children, aberto }: { t: string; n: number; children: any; aberto?: boolean }) {
  const [ab, setAb] = useState(!!aberto);
  return <div className="card" style={{ marginTop: 10, padding: 0 }}>
    <div onClick={() => setAb(!ab)} style={{ cursor: "pointer", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700 }}>
      <span>{t} <span className="pill" style={{ marginLeft: 6 }}>{n}</span></span><span>{ab ? "▾" : "▸"}</span>
    </div>
    {ab && <div style={{ padding: "0 12px 12px" }}>{n ? children : <div className="hint">Nada registrado.</div>}</div>}
  </div>;
}

export function JuridicoDossie() {
  const [q, setQ] = useState("");
  const [d, setD] = useState<any>(null);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState("");

  const buscar = async () => {
    if (q.trim().length < 3) { setErro("Escreva CPF/CNPJ, telefone, nome ou nº da venda"); return; }
    setIndo(true); setErro(""); setD(null);
    try { setD(await A.juridicoDossie(q.trim())); }
    catch (e: any) { setErro(e.message || "Não consegui montar o dossiê"); }
    finally { setIndo(false); }
  };

  const chamados: any[] = d?.chamados || [];
  const wa = d?.whatsapp || { enviadas: [], recebidas: [] };

  // linha do tempo única: é ela que vira o anexo do Procon, tudo datado e em ordem
  const linha = !d?.achou ? [] : [
    ...(d.vendas || []).map((v: any) => ({ em: v.data, t: "🧾 Venda " + v.numero + " · " + brl(v.recebido ?? v.tabela) + (v.vendedor ? " · " + v.vendedor : "") + (v.situacao ? " · " + v.situacao : "") })),
    ...chamados.map((c: any) => ({ em: c.aberto, t: "📋 " + (TIPO[c.tipo] || c.tipo) + " aberto · protocolo " + c.protocolo + (c.venda ? " · venda " + c.venda : "") })),
    ...(d.contratos || []).map((k: any) => ({ em: k.assinado_em || k.gerado_em, t: (k.assinado_em ? "✍️ Contrato ASSINADO" : "📄 Contrato gerado") + (k.venda ? " · venda " + k.venda : "") + (k.assinante ? " · por " + k.assinante : "") + (k.hash ? " · hash " + String(k.hash).slice(0, 12) + "…" : "") })),
    ...(wa.enviadas || []).map((e: any) => ({ em: e.em, t: "📤 WhatsApp enviado" + (e.modelo ? " (" + e.modelo + ")" : "") + (e.tipo === "falhou" ? " — FALHOU: " + (e.erro || "") : "") })),
    ...(wa.recebidas || []).map((r: any) => ({ em: r.em, t: "📥 Cliente respondeu: " + String(r.texto || "").slice(0, 90) })),
    ...(d.avaliacoes || []).map((a: any) => ({ em: a.em, t: "⭐ Avaliação NPS " + (a.nps ?? "—") + (a.comentario ? " · " + String(a.comentario).slice(0, 80) : "") })),
  ].filter(x => x.em).sort((a, b) => String(b.em).localeCompare(String(a.em)));

  return (
    <section className="view active">
      <div className="view-head"><div><h2>🔎 Dossiê do cliente</h2>
        <p>Tudo que aconteceu com um cliente, numa busca só: venda, contrato, checklist, montagem, atendimento e WhatsApp. Toda consulta fica registrada.</p></div></div>

      <div className="toolbar">
        <div className="search" style={{ flex: "1 1 320px" }}>
          <input placeholder="CPF/CNPJ, telefone, nome ou nº da venda" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") buscar(); }} />
        </div>
        <button className="btn" disabled={indo} onClick={buscar}>{indo ? "Varrendo…" : "🔎 Montar dossiê"}</button>
      </div>

      {erro && <div className="alerta" style={{ background: "var(--warn-bg)", borderColor: "var(--warn)" }}>⚠️ {erro}</div>}

      {d && !d.achou && <Vazio big="Não achei esse cliente">Tente o CPF, o número da venda ou o telefone. Cliente antigo pode estar só pelo telefone.</Vazio>}

      {d?.achou && <>
        {/* o que entrou na varredura — e, por tabela, o que pode ter ficado de fora */}
        <div className="card" style={{ marginTop: 10, background: "var(--surface-2)" }}>
          <b>Como eu achei:</b>{" "}
          {d.como.cpf ? "CPF " + d.como.cpf : "sem CPF no cadastro"}
          {" · "}{(d.como.vendas || []).length} venda(s){(d.como.vendas || []).length ? " (" + d.como.vendas.join(", ") + ")" : ""}
          {" · "}{(d.como.telefones || []).length} telefone(s)
          {" → "}<b>{d.como.chamados} chamado(s)</b>
          <div className="hint" style={{ marginTop: 4 }}>A busca cruza CPF, todos os números de venda e todos os telefones. Chamados de checklist e medidas quase nunca têm CPF — é por isso que entram pela venda e pelo telefone.</div>
        </div>

        {d.cliente && <div className="card" style={{ marginTop: 10 }}>
          <h3 style={{ margin: "0 0 6px" }}>{d.cliente.nome}</h3>
          <div>CPF/CNPJ <b>{d.cliente.cpf || "—"}</b> · {d.cliente.telefone1 || "—"}{d.cliente.telefone2 ? " / " + d.cliente.telefone2 : ""}</div>
          {d.cliente.endereco && <div className="hint">{d.cliente.endereco}</div>}
        </div>}

        <Bloco t="⏱ Linha do tempo" n={linha.length} aberto>
          {linha.map((x, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--line-soft)" }}>
            <span style={{ minWidth: 118, color: "var(--ink-faint)" }}>{dt(x.em)}</span><span>{x.t}</span>
          </div>)}
        </Bloco>

        <Bloco t="🧾 Vendas" n={(d.vendas || []).length}>
          <table className="tab"><thead><tr><th>Venda</th><th>Data</th><th>Vendedor</th><th>Situação</th><th>Tabela</th><th>Desconto</th><th>Recebido</th></tr></thead>
            <tbody>{(d.vendas || []).map((v: any, i: number) => <tr key={i}>
              <td><b>{v.numero}</b></td><td>{dia(v.data)}</td><td>{v.vendedor || "—"}</td><td>{v.situacao || "—"}</td>
              <td>{brl(v.tabela)}</td><td>{brl(v.desconto)}</td><td><b>{brl(v.recebido)}</b></td></tr>)}</tbody></table>
        </Bloco>

        <Bloco t="✍️ Contratos e a prova da assinatura" n={(d.contratos || []).length}>
          {(d.contratos || []).map((k: any, i: number) => <div key={i} className="card" style={{ marginBottom: 8 }}>
            <div><b>Venda {k.venda || "—"}</b> · {k.status} · gerado {dt(k.gerado_em)}{k.gerado_por ? " por " + k.gerado_por : ""}</div>
            {k.assinado_em ? <div style={{ marginTop: 4 }}>
              Assinado por <b>{k.assinante}</b>{k.cpf_assinante ? " (CPF " + k.cpf_assinante + ")" : ""} em <b>{dt(k.assinado_em)}</b>
              <div className="hint">IP {k.ip || "—"} · {String(k.navegador || "").slice(0, 70)}</div>
              <div className="hint">Hash do documento: <code>{k.hash || "—"}</code></div>
              {k.titular && <div className="hint">Titular: {k.titular}{k.titular_assinado_em ? " · assinou " + dt(k.titular_assinado_em) : " · não assinou"}</div>}
            </div> : <div className="hint" style={{ marginTop: 4 }}>Ainda não assinado.</div>}
          </div>)}
        </Bloco>

        <Bloco t="📋 Atendimentos (protocolos e histórico)" n={chamados.length}>
          {chamados.map((c: any) => <details key={c.protocolo} style={{ borderBottom: "1px solid var(--line-soft)", padding: "6px 0" }}>
            <summary style={{ cursor: "pointer" }}>
              <b>{c.protocolo}</b> · {TIPO[c.tipo] || c.tipo} · {c.status}{c.venda ? " · venda " + c.venda : ""} · aberto {dia(c.aberto)}
              {c.motivo ? <span className="hint"> — {String(c.motivo).slice(0, 80)}</span> : null}
            </summary>
            <div style={{ padding: "6px 0 6px 14px" }}>
              {(c.historico || []).length ? (c.historico || []).map((h: any, j: number) => <div key={j} style={{ padding: "3px 0" }}>
                <span style={{ color: "var(--ink-faint)" }}>{dt(h.em)}</span> · <b>{h.quem || "—"}</b>: {h.texto}
              </div>) : <div className="hint">Sem histórico.</div>}
            </div>
          </details>)}
        </Bloco>

        <Bloco t="🛠 Pós-venda e assistência" n={(d.posvenda || []).length}>
          {(d.posvenda || []).map((p: any, i: number) => <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
            <b>{p.protocolo}</b> · {p.categoria || "—"} · {p.situacao || p.desfecho || "—"}
            {p.ocorrido && <div>Ocorrido: {p.ocorrido}</div>}
            {p.solucao && <div>Solução: {p.solucao}</div>}
            <div className="hint">Responsabilidade: {p.responsabilidade || "—"}{p.custo != null ? " · custo " + brl(p.custo) : ""}</div>
          </div>)}
        </Bloco>

        <Bloco t="💬 WhatsApp (fluxos automáticos)" n={(wa.enviadas || []).length + (wa.recebidas || []).length}>
          <div className="hint" style={{ marginBottom: 6 }}>Aqui está o que o 360 mandou e o que o cliente respondeu nos fluxos automáticos. A conversa completa, inclusive o que foi digitado à mão pela equipe, fica no Kommo.</div>
          {[...(wa.enviadas || []).map((e: any) => ({ ...e, _s: "📤 enviada" + (e.modelo ? " · " + e.modelo : "") + (e.tipo === "falhou" ? " · FALHOU: " + (e.erro || "") : "") })),
            ...(wa.recebidas || []).map((r: any) => ({ ...r, _s: "📥 recebida: " + (r.texto || "") }))]
            .sort((a: any, b: any) => String(b.em).localeCompare(String(a.em)))
            .map((x: any, i: number) => <div key={i} style={{ padding: "3px 0" }}>
              <span style={{ color: "var(--ink-faint)" }}>{dt(x.em)}</span> · {x._s}</div>)}
        </Bloco>

        <Bloco t="📎 Documentos e anexos" n={(d.anexos || []).length}>
          {(d.anexos || []).map((x: any, i: number) => <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--line-soft)" }}>
            <b>{x.nome}</b> <span className="pill">{x.tipo}</span> <span className="hint">· protocolo {x.protocolo} · {dia(x.em)}</span>
          </div>)}
        </Bloco>

        <div className="hint" style={{ marginTop: 10 }}>
          A montagem efetivada (quem montou e quando) ainda vem do Exact e não entra aqui — o que aparece são os chamados de montagem e assistência abertos no 360. Fotos da montagem ficam nos anexos do chamado.
        </div>
      </>}

      {!d && !indo && <div className="hint" style={{ marginTop: 14 }}>Busque um cliente para montar o dossiê. Cada consulta registra quem abriu e quando — {fmtDate(new Date().toISOString())}.</div>}
    </section>
  );
}
