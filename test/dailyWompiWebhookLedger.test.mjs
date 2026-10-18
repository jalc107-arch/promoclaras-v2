import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleSignedDailyWompiEvent} from '../services/dailyWompiWebhookLedger.mjs';

const payment={id:'p1',order_id:'o1',orders:{rifa_id:'r1'},installment_id:null};
const event={payment,status:'APPROVED',transactionId:'sandbox-t1',
 checksum:'a'.repeat(64),environment:'test',timestamp:1792300000};
function db(provider='loteria_sinuano_noche') {
 const x={calls:[],from(t){this.calls.push(['from',t]);return this;},
 select(){return this;},eq(){return this;},
 async maybeSingle(){return {data:{draw_provider:provider,draw_mode:'loteria_4_pleno'},error:null}},
 async rpc(name,params){this.calls.push(['rpc',name,params]);return {data:[{id:'fixture'}],error:null}}};
 return x;
}
const names=x=>x.calls.filter(r=>r[0]==='rpc').map(r=>r[1]);
test('Webhook traditional bypasses daily ledger',async()=>{
 const conn=db('loteria_boyaca');
 assert.equal(await handleSignedDailyWompiEvent({supabase:conn,...event}),null);
 assert.deepEqual(names(conn),[]);
});
test('Daily APPROVED is blocked when commercial switch is off',async()=>{
 const conn=db();let r=await handleSignedDailyWompiEvent({supabase:conn,...event});
 assert.equal(r.denied,true);assert.deepEqual(names(conn),[]);
});
test('Verified daily APPROVED writes one event through service-only RPC',async()=>{
 const conn=db();let r=await handleSignedDailyWompiEvent({supabase:conn,...event,salesEnabled:true});
 assert.equal(r.recorded,true);
 assert.deepEqual(names(conn),['system_daily_record_verified_wompi_event']);
});
test('VOIDED records signed event before atomic ticket revocation',async()=>{
 const conn=db();let r=await handleSignedDailyWompiEvent({supabase:conn,...event,status:'VOIDED'});
 assert.equal(r.voided,true);
 assert.deepEqual(names(conn),['system_daily_record_verified_wompi_event','system_daily_void_full_payment_atomic']);
});
test('No RPC for malformed checksum or environment',async()=>{
 const conn=db();
 await assert.rejects(()=>handleSignedDailyWompiEvent({supabase:conn,...event,status:'VOIDED',checksum:'bad'}),/firmada incompleta/);
 await assert.rejects(()=>handleSignedDailyWompiEvent({supabase:conn,...event,status:'VOIDED',environment:'prod'}),/firmada incompleta/);
 assert.deepEqual(names(conn),[]);
});
test('Pending does not change daily ledger or payments',async()=>{
 const conn=db();let r=await handleSignedDailyWompiEvent({supabase:conn,...event,status:'PENDING'});
 assert.equal(r.ignored,true);assert.deepEqual(names(conn),[]);
});
test('Index calls the bridge after checksum, amount and currency verification',()=>{
 const src=readFileSync(new URL('../index.js',import.meta.url),'utf8');
 const offset=src.indexOf('const dailyEvent = await handleSignedDailyWompiEvent(');
 const start=src.indexOf('app.post("/webhooks/wompi"');
 assert.ok(offset>start);
 assert.ok(src.indexOf('const validSignature = safeCompare(checksumFromData, expectedChecksum)',start)<offset);
 assert.ok(src.indexOf('if (transactionAmountInCents !== expectedAmountInCents)',start)<offset);
 assert.ok(src.indexOf('if (transactionCurrency !== "COP")',start)<offset);
});
