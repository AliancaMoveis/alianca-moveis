-- Deixa as funções de permissão "inlináveis" pelo planejador.
--
-- O corpo de pode_ver_chamado_ctx e de pode_ver_valor_ctx não acessa nenhuma tabela: lê apenas o
-- registro (c) e o contexto (x) recebidos por argumento. SECURITY DEFINER e SET search_path,
-- portanto, não dão nenhuma proteção aqui — e são exatamente os dois atributos que impedem o
-- Postgres de embutir o corpo da função na consulta. Sem inlining, era uma chamada de função por
-- linha: 7.4k chamadas por consulta.
--
-- Efeito medido em carregar_principal (que roda SECURITY DEFINER e por isso não passa pelas
-- políticas): o filtro de visibilidade caiu de ~2.600 ms para 10 ms, e o loader completo da
-- Gestão caiu de 5.756 ms para ~1.950 ms.

alter function public.pode_ver_chamado_ctx(public.chamados, jsonb) security invoker;
alter function public.pode_ver_chamado_ctx(public.chamados, jsonb) reset search_path;

alter function public.pode_ver_valor_ctx(public.chamados, jsonb) security invoker;
alter function public.pode_ver_valor_ctx(public.chamados, jsonb) reset search_path;
