import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{registerDailyMonthlyDraftRoutes}from'../services/dailyMonthlyDraft.mjs';
const handlers={};const app={post(p,...c){handlers[p]=c}};
const calls=[];
const db={async rpc(name,args){calls.push({name,args});return {data:[{day_count:29,revision_number:1}],error:null}}};
registerDailyMonthlyDraftRoutes(app,{supabase:db});
const uri='/admin/sorteos-diarios/:campaignId/preparacion/mes/borrador';
const base={year:'2028',month:'2',major_kind:'',description:'',amount:'',quantity:''};
function mock(){return{code:200,path:'',status(n){this.code=n;return this},send(s){this.path=s;return this},redirect(n,s){this.code=n;this.path=s;return this}}}
async function request(payload,authorized=true){
 const req={params:{campaignId:'39377190-4ee3-40da-9671-f36a1305e106'},body:{...base,...payload},session:authorized?{isAdmin:true}:null,sessionID:'synthetic'};
 const res=mock();let allowed=false;await handlers[uri][0](req,res,()=>{allowed=true});
 if(allowed)await handlers[uri][1](req,res);return res;
}
test('Ninguna operación administrativa a usuario anónimo',async()=>{
 const before=calls.length;const r=await request({},false);assert.equal(r.code,403);assert.equal(calls.length,before);
});
test('Sin elección de premio mayor se permite borrador pendiente',async()=>{
 const r=await request({});assert.equal(r.code,303);assert.equal(calls.at(-1).args.p_kind,null);
});
test('Dinero O especie, solo un tipo por borrador',async()=>{
 const r=await request({major_kind:'physical',description:'Motocicleta nueva de prueba',quantity:'1'});
 assert.equal(r.code,303);assert.equal(calls.at(-1).args.p_kind,'physical');
 assert.equal(calls.at(-1).args.p_amount,null);
 const n=calls.length;
 const bad=await request({major_kind:'money',description:'Dinero o motocicletas',amount:'12500000',quantity:'2'});
 assert.equal(bad.code,400);assert.equal(calls.length,n);
});
test('Rechaza tipo diferente y mes sin rango',async()=>{
 const before=calls.length;
 for(const x of [{major_kind:'money',amount:'0'},{year:'2025'},{month:'13'},{major_kind:'both'},{major_kind:'physical',quantity:'0'}])assert.equal((await request(x)).code,400);
 assert.equal(calls.length,before);
});
test('Seguridad SQL: historia inmutable, exclusiva y sin habilitar ventas',()=>{
 const ddl=readFileSync(new URL('../migrations/20261018_staging_daily_monthly_plan_drafts.sql',import.meta.url),'utf8');
 assert.match(ddl,/major_prize_kind IN \('money','physical'\)/);
 assert.match(ddl,/p_kind='money'.*p_amount>0 AND p_quantity IS NULL/);
 assert.match(ddl,/p_kind='physical'.*p_amount IS NULL AND p_quantity>0/);
 assert.match(ddl,/BEFORE UPDATE OR DELETE/);
 assert.match(ddl,/sales_enabled=false/);
 assert.doesNotMatch(ddl,/UPDATE public\.(payments|orders|rifas|campaign_daily_draws)/);
});
