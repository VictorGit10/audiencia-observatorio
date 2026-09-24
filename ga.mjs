#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ga.mjs — Coleta os dados do GA4 do Observatório UFG-IA e gera data.js,
// que o index.html lê.
//
// Uso:  node ga.mjs
//
// Credenciais (uma das duas):
//   • variável de ambiente GA_CREDENTIALS com o JSON da service account (CI)
//   • arquivo analytics/credenciais.json (máquina local)
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { exec } from 'node:child_process';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const HERE = dirname(fileURLToPath(import.meta.url));
const CI = !!process.env.CI;
const cfg = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
const PROPERTY = `properties/${cfg.observatorio.propertyId}`;
const INICIO_COLETA = cfg.observatorio.inicioColeta ?? '2026-07-20';   // 1º dia com dados no GA4

// ── datas (fuso de Brasília, igual ao da propriedade) ───────────────────────
const isoBR = d => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
// "hoje" ainda está pela metade — os períodos terminam ontem, para comparar dias completos
const ONTEM = addDays(isoBR(new Date()), -1);

// ── traduções: o que cada coisa do GA significa para quem lê ────────────────
const SECOES = {
  'Catálogo': 'Catálogo de publicações',
  'UFG-AI Observatory — English': 'Catálogo de publicações',
  'Panorama da IA generativa': 'Panorama da IA generativa',
  'Global Generative AI Landscape': 'Panorama da IA generativa',
  'IA como notícia diária': 'IA como notícia diária',
  'Ecossistema UFG': 'Ecossistema de IA da UFG',
  'UFG AI Ecosystem': 'Ecossistema de IA da UFG',
  'Atlas Semântico': 'Atlas semântico',
  'Observatório UFG-IA | LAPIG/UFG': 'Página de entrada (site do LAPIG)',
};

const CANAIS = {
  'Direct': ['Acesso direto', 'Digitou o endereço, usou um favorito ou abriu um link de WhatsApp/e-mail (que não informam a origem).'],
  'Referral': ['Links em outros sites', 'Clicou num link publicado em outro site — jornal da UFG, SIGAA, site do LAPIG etc.'],
  'Organic Search': ['Busca no Google/Bing', 'Pesquisou algo e clicou no resultado.'],
  'Organic Social': ['Redes sociais', 'Veio de Instagram, Facebook, LinkedIn, X…'],
  'Organic Video': ['YouTube e vídeo', 'Clicou num link de vídeo.'],
  'AI Assistant': ['Assistentes de IA', 'Veio de um link citado pelo ChatGPT, Gemini, Perplexity…'],
  'Email': ['E-mail', 'Clicou num link de newsletter ou e-mail marcado.'],
  'Unassigned': ['Não identificado', 'O Google não conseguiu classificar a origem.'],
};

const ACOES = {
  select_category: 'Filtrou o catálogo por categoria',
  load_more: 'Pediu para carregar mais itens',
  open_weekly_highlight: 'Abriu o destaque da semana',
  open_article: 'Abriu um artigo',
  nav_panorama: 'Foi para o Panorama da IA generativa',
  select_type_tab: 'Trocou o tipo de conteúdo (artigos, notícias…)',
  nav_participate: 'Clicou em “Participe” (formulário)',
  nav_daily_news: 'Foi para “IA como notícia diária”',
  select_collection_theme: 'Escolheu um tema de coleção',
  nav_ecosystem: 'Foi para o Ecossistema UFG',
  select_keyword: 'Clicou numa palavra da nuvem de assuntos',
  select_paper_area: 'Filtrou artigos por área',
  daily_news_period: 'Mudou o período das notícias diárias',
  toggle_featured_history: 'Abriu os destaques anteriores',
  open_obia: 'Saiu para o OBIA (observatório nacional)',
  select_theme: 'Filtrou por tema',
  nav_subjects: 'Foi para “Assuntos”',
  download_weekly_highlight_podcast: 'Baixou o podcast do destaque da semana',
  open_interactive_inference: 'Abriu o interativo “Por dentro da inferência”',
  open_article_pdf: 'Abriu o PDF de um artigo',
  daily_news_open_article: 'Abriu uma notícia diária',
  open_initiative: 'Abriu uma iniciativa do ecossistema',
  clear_filters: 'Limpou os filtros',
};

const PAISES = { Brazil: 'Brasil', 'United States': 'Estados Unidos', India: 'Índia', 'United Kingdom': 'Reino Unido',
  Ireland: 'Irlanda', Sweden: 'Suécia', Tanzania: 'Tanzânia', Portugal: 'Portugal', Germany: 'Alemanha', France: 'França',
  Canada: 'Canadá', Spain: 'Espanha', Mexico: 'México', Argentina: 'Argentina', China: 'China', Japan: 'Japão',
  Netherlands: 'Países Baixos', Italy: 'Itália', Chile: 'Chile', Colombia: 'Colômbia', Singapore: 'Singapura' };
const CIDADES = { Goiania: 'Goiânia', 'Sao Paulo': 'São Paulo', Brasilia: 'Brasília', Florianopolis: 'Florianópolis',
  Anapolis: 'Anápolis', 'Aparecida de Goiania': 'Aparecida de Goiânia', Uberlandia: 'Uberlândia', Belem: 'Belém',
  Vitoria: 'Vitória', Maceio: 'Maceió', 'Sao Luis': 'São Luís', Niteroi: 'Niterói', Cuiaba: 'Cuiabá' };
const DISPOSITIVOS = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet', 'smart tv': 'TV' };
const FONTES = { '(direct)': null, google: 'Google (busca)', bing: 'Bing (busca)', 'l.instagram.com': 'Instagram',
  'm.facebook.com': 'Facebook', 'lm.facebook.com': 'Facebook', 'jornal.ufg.br': 'Jornal UFG',
  'lapig.iesa.ufg.br': 'Site do LAPIG', 'sigaa.sistemas.ufg.br': 'SIGAA (UFG)', 'github.com': 'GitHub',
  'teams.public.onecdn.static.microsoft': 'Microsoft Teams', 'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn',
  'chatgpt.com': 'ChatGPT', 'duckduckgo': 'DuckDuckGo', 'ufg.br': 'Portal UFG', 'jornalufg.ufg.br': 'Jornal UFG',
  'classroom.google.com': 'Google Sala de Aula', 'youtube.com': 'YouTube', 'm.youtube.com': 'YouTube' };

// ── cliente ─────────────────────────────────────────────────────────────────
const credPath = join(HERE, 'credenciais.json');
const client = process.env.GA_CREDENTIALS
  ? new BetaAnalyticsDataClient({ credentials: JSON.parse(process.env.GA_CREDENTIALS) })
  : new BetaAnalyticsDataClient({ keyFilename: credPath });

async function relatorio(inicio, fim, dims, mets, extra = {}) {
  const [r] = await client.runReport({
    property: PROPERTY,
    dateRanges: [{ startDate: inicio, endDate: fim }],
    dimensions: dims.map(name => ({ name })),
    metrics: mets.map(name => ({ name })),
    limit: 250,
    ...extra,
  });
  return (r.rows ?? []).map(x => ({
    d: (x.dimensionValues ?? []).map(v => v.value),
    m: (x.metricValues ?? []).map(v => Number(v.value)),
  }));
}

// soma linhas que caem no mesmo rótulo depois da tradução
function agrupar(linhas, rotular, idx = 0) {
  const mapa = new Map();
  for (const l of linhas) {
    const k = rotular(l.d[0]);
    if (!k) continue;
    mapa.set(k, (mapa.get(k) ?? 0) + l.m[idx]);
  }
  return [...mapa].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
}

async function kpis(inicio, fim) {
  const [base] = await relatorio(inicio, fim, [],
    ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'userEngagementDuration', 'engagementRate', 'engagedSessions']);
  const m = base?.m ?? [0, 0, 0, 0, 0, 0, 0];
  const nvr = await relatorio(inicio, fim, ['newVsReturning'], ['activeUsers']);
  const retornantes = nvr.find(l => l.d[0] === 'returning')?.m[0] ?? 0;
  return {
    visitantes: m[0], novos: m[1], visitas: m[2], paginas: m[3],
    tempoMedio: m[0] ? m[4] / m[0] : 0,          // segundos de uso ativo por visitante
    engajamento: m[5],                           // fração de visitas "de verdade"
    retornantes,
  };
}

async function periodo(chave, inicio, fim) {
  const temAnterior = chave !== 'tudo';
  const dias = diasEntre(inicio, fim) + 1;
  const [atual, anterior, secoes, canais, fontes, cidades, paises, disp, eventos] = await Promise.all([
    kpis(inicio, fim),
    temAnterior && addDays(inicio, -dias) >= INICIO_COLETA ? kpis(addDays(inicio, -dias), addDays(inicio, -1)) : null,
    relatorio(inicio, fim, ['pageTitle'], ['screenPageViews']),
    relatorio(inicio, fim, ['sessionDefaultChannelGroup'], ['sessions']),
    relatorio(inicio, fim, ['sessionSource'], ['sessions']),
    relatorio(inicio, fim, ['city'], ['activeUsers']),
    relatorio(inicio, fim, ['country'], ['activeUsers']),
    relatorio(inicio, fim, ['deviceCategory'], ['activeUsers']),
    relatorio(inicio, fim, ['eventName'], ['eventCount']),
  ]);
  return {
    inicio, fim, dias,
    kpis: atual,
    anterior,
    secoes: agrupar(secoes, t => SECOES[t] ?? t),
    canais: agrupar(canais, c => c).map(x => ({ ...x, rotulo: CANAIS[x.nome]?.[0] ?? x.nome, explica: CANAIS[x.nome]?.[1] ?? '' })),
    fontes: agrupar(fontes, f => (f in FONTES ? FONTES[f] : f)).slice(0, 10),
    cidades: agrupar(cidades, c => (c === '(not set)' ? null : CIDADES[c] ?? c)).slice(0, 10),
    paises: agrupar(paises, p => (p === '(not set)' ? null : PAISES[p] ?? p)).slice(0, 8),
    dispositivos: agrupar(disp, d => DISPOSITIVOS[d] ?? d),
    acoes: agrupar(eventos, e => ACOES[e] ?? null).slice(0, 12),
  };
}

async function coletar() {
  console.log(`▸ Observatório UFG-IA (${PROPERTY}) — até ${ONTEM}`);
  const janelas = { 7: addDays(ONTEM, -6), 30: addDays(ONTEM, -29), tudo: INICIO_COLETA };
  const periodos = {};
  for (const [k, ini] of Object.entries(janelas)) {
    periodos[k] = await periodo(k, ini < INICIO_COLETA ? INICIO_COLETA : ini, ONTEM);
    console.log(`  ✓ período ${k}`);
  }
  const diarioBruto = await relatorio(INICIO_COLETA, ONTEM, ['date'], ['activeUsers', 'screenPageViews'],
    { orderBys: [{ dimension: { dimensionName: 'date' } }] });
  const mapa = new Map(diarioBruto.map(l => [l.d[0], l.m]));
  const diario = [];
  for (let d = INICIO_COLETA; d <= ONTEM; d = addDays(d, 1)) {
    const m = mapa.get(d.replaceAll('-', '')) ?? [0, 0];
    diario.push({ data: d, visitantes: m[0], paginas: m[1] });
  }
  return { geradoEm: new Date().toISOString(), inicioColeta: INICIO_COLETA, ate: ONTEM, periodos, diario };
}

try {
  const dados = await coletar();
  writeFileSync(join(HERE, 'data.js'), `// GERADO por ga.mjs — não editar\nwindow.__GA_DATA__ = ${JSON.stringify(dados)};\n`);
  mkdirSync(join(HERE, 'snapshots'), { recursive: true });
  writeFileSync(join(HERE, 'snapshots', `${ONTEM}.json`), JSON.stringify(dados));
  console.log('  ✓ data.js atualizado');
  if (!CI) {
    const f = join(HERE, 'index.html');
    exec(process.platform === 'win32' ? `start "" "${f}"` : process.platform === 'darwin' ? `open "${f}"` : `xdg-open "${f}"`);
  }
} catch (e) {
  console.error(`\n✗ Falhou: ${e.message ?? e}`);
  if (!existsSync(credPath) && !process.env.GA_CREDENTIALS) console.error('  Falta analytics/credenciais.json (ou a variável GA_CREDENTIALS).');
  process.exit(1);
}
