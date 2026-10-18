import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerDailyDrawCalendarRoutes} from '../services/dailyDrawCalendar.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const base=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const handlers={};
const app={get(route,...mw){handlers[`GET ${route}`]=mw},post(route,...mw){handlers[`POST ${route}`]=mw}};
let provider='loteria_sinuano_noche', error=false;
const campaign={id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',title:'<script>alert(1)</script> Campaña de prueba',draw_provider:provider,status:'pending',is_public:false,price_per_ticket:2500};
const days=Array.from({length:31},(_,i)=>({draw_date:`2026-12-${String(i+1).padStart(2,'0')}`,major_prize:i===30,status:'draft',prize_description:'Premio pendiente',prize_kind:'undetermined',cutoff_at:null,scheduled_at:null,outcome:null}));
const supabase={from(t){return {select(){return {eq(){return {async maybeSingle(){if(t==='rifas')return {data:{...campaign,draw_provider:provider},error:error?new Error('DB'):null};return {data:{approval_status:'pending',regulatory_clearance:false,payment_provider_clearance:false},error:null}},order(){return {async limit(){return {data:days,error:error?new Error('DB'):null}}}}}}}}}}};
registerDailyDrawCalendarRoutes(app,{supabase,escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
const route='GET /admin/sorteos-diarios/:campaignId/calendario';
function response(){return {statusCode:200,html:null,headers:{},status(n){this.statusCode=n;return this},send(s){this.html=s;return this},set(k,v){this.headers[k]=v;return this}}}
async function hit(method,auth,body={}) {const m=handlers[method];const res=response();let nextCalls=0;const req={session:auth?{isAdmin:true}:undefined,params:{campaignId:campaign.id},body};for(const cb of m){if(res.html!=null)break;const callbackPromise=cb(req,res,()=>{nextCalls++});await callbackPromise;}return res;}
test('Usuario sin sesión administrativa no ve calendario',async()=>assert.equal((await hit(route,false)).statusCode,403));
test('Administrador ve las 31 jornadas, solo un premio mayor y el bloqueo comercial',async()=>{
 const r=await hit(route,true);assert.equal(r.statusCode,200);assert.match(r.html,/31 jornadas íntegro/);
 assert.match(r.html,/Campaña privada o no autorizada: no admite ventas/);
 assert.equal((r.html.match(/Premio mayor/g)||[]).length,1);
 assert.ok(r.html.includes('2026-12-31'));assert.equal(r.headers['Cache-Control'],'no-store');
});
test('Salida HTML escapa valores de la base de datos',async()=>{const r=await hit(route,true);assert.ok(r.html.includes('&lt;script&gt;'));assert.ok(!r.html.includes('<script>'));});
test('La ruta no existe para campañas ordinarias',async()=>{provider='loteria_boyaca';const r=await hit(route,true);assert.equal(r.statusCode,404);provider='loteria_sinuano_noche';});
test('Ante una falla de Supabase el calendario no publica datos parciales',async()=>{error=true;const r=await hit(route,true);assert.equal(r.statusCode,503);error=false;});
test('Ni siquiera administrador puede publicar un resultado mientras el motor comercial está bloqueado',async()=>{const r=await hit('POST /admin/sorteos-diarios/:campaignId/resultado',true,{draw_id:campaign.id,result_value:'0000',official_reference:'https://ejemplo.com/resultados/2026-12-31'});assert.equal(r.statusCode,403);});
test('Sin sesión no puede intentar publicar resultados',async()=>{const r=await hit('POST /admin/sorteos-diarios/:campaignId/resultado',false);assert.equal(r.statusCode,403);});
test('La migration de resultados es aditiva y no modifica Wompi ni el estado global de las campañas',()=>{
 const sql=readFileSync(path.join(base,'migrations/20261017_staging_daily_result_atomic.sql'),'utf8');
 assert.match(sql,/status='completed'/);assert.match(sql,/p.updated_at<=a.activated_at/);
 assert.match(sql,/p_result !~ '\^\[0-9\]\{4\}\$'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.admin_daily_draw_record_result_atomic/);
 assert.match(sql,/status='approved'/);assert.match(sql,/winner_ticket_id=v_winner/);
 assert.doesNotMatch(sql,/\bDROP\s+TABLE\b|\bTRUNCATE\b/);
 assert.doesNotMatch(sql,/UPDATE public\.rifas SET/i);
});
