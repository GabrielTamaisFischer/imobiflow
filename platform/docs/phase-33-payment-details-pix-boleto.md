# Fase 33 - Detalhes reais de PIX e boleto apos emissao

## Objetivo

Esta fase evolui a emissao de cobrancas para persistir informacoes reais de pagamento retornadas pelo gateway, principalmente:

- QR Code PIX;
- codigo PIX copia e cola;
- link da fatura;
- PDF do boleto;
- linha digitavel do boleto.

## Asaas

Depois de criar a cobranca no Asaas, o ImobiFlow passa a consultar detalhes complementares quando aplicavel.

### PIX

Para cobrancas `pix`, o sistema consulta:

```txt
GET /v3/payments/{id}/pixQrCode
```

E persiste:

- `pix_qr_code`;
- `pix_copy_paste`.

Segundo a documentacao oficial do Asaas, esse endpoint retorna `encodedImage`, `payload` e `expirationDate`.

### Boleto

Para cobrancas `boleto`, o sistema usa os campos da criacao da cobranca e consulta, quando necessario:

```txt
GET /v3/payments/{id}/identificationField
```

E persiste:

- `boleto_pdf_url`;
- `boleto_digitable_line`;
- `boleto_barcode`, quando disponivel.

## Regra de seguranca

O sistema continua sem gerar dados ficticios:

```txt
Sem retorno real do gateway
↓
Sem QR Code
↓
Sem copia e cola
↓
Sem boleto
↓
Sem linha digitavel
```

Esses campos so sao preenchidos quando a chamada real ao provedor retorna dados validos.

## Portal do inquilino

O portal do inquilino passa a exibir, quando existirem:

- botao de fatura;
- botao de boleto;
- QR Code PIX;
- codigo PIX copia e cola com botao de copiar;
- linha digitavel do boleto.

## Resultado

Com esta fase, a experiencia de pagamento deixa de ser apenas administrativa e passa a entregar ao inquilino os dados reais para pagar a cobranca emitida.

## Proxima fase sugerida

Ampliar a baixa automatica por webhook financeiro:

```txt
Webhook do gateway
↓
Identifica cobranca
↓
Atualiza status
↓
Registra pagamento
↓
Calcula repasse
↓
Prepara recibo/notificacao
```
