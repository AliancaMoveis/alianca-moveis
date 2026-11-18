// 👔 Vendedores do Exact sem usuário no 360.
// O relatório do Exact traz o nome de quem vendeu. Quando esse nome não tem ninguém do 360 por trás,
// a venda aparece e não dá para atribuí-la a pessoa nenhuma — era o caso do "José Luiz Denner Ferreira".
// Aqui cada nome tem duas saídas: VINCULAR a quem já existe (nome escrito diferente, erro de digitação)
// ou CRIAR o usuário, como freelancer e nada mais.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtDate } from "../lib/regras";
import { ehVendedor, toksNome } from "../lib/vendaExact";

type Pend = { nome: string; chave: string; vendas: number; ultima: string | null; sugestao_id: string | null; sugestao_nome: string | null };

/** nome curto para o cadastro: primeiro nome + último sobrenome ("José Luiz Denner Ferreira" → "José Luiz Ferreira"),
 *  que é o jeito que a loja chama as pessoas nas listas do 360 */
export function nomeCurto(ex: string) {
  const bruto = String(ex || "").trim().toLowerCase().replace(/(^|[\s'])\S/g, c => c.toUpperCase());
  const t = bruto.split(/\s+/).filter(x => x.length > 1 && !["Da", "De", "Do", "Das", "Dos", "E"].includes(x));
  if (t.length <= 2) return t.join(" ");
  return t[0] + " " + t[t.length - 1];
}
/** e-mail do padrão da casa: primeiro.ultimo@alianca360.com.br */
export function emailDe(ex: string) {
  const t = toksNome(ex).map(x => x.toLowerCase());
  if (!t.length) return "";
  const base = t.length === 1 ? t[0] : t[0] + "." + t[t.length - 1];
  return base + "@alianca360.com.br";
}
const senhaInicial = () => "Alianca" + Math.floor(1000 + Math.random() * 9000);

export default function VendedoresExact() {
  const { st, R, toast, recarregar } = useApp() as any;
  const [lista, setLista] = useState<Pend[] | null>(null);
  const [vinc, setVinc] = useState<Record<string, string>>({});   // nome do Exact → id escolhido ("" = criar)
  const [nomes, setNomes] = useState<Record<string, string>>({});  // nome do Exact → nome do cadastro
  const [feito, setFeito] = useState<Record<string, string>>({});  // nome do Exact → o que aconteceu
  const [rodando, setRodando] = useState(false);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const vendedores = useMemo(() => st.usuarios.filter((u: any) => ehVendedor(u)).sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR")), [st.usuarios]);

  const carregar = async () => {
    try {
      const [p, m] = await Promise.all([A.vendedoresExactPendentes(), A.vendedorExactMapa()]);
      setLista((p || []) as Pend[]); setMapa(m);
      const nv: Record<string, string> = {}, nn: Record<string, string> = {};
      for (const x of (p || []) as Pend[]) { nv[x.nome] = x.sugestao_id || ""; nn[x.nome] = nomeCurto(x.nome); }
      setVinc(nv); setNomes(nn);
    } catch (e: any) { toast(e.message); setLista([]); }
  };
  useEffect(() => { carregar(); }, []);

  async function aplicar(x: Pend) {
    const id = vinc[x.nome] || "";
    try {
      if (id) {
        await A.vendedorExactVincular(x.nome, id);
        setFeito(f => ({ ...f, [x.nome]: "vinculado a " + (st.usuarios.find((u: any) => u.id === id)?.nome || "—") }));
        return true;
      }
      const nome = (nomes[x.nome] || "").trim();
      if (nome.length < 3) { toast("Informe o nome de " + x.nome); return false; }
      // criado como freelancer e só: o setor de vendedor (é o que faz aparecer nas listas) e nada mais.
      // fazProjeto = false: não entra como projetista do checklist.
      const id2 = await A.vendedorCadastrar(nome, emailDe(x.nome), senhaInicial(), true, false);
      if (!id2) { toast("Não criou " + nome); return false; }
      await A.vendedorExactVincular(x.nome, id2);
      setFeito(f => ({ ...f, [x.nome]: "criado como freelancer" }));
      return true;
    } catch (e: any) { toast(x.nome + ": " + (e.message || "erro")); return false; }
  }

  async function aplicarTudo() {
    if (!lista) return;
    const falta = lista.filter(x => !feito[x.nome]);
    if (!confirm(`Aplicar os ${falta.length} nomes?\n\n` +
      `• ${falta.filter(x => vinc[x.nome]).length} vão ser vinculados a um usuário que já existe\n` +
      `• ${falta.filter(x => !vinc[x.nome]).length} vão ser criados como freelancer (só o setor de vendedor, nada mais)\n\n` +
      `Dá para desfazer: o vínculo é removido aqui e o usuário criado é desativado na Administração.`)) return;
    setRodando(true);
    let ok = 0;
    for (const x of falta) if (await aplicar(x)) ok++;
    setRodando(false);
    toast(ok + " de " + falta.length + " aplicados");
    await recarregar(); carregar();
  }

  const jaVinculados = Object.keys(mapa).length;
  return (
    <section className="view active">
      <div className="view-head"><div><h2>👔 Vendedores do Exact</h2>
        <p>Nomes que vêm no relatório do Exact e não têm ninguém do 360 por trás. Enquanto ficam assim, a venda aparece e não dá para escolher o vendedor. Vincule a quem já existe ou crie o usuário.</p></div>
        <button className="btn ghost sm" onClick={carregar}>↻ Atualizar</button></div>

      {jaVinculados > 0 && <div className="cp-card hint" style={{ marginBottom: 10 }}>{jaVinculados} nome(s) do Exact já estão vinculados a um usuário do 360.</div>}

      {lista === null ? <div className="hint">Carregando…</div> : !lista.length ? <div className="cp-card hint">Todos os vendedores do Exact têm usuário no 360. 👍</div> : <>
        <div className="cp-card" style={{ marginBottom: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b>{lista.length} nome(s) pendente(s)</b>
          <span className="hint" style={{ margin: 0 }}>{lista.filter(x => vinc[x.nome]).length} para vincular · {lista.filter(x => !vinc[x.nome]).length} para criar</span>
          {R.ehGestao() && <button className="btn primary" style={{ marginLeft: "auto" }} disabled={rodando} onClick={aplicarTudo}>{rodando ? "Aplicando…" : "Aplicar todos"}</button>}
        </div>
        <table className="ng-tab">
          <thead><tr><th>Nome no Exact</th><th>Vendas</th><th>Última</th><th>O que fazer</th><th>Nome no 360</th><th></th></tr></thead>
          <tbody>{lista.map(x => {
            const pronto = feito[x.nome];
            return <tr key={x.nome} style={pronto ? { opacity: .55 } : undefined}>
              <td><b>{x.nome}</b></td>
              <td>{x.vendas}</td>
              <td>{x.ultima ? fmtDate(x.ultima) : "—"}</td>
              <td><select value={vinc[x.nome] || ""} disabled={!!pronto} onChange={e => setVinc(v => ({ ...v, [x.nome]: e.target.value }))} style={{ minWidth: 190, fontSize: 12.5 }}>
                <option value="">➕ Criar como freelancer</option>
                {vendedores.map((u: any) => <option key={u.id} value={u.id}>🔗 {u.nome}{u.ativo ? "" : " (inativo)"}</option>)}
              </select></td>
              <td>{vinc[x.nome] ? <span className="hint" style={{ margin: 0 }}>usa o cadastro que já existe</span>
                : <input value={nomes[x.nome] || ""} disabled={!!pronto} onChange={e => setNomes(n => ({ ...n, [x.nome]: e.target.value }))} style={{ fontSize: 12.5, width: 160 }} />}</td>
              <td>{pronto ? <b style={{ color: "var(--st-concluida)", fontSize: 12 }}>✓ {pronto}</b>
                : R.ehGestao() ? <button className="btn sm" disabled={rodando} onClick={async () => { if (await aplicar(x)) { await recarregar(); } }}>Aplicar</button> : null}</td>
            </tr>; })}</tbody>
        </table>
        <div className="hint" style={{ marginTop: 8 }}>
          Quem é criado aqui entra como <b>freelancer</b>, com o setor de vendedor e mais nada — sem projetista, sem agenda, sem outro acesso.
          O e-mail segue o padrão da casa e a senha inicial é gerada; para a pessoa entrar no 360, redefina a senha na Administração.
          O nome no 360 vem do Exact encurtado (primeiro nome + último sobrenome) e você pode corrigir antes de aplicar.
        </div>
      </>}
    </section>
  );
}
