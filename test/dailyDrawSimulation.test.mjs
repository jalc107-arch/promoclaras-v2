import test from 'node:test';
import assert from 'node:assert/strict';
import { previewWithVerifiedPayments,validateDecemberSchedule } from '../services/dailyDrawSimulation.mjs';
const campaign={id:'C',draw_provider:'loteria_sinuano_noche',draw_mode:'loteria_4_pleno'};
const draw={campaign_id:'C',draw_date:'2026-12-01',cutoff_at:'2026-12-01T20:00:00-05:00',scheduled_at:'2026-12-01T21:00:00-05:00',official_result:'0042',official_result_reference:'verificacion-test-0000001',verified_by:'admin'};
const ticket={id:'T',rifa_id:'C',order_id:'O',combination:'0042',status:'active'};
const act={ticket_id:'T',campaign_id:'C',order_id:'O',approved_payment_id:'P',payment_confirmation_at:'2026-12-01T18:00:00-05:00',activated_at:'2026-12-01T18:01:00-05:00'};
const order={id:'O',rifa_id:'C',subtotal:12500,total_paid:12500,balance_due:0,payment_status:'paid'};
const payment={id:'P',order_id:'O',amount:12500,status:'approved',provider:'wompi',provider_transaction_id:'tx-test-sandbox',updated_at:'2026-12-01T17:59:00-05:00'};
const sample=()=>({campaign,draw,tickets:[ticket],activations:[act],orders:[order],payments:[payment]});
test('La compra íntegra verificada que estaba activa antes del cierre gana',()=>{
 const result=previewWithVerifiedPayments(sample());assert.equal(result.winner_ticket_id,'T');assert.equal(result.outcome,'winner');assert.equal(result.simulation_only,true);
});
test('Sin combinación comprada no hay ganador y no se reapropian resultados',()=>{
 const result=previewWithVerifiedPayments({...sample(),draw:{...draw,official_result:'0043'}});assert.equal(result.winner_ticket_id,null);assert.equal(result.outcome,'no_winner');
});
test('Un mismo código participa después, mientras continúe activo',()=>{
 const later={...draw,draw_date:'2026-12-02',cutoff_at:'2026-12-02T20:00:00-05:00',scheduled_at:'2026-12-02T21:00:00-05:00'};
 assert.equal(previewWithVerifiedPayments({...sample(),draw:later}).winner_ticket_id,'T');
});
for (const [desc, mutate] of [
 ['Pago pendiente',v=>v.payments[0].status='pending'],
 ['Pago que no es Wompi',v=>v.payments[0].provider='referral_reward'],
 ['Transacción sin identificación externa',v=>v.payments[0].provider_transaction_id=null],
 ['Pago de orden diferente',v=>v.payments[0].order_id='OTHER'],
 ['Pago verificado después de la activación',v=>v.payments[0].updated_at='2026-12-01T19:00:00-05:00'],
 ['Monto pagado no cubre el subtotal',v=>v.payments[0].amount=1000],
 ['Orden de cuotas sin pagar totalmente',v=>v.orders[0].payment_status='partially_paid'],
 ['Saldo pendiente',v=>v.orders[0].balance_due=1000],
 ['Código aún reservado',v=>v.tickets[0].status='reserved_installment'],
 ['Activación posterior al cierre',v=>v.activations[0].activated_at='2026-12-01T22:00:00-05:00'],
 ['Activación anterior al pago',v=>v.activations[0].activated_at='2026-12-01T17:00:00-05:00']
])test(`Rechazar en vez de adjudicar: ${desc}`,()=>{const v=structuredClone(sample());mutate(v);assert.throws(()=>previewWithVerifiedPayments(v),/inconsistentes/)});
test('El resultado 0000 conserva ceros iniciales',()=>{
 const v=structuredClone(sample());v.draw.official_result='0000';v.tickets[0].combination='0000';assert.equal(previewWithVerifiedPayments(v).result,'0000');
});
test('No procesa jornadas sin hora de cierre verificada',()=>{
 const v=structuredClone(sample());v.draw.cutoff_at=null;assert.throws(()=>previewWithVerifiedPayments(v),/calendario/);
});
test('No procesa dos códigos con el mismo número elegible',()=>{
 const v=structuredClone(sample());v.tickets.push({...ticket,id:'T2',order_id:'O2'});
 v.orders.push({...order,id:'O2'});v.payments.push({...payment,id:'P2',order_id:'O2'});
 v.activations.push({...act,ticket_id:'T2',order_id:'O2',approved_payment_id:'P2'});
 assert.throws(()=>previewWithVerifiedPayments(v),/duplicado/);
});
test('La reserva de un código sin activación jamás gana',()=>{
 const v=structuredClone(sample());v.activations=[];const r=previewWithVerifiedPayments(v);assert.equal(r.outcome,'no_winner');
});
test('Los 31 sorteos tienen un único premio mayor el 31',()=>{
 const rows=Array.from({length:31},(_,i)=>({draw_date:`2026-12-${String(i+1).padStart(2,'0')}`,major_prize:i===30,status:'draft'}));
 assert.equal(validateDecemberSchedule(rows).draws,31);
 assert.throws(()=>validateDecemberSchedule(rows.slice(1)),/31 sorteos/);
 const bad=structuredClone(rows);bad[19].major_prize=true;assert.throws(()=>validateDecemberSchedule(bad),/Solo el 31/);
});

test('La última cuota pagada después de activar no habilita el premio retrospectivamente',()=>{
 const v=structuredClone(sample());v.payments[0].amount=6250;v.payments.push({...payment,id:'P2',amount:6250,updated_at:'2026-12-01T19:59:00-05:00'});assert.throws(()=>previewWithVerifiedPayments(v),/inconsistentes/);
});
