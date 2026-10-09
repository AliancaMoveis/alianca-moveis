import React from "react";
import ReactDOM from "react-dom/client";
import "./estilo.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

// aplicativo instalável (PWA)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => null); });
}

// versão nova publicada: o app fica aberto dias sem recarregar.
// Não recarrega no meio do trabalho: mostra um aviso "Atualizar" e só recarrega sozinho se a pessoa estava fora (aba escondida há 15+ min).
if (import.meta.env.PROD) {
  const atual = () => Array.from(document.querySelectorAll('script[type="module"][src*="/assets/"]')).map(s => (s as HTMLScriptElement).src.split("/assets/")[1]).join(",");
  const minha = atual();
  let ult = 0, escondidaDesde = 0, temNova = false;
  const aviso = () => {
    if (document.getElementById("aviso-versao")) return;
    const b = document.createElement("button");
    b.id = "aviso-versao"; b.type = "button";
    b.textContent = "🔄 Nova versão do 360 — clique para atualizar";
    b.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;padding:10px 16px;border-radius:10px;border:0;background:#1f5ad6;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer";
    b.onclick = () => location.reload();
    document.body.appendChild(b);
  };
  const conferir = async (foraMs = 0) => {
    if (!temNova) {
      if (Date.now() - ult < 60000) return; ult = Date.now();
      try {
        const html = await (await fetch("/?v=" + Date.now(), { cache: "no-store" })).text();
        const nova = Array.from(html.matchAll(/src="\/assets\/([^"]+\.js)"/g)).map(m => m[1]).join(",");
        temNova = !!(nova && minha && nova !== minha);
      } catch { /* sem rede */ }
    }
    if (!temNova) return;
    const longe = foraMs > 15 * 60000;
    if (longe && !document.querySelector(".modal, textarea:focus, input:focus")) location.reload(); else aviso();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") escondidaDesde = Date.now();
    else { const fora = escondidaDesde ? Date.now() - escondidaDesde : 0; escondidaDesde = 0; conferir(fora); }
  });
  setInterval(() => conferir(0), 600000);
}
