# Fase 55 - Vistoria inteligente completa

## Objetivo

Criar a fundacao da vistoria inteligente do ImobiFlow.

Esse modulo deve transformar a vistoria imobiliaria em um processo profissional, padronizado, mobile, auditavel, comparavel e preparado para IA.

## Por que este modulo e estrategico

A vistoria e uma das partes mais fortes do ImobiFlow porque resolve problemas reais da operacao imobiliaria:

- vistorias feitas em papel;
- fotos perdidas no WhatsApp;
- laudos em Word sem padrao;
- dificuldade para comparar entrada e saida;
- discussoes entre proprietario e inquilino;
- falta de evidencias;
- retrabalho na geracao de PDF;
- baixa percepcao profissional da imobiliaria.

O ImobiFlow deve entregar uma experiencia muito superior:

```txt
Vistoria por comodo
↓
Fotos e videos organizados
↓
Checklist padronizado
↓
IA resumindo evidencias
↓
Comparacao entrada vs saida
↓
Assinatura digital
↓
PDF premium
↓
Publicacao no portal
```

## Migration criada

```txt
database/migrations/037_smart_inspections.sql
```

## Estruturas criadas

### 1. Templates de vistoria

Tabela:

```txt
inspection_templates
```

Permite criar modelos padronizados para entrada, saida, manutencao, entrega e vistorias periodicas.

Campos importantes:

```txt
rooms_schema
checklist_schema
inspection_type
status
approved_by
approved_at
```

### 2. Vistorias do imovel

Tabela:

```txt
property_inspections
```

Representa uma vistoria real vinculada a imovel, contrato, proprietario e inquilino.

Status:

```txt
draft
scheduled
in_progress
pending_sync
pending_review
completed
approved
sent_for_signature
signed
cancelled
archived
```

Tipos:

```txt
entry
exit
periodic
maintenance
delivery
comparison
other
```

### 3. Ambientes

Tabela:

```txt
inspection_rooms
```

Cada vistoria pode conter ambientes:

- sala;
- cozinha;
- quarto;
- banheiro;
- varanda;
- garagem;
- area externa;
- outro.

Status de condicao:

```txt
pending
good
regular
damaged
requires_review
not_applicable
```

### 4. Itens vistoriados

Tabela:

```txt
inspection_items
```

Cada ambiente pode conter itens como:

- piso;
- parede;
- teto;
- porta;
- janela;
- pintura;
- eletrica;
- hidraulica;
- moveis;
- metais;
- loucas;
- chaves;
- controles;
- equipamentos.

Status:

```txt
pending
good
regular
damaged
missing
replaced
not_applicable
```

Resultado de comparacao:

```txt
unchanged
improved
worsened
new_damage
missing
requires_review
```

### 5. Midias

Tabela:

```txt
inspection_media
```

Armazena fotos, videos, audios, documentos e evidencias.

Campos importantes:

```txt
file_url
thumbnail_url
captured_at
uploaded_at
offline_local_id
checksum
ai_tags
ai_description
```

### 6. Assinaturas da vistoria

Tabela:

```txt
inspection_signatures
```

Permite assinatura de:

- proprietario;
- inquilino;
- corretor;
- vistoriador;
- testemunha;
- representante da imobiliaria.

## Fluxo da vistoria de entrada

```txt
Imobiliaria agenda vistoria
↓
Vistoriador abre no celular
↓
Sistema carrega template
↓
Vistoriador percorre comodos
↓
Registra itens, fotos e observacoes
↓
Sistema salva offline se necessario
↓
Dados sincronizam quando houver internet
↓
IA gera resumo tecnico
↓
Usuario revisa laudo
↓
PDF e gerado
↓
Signatarios assinam
↓
Laudo fica disponivel no portal
```

## Fluxo da vistoria de saida

```txt
Sistema localiza vistoria de entrada
↓
Vistoriador cria vistoria de saida
↓
Cada item pode ser comparado
↓
Fotos de entrada e saida ficam lado a lado
↓
Sistema identifica diferencas
↓
IA sugere resumo e pontos de atencao
↓
Usuario valida responsabilidades
↓
Sistema calcula estimativas quando houver
↓
PDF comparativo e gerado
```

## Comparacao entrada vs saida

O sistema deve permitir comparar:

- fotos;
- videos;
- status do item;
- observacoes;
- danos novos;
- itens faltantes;
- reparos necessarios;
- responsabilidade do inquilino;
- responsabilidade do proprietario;
- estimativa de reparo.

## IA na vistoria

A IA deve ajudar, mas nao substituir a revisao humana.

Usos esperados:

- resumir ambiente;
- padronizar linguagem tecnica;
- sugerir tags de fotos;
- detectar inconsistencias;
- gerar descricao para PDF;
- apontar possiveis danos;
- sugerir nivel de risco;
- comparar entrada e saida.

Toda sugestao da IA deve poder ser revisada antes de virar laudo final.

## Offline first

O app deve funcionar em ambientes sem internet.

Regras:

- criar `offline_session_id`;
- salvar fotos localmente ate sincronizar;
- manter `offline_local_id` nas midias;
- marcar vistoria como `pending_sync`;
- evitar duplicidade usando checksum;
- preservar ordem de ambientes e itens;
- mostrar conflito de sincronizacao quando necessario.

## PDF premium

O PDF de vistoria deve conter:

- capa profissional;
- dados da imobiliaria;
- dados do imovel;
- proprietario;
- inquilino;
- contrato;
- data;
- responsavel;
- ambientes;
- itens;
- fotos;
- observacoes;
- resumo por IA revisado;
- comparativo entrada/saida quando aplicavel;
- assinaturas;
- hash ou codigo de verificacao.

## Portal

Quando aprovado, o laudo deve poder ser publicado em:

- portal do proprietario;
- portal do inquilino;
- historico do imovel;
- contrato de locacao.

## Segurança

Toda vistoria deve respeitar:

```txt
login valido
+
empresa vinculada
+
assinatura ativa
+
permissao
+
company_id
```

Permissoes sugeridas:

```txt
inspections.view
inspections.manage
inspections.review
inspections.approve
inspections.sign
inspections.templates.manage
```

## Auditoria

Registrar:

- quem criou;
- quem iniciou;
- quem editou;
- quem revisou;
- quem aprovou;
- quem assinou;
- quando sincronizou;
- quais fotos foram anexadas;
- quais itens foram alterados;
- status anterior e novo;
- origem mobile/web.

## Empty states

### Sem vistorias

```txt
Nenhuma vistoria cadastrada.

Crie vistorias de entrada, saida ou manutencao para organizar evidencias, fotos, assinaturas e laudos profissionais.
```

### Sem ambientes

```txt
Nenhum ambiente adicionado.

Adicione comodos para registrar itens, fotos e observacoes de forma organizada.
```

### Sem fotos

```txt
Nenhuma evidencia visual adicionada.

Inclua fotos ou videos para fortalecer o laudo e reduzir disputas futuras.
```

## Telas esperadas

```txt
/app/vistorias
/app/vistorias/templates
/app/vistorias/nova
/app/vistorias/:id
/app/vistorias/:id/ambientes
/app/vistorias/:id/comparacao
/app/vistorias/:id/assinaturas
/app/vistorias/:id/pdf
```

## Endpoints esperados

```txt
GET /inspections/templates
POST /inspections/templates
POST /inspections/templates/:id/approve
GET /inspections
POST /inspections
GET /inspections/:id
PATCH /inspections/:id
POST /inspections/:id/start
POST /inspections/:id/complete
POST /inspections/:id/approve
POST /inspections/:id/rooms
POST /inspections/:id/items
POST /inspections/:id/media
POST /inspections/:id/compare
POST /inspections/:id/generate-ai-summary
POST /inspections/:id/generate-pdf
POST /inspections/:id/signatures
POST /inspections/:id/sync-offline
```

## Proxima etapa

Quando o shell voltar:

- validar migration;
- implementar endpoints;
- criar telas vazias de vistoria;
- criar fluxo mobile responsivo;
- conectar PDF e portal;
- preparar IA;
- rodar build;
- commitar e publicar o pacote acumulado.

## Macroetapas restantes

Apos esta fase, restam aproximadamente 3 macroetapas para a versao 100% completa:

1. Implementar telas/endpoints de gateways, portais, contratos e vistorias.
2. Integrar gateway real, assinatura digital, IA, WhatsApp, mobile/PWA e offline.
3. Hardening, LGPD, custos por tenant, beta piloto e homologacao final.
