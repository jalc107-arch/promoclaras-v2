import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isDailyCampaign,dailyCampaignMayCollect,requiresConfirmedPayment,registerDailyDrawFailClosedGuards,IS_DAILY_COMMERCIALLY_ENABLED } from '../services/sinuanoAccess.mjs';
import {registerDailyDrawAdminRoutes} from '../services/dailyDrawAdmin.mjs';
const base=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const index=readFileSync(path.join(base,'index.js'),'utf8');
const ddl=readFileSync(path.join(base,'migrations/20261017_staging_daily_draws_admin_guard.sql'),'utf8');
const routes={};
const app={post(p,cb){(routes['POST '+p]??=[]).push(cb)},use(p,cb){(routes['USE '+p]??=[]).push(cb)},get(p,cb){(routes['GET '+p]??=[]).push(cb)}};
let simulateFail=false;
let databaseProvider='loteria_sinuano_noche';
const sb={
 from(_table){return {
   select(){return {
     eq(_key,_val){return {
       async maybeSingle(){return {data:{draw_provider:databaseProvider},error:simulateFail?new Error('db'):null}}
     }}
   }}
 }}
};
registerDailyDrawFailClosedGuards(app,{supabase:sb});
function response(){return {statusCode:200,body:'',status(n){this.statusCode=n;return this},send(s){this.body=s;return this}}}
async function exercise(method,path,req){const r=response();let nextCalled=false;await routes[method+' '+path][0](req,r,()=>{nextCalled=true});return {r,nextCalled}}
const paths=['/campanas/:slug/comprar','/organizers/:organizerId/campanas/:rifaId/venta-credito','/organizers/:organizerId/campanas/:rifaId/visibilidad','/admin/campanas/:rifaId/aprobar','/admin/campanas/:rifaId/resultado'];
const req={params:{slug:'prueba-interna-sinuano-noche-2500-4-cifras',rifaId:'fixture'},body:{}};
for(const route of paths){const method=route.startsWith('/campanas')?'USE':'POST';test(`En ${route} se bloquea Sinuano Noche incluso por URL directa`,async()=>{const {r,nextCalled}=await exercise(method,route,req);assert.equal(r.statusCode,403);assert.equal(nextCalled,false)})}
test('Se rechaza intento del organizador de crear campaña diaria',async()=>{const {r,nextCalled}=await exercise('POST','/organizers/:organizerId/campanas/nueva',{body:{draw_provider:'loteria_sinuano_noche'}});assert.equal(r.statusCode,403);assert.equal(nextCalled,false)});
test('Proveedores ordinarios no reciben bloqueo especial',async()=>{databaseProvider='loteria_boyaca';const {r,nextCalled}=await exercise('USE','/campanas/:slug/comprar',req);assert.equal(r.statusCode,200);assert.equal(nextCalled,true);databaseProvider='loteria_sinuano_noche'});
test('Error de base de datos bloquea compras, no permite continuar',async()=>{simulateFail=true;const {r,nextCalled}=await exercise('USE','/campanas/:slug/comprar',req);assert.equal(r.statusCode,503);assert.equal(nextCalled,false);simulateFail=false});
test('No se puede activar comercialización por defecto',()=>assert.equal(IS_DAILY_COMMERCIALLY_ENABLED,false));
const cmp={draw_provider:'loteria_sinuano_noche',status:'active',is_public:true};
const verified={approval_status:'approved',regulatory_clearance:true,payment_provider_clearance:true,approved_at:'2026-10-16T00:00:00Z',revoked_at:null};
for(const [field,value] of [['approval_status','pending'],['regulatory_clearance',false],['payment_provider_clearance',false],['approved_at',null],['revoked_at','2026-10-17T00:00:00Z']])test(`Falta ${field}: comercialización prohibida`,()=>assert.equal(dailyCampaignMayCollect({campaign:cmp,authorization:{...verified,[field]:value},implemented:true}),false));
test('Aunque las aprobaciones estén completas, la función no está habilitada',()=>assert.equal(dailyCampaignMayCollect({campaign:cmp,authorization:verified}),false));
test('Verificador semántico solo permitiría el caso aprobado en futura versión',()=>assert.equal(dailyCampaignMayCollect({campaign:cmp,authorization:verified,implemented:true}),true));
test('Campaña no pública sigue bloqueada aunque pase otras condiciones',()=>assert.equal(dailyCampaignMayCollect({campaign:{...cmp,is_public:false},authorization:verified,implemented:true}),false));
test('Se conserva precio mínimo 5 para 2500 en index',()=>assert.match(index,/if\s*\(price >= 2000 && price < 3000\) return 5/));
test('Guardas registradas antes de las rutas de compra y organizador',()=>{assert.ok(index.indexOf('registerDailyDrawFailClosedGuards(app')<index.indexOf('app.post("/organizers/:organizerId/campanas/:rifaId/visibilidad"'));assert.ok(index.indexOf('registerDailyDrawFailClosedGuards(app')<index.indexOf('app.get("/campanas/:slug/comprar"'))});
test('CSRF global antes que panel diario',()=>assert.ok(index.indexOf('const CSRF_EXEMPT_PATHS')<index.indexOf('registerDailyDrawAdminRoutes(app')));
test('Migración es sólo aditiva y no habilita pagos',()=>{assert.doesNotMatch(ddl,/\bDROP\s+TABLE\b|\bTRUNCATE\b/);assert.match(ddl,/REVOKE ALL ON FUNCTION public\.admin_daily_draw_decide_atomic/);assert.match(ddl,/regulatory_clearance IS DISTINCT FROM true/);assert.match(ddl,/payment_provider_clearance IS DISTINCT FROM true/)});
test('Reserva no es compra confirmada',()=>assert.equal(requiresConfirmedPayment({ticket:{status:'reserved_installment',order_id:'1',activated_at:'2026-12-01T12:00:00-05:00'},order:{id:'1',payment_status:'partially_paid'},verifiedPayment:{status:'pending',verified_by_provider:false,order_id:'1'},cutoffAt:'2026-12-01T22:00:00-05:00'}),false));
const tkt={status:'active',order_id:'1',activated_at:'2026-12-01T12:30:00-05:00'},ord={id:'1',payment_status:'paid'},pm={order_id:'1',status:'approved',verified_by_provider:true,approved_at:'2026-12-01T12:29:00-05:00'};
test('Pago íntegro verificado antes del cierre habilita código',()=>assert.equal(requiresConfirmedPayment({ticket:tkt,order:ord,verifiedPayment:pm,cutoffAt:'2026-12-01T22:00:00-05:00'}),true));
test('No acepta pago confirmado después de la activación',()=>assert.equal(requiresConfirmedPayment({ticket:tkt,order:ord,verifiedPayment:{...pm,approved_at:'2026-12-01T15:00:00-05:00'},cutoffAt:'2026-12-01T22:00:00-05:00'}),false));
test('No acepta activación posterior al cierre',()=>assert.equal(requiresConfirmedPayment({ticket:tkt,order:ord,verifiedPayment:pm,cutoffAt:'2026-12-01T11:59:00-05:00'}),false));
test('No acepta transacción de una orden distinta',()=>assert.equal(requiresConfirmedPayment({ticket:tkt,order:ord,verifiedPayment:{...pm,order_id:'2'},cutoffAt:'2026-12-01T22:00:00-05:00'}),false));
test('Solo la sesión del administrador puede ver panel privado',async()=>{const ar={};const app2={get(p,...c){ar[p]=c},post(p,...c){ar['POST'+p]=c}};registerDailyDrawAdminRoutes(app2,{supabase:sb,escapeHtml:s=>String(s)});const r=response();await ar['/admin/sorteos-diarios'][0]({session:{}},r,()=>{});assert.equal(r.statusCode,403)});
test('Solo la sesión del administrador puede decidir autorizaciones',async()=>{const ar={};const app2={get(p,...c){ar[p]=c},post(p,...c){ar[p]=c}};registerDailyDrawAdminRoutes(app2,{supabase:sb,escapeHtml:s=>String(s)});const r=response();await ar['/admin/sorteos-diarios/:campaignId/decision'][0]({session:{}},r,()=>{});assert.equal(r.statusCode,403)});
