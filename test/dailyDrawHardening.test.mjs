import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activation = readFileSync(new URL('../migrations/20261017_staging_daily_activation_guard.sql', import.meta.url),'utf8');
const result = readFileSync(new URL('../migrations/20261017_staging_daily_result_atomic.sql', import.meta.url),'utf8');
const reconciliation = readFileSync(new URL('../migrations/20261018_staging_daily_missing_activation_fail_closed_20261017.sql', import.meta.url),'utf8');

test('La revocación de una activación es irreversible',()=>{
  assert.ok(activation.includes('IF OLD.revoked_at IS NOT NULL THEN'));
  assert.ok(activation.includes('Una revocación registrada no puede alterarse'));
  assert.ok(activation.includes('Solo se permite actualizar una activación para revocarla'));
});
test('Cada revocación exige motivo y genera evento auditable',()=>{
  assert.ok(activation.includes('activation_revoked'));
  assert.ok(activation.includes("'reason',NEW.revoked_reason"));
  assert.ok(activation.includes("length(btrim(coalesce(NEW.revoked_reason,''))) < 15"));
});
test('Nunca se adjudica premio diario sin definición firme y valor monetario',()=>{
  assert.ok(result.includes('Premio sin definir: no puede adjudicarse esta jornada'));
  assert.ok(result.includes('Premio monetario sin valor positivo confirmado'));
  assert.ok(result.includes("v_draw.prize_amount<=0"));
});
test('Resultado diario rechaza combinaciones inválidas o duplicadas',()=>{
  assert.ok(result.includes('count(DISTINCT combination)'));
  assert.ok(result.includes("combination !~ '^[0-9]{4}$'"));
  assert.ok(result.includes('v_duplicate_count>0 OR v_invalid_count>0'));
});
test('Faltantes de códigos y activaciones impiden anunciar un no ganador prematuro',()=>{
  assert.ok(reconciliation.includes('Conciliación diaria pendiente'));
  assert.ok(reconciliation.includes('count(*) FROM public.tickets'));
  assert.ok(reconciliation.includes('NOT EXISTS ('));
  assert.ok(reconciliation.includes('public.campaign_daily_ticket_activations'));
});
test('Sin comercialización accidental ni modificación de las campañas heredadas',()=>{
  assert.match(result,/WHERE id=p_draw_id FOR UPDATE/);
  assert.match(result,/REVOKE ALL ON FUNCTION public.admin_daily_draw_record_result_atomic/);
  assert.match(reconciliation,/TO service_role;/);
  for (const sql of [activation,result,reconciliation]) {
    assert.doesNotMatch(sql,/UPDATE\s+public\.rifas\s+SET|\bDROP\s+TABLE\b|\bTRUNCATE\b/i);
  }
});
