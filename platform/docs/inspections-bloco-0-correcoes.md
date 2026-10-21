# Vistorias — Bloco 0: correções sem migration

Status: implementado e validado; aguardando autorização de commit.
Escopo: corrigir bugs do módulo canônico de vistorias (`/real-estate/inspections`)
sem alterar schema, sem migration, sem seed e sem novas dependências.

## Itens

| Item | Status | Resumo |
|---|---|---|
| D1 | Corrigido | Session guard não desloga por falta de rede/5xx; usa a última sessão validada do mesmo usuário+empresa (sem tokens). |
| D2 | Corrigido | Fila offline envia `expected_version` = versão conhecida; 409 vira conflito preservando local e remoto; sincronização não re-enfileira em queda de rede. |
| D3 | Mitigado | Foto enviada reduzida para ~3 MB (proporção e orientação EXIF preservadas); fila offline guarda o original. Solução definitiva: upload direto ao storage (contrato novo). |
| D4 | Corrigido | PDF em WinAnsiEncoding; acentos e símbolos corretos. |
| D5 | Corrigido | Exclusão de foto remove linhas no banco antes do asset; falha do provider não deixa referência quebrada. |
| D6 | Corrigido | Comparação exige `inspections.manage`, valida empresa, imóvel, IDs e tipos; não atribui responsabilidade. |
| D7 | Corrigido | Evidências carregadas uma vez por vistoria (antes ~1 requisição por painel). |
| D8 | Corrigido | Busca de imóvel no servidor (código, título, endereço, bairro, cidade, proprietário). |
| D9 | Corrigido | Botão de laudo só habilita em vistoria concluída/arquivada; trava contra clique duplo. |
| D10 | Corrigido | Logout avisa sobre dados offline pendentes, permite cancelar e só apaga o escopo do usuário que sai. |
| **D11** | **ADIADO → Bloco G** | Ver abaixo. |

## D11 — adiado formalmente (não esquecido)

**Problema:** a página pública de assinatura (`/assinar-vistoria/$token` →
`/public/inspections/*`) e o resumo por IA (`inspection_summary` em
`backend/src/routes/ai.ts`) ainda consultam o **legado Supabase**. Vistorias
canônicas (Prisma/MySQL) nunca aparecem nesses fluxos.

**Por que não entrou no Bloco 0:** a correção depende da arquitetura definitiva
de assinaturas da vistoria canônica (modelo `inspection_signatures` com
vínculo a Party/AppUser, token de assinatura remota com hash, status
`awaiting_signature`/`signed`), que exige **migration** — fora do escopo
autorizado do Bloco 0. Migrar só a leitura agora criaria uma terceira
implementação provisória.

**Onde será tratado:** Bloco G (assinaturas). O resumo por IA será religado ao
domínio canônico no mesmo bloco ou logo após, junto com o laudo profissional
(Bloco H).

**Risco enquanto adiado:** convites de assinatura e resumos por IA não
funcionam para vistorias canônicas; não há vazamento de dados (as rotas legadas
continuam com o isolamento por empresa delas).

## Pendências conhecidas (fora do Bloco 0)

- Upload em base64 (paliativo); upload direto ao storage.
- Fotos de imóveis (`app.imoveis`) aceitam 8 MB e também excedem o limite de 4,5 MB da Vercel Function.
- Evidências já sincronizadas permanecem no IndexedDB (ocupam espaço).
- Tela de resolução de conflito offline.
- Comparação ainda pede o UUID da vistoria de entrada; não há painel de fotos gerais da vistoria nem botão de remover ambiente.
- Reload com o navegador 100% offline (documento servido pelo service worker) não foi validado em navegador.
