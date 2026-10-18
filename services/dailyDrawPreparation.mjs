import crypto from 'node:crypto';

const REQUIREMENTS = Object.freeze([
 ['legal_classification','Clasificación jurídica de la modalidad'],
 ['competent_authority','Autoridad competente y jurisdicción'],
 ['regulatory_authorization','Respuesta y autorización regulatoria'],
 ['wompi_written_approval','Aceptación escrita del procesador Wompi'],
 ['official_result_rights','Permiso para utilizar el resultado externo'],
 ['prize_plan','Plan definitivo de premios'],
 ['draw_schedule','Calendario, horarios y cortes oficiales'],
 ['unclaimed_prize_rule','Tratamiento de combinaciones no vendidas'],
 ['taxes_guarantees','Impuestos, garantías y derechos de explotación'],
 ['privacy_antifraud','Protección de datos y medidas antifraude'],
 ['terms_and_consumer_rights','Reglamento y derechos del participante']
]);
const REQUIREMENT_KEYS = new Set(REQUIREMENTS.map(x=>x[0]));
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export function registerDailyDrawPreparationRoutes(app,{supabase,escapeHtml}) {
 const esc=x=>escapeHtml(String(x??''));
 const admin=(req,res,next)=>req.session?.isAdmin===true?next():res.status(403).send('Administrador requerido');
 const actor=req=>crypto.createHash('sha256').update(String(req.sessionID||'')).digest('hex');
 const safeId=req=>UUID.test(String(req.params?.campaignId||''));
 const goBack=(res,id)=>res.redirect(303,`/admin/sorteos-diarios/${encodeURIComponent(id)}/preparacion`);
 const formRow=([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`;
 const style=`<style>body{margin:0;font:15px system-ui,-apple-system,Arial,sans-serif;background:#f2f6fc;color:#172845}main{max-width:1150px;margin:24px auto;padding:24px;background:white;border-radius:16px;box-shadow:0 4px 20px #17315c16}h1,h2{color:#153769}a{color:#1551a1}.caution{padding:15px;background:#fff1d9;border:1px solid #efc77d;border-radius:10px}section{margin:28px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce4ee;vertical-align:top}form{padding:15px;background:#f5f8fe;border-radius:10px;margin:14px 0}input,select,textarea{box-sizing:border-box;display:block;width:100%;font:inherit;padding:10px;margin:7px 0 14px;border:1px solid #9aadc6;border-radius:8px}button{background:#194887;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-weight:700}.small{font-size:13px;color:#57667a}.scroll{overflow:auto}li{margin:8px 0}@media(max-width:700px){main{padding:14px;margin:10px}th,td{padding:7px;font-size:12px}}</style>`;
 app.get('/admin/sorteos-diarios/:campaignId/preparacion',admin,async(req,res)=>{
  if(!safeId(req))return res.status(400).send('Identificador inválido');
  try{
   const id=req.params.campaignId;
   const [campaign,authorization,draws,notes,proposals,gate]=await Promise.all([
    supabase.from('rifas').select('id,title,slug,status,is_public,draw_provider,draw_mode,price_per_ticket').eq('id',id).maybeSingle(),
    supabase.from('daily_draw_campaign_authorizations').select('approval_status,regulatory_clearance,payment_provider_clearance').eq('campaign_id',id).maybeSingle(),
    supabase.from('campaign_daily_draws').select('id,draw_date,status,major_prize,prize_kind,prize_description').eq('campaign_id',id).order('draw_date',{ascending:true}).limit(40),
    supabase.from('campaign_daily_preflight_notes').select('requirement_key,note,evidence_reference,created_at').eq('campaign_id',id).order('created_at',{ascending:false}).limit(80),
    supabase.from('campaign_daily_prize_proposals').select('draw_date,option_label,prize_kind,description,proposed_amount,quantity,created_at').eq('campaign_id',id).order('created_at',{ascending:false}).limit(100),
    supabase.from('campaign_daily_commerce_controls').select('sales_enabled').eq('singleton',true).maybeSingle()
   ]);
   if([campaign,authorization,draws,notes,proposals,gate].some(v=>v.error))throw new Error('Error consultando expediente');
   const c=campaign.data;
   if(c?.draw_provider!=='loteria_sinuano_noche'||c.draw_mode!=='loteria_4_pleno')return res.status(404).send('Modalidad no encontrada');
   const d=draws.data||[];
   const messages=notes.data||[];
   const opts=proposals.data||[];
   const pending= c.status==='pending' && c.is_public===false &&
     authorization.data?.approval_status==='pending' && gate.data?.sales_enabled===false;
   const checklist=REQUIREMENTS.map(([key,label])=>{
    const count=messages.filter(x=>x.requirement_key===key).length;
    return `<tr><td>${esc(label)}</td><td>${count?'Documentación preliminar: '+count:'Sin documentación'}</td><td><b>Pendiente de verificación externa</b></td></tr>`;
   }).join('');
   const grouped=new Map();
   for(const p of opts){const k=String(p.draw_date);grouped.set(k,(grouped.get(k)||[]).concat(p));}
   const rows=d.map(day=>{
    const choices=grouped.get(day.draw_date)||[];
    const summary=choices.length?choices.map(p=>`${esc(p.option_label)}: ${esc(p.description)} ${p.prize_kind==='money'?'($'+esc(p.proposed_amount)+')':'(' + esc(p.quantity)+' unidad/es)'}`).join(' | '):'Pendiente de propuesta';
    return `<tr><td>${esc(day.draw_date)}</td><td>${day.major_prize?'Premio mayor':'Diario'}</td><td>${esc(day.status)}</td><td>${summary}</td></tr>`;
   }).join('');
   const recent=messages.map(x=>`<tr><td>${esc(x.created_at)}</td><td>${esc(x.requirement_key)}</td><td>${esc(x.note)}<p class="small">${esc(x.evidence_reference||'Sin referencia')}</p></td></tr>`).join('');
   const idUrl=encodeURIComponent(id);
   const readonlyNotice='<p class="caution"><b>Premio mayor único:</b> en la última jornada será dinero O especie, nunca ambos. Las propuestas son alternativas sin elegir. <b>Solo preparación interna.</b> Ninguna nota o propuesta constituye validación de Coljuegos o Wompi; no se cambia el calendario oficial, se asignan premios ni se habilitan ventas. Las 31 jornadas son un escenario técnico pendiente de viabilidad jurídica.</p>';
   const disabledForm=pending? `
    <section><h2>Agregar nota al expediente</h2>
    <form method="post" action="/admin/sorteos-diarios/${idUrl}/preparacion/notas">
    <label>Requisito<select name="requirement_key" required>${REQUIREMENTS.map(formRow).join('')}</select></label>
    <label>Análisis o documento pendiente<textarea name="note" minlength="15" maxlength="1200" rows="4" required></textarea></label>
    <label>Referencia verificable (opcional; no acredita autorización)<input name="reference" maxlength="400"></label>
    <button>Guardar nota interna</button></form></section>
    <section><h2>Proponer un premio sin aprobarlo</h2>
    <form method="post" action="/admin/sorteos-diarios/${idUrl}/preparacion/premios">
    <label>Fecha<select name="draw_date" required>${d.filter(v=>v.status==='draft').map(v=>`<option value="${esc(v.draw_date)}">${esc(v.draw_date)} ${v.major_prize?'(premio mayor)':''}</option>`).join('')}</select></label>
    <label>Nombre de alternativa<input name="option_label" minlength="3" maxlength="70" required placeholder="Ej. Propuesta 1"></label>
    <label>Clase<select name="prize_kind"><option value="physical">Bien (cantidad de unidades)</option><option value="money">Dinero (valor en COP)</option></select></label>
    <label>Descripción<textarea name="description" minlength="12" maxlength="800" rows="3" required></textarea></label>
    <label>Monto en COP (solo si es dinero)<input name="proposed_amount" inputmode="numeric" pattern="[0-9]*" placeholder="12500000"></label>
    <label>Cantidad (solo si es bien)<input name="quantity" inputmode="numeric" pattern="[0-9]*" placeholder="2"></label>
    <button>Guardar propuesta NO aprobada</button></form>
    <p class="small">Dinero y bienes son hipótesis sometidas a revisión jurídica. No deben anunciarse como premios autorizados.</p></section>`
    :'<p class="caution">Este expediente no está en estado seguro para editar borradores. Se muestra solo lectura.</p>';
   res.set('Cache-Control','no-store');
   return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preparación Sinuano · CampaClick</title>${style}</head><body><main><a href="/admin/sorteos-diarios/${idUrl}">← Volver al expediente</a><h1>Preparación de la modalidad: ${esc(c.title)}</h1>${readonlyNotice}<p>Estado: <b>${esc(c.status)}</b> · Expediente: <b>${esc(authorization.data?.approval_status)}</b> · Ventas: <b>${gate.data?.sales_enabled===true?'ACTIVAS (revisar inmediatamente)':'DESHABILITADAS'}</b></p><section><h2>Requisitos y autorizaciones — no verificados</h2><div class="scroll"><table><thead><tr><th>Requisito</th><th>Preparación</th><th>Estado jurídico</th></tr></thead><tbody>${checklist}</tbody></table></div></section><section><h2>Plan tentativo · 31 jornadas</h2><p class="small">No se modifican los premios ni resultados de la tabla oficial. Se guardan propuestas separadas e inmutables.</p><div class="scroll"><table><tr><th>Fecha</th><th>Jornada</th><th>Estado</th><th>Propuestas</th></tr>${rows}</table></div></section>${disabledForm}<section><h2>Historial de notas</h2><div class="scroll"><table><tr><th>Fecha</th><th>Requisito</th><th>Nota</th></tr>${recent||'<tr><td colspan="3">Sin notas todavía</td></tr>'}</table></div></section></main></body></html>`);
  }catch(error){console.error('Preparación administrativa diaria no disponible:',error.message);return res.status(503).send('Preparación administrativa temporalmente no disponible');}
 });
 app.post('/admin/sorteos-diarios/:campaignId/preparacion/notas',admin,async(req,res)=>{
  if(!safeId(req))return res.status(400).send('Identificador inválido');
  const key=String(req.body?.requirement_key||'');
  const note=String(req.body?.note||'').trim();
  const reference=String(req.body?.reference||'').trim();
  if(!REQUIREMENT_KEYS.has(key)||note.length<15||note.length>1200||reference.length>400)return res.status(400).send('Nota inválida');
  try{
   const saved=await supabase.rpc('admin_daily_record_preflight_note',{
    p_campaign_id:req.params.campaignId,p_requirement_key:key,p_note:note,
    p_reference:reference||null,p_actor_fingerprint:actor(req)});
   if(saved.error)return res.status(409).send('No se puede guardar una nota: expediente bloqueado');
   return goBack(res,req.params.campaignId);
  }catch(error){console.error('Fallo guardando nota:',error.message);return res.status(503).send('Registro no disponible');}
 });
 app.post('/admin/sorteos-diarios/:campaignId/preparacion/premios',admin,async(req,res)=>{
  if(!safeId(req))return res.status(400).send('Identificador inválido');
  const date=String(req.body?.draw_date||'');
  const kind=String(req.body?.prize_kind||'');
  const label=String(req.body?.option_label||'').trim();
  const description=String(req.body?.description||'').trim();
  const rawAmount=String(req.body?.proposed_amount||'').trim();
  const rawQty=String(req.body?.quantity||'').trim();
  const amount=kind==='money'&&/^[1-9]\d{0,11}$/.test(rawAmount)?Number(rawAmount):null;
  const qty=kind==='physical'&&/^[1-9]\d{0,3}$/.test(rawQty)?Number(rawQty):null;
  if(!/^2026-12-(0[1-9]|[12][0-9]|3[01])$/.test(date)||
   label.length<3||label.length>70||description.length<12||description.length>800||
   !['money','physical'].includes(kind)||!Number.isSafeInteger(kind==='money'?amount:qty)||
   (kind==='money'&&rawQty)||(kind==='physical'&&rawAmount))
   return res.status(400).send('Propuesta incompleta o inválida');
  try{
   const saved=await supabase.rpc('admin_daily_add_prize_proposal',{
    p_campaign_id:req.params.campaignId,p_draw_date:date,p_option_label:label,
    p_kind:kind,p_description:description,p_proposed_amount:amount,
    p_quantity:qty,p_actor_fingerprint:actor(req)});
   if(saved.error)return res.status(409).send('No se puede guardar: jornada o campaña no está en borrador');
   return goBack(res,req.params.campaignId);
  }catch(error){console.error('Fallo guardando propuesta:',error.message);return res.status(503).send('Registro no disponible');}
 });
}
