import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerDailyDrawPreparationRoutes} from '../services/dailyDrawPreparation.mjs';
const paths=new Map();
const app={get(path,...callbacks){paths.set('GET '+path,callbacks)},post(path,...callbacks){paths.set('POST '+path,callbacks)}};
const cid='39377190-4ee3-40da-9671-f36a1305e106';
const days=Array.from({length:31},(_,i)=>({id:'draw-'+i,draw_date:`2026-12-${String(i+1).padStart(2,'0')}`,status:'draft',major_prize:i===30,prize_kind:'undetermined',prize_description:'Premio pendiente'}));
const calls=[];
function response(){return {statusCode:200,body:'',headers:{},status(code){this.statusCode=code;return this},send(b){this.body=b;return this},set(k,v){this.headers[k]=v;return this},redirect(code,path){this.statusCode=code;this.body=path;return this}}}
const data={
 rifas:{id:cid,title:'<script>Campaña</script>',draw_provider:'loteria_sinuano_noche',draw_mode:'loteria_4_pleno',status:'pending',is_public:false,price_per_ticket:2500},
 daily_draw_campaign_authorizations:{approval_status:'pending',regulatory_clearance:false,payment_provider_clearance:false},
 campaign_daily_draws:days,campaign_daily_preflight_notes:[],
 campaign_daily_prize_proposals:[{draw_date:'2026-12-31',option_label:'Alternativa A',prize_kind:'money',description:'Premio propuesto',proposed_amount:12500000,quantity:null}],
 campaign_daily_commerce_controls:{sales_enabled:false}
};
const sb={from(table){return {
 select(){return this},eq(){return this},order(){return this},
 async maybeSingle(){return {data:data[table],error:null}},
 async limit(){return {data:data[table],error:null}}
}},async rpc(name,args){calls.push({name,args});return {data:'fake-uuid',error:null}}};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
registerDailyDrawPreparationRoutes(app,{supabase:sb,escapeHtml:esc});
async function hit(method,path,body={},isAdmin=true){const callbacks=paths.get(method+' '+path);assert.ok(callbacks);const req={params:{campaignId:cid},body,session:isAdmin?{isAdmin:true}:null,sessionID:'session_fake'};const res=response();for(const cb of callbacks){if(res.body)break;await cb(req,res,()=>{})}return res}
const prefix='/admin/sorteos-diarios/:campaignId/preparacion';
test('Acceso de preparación exclusivo del administrador',async()=>{const r=await hit('GET',prefix,{},false);assert.equal(r.statusCode,403)});
test('Panel muestra las 31 jornadas, bloqueos y un premio mayor en borrador',async()=>{
 const r=await hit('GET',prefix);assert.equal(r.statusCode,200);
 assert.match(r.body,/DESHABILITADAS/);assert.match(r.body,/no se cambia el calendario oficial/i);
 assert.equal((r.body.match(/<td>Premio mayor<\/td>/g)||[]).length,1);
 assert.match(r.body,/2026-12-31/);assert.equal(r.headers['Cache-Control'],'no-store');
 assert.ok(!r.body.includes('<script>Campaña</script>'));
});
test('Prohíbe nota administrativa de usuario sin sesión',async()=>{const r=await hit('POST',prefix+'/notas',{requirement_key:'legal_classification',note:'Aclaración documental pendiente'},false);assert.equal(r.statusCode,403)});
test('Una nota interna nunca llama RPC de aprobación',async()=>{
 const n=calls.length;const r=await hit('POST',prefix+'/notas',{requirement_key:'legal_classification',note:'Falta concepto escrito de autoridad',reference:'PQRSD pendiente'});
 assert.equal(r.statusCode,303);assert.equal(calls.length,n+1);
 assert.equal(calls.at(-1).name,'admin_daily_record_preflight_note');
});
test('Evita montos y cantidades de premios incompatibles',async()=>{
 const n=calls.length;
 for(const args of [
 {prize_kind:'money',proposed_amount:'10000',quantity:'2'},
 {prize_kind:'physical',proposed_amount:'10000',quantity:'2'},
 {prize_kind:'money',proposed_amount:'0',quantity:''}
 ]){const r=await hit('POST',prefix+'/premios',{draw_date:'2026-12-31',option_label:'Opción 1',description:'Premio ficticio en estudio',...args});assert.equal(r.statusCode,400);}
 assert.equal(calls.length,n);
});
test('Una propuesta solo utiliza la RPC para borradores',async()=>{
 const r=await hit('POST',prefix+'/premios',{draw_date:'2026-12-31',option_label:'Alternativa nueva',description:'Dos motocicletas sin especificación',prize_kind:'physical',proposed_amount:'',quantity:'2'});
 assert.equal(r.statusCode,303);assert.equal(calls.at(-1).name,'admin_daily_add_prize_proposal');
 assert.equal(calls.at(-1).args.p_proposed_amount,null);
});
test('Migración no toca premios oficiales ni permite venta o aprobación',()=>{
 const sql=readFileSync(new URL('../migrations/20261018_staging_daily_preparation_only.sql',import.meta.url),'utf8');
 assert.match(sql,/public\.campaign_daily_preflight_notes/);
 assert.match(sql,/public\.campaign_daily_prize_proposals/);
 assert.match(sql,/RLS|ROW LEVEL SECURITY/);
 assert.match(sql,/sales_enabled=false/);
 assert.match(sql,/legal_review_required boolean NOT NULL DEFAULT true/);
 assert.doesNotMatch(sql,/\bUPDATE\s+public\.(rifas|payments|orders|campaign_daily_draws|daily_draw_campaign_authorizations)\b/i);
 assert.doesNotMatch(sql,/\bDROP\s+TABLE\b|\bTRUNCATE\b/);
});
