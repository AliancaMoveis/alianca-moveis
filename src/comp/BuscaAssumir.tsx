// Vendedor: busca qualquer cliente do marketing pelo nome/telefone (mesmo sem agenda na loja) e assume o atendimento.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtTel } from "../lib/baseClientes";

const dt = (v: any) => { const s = String(v || ""); return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + (s.length > 10 ? " " + s.slice(11, 16) : "") : ""; };

export function BuscaAssumir({ q, movel }: { q: string; movel?: boolean }) {
  const { executar, abrirDetalhe, toast } = useApp() as any;
  const [res, setRes] = useState<any[] | null>(null);
  const [busc, setBusc] = useState(false);
  const t = q.trim();
  const buscar = async () => {
    if (t.length < 3) return;
    setBusc(true);
    try { setRes(await A.vendedorBuscar(t) || []); } catch (e: any) { toast(e.message || "Não foi possível buscar"); setRes([]); } finally { setBusc(false); }
  };
  useEffect(() => { setRes(null); if (t.length < 3) return; const h = setTimeout(buscar, 600); return () => clearTimeout(h); }, [t]);
  if (t.length < 3) return null;
  const assumir = async (x: any) => {
    if (!confirm("Assumir o atendimento de " + x.cliente + "?\n\nO cliente passa a ser seu e a supervisão do marketing é avisada.")) return;
    if (await executar(() => A.vendedorAssumir(x.id), "Atendimento assumido — o cliente agora é seu")) { setRes(null); abrirDetalhe(x.id); }
  };
  return <div className={movel ? "ba ba-m" : "ba"}>
    <div className={movel ? "mv-sec" : "sec-label"}>🔎 Todos os clientes com esse nome {res ? <i>{res.length}</i> : null}</div>
    {busc && !res && <div className="mv-vazio">Buscando…</div>}
    {res && !res.length && <div className="mv-vazio">Nenhum cliente do marketing com esse nome ou telefone.</div>}
    {res && res.map((x: any) => (
      <div key={x.id} className="ba-card">
        <div className="ba-info">
          <b>{x.cliente} <small>{x.id}</small></b>
          <span>{x.status}{x.data_loja ? " · loja " + dt(x.data_loja) : x.data_visita ? " · visita " + dt(x.data_visita) : " · sem agenda na loja"}</span>
          <span>{x.telefone ? fmtTel(x.telefone) + " · " : ""}{x.produto || "—"}{x.consultor ? " · consultor " + x.consultor : ""}</span>
        </div>
        {x.meu ? <button className="btn sm" onClick={() => abrirDetalhe(x.id)}>Abrir — já é seu</button>
          : x.livre ? <button className="ba-assumir" onClick={() => assumir(x)}>🙋 ASSUMIR ATENDIMENTO DO CLIENTE</button>
          : <div className="ba-com">Com o vendedor <b>{x.vendedor}</b> — peça a transferência</div>}
      </div>))}
  </div>;
}
