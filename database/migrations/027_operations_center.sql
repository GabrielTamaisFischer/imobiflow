insert into public.permissions (key, description)
values
  ('operations.view', 'Visualizar saude operacional, automacoes, webhooks e filas')
on conflict (key) do update
set description = excluded.description;
