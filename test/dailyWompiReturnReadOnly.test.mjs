import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../index.js',import.meta.url),'utf8');
test('La ruta de retorno de una campaña diaria nunca liquida el pago por GET',()=>{
 const route=src.indexOf('app.get("/orden/:orderId"');
 const gate=src.indexOf('if (wompiTransactionId && isDailyCampaign(order.rifas))',route);
 const fetchWompi=src.indexOf('const wompiResponse = await fetch(wompiEndpoint.toString()',route);
 const mutation=src.indexOf('status: "approved",',route);
 assert.ok(route>0&&gate>route&&fetchWompi>gate&&mutation>gate);
 assert.match(src.slice(gate,fetchWompi),/return res.status\(202\)/);
});
test('El flujo existente de compra tradicional sigue consultando Wompi',()=>{
 assert.match(src,/const wompiResponse = await fetch\(wompiEndpoint\.toString\(\)/);
 assert.match(src,/await finalizePaidOrder\(orderId\)/);
});
