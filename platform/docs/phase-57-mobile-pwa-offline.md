# Fase 57 - Mobile/PWA, offline e sincronizacao

## Objetivo

Criar a fundacao para o ImobiFlow funcionar bem em dispositivos moveis, com suporte a PWA, operacao offline, sincronizacao posterior, notificacoes push e controle de dispositivos por empresa.

Essa fase e essencial para:

- vistorias em campo;
- captacao de imoveis;
- corretores em atendimento externo;
- visitas;
- upload de fotos;
- follow-up mobile;
- notificacoes operacionais;
- uso em locais sem internet estavel.

## Migration criada

```txt
database/migrations/039_mobile_pwa_offline.sql
```

## Estruturas criadas

### 1. Dispositivos moveis

Tabela:

```txt
mobile_devices
```

Registra dispositivos usados por usuarios da imobiliaria.

Campos importantes:

```txt
company_id
user_id
device_fingerprint
device_name
platform
app_version
os_version
browser_name
status
last_seen_at
trusted_at
revoked_at
revoked_by
metadata
```

Plataformas:

```txt
web
pwa
android
ios
desktop
other
```

Status:

```txt
active
trusted
revoked
blocked
expired
```

## 2. Instalações PWA

Tabela:

```txt
pwa_installations
```

Permite acompanhar instalacoes do app como PWA.

Campos importantes:

```txt
install_source
installed_at
last_opened_at
uninstalled_at
service_worker_version
cache_version
```

## 3. Sessões offline

Tabela:

```txt
offline_sync_sessions
```

Representa uma operacao iniciada offline e sincronizada depois.

Recursos previstos:

```txt
inspection
lead_followup
property_capture
document_capture
communication
other
```

Status:

```txt
open
syncing
synced
failed
conflict
closed
cancelled
```

## 4. Itens de sincronizacao

Tabela:

```txt
offline_sync_items
```

Cada item representa uma operacao local:

```txt
create
update
delete
upload_media
acknowledge
other
```

Status:

```txt
pending
syncing
synced
failed
conflict
resolved
ignored
```

Estratégias de conflito:

```txt
server_wins
client_wins
merge
manual
ignored
```

## 5. Notificações push

Tabela:

```txt
push_notification_subscriptions
```

Prepara notificações via:

```txt
web_push
firebase
apns
expo
other
```

## Fluxo offline de vistoria

```txt
Vistoriador abre vistoria no celular
↓
Sistema registra dispositivo
↓
Sistema cria offline_sync_session
↓
Ambientes, itens, fotos e observacoes sao salvos localmente
↓
Cada operacao entra em offline_sync_items
↓
Quando a internet volta, o app sincroniza
↓
Servidor valida company_id, permissao e versao
↓
Conflitos sao marcados quando houver divergencia
↓
Usuario resolve conflito se necessario
↓
Vistoria sai de pending_sync para sincronizada
```

## Fluxo mobile do corretor

```txt
Corretor acessa pelo celular
↓
Consulta lead ou imovel
↓
Registra atendimento ou visita
↓
Se estiver sem internet, salva offline
↓
Sincroniza quando voltar conexao
↓
Gestor acompanha no CRM
```

## Regras de conflito

O sistema deve detectar conflito quando:

- o mesmo item foi editado no servidor e no dispositivo;
- foto local ja existe no servidor com outro checksum;
- vistoria foi finalizada no servidor antes da sincronizacao;
- usuario perdeu permissao antes de sincronizar;
- assinatura foi concluida antes de mudanca local;
- contrato ou cobrança mudou durante operacao offline.

## Regras de segurança

Toda sincronizacao deve validar:

```txt
login valido
+
empresa vinculada
+
assinatura ativa
+
permissao
+
dispositivo ativo
+
company_id
```

Se o dispositivo estiver revogado, bloqueado ou expirado, a sincronizacao deve ser negada.

## Cache e dados sensiveis

O PWA nao deve manter dados sensiveis indefinidamente.

Regras recomendadas:

- cachear apenas o necessario;
- limpar dados ao fazer logout;
- expirar sessoes offline antigas;
- nao armazenar tokens em texto aberto;
- proteger anexos sensiveis;
- permitir revogar dispositivo;
- registrar ultimo acesso.

## Notificações esperadas

Categorias:

- novo lead;
- visita agendada;
- vistoria pendente;
- contrato pendente;
- cobrança vencida;
- pagamento confirmado;
- repasse realizado;
- ação operacional crítica;
- falha de gateway;
- divergência financeira.

## Empty states

### Sem dispositivos

```txt
Nenhum dispositivo registrado.

Quando sua equipe acessar o ImobiFlow pelo celular, PWA ou desktop, os dispositivos aparecerão aqui para controle e segurança.
```

### Sem sessões offline

```txt
Nenhuma sessão offline encontrada.

Vistorias e atendimentos feitos sem internet aparecerão aqui quando houver sincronização pendente ou concluída.
```

### Sem conflitos

```txt
Nenhum conflito de sincronização.

As alterações feitas em campo foram sincronizadas corretamente.
```

## Telas esperadas

```txt
/app/mobile
/app/mobile/dispositivos
/app/mobile/sincronizacao
/app/mobile/conflitos
/app/mobile/notificacoes
```

## Endpoints esperados

```txt
GET /mobile/devices
POST /mobile/devices/register
POST /mobile/devices/:id/trust
POST /mobile/devices/:id/revoke
GET /mobile/pwa-installations
POST /mobile/offline-sessions
GET /mobile/offline-sessions
POST /mobile/offline-sessions/:id/sync
GET /mobile/offline-sessions/:id/items
POST /mobile/offline-items/:id/resolve
POST /mobile/push/subscribe
POST /mobile/push/unsubscribe
```

## Integração com módulos

### Vistorias

- salvar ambientes offline;
- salvar itens offline;
- salvar fotos offline;
- sincronizar mídia;
- resolver conflitos;
- gerar PDF depois da sincronização.

### CRM

- registrar follow-up;
- atualizar etapa do lead;
- salvar visita;
- sincronizar observações.

### Financeiro

- receber push de cobrança vencida;
- receber alerta de pagamento;
- receber alerta de divergência.

### Contratos

- notificar assinatura pendente;
- abrir documento no mobile;
- acompanhar status.

## Proxima etapa

Quando o shell voltar:

- validar migration;
- implementar endpoints mobile;
- configurar manifest PWA;
- configurar service worker;
- criar telas mobile responsivas;
- implementar fila local no frontend;
- conectar sincronização de vistoria;
- rodar build;
- commitar e publicar pacote acumulado.

## Macroetapas restantes

Apos esta fase, resta aproximadamente 1 macroetapa para a versao 100% completa:

1. Hardening, LGPD, custos por tenant, beta piloto, homologacao final, testes ponta a ponta e publicacao consolidada.
