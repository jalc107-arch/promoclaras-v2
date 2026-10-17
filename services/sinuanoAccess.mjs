/* CampaClick: fail-closed access gates for the exceptional daily campaign.
   By default this module never authorizes sales, even with admin approval.
   Only opt-in activation after legal+processor validation and E2E tests can change that. */
export const DAILY_PROVIDER = 'loteria_sinuano_noche';
export const IS_DAILY_COMMERCIALLY_ENABLED = false;

export const isDailyCampaign = value => String(value?.draw_provider ?? value ?? '') === DAILY_PROVIDER;

export function dailyCampaignMayCollect({campaign,authorization,implemented=IS_DAILY_COMMERCIALLY_ENABLED}={}) {
  return implemented === true && isDailyCampaign(campaign) && campaign?.status === 'active'
    && campaign?.is_public === true && authorization?.approval_status === 'approved'
    && authorization?.regulatory_clearance === true && authorization?.payment_provider_clearance === true
    && !!authorization?.approved_at && !authorization?.revoked_at;
}

export function requiresConfirmedPayment({ticket,order,verifiedPayment,cutoffAt}={}) {
  const cutoffMs = Date.parse(cutoffAt || '');
  const approvedMs = Date.parse(verifiedPayment?.approved_at || '');
  const activatedMs = Date.parse(ticket?.activated_at || '');
  return ticket?.status === 'active' && order?.payment_status === 'paid'
    && String(ticket?.order_id || '') === String(order?.id || '')
    && String(verifiedPayment?.order_id || '') === String(order?.id || '')
    && verifiedPayment?.status === 'approved' && verifiedPayment?.verified_by_provider === true
    && [cutoffMs, approvedMs, activatedMs].every(Number.isFinite)
    && approvedMs <= activatedMs && activatedMs <= cutoffMs;
}

export function registerDailyDrawFailClosedGuards(app,{supabase}) {
  const reject=(res)=>res.status(403).send('Modalidad de sorteos diarios reservada al administrador. Las ventas y resultados están deshabilitados mientras se verifican las autorizaciones.');
  const bySlug=async(req,res,next)=>{
    try {
      const {data,error}=await supabase.from('rifas').select('draw_provider').eq('slug',String(req.params.slug||'')).maybeSingle();
      if(error) return res.status(503).send('No se pudo verificar la modalidad de campaña.');
      if(isDailyCampaign(data))return reject(res);
      next();
    } catch {return res.status(503).send('No se pudo verificar la modalidad de campaña.');}
  };
  const byId=async(req,res,next)=>{
    try {
      const id=String(req.params.rifaId||'');
      const {data,error}=await supabase.from('rifas').select('draw_provider').eq('id',id).maybeSingle();
      if(error) return res.status(503).send('No se pudo verificar la modalidad de campaña.');
      if(isDailyCampaign(data))return reject(res);
      next();
    } catch {return res.status(503).send('No se pudo verificar la modalidad de campaña.');}
  };
  const excludeNew=(req,res,next)=>isDailyCampaign(req.body?.draw_provider)?reject(res):next();
  app.post('/organizers/:organizerId/campanas/nueva',excludeNew);
  app.use('/campanas/:slug/comprar',bySlug);
  app.post('/organizers/:organizerId/campanas/:rifaId/venta-credito',byId);
  app.post('/organizers/:organizerId/campanas/:rifaId/visibilidad',byId);
  app.post('/admin/campanas/:rifaId/aprobar',byId);
  app.post('/admin/campanas/:rifaId/resultado',byId);
  app.post('/admin/resultados/masivo',excludeNew);
}
