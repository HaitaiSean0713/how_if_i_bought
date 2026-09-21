import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
async function loadTypeScript(path) {
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
 return import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
}
const {selectHistoricalQuote,validHistoricalDate,historicalRange}=await loadTypeScript('./src/lib/historical.ts');
const {migrateGuestPortfolios}=await loadTypeScript('./src/lib/guestMigration.ts');
const {readPortfolioDocument,sellPosition,operationError}=await loadTypeScript('./src/lib/portfolioOperations.ts');
test('Legacy embedded ID never changes the Firestore document targeted by an operation',()=>{
 const portfolio=readPortfolioDocument('actual-document',{id:'obsolete-id',name:'A'});
 assert.equal(portfolio.id,'actual-document');
 assert.deepEqual(portfolio.positions,[]);
 assert.deepEqual(portfolio.closedPositions,[]);
});
test('A sale uses latest holdings and rejects a stale oversell or deleted position',()=>{
 const portfolio={id:'a',name:'A',positions:[{id:'lot',symbol:'2330.TW',shares:600,buyPrice:100,totalCost:60000,buyDate:'2026-09-18'}],closedPositions:[]};
 assert.throws(()=>sellPosition(portfolio,'lot','sale','2026-09-21',150,1000),/持股數/);
 assert.throws(()=>sellPosition(portfolio,'missing','sale','2026-09-21',150,100),/不存在/);
 const sold=sellPosition(portfolio,'lot','sale','2026-09-21',150,400);
 assert.equal(sold.positions[0].shares,200);
 assert.equal(sold.positions[0].totalCost,20000);
 assert.equal(sold.closedPositions[0].realizedReturn,20000);
 assert.equal(portfolio.positions[0].shares,600);
 assert.equal(sellPosition(portfolio,'lot','sale','2026-09-21',150,600).positions.length,0);
});
test('Cloud permission, missing document and storage failures produce actionable messages',()=>{
 assert.match(operationError({code:'permission-denied'}),/權限/);
 assert.match(operationError({code:'not-found'}),/不存在/);
 assert.match(operationError(Object.assign(new Error(),{name:'QuotaExceededError'})),/儲存空間不足/);
});
test('Historical request range includes the requested day across month boundaries',()=>{
 assert.deepEqual(historicalRange('2026-03-01'),{period1:'2026-02-15',period2:'2026-03-02'});
});
test('Historical lookup skips null bars, future bars, and weekends',()=>{
 const bars=[{date:'2026-09-18T01:00:00Z',close:100},{date:'2026-09-19T01:00:00Z',close:null},{date:'2026-09-21T01:00:00Z',close:200}];
 assert.equal(selectHistoricalQuote(bars,'2026-09-20')?.close,100);
 assert.equal(selectHistoricalQuote(bars,'2026-09-17'),undefined);
 assert.equal(selectHistoricalQuote([{date:'2026-09-18',close:null}],'2026-09-20'),undefined);
});
test('Date validation rejects invalid calendar dates and future dates in Taiwan',()=>{
 const now=new Date('2026-09-20T17:00:00Z');
 assert.equal(validHistoricalDate('2026-09-21',now),true);
 for(const date of ['2026-02-30','2026-13-01','2026-09-22','not-a-date']) assert.equal(validHistoricalDate(date,now),false);
});
test('Failed migration keeps all local data and retry does not overwrite cloud edits',async()=>{
 const original=JSON.stringify([{id:'a',name:'A',positions:[],closedPositions:[]},{id:'b',name:'B',positions:[],closedPositions:[]}]);
 const local=new Map([['portfolios_guest',original]]);
 const storage={getItem:k=>local.get(k)??null,removeItem:k=>local.delete(k)};
 const cloud=new Map();
 await assert.rejects(migrateGuestPortfolios(storage,'user',async p=>{if(p.id==='user_b') throw Error('offline'); if(!cloud.has(p.id)) cloud.set(p.id,p);}));
 assert.equal(local.get('portfolios_guest'),original);
 cloud.get('user_a').name='cloud edit';
 await migrateGuestPortfolios(storage,'user',async p=>{if(!cloud.has(p.id)) cloud.set(p.id,p);});
 assert.equal(cloud.size,2);
 assert.equal(cloud.get('user_a').name,'cloud edit');
 assert.equal(local.has('portfolios_guest'),false);
});
test('Concurrent local edits are retained during migration',async()=>{
 const local=new Map([['portfolios_guest',JSON.stringify([{id:'a'}])]]);
 const storage={getItem:k=>local.get(k)??null,removeItem:k=>local.delete(k)};
 await migrateGuestPortfolios(storage,'user',async()=>{local.set('portfolios_guest','changed');});
 assert.equal(local.get('portfolios_guest'),'changed');
});
