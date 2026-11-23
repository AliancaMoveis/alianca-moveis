-- Supervisão de medidas (Mariana, Luciene) precisa acrescentar o telefone do cliente dela — o
-- número que o medidor conseguiu em campo — sem ter o "editar dados do cliente" inteiro, que é da
-- Supervisão / Gestão. Só ACRESCENTA: não apaga nem troca o que já estava, então não dá para
-- perder contato. O endereço continua pelo caminho de sempre.
create or replace function public.chamado_telefone_incluir(p_id text, p_telefone text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c public.chamados; d text; novo text;
begin
  select * into c from public.chamados where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  if not (public.pode_editar_cliente()
          or (c.tipo in ('medidas', 'solicitacao_medida') and 'medidas_supervisao' = any(public.meus_setores()))) then
    raise exception 'Só a Gestão, a Supervisão ou — nas medidas — a Supervisão de Medidas incluem telefone';
  end if;
  d := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(d) < 10 or length(d) > 13 then raise exception 'Telefone inválido — use DDD + número'; end if;
  d := right(d, 11);                     -- tira o 55 do país, se vier
  novo := public._ex_fone(d);
  -- já está na ficha? compara pelos 8 últimos dígitos, que é como a Kommo casa os números.
  -- Os separadores são os mesmos que o front usa para quebrar a lista: / ; , e " e ".
  if exists (select 1 from regexp_split_to_table(coalesce(c.telefone, ''), '[/;,]| e ') t
              where length(regexp_replace(t, '\D', '', 'g')) >= 8
                and right(regexp_replace(t, '\D', '', 'g'), 8) = right(d, 8)) then
    return jsonb_build_object('ok', true, 'ja', true, 'telefone', novo);
  end if;
  update public.chamados
     set telefone = case when btrim(coalesce(c.telefone, '')) = '' then novo
                         else btrim(c.telefone) || ' / ' || novo end
   where id = p_id;
  perform public._reg(p_id, '📞 Telefone incluído: ' || novo);
  return jsonb_build_object('ok', true, 'ja', false, 'telefone', novo);
end $$;

revoke all on function public.chamado_telefone_incluir(text, text) from public, anon;
grant execute on function public.chamado_telefone_incluir(text, text) to authenticated;
