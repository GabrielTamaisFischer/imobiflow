insert into public.permissions (key, description)
values
  ('owners.manage', 'Criar e gerenciar proprietários'),
  ('appointments.view', 'Visualizar agenda e visitas'),
  ('appointments.manage', 'Criar e gerenciar agenda e visitas'),
  ('rentals.view', 'Visualizar locações'),
  ('rentals.manage', 'Criar e gerenciar locações'),
  ('imports.view', 'Visualizar importações'),
  ('imports.manage', 'Executar importações'),
  ('site.manage', 'Gerenciar site da imobiliária')
on conflict (key) do update
set description = excluded.description;

with role_permission_catalog as (
  select *
  from (
    values
      ('owner', 'owners.manage'),
      ('owner', 'appointments.view'),
      ('owner', 'appointments.manage'),
      ('owner', 'rentals.view'),
      ('owner', 'rentals.manage'),
      ('owner', 'imports.view'),
      ('owner', 'imports.manage'),
      ('owner', 'site.manage'),
      ('admin', 'owners.manage'),
      ('admin', 'appointments.view'),
      ('admin', 'appointments.manage'),
      ('admin', 'rentals.view'),
      ('admin', 'rentals.manage'),
      ('admin', 'imports.view'),
      ('admin', 'imports.manage'),
      ('admin', 'site.manage'),
      ('manager', 'owners.manage'),
      ('manager', 'appointments.view'),
      ('manager', 'appointments.manage'),
      ('manager', 'rentals.view'),
      ('manager', 'rentals.manage'),
      ('broker', 'appointments.view'),
      ('broker', 'appointments.manage'),
      ('financial', 'rentals.view'),
      ('financial', 'rentals.manage')
  ) as catalog(role_system_key, permission_key)
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join role_permission_catalog rpc on rpc.role_system_key = r.system_key
join public.permissions p on p.key = rpc.permission_key
on conflict (role_id, permission_id) do nothing;
