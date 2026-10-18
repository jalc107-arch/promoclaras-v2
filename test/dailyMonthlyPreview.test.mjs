import test from 'node:test';
import assert from 'node:assert/strict';
import {registerDailyMonthlyPreviewRoutes} from '../services/dailyMonthlyPreview.mjs';
const routes={};const app={get(p,...h){routes[p]=h}};
const db={calls:0,from(){this.calls++;return this},select(){return this},eq(){return this},
 async maybeSingle(){return {data:{id:'39377190-4ee3-40da-9671-f36a1305e106',title:'Sinuano de prueba',draw_provider:'loteria_sinuano_noche',draw_mode:'loteria_4_pleno',status:'pending',is_public:false},error:null}}};
registerDailyMonthlyPreviewRoutes(app,{supabase:db,escapeHtml:String});
const route='/admin/sorteos-diarios/:campaignId/preparacion/mes';
const response=()=>({code:200,text:'',headers:{},status(n){this.code=n;return this},send(t){this.text=t;return this},set(k,v){this.headers[k]=v;return this}});
async function hit({year='2028',month='2',admin=true}={}){
 const req={session:admin?{isAdmin:true}:null,params:{campaignId:'39377190-4ee3-40da-9671-f36a1305e106'},query:{year,month}};
 const res=response();let allowed=false;await routes[route][0](req,res,()=>{allowed=true});if(allowed)await routes[route][1](req,res);return res;
}
test('Vista mensual no accesible sin ser administrador ni consulta BD',async()=>{
 const old=db.calls;const r=await hit({admin:false});assert.equal(r.code,403);assert.equal(db.calls,old);
});
test('Febrero bisiesto muestra 29 días, solo día 29 mayor y sin publicar',async()=>{
 const r=await hit();assert.equal(r.code,200);
 assert.equal((r.text.match(/<b>Premio mayor único<\/b>/g)||[]).length,1);
 assert.match(r.text,/2028-02-29/);assert.match(r.text,/29 jornadas/);
 assert.match(r.text,/no se guarda ni se modifica/);
 assert.equal(r.headers['Cache-Control'],'no-store');
});
test('Febrero común y abril respetan 28/30 días',async()=>{
 for(const [year,month,last,n] of [['2027','2','2027-02-28',28],['2027','4','2027-04-30',30]]){
  const r=await hit({year,month});assert.equal(r.code,200);
  assert.match(r.text,new RegExp(last));assert.match(r.text,new RegExp(n+' jornadas'));
 }
});
test('Rechaza meses y años inválidos sin tocar la BD',async()=>{
 const before=db.calls;
 for(const [year,month] of [['2027','13'],['2027','0'],['1900','2'],['abc','3']]){
  assert.equal((await hit({year,month})).code,400);
 }
 assert.equal(db.calls,before);
});
