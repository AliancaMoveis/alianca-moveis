// Central de notificações: sino com as não lidas, lista para reler e leitura completa.
// Tocar na notificação do celular abre o app em /?notif=ID (e &abrir=CHAMADO) e mostra a notificação inteira.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";
import { fmtDateTime } from "../lib/regras";

type Aviso = { id: number; titulo: string; corpo: string; chamado_id: string | null; criado_em: string; lida_em: string | null };
const MOCK = !!(import.meta as any).env?.VITE_MOCK;
const EVENTO = "a360-aviso";
export const abrirAviso = (id: number) => window.dispatchEvent(new CustomEvent(EVENTO, { detail: id }));

async function carregar(): Promise<Aviso[]> {
  if (MOCK) return [
    { id: 2, titulo: "📈 Resumo do dia · 25/09", corpo: "Vendas hoje: 4 · R$ 58.300,00 · ticket R$ 14.575,00\nLoja: 19 agendados · 12 atendidos · 3 não vieram\nMês até hoje: 38 vendas · R$ 512.400,00 · ticket R$ 13.484,21\nDestaque: Lucas (2 · R$ 31.000,00)\nNovos agendamentos: 17 · visitas de consultor: 6", chamado_id: null, criado_em: new Date().toISOString(), lida_em: null },
    { id: 1, titulo: "💎 Venda alta: R$ 42.000,00", corpo: "Helena Duarte · Lucas · ger. Adriel", chamado_id: "ALM-0023", criado_em: new Date(Date.now() - 3600e3).toISOString(), lida_em: new Date().toISOString() },
  ];
  const { data } = await sb.from("notificacoes").select("id,titulo,corpo,chamado_id,criado_em,lida_em").order("id", { ascending: false }).limit(60);
  return (data as Aviso[]) || [];
}
const marcarLidas = (ids: number[] | null) => MOCK ? Promise.resolve() : sb.rpc("marcar_notificacoes_lidas", { p_ids: ids }).then(() => undefined);

export function SinoAvisos({ claro }: { claro?: boolean }) {
  const { abrirDetalhe, st } = useApp() as any;
  const [lista, setLista] = useState<Aviso[]>([]);
  const [aberto, setAberto] = useState(false);
  const [lendo, setLendo] = useState<Aviso | null>(null);
  const atualizar = () => carregar().then(setLista).catch(() => null);
  useEffect(() => {
    atualizar();
    const t = setInterval(atualizar, 60000);
    const foco = () => atualizar();
    window.addEventListener("focus", foco);
    // aberto por uma notificação do celular: mostra a notificação inteira
    const abrirPorId = async (id: number) => {
      let l = await carregar(); setLista(l);
      let a = l.find(x => x.id === id);
      if (!a && !MOCK) { const { data } = await sb.from("notificacoes").select("id,titulo,corpo,chamado_id,criado_em,lida_em").eq("id", id).maybeSingle(); a = (data as Aviso) || undefined; }
      if (a) ler(a);
    };
    const ev = (e: any) => abrirPorId(Number(e.detail));
    window.addEventListener(EVENTO, ev);
    return () => { clearInterval(t); window.removeEventListener("focus", foco); window.removeEventListener(EVENTO, ev); };
  }, []);
  const naoLidas = lista.filter(a => !a.lida_em).length;
  const ler = (a: Aviso) => {
    setLendo(a);
    if (!a.lida_em) { marcarLidas([a.id]); setLista(l => l.map(x => x.id === a.id ? { ...x, lida_em: new Date().toISOString() } : x)); }
  };
  const podeAbrirCliente = (a: Aviso) => !!a.chamado_id && st.chamados.some((c: any) => c.id === a.chamado_id);
  return <>
    <button className={"sino" + (claro ? " claro" : "")} title="Notificações" onClick={() => { setAberto(true); atualizar(); }}><span className="ic">🔔</span>{naoLidas > 0 && <i>{naoLidas > 99 ? "99+" : naoLidas}</i>}</button>
    {aberto && !lendo && <div className="avisos-fundo" onMouseDown={e => { if (e.target === e.currentTarget) setAberto(false); }}>
      <div className="avisos-painel">
        <div className="avisos-cab"><b>Notificações</b>
          {naoLidas > 0 && <button className="btn ghost sm" onClick={() => { marcarLidas(null); setLista(l => l.map(x => ({ ...x, lida_em: x.lida_em || new Date().toISOString() }))); }}>Marcar todas como lidas</button>}
          <button className="x" onClick={() => setAberto(false)}>&times;</button></div>
        <div className="avisos-lista">
          {lista.length ? lista.map(a => <button key={a.id} className={"aviso-item" + (a.lida_em ? "" : " nova")} onClick={() => ler(a)}>
            <b>{a.titulo}</b><span>{(a.corpo || "").split("\n")[0]}</span><small>{fmtDateTime(a.criado_em)}</small></button>)
            : <div className="mv-vazio">Nenhuma notificação ainda.</div>}
        </div>
      </div></div>}
    {lendo && <div className="avisos-fundo" onMouseDown={e => { if (e.target === e.currentTarget) setLendo(null); }}>
      <div className="avisos-painel leitura">
        <div className="avisos-cab"><button className="btn ghost sm" onClick={() => setLendo(null)}>‹ Voltar</button><button className="x" onClick={() => { setLendo(null); setAberto(false); }}>&times;</button></div>
        <div className="aviso-ler">
          <h3>{lendo.titulo}</h3>
          <small>{fmtDateTime(lendo.criado_em)}</small>
          <p>{lendo.corpo}</p>
          {podeAbrirCliente(lendo) && <button className="btn primary" onClick={() => { const id = lendo.chamado_id!; setLendo(null); setAberto(false); abrirDetalhe(id); }}>Abrir a ficha ({lendo.chamado_id})</button>}
        </div>
      </div></div>}
  </>;
}
