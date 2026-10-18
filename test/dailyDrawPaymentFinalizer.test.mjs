import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeDailyPaidOrderIfEnabled } from '../services/dailyDrawPaymentFinalizer.mjs';
import { IS_DAILY_COMMERCIALLY_ENABLED } from '../services/sinuanoAccess.mjs';
const order={id:'fake-order',qty:5,subtotal:12500,payment_mode:'full',
  rifas:{draw_provider:'loteria_sinuano_noche'}};
const tested=()=>({calls:[],from(name){this.calls.push(name);return this;},
 select(){return this;},eq(){return this;},
 async limit(){return {data:[{id:'fake-pay',provider_transaction_id:'sandbox_test_id',
 amount:12500,status:'approved'}],error:null}},
 async rpc(name,args){this.calls.push([name,args]);return {data:{assigned_count:5,activated_count:5,already_processed:false},error:null}}});
test('Habilitación comercial continúa apagada',()=>assert.equal(IS_DAILY_COMMERCIALLY_ENABLED,false));
test('Las campañas tradicionales no consultan pagos ni llaman a RPC diaria',async()=>{
 const db=tested();const result=await finalizeDailyPaidOrderIfEnabled({
   order:{...order,rifas:{draw_provider:'loteria_boyaca'}},supabase:db});
 assert.equal(result,null);assert.equal(db.calls.length,0);
});
test('Una campaña diaria queda bloqueada antes de consultar Wompi',async()=>{
 const db=tested();await assert.rejects(()=>finalizeDailyPaidOrderIfEnabled({
   order,supabase:db}),/Modalidad diaria deshabilitada/);assert.equal(db.calls.length,0);
});
test('En laboratorio autorizado delega todo a la única RPC atómica',async()=>{
 const db=tested();const v=await finalizeDailyPaidOrderIfEnabled({order,supabase:db,enabled:true});
 assert.equal(v.daily,true);assert.equal(v.activatedCount,5);
 assert.deepEqual(db.calls.at(-1),['system_daily_finalize_full_payment_atomic',{
  p_order_id:'fake-order',p_provider_transaction_id:'sandbox_test_id'}]);
});
test('Abonos por cuotas rechazados y ninguna asignación parcial admitida',async()=>{
 const db=tested();await assert.rejects(()=>finalizeDailyPaidOrderIfEnabled({
  order:{...order,payment_mode:'installments'},supabase:db,enabled:true
 }),/no admite cuotas/);
 const other=tested();other.rpc=async()=>({data:{assigned_count:5,activated_count:4},error:null});
 await assert.rejects(()=>finalizeDailyPaidOrderIfEnabled({
  order,supabase:other,enabled:true
 }),/incompleta/);
});
