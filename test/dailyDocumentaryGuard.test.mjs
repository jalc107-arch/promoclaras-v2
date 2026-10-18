import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/20261018_staging_daily_documentary_approval_guard.sql',import.meta.url),'utf8');
const admin=readFileSync(new URL('../services/dailyDrawAdmin.mjs',import.meta.url),'utf8');
test('No se confunde una referencia manual con autorización jurídica',()=>{
 assert.match(sql,/Documentación regulatoria no verificada externamente/);
 assert.match(sql,/Autorización Wompi no verificada externamente/);
 assert.match(sql,/Expediente diario sin doble desbloqueo documental externo/);
});
test('Doble puerta documental independiente del estado comercial',()=>{
 assert.match(sql,/regulatory_review_unlocked boolean NOT NULL DEFAULT false/);
 assert.match(sql,/processor_review_unlocked boolean NOT NULL DEFAULT false/);
 assert.match(sql,/BEFORE INSERT OR UPDATE ON public.daily_draw_campaign_authorizations/);
});
test('No permite al usuario o al backend desbloquear directamente la tabla',()=>{
 assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(admin,/return res.status\(403\).send\('Sin validación externa/);
 assert.match(admin,/<option value="approved" disabled>/);
});
