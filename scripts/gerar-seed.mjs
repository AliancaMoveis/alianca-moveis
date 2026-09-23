// Gera supabase/seed/seed.sql a partir do seed() do protótipo (REFERENCIA-sistema-atual.html),
// para que os dados de exemplo sejam idênticos (mesmos clientes, estágios e histórico).
// Uso: node scripts/gerar-seed.mjs <caminho do REFERENCIA.html> <senha de teste>
import fs from "node:fs";
import path from "node:path";

const [, , refPath, senha] = process.argv;
if (!refPath || !senha) { console.error("uso: node gerar-seed.mjs REFERENCIA.html SENHA"); process.exit(1); }
const html = fs.readFileSync(refPath, "utf8");
const ini = html.indexOf("async function seed(){");
const fim = html.indexOf("// ---- navegação por perfil ----");
const seedSrc = html.slice(ini, fim);

// --- contexto mínimo que o seed() usa ---
const TIPOS = {
  entrega:{nome:"Solicitação de entrega",destino:"callcenter"},prazo_fabrica:{nome:"Prazo de fábrica",destino:"prazo_fabrica"},
  montagem:{nome:"Solicitação de montagem",destino:"montagem"},assistencia:{nome:"Solicitação de assistência",destino:"assistencia"},
  vistoria:{nome:"Solicitação de vistoria",destino:"assistencia"},checklist:{nome:"Agendamento de checklist",destino:"checklist"},
  medidas:{nome:"Solicitação de medidas",destino:"medidas"},visita_consultor:{nome:"Visita técnica — consultor externo",destino:"marketing_supervisao",presale:true},
  agendamento_loja:{nome:"Agendamento direto na loja",destino:"suporte_consultores",presale:true,direto:true},outros:{nome:"Outros",destino:"callcenter"}
};
const state = { setores: [], usuarios: [], representantes: [], fabricas: [], chamados: [], seq: 0, roteamento: {}, config: {} };
const destinoDe = t => TIPOS[t].destino;
const SLA_DIAS = 2;
function addDiasUteis(date,dias){const d=new Date(date);let a=0;while(a<dias){d.setDate(d.getDate()+1);const w=d.getDay();if(w!==0&&w!==6)a++;}return d;}
const save = async () => {};
// Gestão passa a ser o usuário real do Bruno
const src = seedSrc.replace('{id:"u7",nome:"Gestão",setores:["gestao"]}', '{id:"u7",nome:"Bruno Fiaron",setores:["gestao"]}');
const fn = new Function("state","TIPOS","destinoDe","SLA_DIAS","addDiasUteis","save", src + "\nreturn seed();");
await fn(state, TIPOS, destinoDe, SLA_DIAS, addDiasUteis, save);

// --- mapeamentos ---
const UID = {};
const EMAIL = {
  u7: "bruno.fiaron@aliancamoveis.com.br", u1: "rafaela@alianca360.teste", u2: "camila@alianca360.teste",
  u3: "diego@alianca360.teste", u4: "brunosa@alianca360.teste", u5: "paula@alianca360.teste",
  u8: "fernanda@alianca360.teste", u9: "igor@alianca360.teste", u10: "ana@alianca360.teste",
  u13: "marcelo@alianca360.teste", u11: "anderson@alianca360.teste", u12: "priscila@alianca360.teste",
  u14: "carla@alianca360.teste", u15: "roy@alianca360.teste", u16: "giovanna@alianca360.teste", u6: "supervisao@alianca360.teste",
};
state.usuarios.forEach(u => { const n = u.id.slice(1).padStart(12, "0"); UID[u.id] = `00000000-0000-4000-a000-${n}`; });
const FAB = {}, REP = {};
state.representantes.forEach((r, i) => REP[r.id] = `00000000-0000-4000-b000-${String(i + 1).padStart(12, "0")}`);
state.fabricas.forEach((f, i) => FAB[f.id] = `00000000-0000-4000-c000-${String(i + 1).padStart(12, "0")}`);
const porNome = {}; state.usuarios.forEach(u => porNome[u.nome] = UID[u.id]);

const q = v => v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const qs = v => `'${String(v ?? "").replace(/'/g, "''")}'`;
const ts = iso => iso ? `'${new Date(iso).toISOString()}'::timestamptz` : "null";
// protótipo guarda data/hora de parede como ISO UTC fatiado; convertemos o instante para horário de São Paulo
const local = s => {
  if (!s) return "null";
  const d = new Date(s.length === 16 ? s + ":00Z" : s);
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `'${f.replace(" ", "T")}'::timestamp`;
};
const dt = s => s ? `'${String(s).slice(0, 10)}'::date` : "null";
const moeda = v => Number(String(v).replace(/\./g, "").replace(",", "."));

let sql = `-- Dados de exemplo gerados a partir do protótipo (gerado em ${new Date().toISOString()})\n`;
sql += `-- Senha de teste de todos os usuários: definida na geração\nbegin;\n`;

// usuários (auth + perfil)
for (const u of state.usuarios) {
  const id = UID[u.id], em = EMAIL[u.id];
  sql += `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,email_change_token_current,recovery_token,phone_change,phone_change_token,reauthentication_token)
values ('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated',${qs(em)},extensions.crypt(${qs(senha)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','','','','');\n`;
  sql += `insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values (gen_random_uuid(),'${id}','${id}',jsonb_build_object('sub','${id}','email',${qs(em)},'email_verified',true),'email',now(),now(),now());\n`;
  sql += `insert into public.usuarios (id,nome,email,somente_atribuidos) values ('${id}',${qs(u.nome)},${qs(em)},${u.somenteAtribuidos ? "true" : "false"});\n`;
  u.setores.forEach((s, i) => sql += `insert into public.usuario_setores (usuario_id,setor_id,ordem) values ('${id}',${qs(s)},${i + 1});\n`);
}
for (const r of state.representantes) sql += `insert into public.representantes (id,nome,whats,email) values ('${REP[r.id]}',${qs(r.nome)},${qs(r.whats)},${qs(r.email)});\n`;
for (const f of state.fabricas) sql += `insert into public.fabricas (id,nome,emails,representante_id) values ('${FAB[f.id]}',${qs(f.nome)},${qs(f.emails)},'${REP[f.repId]}');\n`;

const anexosSeed = [];
for (const c of state.chamados) {
  const presale = !!TIPOS[c.tipo].presale;
  sql += `insert into public.chamados (id,tipo,setor_destino,status,criado_em,sla_resposta,solicitante_id,solicitante_nome,solicitante_setor,cliente,cliente_doc,telefone,email,pedido,data_venda,pedido_fabrica,produto,fabrica_id,prazo_tatico,motivo,urgente,consultor_id,atendente_id,data_visita,endereco,data_loja,status_cliente,tratativa,resposta_previsao,resposta_quem,resposta_texto,resposta_quando) values (
  ${qs(c.id)},${qs(c.tipo)},${qs(c.setorDestino)},${qs(c.status)},${ts(c.criadoEm)},${ts(c.slaResposta)},'${UID[c.solicitanteId]}',${qs(c.solicitante)},${qs(c.setor)},
  ${qs(c.cliente)},${qs(c.clienteDoc)},${qs(c.telefone)},${qs(c.email)},${qs(presale ? "" : c.pedido)},${dt(c.dataVenda)},${qs(c.pedidoFabrica)},${qs(c.produto)},${c.fabrica ? `'${FAB[c.fabrica]}'` : "null"},${dt(c.prazoTatico)},${qs(c.motivo)},${c.urgente ? "true" : "false"},
  ${c.consultorId ? `'${UID[c.consultorId]}'` : "null"},${c.atendenteId ? `'${UID[c.atendenteId]}'` : "null"},${local(c.dataVisita)},${qs(c.endereco)},${local(c.dataLoja)},${q(c.statusCliente)},${qs(JSON.stringify(c.tratativa || {}))}::jsonb,
  ${c.resposta ? dt(c.resposta.previsao) : "null"},${c.resposta ? q(c.resposta.quem) : "null"},${c.resposta ? q(c.resposta.texto) : "null"},${c.resposta ? ts(c.resposta.quando) : "null"});\n`;
  if (c.venda) {
    const v = c.venda;
    sql += `insert into public.vendas (chamado_id,numero,data_venda,vendedor,atendente_nome,status,registrado_por,registrado_em,decidido_por,decidido_em) values (${qs(c.id)},${qs(v.numero)},${dt(v.dataVenda)},${qs(v.vendedor)},${qs(v.atendenteNome)},${qs(v.status)},${c.atendenteId ? `'${UID[c.atendenteId]}'` : "null"},${ts(v.quando)},${v.status !== "registrada" ? `'${UID.u7}'` : "null"},${v.status !== "registrada" ? ts(new Date(new Date(c.criadoEm).getTime() + 13 * 3600000).toISOString()) : "null"});\n`;
    sql += `insert into public.vendas_valores (chamado_id,valor) values (${qs(c.id)},${moeda(v.valor)});\n`;
  }
  if (c.transferencia) {
    const t = c.transferencia;
    sql += `insert into public.transferencias (chamado_id,de_usuario,para_usuario,solicitado_por,status,quando) values (${qs(c.id)},'${UID[t.de]}','${UID[t.para]}','${UID[t.solicitadoPor]}','pendente',${ts(t.quando)});\n`;
  }
  for (const h of c.historico) {
    sql += `insert into public.historico (chamado_id,quando,quem_id,quem_nome,texto) values (${qs(c.id)},${ts(h.quando)},${porNome[h.quem] ? `'${porNome[h.quem]}'` : "null"},${qs(h.quem)},${qs(h.texto)});\n`;
  }
  (c.anexos || []).forEach(a => anexosSeed.push({ chamado: c.id, nome: a.nome, url: a.url }));
}
sql += `select setval('public.chamado_seq', ${state.seq});\ncommit;\n`;

fs.mkdirSync("supabase/seed", { recursive: true });
fs.writeFileSync("supabase/seed/seed.sql", sql);
fs.writeFileSync("supabase/seed/anexos-seed.json", JSON.stringify(anexosSeed));
console.log("ok:", state.usuarios.length, "usuários,", state.chamados.length, "chamados,", anexosSeed.length, "anexos; sql", sql.length, "bytes");

// ---- versão compacta (JSON) com tempos relativos a "agora", para carga via SQL ----
const T0 = Date.now();
const rel = iso => iso ? Math.round((new Date(iso).getTime() - T0) / 36000) / 100 : null; // horas
const relLocal = s => s ? rel(s.length === 16 ? s + ":00Z" : s) : null;
const compact = state.chamados.map(c => {
  const presale = !!TIPOS[c.tipo].presale;
  return {
    id: c.id, tipo: c.tipo, sd: c.setorDestino, st: c.status, cr: rel(c.criadoEm), sla: rel(c.slaResposta),
    sol: UID[c.solicitanteId], soln: c.solicitante, sols: c.setor, cli: c.cliente, doc: c.clienteDoc || "", tel: c.telefone || "",
    em: c.email || "", ped: presale ? "" : (c.pedido || ""), dv: c.dataVenda || null, pf: c.pedidoFabrica || "", pr: c.produto || "",
    fab: c.fabrica ? FAB[c.fabrica] : null, pt: c.prazoTatico || null, mo: c.motivo || "", urg: !!c.urgente,
    con: c.consultorId ? UID[c.consultorId] : null, ate: c.atendenteId ? UID[c.atendenteId] : null,
    vis: relLocal(c.dataVisita), end: c.endereco || "", loja: relLocal(c.dataLoja), sc: c.statusCliente || null, tr: c.tratativa || {},
    rp: c.resposta ? (c.resposta.previsao || null) : null, rq: c.resposta ? c.resposta.quem : null, rt: c.resposta ? c.resposta.texto : null, rw: c.resposta ? rel(c.resposta.quando) : null,
    v: c.venda ? { n: c.venda.numero, val: moeda(c.venda.valor), d: c.venda.dataVenda, vd: c.venda.vendedor, an: c.venda.atendenteNome, s: c.venda.status, q: rel(c.venda.quando), dq: c.venda.status !== "registrada" ? rel(new Date(new Date(c.criadoEm).getTime() + 13 * 3600000).toISOString()) : null } : null,
    t: c.transferencia ? { de: UID[c.transferencia.de], para: UID[c.transferencia.para], por: UID[c.transferencia.solicitadoPor], q: rel(c.transferencia.quando) } : null,
    h: c.historico.map(h => [rel(h.quando), h.quem, h.texto]),
  };
});
fs.writeFileSync("supabase/seed/chamados-seed.json", JSON.stringify(compact));
console.log("json", JSON.stringify(compact).length);
