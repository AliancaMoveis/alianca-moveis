import React from "react";
import ReactDOM from "react-dom/client";
import "./estilo.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

// aplicativo instalável (PWA)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => null); });
}

// versão nova publicada: o app instalado no celular fica aberto dias sem recarregar.
// Ao voltar para o app (ou a cada 10 min), confere se o sistema foi atualizado e recarrega sozinho.
if (import.meta.env.PROD) {
  const atual = () => Array.from(document.querySelectorAll('script[type="module"][src*="/assets/"]')).map(s => (s as HTMLScriptElement).src.split("/assets/")[1]).join(",");
  const minha = atual();
  let ult = 0;
  const conferir = async () => {
    if (Date.now() - ult < 60000) return; ult = Date.now();
    try {
      const html = await (await fetch("/?v=" + Date.now(), { cache: "no-store" })).text();
      const nova = Array.from(html.matchAll(/src="\/assets\/([^"]+\.js)"/g)).map(m => m[1]).join(",");
      if (nova && minha && nova !== minha && !document.querySelector("textarea:focus, input:focus")) location.reload();
    } catch { /* sem rede */ }
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") conferir(); });
  setInterval(conferir, 600000);
}
