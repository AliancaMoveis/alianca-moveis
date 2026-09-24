import React from "react";
import ReactDOM from "react-dom/client";
import "./estilo.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

// aplicativo instalável (PWA)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => null); });
}
