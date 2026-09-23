-- Funções auxiliares internas não ficam expostas na API.
revoke execute on function public._eu(), public._exigir_admin(), public._nome(uuid), public._setor_nome(text),
  public._setores_label(uuid), public._tipo_nome(text), public._eh_consultor_valido(uuid), public._eh_projetista_valido(uuid),
  public._fmt_data(date), public._fmt_data_ts(timestamptz), public._fmt_dt_local(timestamp), public._label_status(public.status_chamado),
  public._label_status_cliente(public.status_cliente), public._label_venda(public.status_venda), public._venda_para_cliente(public.status_venda),
  public.status_cliente_de(public.chamados), public.add_dias_uteis(timestamptz, integer)
from authenticated, anon, public;
