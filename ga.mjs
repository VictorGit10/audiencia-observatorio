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
import { sectionLabel, actionLabel, validateManifest, mergeMaterials, readReport, reportUsage } from './analytics-model.mjs';

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
  load_more: 'Clicou em “Carregar mais itens” no catálogo',
  open_article: 'Abriu um artigo',
  nav_panorama: 'Foi para o Panorama da IA generativa',
  select_type_tab: 'Trocou o tipo de conteúdo (artigos, notícias…)',
  nav_participate: 'Clicou em “Participe” (formulário)',
  nav_audiencia: 'Foi para “Quem visita o Observatório?”',
  nav_daily_news: 'Foi para “IA como notícia diária”',
  select_collection_theme: 'Escolheu um tema de coleção',
  nav_ecosystem: 'Foi para o Ecossistema UFG',
  select_keyword: 'Clicou numa palavra da nuvem de assuntos',
  select_paper_area: 'Filtrou artigos por área',
  daily_news_period: 'Mudou o período das notícias diárias',
  open_obia: 'Saiu para o OBIA (observatório nacional)',
  select_theme: 'Filtrou por tema',
  nav_subjects: 'Foi para “Assuntos”',
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
const NAVEGADORES = { 'Android Webview': 'Dentro de apps (Android)', 'Android Runtime': 'Dentro de apps (Android)',
  'Safari (in-app)': 'Dentro de apps (iPhone)', '(not set)': null };
const SISTEMAS = { Macintosh: 'macOS', iOS: 'iOS (iPhone e iPad)', 'Chrome OS': 'ChromeOS', '(not set)': null };
const IDIOMAS = { Portuguese: 'Português', English: 'Inglês', Spanish: 'Espanhol', French: 'Francês', German: 'Alemão',
  Chinese: 'Chinês', Italian: 'Italiano', Japanese: 'Japonês', Russian: 'Russo', '(not set)': null };
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// faixas do dia, no fuso da propriedade (Brasília)
const faixaHora = h => (h < 6 ? 'Madrugada (0h–6h)' : h < 12 ? 'Manhã (6h–12h)' : h < 18 ? 'Tarde (12h–18h)' : 'Noite (18h–24h)');
const DISPOSITIVOS = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet', 'smart tv': 'TV' };
const FONTES = { '(direct)': null, google: 'Google (busca)', bing: 'Bing (busca)', 'l.instagram.com': 'Instagram',
  'm.facebook.com': 'Facebook', 'lm.facebook.com': 'Facebook', 'jornal.ufg.br': 'Jornal UFG',
  'lapig.iesa.ufg.br': 'Site do LAPIG', 'sigaa.sistemas.ufg.br': 'SIGAA (UFG)', 'github.com': 'GitHub',
  'teams.public.onecdn.static.microsoft': 'Microsoft Teams', 'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn',
  'chatgpt.com': 'ChatGPT', 'duckduckgo': 'DuckDuckGo', 'ufg.br': 'Portal UFG', 'jornalufg.ufg.br': 'Jornal UFG',
  'classroom.google.com': 'Google Sala de Aula', 'youtube.com': 'YouTube', 'm.youtube.com': 'YouTube' };

// ── destaque da semana ──────────────────────────────────────────────────────
// O destaque leva a textos, áudios e slides fora do site: o GA registra esses cliques
// automaticamente (evento "click" + linkUrl). Os links de cada edição são lidos do código do
// site por um manifesto publicado e acumulados em destaque-links.json para preservar o histórico.
const DESTAQUE_URL = 'https://lapig-ufg.github.io/observatorio-ia/analytics-manifest.json';
const DESTAQUE_ARQ = join(HERE, 'destaque-links.json');
const MANIFEST_ARQ = join(HERE, 'destaque-atual.json');

async function linksDoDestaque() {
  let links = {};
  try { links = JSON.parse(readFileSync(DESTAQUE_ARQ, 'utf8')); } catch {}
  let manifest;
  let cache = false;
  try {
    const response = await fetch(DESTAQUE_URL, {signal:AbortSignal.timeout(20000),cache:'no-store'});
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    // Schema errors fail the collection: never replace correct data with a silent zero.
    manifest = await response.json();
  } catch (error) {
    if (!existsSync(MANIFEST_ARQ)) throw error;
    manifest = JSON.parse(readFileSync(MANIFEST_ARQ,'utf8'));
    cache = true;
    console.warn(`  ⚠ destaque: usando última edição salva (${error.message})`);
  }
  manifest = validateManifest(manifest);
  links = mergeMaterials(links, manifest);
  writeFileSync(DESTAQUE_ARQ, JSON.stringify(links, null, 1) + '\n');
  writeFileSync(MANIFEST_ARQ, JSON.stringify(manifest, null, 2) + '\n');
  return {links,edicao:manifest.edition,manifest,cache};
}

// Só o tema atual: os links da edição que está no ar hoje
async function destaque(inicio, fim, {links, edicao, manifest}) {
  // Only days when the current edition was available belong in its readership.
  inicio = inicio < manifest.startsOn ? manifest.startsOn : inicio;
  const empty = {cliques:0,pessoas:0,viram:0,porTipo:[],porItem:[],levantamento:0,levantamentoDesde:'2026-10-19'};
  if (inicio > fim) return empty;
  const urls = manifest.materials.filter(x=>x.href.startsWith('https://')).map(x=>x.href);
  const external = {andGroup:{expressions:[
    {filter:{fieldName:'eventName',stringFilter:{matchType:'EXACT',value:'click'}}},
    {filter:{fieldName:'linkUrl',inListFilter:{values:urls}}},
  ]}};
  const internal = {filter:{fieldName:'eventName',stringFilter:{matchType:'EXACT',value:'open_featured_survey'}}};
  const combined = urls.length ? {orGroup:{expressions:[external,internal]}} : internal;
  const [cliques,pessoas,viram,levantamento] = await Promise.all([
    urls.length ? relatorio(inicio,fim,['linkUrl'],['eventCount'],{dimensionFilter:external}) : [],
    relatorio(inicio,fim,[],['activeUsers'],{dimensionFilter:combined}),
    relatorio(inicio,fim,[],['activeUsers'],{dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{matchType:'EXACT',value:'view_featured_highlight'}}}}),
    manifest.materials.some(x=>x.kind==='survey') ? relatorio(inicio,fim,[],['eventCount'],{dimensionFilter:internal}) : [],
  ]);
  const tipos = new Map(), itens = new Map();
  const soma = (map,key,value)=>map.set(key,(map.get(key)??0)+value);
  for (const row of cliques) {
    const info = links[row.d[0]];
    soma(tipos,info.tipo,row.m[0]);soma(itens,info.titulo,row.m[0]);
  }
  const internalCount=levantamento[0]?.m[0]??0;
  const survey=manifest.materials.find(x=>x.kind==='survey');
  if(survey && internalCount) {soma(tipos,'Explorou o levantamento',internalCount);soma(itens,survey.title,internalCount);}
  const ordenar=map=>[...map].map(([nome,valor])=>({nome,valor})).sort((a,b)=>b.valor-a.valor);
  const porTipo=ordenar(tipos);
  return {...empty,cliques:porTipo.reduce((sum,x)=>sum+x.valor,0),pessoas:pessoas[0]?.m[0]??0,viram:viram[0]?.m[0]??0,porTipo,porItem:ordenar(itens),levantamento:internalCount};
}

// ── cliente ─────────────────────────────────────────────────────────────────
const credPath = process.env.GA_KEY_FILE || join(HERE, 'credenciais.json');
const client = process.env.GA_CREDENTIALS
  ? new BetaAnalyticsDataClient({ credentials: JSON.parse(process.env.GA_CREDENTIALS) })
  : new BetaAnalyticsDataClient({ keyFilename: credPath });

function relatorio(inicio, fim, dims, mets, extra = {}) {
  return readReport(client, PROPERTY, cfg.observatorio.hostName, inicio, fim, dims, mets, extra);
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

async function periodo(chave, inicio, fim, dest) {
  const temAnterior = chave !== 'tudo';
  const dias = diasEntre(inicio, fim) + 1;
  const [atual, anterior, secoes, canais, fontes, cidades, paises, disp, eventos, navs, sists, idiomas, diasSem, horas] = await Promise.all([
    kpis(inicio, fim),
    temAnterior && addDays(inicio, -dias) >= INICIO_COLETA ? kpis(addDays(inicio, -dias), addDays(inicio, -1)) : null,
    relatorio(inicio, fim, ['pageTitle'], ['screenPageViews']),
    relatorio(inicio, fim, ['sessionDefaultChannelGroup'], ['sessions']),
    relatorio(inicio, fim, ['sessionSource'], ['sessions']),
    relatorio(inicio, fim, ['city'], ['activeUsers']),
    relatorio(inicio, fim, ['country'], ['activeUsers']),
    relatorio(inicio, fim, ['deviceCategory'], ['activeUsers']),
    relatorio(inicio, fim, ['eventName'], ['eventCount']),
    relatorio(inicio, fim, ['browser'], ['activeUsers']),
    relatorio(inicio, fim, ['operatingSystem'], ['activeUsers']),
    relatorio(inicio, fim, ['language'], ['activeUsers']),
    relatorio(inicio, fim, ['dayOfWeek'], ['sessions']),
    relatorio(inicio, fim, ['hour'], ['sessions']),
  ]);
  const porHora = Array.from({ length: 24 }, (_, h) => horas.find(l => Number(l.d[0]) === h)?.m[0] ?? 0);
  return {
    inicio, fim, dias,
    kpis: atual,
    anterior,
    secoes: agrupar(secoes, sectionLabel),
    canais: agrupar(canais, c => c).map(x => ({ ...x, rotulo: CANAIS[x.nome]?.[0] ?? x.nome, explica: CANAIS[x.nome]?.[1] ?? '' })),
    fontes: agrupar(fontes, f => (f in FONTES ? FONTES[f] : f)).slice(0, 10),
    cidades: agrupar(cidades, c => (c === '(not set)' ? null : CIDADES[c] ?? c)).slice(0, 10),
    paises: agrupar(paises, p => (p === '(not set)' ? null : PAISES[p] ?? p)).slice(0, 8),
    dispositivos: agrupar(disp, d => DISPOSITIVOS[d] ?? d),
    navegadores: agrupar(navs, n => (n in NAVEGADORES ? NAVEGADORES[n] : n)).slice(0, 6),
    sistemas: agrupar(sists, n => (n in SISTEMAS ? SISTEMAS[n] : n)).slice(0, 6),
    idiomas: agrupar(idiomas, n => (n in IDIOMAS ? IDIOMAS[n] : n)).slice(0, 5),
    // dia da semana na ordem do calendário (segunda a domingo), não por tamanho
    diasSemana: [1, 2, 3, 4, 5, 6, 0].map(d => ({ nome: DIAS_SEMANA[d], valor: diasSem.find(l => Number(l.d[0]) === d)?.m[0] ?? 0 })),
    faixasHorario: ['Manhã (6h–12h)', 'Tarde (12h–18h)', 'Noite (18h–24h)', 'Madrugada (0h–6h)']
      .map(nome => ({ nome, valor: porHora.reduce((s, v, h) => s + (faixaHora(h) === nome ? v : 0), 0) })),
    horaPico: porHora.indexOf(Math.max(...porHora)),
    acoes: agrupar(eventos, e => actionLabel(e, ACOES)),
    destaque: await destaque(inicio, fim, dest),
  };
}

async function coletar() {
  console.log(`▸ Observatório UFG-IA (${PROPERTY}) — até ${ONTEM}`);
  const janelas = { 7: addDays(ONTEM, -6), 30: addDays(ONTEM, -29), tudo: INICIO_COLETA };
  const dest = await linksDoDestaque();
  const periodos = {};
  for (const [k, ini] of Object.entries(janelas)) {
    periodos[k] = await periodo(k, ini < INICIO_COLETA ? INICIO_COLETA : ini, ONTEM, dest);
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
  return { geradoEm: new Date().toISOString(), inicioColeta: INICIO_COLETA, ate: ONTEM, edicaoDestaque: dest.edicao, escopo: { hostName: cfg.observatorio.hostName, excluiTestesLocais: true }, destaqueEmCache: dest.cache, periodos, diario };
}

try {
  const dados = await coletar();
  console.log(`  ℹ uso da API: ${JSON.stringify(reportUsage(client))}`);
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
