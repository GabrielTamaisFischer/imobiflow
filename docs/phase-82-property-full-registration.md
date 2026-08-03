# Fase 82 - Cadastro completo de imóvel

## Objetivo

Evoluir o módulo de imóveis para um cadastro profissional em fases, conforme o SDD complementar enviado para o ImobiFlow.

## Implementado

- Cadastro de proprietário diretamente dentro do cadastro do imóvel.
- Vínculo do proprietário ao imóvel criado.
- Código automático do imóvel quando o usuário não informar manualmente.
- Busca de endereço por CEP para proprietário e imóvel.
- Localização completa do imóvel.
- Dados de condomínio, latitude, longitude e rodovias próximas.
- Captação com captador, chaves, zelador/porteiro, placa, exclusividade, documentação, vistoria, parceria e condições comerciais.
- Dados primários com tipo de imóvel, transação, permuta, financiamento, quartos, vagas, docas, rampas, resistência do piso e topografia.
- Metragens urbanas, rurais e industriais.
- Valores de venda, locação, temporada, condomínio, IPTU e regra comercial por percentual ou valor fixo.
- Detalhes adicionais por grupos:
  - infraestrutura;
  - lazer;
  - piso;
  - serviços;
  - estrutura;
  - culturas.
- Vídeos e links 360 como dados estruturados.
- Descrição por modelos locais com 20 templates, sem custo de IA real.
- Liberações para ZAP Imóveis, OLX, Viva Real, Facebook, Instagram e site.
- Banco ampliado com campos JSONB para manter flexibilidade sem travar evolução futura.

## Observação sobre descrição automática

Foi criado um gerador por modelos locais. Ele usa informações reais do formulário e encaixa em templates prontos. Isso reduz custo operacional no início e evita consumo de IA real antes da configuração definitiva do módulo de inteligência.

## Migration

Arquivo:

```txt
database/migrations/051_property_full_registration.sql
```

## Próximos passos

- Criar edição completa do imóvel já cadastrado.
- Separar upload de foto principal, fotos secundárias e tour 360.
- Criar validação visual de completude do imóvel antes de liberar em portais.
- Aplicar migrations no Supabase real quando as credenciais estiverem disponíveis.
