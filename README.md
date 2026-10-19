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

## Escopo e manutenção

Todos os relatórios, comparações e a série histórica filtram `hostName` pelo domínio público em `config.json`. Isso exclui localhost/127.0.0.1 inclusive de datas anteriores. Testes realizados no próprio domínio público ainda podem aparecer. Os snapshots antigos são preservados como registros do resultado calculado na época; `data.js` é recalculado desde o início.

O destaque lê `analytics-manifest.json` publicado no próprio Observatório, gerado durante o build a partir do componente atual. Os materiais são classificados por tipo e mantidos em `destaque-links.json`, preservando edições antigas. Uma cópia em `destaque-atual.json` permite operar durante uma indisponibilidade de rede; o painel informa quando ela foi usada.

Os cliques externos usam apenas o evento automático `click`, sem somar o evento customizado do mesmo clique. O levantamento interno usa `open_featured_survey`, medido a partir de 19/10/2026. Não é possível reconstruir esse indicador para datas em que o evento não existia. Os números do destaque se restringem aos dias em que a edição atual estava disponível.

Nomes antigos e atuais das seções e suas traduções são agrupados. Eventos customizados desconhecidos entram em "Outras interações no site", permitindo detectar novos usos sem descartá-los. O botão de interações mostra a lista completa. O histórico da API é paginado, evitando perder dias após a 250ª linha.

Validação: `npm test`. Para usar uma chave existente fora deste diretório, defina `GA_KEY_FILE` com seu caminho e `CI=true` antes de executar `npm run coletar`. A chave nunca deve entrar no repositório.

Teste visual e de eventos: com o Observatório compilado, execute `OBSERVATORIO_DIST=<pasta dist> SMOKE_OUTPUT=<pasta de evidências> npm run test:browser` (no PowerShell, defina essas variáveis com `$env:`). O teste usa Chrome headless, serve os artefatos localmente no contexto do domínio de produção e intercepta as requisições de coleta, sem enviá-las ao GA.
