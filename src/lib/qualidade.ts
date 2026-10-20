// Pesquisa de satisfação (avaliação do cliente): perguntas por etapa e textos da mensagem.
export type Etapa = "montagem" | "loja" | "medicao" | "checklist" | "posvenda";
export const ETAPAS: Record<Etapa, { nome: string; titulo: string; perguntas: [string, string, string]; resp: string; ativa: boolean }> = {
  montagem: { nome: "Montagem", titulo: "Como foi a sua montagem?", resp: "Montador", ativa: true,
    perguntas: ["Pontualidade (chegou no horário combinado)", "Cuidado e limpeza do montador", "O móvel ficou como no projeto?"] },
  loja: { nome: "Atendimento na loja", titulo: "Como foi o seu atendimento na loja?", resp: "Vendedor", ativa: true,
    perguntas: ["Atenção do vendedor", "Explicação do projeto e do orçamento", "Tempo de espera na loja"] },
  medicao: { nome: "Medição", titulo: "Como foi a medição?", resp: "Medidor", ativa: true,
    perguntas: ["Pontualidade", "Clareza nas explicações", "Cuidado com a sua casa"] },
  checklist: { nome: "Checklist", titulo: "Como foi o checklist do seu projeto?", resp: "Projetista", ativa: true,
    perguntas: ["Pontualidade", "Clareza nas explicações", "Confiança no projeto final"] },
  posvenda: { nome: "Pós-venda", titulo: "Como foi o atendimento do pós-venda?", resp: "Responsável", ativa: true,
    perguntas: ["Rapidez para resolver", "Educação e atenção", "O problema foi resolvido?"] },
};
export const linkAvaliacao = (token: string) => location.origin + "/avaliar?t=" + token;
export const msgAvaliacao = (etapa: Etapa, cliente: string, link: string, servicoEm?: string) => {
  const nome = (cliente || "").trim().split(/\s+/)[0] || "";
  const nomeF = nome ? nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase() : "";
  const quando = servicoEm ? " no dia " + servicoEm.slice(8, 10) + "/" + servicoEm.slice(5, 7) : "";
  const oque = etapa === "montagem" ? "A montagem dos seus móveis foi concluída" + quando + "."
    : etapa === "loja" ? "Obrigado pela sua visita à nossa loja" + quando + "."
    : etapa === "medicao" ? "A medição do seu projeto foi feita" + quando + "."
    : etapa === "checklist" ? "O checklist do seu projeto foi feito" + quando + "."
    : "O seu atendimento no pós-venda foi concluído" + quando + ".";
  return `Olá${nomeF ? ", " + nomeF : ""}! Aqui é a Aliança Móveis.\n\n${oque} Queremos saber como foi a sua experiência.\n\nSão só 3 perguntas, leva menos de 1 minuto:\n${link}\n\nObrigado! Sua opinião vai direto para a gerência.`;
};
// NPS: % de notas 9–10 menos % de notas 0–6
export const calcNps = (notas: number[]) => notas.length ? Math.round((notas.filter(n => n >= 9).length - notas.filter(n => n <= 6).length) / notas.length * 100) : null;

// ---------- questionário único (toda a jornada do cliente, enviado depois da montagem) ----------
export type Secao = { nome: string; quem: string; perguntas: string[] };
export const QUESTIONARIO_PADRAO: { titulo: string; secoes: Secao[] } = {
  titulo: "Como foi a sua experiência com a Aliança?",
  secoes: [
    { nome: "Venda", quem: "Vendedor", perguntas: ["Atenção e cordialidade do vendedor", "Clareza do projeto e do orçamento"] },
    { nome: "Medição", quem: "Medidor", perguntas: ["Como foi a visita de medição", "Pontualidade", "Cordialidade de quem fez a medição"] },
    { nome: "Checklist", quem: "Projetista", perguntas: ["Como foi a sua experiência no checklist", "As explicações foram claras?"] },
    { nome: "Entrega", quem: "Entregador", perguntas: ["O prazo de entrega foi dentro do combinado?", "Atendimento do entregador"] },
    { nome: "Montagem", quem: "Montador", perguntas: ["Atendimento do montador", "Qualidade da montagem", "O resultado ficou como você esperava?"] },
  ],
};
export const msgPesquisa = (cliente: string, link: string) => {
  const p = (cliente || "").trim().split(/\s+/)[0] || ""; const nome = p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
  return `Olá${nome ? ", " + nome : ""}! Aqui é a Aliança Móveis.\n\nA montagem dos seus móveis foi concluída e queremos saber como foi a sua experiência com a gente — da compra até a montagem.\n\nLeva cerca de 2 minutos:\n${link}\n\nObrigado! Sua opinião vai direto para a gerência.`;
};
// a resposta guarda as estrelas em uma lista só, na ordem das etapas e perguntas: aqui ela volta a ser separada por etapa
export const porSecao = (secoes: Secao[], estrelas: (number | null)[]) => { let i = 0; return secoes.map(s => ({ ...s, notas: s.perguntas.map(() => estrelas[i++] ?? null) })); };
