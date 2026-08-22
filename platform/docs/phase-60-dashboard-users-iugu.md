# Fase 60 - Dashboard real, usuários e base Iugu

## Implementado

- Endpoint `GET /dashboard/summary` com métricas reais por `company_id`.
- Filtros de período: hoje, ontem, 7, 14, 30, 90 dias e todo período.
- Alertas reais:
  - leads sem contato;
  - imóveis sem mídia;
  - contratos vencendo em 30 dias;
  - cobranças vencidas/falhas.
- Dashboard interno consumindo a API real, sem números fictícios.
- Endpoints protegidos:
  - `GET /auth/users`;
  - `PATCH /auth/users/:id`;
  - `GET /auth/invitations`;
  - `POST /auth/invitations/:id/cancel`;
  - `POST /auth/invitations/:id/reissue`.
- Tela de configurações listando usuários e convites.
- Cancelamento e reemissão de convite com novo token.
- Migration `042_permissions_dashboard_users.sql` corrigindo permissões faltantes.
- Roles padrão atualizadas para agenda, locação e proprietários.
- Variáveis de ambiente para Iugu/PJBank.
- Adapter Iugu inicial para:
  - preparar/criar cliente;
  - preparar/criar fatura;
  - PIX, boleto e cobrança híbrida via `payable_with`;
  - bloquear chamada real até `settings.enable_real_api=true`;
  - registrar payload e retorno sem marcar pagamento como pago.

## Validação

- `npm run test`: 10 testes passaram.
- `npm run build`: frontend compilou.
- `cd backend && npm run build`: backend compilou.

## Pendências imediatas

- Aplicar migrations `001` a `042` no Supabase real.
- Configurar `IUGU_API_KEY` e `IUGU_WEBHOOK_SECRET` fora do repositório.
- Implementar normalização completa do webhook Iugu em `/webhooks/payments/iugu`.
- Próximo bloco: CRM Kanban completo e upload real de mídia/documentos de imóveis.
