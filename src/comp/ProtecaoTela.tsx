// Rede de segurança: se alguma tela quebrar por um erro inesperado, em vez de ficar toda branca mostra um aviso
// e recarrega sozinha (no máximo 1 vez por minuto, para não ficar em laço). A tela da loja (TV) volta sozinha.
import React from "react";

export default class ProtecaoTela extends React.Component<{ children: React.ReactNode }, { erro: boolean; msg: string }> {
  state = { erro: false, msg: "" };
  timer: any = null;
  static getDerivedStateFromError(e: any) { return { erro: true, msg: String((e && (e.stack || e.message)) || e || "").split("\n").slice(0, 4).join(" · ").slice(0, 380) }; }
  componentDidCatch(e: any) {
    try { console.error("Erro de tela:", e); } catch { /* sem console */ }
    let pode = true;
    try { const u = Number(sessionStorage.getItem("recarga_erro") || 0); pode = Date.now() - u > 60000; if (pode) sessionStorage.setItem("recarga_erro", String(Date.now())); } catch { /* sem storage */ }
    if (pode) this.timer = setTimeout(() => location.reload(), 5000);
  }
  componentWillUnmount() { clearTimeout(this.timer); }
  render() {
    if (!this.state.erro) return this.props.children;
    return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, font: "16px system-ui,sans-serif", color: "#1B1F23", background: "#F6F5F1", padding: 24, textAlign: "center" }}>
      <b style={{ fontSize: 20 }}>Algo não carregou direito</b>
      <span>Vamos recarregar a tela em instantes. Se não voltar, clique no botão.</span>
      {this.state.msg && <code style={{ maxWidth: 720, fontSize: 12, color: "#5F6670", wordBreak: "break-word" }}>Detalhe técnico: {this.state.msg}</code>}
      <button onClick={() => location.reload()} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: "#0F6E5C", color: "#fff", font: "600 15px system-ui,sans-serif", cursor: "pointer" }}>Recarregar agora</button>
    </div>;
  }
}
