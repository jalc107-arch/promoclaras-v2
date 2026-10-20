import {buildMonthlyDraftSchedule} from './dailyDrawSimulation.mjs';
import {DAILY_PROVIDER,IS_DAILY_COMMERCIALLY_ENABLED} from './sinuanoAccess.mjs';

export function registerDailyMonthlyPreviewRoutes(app,{supabase,escapeHtml}){
 const esc=v=>escapeHtml(String(v??''));
 const admin=(req,res,next)=>req.session?.isAdmin===true?next():res.status(403).send('Administrador requerido');
 const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 app.get('/admin/sorteos-diarios/:campaignId/preparacion/mes',admin,async(req,res)=>{
  const id=String(req.params?.campaignId||'');
  const yearText=String(req.query?.year??'');
  const monthText=String(req.query?.month??'');
  if(!UUID.test(id)||!/^\d{4}$/.test(yearText)||!/^(?:[1-9]|1[0-2])$/.test(monthText))
   return res.status(400).send('Año, mes o identificador inválidos');
  const year=Number(yearText),month=Number(monthText);
  let rows;
  try{rows=buildMonthlyDraftSchedule(year,month);}
  catch{return res.status(400).send('Año o mes fuera de rango');}
  try{
   const c=await supabase.from('rifas')
     .select('id,title,status,is_public,draw_provider,draw_mode')
     .eq('id',id).maybeSingle();
   if(c.error)throw c.error;
   if(c.data?.draw_provider!==DAILY_PROVIDER||c.data?.draw_mode!=='loteria_4_pleno')
     return res.status(404).send('Campaña excepcional no encontrada');
   const plan=await supabase.from('campaign_daily_monthly_plan_drafts')
      .select('revision,calendar_days,last_draw_date,major_prize_kind,major_prize_description,major_prize_amount,major_prize_quantity')
      .eq('campaign_id',id).eq('year_number',year).eq('month_number',month)
      .order('revision',{ascending:false}).limit(1);
   if(plan.error)throw plan.error;
   const latest=(plan.data||[])[0];
   const possible=IS_DAILY_COMMERCIALLY_ENABLED===false&&c.data.status==='pending'&&c.data.is_public===false;
   const major=latest?.major_prize_kind==='money'?'DINERO ($'+esc(latest.major_prize_amount)+')':
      latest?.major_prize_kind==='physical'?'ESPECIE ('+esc(latest.major_prize_quantity)+' unidades)':'PENDIENTE DE ELEGIR';
   const summary=latest?'<p>Último borrador de este mes: revisión '+esc(latest.revision)+' · premio mayor '+major
     +' · '+esc(latest.major_prize_description||'Sin definir')+'. No aprobado.</p>':
     '<p>No existe ningún borrador guardado para este mes.</p>';
   const htmlRows=rows.map(x=>'<tr><td>'+esc(x.draw_date)+'</td><td>'
      +(x.major_prize?'<b>Premio mayor único</b>':'Premio diario')
      +'</td><td>'+(x.major_prize?major:'Por definir')+'</td><td>Sin permisos</td></tr>').join('');
   const form=possible?
      '<form method="post" action="/admin/sorteos-diarios/'+encodeURIComponent(id)+'/preparacion/mes/borrador">'
      +'<h2>Guardar versión interna del mes (sin autorización)</h2>'
      +'<input type="hidden" name="year" value="'+esc(year)+'"><input type="hidden" name="month" value="'+esc(month)+'">'
      +'<label>Una sola opción para el premio mayor<select name="major_kind">'
      +'<option value="">Pendiente de decidir</option><option value="money">En dinero</option><option value="physical">En especie</option></select></label>'
      +'<label>Descripción del premio mayor<input name="description" maxlength="800" placeholder="Si se elige dinero o especie"></label>'
      +'<label>Monto COP (solo si es dinero)<input name="amount" inputmode="decimal"></label>'
      +'<label>Cantidad (solo si es especie)<input name="quantity" type="number" min="1"></label>'
      +'<button>Guardar únicamente como borrador</button></form>':
      '<p class="warn">La campaña no está en condición de guardar borradores. Solo lectura.</p>';
   res.set('Cache-Control','no-store');
   return res.send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calendario mensual de pruebas · CampaClick</title><style>body{font:15px system-ui;background:#eff4fc;color:#142842;padding:16px}main{max-width:950px;margin:auto;background:white;padding:20px;border-radius:13px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #dbe5f1}.warn{background:#fff2d0;padding:14px;border-radius:8px}input,select{display:block;width:100%;box-sizing:border-box;padding:9px;margin:6px 0 14px}form{background:#f6f8fc;padding:16px;border-radius:10px}button{padding:10px;background:#184a90;color:white;border:0;border-radius:7px}</style></head><body><main><a href="/admin/sorteos-diarios/'+encodeURIComponent(id)+'/preparacion">← Volver</a><h1>Calendario mensual hipotético: '+esc(c.data.title)+'</h1><p>Mes '+esc(month)+' de '+esc(year)+' · <b>'+rows.length+' jornadas</b>, una por día, único premio mayor el '+esc(rows.at(-1).draw_date)+'</p><p class="warn">Vista previa privada: el calendario operativo existente NO cambia. El premio mayor será únicamente dinero O especie, nunca ambos. Faltan permisos y definición legal.</p>'+summary+(latest?'<p><a href="/admin/sorteos-diarios/'+encodeURIComponent(id)+'/preparacion/mes/premios?year='+esc(year)+'&month='+esc(month)+'">Configurar premios de cada día y ver presupuesto (solo borradores)</a></p>':'')+form+'<table><thead><tr><th>Fecha</th><th>Modalidad</th><th>Premio</th><th>Estado</th></tr></thead><tbody>'+htmlRows+'</tbody></table></main></body></html>');
  }catch(err){console.error('Vista mensual privada no disponible:',err.message);return res.status(503).send('No disponible');}
 });
}
