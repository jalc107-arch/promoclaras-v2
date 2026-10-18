import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../migrations/20261018_staging_daily_reversal_reconciliation_guard.sql',import.meta.url),'utf8');
test('La conciliacion detiene pago revertido o fuente inconsistente',()=>{
 assert.match(sql,/p\.status IS DISTINCT FROM 'approved'/);
 assert.match(sql,/Conciliacion diaria pendiente: pago revertido o activacion inconsistente/);
});
test('No declara sin ganador si la orden aun paid ya no concilia con Wompi',()=>{
 assert.match(sql,/o\.payment_status='paid'/);
 assert.match(sql,/p\.updated_at<=NEW\.cutoff_at/);
 assert.match(sql,/Conciliacion diaria pendiente: orden pagada sin Wompi conciliado/);
});
test('El trigger solo entra al completar una jornada de Sinuano',()=>{
 assert.match(sql,/NEW\.status IS DISTINCT FROM 'completed'/);
 assert.match(sql,/OLD\.status='completed'/);
 assert.match(sql,/r\.draw_provider='loteria_sinuano_noche'/);
 assert.match(sql,/CREATE TRIGGER trg_daily_result_reconciliation/);
});
test('Migracion aditiva, sin cambios en pagos y sin nuevas facultades publicas',()=>{
 assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP\s+TABLE\b|UPDATE\s+public\.(payments|orders|rifas)\b/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.enforce_daily_draw_payment_reconciliation/);
});
