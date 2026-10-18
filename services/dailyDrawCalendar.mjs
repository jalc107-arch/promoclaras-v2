import { validateDecemberSchedule } from './dailyDrawSimulation.mjs';
import { DAILY_PROVIDER, IS_DAILY_COMMERCIALLY_ENABLED } from './sinuanoAccess.mjs';

/**
 * Admin-only, read-only calendar. Never changes campaign or draw state.
 * Authentication and CSRF middleware of index.js remain in effect.
 */
export function registerDailyDrawCalendarRoutes(app,{supabase,escapeHtml}) {
  const escape=value=>escapeHtml(String(value??''));
  const ensureAdmin=(req,res,next)=>req.session?.isAdmin===true?next():res.status(403).send('Administrador requerido');
  // This handler is intentionally dormant until legal and processor approvals,
  // activation from verified Wompi, and staging E2E have all been signed off.
  app.post('/admin/sorteos-diarios/:campaignId/resultado',ensureAdmin,async(req,res)=>{
    if (IS_DAILY_COMMERCIALLY_ENABLED !== true) {
      return res.status(403).send('No está habilitada la publicación de resultados diarios.');
    }
    const drawId=String(req.body?.draw_id||'');
    const result=String(req.body?.result_value||'');
    const reference=String(req.body?.official_reference||'').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(drawId)
      || !/^\d{4}$/.test(result)||reference.length<12||reference.length>500) {
      return res.status(400).send('Datos de resultado inválidos');
    }
    // Double-check campaign ownership of draw; database RPC repeats this check.
    const q=await supabase.from('campaign_daily_draws').select('id,campaign_id').eq('id',drawId).maybeSingle();
    if(q.error)return res.status(503).send('No se pudo validar el sorteo');
    if(String(q.data?.campaign_id)!==String(req.params.campaignId))return res.status(404).send('Sorteo no encontrado');
    // Reserved for future authorized release. Never reached while safety flag is false.
    return res.status(403).send('Pendiente de integración de verificación oficial.');
  });
  app.get('/admin/sorteos-diarios/:campaignId/calendario',ensureAdmin,async(req,res)=>{
    try{
      const id=String(req.params.campaignId||'');
      if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id))return res.status(400).send('Identificador inválido');
      const c=await supabase.from('rifas').select('id,title,draw_provider,status,is_public,price_per_ticket').eq('id',id).maybeSingle();
      if(c.error)throw c.error;
      if(c.data?.draw_provider!==DAILY_PROVIDER)return res.status(404).send('Campaña excepcional no encontrada');
      const a=await supabase.from('daily_draw_campaign_authorizations').select('approval_status,regulatory_clearance,payment_provider_clearance').eq('campaign_id',id).maybeSingle();
      if(a.error)throw a.error;
      const d=await supabase.from('campaign_daily_draws').select('draw_date,status,major_prize,prize_kind,prize_description,cutoff_at,scheduled_at,outcome,official_result').eq('campaign_id',id).order('draw_date',{ascending:true}).limit(50);
      if(d.error)throw d.error;
      let consistency='El calendario está incompleto.';
      try {validateDecemberSchedule(d.data||[],2026);consistency='Calendario de 31 jornadas íntegro.';}
      catch {consistency='ATENCIÓN: verificar estructura y fechas del calendario antes de operar.';}
      const locked=c.data.status!=='active'||c.data.is_public!==true||(a.data?.approval_status!=='approved')||a.data?.regulatory_clearance!==true||a.data?.payment_provider_clearance!==true;
      const rows=(d.data||[]).map(item=>`<tr><td>${escape(item.draw_date)}</td><td>${item.major_prize?'Premio mayor':'Premio diario'}</td><td>${escape(item.prize_description)}</td><td>${escape(item.status)}</td><td>${escape(item.cutoff_at||'Pendiente')}</td><td>${escape(item.outcome||'—')}</td></tr>`).join('');
      res.set('Cache-Control','no-store');
      return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calendario de pruebas · CampaClick</title><style>body{font:15px Arial;color:#17233c;background:#f1f5f9;padding:22px}main{max-width:1130px;margin:auto;background:#fff;border-radius:16px;padding:24px}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #dde3ef;padding:10px}th{background:#eff6ff}.warn{background:#fff4ce;padding:14px;border-radius:8px}a{color:#1d4ed8}</style></head><body><main><a href="/admin/sorteos-diarios/${encodeURIComponent(id)}">← Expediente</a><h1>Calendario de la campaña: ${escape(c.data.title)}</h1><p class="warn">${escape(consistency)} ${locked?'Campaña privada o no autorizada: no admite ventas.':'La autorización documental no elimina los controles técnicos de venta.'} Ningún resultado se publica desde este panel.</p><p>Precio por código: $${escape(c.data.price_per_ticket)} · Estado: ${escape(c.data.status)} · Autorización: ${escape(a.data?.approval_status||'pendiente')}</p><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Premio</th><th>Estado</th><th>Hora de corte</th><th>Resultado</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Sin jornadas</td></tr>'}</tbody></table></main></body></html>`);
    }catch(err){console.error('Error calendario administrativo:',err.message);return res.status(503).send('Calendario no disponible');}
  });
}
