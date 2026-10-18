import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const activation=read('migrations/20261017_staging_daily_activation_guard.sql');
const result=read('migrations/20261017_staging_daily_result_atomic.sql');
const index=read('index.js');
const guard=read('services/sinuanoAccess.mjs');
test('No hay habilitación de comercialización del proveedor excepcional',()=>{
 assert.match(guard,/IS_DAILY_COMMERCIALLY_ENABLED\s*=\s*false/);
 assert.match(index,/registerDailyDrawFailClosedGuards\(app/);
});
test('El nuevo motor no modifica el procesamiento existente de Wompi',()=>{
 assert.equal((index.match(/app\.post\("\/webhooks\/wompi"/g)||[]).length,1);
 assert.equal((index.match(/async function finalizePaidOrder\(/g)||[]).length,1);
});
test('La activación nunca admite datos de fecha retroactiva del navegador',()=>{
 assert.match(activation,/NEW\.activated_at:=v_now/);
 assert.match(activation,/NEW\.payment_confirmation_at:=v_last_approval/);
 assert.match(activation,/payment_status<>'paid'/);
 assert.match(activation,/payment_provider_clearance=true/);
 assert.match(activation,/v_paid<v_order\.subtotal/);
});
test('Cada resultado se registra de forma independiente y sin cerrar la campaña',()=>{
 assert.match(result,/FROM public\.campaign_daily_draws WHERE id=p_draw_id FOR UPDATE/);
 assert.match(result,/UPDATE public\.campaign_daily_draws SET status='completed'/);
 assert.match(result,/case|CASE/);
 assert.match(result,/approved\.updated_at<=a\.activated_at/);
 assert.doesNotMatch(result,/UPDATE public\.rifas\s+SET/i);
});
test('Los procedimientos SQL nuevos son solo para el servidor y no los clientes públicos',()=>{
 assert.match(result,/REVOKE ALL ON FUNCTION public\.admin_daily_draw_record_result_atomic/);
 assert.match(result,/TO service_role/);
 assert.match(activation,/REVOKE ALL ON FUNCTION public\.enforce_daily_activation_integrity/);
 assert.doesNotMatch(result,/\bDROP\s+TABLE\b|\bTRUNCATE\b/);
});
