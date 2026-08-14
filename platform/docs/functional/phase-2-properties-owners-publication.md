# Fase 2 funcional — imóveis, proprietários e publicação

Data da validação: 14 de agosto de 2026.

Escopo: evolução do fluxo existente de imóveis e proprietários, publicação no site público e correção da página dinâmica do imóvel. A landing page, CRM, leads internos e integrações externas não foram reconstruídos. Todos os testes manuais usaram somente dados sintéticos em MySQL local descartável.

## Resultado executivo

- O cadastro existente de 12 etapas foi mantido.
- Proprietário embutido e cadastro em `/app/proprietarios` agora compartilham os mesmos campos e a mesma serialização.
- CEP de proprietário e imóvel possui estado de carregamento, sucesso e falha, permite preenchimento manual e posiciona o foco no número após sucesso.
- CPF/CNPJ é formatado no navegador, validado também no backend, normalizado para persistência e verificado dentro da empresa.
- O imóvel pode ser salvo incompleto como rascunho. Publicação exige proprietário, código/título, localização mínima, preço coerente, descrição, status disponível e foto de capa.
- `publication_settings_json.site_enabled` passou a controlar `published_at`; alterações que removam readiness despublicam o imóvel.
- `site_featured` passou a ter efeito na seção de destaques e nunca altera o hero institucional.
- A página individual já existia. O bug era o componente pai `/site/$slug` não renderizar o `Outlet` da rota filha. A URL mudava, mas a homepage permanecia montada. A correção manteve uma única rota dinâmica e um único template.
- O hero agora vem apenas de `settings_json.hero_image_url` ou da imagem padrão do template.
- Banner de imóvel e portais não simulam mais publicação: a interface informa a indisponibilidade ou falta de configuração.

## Mapa funcional

| Funcionalidade | Antes | Depois | Navegador | API | MySQL | Reload | Resultado |
|---|---|---|---|---|---|---|---|
| CEP proprietário | Parcial | Estados assíncronos, fallback manual e foco no número | Sim | ViaCEP no cliente | Endereço persistido | Sim | Funcional |
| CEP imóvel | Parcial | Mesma UX, endereço completo e decimais preservados | Sim | Persistência tipada | Endereço persistido | Sim | Funcional |
| Proprietário | Fluxos divergentes | Componente e mapper compartilhados | Sim | MySQL canônico | Sim | Sim | Funcional |
| Busca de proprietário | Não implementada no cadastro | Nome, documento, telefone, WhatsApp e e-mail; máximo 100 | Sim | Filtro por empresa | Sim | Sim | Funcional |
| CPF/CNPJ | Sem regra uniforme | Formatação, dígitos verificadores, normalização e duplicidade por empresa | Sim | Validação backend | Dígitos normalizados | Sim | Funcional, com risco concorrente documentado |
| Localização | Parcial | CEP, número, complemento, bairro, cidade, UF, país e campos avançados preservados | Sim | Validações de CEP/UF | Sim | Sim | Funcional; geocodificação futura |
| Captação | MySQL funcional | Preservada | Sim | Sim | JSON canônico | Sim | Funcional |
| Dados primários | Tipos/operações reduzidos | Tipos completos e temporada preservados | Sim | Validações de negócio | Sim | Sim | Funcional |
| Metragens | Decimal podia perder separador | `85.5` e `85,5` preservados como 85,5 m² | Sim | Não negativo | Sim | Sim | Funcional |
| Valores | Cálculo pouco claro | Preço original, ajuste e preço final explícitos | Sim | Cálculo canônico | 500.000 + 6% = 530.000 | Sim | Funcional |
| Comissão | Sem prévia clara | Prévia em tempo real no cadastro; original não é perdido | Sim | Percentual/fixo, adicionar/subtrair | Valores em centavos | Sim | Funcional |
| Detalhes | Existentes | Preservados | Sim | Sim | JSON canônico | Sim | Funcional |
| Vídeos | URL armazenada | URL HTTP(S) pública renderizada; binário não é copiado | Sim | DTO allowlist | JSON | Sim | Funcional |
| Descrição | Existente | Incluída no readiness e no detalhe público | Sim | Sim | Texto | Sim | Funcional |
| Imagens | Capa sem ação dedicada | Capa explícita, galeria e ordenação preservadas | Sim, com mídia sintética registrada localmente | StorageProvider preservado | Metadados e capa | Sim | Funcional; upload externo não foi acionado nesta validação local |
| Site | Liberação não governava publicação | Readiness sincroniza `published_at` | Sim | Público filtra empresa/status/publicação | Sim | Sim | Funcional |
| Destaque | Somente flag visual | Índice e seção pública prioritária | Sim | `site_featured` público | Sim | Sim | Funcional |
| Banner | Parecia funcional | Opção bloqueada e explicação de incompatibilidade do template | Sim | Não cria publicação falsa | `site_banner=false` | Sim | Futura, explicitamente sinalizada |
| ZAP | Checkbox decorativo | Estado não configurado + CTA de integrações | Sim | Nenhum envio | Nenhum dual-write novo | Sim | Não configurada |
| OLX | Checkbox decorativo | Estado não configurado + CTA de integrações | Sim | Nenhum envio | Nenhum dual-write novo | Sim | Não configurada |
| Viva Real | Checkbox decorativo | Estado não configurado + CTA de integrações | Sim | Nenhum envio | Nenhum dual-write novo | Sim | Não configurada |
| Facebook | Aparência de publicação | Informado como não configurado | Sim | Nenhum envio | Não aplicável | Sim | Não configurada |
| Instagram | Aparência de publicação | Informado como não configurado | Sim | Nenhum envio | Não aplicável | Sim | Não configurada |
| Revisão final | Percentual por etapa | Checklist derivado de 8 requisitos reais e atalho para pendências | Sim | Backend repete as regras críticas | Sim | Sim | Funcional |

## As 12 etapas

| Etapa | Antes | Problema | Correção | Teste real | Resultado |
|---|---|---|---|---|---|
| 1. Proprietário | Cadastro embutido reduzido | Divergia do módulo de proprietários e incentivava duplicidade | Componente único, busca de existente e CPF/CNPJ validado | Proprietária sintética criada, pesquisada e selecionada; duplicata rejeitada | Funcional |
| 2. Localização | ViaCEP sem feedback consistente | Usuário não sabia se a consulta falhou | Estados de busca/sucesso/erro, foco no número e fallback manual | CEPs 01001-000 e 01310-100 preencheram endereço; reload preservou | Funcional |
| 3. Captação | Persistia em JSON | Sem bug bloqueante encontrado | Mantida sem reescrita | Formulário percorrido e persistido | Funcional |
| 4. Dados primários | Operações e tipos eram colapsados | Studio e temporada perdiam semântica | Tipos completos, temporada e regras suítes/dormitórios | Studio, venda, 2 dormitórios e 1 suíte persistidos | Funcional |
| 5. Metragens | `85.5` podia virar `855` | Parser monetário era reutilizado indevidamente | Parser decimal específico | `85.5` reapareceu como 85,5 m² após reload | Funcional |
| 6. Valores | Resultado comercial pouco visível | Corretor não via base, comissão e anunciado | Prévia em tempo real e persistência separada | 500.000 + 6% = comissão 30.000 e anunciado 530.000; edição para 600.000 resultou 636.000 | Funcional |
| 7. Detalhes adicionais | Existentes | Nenhum bloqueio crítico | Preservados | Navegador/API/build | Funcional |
| 8. Vídeo | URL persistida | Detalhe público não aproveitava todas as URLs externas | Vídeos HTTP(S) entram no DTO público e na página dinâmica | URL do YouTube apareceu no detalhe; sem download binário | Funcional |
| 9. Descrição | Existente | Não participava claramente da publicação | Readiness e detalhe público | Descrição editada apareceu na mesma URL pública | Funcional |
| 10. Imagens | Capa implícita | Troca de capa não tinha ação clara | Endpoint tenant-scoped e botão “Definir capa” | Duas mídias, troca de capa, card e detalhe atualizados | Funcional |
| 11. Liberações | Checkboxes decorativos | Site, banner e portais pareciam equivalentes | Site real, destaque real, banner incompatível sinalizado e portais sem estado falso | Publicar/despublicar validado; hero não mudou | Funcional para site/destaque; futuras integrações sinalizadas |
| 12. Revisão | Progresso seguia a etapa | Mostrava 100% sem capa | 8 requisitos objetivos e links de correção | Imóvel ficou em 88%/7 de 8 antes da capa e publicou após completá-la | Funcional |

## Evidência do fluxo público

1. O imóvel A foi salvo sem capa: `site_enabled=true`, mas `published_at` permaneceu nulo.
2. Após existir uma capa e salvar, passou a `PUBLISHED` e `site_featured=true`.
3. O site exibiu dois imóveis sintéticos, cada um com capa e URL próprias.
4. Hero observado: `/site-templates/magnifico-hero.jpg`.
5. Capas observadas: URLs distintas das duas propriedades; nenhuma substituiu o hero.
6. Clique no card abriu `/site/fase2-browser-site/imoveis/{slug-estável}`.
7. URL copiada em nova aba e reload mantiveram o detalhe correto.
8. Editar preço, descrição e capa atualizou a URL pública existente.
9. Ao definir “Liberado no site = Não”, a URL mostrou “Imóvel indisponível”, o card sumiu e o outro imóvel permaneceu.
10. O lead sintético criado no detalhe foi persistido com o `property_id` e código corretos.
11. O DTO público não exibiu proprietário, documento, contatos do proprietário, comissão, valor original, captação nem metadados de storage.

## Página dinâmica e causa raiz

A página `site.$slug.imoveis.$propertySlug.tsx` e a geração por `getPropertyDetailUrl` já existiam. A árvore gerada corretamente tratava o detalhe como filho de `/site/$slug`, porém o componente pai renderizava diretamente a homepage e não oferecia um `Outlet`. O navegador atualizava a localização, enquanto React mantinha o conteúdo do pai.

O componente pai agora detecta o match da rota de detalhe e renderiza o `Outlet`; no caminho base continua renderizando a homepage. Assim, uma única página dinâmica atende todos os imóveis. Não são criadas páginas físicas por propriedade.

## Preço público

- `original_sale_price_cents`: valor informado pelo proprietário/corretor antes da regra.
- `sale_adjustment_cents`: valor calculado da comissão ou ajuste.
- `final_sale_price_cents`/`sale_price_cents`: valor anunciado e usado no site.
- Dados internos continuam disponíveis no backoffice; apenas o preço público final entra no DTO público.
- Percentual padrão por empresa ainda não foi adicionado; a estrutura por imóvel permanece preparada sem hardcode universal.

## Migration

`202608140001_property_functional_foundation` é aditiva e compatível com MySQL:

- índice `property_owners_company_id_document_idx` para busca e prevenção de duplicidade por empresa;
- coluna `properties.site_featured` com padrão `false`;
- índice `properties_company_status_site_featured_published_at_idx` para vitrine/destaques públicos.

A migration foi aplicada somente ao MySQL local descartável. Nenhuma migration foi aplicada em staging ou produção.

## Limitações explícitas

- ZAP, OLX, Viva Real, Facebook e Instagram continuam sem conexão real nesta fase. O legado de `portal-integrations` ainda depende de Supabase; nenhuma publicação MySQL foi falsamente criada e nenhum dual-write permanente foi introduzido.
- Banner promocional de imóvel depende de template compatível e permanece desabilitado.
- Geocodificação automática não foi implementada. Sem latitude/longitude, o detalhe usa bairro/cidade/UF na busca de mapas e nunca converte ausência em coordenada `0,0`.
- A prevenção de documento duplicado é validada por empresa na aplicação e apoiada por índice não único. Uma constraint única exige saneamento prévio dos dados legados para evitar migration destrutiva; concorrência extrema permanece risco residual até essa etapa.
- Upload real em storage externo não foi disparado na validação local. O fluxo existente por `StorageProvider` foi preservado e segue coberto pelos testes automatizados; a interface, capa, galeria e vínculo MySQL foram exercitados com referências sintéticas.
- O typecheck global ainda acusa erros legados fora deste módulo em agenda, contratos, custos, financeiro, preview storage e Website Builder. Os arquivos centrais desta fase passam no build e no ESLint focado.

## Validação automatizada

- 33 arquivos de teste e 240 testes aprovados.
- Testes novos: CPF/CNPJ; isolamento de documento por empresa; validação funcional do imóvel; readiness/publicação e despublicação.
- Prisma Client gerado com URL dummy e schema validado.
- Build do backend, plataforma e landing executados.
- ESLint focado nos arquivos centrais da fase executado sem erros, com a regra de formatação separada por causa da política CRLF do workspace.
- `git diff --check`, auditoria de dependências e revisão de secrets executadas antes dos commits.
