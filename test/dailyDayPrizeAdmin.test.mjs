import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerDailyDayPrizeAdminRoutes} from '../services/dailyDayPrizeAdmin.mjs';
const handlers={};
const app={get(p,...h){handlers['GET '+p]=h},post(p,...h){handlers['POST '+p]=h}};
const calls=[];
const supabase={rpc:async(name,args)=>{calls.push({name,args});return {data:[{saved_days:1,replayed:false}],error:null}}};
registerDailyDayPrizeAdminRoutes(app,{supabase,escapeHtml:String});
const uri='/admin/sorteos-diarios/:campaignId/preparacion/mes/premios';
const base={year:'2027',month:'1',monthly_plan_id:'11111111-1111-4111-8111-111111111111',request_id:'22222222-2222-4222-8222-222222222222',start:'2027-01-01',end:'2027-01-01',kind:'money',description:'Premio ficticio por jornada',amount:'20000',quantity:'',unit_cost:''};
function response(){return{code:200,value:'',status(n){this.code=n;return this},send(x){this.value=x;return this},redirect(n,x){this.code=n;this.value=x;return this}}}
async function post(body={},admin=true){
 const req={session:admin?{isAdmin:true}:null,sessionID:'fixture',params:{campaignId:'39377190-4ee3-40da-9671-f36a1305e106'},body:{...base,...body}};
 const res=response();let next=false;await handlers['POST '+uri][0](req,res,()=>{next=true});
 if(next)await handlers['POST '+uri][1](req,res);return res;
}
test('Anonymous visitor cannot save prizes or access daily editor',async()=>{
 const n=calls.length;assert.equal((await post({},false)).code,403);assert.equal(calls.length,n);
});
test('Valid money proposal goes to ONE service-role RPC and redirects',async()=>{
 const r=await post();assert.equal(r.code,303);
 assert.equal(calls.at(-1).name,'admin_daily_save_day_prize_drafts');
 assert.equal(calls.at(-1).args.p_cash_amount,20000);
 assert.equal(calls.at(-1).args.p_quantity,null);
});
test('Physical prize may include an optional estimate, not cash prize',async()=>{
 const r=await post({kind:'physical',description:'Dos regalos físicos propuestos',amount:'',quantity:'2',unit_cost:'300000'});
 assert.equal(r.code,303);
 assert.equal(calls.at(-1).args.p_cash_amount,null);
 assert.equal(calls.at(-1).args.p_estimated_unit_cost,300000);
});
test('The last day is ALWAYS major and cannot receive a daily prize',async()=>{
 const before=calls.length;
 for(const bad of [{start:'2027-01-31',end:'2027-01-31'},{end:'2027-01-31'},{start:'2027-01-15',end:'2027-01-05'},{month:'13'}]){
   assert.equal((await post(bad)).code,400);
 }
 assert.equal(calls.length,before);
});
test('Mixing cash with physical, invalid or missing data is rejected',async()=>{
 const before=calls.length;
 for(const bad of [{kind:'physical',amount:'5000',quantity:'1'},
  {kind:'money',amount:'0'},{kind:'physical',amount:'',quantity:'0'},
  {kind:'money',description:'short'},{kind:'money',unit_cost:'100'}]){
  assert.equal((await post(bad)).code,400);
 }
 assert.equal(calls.length,before);
});
test('Only private immutable staging draft SQL, no Wompi or official result changes',()=>{
 const sql=readFileSync(new URL('../migrations/20261020_staging_daily_day_prize_drafts.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public.campaign_daily_day_prize_drafts/);
 assert.match(sql,/BEFORE UPDATE OR DELETE/);
 assert.match(sql,/g.sales_enabled=false/);
 assert.match(sql,/d.regulatory_review_unlocked=false/);
 assert.match(sql,/TO service_role/);
 assert.doesNotMatch(sql,/UPDATE public\.(rifas|campaign_daily_draws|orders|payments|tickets)/i);
});
