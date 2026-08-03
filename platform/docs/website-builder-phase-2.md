# Website Builder - Fase 2

## Status Atual

A Fase 2 começou com um editor visual dedicado em:

```txt
/app/site/builder/editor/:websiteId
```

## Entregue Nesta Fatia

- tela cheia de editor visual;
- sidebar de páginas, seções e componentes;
- criação de nova página pelo editor;
- canvas central clicável;
- drop zones visuais no canvas para reordenar seções;
- drop zones visuais no canvas para reordenar componentes dentro da seção;
- painel de propriedades;
- edição de nome, slug, tipo, texto e visibilidade;
- controles básicos de design:
  - cor de fundo;
  - cor do texto;
  - border radius;
  - espaçamento vertical;
- salvamento em MySQL via APIs reais;
- `style_json` usado para persistir aparência;
- reordenação drag and drop de seções;
- reordenação drag and drop de componentes dentro da mesma seção;
- undo/redo local para alterações ainda não salvas do painel;
- alternância de viewport desktop, tablet e mobile;
- link para prévia estrutural;
- biblioteca lateral de blocos estruturais vindos da API;
- filtro por categoria de bloco;
- inserção de bloco pronto criando seção e componentes no MySQL;
- editor global de tema com cores, fontes e raios;
- preview em tempo real do tema global no canvas;
- salvamento do tema global em `theme_json`;
- painel de histórico lendo versões reais de `website_versions`;
- painel de assets integrado ao storage configurado;
- upload pelo backend sem fallback em `localStorage`;
- listagem e exclusão de assets pelo editor;
- aplicação de assets em seções e componentes selecionados;
- renderização de imagem/vídeo aplicado diretamente no canvas;
- criação rápida de componentes de título, texto, imagem, vídeo e botão;
- erro controlado quando o R2 ainda não está configurado;
- prévia estrutural para blocos de imóveis, formulários e seções sem componentes;
- cards reais de imóveis no canvas quando o módulo de imóveis estiver disponível;
- suporte a `background` e `backgroundColor` no `style_json` do canvas.

## Ainda Não Implementado Nesta Fatia

- drag and drop livre no canvas;
- redimensionamento com alças;
- camadas avançadas;
- biblioteca de efeitos;
- animações avançadas;
- importação de sites;
- marketplace;
- domínio customizado;
- publicação automática de imóveis.

## Próximas Fatias Recomendadas

1. Restore visual de versões salvas.
2. Busca/filtro real nos componentes de vitrine imobiliária.
3. Formulário de lead conectado ao CRM.
4. Camadas avançadas e painel de navegação por árvore.
5. Edição responsiva separada por desktop, tablet e mobile.
6. Redimensionamento e movimentação livre com alças.
