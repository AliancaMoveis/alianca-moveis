// Peças comuns aos cruzamentos de vendas do Exact (360 e Minha Visita) e à fila de Confirmação de vendas.
import { col } from "../telas/Medidas";
import type { Linha } from "./cruzarVendas";

const SEM = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);
export const toksNome = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s*[-–(].*$/, "").replace(/[^A-Z ]/g, " ").split(/\s+/).filter(t => t.length > 1 && !SEM.has(t));
export const numBr = (s: string) => { const n = Number(String(s || "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
export const isoBr = (s: string) => { const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; };

/** vendedor do 360 pelo nome do Exact: 1º nome + outro nome igual; ou só o 1º nome, se for único */
export function acharVendedorExact(usuarios: any[], nomeEx: string) {
  const vendedores = usuarios.filter((u: any) => (u.setores || []).includes("atendente_cliente"));
  const t = toksNome(nomeEx); if (!t.length) return null;
  const cand = vendedores.map((u: any) => ({ u, t: toksNome((u.nomeCompleto || "") + " " + u.nome), n: toksNome(u.nome) })).filter((x: any) => x.n.length && (
    x.n[0] === t[0] || (x.n[0].length >= 4 && x.n[0].slice(0, 4) === t[0].slice(0, 4)) || (x.n[0].slice(0, 2) === t[0].slice(0, 2) && x.t.slice(1).some((y: string) => t.includes(y))))
    && x.n.slice(1).every((y: string) => t.includes(y))); // "Leandro Barreto" não é "Leandro Lopes"
  const exato = cand.filter((x: any) => x.n[0] === t[0]); const base = exato.length ? exato : cand;
  const forte = base.filter((x: any) => x.t.slice(1).some((y: string) => t.slice(1).includes(y)));
  const pool = forte.length ? forte : base;
  const ativos = pool.filter((x: any) => x.u.ativo);
  const fim = ativos.length ? ativos : pool;
  return fim.length === 1 ? fim[0].u : null;
}

/** consultor externo do 360 pelo nome que vem no Minha Visita ("Contato de") */
export function acharConsultor(usuarios: any[], nome: string) {
  const t = toksNome(String(nome || "").replace(/consultor[a]?\s*[—-]?\s*/i, "")); if (!t.length) return null;
  const l = usuarios.filter((u: any) => (u.setores || []).includes("consultor_externo") && u.ativo !== false)
    .filter((u: any) => { const n = toksNome(String(u.nome).replace(/^.*—\s*/, "")); return n.length && t.includes(n[0]); });
  return l.length === 1 ? l[0] : null;
}

/** campos do Exact que vão para a fila de Confirmação */
export const camposExact = (ex: Linha) => ({
  numero: String(col(ex, "ID")).replace(/\D/g, ""),
  ex_cliente: col(ex, "Cliente").trim(), ex_tel1: col(ex, "ClienteTel1").trim(), ex_tel2: col(ex, "ClienteTel2").trim(),
  ex_end: col(ex, "Orçamento").trim(), ex_idpessoa: col(ex, "IDPessoaCli").trim(), ex_vendedor: col(ex, "Vendedor").trim(),
  ex_situacao: col(ex, "SituaçãoVenda").trim(), ex_total: numBr(col(ex, "ValorTotal")) || null, ex_recebido: numBr(col(ex, "ValorTotaRecebido")),
  valor: numBr(col(ex, "ValorTotaRecebido")) || numBr(col(ex, "ValorTotal")),
  data: isoBr(col(ex, "DataSituação", "IncluidaEm")),
});
