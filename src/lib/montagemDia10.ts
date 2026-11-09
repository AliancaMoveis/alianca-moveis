// Montador que recebe só no pagamento do dia 10: no dia 10 recebe a quinzena passada (10 a 24) + a retrasada (25 a 09);
// no pagamento do dia 25 ele não entra. A marcação fica na observação da conta do montador (Contas para pagamento).
export const TAG_DIA10 = "[recebe só no dia 10]";
export const pagaDia10 = (conta: any) => !!conta && typeof conta.obs === "string" && conta.obs.includes(TAG_DIA10);
export const obsSemTag = (obs: string) => (obs || "").replace(TAG_DIA10, "").trim();
export const obsComTag = (obs: string, on: boolean) => { const s = obsSemTag(obs); return on ? (TAG_DIA10 + (s ? " " + s : "")) : s; };
