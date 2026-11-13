// Checklist · ÁREA DO PROJETISTA (layout dos mockups: claude/mockups/mockup_tela1_venda_medicao, tela2_finalizacao, tela3_ambientes)
// Esquerda: "Meu dia" (cartões por dia, reservas em amarelo). Direita: ficha do cliente com as abas Venda · Medição · Checklist · Histórico.
// Checklist em 5 etapas: 1 ambientes da venda · 2 conferência por ambiente (listagem do Promob → termo) · 3 gerar impressão (PDF único)
// · 4 subir o digitalizado assinado (vai para o Exact como "Outros") · 5 marcar realizado (travado até o assinado).
// Nenhum valor aparece aqui: a listagem do Promob é lida no navegador e só material, espessura, cor, módulos e medidas são guardados.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { sb } from "../lib/supabase";
import { abrirWhats, fmtDate, fmtDateTime, hojeISO, parseData, primeiroNome, sanitizeWhats } from "../lib/regras";
import { lerListagemArquivo, type LinhaListagem, type Listagem } from "../lib/listagemPromob";
import { ambienteDaListagem, impressaoHtml, termoHtml, FICHA_AMBIENTE, type AmbTermo, type DadosTermo, type Mat } from "../lib/termoChecklist";
import { Modal } from "../comp/Modal";

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const NAO_INCLUSOS_PADRAO = ["Granito / pedra", "Eletrodomésticos", "Cuba", "Iluminação"];
const NAO_INCLUSOS_OPCOES = [...NAO_INCLUSOS_PADRAO, "Torneiras e metais", "Vidros e espelhos", "Instalação elétrica e hidráulica", "Rodapé e acabamentos de obra"];
const SUGESTOES_AMB = ["Cozinha", "Banheiro", "Lavanderia", "Lavabo", "Dormitório casal", "Dormitório solteiro", "Closet", "Sala / Home", "Escritório", "Área gourmet", "Churrasqueira", "Garagem", "Área de serviço"];
const MEDIDA_CURTA: Record<string, string> = { liberada: "Aprovada", realizada: "Em análise", validar: "Em análise", agendada: "Aguardando medição", pendente: "Pendente", em_obra: "Em obra" };
const ICONE_AMB = (n: string) => { const s = semAcento(n); return /cozinh|gourmet/.test(s) ? "🍳" : /lavand|servic/.test(s) ? "🧺" : /banh|lavabo/.test(s) ? "🚿" : /dormit|quarto|closet/.test(s) ? "🛏" : /sala|home|tv|painel/.test(s) ? "🛋" : /escrit/.test(s) ? "💼" : /churras|adega/.test(s) ? "🔥" : /garag/.test(s) ? "🚗" : "📦"; };
const COR_AMB = [["#e8f1ff", "#284b8f"], ["#fde9ef", "#a3214f"], ["#e6f4e9", "#2f6f3c"], ["#fff1dc", "#8a5d00"], ["#efe9fb", "#5b3c99"], ["#eef1f6", "#5a6270"]];

const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const somaDias = (iso: string, n: number) => { const d = parseData(iso + "T12:00"); d.setDate(d.getDate() + n); return isoDe(d); };
const cap = (s: string) => String(s || "").toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());
const semAcento = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hm = (iso: string) => String(iso || "").slice(11, 16);
const ddmm = (iso: string) => { const d = String(iso || "").slice(0, 10).split("-"); return d.length === 3 ? d[2] + "/" + d[1] : ""; };
const fimDe = (slot: string, dur: number) => { const d = parseData(slot); d.setMinutes(d.getMinutes() + dur); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const fmtDur = (m: number) => m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) : "") : m + " min";
const fmtTel = (t: string) => { const d = String(t || "").replace(/\D/g, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d[2]}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t; };
const tam = (b: number | null) => !b ? "" : b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.round(b / 1024) + " KB";
const novaChave = () => Math.random().toString(36).slice(2, 9);

/** dias em que ESTE projetista atende o cliente (principal + adicionais que são dele) */
function diasDoProj(c: any, proj: string): { slot: string; dur: number; n: number; total: number; reserva?: boolean }[] {
  if (c.etapa === "aguardando") {
    const l = [{ data: c.proposta, duracaoMin: c.duracaoMin }, ...(Array.isArray(c.propostaDiasExtras) ? c.propostaDiasExtras : [])].filter(x => x.data);
    return l.map((x, i) => ({ slot: String(x.data).slice(0, 16), dur: Number(x.duracaoMin) || Number(c.duracaoMin) || 120, n: i + 1, total: l.length, reserva: true }));
  }
  const ex: any[] = Array.isArray(c.diasExtras) ? c.diasExtras : [];
  const todos = [{ slot: String(c.agendadoPara || "").slice(0, 16), dur: Number(c.duracaoMin) || 120, proj: c.projetista || "" },
    ...ex.map(e => ({ slot: String(e.data || "").slice(0, 16), dur: Number(e.duracaoMin) || Number(c.duracaoMin) || 120, proj: e.projetista || c.projetista || "" }))]
    .filter(d => d.slot).sort((a, b) => a.slot.localeCompare(b.slot));
  return todos.map((d, i) => ({ ...d, n: i + 1, total: todos.length })).filter(d => proj === "*" || d.proj === proj);
}
const bairroCidade = (c: any) => { const l = c.local || {}; return [cap(l.bairro), cap(l.cidade)].filter(Boolean).join(", "); };
const endereco = (c: any) => { const l = c.local || {}; return [l.endereco || l.rua, l.numero, l.complemento, cap(l.bairro), cap(l.cidade)].filter(Boolean).join(" · "); };
const termoFinal = (c: any) => !!(c.termo && c.termo.finalizadoEm);
const feito = (c: any) => c.etapa === "realizado" || c.status === "concluida";

/** o que ainda falta conferir num ambiente (fica em amarelo; a impressão só libera sem nada em amarelo) */
export function conferirAmb(a: AmbTermo): string[] {
  const out: string[] = [];
  if (!a.caixa?.mat) out.push("material das caixas");
  if (!a.caixa?.esp) out.push("espessura das caixas");
  if (!a.porta?.naoSeAplica) { if (!a.porta?.mat && !a.porta?.vidro) out.push("material das portas"); if (!a.porta?.esp && !a.porta?.vidro) out.push("espessura das portas"); }
  const cor = String(a.cor || "").trim();
  if (!cor) out.push("nome da cor / padrão");
  else if (/^(c[óo]d\.?\s*\d+\s*(·\s*)?)+$/i.test(cor) || /^\d{2,4}$/.test(cor)) out.push("nome da cor (não o código)");
  return out;
}
const fichaDe = (a: any) => FICHA_AMBIENTE.map(k => [k, (a.ficha || {})[k]] as [string, boolean | null | undefined]);
const fichaOk = (a: any) => fichaDe(a).every(([, v]) => v === true || (v === false && String(a.fichaObs || "").trim().length > 2));

/** termo de ciência sozinho (botão "📄 Termo" no cartão do setor Checklist) */
export function abrirTermo(c: any, termo: any, projetista: string, toast?: (m: string) => void) {
  const dataRef = termo.finalizadoEm || c.agendadoPara || new Date().toISOString();
  const d: DadosTermo = {
    venda: String(c.pedido || ""), cliente: String(c.cliente || ""), endereco: endereco(c) || "—", vendedor: cap(c.vendedor || "") || "—",
    projetista: projetista || "—", data: fmtDate(String(dataRef).slice(0, 10)),
    ambientes: (termo.ambientes || []).map((a: AmbTermo) => ({ ...a, conferir: conferirAmb(a) })),
    naoInclusos: termo.naoInclusos || [], obs: termo.obs || "", ferragens: termo.ferragens || [], arquivoListagem: (termo.arquivos || []).join(", "),
  };
  const w = window.open("", "_blank");
  if (!w) { toast?.("Libere as janelas (pop-up) do navegador para abrir o termo"); return; }
  w.document.write(termoHtml(d)); w.document.close(); setTimeout(() => w.print(), 400);
}

// ---------------- estilos (mesmo desenho dos mockups, com as cores do 360) ----------------
const CSS = `
.pj .pjbusca{width:100%;padding:11px 14px;border:1px solid var(--pj-l);border-radius:12px;font:inherit;background:var(--pj-bg,#fff);color:inherit;margin-bottom:14px}
.pj .pjkpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}@media (max-width:800px){.pj .pjkpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.pj .pjkpi{background:var(--pj-bg,#fff);border:1px solid var(--pj-l);border-radius:14px;padding:16px 18px;cursor:pointer;box-shadow:0 1px 2px rgba(20,28,45,.05)}.pj .pjkpi b{display:block;font-size:28px;line-height:1.1}.pj .pjkpi span{color:var(--pj-s);font-size:13px}.pj .pjkpi.alerta b{color:#b42318}
.pj .pjtabs{display:flex;align-items:center;flex-wrap:wrap;gap:4px;background:var(--pj-l2);border-radius:12px;padding:4px;margin-bottom:12px;width:fit-content;max-width:100%}.pj .pjtabs>button{border:0;background:none;padding:8px 14px;border-radius:9px;font-weight:600;color:var(--pj-s);cursor:pointer}.pj .pjtabs>button.on{background:var(--pj-bg,#fff);color:inherit;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.pj .pjrows{display:flex;flex-direction:column;gap:10px}
.pj .pjrow{display:flex;gap:14px;align-items:flex-start;background:var(--pj-bg,#fff);border:1px solid var(--pj-l);border-left:5px solid var(--cor);border-radius:14px;padding:12px 14px;box-shadow:0 1px 2px rgba(20,28,45,.05)}.pj .pjrow.res{background:#fffaf0}
.pj .pjdata{color:#fff;border-radius:10px;min-width:86px;text-align:center;padding:7px 8px;line-height:1.15}.pj .pjdata small{display:block;font-size:10.5px;font-weight:800;letter-spacing:.8px;opacity:.9}.pj .pjdata b{display:block;font-size:21px}.pj .pjdata span{font-weight:800;font-size:15px}
.pj .pjinfo{flex:1;min-width:0}.pj .pjl1{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.pj .pjl1>b{font-size:15.5px;margin-right:2px}.pj .pjtag{border:1px solid var(--pj-l);border-radius:6px;padding:1px 7px;font-size:12px;font-weight:700}.pj .pjtag.loc{background:#1f5f8b;color:#fff;border-color:transparent}
.pj .pjl2{display:flex;flex-wrap:wrap;gap:4px 14px;color:var(--pj-f);font-size:12.5px;margin:5px 0}.pj .pjl2 b{color:var(--pj-s);font-weight:600}.pj .pjl3{display:flex;flex-wrap:wrap;gap:4px}
.pj .pjacts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}@media (max-width:700px){.pj .pjrow{flex-wrap:wrap}.pj .pjacts{width:100%;justify-content:flex-start}}
.pj{--pj-pri:var(--primary,#284b8f);--pj-soft:var(--primary-soft,#eaf0fb);--pj-ok:#3f8f4f;--pj-okbg:#e6f4e9;--pj-w:#8a5d00;--pj-wbg:#faf1df;--pj-l:var(--line,#e0e3e8);--pj-l2:var(--line-soft,#eceef1);--pj-s:var(--ink-soft,#5a6270);--pj-f:var(--ink-faint,#8b94a3);--pj-bg:var(--surface,#fff);--pj-bg2:var(--surface-2,#f7f8f9)}
.pj .pjtop{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}.pj .pjtop h2{font-size:20px;margin:0}.pj .pjtop .sub{color:var(--pj-s)}
.pj .pjchip{background:var(--pj-bg);border:1px solid var(--pj-l);border-radius:999px;padding:5px 12px;font-weight:600;font-size:12.5px;white-space:nowrap}
.pj .pjchip.b{background:var(--pj-soft);color:var(--pj-pri);border-color:transparent}.pj .pjchip.g{background:var(--pj-okbg);color:var(--pj-ok);border-color:transparent}.pj .pjchip.w{background:var(--pj-wbg);color:var(--pj-w);border-color:transparent}
.pj .nav{display:inline-flex;align-items:center;border:1px solid var(--pj-l);border-radius:999px;background:var(--pj-bg);overflow:hidden}.pj .nav button{border:0;background:none;padding:5px 10px;font-weight:700;cursor:pointer;color:inherit}.pj .nav button:hover{background:var(--pj-bg2)}
.pj .pjgrid{display:grid;grid-template-columns:330px 1fr;gap:16px;align-items:start}
@media (max-width:1100px){.pj .pjgrid{grid-template-columns:1fr}.pj .body{grid-template-columns:1fr!important}}
.pj .cardx{background:var(--pj-bg);border:1px solid var(--pj-l);border-radius:12px;box-shadow:0 1px 2px rgba(20,28,45,.05),0 4px 16px rgba(20,28,45,.06)}
.pj .lista{padding:12px;position:sticky;top:8px;max-height:calc(100vh - 120px);overflow:auto}
.pj .dia{font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--pj-f);font-weight:800;margin:6px 4px 8px}
.pj .pjit{border:1px solid var(--pj-l2);border-left:4px solid var(--cor,#d6336c);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--pj-bg);cursor:pointer}
.pj .pjit:hover{border-color:var(--pj-pri)}.pj .pjit.on{border-color:var(--pj-pri);border-left-color:var(--pj-pri);background:var(--pj-soft)}
.pj .pjit.res{border-left-color:#c98a12;background:#fffaf0}.pj .pjit.pjok{border-left-color:var(--pj-ok)}
.pj .pjit .pjh{display:flex;justify-content:space-between;font-weight:800}.pj .pjit .pjh span{color:var(--pj-pri)}.pj .pjit.res .pjh span{color:var(--pj-w)}
.pj .pjit .pjn{font-weight:700;margin:2px 0}.pj .pjit .m{color:var(--pj-s);font-size:12px}
.pj .pjpill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700;margin-top:5px;margin-right:4px}
.pj .p-ok{background:var(--pj-okbg);color:var(--pj-ok)}.pj .p-w{background:var(--pj-wbg);color:var(--pj-w)}.pj .p-b{background:var(--pj-soft);color:var(--pj-pri)}.pj .p-g{background:#eef1f6;color:#3b4558}.pj .p-r{background:#fdecec;color:#b42318}
.pj .ficha{display:flex;flex-direction:column;overflow:hidden;min-width:0}
.pj .fh{padding:16px 20px;border-bottom:1px solid var(--pj-l2);display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
.pj .fh h3{margin:0 0 4px;font-size:19px}.pj .fh .pjmeta{color:var(--pj-s);font-size:12.5px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px 18px}
@media (max-width:700px){.pj .fh .pjmeta{grid-template-columns:1fr}}
.pj .fh .pjmeta b{color:var(--ink,#1a1d21)}
.pj .acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;max-width:300px;margin-left:auto}.pj .acts .selo{white-space:normal;text-align:center}
.pj .selo{background:var(--pj-soft);color:var(--pj-pri);border-radius:8px;padding:7px 12px;font-weight:700;font-size:12.5px;white-space:nowrap}
.pj .tabs{display:flex;gap:4px;padding:10px 20px 0;border-bottom:1px solid var(--pj-l2);overflow-x:auto}
.pj .tab{padding:9px 14px;border-radius:8px 8px 0 0;font-weight:700;color:var(--pj-s);cursor:pointer;border:0;background:none;white-space:nowrap;border-bottom:3px solid transparent}.pj .tab.on{color:var(--pj-pri);border-bottom-color:var(--pj-pri)}
.pj .tab .c{background:#eef1f6;color:#3b4558;border-radius:999px;padding:0 7px;font-size:11px;margin-left:5px}
.pj .body{padding:16px 20px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px}
.pj .sec{font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--pj-s);margin:2px 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pj .sec .src{font-weight:700;text-transform:none;letter-spacing:0;font-size:11px;padding:1px 8px;border-radius:999px}
.pj .files{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:18px}
.pj .pjf{border:1px solid var(--pj-l);border-radius:10px;overflow:hidden;background:var(--pj-bg);cursor:pointer}.pj .pjf:hover{border-color:var(--pj-pri)}
.pj .th{height:104px;display:flex;align-items:center;justify-content:center;font-size:30px;color:#fff;position:relative;background:linear-gradient(135deg,#c9b79c,#8d7a5f);overflow:hidden}
.pj .th img{width:100%;height:100%;object-fit:cover}.pj .th.pdf{background:#fff3f2;color:#c23b3b}.pj .th.promob{background:#eef3ff;color:#284b8f}.pj .th.outro{background:#eef1f6;color:#3b4558}
.pj .th .pjtag{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;font-weight:800;border-radius:5px;padding:1px 6px}
.pj .pjf .pjfi{padding:7px 9px;font-size:12px}.pj .pjf .pjfi b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pj .pjf .pjfi span{color:var(--pj-f);font-size:11px}.pj .pjf .pjfi .a{float:right;color:var(--pj-pri);font-weight:800;font-size:11px}
.pj .pjmini{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:8px}.pj .pjmini .th{height:68px;border-radius:8px;font-size:18px;cursor:pointer}
.pj .note{background:var(--pj-bg2);border:1px dashed var(--pj-l);border-radius:10px;padding:10px 12px;color:var(--pj-s);font-size:12.5px}
.pj .box{border:1px solid var(--pj-l);border-radius:12px;padding:12px 14px;margin-bottom:12px;background:var(--pj-bg)}.pj .box h4{margin:0 0 8px;font-size:13px}
.pj .ck label{display:flex;gap:8px;align-items:center;padding:4px 0;font-size:12.5px}
.pj .ck i{width:16px;height:16px;border-radius:4px;border:2px solid var(--pj-ok);display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:11px;color:#fff;background:var(--pj-ok);flex:none}.pj .ck i.no{background:var(--pj-bg);border-color:var(--pj-l)}
.pj .drop{border:2px dashed #b9c6e2;border-radius:12px;padding:14px;text-align:center;color:var(--pj-pri);font-weight:700;background:var(--pj-soft);font-size:12.5px;cursor:pointer}.pj .drop.over{border-color:var(--pj-pri);background:#dbe6fb}
.pj .pjhist{font-size:12px;color:var(--pj-s)}.pj .pjhist div{padding:4px 0;border-bottom:1px solid var(--pj-l2)}.pj .pjhist b{color:var(--ink,#1a1d21)}
.pj .steps5{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-bottom:14px}.pj .body>div{min-width:0}
@media (max-width:800px){.pj .steps5{grid-template-columns:repeat(2,minmax(0,1fr))}}
.pj .stp{border:1px solid var(--pj-l);border-radius:10px;padding:7px 6px;font-weight:700;font-size:11.5px;line-height:1.25;min-width:0;flex-direction:column;justify-content:center;text-align:center!important;gap:4px!important;color:var(--pj-s);background:var(--pj-bg);display:flex;gap:8px;align-items:center;cursor:pointer;text-align:left}
.pj .stp span{width:22px;height:22px;border-radius:50%;background:#eef1f6;color:#3b4558;display:inline-flex;align-items:center;justify-content:center;font-weight:900;flex:none}
.pj .stp.done{background:var(--pj-okbg);color:var(--pj-ok);border-color:transparent}.pj .stp.done span{background:var(--pj-ok);color:#fff}
.pj .stp.on{background:var(--pj-soft);color:var(--pj-pri);border-color:var(--pj-pri)}.pj .stp.on span{background:var(--pj-pri);color:#fff}
.pj .alert{background:var(--pj-wbg);border:1px solid #f0d9a6;color:#6b4a00;border-radius:10px;padding:9px 12px;font-size:12.5px;margin-bottom:12px}
.pj .inp{display:flex;align-items:center;gap:10px;border:2px solid var(--pj-pri);border-radius:10px;padding:5px 6px 5px 12px;background:var(--pj-bg);margin-bottom:8px}.pj .inp input{flex:1;border:0;outline:0;background:none;padding:4px 0;font-size:13.5px;min-width:0}
.pj .pjchips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}.pj .pjchips .lbl{font-size:11.5px;color:var(--pj-s);margin-right:2px}
.pj .cp{border:1px solid var(--pj-l);border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;background:var(--pj-bg);color:#3b4558;cursor:pointer}.pj .cp.used{background:var(--pj-okbg);color:var(--pj-ok);border-color:transparent}
.pj .amblist{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media (max-width:800px){.pj .amblist{grid-template-columns:1fr}}
.pj .am{border:1px solid var(--pj-l);border-radius:10px;padding:9px 11px;background:var(--pj-bg)}.pj .am.drag{opacity:.4}.pj .am.alvo{border-color:var(--pj-pri);box-shadow:0 0 0 2px var(--pj-soft)}
.pj .am .pjh{display:flex;align-items:center;gap:8px;font-weight:800}.pj .am .pjh .pjx{margin-left:auto;color:var(--pj-f);font-weight:600;font-size:13px;cursor:pointer;border:0;background:none}
.pj .am .in{border:1px solid #c9d3e6;border-radius:6px;padding:3px 8px;font-weight:700;flex:1;background:#fbfcff;min-width:0}
.pj .am .m2{color:var(--pj-s);font-size:11.5px;margin-top:5px}.pj .lk{color:var(--pj-pri);font-weight:700;cursor:pointer;border:0;background:none;padding:0;font-size:inherit}
.pj .orig{font-size:10.5px;font-weight:800;border-radius:999px;padding:1px 7px;font-style:normal;cursor:grab}
.pj .pjab{border:1px solid var(--pj-l);border-radius:10px;padding:10px 12px;margin-bottom:12px;background:var(--pj-bg)}.pj .pjab.am-w{border-left:4px solid #c98a12}.pj .pjab.am-ok{border-left:4px solid var(--pj-ok)}
.pj .pjab h5{margin:0 0 8px;font-size:14px;display:flex;gap:8px;align-items:center}.pj .pjab h5 .pjpill{margin:0 0 0 auto}
.pj .seg{display:inline-flex;border:1px solid var(--pj-l);border-radius:7px;overflow:hidden;vertical-align:middle}.pj .seg button{border:0;background:var(--pj-bg);font-size:12px;font-weight:800;padding:4px 10px;color:var(--pj-s);cursor:pointer}.pj .seg button+button{border-left:1px solid var(--pj-l)}.pj .seg button.on{background:var(--pj-pri);color:#fff}
.pj .lbl2{font-size:11px;color:var(--pj-f);text-transform:uppercase;letter-spacing:.4px;font-weight:800;margin-bottom:4px}
.pj .mat{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:10px}
.pj .pjrow{display:flex;align-items:center;gap:8px;border:1px solid var(--pj-l);border-radius:9px;padding:5px 10px;background:var(--pj-bg);font-size:12.5px;margin-bottom:5px}.pj .pjrow b{flex:1;font-weight:600}.pj .pjrow.on{border-color:#9fc5a8;background:#f5fbf6}.pj .pjrow.no{border-color:#f0d9a6;background:#fffaf0}
.pj .yn{display:flex;border:1px solid var(--pj-l);border-radius:7px;overflow:hidden}.pj .yn button{border:0;font-size:11px;font-weight:800;padding:3px 9px;color:var(--pj-f);background:var(--pj-bg);cursor:pointer}.pj .yn button.y{background:var(--pj-ok);color:#fff}.pj .yn button.pjn{background:#e9ecf1;color:#3b4558}
.pj .obsw{background:var(--pj-wbg);color:#6b4a00;border-radius:8px;padding:6px 8px;font-size:12px;margin-top:6px}
.pj .imp{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border:1px solid var(--pj-l);border-radius:10px;padding:10px 12px;flex-wrap:wrap}.pj .imp b{display:block}.pj .imp>div>span{color:var(--pj-f);font-size:11.5px}
.pj .inc{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:6px;font-size:12px;color:var(--pj-ok);font-weight:600}
.pj .pjthumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.pj .pjthumbs .th{width:70px;height:52px;border-radius:6px;font-size:16px}
.pj .barra{position:sticky;bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;margin-top:12px;border:1px solid var(--pj-l);border-radius:10px;background:var(--pj-bg);box-shadow:0 4px 18px rgba(0,0,0,.12)}
`;

type Arqs = { venda: any[]; medicao: any[]; m360: any[]; ck: any[]; outrosTicket: any[]; avisos: string[]; ticketId: number | null; dados?: any };

export default function ProjetistaChecklist() {
  const { toast, st } = useApp() as any;
  const [eu, setEu] = useState<{ projetista: string | null; podeTodos: boolean; projetistas: string[] } | null>(null);
  const [proj, setProj] = useState("");
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState("");
  const hj = hojeISO();
  const [dia, setDia] = useState(hj);
  const [sel, setSel] = useState<string | null>(null);
  const sujo = useRef(false);
  const segura = Number(st?.config?.checklistAgenda?.seguraDias ?? 2);

  useEffect(() => {
    A.ckProjetistaEu().then(r => {
      setEu(r);
      let salvo = ""; try { salvo = localStorage.getItem("a360-ck-proj") || ""; } catch { /* */ }
      setProj(r.podeTodos ? (salvo === "*" || r.projetistas.includes(salvo) ? salvo : "*") : r.projetista || "");
    }).catch((e: any) => setErro(e.message));
  }, []);
  const carregar = () => {
    if (!proj) return;
    setErro("");
    return A.ckProjetistaAgenda(proj, somaDias(hj, -45), somaDias(hj, 60)).then(l => setLista(l || [])).catch((e: any) => { setErro(e.message); setLista([]); });
  };
  useEffect(() => { setLista(null); carregar(); }, [proj]);

  // listas da tela inicial: dia escolhido, próximos, a finalizar (data passou sem termo) e realizados com termo
  const { doDia, proximos, pendentes, realizados } = useMemo(() => {
    const ent: { c: any; slot: string; dur: number; n: number; total: number; reserva?: boolean }[] = [];
    (lista || []).forEach(c => diasDoProj(c, proj).forEach(d => ent.push({ c, ...d })));
    ent.sort((a, b) => a.slot.localeCompare(b.slot));
    const doDia = ent.filter(e => e.slot.slice(0, 10) === dia);
    const vistos = new Set<string>();
    const proximos = ent.filter(e => { const d = e.slot.slice(0, 10); if (d <= hj || vistos.has(e.c.id) || feito(e.c)) return false; vistos.add(e.c.id); return true; });
    const pendentes = (lista || []).filter(c => c.etapa !== "aguardando" && !termoFinal(c)
        && (feito(c) ? !!c.termo?.iniciadoEm : diasDoProj(c, proj).every(d => d.slot.slice(0, 10) < hj)))
      .map(c => { const ds = diasDoProj(c, proj); const u = ds[ds.length - 1]; return u ? { c, ...u } : null; }).filter(Boolean) as typeof ent;
    const realizados = (lista || []).filter(c => termoFinal(c))
      .map(c => { const ds = diasDoProj(c, proj); const u = ds[ds.length - 1]; return u ? { c, ...u } : null; }).filter(Boolean)
      .sort((x: any, y: any) => String(y.c.termo?.finalizadoEm || "").localeCompare(String(x.c.termo?.finalizadoEm || ""))) as typeof ent;
    return { doDia, proximos, pendentes, realizados };
  }, [lista, proj, dia, hj]);
  const [aba, setAba] = useState<"dia" | "prox" | "fin" | "real">("dia");
  const [q, setQ] = useState("");
  const [verAgenda, setVerAgenda] = useState(false);
  const abrir = (id: string) => { sujo.current = false; setSel(id); window.scrollTo({ top: 0 }); };
  const voltar = () => { if (sujo.current && !confirm("Há alterações no checklist que não foram salvas. Voltar para a lista mesmo assim?")) return; sujo.current = false; setSel(null); carregar(); };

  if (erro && !eu) return <section className="view active"><div className="empty">{erro}</div></section>;
  if (!eu) return <section className="view active"><div className="empty">Carregando…</div></section>;
  if (!eu.projetista && !eu.podeTodos) return <section className="view active"><div className="view-head"><div><h2>Área do projetista</h2></div></div>
    <div className="card" style={{ padding: 18 }}>Seu usuário tem o acesso de projetista do checklist, mas o nome dele não bate com nenhum projetista da agenda do checklist. Peça para a Gestão conferir o nome no cadastro (tem que ser igual ao da lista de projetistas da agenda).</div></section>;

  const atual = sel ? (lista || []).find(c => c.id === sel) : null;
  // ---------- cliente aberto: ficha em tela cheia ----------
  if (atual) return (
    <section className="view active pj" id="view-projetista-ck">
      <style>{CSS}</style>
      <div className="pjtop">
        <button className="btn sm" onClick={voltar}>← Voltar para a lista</button>
        <span className="sub">{eu.podeTodos ? "Projetista: " + proj : "Minha agenda de checklist"}</span>
      </div>
      <Ficha key={atual.id} c={atual} proj={proj} recarregar={carregar} setSujo={(v: boolean) => (sujo.current = v)} toast={toast} />
    </section>
  );

  if (verAgenda) return <section className="view active pj" id="view-projetista-ck"><style>{CSS}</style>
    <div className="pjtop"><button className="btn sm" onClick={() => setVerAgenda(false)}>← Voltar para a lista</button><h2 style={{ marginLeft: 6 }}>Agenda geral do checklist</h2><span className="sub">todos os projetistas · só visualização</span></div>
    <AgendaGeral eu={eu.projetista} /></section>;

  // ---------- tela inicial: visão geral ----------
  const naoRes = doDia.filter(e => !e.reserva);
  const dLonga = dia === hj ? "Hoje" : (() => { const d = parseData(dia + "T12:00"); return cap(DIAS[d.getDay()]) + ", " + d.toLocaleDateString("pt-BR"); })();
  const qn = semAcento(q.trim()), qd = q.replace(/\D/g, "");
  const achados = !qn ? [] : (lista || []).filter(c => semAcento(c.cliente).includes(qn) || (qd.length >= 3 && (String(c.pedido || "").includes(qd) || String(c.telefone || "").replace(/\D/g, "").includes(qd) || String(c.telefone2 || "").replace(/\D/g, "").includes(qd))))
    .map(c => { const ds = diasDoProj(c, proj); const u = ds.find(d => d.slot.slice(0, 10) >= hj) || ds[ds.length - 1]; return u ? { c, ...u } : null; }).filter(Boolean) as typeof doDia;
  const itens = qn ? achados : aba === "dia" ? doDia : aba === "prox" ? proximos : aba === "fin" ? pendentes : realizados;
  const vazio = qn ? "Nenhum cliente encontrado para “" + q + "” (busca nos últimos 45 dias e próximos 60)." : aba === "dia" ? "Nenhum checklist neste dia." : aba === "prox" ? "Nenhum checklist nos próximos dias." : aba === "fin" ? "Nada para finalizar. 👏" : "Nenhum checklist realizado com termo ainda.";
  return (
    <section className="view active pj" id="view-projetista-ck">
      <style>{CSS}</style>
      <div className="pjtop" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h2>Área do projetista</h2>
          <div className="sub" style={{ marginTop: 4, maxWidth: 620 }}>Os clientes do checklist {eu.podeTodos ? (proj === "*" ? "de todos os projetistas" : "de " + proj) : "da sua agenda"}. Clique em <b>Fazer checklist</b> para abrir o cliente: arquivos da venda, medição e as etapas do checklist (sem valores).</div>
        </div>
        {eu.podeTodos && <select value={proj} onChange={e => { setSel(null); setProj(e.target.value); try { localStorage.setItem("a360-ck-proj", e.target.value); } catch { /* */ } }} style={{ width: "auto", minWidth: 200 }} title="Projetista (Gestão / setor Checklist)">
          <option value="*">👥 Todos os projetistas</option>
          {eu.projetistas.map(n => <option key={n} value={n}>{n}{n === eu.projetista ? " (eu)" : ""}</option>)}</select>}
        <button className="btn sm" onClick={() => setVerAgenda(true)} title="Agenda de todos os projetistas (só visualização)">📅 Agenda geral</button>
        <button className="btn ghost sm" onClick={() => carregar()} title="Atualizar">↻ Atualizar</button>
      </div>
      <input className="pjbusca" value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Buscar cliente por nome, nº da venda ou telefone" />
      {qn ? <div className="sub" style={{ margin: "-4px 0 10px" }}>{achados.length} cliente{achados.length === 1 ? "" : "s"} encontrado{achados.length === 1 ? "" : "s"} · <button className="lk" onClick={() => setQ("")}>limpar busca</button></div> : <>
      <div className="pjkpis">
        <div className="pjkpi" onClick={() => { setDia(hj); setAba("dia"); }}><b>{doDia.filter(e => !e.reserva).length}</b><span>{dia === hj ? "hoje" : "no dia " + ddmm(dia)}</span></div>
        <div className="pjkpi" onClick={() => setAba("prox")}><b>{proximos.filter(e => !e.reserva).length}</b><span>próximos</span></div>
        <div className={"pjkpi" + (pendentes.length ? " alerta" : "")} onClick={() => setAba("fin")}><b>{pendentes.length}</b><span>a finalizar</span></div>
        <div className="pjkpi" onClick={() => setAba("real")}><b>{realizados.length}</b><span>realizados com termo</span></div>
      </div>
      <div className="pjtabs">
        <button className={aba === "dia" ? "on" : ""} onClick={() => setAba("dia")}>{dLonga} ({doDia.length})</button>
        <button className={aba === "prox" ? "on" : ""} onClick={() => setAba("prox")}>Próximos ({proximos.length})</button>
        <button className={aba === "fin" ? "on" : ""} onClick={() => setAba("fin")}>A finalizar ({pendentes.length})</button>
        <button className={aba === "real" ? "on" : ""} onClick={() => setAba("real")}>Realizados ({realizados.length})</button>
        {aba === "dia" && <span className="nav" style={{ marginLeft: 8 }}><button onClick={() => setDia(somaDias(dia, -1))} title="Dia anterior">◀</button><button onClick={() => setDia(hj)}>Hoje</button><button onClick={() => setDia(somaDias(dia, 1))} title="Próximo dia">▶</button></span>}
        {aba === "dia" && naoRes.length > 0 && <span className="sub" style={{ marginLeft: 8 }}>{naoRes.filter(e => e.c.confirmacao === "confirmada").length} de {naoRes.length} com presença confirmada</span>}
      </div>
      </>}
      {lista === null ? <div className="empty">Carregando…</div>
        : itens.length ? <div className="pjrows">{itens.map(e => <LinhaCliente key={e.c.id + e.slot} e={e} hj={hj} segura={segura} todos={proj === "*"} onAbrir={() => abrir(e.c.id)} />)}</div>
        : <div className="cardx" style={{ padding: 26, textAlign: "center", color: "var(--ink-faint)" }}>{vazio}</div>}
      {erro && <div className="empty">{erro}</div>}
    </section>
  );
}

/** linha da tela inicial (cartão largo: data · cliente · selos · botões) */
function LinhaCliente({ e, hj, segura, todos, onAbrir }: { e: any; hj: string; segura: number; todos?: boolean; onAbrir: () => void }) {
  const c = e.c, t = c.termo || {}, d = e.slot.slice(0, 10);
  const ambs = (t.ambientes || []).map((a: any) => a.nome).filter(Boolean);
  const tel = sanitizeWhats(c.telefone || c.telefone2 || "");
  const rot = d === hj ? "HOJE" : d === somaDias(hj, 1) ? "AMANHÃ" : d === somaDias(hj, -1) ? "ONTEM" : DIAS[parseData(d + "T12:00").getDay()].slice(0, 3).toUpperCase();
  const cor = e.reserva ? "#c98a12" : feito(c) ? "#3f8f4f" : d < hj ? "#b42318" : d === hj ? "#3f8f4f" : "var(--primary,#284b8f)";
  const lib = e.reserva && c.ultimoContato ? (() => { const x = new Date(c.ultimoContato); x.setDate(x.getDate() + segura); return x; })() : null;
  return <div className={"pjrow" + (e.reserva ? " res" : "")} style={{ ["--cor" as any]: cor }}>
    <div className="pjdata" style={{ background: cor }}><small>{rot}</small><b>{ddmm(d)}</b><span>{hm(e.slot)}</span></div>
    <div className="pjinfo">
      <div className="pjl1"><b>{c.cliente}</b><span className="pjtag">Venda {c.pedido}</span>{bairroCidade(c) && <span className="pjtag loc">📍 {bairroCidade(c)}</span>}{e.total > 1 && <span className="pjtag">dia {e.n}/{e.total}</span>}{todos && <span className="pjtag" style={{ background: "#efe9fb", color: "#5b3c99", borderColor: "transparent" }}>👷 {e.reserva ? c.propostaProjetista || c.projetista : c.projetista}</span>}</div>
      <div className="pjl2">{c.vendedor && <span>Vendedor <b>{cap(c.vendedor)}</b></span>}{(c.telefone || c.telefone2) && <span>Tel. <b>{fmtTel(c.telefone || c.telefone2)}</b></span>}<span>Duração <b>{fmtDur(e.dur)}</b></span>{ambs.length > 0 && <span>Ambientes <b>{ambs.join(", ")}</b></span>}</div>
      <div className="pjl3">
        {e.reserva ? <span className="pjpill p-w">⏳ Reserva · aguardando resposta{lib ? " · libera sozinha em " + fmtDateTime(lib.toISOString()) : ""}</span>
          : feito(c) ? <span className="pjpill p-ok">✅ Realizado{termoFinal(c) ? " · termo assinado" : " · falta o termo"}</span>
          : c.confirmacao === "confirmada" ? <span className="pjpill p-ok">✅ Presença confirmada</span> : <span className="pjpill p-w">⏳ Presença a confirmar</span>}
        {t.iniciadoEm && !feito(c) && <span className="pjpill p-b">⏱ em andamento</span>}
        {!e.reserva && (!c.medida ? <span className="pjpill p-g">⚠️ sem medição no 360</span> : c.medida.etapa !== "liberada" ? <span className="pjpill p-w">📐 {MEDIDA_CURTA[c.medida.etapa] || c.medida.etapa}</span> : null)}
        {c.encaixe && <span className="pjpill p-r">⚠️ encaixe</span>}
      </div>
    </div>
    <div className="pjacts">
      <button className="btn sm" style={{ background: "var(--primary,#284b8f)", color: "#fff", borderColor: "var(--primary,#284b8f)" }} onClick={onAbrir}>{e.reserva ? "👁 Ver" : feito(c) ? "📂 Abrir" : "📋 Fazer checklist"}</button>
      {tel && <button className="btn sm" style={{ background: "var(--wa,#1fa855)", color: "#fff", borderColor: "var(--wa,#1fa855)" }} onClick={() => abrirWhats("https://wa.me/" + tel)}>💬 WhatsApp</button>}
    </div>
  </div>;
}


// ---------------- cliente e venda (dados do Exact; valores só para o projetista — nunca saem na impressão do cliente) ----------------
const brl = (n: number | null | undefined) => n == null || isNaN(Number(n)) ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function DadosVenda({ d, carregando, erro, c }: { d: any; carregando: boolean; erro: string; c: any }) {
  if (carregando) return <div className="body" style={{ gridTemplateColumns: "1fr" }}><div className="empty">Buscando os dados da venda no Exact…</div></div>;
  if (!d) return <div className="body" style={{ gridTemplateColumns: "1fr" }}><div className="note">Não foi possível trazer os dados da venda do Exact{erro ? " (" + erro + ")" : ""}. Confira se a venda {c.pedido} já tem ticket de checklist no Exact.</div></div>;
  const v = d.venda || {}, cl = d.cliente || {}, ps: any[] = d.produtos || [];
  const cupom = (n: string) => /^#?\s*cupom/i.test(n);
  const nCupom = ps.filter(p => cupom(p.nome)).length, nPronta = ps.length - nCupom;
  const soma = (k: string, f?: (p: any) => boolean) => ps.filter(f || (() => true)).reduce((t, p) => t + (Number(p[k]) || 0), 0);
  const tetoCupons = soma("negociado", p => cupom(p.nome));
  const linha = (r: string, val: ReactNode) => <div className="dv-l"><span>{r}</span><b>{val}</b></div>;
  return <div className="body" style={{ gridTemplateColumns: "minmax(0,1fr) 320px" }}>
    <style>{`.pj .dv-card{border:1px solid var(--pj-l);border-radius:12px;padding:12px 14px;margin-bottom:14px;background:var(--pj-bg,#fff)}.pj .dv-card h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:var(--pj-s)}
.pj .dv-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 18px}@media (max-width:900px){.pj .dv-grid{grid-template-columns:1fr}}
.pj .dv-l{display:flex;flex-direction:column;font-size:12.5px}.pj .dv-l span{color:var(--pj-f);font-size:11.5px}.pj .dv-l b{font-weight:600}
.pj .dv-teto{border-radius:12px;padding:14px 16px;background:linear-gradient(135deg,#1f3a7a,#284b8f);color:#fff;margin-bottom:14px}.pj .dv-teto small{opacity:.85;font-weight:700;letter-spacing:.5px;text-transform:uppercase;font-size:11px}.pj .dv-teto b{display:block;font-size:28px;margin:2px 0}.pj .dv-teto div{font-size:12.5px;opacity:.92}
.pj .dv-tab{width:100%;border-collapse:collapse;font-size:13px}.pj .dv-tab th{text-align:left;font-size:11.5px;color:var(--pj-s);background:var(--pj-l2);padding:7px 8px}.pj .dv-tab td{padding:7px 8px;border-top:1px solid var(--pj-l2)}.pj .dv-tab .n{text-align:right;white-space:nowrap}.pj .dv-tab tfoot td{font-weight:800;border-top:2px solid var(--pj-l)}
.pj .dv-tag{font-size:10.5px;font-weight:800;border-radius:999px;padding:1px 7px;margin-left:6px}.pj .dv-tag.cp{background:#e8f1ff;color:#284b8f}.pj .dv-tag.lp{background:#fff1dc;color:#8a5d00}`}</style>
    <div>
      <div className="dv-card"><h4>👤 Cliente</h4><div className="dv-grid">
        {linha("Nome", cl.nome || c.cliente)}{linha("Telefone", [cl.telefone, cl.telefone2].filter(Boolean).map(fmtTel).join(" / ") || "—")}{linha("E-mail", cl.email || "—")}
        <div style={{ gridColumn: "1/-1" }}>{linha("Endereço (Exact)", (cl.endereco || "—") + (cl.cep ? " · CEP " + String(cl.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2") : ""))}</div>
      </div></div>
      <div className="dv-card"><h4>🧾 Venda</h4><div className="dv-grid">
        {linha("Código da venda", v.codigo || c.pedido)}{linha("Código do ticket", v.ticket ?? "—")}{linha("Vendedor", cap(v.vendedor || c.vendedor || "") || "—")}
        {linha("Situação no Exact", v.situacao || "—")}{linha("Situação da venda", v.situacaoVenda || "—")}{linha("100% promissória", v.promissoria100 ? "Sim" : "Não")}
        {linha("Valor total bruto", brl(v.bruto))}{linha("Valor total negociado", brl(v.negociado))}{linha("Percentual de desconto", v.descontoPct == null ? "—" : String(v.descontoPct).replace(".", ",") + " %")}
        {v.obraEmAndamento && <div style={{ gridColumn: "1/-1", color: "#8a5d00", fontWeight: 700 }}>⚠️ Cliente com obra em andamento</div>}
      </div></div>
      <div className="dv-card"><h4>📦 Produtos da venda <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>· {nCupom} cupo{nCupom === 1 ? "m" : "ns"} de planejado{nPronta ? " · " + nPronta + " de linha pronta" : ""}</span></h4>
        {ps.length ? <div style={{ overflowX: "auto" }}><table className="dv-tab"><thead><tr><th>Nome</th><th className="n">Qtd</th><th className="n">Vlr unit.</th><th className="n">Vlr total</th><th className="n">Vlr negociado</th></tr></thead>
          <tbody>{ps.map((p, i) => <tr key={i}><td>{p.nome}<span className={"dv-tag " + (cupom(p.nome) ? "cp" : "lp")}>{cupom(p.nome) ? "planejado" : "linha pronta"}</span></td><td className="n">{p.qtd}</td><td className="n">{brl(p.unitario)}</td><td className="n">{brl(p.total)}</td><td className="n"><b>{brl(p.negociado)}</b></td></tr>)}</tbody>
          <tfoot><tr><td>Total</td><td className="n">{ps.reduce((t, p) => t + (Number(p.qtd) || 0), 0)}</td><td /><td className="n">{brl(soma("total"))}</td><td className="n">{brl(soma("negociado"))}</td></tr></tfoot></table></div>
          : <div className="note">O Exact não trouxe produtos para esta venda.</div>}
      </div>
    </div>
    <div>
      <div className="dv-teto"><small>Teto para o projeto final</small><b>{brl(nCupom ? tetoCupons : v.negociado)}</b>
        <div>{nCupom ? "Valor negociado dos cupons de planejado" + (nPronta ? " (sem a linha pronta)" : "") : "Valor negociado da venda"}. O projeto final do checklist não pode passar disso — se o cliente pedir mudanças que aumentem o valor, a diferença precisa ser cobrada.</div></div>
      <div className="box"><h4>Resumo</h4><div className="hist">
        <div>Bruto <b>{brl(v.bruto)}</b></div><div>Desconto <b>{v.descontoPct == null ? "—" : String(v.descontoPct).replace(".", ",") + " %"}</b></div><div>Negociado <b>{brl(v.negociado)}</b></div>
        {nPronta > 0 && <div>Linha pronta (negociado) <b>{brl(soma("negociado", p => !cupom(p.nome)))}</b></div>}</div></div>
      <div className="hint">🔒 Valores só para conferência interna do checklist. Não aparecem na impressão nem em nada que vai para o cliente.</div>
    </div>
  </div>;
}


// ---------------- agenda geral (todos os projetistas) — SÓ LEITURA: o projetista vê, não edita ----------------
function AgendaGeral({ eu }: { eu: string | null }) {
  const hj = hojeISO();
  const [dia, setDia] = useState(hj);
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  useEffect(() => { setD(null); setErro("");
    sb.rpc("ck_agenda_geral", { p_de: dia, p_ate: dia }).then(({ data, error }: any) => { if (error) setErro(error.message); else setD(data); }); }, [dia]);
  const H0 = 8, H1 = 20, PX = 54;
  const min = (iso: string) => { const [h, m] = iso.slice(11, 16).split(":").map(Number); return h * 60 + m; };
  const top = (m: number) => (Math.max(H0 * 60, Math.min(H1 * 60, m)) - H0 * 60) / 60 * PX;
  const projs: string[] = d ? [...(d.projetistas || [])].sort((a: string, b: string) => (a === eu ? -1 : b === eu ? 1 : 0)) : [];
  const evs: any[] = d?.eventos || [], bls: any[] = d?.bloqueios || [];
  const dl = (() => { const x = parseData(dia + "T12:00"); return cap(DIAS[x.getDay()]) + ", " + x.toLocaleDateString("pt-BR"); })();
  const cor = (t: string) => t === "res" ? { background: "#ffe8a3", color: "#6b4a00", border: "1.5px dashed #c98a12" } : t === "feito" ? { background: "#e6f4e9", color: "#2f6f3c", border: "1px solid #9fc5a8" } : { background: "var(--primary,#284b8f)", color: "#fff", border: "0" };
  return <div>
    <div className="pjtop">
      <span className="nav"><button onClick={() => setDia(somaDias(dia, -1))}>◀</button><button onClick={() => setDia(hj)}>Hoje</button><button onClick={() => setDia(somaDias(dia, 1))}>▶</button></span>
      <b>{dl}</b>
      <span className="pjchip b">{evs.filter(e => e.tipo !== "res").length} atendimento{evs.filter(e => e.tipo !== "res").length === 1 ? "" : "s"}</span>
      {evs.some(e => e.tipo === "res") && <span className="pjchip w">{evs.filter(e => e.tipo === "res").length} reserva(s)</span>}
      <span className="sub">🔒 Só visualização — para mudar a agenda, fale com o suporte do checklist.</span>
    </div>
    {erro ? <div className="empty">{erro}</div> : !d ? <div className="empty">Carregando…</div> :
    <div className="cardx" style={{ overflowX: "auto", padding: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: `52px repeat(${projs.length}, minmax(130px, 1fr))`, minWidth: 52 + projs.length * 130 }}>
        <div />
        {projs.map(p => <div key={p} style={{ textAlign: "center", fontWeight: 800, padding: "6px 4px", borderBottom: "2px solid var(--pj-l)", color: p === eu ? "var(--primary,#284b8f)" : undefined }}>{p}{p === eu ? " (eu)" : ""}</div>)}
        <div style={{ position: "relative", height: (H1 - H0) * PX }}>
          {Array.from({ length: H1 - H0 + 1 }, (_, i) => <div key={i} style={{ position: "absolute", top: i * PX - 7, right: 6, fontSize: 11, color: "var(--pj-f)" }}>{String(H0 + i).padStart(2, "0")}:00</div>)}
        </div>
        {projs.map(p => <div key={p} style={{ position: "relative", height: (H1 - H0) * PX, borderLeft: "1px solid var(--pj-l2)", background: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX - 1}px, var(--pj-l2) ${PX - 1}px, var(--pj-l2) ${PX}px)` }}>
          {bls.filter(b => b.proj === p || !b.proj).map((b, i) => { const ini = b.inicio.slice(0, 10) < dia ? H0 * 60 : min(b.inicio), fim = b.fim.slice(0, 10) > dia ? H1 * 60 : min(b.fim);
            return <div key={"b" + i} title={b.motivo} style={{ position: "absolute", left: 2, right: 2, top: top(ini), height: Math.max(18, top(fim) - top(ini)), borderRadius: 6, background: "repeating-linear-gradient(45deg,#eceef1,#eceef1 6px,#e0e3e8 6px,#e0e3e8 12px)", color: "#5a6270", fontSize: 11.5, fontWeight: 700, padding: "3px 6px", overflow: "hidden" }}>🔒 {b.motivo || "Bloqueado"}</div>; })}
          {evs.filter(e => e.proj === p).map((e, i) => { const ini = min(e.inicio), fim = ini + (Number(e.dur) || 120);
            return <div key={i} title={e.cliente + " · venda " + e.pedido} style={{ position: "absolute", left: 3, right: 3, top: top(ini) + 1, height: Math.max(22, top(fim) - top(ini) - 2), borderRadius: 7, padding: "4px 7px", fontSize: 11.5, lineHeight: 1.25, overflow: "hidden", ...cor(e.tipo) }}>
              <b>{e.inicio.slice(11, 16)}</b> {e.tipo === "res" ? "⏳ reserva" : e.tipo === "feito" ? "✅" : ""}{e.encaixe ? " ⚠️ encaixe" : ""}<br /><b>{e.cliente}</b><br />Venda {e.pedido}{e.total > 1 ? " · dia " + e.n + "/" + e.total : ""}{[e.bairro, e.cidade].filter(Boolean).length ? <><br />{[cap(e.bairro), cap(e.cidade)].filter(Boolean).join(", ")}</> : null}
            </div>; })}
        </div>)}
      </div>
    </div>}
    <div className="hint" style={{ marginTop: 8 }}>Azul: agendado · verde: realizado · amarelo tracejado: reserva (horário oferecido, aguardando o cliente) · cinza listrado: bloqueio.</div>
  </div>;
}

// ---------------- ficha do cliente ----------------
type Img = { fonte: string; id?: string; url?: string; path?: string; nome: string };
type Amb = AmbTermo & { _k: string; origem?: string; escritoPor?: string; codigos?: string[]; ficha?: Record<string, boolean | null>; fichaObs?: string; obs?: string; imagens?: Img[]; listagens?: string[]; itensDe?: string | null };

function Ficha({ c, proj, recarregar, setSujo, toast }: { c: any; proj: string; recarregar: () => any; setSujo: (v: boolean) => void; toast: (m: string) => void }) {
  const { R, setModal } = useApp() as any;
  const me = R?.me?.()?.nome ? primeiroNome(R.me().nome) : proj;
  const t0 = c.termo || {};
  const [aba, setAba] = useState<"dados" | "venda" | "medicao" | "checklist" | "historico">(t0.iniciadoEm && !termoFinal(c) ? "checklist" : "dados");
  const [arqs, setArqs] = useState<Arqs | null>(null);
  const [arqErro, setArqErro] = useState("");
  const setVer = (a: any) => setModal(<Visualizar a={a} c={c} onFechar={() => setModal(null)} />);
  // estado do checklist (só os ambientes e a conferência ficam aqui; impressão/assinado/realizado vêm do banco)
  const [ambs, setAmbs] = useState<Amb[]>(() => (t0.ambientes || []).map((a: any) => ({ ...a, cor: /^(cód\.)/i.test(a.cor || "") ? "" : a.cor, _k: novaChave() })));
  const [confirmados, setConfirmados] = useState<boolean>(!!t0.ambientesConfirmados);
  const [naoInc, setNaoInc] = useState<string[]>(t0.naoInclusos || NAO_INCLUSOS_PADRAO);
  const [obs, setObs] = useState<string>(t0.obs || "");
  const [ferragens, setFerragens] = useState<string[]>(t0.ferragens || []);
  const [arquivos, setArquivos] = useState<string[]>(t0.arquivos || []);
  const [meta, setMeta] = useState<any>(t0.listagem || {});
  const [mudou, _setMudou] = useState(false);
  const setMudou = (v: boolean) => { _setMudou(v); setSujo(v); };
  const [ocupado, setOcupado] = useState("");

  const carregarArqs = () => { setArqErro(""); return A.ckArquivos(c.id).then(setArqs).catch((e: any) => { setArqErro(e.message); setArqs({ venda: [], medicao: [], m360: [], ck: [], outrosTicket: [], avisos: [], ticketId: null }); }); };
  useEffect(() => { carregarArqs(); }, [c.id]);
  useEffect(() => () => setSujo(false), []);

  const dados = (extra: any = {}) => ({
    ambientes: ambs.map(({ _k, ...a }) => ({ ...a, nome: a.nome.trim(), conferir: conferirAmb(a) })),
    ambientesConfirmados: confirmados, naoInclusos: naoInc, obs, ferragens, arquivos, listagem: meta, ...extra,
  });
  async function salvar(acao: "salvar" | "iniciar" | "impressao" | "assinado" | "realizado" = "salvar", extra: any = {}, ok = "Checklist salvo") {
    setOcupado(acao);
    try { await A.ckProjetistaSalvar(c.id, dados(extra), acao); setMudou(false); if (ok) toast(ok); await recarregar(); return true; }
    catch (e: any) { toast(e.message || "Não foi possível salvar"); return false; }
    finally { setOcupado(""); }
  }

  // etapas
  const e1 = ambs.length > 0 && ambs.every(a => a.nome.trim()) && confirmados;
  const e2 = e1 && ambs.every(a => !conferirAmb(a).length && fichaOk(a));
  const e3 = !!t0.impressao;
  const e4 = (t0.assinados || []).length > 0;
  const e5 = termoFinal(c);
  const etapaAtual = !e1 ? 1 : !e2 ? 2 : !e3 ? 3 : !e4 ? 4 : 5;
  const [etapa, setEtapa] = useState<number>(etapaAtual);

  const ds = diasDoProj(c, proj);
  const ref = ds.find(d => d.slot.slice(0, 10) >= hojeISO()) || ds[ds.length - 1];
  const tels = [c.telefone, c.telefone2].filter(Boolean);
  const nArqVenda = arqs ? arqs.venda.length : null, nMed = arqs ? arqs.medicao.length + arqs.m360.length : null;
  const reserva = c.etapa === "aguardando";
  const podeRealizar = e3 && e4 && !e5;

  async function marcarRealizado() {
    if (!podeRealizar) { setAba("checklist"); setEtapa(!e3 ? 3 : 4); toast(!e3 ? "Gere a impressão primeiro" : "Anexe o digitalizado assinado antes de marcar realizado"); return; }
    if (!confirm(`Marcar o checklist de ${c.cliente} como REALIZADO?\n\nO checklist fica realizado no 360 e o PDF assinado fica guardado na ficha.`)) return;
    await salvar("realizado", {}, "Checklist realizado ✅");
  }

  return (
    <section className="cardx ficha">
      <div className="fh">
        <div style={{ flex: 1, minWidth: 260 }}><h3>{c.cliente}</h3>
          <div className="pjmeta">
            <div>Venda <b>{c.pedido}</b></div>
            <div>Horário <b>{ref ? ddmm(ref.slot) + " · " + hm(ref.slot) + "–" + fimDe(ref.slot, ref.dur) : "—"}</b>{ref && ref.total > 1 ? " (dia " + ref.n + "/" + ref.total + ")" : ""}</div>
            <div>Ambientes {ambs.length ? <b style={t0.ambientes?.length ? undefined : { color: "#8a5d00" }}>{ambs.length > 3 ? ambs.length + " · escritos pelo checklist" : ambs.map(a => a.nome || "—").join(", ")}</b> : <b style={{ color: "#8a5d00" }}>não escritos</b>}</div>
            <div>Tel <b>{tels.length ? tels.map(fmtTel).join(" / ") : "—"}</b></div>
            <div>Vendedor <b>{cap(c.vendedor || "") || "—"}</b></div>
            <div>Medição <b>{c.medida ? (MEDIDA_CURTA[c.medida.etapa] || c.medida.etapa) + (c.medida.medidor && c.medida.medidor !== "—" ? " · " + primeiroNome(c.medida.medidor) : "") : c.minhaVisita ? "Minha Visita" : "—"}</b></div>
            <div style={{ gridColumn: "1/-1" }}>📍 <b>{endereco(c) || "endereço não encontrado na base"}</b></div>
          </div></div>
        <div className="acts">
          {tels[0] && <button className="btn sm" style={{ background: "var(--wa,#1fa855)", color: "#fff", borderColor: "var(--wa,#1fa855)" }} onClick={() => abrirWhats("https://wa.me/" + sanitizeWhats(tels[0]))}>💬 WhatsApp</button>}
          {reserva ? <span className="selo" style={{ background: "#faf1df", color: "#8a5d00" }}>⏳ Reserva · aguardando o cliente</span>
            : e5 ? <span className="selo" style={{ background: "#e6f4e9", color: "#3f8f4f" }}>✅ Realizado · {fmtDateTime(t0.finalizadoEm)}</span>
            : t0.iniciadoEm ? <span className="selo">⏱ Checklist em andamento · desde {hm(new Date(new Date(t0.iniciadoEm).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString())}</span>
            : <button className="btn primary sm" disabled={!!ocupado} onClick={async () => { if (await salvar("iniciar", {}, "Checklist iniciado")) { setAba("checklist"); setEtapa(1); } }}>▶ Iniciar checklist</button>}
          {!reserva && !e5 && <button className="btn sm" style={podeRealizar ? { background: "#3f8f4f", color: "#fff", borderColor: "#3f8f4f" } : { opacity: .55 }} title={podeRealizar ? "" : "Libera quando a impressão for gerada e o digitalizado assinado for anexado"} disabled={!!ocupado} onClick={marcarRealizado}>✅ Marcar realizado</button>}
        </div>
      </div>
      <div className="tabs">
        <button className={"tab" + (aba === "dados" ? " on" : "")} onClick={() => setAba("dados")}>👤 Cliente e venda</button>
        <button className={"tab" + (aba === "venda" ? " on" : "")} onClick={() => setAba("venda")}>📁 Arquivos da venda{nArqVenda !== null && <span className="c">{nArqVenda}</span>}</button>
        <button className={"tab" + (aba === "medicao" ? " on" : "")} onClick={() => setAba("medicao")}>📐 Medição{nMed !== null && <span className="c">{nMed}</span>}</button>
        {!reserva && <button className={"tab" + (aba === "checklist" ? " on" : "")} onClick={() => setAba("checklist")}>✏️ Checklist<span className="c">{e5 ? "realizado" : "etapa " + etapaAtual + " de 5"}</span></button>}
        <button className={"tab" + (aba === "historico" ? " on" : "")} onClick={() => setAba("historico")}>🕘 Histórico</button>
      </div>

      {aba === "dados" && <DadosVenda d={arqs?.dados} carregando={arqs === null} erro={arqErro} c={c} />}

      {aba === "venda" && <div className="body">
        <div>
          <div className="sec">Arquivos da venda <span className="src p-b">vindos do Exact</span></div>
          {arqs === null ? <div className="empty">Buscando os arquivos no Exact…</div> : <>
            {arqs.venda.length ? <div className="files">{arqs.venda.map((a, i) => <Arquivo key={a.fonte + a.id + i} a={a} c={c} onVer={() => setVer(a)} />)}</div>
              : <div className="note" style={{ marginBottom: 18 }}>Nenhum arquivo da venda no Exact{arqs.avisos.length ? "" : " ainda"}.</div>}
            {arqs.ck.length > 0 && <><div className="sec">Anexados pelo checklist <span className="src p-g">no 360</span></div>
              <div className="files">{arqs.ck.map((a, i) => <Arquivo key={"ck" + i} a={a} c={c} onVer={() => setVer(a)} />)}</div></>}
            <div className="sec">Medição {c.medida && <span className={"src " + (c.medida.etapa === "liberada" ? "p-ok" : "p-w")}>{MEDIDA_CURTA[c.medida.etapa] || c.medida.etapa}</span>}<span className="src p-g">Exact + medidas do 360</span>
              {(arqs.medicao.length + arqs.m360.length) > 0 && <button className="lk" style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0 }} onClick={() => setAba("medicao")}>ver todas ({arqs.medicao.length + arqs.m360.length}) →</button>}</div>
            {(() => { const fotos = [...arqs.medicao, ...arqs.m360].filter(a => a.tipo === "img"); return fotos.length ? <div className="pjmini">{fotos.slice(0, 6).map((a, i) => <Miniatura key={i} a={a} c={c} onClick={() => setVer(a)} />)}{fotos.length > 6 && <div className="th outro" style={{ fontSize: 13, fontWeight: 800 }} onClick={() => setAba("medicao")}>+{fotos.length - 6}</div>}</div> : <div className="note" style={{ marginBottom: 8 }}>⚠️ Sem fotos da medição.</div>; })()}
            <NotaMedida c={c} />
            {(arqs.avisos.length > 0 || arqErro) && <div className="hint" style={{ marginTop: 10 }}>{[arqErro, ...arqs.avisos].filter(Boolean).map((x, i) => <div key={i}>⚠️ {x}</div>)}</div>}
          </>}
        </div>
        <div>
          <div className="box"><h4>Ambiente pronto para montagem?</h4><div className="ck">
            {["Sem obra ou reforma em andamento", "Piso finalizado", "Pintura finalizada", "Gesso / elétrica finalizados"].map(x => <label key={x}><i className={c.ambiente === "pronto" ? "" : "no"}>{c.ambiente === "pronto" ? "✓" : ""}</i> {x}</label>)}</div>
            <div className="hint" style={{ marginTop: 4 }}>{c.ambiente === "pronto" ? "Confirmado pelo cliente no agendamento." : "Não confirmado no agendamento — pergunte ao cliente."}</div></div>
          <div className="box"><h4>Anexar do checklist</h4><Soltar multiplo texto={<>⬆ Arraste fotos, PDF ou .promob<br /><span style={{ fontWeight: 500, color: "var(--pj-s)" }}>fica no 360 e vai para o ticket no Exact</span></>}
            ocupado={ocupado === "subir"} onArquivos={async fs => { setOcupado("subir"); let ok = 0; for (const f of fs) { try { const r = await A.ckSubir(c.id, /\.promob/i.test(f.name) ? "promob" : "arquivo", f); ok++; if (!r.exact && r.exactErro && !/\.promob/i.test(f.name)) toast(f.name + ": guardado no 360, mas não foi para o Exact (" + r.exactErro.slice(0, 80) + ")"); } catch (e: any) { toast(e.message); } } setOcupado(""); if (ok) { toast(ok + " arquivo(s) anexado(s)"); carregarArqs(); } }} /></div>
          <CaixaHistorico c={c} n={4} />
        </div>
      </div>}

      {aba === "medicao" && <div className="body">
        <div>
          <div className="sec">Fotos da medição <span className="src p-ok">Exact</span></div>
          {arqs === null ? <div className="empty">Buscando no Exact…</div> : arqs.medicao.length ? <div className="files">{arqs.medicao.map((a, i) => <Arquivo key={i} a={a} c={c} onVer={() => setVer(a)} />)}</div> : <div className="note" style={{ marginBottom: 18 }}>Nenhuma foto de medição no ticket do Exact.</div>}
          <div className="sec">Medidas do 360 <span className="src p-g">setor de medidas / Minha Visita</span></div>
          {arqs && arqs.m360.length > 0 && <div className="files">{arqs.m360.map((a, i) => <Arquivo key={i} a={a} c={c} onVer={() => setVer(a)} />)}</div>}
          <NotaMedida c={c} />
        </div>
        <div>
          <div className="box"><h4>Medição</h4><div className="pjhist">
            <div>Situação: <b>{c.medida ? (MEDIDA_CURTA[c.medida.etapa] || c.medida.etapa) : "sem medição no 360"}</b></div>
            {c.medida?.medidor && c.medida.medidor !== "—" && <div>Medidor: <b>{c.medida.medidor}</b></div>}
            {c.medidor && <div>Medidor (planilha): <b>{cap(c.medidor)}</b></div>}
            {c.minhaVisita && <div>🏠 Cliente Minha Visita: o consultor já esteve no local</div>}
          </div></div>
          <CaixaHistorico c={c} n={4} />
        </div>
      </div>}

      {aba === "checklist" && !reserva && <div className="body">
        <div>
          <div className="steps5">{[["Ambientes", "da venda", e1], ["Conferência", "por ambiente", e2], ["Gerar", "impressão", e3], ["Subir", "assinado", e4], ["Marcar", "realizado", e5]].map(([a, b, ok], i) =>
            <button key={i} className={"stp" + (etapa === i + 1 ? " on" : ok ? " done" : "")} onClick={() => setEtapa(i + 1)}><span>{ok && etapa !== i + 1 ? "✓" : i + 1}</span>{a}<br />{b}</button>)}</div>
          {etapa === 1 && <Etapa1 ambs={ambs} setAmbs={(f: any) => { setAmbs(f); setMudou(true); }} me={me} arqs={arqs} c={c} confirmados={confirmados} setConfirmados={(v: boolean) => { setConfirmados(v); setMudou(true); }} />}
          {etapa === 2 && <Etapa2 c={c} ambs={ambs} setAmbs={(f: any) => { setAmbs(f); setMudou(true); }} arqs={arqs} toast={toast}
            naoInc={naoInc} setNaoInc={(f: any) => { setNaoInc(f); setMudou(true); }} obs={obs} setObs={(v: string) => { setObs(v); setMudou(true); }}
            ferragens={ferragens} setFerragens={(f: any) => { setFerragens(f); setMudou(true); }}
            aoLer={(nome: string, l: Listagem) => { setArquivos(xs => [...new Set([...xs, nome])]); setMeta((m: any) => ({ cliente: m.cliente || l.cliente, projeto: [m.projeto, l.projeto].filter(Boolean).join(" · "), data: m.data || l.data })); setMudou(true); }} />}
          {etapa === 3 && <Etapa3 c={c} t0={t0} ambs={ambs} proj={proj} naoInc={naoInc} obs={obs} ferragens={ferragens} arqs={arqs} liberado={e2} ocupado={ocupado} toast={toast}
            gerar={async (paginas: number) => salvar("impressao", { impressao: { paginas } }, "Impressão registrada")} />}
          {etapa === 4 && <Etapa4 c={c} t0={t0} ocupado={ocupado} setOcupado={setOcupado} toast={toast} liberado={e3}
            registrar={(assinado: any) => salvar("assinado", { assinado }, assinado.exact ? "Digitalizado anexado e enviado ao Exact" : "Digitalizado anexado no 360")} />}
          {etapa === 5 && <div>
            <div className="sec">5 · Marcar realizado</div>
            {e5 ? <div className="note">✅ Checklist realizado em <b>{fmtDateTime(t0.finalizadoEm)}</b>{t0.finalizadoPor ? " por " + t0.finalizadoPor : ""}. O PDF assinado está guardado na ficha.</div>
              : <div className="imp"><div><b>{podeRealizar ? "Tudo pronto para finalizar" : "Ainda não dá para marcar realizado"}</b>
                <div className="ck" style={{ marginTop: 6 }}>{[["Ambientes escritos e confirmados", e1], ["Conferência por ambiente preenchida", e2], ["Impressão gerada", e3], ["Digitalizado assinado anexado", e4]].map(([t, ok]: any) => <label key={t}><i className={ok ? "" : "no"}>{ok ? "✓" : ""}</i> {t}</label>)}</div></div>
                <button className="btn sm" style={podeRealizar ? { background: "#3f8f4f", color: "#fff", borderColor: "#3f8f4f" } : { opacity: .5 }} disabled={!podeRealizar || !!ocupado} onClick={marcarRealizado}>✅ Marcar realizado</button></div>}
          </div>}
          {(etapa === 1 || etapa === 2) && <div className="barra">
            <button className="btn sm" disabled={!!ocupado || !mudou} onClick={() => salvar()}>{ocupado === "salvar" ? "Salvando…" : "💾 Salvar"}</button>
            <span className="hint" style={{ marginLeft: "auto" }}>{mudou ? "Alterações não salvas" : t0.salvoEm ? "Salvo em " + fmtDateTime(t0.salvoEm) + (t0.salvoPor ? " · " + t0.salvoPor : "") : ""}</span>
          </div>}
        </div>
        <div>
          {etapa === 1 && <>
            <div className="box"><h4>Para seguir para a conferência</h4><div className="ck">
              <label><i className={ambs.length ? "" : "no"}>{ambs.length ? "✓" : ""}</i> Pelo menos 1 ambiente criado</label>
              <label><i className={ambs.length && ambs.every(a => a.nome.trim()) ? "" : "no"}>{ambs.length && ambs.every(a => a.nome.trim()) ? "✓" : ""}</i> Todo ambiente com nome</label>
              <label style={{ cursor: "pointer" }} onClick={() => { setConfirmados(!confirmados); setMudou(true); }}><i className={confirmados ? "" : "no"}>{confirmados ? "✓" : ""}</i> Cliente confirmou os ambientes</label></div>
              <button className="btn primary sm" style={{ marginTop: 10, width: "100%", ...(e1 ? {} : { opacity: .45 }) }} disabled={!e1 || !!ocupado} onClick={async () => { if (mudou && !(await salvar("salvar", {}, ""))) return; setEtapa(2); }}>Seguir → Conferência por ambiente</button></div>
            <div className="box"><h4>Como fica depois</h4><div className="pjhist">
              <div>• <b>1 checklist por ambiente</b>, cada um com seus checks e observações</div>
              <div>• Impressão: <b>uma folha por ambiente</b> com as imagens dele + termo final</div>
              <div>• Cliente assina <b>cada ambiente</b> e o termo</div>
              <div>• O ambiente que faltar no checklist trava o “Marcar realizado”</div>
              <div>• Fica registrado que os ambientes foram separados <b>pelo checklist</b> e por quem</div></div></div>
            <div className="box"><h4>Se alguém já informou</h4><div className="pjhist"><div>• Se o vendedor ou o projetista final já tiver escrito os ambientes, a lista vem preenchida</div><div>• O checklist sempre confere e pode mudar</div></div></div>
          </>}
          {etapa === 2 && <div className="box"><h4>Para gerar a impressão</h4><div className="ck">
            {ambs.map(a => { const ok = !conferirAmb(a).length && fichaOk(a); return <label key={a._k}><i className={ok ? "" : "no"}>{ok ? "✓" : ""}</i> {a.nome || "—"}{ok ? "" : <span style={{ color: "#8a5d00", fontWeight: 600 }}>&nbsp;· {conferirAmb(a).length ? "material / cor" : "ficha"}</span>}</label>; })}</div>
            <button className="btn primary sm" style={{ marginTop: 10, width: "100%", ...(e2 ? {} : { opacity: .45 }) }} disabled={!e2 || !!ocupado} onClick={async () => { if (mudou && !(await salvar("salvar", {}, ""))) return; setEtapa(3); }}>Seguir → Gerar impressão</button>
            <div className="hint" style={{ marginTop: 6 }}>Libera sem nada em amarelo: material, espessura e o <b>nome</b> da cor de cada ambiente, e a ficha respondida (o “Não” precisa de observação).</div></div>}
          {(etapa === 3 || etapa === 4 || etapa === 5) && <>
            <div className="box"><h4>Antes de finalizar</h4><div className="ck">
              <label><i className={e2 ? "" : "no"}>{e2 ? "✓" : ""}</i> Conferência preenchida</label><label><i className={e3 ? "" : "no"}>{e3 ? "✓" : ""}</i> Impressão gerada</label><label><i className={e4 ? "" : "no"}>{e4 ? "✓" : ""}</i> Digitalizado assinado anexado</label></div>
              {!e5 && <button className="btn sm" style={{ marginTop: 10, width: "100%", ...(podeRealizar ? { background: "#3f8f4f", color: "#fff", borderColor: "#3f8f4f" } : { opacity: .45 }) }} disabled={!podeRealizar || !!ocupado} onClick={marcarRealizado}>✅ Marcar realizado</button>}
              {!e5 && <div style={{ fontSize: 11.5, color: "var(--pj-s)", marginTop: 6 }}>Libera quando o digitalizado for anexado.</div>}</div>
            <div className="box"><h4>Ao marcar realizado</h4><div className="pjhist">
              <div>• Checklist fica <b>realizado</b> no 360</div><div>• PDF assinado guardado na ficha</div><div>• Ticket vai para <b>“Checklist concluído”</b> no Exact <span style={{ color: "#5b3c99", fontWeight: 700 }}>(rota a testar)</span></div><div>• Agendamento do Exact continua como histórico</div></div></div>
          </>}
          <CaixaHistorico c={c} n={4} />
        </div>
      </div>}

      {aba === "historico" && <div className="body" style={{ gridTemplateColumns: "1fr" }}>
        <div><div className="sec">Histórico do checklist</div>
          <div className="pjhist" style={{ fontSize: 13 }}>{(c.historico || []).length ? (c.historico || []).map((h: any, i: number) => <div key={i}><b>{fmtDateTime(h.quando)}</b> · {h.texto}{h.quem && h.quem !== "—" ? <span style={{ color: "var(--pj-f)" }}> — {h.quem}</span> : ""}</div>) : <div>Sem registros.</div>}</div></div>
      </div>}
    </section>
  );
}

function NotaMedida({ c }: { c: any }) {
  const m = c.medida;
  if (!m && !c.minhaVisita) return <div className="note">📐 Sem medição registrada no 360 para esta venda.</div>;
  return <div className="note">📐 <b>Medidas do 360{c.minhaVisita ? " (Minha Visita)" : ""}:</b> {m ? (MEDIDA_CURTA[m.etapa] || m.etapa) + (m.medidor && m.medidor !== "—" ? " · " + m.medidor : "") + (m.obs ? " — " + m.obs : "") : "o consultor já esteve no local (medidas feitas na visita)"}.</div>;
}
function CaixaHistorico({ c, n }: { c: any; n: number }) {
  const h = (c.historico || []).slice(0, n);
  return <div className="box"><h4>Histórico</h4><div className="pjhist">{h.length ? h.map((x: any, i: number) => <div key={i}><b>{fmtDateTime(x.quando).replace(/\/\d{4}/, "")}</b> · {x.texto}</div>) : <div>Sem registros.</div>}</div></div>;
}

// ---------------- arquivos: miniatura, cartão e visualização ----------------
const cacheBlob = new Map<string, Promise<string>>();
/** link para mostrar o arquivo: os do Exact antigos (legacy) passam pela função; os outros já vêm com link */
function urlDe(a: any, c: any): Promise<string> {
  if (a.url) return Promise.resolve(a.url);
  if (a.fonte !== "legacy" || !a.id) return Promise.resolve("");
  const k = c.id + ":" + a.id;
  if (!cacheBlob.has(k)) cacheBlob.set(k, A.ckBaixar(c.id, a.id).then(b => URL.createObjectURL(b)).catch(e => { cacheBlob.delete(k); throw e; }));
  return cacheBlob.get(k)!;
}
function Miniatura({ a, c, onClick, style }: { a: any; c: any; onClick?: () => void; style?: CSSProperties }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let vivo = true; if (a.tipo === "img") urlDe(a, c).then(u => vivo && setSrc(u)).catch(() => null); return () => { vivo = false; }; }, [a.id, a.url]);
  const tag = a.tipo === "img" ? (a.nome.split(".").pop() || "IMG").toUpperCase().slice(0, 4) : a.tipo === "pdf" ? "PDF" : a.tipo === "promob" ? "PROMOB" : (a.nome.split(".").pop() || "").toUpperCase().slice(0, 6);
  return <div className={"th " + (a.tipo === "img" ? "" : a.tipo)} onClick={onClick} style={style}>
    {a.tipo === "img" && src ? <img src={src} alt="" loading="lazy" /> : <>{a.tipo === "img" ? "🖼️" : a.tipo === "pdf" ? (/or[cç]amento/i.test(a.nome) ? "💲" : "📄") : a.tipo === "promob" ? "📦" : "📎"}</>}
    {tag && <span className="pjtag" style={a.tipo === "pdf" ? { background: "#c23b3b" } : a.tipo === "promob" ? { background: "#284b8f" } : undefined}>{tag}</span>}
  </div>;
}
function Arquivo({ a, c, onVer }: { a: any; c: any; onVer: () => void }) {
  const acao = a.tipo === "img" ? "ampliar" : a.tipo === "pdf" ? "abrir" : "⬇ baixar";
  const baixar = async () => { try { const u = await urlDe(a, c); const l = document.createElement("a"); l.href = u; l.download = a.nome; l.target = "_blank"; l.click(); } catch (e: any) { alert(e.message); } };
  return <div className="pjf" onClick={() => (a.tipo === "img" || a.tipo === "pdf" ? onVer() : baixar())} title={a.nome}>
    <Miniatura a={a} c={c} />
    <div className="pjfi"><span className="a">{acao}</span><b>{a.nome}</b><span>{[a.em ? ddmm(String(a.em)) : "", tam(a.tamanho), a.categoria && a.categoria !== "MEASURING" ? a.categoria.toLowerCase().replace("_", " ") : ""].filter(Boolean).join(" · ") || " "}</span></div>
  </div>;
}
function Visualizar({ a, c, onFechar }: { a: any; c: any; onFechar: () => void }) {
  const [u, setU] = useState(""); const [erro, setErro] = useState("");
  useEffect(() => { urlDe(a, c).then(setU).catch((e: any) => setErro(e.message)); }, [a]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  // tela quase cheia: o PDF abre ajustado à largura e a imagem inteira na tela
  const src = u && a.tipo === "pdf" ? u + (u.includes("#") ? "" : "#view=FitH&zoom=page-width") : u;
  return <div onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}
    style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,20,30,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2vh 2vw" }}>
    <div style={{ background: "var(--card,#fff)", borderRadius: 14, width: "96vw", height: "94vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,.35)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--line,#e0e3e8)" }}>
        <b style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</b>
        {u && <a className="btn sm" href={u} target="_blank" rel="noopener" download={a.nome}>⬇ Baixar / abrir em outra aba</a>}
        <button className="btn sm" onClick={onFechar}>✕ Fechar</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: a.tipo === "img" ? "#1b1f27" : "#525659", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {erro ? <div className="empty" style={{ color: "#fff" }}>{erro}</div> : !u ? <div className="empty" style={{ color: "#fff" }}>Abrindo…</div>
          : a.tipo === "img" ? <img src={u} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          : <iframe src={src} title={a.nome} style={{ width: "100%", height: "100%", border: 0, background: "#fff" }} />}
      </div>
    </div>
  </div>;
}
function Soltar({ texto, onArquivos, aceita, multiplo, ocupado, estilo }: { texto: ReactNode; onArquivos: (f: File[]) => void; aceita?: string; multiplo?: boolean; ocupado?: boolean; estilo?: CSSProperties }) {
  const ref = useRef<HTMLInputElement>(null); const [over, setOver] = useState(false);
  return <div className={"drop" + (over ? " over" : "")} style={estilo} onClick={() => !ocupado && ref.current?.click()}
    onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
    onDrop={e => { e.preventDefault(); setOver(false); if (!ocupado) onArquivos(Array.from(e.dataTransfer.files || [])); }}>
    <input ref={ref} type="file" accept={aceita} multiple={multiplo} style={{ display: "none" }} onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length) onArquivos(fs); }} />
    {ocupado ? "Enviando…" : texto}
  </div>;
}

// ---------------- etapa 1: ambientes da venda ----------------
function Etapa1({ ambs, setAmbs, me, arqs, c, confirmados, setConfirmados }: any) {
  const [txt, setTxt] = useState(""); const [arr, setArr] = useState<string | null>(null); const [alvo, setAlvo] = useState<string | null>(null);
  const { setModal } = useApp() as any;
  const setImgDe = (a: Amb) => setModal(<EscolherImagens a={a} arqs={arqs} c={c} onFechar={() => setModal(null)} onSalvar={(imgs: Img[]) => { setAmbs((xs: Amb[]) => xs.map(x => x._k === a._k ? { ...x, imagens: imgs } : x)); setModal(null); }} />);
  const nomeUnico = (n: string) => { const base = n.trim(); const usados = new Set(ambs.map((a: Amb) => semAcento(a.nome.trim()))); if (!usados.has(semAcento(base))) return base; let i = 2; while (usados.has(semAcento(base + " " + i))) i++; return base + " " + i; };
  const add = (n: string, origem: "sugestao" | "escrito") => { if (!n.trim()) return; setAmbs((xs: Amb[]) => [...xs, { nome: nomeUnico(n), origem, escritoPor: me, caixa: { mat: null, esp: null }, porta: { mat: null, esp: null, vidro: false }, cor: "", itens: [], conferir: [], ficha: {}, imagens: [], _k: novaChave() }]); };
  const usados = new Set(ambs.map((a: Amb) => semAcento(a.nome.replace(/\s+\d+$/, ""))));
  const mover = (de: string, para: string) => setAmbs((xs: Amb[]) => { const a = xs.findIndex(x => x._k === de), b = xs.findIndex(x => x._k === para); if (a < 0 || b < 0 || a === b) return xs; const n = xs.slice(); const [it] = n.splice(a, 1); n.splice(b, 0, it); return n; });
  return <div>
    {!ambs.length && <div className="alert">✏️ O projeto não informa os ambientes. <b>A pessoa do checklist escreve aqui</b> tudo o que a venda tem — sem limite de nomes. Cada ambiente da lista vira um checklist.</div>}
    <div className="sec">Quais ambientes essa venda tem? <span className="src p-b">escreva livremente · as sugestões só agilizam</span></div>
    <div className="inp"><span>✏️</span><input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && txt.trim()) { add(txt, "escrito"); setTxt(""); } }} placeholder="Escreva o ambiente e aperte Enter — ex.: “Bancada do home office”, “Painel da TV”, “Armário da garagem”…" />
      <button className="btn primary sm" disabled={!txt.trim()} onClick={() => { add(txt, "escrito"); setTxt(""); }}>＋ Adicionar</button></div>
    <div className="pjchips"><span className="lbl">Sugestões (clique para adicionar):</span>
      {SUGESTOES_AMB.map(s => { const u = usados.has(semAcento(s)); return <button key={s} type="button" className={"cp" + (u ? " used" : "")} title={u ? "Já está na lista — clique para adicionar outro (" + s + " 2)" : ""} onClick={() => add(s, "sugestao")}>{s}{u ? " ✓" : ""}</button>; })}</div>
    <div className="sec" style={{ marginTop: 14 }}>Ambientes desta venda <span className="src p-w">{ambs.length} ambiente{ambs.length === 1 ? "" : "s"} = {ambs.length} checklist{ambs.length === 1 ? "" : "s"} · arraste para mudar a ordem</span></div>
    {ambs.length ? <div className="amblist">{ambs.map((a: Amb, i: number) => { const [bg, fg] = COR_AMB[i % COR_AMB.length];
      return <div key={a._k} className={"am" + (arr === a._k ? " drag" : "") + (alvo === a._k && arr !== a._k ? " alvo" : "")} draggable
        onDragStart={() => setArr(a._k)} onDragEnd={() => { setArr(null); setAlvo(null); }} onDragOver={e => { e.preventDefault(); setAlvo(a._k); }} onDrop={e => { e.preventDefault(); if (arr) mover(arr, a._k); setArr(null); setAlvo(null); }}>
        <div className="pjh"><em className="orig" style={{ background: bg, color: fg }} title="Arraste para mudar a ordem">{i + 1}</em>
          <input className="in" value={a.nome} onChange={e => setAmbs((xs: Amb[]) => xs.map(x => x._k === a._k ? { ...x, nome: e.target.value } : x))} placeholder="Nome do ambiente" />
          <button className="pjx" title="Excluir ambiente" onClick={() => { if (!a.itens.length || confirm(`Excluir “${a.nome}” e os ${a.itens.length} itens da listagem dele?`)) setAmbs((xs: Amb[]) => xs.filter(x => x._k !== a._k)); }}>✕</button></div>
        <div className="m2">{a.origem === "sugestao" ? "sugestão" : <><b>escrito {a.escritoPor ? "por " + a.escritoPor : "pelo checklist"}</b></>} · imagens: <button className="lk" onClick={() => setImgDe(a)}>{(a.imagens || []).length ? (a.imagens || []).length + " vinculada" + ((a.imagens || []).length > 1 ? "s" : "") : "vincular (opcional)"}</button></div>
      </div>; })}</div> : <div className="note">Nenhum ambiente ainda. Escreva acima ou clique numa sugestão.</div>}
    {ambs.length > 0 && <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontWeight: 700, cursor: "pointer" }}><input type="checkbox" style={{ width: "auto" }} checked={confirmados} onChange={e => setConfirmados(e.target.checked)} /> O cliente confirmou que a venda tem exatamente estes ambientes</label>}
  </div>;
}

/** vincular imagens do projeto a um ambiente (elas vão para o cliente, na folha do ambiente) */
function EscolherImagens({ a, arqs, c, onFechar, onSalvar }: { a: Amb; arqs: Arqs | null; c: any; onFechar: () => void; onSalvar: (i: Img[]) => void }) {
  const { toast } = useApp() as any;
  const [extra, setExtra] = useState<any[]>([]);
  const [sel, setSel] = useState<Img[]>(a.imagens || []);
  const [env, setEnv] = useState(false);
  const fontes = [...(arqs?.venda || []), ...(arqs?.ck || []), ...extra].filter(x => x.tipo === "img");
  const chave = (x: any) => x.fonte === "checklist" ? "p:" + (x.path || x.id) : x.fonte === "legacy" ? "l:" + x.id : "u:" + (x.url || x.id);
  const marcado = (x: any) => sel.some(s => chave(s) === chave(x));
  const alternar = (x: any) => setSel(s => marcado(x) ? s.filter(y => chave(y) !== chave(x)) : [...s, { fonte: x.fonte, id: x.id, url: x.fonte === "checklist" ? "" : x.url, path: x.path, nome: x.nome }]);
  return <Modal titulo={"Imagens do projeto · " + (a.nome || "ambiente")} onFechar={onFechar}>
    <div className="pj" style={{ minWidth: "min(760px, 86vw)" }}><style>{CSS}</style>
      <p className="hint" style={{ marginTop: 0 }}>As imagens escolhidas saem na folha deste ambiente na impressão — <b>vão para o cliente</b>. Escolha só as imagens do projeto final.</p>
      {fontes.length ? <div className="files">{fontes.map((x, i) => <div key={i} className="pjf" onClick={() => alternar(x)} style={marcado(x) ? { borderColor: "var(--pj-pri)", boxShadow: "0 0 0 2px var(--pj-soft)" } : undefined}>
        <Miniatura a={x} c={c} /><div className="pjfi"><span className="a">{marcado(x) ? "✓ escolhida" : "escolher"}</span><b>{x.nome}</b></div></div>)}</div>
        : <div className="note" style={{ marginBottom: 12 }}>{arqs ? "Nenhuma imagem nos arquivos da venda." : "Buscando os arquivos…"}</div>}
      <Soltar aceita="image/*" multiplo ocupado={env} texto={<>⬆ Subir imagem do projeto final<br /><span style={{ fontWeight: 500, color: "var(--pj-s)" }}>fica no 360 e vai para o ticket no Exact</span></>}
        onArquivos={async fs => { setEnv(true); for (const f of fs) { try { const r = await A.ckSubir(c.id, "imagem", f); const n = { fonte: "checklist", id: r.path, path: r.path, url: r.url, nome: r.nome, tipo: "img" }; setExtra(x => [...x, n]); setSel(s => [...s, { fonte: "checklist", id: r.path, path: r.path, nome: r.nome }]); } catch (e: any) { toast(e.message); } } setEnv(false); }} />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="btn primary" onClick={() => onSalvar(sel)}>Usar {sel.length} imagem{sel.length === 1 ? "" : "ns"}</button><button className="btn ghost" onClick={onFechar}>Cancelar</button></div>
    </div>
  </Modal>;
}

// ---------------- etapa 2: conferência por ambiente ----------------
function coresUsadas(): string[] { try { return JSON.parse(localStorage.getItem("a360-ck-cores") || "[]"); } catch { return []; } }
function lembrarCor(n: string) { const v = n.trim(); if (!v || /^\d+$/.test(v)) return; try { const l = [v, ...coresUsadas().filter(x => x !== v)].slice(0, 60); localStorage.setItem("a360-ck-cores", JSON.stringify(l)); } catch { /* */ } }

function Etapa2({ c, ambs, setAmbs, arqs, toast, naoInc, setNaoInc, obs, setObs, ferragens, setFerragens, aoLer }: any) {
  const [lendo, setLendo] = useState(false);
  const { setModal } = useApp() as any;
  const setPendente = (pd: { nome: string; l: Listagem; file: File } | null) => { if (!pd) { setModal(null); return; }
    setModal(<Modal titulo={"De qual ambiente é esta listagem? · " + pd.nome} onFechar={() => setModal(null)}><QualAmbiente ambs={ambs} l={pd.l} onOk={k => aplicar(pd, k)} onCancelar={() => setModal(null)} /></Modal>); };
  const [avisos, setAvisos] = useState<string[]>([]);
  const [outroNI, setOutroNI] = useState("");
  const set = (k: string, fn: (a: Amb) => Amb) => setAmbs((xs: Amb[]) => xs.map(a => (a._k === k ? fn(a) : a)));
  const sugCores = [...new Set([...ambs.map((a: Amb) => a.cor).filter(Boolean), ...coresUsadas()])] as string[];

  async function ler(fs: File[]) {
    const files = fs.filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!files.length) { toast("Escolha o PDF da listagem do Promob"); return; }
    if (!ambs.length) { toast("Escreva os ambientes na etapa 1 antes de anexar a listagem"); return; }
    setLendo(true); const av: string[] = [];
    try {
      for (const f of files) {
        let l: Listagem;
        try { l = await lerListagemArquivo(await f.arrayBuffer()); } catch (e: any) { av.push(f.name + ": não consegui abrir o PDF (" + (e?.message || "erro") + ")"); continue; }
        l.avisos.filter(x => !/cores vêm só como código/.test(x)).forEach(a => av.push(f.name + ": " + a));
        if (l.cliente && !semAcento(l.cliente).includes(semAcento(primeiroNome(c.cliente))) && !semAcento(c.cliente).includes(semAcento(primeiroNome(l.cliente))))
          av.push(`${f.name}: a listagem é de “${l.cliente}”, e o checklist é de “${c.cliente}” — confira se é o arquivo certo.`);
        if (!l.linhas.length) continue;
        setPendente({ nome: f.name, l, file: f });
        break; // uma por vez: o projetista diz de quais ambientes ela é
      }
    } finally { setAvisos(av); setLendo(false); }
  }
  function aplicar(pendente: { nome: string; l: Listagem; file: File }, alvos: string[]) {
    if (!alvos.length) return;
    const { l, nome, file } = pendente;
    const ordem = ambs.filter((a: Amb) => alvos.includes(a._k));
    const base = ambienteDaListagem(ordem.map((a: Amb) => a.nome).join(" + "), l.linhas, l);
    const codigos = [...new Set(l.linhas.filter(x => x.cor && x.tipo !== "consumivel").map(x => x.cor + (x.acabamento ? " (" + x.acabamento + ")" : "")))] as string[];
    const primeiro = ordem[0]._k;
    setAmbs((xs: Amb[]) => xs.map(a => !alvos.includes(a._k) ? a : {
      ...a, caixa: { ...base.caixa }, porta: { ...base.porta }, codigos: [...new Set([...(a.codigos || []), ...codigos])],
      itens: a._k === primeiro ? [...a.itens, ...l.linhas] : a.itens, itensDe: a._k === primeiro ? null : ordem[0].nome,
      listagens: [...new Set([...(a.listagens || []), nome])],
    }));
    setFerragens((xs: string[]) => [...new Set([...xs, ...l.resumo.ferragens])]);
    aoLer(nome, l);
    toast(`${nome}: ${l.resumo.modulos} módulos e ${l.resumo.pecas} peças lidos (sem valores)`);
    A.ckSubir(c.id, "listagem", file).catch(() => null); // guardada interna (não vai para o cliente nem para o Exact)
    setPendente(null);
  }

  return <div>
    <div className="sec">Listagens do Promob <span className="src p-b">o 360 lê material, espessura, cores e módulos · sem valores</span></div>
    <Soltar aceita=".pdf,application/pdf" multiplo ocupado={lendo} texto={<>📎 Anexar a listagem do Promob (PDF)<br /><span style={{ fontWeight: 500, color: "var(--pj-s)" }}>1 listagem = 1 ambiente é o ideal · ela <b>não vai para o cliente</b> · ambiente sem listagem é preenchido à mão</span></>} onArquivos={ler} />
    {avisos.length > 0 && <div className="alert" style={{ marginTop: 8 }}>{avisos.map((a, i) => <div key={i}>⚠️ {a}</div>)}</div>}
    <div className="sec" style={{ marginTop: 16 }}>2 · Conferência com o cliente, por ambiente</div>
    {ambs.map((a: Amb, i: number) => <ConfAmb key={a._k} a={a} i={i} todos={ambs} set={(fn: any) => set(a._k, fn)} sugCores={sugCores} c={c} arqs={arqs}
      mover={(item: LinhaListagem, para: string) => setAmbs((xs: Amb[]) => xs.map(x => x._k === a._k ? { ...x, itens: x.itens.filter(y => y !== item) } : x._k === para ? { ...x, itens: [...x.itens, item].sort((p, q) => p.item - q.item), itensDe: null } : x))} />)}
    <div className="pjab"><h5>Não inclusos e observações gerais</h5>
      <div className="lbl2">Não estão inclusos (o cliente risca o que estiver incluso)</div>
      <div className="pjchips">{[...new Set([...NAO_INCLUSOS_OPCOES, ...naoInc])].map((n: string) => { const on = naoInc.includes(n); return <button key={n} type="button" className={"cp" + (on ? " used" : "")} onClick={() => setNaoInc((xs: string[]) => on ? xs.filter(x => x !== n) : [...xs, n])}>{on ? "✓ " : "＋ "}{n}</button>; })}
        <input value={outroNI} onChange={e => setOutroNI(e.target.value)} placeholder="Outro… (Enter)" style={{ width: 150, padding: "3px 8px" }} onKeyDown={e => { if (e.key === "Enter" && outroNI.trim()) { setNaoInc((xs: string[]) => [...new Set([...xs, outroNI.trim()])]); setOutroNI(""); } }} /></div>
      {ferragens.length > 0 && <><div className="lbl2" style={{ marginTop: 8 }}>Ferragens da listagem (vão nas observações do termo · clique para tirar)</div>
        <div className="pjchips">{ferragens.map((f: string) => <button key={f} type="button" className="cp" onClick={() => setFerragens((xs: string[]) => xs.filter(x => x !== f))}>{f} ✕</button>)}</div></>}
      <div className="lbl2" style={{ marginTop: 8 }}>Observações do checklist</div>
      <textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: cliente vai mover o ponto de água até 30/11 — ciente que a montagem depende disso." style={{ width: "100%" }} />
    </div>
  </div>;
}

function QualAmbiente({ ambs, l, onOk, onCancelar }: { ambs: Amb[]; l: Listagem; onOk: (k: string[]) => void; onCancelar: () => void }) {
  const palpite = ambs.find(a => l.projeto && (semAcento(l.projeto).includes(semAcento(a.nome)) || semAcento(a.nome).includes(semAcento(l.projeto)))) || ambs.find(a => !(a.listagens || []).length) || ambs[0];
  const [sel, setSel] = useState<string[]>(palpite ? [palpite._k] : []);
  return <div style={{ minWidth: "min(480px, 86vw)" }}>
    <p className="hint" style={{ marginTop: 0 }}>Projeto na listagem: <b>{l.projeto || "—"}</b> · {l.resumo.modulos} módulos, {l.resumo.pecas} peças. Se ela cobrir mais de um ambiente, o material vai para todos e os itens ficam juntos no primeiro (dá para separar depois).</p>
    {ambs.map(a => <label key={a._k} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line-soft)", cursor: "pointer" }}>
      <input type="checkbox" style={{ width: "auto" }} checked={sel.includes(a._k)} onChange={() => setSel(s => s.includes(a._k) ? s.filter(x => x !== a._k) : [...s, a._k])} />
      <b>{a.nome || "—"}</b>{(a.listagens || []).length > 0 && <span className="hint">já tem: {(a.listagens || []).join(", ")}</span>}</label>)}
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="btn primary" disabled={!sel.length} onClick={() => onOk(ambs.filter(a => sel.includes(a._k)).map(a => a._k))}>Usar nos {sel.length} ambiente{sel.length === 1 ? "" : "s"}</button><button className="btn ghost" onClick={onCancelar}>Cancelar</button></div>
  </div>;
}

function Seg<T extends string | number | null>({ v, ops, on }: { v: T; ops: [T, string][]; on: (x: T) => void }) {
  return <span className="seg">{ops.map(([x, t]) => <button key={String(x)} type="button" className={v === x ? "on" : ""} onClick={() => on(v === x ? (null as T) : x)}>{t}</button>)}</span>;
}
function ConfAmb({ a, i, todos, set, sugCores, mover, c, arqs }: { a: Amb; i: number; todos: Amb[]; set: (fn: (a: Amb) => Amb) => void; sugCores: string[]; mover: (item: LinhaListagem, para: string) => void; c: any; arqs: Arqs | null }) {
  const { setModal } = useApp() as any;
  const [verItens, setVerItens] = useState(false);
  const setImgs = (_: boolean) => setModal(<EscolherImagens a={a} arqs={arqs} c={c} onFechar={() => setModal(null)} onSalvar={im => { set(x => ({ ...x, imagens: im })); setModal(null); }} />);
  const falta = conferirAmb(a), fic = fichaDe(a), nOk = fic.filter(([, v]) => v === true).length;
  const ok = !falta.length && fichaOk(a);
  const visiveis = a.itens.filter(l => l.tipo !== "consumivel");
  const espOps: [number | null, string][] = [[15, "15"], [18, "18"], ...((a.caixa.esp && ![15, 18].includes(a.caixa.esp) ? [[a.caixa.esp, String(a.caixa.esp)]] : []) as [number, string][])];
  const espOpsP: [number | null, string][] = [[15, "15"], [18, "18"], ...((a.porta.esp && ![15, 18].includes(a.porta.esp) ? [[a.porta.esp, String(a.porta.esp)]] : []) as [number, string][])];
  return <div className={"pjab " + (ok ? "am-ok" : "am-w")}>
    <h5>{ICONE_AMB(a.nome)} {i + 1} · {a.nome || "—"}{(a.listagens || []).length ? <span className="hint" style={{ fontWeight: 500 }}>· {(a.listagens || []).join(", ")}</span> : <span className="hint" style={{ fontWeight: 500 }}>· sem listagem (preencher à mão)</span>}
      <span className={"pjpill " + (ok ? "p-ok" : "p-w")}>{nOk}/{fic.length}{falta.length ? " · conferir" : " ok"}</span></h5>
    <div className="mat">
      <div><div className="lbl2">Caixas / corpo</div><Seg<Mat> v={a.caixa.mat} ops={[["MDP", "MDP"], ["MDF", "MDF"]]} on={m => set(x => ({ ...x, caixa: { ...x.caixa, mat: m } }))} /> <Seg<number | null> v={a.caixa.esp} ops={espOps} on={n => set(x => ({ ...x, caixa: { ...x.caixa, esp: n } }))} /> <span className="hint">mm</span></div>
      <div><div className="lbl2">Portas / frentes</div>
        {a.porta.naoSeAplica ? <span className="hint">sem portas · </span> : <><Seg<Mat> v={a.porta.mat} ops={[["MDP", "MDP"], ["MDF", "MDF"]]} on={m => set(x => ({ ...x, porta: { ...x.porta, mat: m } }))} /> <Seg<number | null> v={a.porta.esp} ops={espOpsP} on={n => set(x => ({ ...x, porta: { ...x.porta, esp: n } }))} /> </>}
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12.5, marginLeft: 4 }}><input type="checkbox" style={{ width: "auto" }} checked={!!a.porta.vidro} onChange={e => set(x => ({ ...x, porta: { ...x.porta, vidro: e.target.checked } }))} /> vidro</label>
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12.5, marginLeft: 8 }}><input type="checkbox" style={{ width: "auto" }} checked={!!a.porta.naoSeAplica} onChange={e => set(x => ({ ...x, porta: { ...x.porta, naoSeAplica: e.target.checked } }))} /> sem portas</label></div>
      <div><div className="lbl2">Cor / padrão — nome</div>
        <input list={"cores-" + a._k} value={a.cor} onChange={e => set(x => ({ ...x, cor: e.target.value }))} onBlur={e => lembrarCor(e.target.value)} placeholder="Ex.: Freijó · Legno Crema · portas Jade" style={{ width: "100%" }} />
        <datalist id={"cores-" + a._k}>{sugCores.map(s => <option key={s} value={s} />)}</datalist>
        {(a.codigos || []).length > 0 && <div className="hint" style={{ marginTop: 3 }}>Na listagem: cód. {(a.codigos || []).join(" · ")} — o código não vai para o cliente; escreva o nome da cor.</div>}</div>
    </div>
    {falta.length > 0 && <div className="obsw" style={{ marginBottom: 8 }}>⚠️ Conferir: {falta.join(", ")}</div>}
    <div className="lbl2">Ficha do ambiente</div>
    {fic.map(([k, v]) => <div key={k} className={"pjrow" + (v === true ? " on" : v === false ? " no" : "")}><b>{k}</b>
      <span className="yn"><button type="button" className={v === true ? "y" : ""} onClick={() => set(x => ({ ...x, ficha: { ...(x.ficha || {}), [k]: v === true ? null : true } }))}>Sim</button><button type="button" className={v === false ? "pjn" : ""} onClick={() => set(x => ({ ...x, ficha: { ...(x.ficha || {}), [k]: v === false ? null : false } }))}>Não</button></span></div>)}
    <textarea rows={2} value={a.fichaObs || ""} onChange={e => set(x => ({ ...x, fichaObs: e.target.value }))} placeholder={fic.some(([, v]) => v === false) ? "Explique o “Não” (obrigatório) — ex.: cliente vai mover o ponto de água até 30/11" : "Observação deste ambiente (vai na folha do ambiente)"} style={{ width: "100%", marginTop: 4, ...(fic.some(([, v]) => v === false) && (a.fichaObs || "").trim().length < 3 ? { borderColor: "#c98a12" } : {}) }} />
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
      <span className="lbl2" style={{ margin: 0 }}>Imagens:</span>
      {(a.imagens || []).length ? <span className="pjthumbs" style={{ marginTop: 0 }}>{(a.imagens || []).slice(0, 5).map((m, j) => <Miniatura key={j} a={{ ...m, tipo: "img", url: m.url || (arqs?.ck || []).find(x => x.path === m.path)?.url || "" }} c={c} />)}</span> : <span className="hint">nenhuma</span>}
      <button className="lk" onClick={() => setImgs(true)}>{(a.imagens || []).length ? "alterar" : "vincular imagens do projeto"}</button>
      {visiveis.length > 0 && <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setVerItens(v => !v)}>{verItens ? "▾ esconder itens" : "▸ " + visiveis.length + " itens da listagem"}</button>}
      {a.itensDe && <span className="hint">itens junto com “{a.itensDe}”</span>}
    </div>
    {verItens && visiveis.length > 0 && <div style={{ overflowX: "auto", marginTop: 6 }}><table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
      <thead><tr style={{ textAlign: "left", color: "var(--pj-f)" }}><th style={{ padding: "4px 6px" }}>Item</th><th>Qtd</th><th>Descrição</th><th>Medidas</th><th>Mat.</th>{todos.length > 1 && <th>Ambiente (separar)</th>}</tr></thead>
      <tbody>{visiveis.map((l, j) => <tr key={l.item + "-" + j} style={{ borderTop: "1px solid var(--pj-l2)" }}>
        <td style={{ padding: "4px 6px", color: "var(--pj-f)" }}>{l.item}</td><td>{l.qtd}</td><td>{l.descricao}</td><td style={{ whiteSpace: "nowrap" }}>{l.medidas}</td>
        <td>{[l.material, l.espessura ? l.espessura + "mm" : ""].filter(Boolean).join(" ")}</td>
        {todos.length > 1 && <td><select value={a._k} onChange={e => mover(l, e.target.value)} style={{ padding: "2px 4px", fontSize: 12 }}>{todos.map((t, k) => <option key={t._k} value={t._k}>{t.nome || "Ambiente " + (k + 1)}</option>)}</select></td>}
      </tr>)}</tbody></table></div>}
  </div>;
}

// ---------------- etapa 3: gerar a impressão (um PDF só) ----------------
const blobParaDataUrl = (b: Blob) => new Promise<string>((ok, er) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = er; r.readAsDataURL(b); });
function Etapa3({ c, t0, ambs, proj, naoInc, obs, ferragens, arqs, liberado, ocupado, toast, gerar }: any) {
  const [montando, setMontando] = useState(false);
  const nome = `Checklist_${primeiroNome(cap(c.cliente))}_${c.pedido}.pdf`;
  async function imprimir() {
    if (!liberado) { toast("Termine a conferência por ambiente (nada em amarelo) antes de gerar a impressão"); return; }
    const w = window.open("", "_blank");
    if (!w) { toast("Libere as janelas (pop-up) do navegador para gerar a impressão"); return; }
    w.document.write("<p style='font:16px system-ui;padding:30px'>Montando o checklist para impressão…</p>");
    setMontando(true);
    try {
      // imagens: as do Exact antigo e as do checklist entram embutidas (o link delas é temporário)
      const ambsImp = await Promise.all(ambs.map(async (a: Amb) => ({ ...a, conferir: [], imagens: (await Promise.all((a.imagens || []).map(async (m: Img) => {
        try {
          if (m.fonte === "legacy" && m.id) return { nome: m.nome, src: await blobParaDataUrl(await A.ckBaixar(c.id, m.id)) };
          const u = m.fonte === "checklist" ? (arqs?.ck || []).find((x: any) => x.path === m.path)?.url || "" : m.url || "";
          return u ? { nome: m.nome, src: u } : null;
        } catch { return null; }
      }))).filter(Boolean) })));
      const data = fmtDate(hojeISO());
      const html = impressaoHtml({ venda: String(c.pedido), cliente: String(c.cliente), endereco: endereco(c) || "—", vendedor: cap(c.vendedor || "") || "—", projetista: proj, data,
        ambientes: ambsImp, naoInclusos: naoInc, obs, ferragens });
      w.document.open(); w.document.write(html); w.document.close();
      const paginas = 1 + ambs.length + 1 + 1;
      setTimeout(() => { try { w.focus(); w.print(); } catch { /* */ } }, 700);
      await gerar(paginas);
    } catch (e: any) { toast(e.message || "Não foi possível montar a impressão"); try { w.close(); } catch { /* */ } }
    finally { setMontando(false); }
  }
  const imp = t0.impressao;
  return <div>
    <div className="sec">3 · Impressão para assinatura <span className="src p-b">um PDF só · sem valores, sem listagem, sem .promob</span></div>
    {!liberado && <div className="alert">A impressão libera quando a conferência de todos os ambientes estiver completa (nada em amarelo). Volte à etapa 2.</div>}
    <div className="imp">
      <div><b>🖨 {nome}</b><span>{imp ? "gerado " + fmtDateTime(imp.em) + (imp.por ? " por " + imp.por : "") + (imp.paginas ? " · ~" + imp.paginas + " páginas" : "") : "ainda não gerado"}</span>
        <div className="inc"><span>✓ Capa (cliente / venda)</span><span>✓ Por ambiente: imagens + ficha de checklist</span><span>✓ Resumo do que foi comprado</span><span>✓ Termo de ciência do material</span><span>✓ Condições gerais (29 itens) + responsabilidades</span><span>✓ Assinaturas</span></div>
        <div className="hint" style={{ marginTop: 6 }}>Na janela de impressão escolha <b>“Salvar como PDF”</b> para guardar o arquivo, ou imprima direto. O cliente assina tudo de uma vez.</div></div>
      <button className="btn primary sm" disabled={!liberado || montando || !!ocupado} onClick={imprimir}>{montando ? "Montando…" : imp ? "🖨 Imprimir de novo" : "🖨 Gerar impressão"}</button>
    </div>
  </div>;
}

// ---------------- etapa 4: subir o digitalizado assinado ----------------
function Etapa4({ c, t0, ocupado, setOcupado, toast, registrar, liberado }: any) {
  const ass: any[] = t0.assinados || [];
  return <div>
    <div className="sec">4 · Documento assinado (digitalizado) <span className="src p-b">vai para o Exact como “Outros”</span></div>
    {!liberado && <div className="alert">Gere a impressão (etapa 3) e colha as assinaturas antes de subir o digitalizado.</div>}
    <Soltar aceita="application/pdf,image/*" multiplo ocupado={ocupado === "assinado"} estilo={{ padding: 18 }}
      texto={<>⬆ Arraste aqui o PDF escaneado com as assinaturas do cliente<br /><span style={{ fontWeight: 500, color: "var(--pj-s)" }}>ou tire foto pelo celular · pode subir mais de um arquivo</span></>}
      onArquivos={async fs => {
        setOcupado("assinado");
        try { for (const f of fs) { const r = await A.ckSubir(c.id, "assinado", f); await registrar({ nome: r.nome, path: r.path, exact: r.exact }); if (!r.exact) toast(f.name + ": guardado no 360, mas não foi para o Exact" + (r.exactErro ? " (" + r.exactErro.slice(0, 80) + ")" : "")); } }
        catch (e: any) { toast(e.message); } finally { setOcupado(""); }
      }} />
    {ass.length > 0 && <div style={{ marginTop: 12 }}>{ass.map((a, i) => <div key={i} className="pjrow on"><b>📎 {a.nome}</b><span className="hint">{fmtDateTime(a.em)}{a.por ? " · " + a.por : ""}</span>
      <span className={"pjpill " + (a.exact ? "p-ok" : "p-w")} style={{ margin: 0 }}>{a.exact ? "Exact ✓" : "só no 360"}</span></div>)}</div>}
  </div>;
}
