import test from 'node:test';
import assert from 'node:assert/strict';
import {readReport,sectionLabel,actionLabel,mergeMaterials,validateManifest} from '../analytics-model.mjs';

test('all API pages retain production scope and combine event filters, beyond the old 250-day limit',async()=>{
 const requests=[];
 const rows=Array.from({length:301},(_,i)=>({dimensionValues:[{value:String(i)}],metricValues:[{value:'1'}]}));
 const client={runReport:async r=>{requests.push(r);return [{rowCount:301,rows:rows.slice(r.offset,r.offset+180)}]}};
 const event={filter:{fieldName:'eventName',stringFilter:{matchType:'EXACT',value:'click'}}};
 const result=await readReport(client,'properties/1','lapig-ufg.github.io','2026-01-01','2026-12-31',['date'],['screenPageViews'],{dimensionFilter:event});
 assert.equal(result.length,301);assert.deepEqual(requests.map(r=>r.offset),[0,180]);
 for(const r of requests){assert.equal(r.dimensionFilter.andGroup.expressions[0].filter.stringFilter.value,'lapig-ufg.github.io');assert.deepEqual(r.dimensionFilter.andGroup.expressions[1],event);}
 assert.equal(result.at(-1).d[0],'300');
});

test('unfiltered totals and breakdowns always receive the same production filter',async()=>{
 let request;
 const client={runReport:async r=>{request=r;return [{rowCount:1,rows:[{metricValues:[{value:'38'}]}]}]}};
 const result=await readReport(client,'properties/1','lapig-ufg.github.io','yesterday','yesterday',[],['activeUsers']);
 assert.equal(result[0].m[0],38);assert.equal(request.dimensionFilter.filter.fieldName,'hostName');
 await assert.rejects(()=>readReport(client,'properties/1','','yesterday','yesterday',[],['activeUsers']),/Domínio/);
 await assert.rejects(()=>readReport({runReport:async()=>[{rowCount:1,rows:[]}]},'properties/1','example.org','yesterday','yesterday',['date'],['eventCount']),/sem progresso/);
});

test('old and bilingual routes consolidate, while newly introduced custom events remain visible',()=>{
 for(const title of ['Catálogo','Catálogo | Observatório UFG-IA','Acervo | Observatório UFG-IA','Collection | LAPIG/UFG'])assert.equal(sectionLabel(title),'Acervo de publicações');
 assert.equal(sectionLabel('AI policies in scholarly publishing | LAPIG/UFG'),sectionLabel('Políticas de IA na publicação científica | Observatório UFG-IA'));
 assert.equal(sectionLabel('UFG-AI Observatory | LAPIG/UFG'),'Página inicial');
 assert.equal(actionLabel('survey_download_en'),actionLabel('survey_download'));
 assert.equal(actionLabel('new_future_custom_event'),'Outras interações no site');
 assert.equal(actionLabel('page_view'),null);
});

test('current material metadata repairs generic labels without removing past editions',()=>{
 const manifest=validateManifest({schemaVersion:1,edition:'Edição atual',startsOn:'2026-10-17',materials:[{href:'https://example.org/audio',title:'Podcast',kind:'audio'},{href:'#survey',title:'Levantamento',kind:'survey'}]});
 const old={'https://example.org/old':{edicao:'Edição anterior'},'https://example.org/audio':{titulo:'Link no texto de apresentação',tipo:'Leu o texto original'}};
 const result=mergeMaterials(old,manifest);
 assert.equal(result['https://example.org/audio'].tipo,'Ouviu a análise em áudio');
 assert.equal(result['https://example.org/audio'].titulo,'Podcast');assert.equal(result['https://example.org/old'].edicao,'Edição anterior');
 assert.equal(old['https://example.org/audio'].titulo,'Link no texto de apresentação');
 assert.throws(()=>validateManifest({...manifest,materials:[...manifest.materials,...manifest.materials]}),/duplicado/);
});
