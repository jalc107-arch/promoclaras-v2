import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../migrations/20261018_staging_daily_commerce_gate.sql',import.meta.url),'utf8');
test('La base de datos deshabilita ventas por defecto independientemente de la interfaz',()=>{
 assert.match(script,/sales_enabled boolean NOT NULL DEFAULT false/);
 assert.match(script,/VALUES\(true,false,/);
 assert.match(script,/Sinuano deshabilitado por control independiente/);
});
test('Ningun usuario publico puede cambiar el control de comercializacion',()=>{
 assert.match(script,/ENABLE ROW LEVEL SECURITY/);
 assert.match(script,/REVOKE ALL ON TABLE public\.campaign_daily_commerce_controls/);
 assert.match(script,/FROM PUBLIC,anon,authenticated/);
});
