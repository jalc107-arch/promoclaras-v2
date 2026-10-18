import {buildMonthlyDraftSchedule} from './dailyDrawSimulation.mjs';
import {DAILY_PROVIDER} from './sinuanoAccess.mjs';

export function registerDailyMonthlyPreviewRoutes(app,{supabase,escapeHtml}){
 const esc=x=>escapeHtml(String(x??''));
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
   const x=await supabase.from('rifas')
     .select('id,title,status,is_public,draw_provider,draw_mode')
     .eq('id',id).maybeSingle();
   if(x.error)throw x.error;
   if(x.data?.draw_provider!==DAILY_PROVIDER||x.data?.draw_mode!=='loteria_4_pleno')
     return res.status(404).send('Campaña excepcional no encontrada');
   // READ ONLY: does not INSERT a new campaign, ALTER original calendar, or
   // select a prize. Regulator and Wompi authorization still missing.
   const htmlRows=rows.map(x=>'<tr><td>'+esc(x.draw_date)+'</td><td>'
      +(x.major_prize?'<b>Premio mayor único</b>':'Premio diario')
      +'</td><td>Por definir</td><td>Sin permisos</td></tr>').join('');
   res.set('Cache-Control','no-store');
   return res.send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calendario mensual de pruebas · CampaClick</title><style>body{font:15px system-ui;background:#eff4fc;color:#142842;padding:16px}main{max-width:950px;margin:auto;background:white;padding:20px;border-radius:13px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #dbe5f1}.warn{background:#fff2d0;padding:14px;border-radius:8px}</style></head><body><main><a href="/admin/sorteos-diarios/'+encodeURIComponent(id)+'/preparacion">← Volver</a><h1>Calendario mensual hipotético: '+esc(x.data.title)+'</h1><p>Mes '+esc(month)+' de '+esc(year)+' · <b>'+rows.length+' jornadas</b>, una por día, único premio mayor el '+esc(rows.at(-1).draw_date)+'</p><p class="warn">Vista previa privada, no se guarda ni se modifica la campaña existente. El premio mayor será únicamente dinero O especie, no ambos. Falta definición jurídica, de premios y autorización de pagos.</p><table><thead><tr><th>Fecha</th><th>Modalidad</th><th>Premio</th><th>Estado</th></tr></thead><tbody>'+htmlRows+'</tbody></table></main></body></html>');
  }catch(err){console.error('Vista mensual privada no disponible:',err.message);return res.status(503).send('No disponible');}
 });
}
