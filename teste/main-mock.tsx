import ReactDOM from "react-dom/client";
import "../src/estilo.css";
import { AppProvider } from "../src/estado";
import Raiz from "../src/movel/Raiz";
import { Overlays } from "../src/comp/Overlays";
import { estadoMock } from "./mock";

{ const d = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
  (window as any).__metasMock = [{ dia: d(0), meta: 3, valor: 100, obs: "Meta do dia" }, { dia: d(2), meta: 2, valor: 100, obs: "" }, { dia: d(4), meta: 1, valor: 50, obs: "" }]; }
(window as any).__roteirosMock = [
  { id: "r1", categoria: "reclamacao_externa", situacao: "Cliente ameaça o Reclame Aqui", cliente_diz: "Vou colocar no Reclame Aqui!", resposta: "Entendo, e o senhor tem esse direito. Me dá a chance de resolver antes?", no_sistema: "Marcar urgente e avisar a Supervisão.", evitar: "Discutir.", status: "aprovado", autor_id: "", autor_nome: "Treinamento inicial" },
  { id: "r2", categoria: "entrega", situacao: "Móvel disponível no depósito", cliente_diz: "Quando vocês entregam?", resposta: "Tenho terça ou quinta, manhã ou tarde.", no_sistema: "Colocar para entrega (Tático).", evitar: "", status: "aprovado", autor_id: "", autor_nome: "Treinamento inicial" },
  { id: "r3", categoria: "geral", situacao: "Sugestão da Rafaela", cliente_diz: "Teste", resposta: "Resposta", no_sistema: "", evitar: "", status: "sugestao", autor_id: "00000000-0000-4000-a000-000000000001", autor_nome: "Rafaela Lima" },
];
const uid = new URLSearchParams(location.search).get("uid")!;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <AppProvider uid={uid} inicial={estadoMock()} overlays={(o) => <Overlays {...o} />}><Raiz /></AppProvider>
);
