import crypto from 'node:crypto';
import {buildMonthlyDraftSchedule} from './dailyDrawSimulation.mjs';
import {DAILY_PROVIDER,IS_DAILY_COMMERCIALLY_ENABLED} from './sinuanoAccess.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MONTH=/^(?:[1-9]|1[0-2])$/;
const MONEY=/^[1-9]\d{0,11}$/;
const actor=req=>crypto.createHash('sha256').update(String(req.sessionID||'')).digest('hex');
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const parsePeriod=(year,month)=>{
 if(!/^\d{4}$/.test(year)||!MONTH.test(month))return null;
 try{return buildMonthlyDraftSchedule(Number(year),Number(month));}catch{return null;}
};
const formatCOP=n=>Number(n).toLocaleString('es-CO',{maximumFractionDigits:0});
export function registerDailyDayPrizeAdminRoutes(app,{supabase,escapeHtml}){
 const esc=value=>escapeHtml(String(value??''));
 const auth=(req,res,next)=>req.session?.isAdmin===true?next():res.status(403).send('Solo administrador');
 const base=req=>'/admin/sorteos-diarios/'+encodeURIComponent(req.params.campaignId)+'/preparacion/mes/premios';
 const validId=req=>UUID.test(String(req.params?.campaignId||''));
 app.get('/admin/sorteos-diarios/:campaignId/preparacion/mes/premios',auth,async(req,res)=>{
  const yr=String(req.query?.year??''),mo=String(req.query?.month??''),days=parsePeriod(yr,mo);
  if(!validId(req)||!days)return res.status(400).send('Campaña o mes inválido');
  const first=days[0].draw_date,last=days.at(-1).draw_date,penultimate=days.at(-2).draw_date;
  try{
   const [campaign,plan,authorizations,gate,docs]=await Promise.all([
    supabase.from('rifas').select('title,draw_provider,draw_mode,status,is_public').eq('id',req.params.campaignId).maybeSingle(),
    supabase.from('campaign_daily_monthly_plan_drafts').select('id,revision,major_prize_kind,major_prize_amount,major_prize_quantity,major_prize_description').eq('campaign_id',req.params.campaignId).eq('year_number',Number(yr)).eq('month_number',Number(mo)).order('revision',{ascending:false}).limit(1),
    supabase.from('daily_draw_campaign_authorizations').select('approval_status,regulatory_clearance,payment_provider_clearance').eq('campaign_id',req.params.campaignId).maybeSingle(),
    supabase.from('campaign_daily_commerce_controls').select('sales_enabled').eq('singleton',true).maybeSingle(),
    supabase.from('campaign_daily_documentary_controls').select('regulatory_review_unlocked,processor_review_unlocked').eq('campaign_id',req.params.campaignId).maybeSingle()
   ]);
   for(const x of [campaign,plan,authorizations,gate,docs])if(x.error)throw x.error;
   if(campaign.data?.draw_provider!==DAILY_PROVIDER||campaign.data.draw_mode!=='loteria_4_pleno')
     return res.status(404).send('Modalidad excepcional no encontrada');
   const current=plan.data?.[0];
   if(!current)return res.status(409).send('Primero guarde un borrador del mes en la pantalla anterior');
   const prizes=await supabase.from('campaign_daily_day_prize_drafts')
     .select('draw_date,revision,prize_kind,description,cash_amount,item_quantity,estimated_unit_cost')
     .eq('campaign_id',req.params.campaignId).gte('draw_date',first).lt('draw_date',last)
     .order('draw_date',{ascending:true}).order('revision',{ascending:false}).limit(1000);
   if(prizes.error)throw prizes.error;
   const latest=new Map();
   for(const x of prizes.data||[])if(!latest.has(x.draw_date))latest.set(x.draw_date,x);
   let cash=0,goodsEstimate=0,unpricedGoods=0;
   const table=days.map(d=>{
     const major=d.major_prize,prize=latest.get(d.draw_date);
     if(prize?.prize_kind==='money')cash+=Number(prize.cash_amount);
     if(prize?.prize_kind==='physical'){
       if(prize.estimated_unit_cost===null)unpricedGoods++;
       else goodsEstimate+=Number(prize.item_quantity)*Number(prize.estimated_unit_cost);
     }
     const desc=major?'Premio mayor (definido aparte)':prize?
       (prize.prize_kind==='money'?'Dinero $'+formatCOP(prize.cash_amount):
        'Especie '+esc(prize.item_quantity)+' uds.')+' — '+esc(prize.description):
       'Pendiente';
     return '<tr><td>'+esc(d.draw_date)+'</td><td>'+(major?'Mayor único':'Diario')+'</td><td>'+desc+'</td><td>'+(major?'—':prize?'Borrador rev. '+esc(prize.revision):'Pendiente')+'</td></tr>';
   }).join('');
   if(current.major_prize_kind==='money')cash+=Number(current.major_prize_amount);
   if(current.major_prize_kind==='physical')unpricedGoods++;
   const canEdit=IS_DAILY_COMMERCIALLY_ENABLED===false&&campaign.data.status==='pending'
     &&campaign.data.is_public===false&&authorizations.data?.approval_status==='pending'
     &&authorizations.data?.regulatory_clearance===false
     &&authorizations.data?.payment_provider_clearance===false&&gate.data?.sales_enabled===false
     &&docs.data?.regulatory_review_unlocked===false
     &&docs.data?.processor_review_unlocked===false;
   const form=canEdit?
    '<form method="post" action="'+base(req)+'"><h2>Configurar uno o varios premios diarios</h2>'
    +'<input type="hidden" name="year" value="'+esc(yr)+'"><input type="hidden" name="month" value="'+esc(mo)+'">'
    +'<input type="hidden" name="monthly_plan_id" value="'+esc(current.id)+'">'
    +'<input type="hidden" name="request_id" value="'+crypto.randomUUID()+'">'
    +'<label>Desde<input type="date" name="start" min="'+esc(first)+'" max="'+esc(penultimate)+'" value="'+esc(first)+'" required></label>'
    +'<label>Hasta (inclusive)<input type="date" name="end" min="'+esc(first)+'" max="'+esc(penultimate)+'" value="'+esc(first)+'" required></label>'
    +'<label>Tipo de premio<select name="kind"><option value="money">Dinero</option><option value="physical">Bien / especie</option></select></label>'
    +'<label>Descripción<textarea name="description" minlength="12" maxlength="800" required></textarea></label>'
    +'<label>Monto COP (solo dinero)<input name="amount" inputmode="numeric"></label>'
    +'<label>Cantidad (solo especie)<input name="quantity" inputmode="numeric"></label>'
    +'<label>Costo estimado por unidad COP (opcional, solo especie)<input name="unit_cost" inputmode="numeric"></label>'
    +'<button>Guardar borradores de las fechas elegidas</button>'
    +'<p>Para modificar un premio, guarde una nueva revisión de esa fecha. La anterior queda en auditoría.</p></form>'
    :'<p>Edición bloqueada porque la campaña no está en estado de preparación segura.</p>';
   res.set('Cache-Control','no-store');
   return res.send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Premios diarios internos</title><style>body{font:15px system-ui;background:#eef3fb;color:#1b3049;padding:14px}main{max-width:1050px;margin:auto;background:white;border-radius:12px;padding:20px}form{background:#f3f6fc;padding:16px;border-radius:12px}input,select,textarea{display:block;width:100%;box-sizing:border-box;padding:8px;margin:7px 0 14px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #dae1eb;padding:9px;text-align:left}.warning{background:#fff0d3;padding:13px;border-radius:8px}button{background:#214c97;color:white;border:0;padding:12px;border-radius:8px}</style></head><body><main>'
    +'<a href="/admin/sorteos-diarios/'+encodeURIComponent(req.params.campaignId)+'/preparacion/mes?year='+esc(yr)+'&month='+esc(mo)+'">← Volver al mes</a>'
    +'<h1>Propuestas de premios diarios — '+esc(campaign.data.title)+'</h1><p>'+esc(yr)+'-'+esc(mo)+' · '+days.length+' jornadas · último día '+esc(last)+' reservado únicamente al premio mayor.</p>'
    +'<p class="warning">EXCLUSIVAMENTE BORRADORES. No hay permiso para ventas, sorteos ni premios reales. El presupuesto es estimado y no acredita viabilidad jurídica.</p>'
    +'<p>Dinero propuesto: <b>$'+formatCOP(cash)+'</b> COP (incluye premio mayor monetario si se definió). Especies con costo estimado: <b>$'+formatCOP(goodsEstimate)+'</b> COP. Especies sin costo confirmado: <b>'+unpricedGoods+'</b>. No sumar costos desconocidos.</p>'
    +form+'<h2>Calendario del mes</h2><table><tr><th>Fecha</th><th>Jornada</th><th>Premio propuesto</th><th>Estado</th></tr>'+table+'</table></main></body></html>');
  }catch(error){console.error('Premios diarios de prueba no disponibles:',error.message);return res.status(503).send('No disponible');}
 });
 app.post('/admin/sorteos-diarios/:campaignId/preparacion/mes/premios',auth,async(req,res)=>{
  const yr=String(req.body?.year??''),mo=String(req.body?.month??''),days=parsePeriod(yr,mo);
  if(!validId(req)||!days)return res.status(400).send('Campaña o mes inválido');
  const start=String(req.body?.start??''),end=String(req.body?.end??'');
  const plan=String(req.body?.monthly_plan_id??''),nonce=String(req.body?.request_id??'');
  const kind=String(req.body?.kind??''),description=String(req.body?.description??'').trim();
  const rawAmount=String(req.body?.amount??'').trim(),rawQty=String(req.body?.quantity??'').trim(),rawCost=String(req.body?.unit_cost??'').trim();
  const amount=MONEY.test(rawAmount)?Number(rawAmount):null;
  const quantity=/^[1-9]\d{0,5}$/.test(rawQty)?Number(rawQty):null;
  const cost=/^\d{1,12}$/.test(rawCost)?Number(rawCost):null;
  if(!UUID.test(plan)||!UUID.test(nonce)||!validDate(start)||!validDate(end)
    ||start<days[0].draw_date||end>=days.at(-1).draw_date||start>end
    ||description.length<12||description.length>800||
    !((kind==='money'&&amount>0&&!rawQty&&!rawCost)
      ||(kind==='physical'&&quantity>0&&!rawAmount&&(rawCost===''||cost!==null)))){
    return res.status(400).send('Premio o fechas inválidos. Nunca incluir el último día reservado al premio mayor.');
  }
  try{
   const result=await supabase.rpc('admin_daily_save_day_prize_drafts',{
     p_campaign_id:req.params.campaignId,p_monthly_plan_id:plan,
     p_start:start,p_end:end,p_kind:kind,p_description:description,
     p_cash_amount:kind==='money'?amount:null,p_quantity:kind==='physical'?quantity:null,
     p_estimated_unit_cost:kind==='physical'?cost:null,p_request_id:nonce,
     p_actor_fingerprint:actor(req)
   });
   if(result.error){console.error('Premio diario rechazado:',result.error.message);return res.status(409).send('No se guardó el borrador: revise campaña, mes y autorizaciones');}
   return res.redirect(303,base(req)+'?year='+encodeURIComponent(yr)+'&month='+encodeURIComponent(mo));
  }catch(error){console.error('Error guardando premios:',error.message);return res.status(503).send('No disponible');}
 });
}
