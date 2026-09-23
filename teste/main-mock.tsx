import ReactDOM from "react-dom/client";
import "../src/estilo.css";
import { AppProvider } from "../src/estado";
import Shell from "../src/telas/Shell";
import { Overlays } from "../src/comp/Overlays";
import { estadoMock } from "./mock";

const uid = new URLSearchParams(location.search).get("uid")!;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <AppProvider uid={uid} inicial={estadoMock()} overlays={(o) => <Overlays {...o} />}><Shell /></AppProvider>
);
