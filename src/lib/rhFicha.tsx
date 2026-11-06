// Ficha cadastral do funcionário — os MESMOS campos na ficha do RH e no link de admissão do novo contratado.
// Campos que já eram colunas (nome, cpf, rg, nascimento, telefone, email, endereco, estado_civil, escolaridade, pis, ctps,
// emergencia_*, banco/agencia/conta, dependentes) continuam nas colunas; o resto fica em rh_funcionarios.ficha (jsonb).
import { fmtCpf } from "./rh";

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
export const GRAU_INSTRUCAO = ["Analfabeto", "Fundamental incompleto", "Fundamental completo", "Médio incompleto", "Médio completo", "Técnico", "Superior incompleto", "Superior completo", "Pós-graduação", "Mestrado", "Doutorado"];
export const MOTIVOS_DESLIG = ["Pedido de demissão", "Dispensa sem justa causa", "Dispensa com justa causa", "Término do contrato de experiência", "Término de contrato determinado", "Acordo entre as partes (art. 484-A)", "Rescisão indireta", "Aposentadoria", "Falecimento", "Abandono de emprego", "Outro"];
export const ESTADO_CIVIL = ["Solteiro(a)", "Casado(a)", "União estável", "Separado(a)", "Divorciado(a)", "Viúvo(a)"];
export const COLUNAS = ["nome", "cpf", "rg", "nascimento", "telefone", "email", "endereco", "estado_civil", "escolaridade", "pis", "ctps", "emergencia_nome", "emergencia_tel", "banco", "agencia", "conta", "dependentes"];
export const FICHA_PADRAO: Record<string, any> = {
  nome_social: "", pais_nasc: "Brasil", uf_nasc: "", municipio_nasc: "", sexo: "", raca: "",
  rg_orgao: "", rg_uf: "", rg_emissao: "", titulo_num: "", titulo_zona: "", titulo_secao: "",
  reservista_num: "", reservista_cat: "", cnh_num: "", cnh_cat: "", cnh_venc: "",
  tem_dependentes: "", conjuge_nome: "", pai_nome: "", mae_nome: "", pcd: "", pcd_qual: "",
  emergencia2_nome: "", emergencia2_tel: "", santander: "", desligamento_motivo: "", desligamento_obs: "",
};
/** documentos que se anexam em cada parte da ficha (campo = tipo do documento) */
export const DOCS_FICHA: [string, string][] = [
  ["rg_cpf", "Identidade (RG) e CPF"], ["titulo", "Título de eleitor"], ["reservista", "Carteira de reservista"], ["cnh", "Carteira de motorista (CNH)"],
  ["ctps", "Carteira de trabalho (CTPS)"], ["pis", "Comprovante do PIS"], ["certidao", "Certidão de casamento / divórcio"],
  ["dep_rg_certidao", "Dependente · RG ou certidão de nascimento"], ["dep_cpf", "Dependente · CPF"], ["dep_matricula", "Dependente · comprovante de matrícula atualizado"], ["dep_vacina", "Dependente · carteirinha de vacinação"],
  ["antecedentes", "Certidão de antecedentes criminais"], ["pcd", "Laudo / comprovante da deficiência"], ["residencia", "Comprovante de residência"], ["banco", "Comprovante da conta Santander"], ["foto", "Foto de rosto (3×4)"],
];

/** junta colunas + ficha num objeto só (para o formulário) */
export const abrirFicha = (f: any) => ({ ...FICHA_PADRAO, ...(f?.ficha || {}), ...f, dependentes: f?.dependentes || [] });
/** separa de volta: colunas + ficha */
export function separarFicha(d: any) {
  const col: any = {}; const ficha: any = {};
  Object.keys(FICHA_PADRAO).forEach(k => (ficha[k] = d[k] ?? ""));
  COLUNAS.forEach(k => { if (k in d) col[k] = d[k]; });
  if (col.nascimento === "") col.nascimento = null;
  if (d.santander === "sim") col.banco = "Santander (033)"; else if (d.santander === "nao") { col.banco = ""; col.agencia = ""; col.conta = ""; }
  return { col, ficha };
}

type Props = { f: any; set: (f: any) => void; anexo: (campo: string, rotulo: string) => any; publico?: boolean };
/** os campos da ficha, em seções; `anexo` desenha o botão de anexar de cada documento */
export function CamposFicha({ f, set, anexo, publico }: Props) {
  const v = (k: string) => f[k] ?? "";
  const muda = (k: string, x: any) => set({ ...f, [k]: x });
  const T = (k: string, rotulo: string, props: any = {}) => <div className="field"><label>{rotulo}</label><input value={v(k)} onChange={e => muda(k, k === "cpf" ? fmtCpf(e.target.value) : e.target.value)} {...props} /></div>;
  const D = (k: string, rotulo: string) => <div className="field"><label>{rotulo}</label><input type="date" value={v(k) || ""} onChange={e => muda(k, e.target.value || (k === "nascimento" ? null : ""))} /></div>;
  const S = (k: string, rotulo: string, ops: string[]) => <div className="field"><label>{rotulo}</label><select value={v(k)} onChange={e => muda(k, e.target.value)}><option value="">—</option>{ops.map(o => <option key={o}>{o}</option>)}{v(k) && !ops.includes(v(k)) ? <option>{v(k)}</option> : null}</select></div>;
  const SN = (k: string, rotulo: string) => <div className="field"><label>{rotulo}</label><div className="rhf-sn">{[["sim", "Sim"], ["nao", "Não"]].map(([x, l]) => <button type="button" key={x} className={v(k) === x ? "on" : ""} onClick={() => muda(k, x)}>{l}</button>)}</div></div>;
  const H = (t: string) => <h4 className="rhf-h">{t}</h4>;
  const deps: any[] = f.dependentes || [];
  const casado = ["Casado(a)", "União estável", "Separado(a)", "Divorciado(a)", "Viúvo(a)"].includes(v("estado_civil"));
  return (
    <div className="rhf">
      <style>{".rhf .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.rhf .g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:760px){.rhf .g3,.rhf .g2{grid-template-columns:1fr}}.rhf-h{margin:18px 0 6px}.rhf-sn{display:flex;gap:6px}.rhf-sn button{flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-weight:700;cursor:pointer}.rhf-sn button.on{background:var(--primary);color:var(--primary-ink);border-color:var(--primary)}.rhf-docs{display:grid;gap:6px;margin:6px 0 4px}"}</style>
      {H("Dados pessoais")}
      <div className="g3">
        {T("nome", "Nome completo *")}{T("nome_social", "Nome social")}{D("nascimento", "Data de nascimento")}
        {T("pais_nasc", "País de nascimento")}{S("uf_nasc", "UF de nascimento", UFS)}{T("municipio_nasc", "Município de nascimento")}
        {S("sexo", "Sexo", ["Feminino", "Masculino"])}{S("raca", "Raça / cor", ["Indígena", "Branca", "Parda", "Preta", "Amarela"])}{S("escolaridade", "Grau de instrução", GRAU_INSTRUCAO)}
        {T("email", "E-mail", { type: "email" })}{T("telefone", "Telefone / WhatsApp (com DDD)" + (publico ? " *" : ""), { inputMode: "tel" })}{T("cpf", "CPF" + (publico ? " *" : ""), { inputMode: "numeric", placeholder: "000.000.000-00" })}
      </div>
      {T("endereco", "Endereço completo (rua, nº, complemento, bairro, cidade, CEP)")}
      <div className="rhf-docs">{anexo("residencia", "Comprovante de residência")}{anexo("foto", "Foto de rosto (3×4)")}</div>

      {H("Identidade")}
      <div className="g3">{T("rg", "Número da identidade (RG)")}{T("rg_orgao", "Órgão de expedição")}{S("rg_uf", "UF", UFS)}{D("rg_emissao", "Data de emissão")}</div>
      <div className="rhf-docs">{anexo("rg_cpf", "Identidade (RG) e CPF — frente e verso" + (publico ? " *" : ""))}</div>

      {H("Título de eleitor")}
      <div className="g3">{T("titulo_num", "Número do título")}{T("titulo_zona", "Zona eleitoral")}{T("titulo_secao", "Seção eleitoral")}</div>
      <div className="rhf-docs">{anexo("titulo", "Título de eleitor")}</div>

      {H("Carteira de reservista")}
      <div className="g3">{T("reservista_num", "Número da reservista")}{T("reservista_cat", "Categoria da reservista")}</div>
      <div className="rhf-docs">{anexo("reservista", "Carteira de reservista")}</div>

      {H("Carteira de motorista (CNH)")}
      <div className="g3">{T("cnh_num", "Número da CNH")}{S("cnh_cat", "Categoria", ["A", "B", "AB", "C", "D", "E", "AC", "AD", "AE"])}{D("cnh_venc", "Vencimento")}</div>
      <div className="rhf-docs">{anexo("cnh", "Carteira de motorista")}</div>

      {H("Carteira de trabalho e PIS")}
      <div className="g3">{T("ctps", "Número da carteira profissional (CTPS)")}{T("pis", "Número do PIS")}</div>
      <div className="rhf-docs">{anexo("ctps", "Carteira de trabalho (física ou digital)")}{anexo("pis", "Comprovante do PIS")}</div>

      {H("Antecedentes criminais")}
      <p className="hint" style={{ margin: "0 0 6px" }}>Emita a certidão de antecedentes criminais (gratuita, pela internet) no <a href="https://www.gov.br/pt-br/servicos/emitir-certidao-de-antecedentes-criminais" target="_blank" rel="noreferrer">gov.br (Polícia Federal)</a> e anexe o PDF ou uma foto.</p>
      <div className="rhf-docs">{anexo("antecedentes", "Certidão de antecedentes criminais")}</div>

      {H("Família")}
      <div className="g3">{S("estado_civil", "Estado civil", ESTADO_CIVIL)}{casado ? T("conjuge_nome", "Nome do cônjuge") : <div />}<div />{T("pai_nome", "Nome do pai")}{T("mae_nome", "Nome da mãe")}</div>
      {casado && <div className="rhf-docs">{anexo("certidao", "Certidão de casamento / divórcio")}</div>}
      <div className="g3">{SN("tem_dependentes", "Possui dependentes?")}</div>
      {v("tem_dependentes") === "sim" && <>
        {deps.map((x: any, i: number) => <div className="g3" key={i} style={{ alignItems: "end" }}>
          <div className="field"><label>Nome do dependente</label><input value={x.nome || ""} onChange={e => muda("dependentes", deps.map((y, j) => j === i ? { ...y, nome: e.target.value } : y))} /></div>
          <div className="field"><label>Nascimento</label><input type="date" value={x.nascimento || ""} onChange={e => muda("dependentes", deps.map((y, j) => j === i ? { ...y, nascimento: e.target.value } : y))} /></div>
          <div className="field"><label>CPF</label><div style={{ display: "flex", gap: 6 }}><input value={x.cpf || ""} inputMode="numeric" onChange={e => muda("dependentes", deps.map((y, j) => j === i ? { ...y, cpf: fmtCpf(e.target.value) } : y))} /><button type="button" className="btn sm" onClick={() => muda("dependentes", deps.filter((_y, j) => j !== i))}>✕</button></div></div>
        </div>)}
        <button type="button" className="btn sm" onClick={() => muda("dependentes", [...deps, { nome: "", nascimento: "", cpf: "" }])}>＋ Adicionar dependente</button>
        <div className="rhf-docs" style={{ marginTop: 8 }}>{anexo("dep_rg_certidao", "Dependente · RG ou certidão de nascimento")}{anexo("dep_cpf", "Dependente · CPF")}{anexo("dep_matricula", "Dependente · comprovante de matrícula atualizado")}{anexo("dep_vacina", "Dependente · carteirinha de vacinação")}</div>
      </>}

      {H("Pessoa com deficiência")}
      <div className="g3">{SN("pcd", "Portador de deficiência?")}{v("pcd") === "sim" ? <div className="field" style={{ gridColumn: "span 2" }}><label>Qual? (observações)</label><textarea rows={2} value={v("pcd_qual")} onChange={e => muda("pcd_qual", e.target.value)} /></div> : null}</div>
      {v("pcd") === "sim" && <div className="rhf-docs">{anexo("pcd", "Laudo / comprovante da deficiência")}</div>}

      {H("Telefones de emergência")}
      <div className="g2">{T("emergencia_nome", "1 · Nome / parentesco")}{T("emergencia_tel", "1 · Telefone", { inputMode: "tel" })}{T("emergencia2_nome", "2 · Nome / parentesco")}{T("emergencia2_tel", "2 · Telefone", { inputMode: "tel" })}</div>

      {H("Dados bancários")}
      <div className="g3">{SN("santander", "Tem conta no Santander?")}{v("santander") === "sim" ? <>{T("agencia", "Agência (Santander)")}{T("conta", "Conta (Santander)")}</> : null}</div>
      {v("santander") === "sim" ? <div className="rhf-docs">{anexo("banco", "Comprovante da conta Santander (cartão ou print do app)")}</div>
        : v("santander") === "nao" ? <p className="hint">Só cadastramos conta do Santander. Sem conta no Santander, o RH orienta a abertura.</p> : null}
    </div>
  );
}
