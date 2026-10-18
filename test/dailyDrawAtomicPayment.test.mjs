import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/20261018_staging_daily_atomic_full_payment_activation.sql',import.meta.url),'utf8');
test('La asignacion y activacion de Sinuano ocurre en una sola transaccion SQL',()=>{
  assert.match(sql,/UPDATE public\.orders SET payment_status='paid'/);
  assert.match(sql,/INSERT INTO public\.tickets/);
  assert.match(sql,/INSERT INTO public\.campaign_daily_ticket_activations/);
  assert.match(sql,/WHERE id=p_order_id FOR UPDATE/);
  assert.match(sql,/WHERE id=v_order\.rifa_id FOR UPDATE/);
});
test('Sin cuota parcial, doble Wompi, autorizacion ni cantidad minima invalida',()=>{
  assert.match(sql,/v_order\.payment_mode IS DISTINCT FROM 'full'/);
  assert.match(sql,/v_order\.qty<5/);
  assert.match(sql,/Transaccion aprobada duplicada o compartida/);
  assert.match(sql,/Falta autorización excepcional completa/);
});
test('Cliente nunca escoge combinaciones; deben ser exactamente 4 digitos',()=>{
  assert.match(sql,/generate_series\(0,9999\)/);
  assert.match(sql,/gen_random_bytes\(8\)/);
  assert.match(sql,/t\.combination !~ '\^\[0-9\]\{4\}\$'/);
});
test('No se autoriza ejecucion publica ni se habilitan ventas',()=>{
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.system_daily_finalize_full_payment_atomic/);
  assert.match(sql,/TO service_role/);
  assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP\s+TABLE\b/);
});
