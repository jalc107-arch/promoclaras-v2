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
 * Same API used by the administrative preview: each date is an independent
 * event; 31 December is reserved for the single major prize.
 */
export function validateDecemberSchedule(rows,year=2026) {
  if (!Array.isArray(rows)||rows.length!==31)throw new Error('La campaña debe tener 31 sorteos');
  const dates=new Set();
  for(const row of rows){
    const date=`${year}-12-${String(dates.size+1).padStart(2,'0')}`;
    if(row.draw_date!==date||dates.has(date))throw new Error('Calendario incompleto, desordenado o duplicado');
    if(Boolean(row.major_prize)!==(date===`${year}-12-31`))throw new Error('Solo el 31 tendrá el premio mayor');
    if(row.status==='scheduled'&&(!row.cutoff_at||!row.scheduled_at))throw new Error('Falta hora de corte para jornada programada');
    dates.add(date);
  }
  return Object.freeze({draws:rows.length,majorPrizes:1,first:`${year}-12-01`,last:`${year}-12-31`});
}
