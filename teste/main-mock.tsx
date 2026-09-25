import ReactDOM from "react-dom/client";
import "../src/estilo.css";
import { AppProvider } from "../src/estado";
import Raiz from "../src/movel/Raiz";
import { Overlays } from "../src/comp/Overlays";
import { estadoMock } from "./mock";
import AgendaPublica from "../src/telas/AgendaPublica";

{ const d = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
  (window as any).__metasMock = [{ dia: d(0), meta: 3, valor: 100, obs: "Meta do dia" }, { dia: d(2), meta: 2, valor: 100, obs: "" }, { dia: d(4), meta: 1, valor: 50, obs: "" }]; }
(window as any).__roteirosMock = [
  { id: "r1", categoria: "reclamacao_externa", situacao: "Cliente ameaça o Reclame Aqui", cliente_diz: "Vou colocar no Reclame Aqui!", resposta: "Entendo, e o senhor tem esse direito. Me dá a chance de resolver antes?", no_sistema: "Marcar urgente e avisar a Supervisão.", evitar: "Discutir.", status: "aprovado", autor_id: "", autor_nome: "Treinamento inicial" },
  { id: "r2", categoria: "entrega", situacao: "Móvel disponível no depósito", cliente_diz: "Quando vocês entregam?", resposta: "Tenho terça ou quinta, manhã ou tarde.", no_sistema: "Colocar para entrega (Tático).", evitar: "", status: "aprovado", autor_id: "", autor_nome: "Treinamento inicial" },
  { id: "r3", categoria: "geral", situacao: "Sugestão da Rafaela", cliente_diz: "Teste", resposta: "Resposta", no_sistema: "", evitar: "", status: "sugestao", autor_id: "00000000-0000-4000-a000-000000000001", autor_nome: "Rafaela Lima" },
];
(window as any).__agendaPublicaMock = [
  { id: "M1", hora: "09:00", cliente: "Marina Kowalski", vendedor: "Vendedora — Giovanna", consultor: "", origem: "marketing", situacao: "finalizado", quer_projeto: false, pedido_vendedor: "" },
  { id: "M2", hora: "10:30", cliente: "Heloísa Brandt", vendedor: "Vendedor — Roy", consultor: "Consultor — Anderson", origem: "externo", situacao: "em_atendimento", quer_projeto: true, pedido_vendedor: "", em_atendimento: new Date().toISOString() },
  { id: "M3", hora: "11:00", cliente: "Paulo Henrique Souza", vendedor: "", consultor: "", origem: "marketing", situacao: "sem_vendedor", quer_projeto: false, pedido_vendedor: "" },
  { id: "M4", hora: "14:00", assumido: true, externo: true, cliente: "Douglas Reinert", vendedor: "Pedro Almeida", consultor: "", origem: "marketing", situacao: "com_vendedor", quer_projeto: false, pedido_vendedor: "" },
  { id: "M5", hora: "15:30", cliente: "Camila Duarte", vendedor: "", consultor: "Consultor — Priscila", origem: "externo", situacao: "sem_vendedor", quer_projeto: true, pedido_vendedor: "Vendedor — Roy" },
  { id: "M6", hora: "17:00", cliente: "Marcos Vinícius", vendedor: "", consultor: "", origem: "marketing", situacao: "sem_vendedor", quer_projeto: false, pedido_vendedor: "" },
  { id: "M7", hora: "18:30", assumido: true, cliente: "Rodrigo Mattos", vendedor: "Vendedor — Roy", consultor: "Consultor — Anderson", origem: "externo", situacao: "com_vendedor", quer_projeto: false, pedido_vendedor: "" },
];
const uid = new URLSearchParams(location.search).get("uid")!;
if (new URLSearchParams(location.search).get("loja") !== null) ReactDOM.createRoot(document.getElementById("root")!).render(<AgendaPublica />);
else ReactDOM.createRoot(document.getElementById("root")!).render(
  <AppProvider uid={uid} inicial={estadoMock()} overlays={(o) => <Overlays {...o} />}><Raiz /></AppProvider>
);
