import crypto from 'node:crypto';
import drawRules from './dailyDrawRules.cjs';

const PROVIDER = 'loteria_sinuano_noche';
const MODE = 'loteria_4_pleno';
const ACTIVE_PAYMENT_STATUSES = new Set(['approved']);

/**
 * Verify provenance of each activation against the same order, an approved Wompi
 * transaction and the full balance of the order. No artificial payment, referral
 * reward, reserved installment, or late activation may enter a draw.
 * This is a READ-ONLY engine: it never announces winners or modifies orders.
 */
export function previewWithVerifiedPayments({ draw, campaign, tickets=[], activations=[], orders=[], payments=[] }) {
  if (campaign?.id !== draw?.campaign_id || campaign?.draw_provider !== PROVIDER || campaign?.draw_mode !== MODE) {
    throw new Error('La campaña no corresponde a la modalidad diaria');
  }
  if (!draw?.cutoff_at || !draw?.scheduled_at) {
    throw new Error('Debe definirse y aprobarse el calendario antes de procesar resultados');
  }
  if (!Array.isArray(tickets) || !Array.isArray(activations) || !Array.isArray(orders) || !Array.isArray(payments)) {
    throw new Error('Datos no válidos para la simulación');
  }
  const orderById = new Map(orders.map(o=>[String(o.id),o]));
  const paymentById = new Map(payments.map(p=>[String(p.id),p]));
  const validActivations=[];
  const problems=[];
  for (const a of activations) {
    const ticket=tickets.find(t=>String(t.id)===String(a.ticket_id));
    const order=orderById.get(String(a.order_id));
    const payment=paymentById.get(String(a.approved_payment_id));
    const sameCampaign = ticket && order && String(ticket.rifa_id)===String(campaign.id)
      && String(order.rifa_id)===String(campaign.id);
    const sameOrder = sameCampaign && String(ticket.order_id)===String(order.id)
      && String(payment?.order_id)===String(order.id);
    const completed = sameOrder && order.payment_status==='paid'
      && Number(order.subtotal)>0 && Number(order.total_paid)>=Number(order.subtotal)
      && Number(order.balance_due || 0)===0;
    const paymentValid = completed && payment && payment.provider==='wompi'
      && ACTIVE_PAYMENT_STATUSES.has(payment.status) && Boolean(payment.provider_transaction_id)
      && Number(payment.amount)>0;
    const approvedTransactions = completed ? payments.filter(p=>String(p.order_id)===String(order.id)
      && p.status==='approved' && p.provider==='wompi' && p.provider_transaction_id) : [];
    const paidAmount=approvedTransactions.reduce((sum,p)=>sum+Number(p.amount||0),0);
    const receiptTimes=approvedTransactions.map(p=>Date.parse(p.updated_at||''));
    const confirmationMs=Date.parse(a.payment_confirmation_at||'');
    const activatedMs=Date.parse(a.activated_at||'');
    const completeBeforeActivation=receiptTimes.length>0 && receiptTimes.every(t=>Number.isFinite(t) && t<=confirmationMs && t<=activatedMs);
    const fullyProven=paymentValid && approvedTransactions.some(p=>String(p.id)===String(payment.id))
      && paidAmount>=Number(order.subtotal) && completeBeforeActivation;
    const verifiedAt=Date.parse(a.payment_confirmation_at||'');
    const activatedAt=Date.parse(a.activated_at||'');
    const cutoffAt=Date.parse(draw.cutoff_at);
    const chronology=Number.isFinite(verifiedAt)&&Number.isFinite(activatedAt)
      && Number.isFinite(cutoffAt)&&verifiedAt<=activatedAt&&activatedAt<=cutoffAt;
    if (!fullyProven || !chronology || ticket.status!=='active') {
      problems.push(String(a.ticket_id));
      continue;
    }
    validActivations.push({
      ticket_id: String(a.ticket_id), campaign_id: String(campaign.id),
      order_id:String(a.order_id), payment_id:String(payment.id),
      payment_verified:true, payment_status:'paid', activated_at:a.activated_at,
      revoked_at:a.revoked_at??null
    });
  }
  if (problems.length) {
    // Fails closed instead of silently excluding records which would bias a prize.
    throw new Error(`Hay ${problems.length} activaciones inconsistentes: suspender adjudicación`);
  }
  const eligibleTickets=tickets.map(t=>({
    id:String(t.id), campaign_id:String(t.rifa_id), combination:t.combination,
    status:t.status
  }));
  const result=drawRules.previewDailyResult({
    campaign_id:String(campaign.id), provider:PROVIDER, mode:MODE,
    draw_date:draw.draw_date,cutoff_at:draw.cutoff_at,scheduled_at:draw.scheduled_at,
    official_result:draw.official_result,official_result_reference:draw.official_result_reference,
    verified_by:draw.verified_by
  },eligibleTickets,validActivations);
  const receiptHash=crypto.createHash('sha256').update(JSON.stringify({
    campaign:campaign.id,date:draw.draw_date,result:draw.official_result,
    approvedPayments:validActivations.map(a=>[a.ticket_id,a.payment_id,a.activated_at]).sort((a,b)=>a[0].localeCompare(b[0]))
  })).digest('hex');
  return Object.freeze({...result,receipts_digest:receiptHash,simulation_only:true});
}

/**
 * Flexible calendar: one exceptional campaign per full calendar month.
 * Dates use UTC arithmetic to prevent timezone/DST shifts; operational draw
 * times remain unconfigured until a source and jurisdiction are approved.
 * Exactly ONE major draw on the last calendar day. Prize choice is exclusive.
 */
export function buildMonthlyDraftSchedule(year,month) {
  if(!Number.isInteger(year)||year<2026||year>2100||
     !Number.isInteger(month)||month<1||month>12)
    throw new Error('Año o mes de campaña inválido');
  const days=new Date(Date.UTC(year,month,0)).getUTCDate();
  const prefix=String(year)+'-'+String(month).padStart(2,'0')+'-';
  return Object.freeze(Array.from({length:days},(_,i)=>Object.freeze({
    draw_date:prefix+String(i+1).padStart(2,'0'),
    major_prize:i===days-1,
    status:'draft',
    prize_kind:'undetermined',
    prize_description:i===days-1
      ? 'PREMIO MAYOR: elegir un único premio en especie O en dinero, sin autorización'
      : 'PREMIO DIARIO: pendiente de definición',
    prize_amount:null,cutoff_at:null,scheduled_at:null
  })));
}
export function validateMonthlySchedule(rows,{year,month}={}) {
  if(!Array.isArray(rows)||rows.length===0)
    throw new Error('No hay jornadas del mes');
  const firstDate=String(rows[0]?.draw_date??'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(firstDate))
    throw new Error('Fecha inicial inválida');
  const campaignYear=year??Number(firstDate.slice(0,4));
  const campaignMonth=month??Number(firstDate.slice(5,7));
  const expected=buildMonthlyDraftSchedule(campaignYear,campaignMonth);
  if(rows.length!==expected.length)
    throw new Error('El mes debe contener todas sus jornadas, sin omisiones');
  for(let i=0;i<expected.length;i++){
    const row=rows[i],wanted=expected[i];
    if(row?.draw_date!==wanted.draw_date)
      throw new Error('Jornadas desordenadas, duplicadas o fuera de mes');
    if(row.major_prize!==wanted.major_prize)
      throw new Error('El premio mayor es único y corresponde al último día del mes');
    if(row.status==='scheduled'&&(!row.cutoff_at||!row.scheduled_at))
      throw new Error('Jornada programada sin fecha-hora de corte y sorteo');
    if(row.status==='completed'&&row.prize_kind==='undetermined')
      throw new Error('Jornada cerrada sin premio definido');
    if(row.major_prize && row.prize_kind != null && row.prize_kind !== 'undetermined'
       && !['money','physical'].includes(row.prize_kind))
      throw new Error('El premio mayor debe ser solo dinero O especie');
  }
  return Object.freeze({
    draws:expected.length,majorPrizes:1,
    year:campaignYear,month:campaignMonth,
    first:expected[0].draw_date,last:expected.at(-1).draw_date
  });
}
/** Compatibility for existing December fixtures; new routes use monthly version. */
export function validateDecemberSchedule(rows,year=2026){
  if(!Array.isArray(rows)||rows.length!==31)
    throw new Error('La campaña debe tener 31 sorteos');
  try{
    return validateMonthlySchedule(rows,{year,month:12});
  }catch(err){
    if(/premio mayor es único/.test(String(err.message)))
      throw new Error('Solo el 31 tendrá el premio mayor');
    throw err;
  }
}
