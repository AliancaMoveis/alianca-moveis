// Campo de senha com o "olhinho" para mostrar/ocultar o que foi digitado.
import { useState, type InputHTMLAttributes } from "react";

export default function Senha(p: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [ver, setVer] = useState(false);
  return <span className="senha-box">
    <input {...p} type={ver ? "text" : "password"} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
    <button type="button" className="senha-olho" tabIndex={-1} onClick={() => setVer(!ver)} aria-label={ver ? "Ocultar senha" : "Mostrar senha"} title={ver ? "Ocultar senha" : "Mostrar senha"}>
      {ver
        ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
    </button>
  </span>;
}
