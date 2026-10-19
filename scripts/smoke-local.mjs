import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const site=path.resolve(process.env.OBSERVATORIO_DIST || '../observatorio-metricas/dist');
const panel=process.cwd();
const screenshotDir=path.resolve(process.env.SMOKE_OUTPUT || '.smoke');
await fs.mkdir(screenshotDir,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.csv':'text/csv','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon'};
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 const hits=[];const errors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname.endsWith('google-analytics.com')&&url.pathname.includes('collect')){
   const values=new URLSearchParams(url.search);const body=route.request().postData()||'';
   for (const line of (body ? body.split('\n') : [''])) { const eventValues=new URLSearchParams(values); for(const [key,value] of new URLSearchParams(line))eventValues.set(key,value); hits.push({event:eventValues.get('en'),url:eventValues.get('dl'),body:line}); } return route.fulfill({status:204,body:''});
  }
  let root,rel;
  if(url.hostname==='lapig-ufg.github.io' && url.pathname.startsWith('/observatorio-ia/')){root=site;rel=url.pathname.slice('/observatorio-ia/'.length);}
  if(url.hostname==='victorgit10.github.io'&&url.pathname.startsWith('/audiencia-observatorio/')){root=panel;rel=url.pathname.slice('/audiencia-observatorio/'.length);}
  if(root && process.env.SMOKE_LIVE === "true") return route.continue();
  if(root){
   if(!rel||rel.endsWith('/'))rel+='index.html';
   const file=path.resolve(root,decodeURIComponent(rel));
   if(!file.startsWith(path.resolve(root)+path.sep))return route.abort();
   try{return route.fulfill({body:await fs.readFile(file),contentType:mime[path.extname(file)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'Not found'});}
  }
  if(url.hostname==='www.googletagmanager.com')return route.continue();
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const stats=[];
 for(const entry of ['','en/']){
  hits.length=0;
  await page.goto('https://lapig-ufg.github.io/observatorio-ia/'+entry,{waitUntil:'networkidle'});
  await page.waitForTimeout(3000);
  const queued=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event'&&x[1]==='page_view').map(x=>x[2]));
  assert.equal(queued.length,1,'one initial page_view for '+entry);
  stats.push({entry,queued:queued.length,networkPageViews:hits.filter(x=>x.event==='page_view').length});
  await page.evaluate(()=>{location.hash='#panorama'});await page.waitForTimeout(6000);
  const routeQueued=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event'&&x[1]==='page_view').length);
  assert.equal(routeQueued,2,'one view per route change');
  stats.at(-1).routeNetworkViews=hits.filter(x=>x.event==='page_view').length; stats.at(-1).networkEvents=structuredClone(hits); assert.equal(stats.at(-1).networkPageViews,1,'one initial GA request'); assert.equal(stats.at(-1).routeNetworkViews,2,'one additional GA request for route');
  await page.goto('https://lapig-ufg.github.io/observatorio-ia/'+entry,{waitUntil:'networkidle'});
  await page.locator('.featured-quick-links a').first().click();
  const internal=await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event'&&x[1]==='open_featured_survey').length);
  assert.equal(internal,1,'quick link emits internal survey once');
 }
 await page.goto('https://lapig-ufg.github.io/observatorio-ia/por-dentro-da-ia/',{waitUntil:'networkidle'});
 assert.equal(await page.evaluate(()=>window.dataLayer.filter(x=>x[0]==='event'&&x[1]==='page_view').length),1,'lesson sends one page view');
 await page.goto('https://victorgit10.github.io/audiencia-observatorio/',{waitUntil:'networkidle'});
 await page.locator('[data-p="7"]').click();
 await page.locator('[data-p="30"]').click();
 await page.locator('[data-p="tudo"]').click();
 await page.locator('#todas-acoes').click();
 assert.match(await page.locator('#dest-item').innerText(),/Da norma|caos|Governança/);
 assert.ok(await page.locator('#acoes .bar').count()>12);
 await page.screenshot({path:screenshotDir+'/painel-corrigido-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-p="7"]').click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile has no horizontal overflow');
 await page.screenshot({path:screenshotDir+'/painel-corrigido-mobile.png',fullPage:true});
 assert.deepEqual(errors,[],'no page errors');
 console.log(JSON.stringify({stats,pageErrors:errors,screenshots:screenshotDir},null,2));
 await fs.writeFile(screenshotDir+'/smoke-results.json',JSON.stringify({stats,pageErrors:errors},null,2));
}finally{await browser.close()}