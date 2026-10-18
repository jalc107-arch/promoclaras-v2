import crypto from 'node:crypto';
import {IS_DAILY_COMMERCIALLY_ENABLED} from './sinuanoAccess.mjs';
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const actor=req=>crypto.createHash('sha256').update(String(req.sessionID||'')).digest('hex');
/** Writes exclusively append-only internal monthly draft revisions. */
export function registerDailyMonthlyDraftRoutes(app,{supabase}){
 const admin=(req,res,next)=>req.session?.isAdmin===true?next():res.status(403).send('Administrador requerido');
 app.post('/admin/sorteos-diarios/:campaignId/preparacion/mes/borrador',admin,async(req,res)=>{
   if(IS_DAILY_COMMERCIALLY_ENABLED!==false)return res.status(403).send('Solo funciona con ventas bloqueadas');
   const id=String(req.params?.campaignId||'');
   const yr=String(req.body?.year||''),mo=String(req.body?.month||'');
   const rawKind=String(req.body?.major_kind??'').trim();
   const description=String(req.body?.description||'').trim();
   const rawAmount=String(req.body?.amount??'').trim();
   const rawQuantity=String(req.body?.quantity??'').trim();
   if(!ID.test(id)||!/^\d{4}$/.test(yr)||! /^(?:[1-9]|1[0-2])$/.test(mo)||
      Number(yr)<2026||Number(yr)>2100)return res.status(400).send('Mes o campaña inválidos');
   const kind=rawKind||null;
   if(![null,'money','physical'].includes(kind))return res.status(400).send('Tipo inválido');
   const amount=rawAmount&&/^[1-9]\d{0,11}(?:\.\d{1,2})?$/.test(rawAmount)?Number(rawAmount):null;
   const quantity=rawQuantity&&/^[1-9]\d{0,5}$/.test(rawQuantity)?Number(rawQuantity):null;
   if(!((kind===null&&!description&&!rawAmount&&!rawQuantity)
      ||(kind==='money'&&description.length>=12&&description.length<=800&&amount>0&&!rawQuantity)
      ||(kind==='physical'&&description.length>=12&&description.length<=800&&quantity>0&&!rawAmount))) {
    return res.status(400).send('Seleccione solo dinero O especie para el premio mayor');
   }
   try{
    const db=await supabase.rpc('admin_daily_save_month_plan_draft',{
      p_campaign_id:id,p_year:Number(yr),p_month:Number(mo),
      p_kind:kind,p_description:description||null,
      p_amount:kind==='money'?amount:null,p_quantity:kind==='physical'?quantity:null,
      p_actor_fingerprint:actor(req)
    });
    if(db.error){console.error('Plan mensual rechazado:',db.error.message);
      return res.status(409).send('El expediente no permite guardar el borrador mensual');}
    return res.redirect(303,'/admin/sorteos-diarios/'+encodeURIComponent(id)+'/preparacion/mes?year='+encodeURIComponent(yr)+'&month='+encodeURIComponent(mo));
   }catch(err){console.error('Plan mensual no disponible:',err.message);return res.status(503).send('No disponible');}
 });
}
