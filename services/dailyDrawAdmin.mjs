import crypto from 'node:crypto';
import { DAILY_PROVIDER } from './sinuanoAccess.mjs';

export function registerDailyDrawAdminRoutes(app,{supabase,escapeHtml}) {
  const esc=s=>escapeHtml(String(s??''));
  const sessionActor=req=>crypto.createHash('sha256').update(String(req.sessionID||'')).digest('hex');
  const ensureAdmin=(req,res,next)=>req.session?.isAdmin===true?next():res.status(403).send('Acceso administrativo requerido');
  const html=(main)=>`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Modalidad excepcional · CampaClick</title><style>body{font:16px Arial;background:#eff6ff;color:#102038;padding:24px}main{max-width:920px;margin:auto;background:white;border-radius:18px;padding:28px}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #dde}button{padding:10px 16px;border:0;border-radius:8px;background:#1e40af;color:white}input,textarea{padding:10px;width:100%;box-sizing:border-box}a{color:#1d4ed8}</style></head><body><main>${main}</main></body></html>`;
  app.get('/admin/sorteos-diarios',ensureAdmin,async(req,res)=>{
    try {
      const q=await supabase.from('rifas').select('id,title,slug,status,is_public,price_per_ticket').eq('draw_provider',DAILY_PROVIDER);
      if(q.error)throw q.error;
      const campaigns=q.data||[];
      const output=[];
      for(const c of campaigns){
        const r=await supabase.from('daily_draw_campaign_authorizations').select('approval_status,regulatory_clearance,payment_provider_clearance,approval_reason').eq('campaign_id',c.id).maybeSingle();
        if(r.error)throw r.error;
        const a=r.data||{};
        output.push(`<tr><td>${esc(c.title)}</td><td>$${esc(c.price_per_ticket)}</td><td>${esc(a.approval_status||'Sin solicitud')}</td><td>${a.regulatory_clearance===true?'Sí':'Pendiente'}</td><td>${a.payment_provider_clearance===true?'Sí':'Pendiente'}</td><td><a href="/admin/sorteos-diarios/${encodeURIComponent(c.id)}">Revisar</a></td></tr>`);
      }
      res.set('Cache-Control','no-store');
      return res.send(html(`<h1>Sorteos diarios · Autorización excepcional</h1><p>Solo el administrador puede revisar. La venta está técnicamente bloqueada durante desarrollo, aun si un expediente recibe aprobación.</p><table><thead><tr><th>Campaña</th><th>Precio</th><th>Decisión</th><th>Regulación</th><th>Wompi</th><th>Acción</th></tr></thead><tbody>${output.join('')||'<tr><td colspan="6">Sin campañas</td></tr>'}</tbody></table><p><a href="/admin/resultados">Volver al panel</a></p>`));
    }catch(err){console.error('Error panel sorteos diarios:',err.message);return res.status(503).send('Panel temporalmente no disponible');}
  });
  app.get('/admin/sorteos-diarios/:campaignId',ensureAdmin,async(req,res)=>{
    try {
      const id=req.params.campaignId;
      const q=await supabase.from('rifas').select('id,title,draw_provider,status,is_public,regulatory_authority,regulatory_authorization_number').eq('id',id).maybeSingle();
      if(q.error)throw q.error;
      if(q.data?.draw_provider!==DAILY_PROVIDER)return res.status(404).send('Campaña diaria no encontrada');
      const a=await supabase.from('daily_draw_campaign_authorizations').select('*').eq('campaign_id',id).maybeSingle();
      if(a.error)throw a.error;
      const logs=await supabase.from('daily_draw_authorization_events').select('decision,recorded_at,reason').eq('campaign_id',id).order('recorded_at',{ascending:false}).limit(20);
      if(logs.error)throw logs.error;
      const state=a.data||{};
      res.set('Cache-Control','no-store');
      return res.send(html(`<a href="/admin/sorteos-diarios">← Expedientes</a><p><a href="/admin/sorteos-diarios/${encodeURIComponent(id)}/calendario">Consultar calendario de 31 jornadas</a> · <a href="/admin/sorteos-diarios/${encodeURIComponent(id)}/preparacion">Preparación documental y premios en borrador</a></p><h1>${esc(q.data.title)}</h1><p>Estado del expediente: <b>${esc(state.approval_status||'Sin solicitud')}</b>. Validación regulatoria: <b>${state.regulatory_clearance?'Sí':'Pendiente'}</b>. Wompi: <b>${state.payment_provider_clearance?'Sí':'Pendiente'}</b>.</p><p><b>Venta real siempre bloqueada durante esta fase.</b> Esta aprobación no publica campañas ni habilita cobros.</p><form method="post" action="/admin/sorteos-diarios/${encodeURIComponent(id)}/decision"><label>Decisión<select name="decision" required><option value="">Seleccione</option><option value="regulatory_checked">Validación regulatoria documentada</option><option value="processor_checked">Validación de Wompi documentada</option><option value="approved">Aprobar expediente</option><option value="revoked">Revocar autorización</option><option value="rejected">Rechazar expediente</option></select></label><p><label>Motivo verificable (mínimo 15 caracteres)<textarea name="reason" rows="4" required minlength="15" maxlength="1500"></textarea></label></p><p><label>Referencia de autorización o confirmación (obligatoria al validar regulación o Wompi)<input name="reference" maxlength="400" placeholder="Documento o URL verificable"></label></p><button>Registrar decisión</button></form><h2>Auditoría reciente</h2><table><tr><th>Fecha</th><th>Decisión</th><th>Motivo</th></tr>${(logs.data||[]).map(l=>`<tr><td>${esc(l.recorded_at)}</td><td>${esc(l.decision)}</td><td>${esc(l.reason)}</td></tr>`).join('')}</table>`));
    }catch(err){console.error('Error revisar expediente diario:',err.message);return res.status(503).send('Expediente no disponible');}
  });
  app.post('/admin/sorteos-diarios/:campaignId/decision',ensureAdmin,async(req,res)=>{
    const decision=String(req.body?.decision||'');
    const reason=String(req.body?.reason||'').trim();
    const reference=String(req.body?.reference||'').trim();
    if(!['regulatory_checked','processor_checked','approved','revoked','rejected'].includes(decision)||reason.length<15||reason.length>1500||reference.length>400||(['regulatory_checked','processor_checked'].includes(decision)&&reference.length<10))return res.status(400).send('Decisión o motivo inválido');
    try {
      const {data,error}=await supabase.rpc('admin_daily_draw_decide_atomic',{p_campaign_id:req.params.campaignId,p_decision:decision,p_reason:reason,p_actor_fingerprint:sessionActor(req),p_reference:reference||null});
      if(error){console.error('No se pudo decidir expediente diario:',error.message);return res.status(409).send('No se pudo registrar la decisión. Verifique que las dos autorizaciones estén acreditadas y el expediente exista.');}
      if(!data)return res.status(409).send('Expediente sin modificación');
      return res.redirect(303,`/admin/sorteos-diarios/${encodeURIComponent(req.params.campaignId)}`);
    }catch(err){console.error('Error de decisión:',err.message);return res.status(503).send('No disponible');}
  });
}
