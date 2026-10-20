// Shared transformations and API safeguards, independently testable without credentials.
export function sectionLabel(title) {
  const name = title.replace(/ \| (Observatório UFG-IA|LAPIG\/UFG)$/, '').trim();
  return ({
    'Observatório UFG-IA': 'Página inicial', 'UFG-AI Observatory': 'Página inicial',
    'UFG-AI Observatory — English': 'Acervo de publicações',
    'Catálogo': 'Acervo de publicações', 'Acervo': 'Acervo de publicações', 'Collection': 'Acervo de publicações',
    'Panorama da IA generativa': 'Panorama da IA generativa', 'Global Generative AI Landscape': 'Panorama da IA generativa',
    'IA como notícia diária': 'IA como notícia diária', 'AI in the daily news': 'IA como notícia diária',
    'Ecossistema UFG': 'Ecossistema de IA da UFG', 'UFG AI Ecosystem': 'Ecossistema de IA da UFG',
    'Atlas Semântico': 'Atlas semântico', 'Leituras em IA': 'Leituras em IA', 'AI Readings': 'Leituras em IA',
    'Políticas de IA na publicação científica': 'Políticas de IA na publicação científica',
    'AI policies in scholarly publishing': 'Políticas de IA na publicação científica',
    'Sobre': 'Sobre o Observatório', 'About': 'Sobre o Observatório',
    'Por dentro da IA — Da frase ao próximo token': 'Aula: Por dentro da IA',
  })[name] ?? (name === '(not set)' ? 'Seção não identificada' : name);
}

export const NEW_ACTIONS = {
  nav_catalog: 'Foi para o Acervo', nav_surveys: 'Foi para os levantamentos',
  nav_ai_readings: 'Foi para Leituras em IA', nav_home_task: 'Navegou pela página inicial',
  nav_home: 'Voltou à página inicial', nav_about: 'Foi para Sobre o Observatório',
  nav_featured: 'Foi para o destaque da semana', nav_experiences: 'Foi para as experiências interativas',
  search_from_hero: 'Pesquisou no acervo', clear_search: 'Limpou a busca', refresh_catalog: 'Atualizou o acervo',
  retry_load: 'Tentou carregar o acervo novamente', view_all_empty: 'Abriu o acervo completo após uma busca',
  survey_tab: 'Trocou de aba no levantamento', survey_download: 'Baixou dados do levantamento',
  survey_area: 'Filtrou o levantamento por área', survey_scope: 'Filtrou o levantamento por abrangência',
  survey_search: 'Pesquisou no levantamento', survey_filter: 'Filtrou o levantamento',
  survey_source: 'Abriu uma fonte do levantamento', survey_clear_filters: 'Limpou filtros do levantamento',
  open_featured_material: 'Abriu um material do destaque', open_featured_survey: 'Abriu o levantamento pelo destaque',
  toggle_featured_history: 'Abriu ou fechou os destaques anteriores', open_featured_history: 'Abriu um destaque anterior',
  panorama_tab: 'Trocou de aba no Panorama', panorama_filter: 'Filtrou o Panorama',
  panorama_open_detail: 'Abriu detalhes de um modelo', panorama_toggle_expanded: 'Expandiu ou recolheu o Panorama',
  panorama_guide_category: 'Filtrou o guia de modelos', panorama_guide_compare: 'Comparou modelos no guia',
  panorama_guide_sort: 'Ordenou o guia de modelos', panorama_guide_timeline: 'Abriu a linha do tempo do guia',
  panorama_usage_section: 'Navegou pelo guia de uso da IA', panorama_usage_example: 'Explorou um exemplo de uso da IA',
  daily_news_clear_filters: 'Limpou filtros das notícias diárias', open_news_article: 'Abriu uma notícia diária',
  open_contact_form: 'Abriu o formulário de contato', nav_github: 'Abriu o GitHub do LAPIG',
  file_download: 'Baixou um arquivo', form_submit: 'Enviou um formulário',
};
const AUTOMATIC_EVENTS = new Set(['page_view', 'session_start', 'first_visit', 'user_engagement', 'scroll', 'click', 'view_search_results', 'form_start', 'view_featured_highlight']);
export function actionLabel(name, legacy = {}) {
  const canonical = name.replace(/_en$/, '');
  if (AUTOMATIC_EVENTS.has(canonical)) return null;
  return NEW_ACTIONS[canonical] ?? legacy[canonical] ?? 'Outras interações no site';
}

export function validateManifest(value) {
  if (value?.schemaVersion !== 1 || !value.edition || !/^\d{4}-\d{2}-\d{2}$/.test(value.startsOn) || !value.materials?.length) throw Error('Manifesto de audiência ausente ou inválido');
  const seen = new Set();
  for (const item of value.materials) {
    if (!item.title || !['audio', 'presentation', 'document', 'survey'].includes(item.kind) || !/^(https:\/\/|#)/.test(item.href) || seen.has(item.href)) throw Error('Material de destaque inválido ou duplicado');
    seen.add(item.href);
  }
  return value;
}
export const MATERIAL_LABELS = {audio:'Ouviu a análise em áudio',presentation:'Viu a apresentação',document:'Abriu o documento',survey:'Explorou o levantamento'};
export function mergeMaterials(previous, manifest) {
  const links = {...previous};
  for (const item of manifest.materials) links[item.href] = {titulo:item.title,tipo:MATERIAL_LABELS[item.kind],edicao:manifest.edition};
  return links;
}

// A shared queue also limits calls launched by different periods and paginated reports.
const requestStates = new WeakMap();
function requestState(client) {
  if (!requestStates.has(client)) requestStates.set(client, {active:0,waiting:[],requests:0,maxConcurrent:0,tokensConsumed:null,quota:null});
  return requestStates.get(client);
}
export function reportUsage(client) {
  const state = requestState(client);
  return {requests:state.requests,maxConcurrent:state.maxConcurrent,tokensConsumed:state.tokensConsumed,
    remainingTokensPerDay:state.quota?.tokensPerDay?.remaining ?? null,
    remainingTokensPerHour:state.quota?.tokensPerHour?.remaining ?? null,
    remainingTokensPerProjectPerHour:state.quota?.tokensPerProjectPerHour?.remaining ?? null};
}
async function limitedReport(client, request) {
  const state = requestState(client);
  if (state.active >= 5) await new Promise(resolve => state.waiting.push(resolve));
  else state.active++;
  state.maxConcurrent = Math.max(state.maxConcurrent, state.active);
  state.requests++;
  try {
    const response = await client.runReport({...request,returnPropertyQuota:true});
    const quota = response[0]?.propertyQuota;
    if (quota) {
      state.quota = quota;
      if (quota.tokensPerDay?.consumed != null) state.tokensConsumed = (state.tokensConsumed ?? 0) + Number(quota.tokensPerDay.consumed);
    }
    return response;
  } finally {
    // Hand the occupied slot straight to the next waiter, including after API errors.
    const next = state.waiting.shift();
    if (next) next();
    else state.active--;
  }
}

export async function readReport(client, property, hostName, inicio, fim, dims, mets, extra={}) {
  if (!hostName) throw Error('Domínio de produção não configurado');
  const {dimensionFilter, ...options} = extra;
  const production = {filter:{fieldName:'hostName',stringFilter:{matchType:'EXACT',value:hostName,caseSensitive:false}}};
  const request = {
    property, dateRanges:[{startDate:inicio,endDate:fim}],
    dimensions:dims.map(name=>({name})), metrics:mets.map(name=>({name})),
    orderBys:dims.map(dimensionName=>({dimension:{dimensionName}})),
    ...options,
    dimensionFilter: dimensionFilter ? {andGroup:{expressions:[production,dimensionFilter]}} : production,
    limit:10000,
  };
  const rows=[];
  let offset=0;
  for (;;) {
    const [response] = await limitedReport(client, {...request,offset});
    const page=response.rows??[];
    rows.push(...page.map(row=>({d:(row.dimensionValues??[]).map(v=>v.value),m:(row.metricValues??[]).map(v=>Number(v.value))})));
    offset+=page.length;
    if (offset >= Number(response.rowCount??page.length)) return rows;
    if (!page.length) throw Error('Paginação do GA sem progresso: histórico incompleto');
  }
}
