import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
const ledger=readFileSync(new URL('../migrations/20261018_staging_daily_wompi_verified_events.sql',import.meta.url),'utf8');
const voidSql=readFileSync(new URL('../migrations/20261018_staging_daily_wompi_void_atomic.sql',import.meta.url),'utf8');
test('Eventos Wompi cifrados por checksum, inmutables e idempotentes',()=>{
 assert.match(ledger,/event_checksum text NOT NULL/);
 assert.match(ledger,/UNIQUE\(payment_id,provider_transaction_id,event_status\)/);
 assert.match(ledger,/BEFORE UPDATE OR DELETE/);
 assert.match(ledger,/p_environment IS DISTINCT FROM 'test'/);
});
test('Nunca permite finalizar sin evidencia de APPROVED y rechaza VOIDED',()=>{
 assert.match(ledger,/Sin evidencia inmutable de Wompi APPROVED o pago ya VOIDED/);
 assert.match(ledger,/event_status='APPROVED'/);
 assert.match(ledger,/event_status='VOIDED'/);
});
test('Reverso revoca activaciones, libera códigos y actualiza pago y orden',()=>{
 assert.match(voidSql,/UPDATE public\.campaign_daily_ticket_activations/);
 assert.match(voidSql,/UPDATE public\.tickets SET status='released'/);
 assert.match(voidSql,/UPDATE public\.payments SET status='failed'/);
 assert.match(voidSql,/UPDATE public\.orders SET payment_status='failed'/);
 assert.match(voidSql,/event_status='VOIDED'/);
});
test('No se modifica ningún pago tradicional ni se habilita comercialización',()=>{
 assert.match(voidSql,/loteria_sinuano_noche/);
 assert.match(voidSql,/TO service_role/);
 assert.doesNotMatch(voidSql,/sales_enabled\s*=\s*true|DROP\s+TABLE|TRUNCATE/i);
});
