# Fase 80 - Bloqueio de links localhost em produção

## Problema identificado

Os links dos feeds JSON/XML dos portais estavam usando o fallback `http://localhost:3333` quando `VITE_IMOBIFLOW_API_URL` não estava configurada no ambiente de produção.

Em produção, isso fazia o navegador tentar abrir o backend local do computador do usuário, resultando em erro de conexão.

## Correção

- O frontend agora detecta quando a API está apontando para `localhost` ou `127.0.0.1` em ambiente não local.
- Nessa situação, links públicos de feed não são renderizados como links clicáveis.
- A tela mostra `Aguardando URL do backend`.
- A tela exibe aviso explicando que os feeds reais dependem do backend publicado e de `VITE_IMOBIFLOW_API_URL`.

## Próximo passo operacional

Para ativar feeds reais em produção, configurar a variável:

```txt
VITE_IMOBIFLOW_API_URL=https://url-publica-do-backend
```

Depois disso, a tela passará a exibir os links reais:

```txt
/portal-integrations/zap_imoveis/:companyId/feed.json
/portal-integrations/zap_imoveis/:companyId/feed.xml
```
