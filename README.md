# Audiência do Observatório UFG-IA

Relatório público de audiência do [Observatório UFG-IA](https://lapig-ufg.github.io/observatorio-ia/), com dados do Google Analytics 4 explicados em linguagem simples.

**Página:** https://victorgit10.github.io/audiencia-observatorio/

## Como funciona

- Todo dia às 06:00 (Brasília), o workflow [`atualizar.yml`](.github/workflows/atualizar.yml) roda `node ga.mjs`, que consulta a GA Data API e grava `data.js` + um snapshot em `snapshots/AAAA-MM-DD.json`.
- O commit desses arquivos atualiza o GitHub Pages sozinho.
- Para atualizar na hora: aba **Actions → Atualizar dados → Run workflow**.
- Os snapshots guardam o histórico no próprio repositório, independentemente do prazo de retenção do GA4.

## Acesso ao GA4

- Service account `ga-reader@fit-asset-447417-d2.iam.gserviceaccount.com` (projeto *My First Project* da conta Google victoramaral.lapig), com papel **Leitor** na conta do GA.
- A chave JSON fica no secret `GA_CREDENTIALS` do repositório. Localmente, salve-a como `credenciais.json` (ignorado pelo git).
- Propriedade e data de início da coleta: `config.json`.

## Rodar localmente

```bash
npm install
node ga.mjs        # coleta e abre index.html
```

> `index.html` lê `data.js` via `<script>`, então funciona aberto direto do disco.
