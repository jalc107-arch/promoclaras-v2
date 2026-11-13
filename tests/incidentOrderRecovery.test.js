import test from "node:test";
import assert from "node:assert/strict";
import { isVerifiedWompiRecovery } from "../services/incidentOrderRecovery.js";
const payment = {status:"approved",provider:"wompi",provider_transaction_id:"txn123",external_reference:"ord_abc",amount:20000};
const transaction = {id:"txn123",status:"APPROVED",reference:"ord_abc",amount_in_cents:2000000,currency:"COP"};
const verify = (p=payment,t=transaction) => isVerifiedWompiRecovery({payment:p,transaction:t,transactionId:"txn123",expectedAmount:20000});
test("only approved matching Wompi payment qualifies for recovery",()=>assert.equal(verify(),true));
test("reject mismatched transaction, currency, amount or reference",()=>{
  for (const patch of [{id:"other"},{status:"VOIDED"},{amount_in_cents:10000},{reference:"bad"},{currency:"USD"}]) assert.equal(verify(payment,{...transaction,...patch}),false);
});
test("reject local-only paid status without exact provider transaction",()=>{
  assert.equal(verify({...payment,provider_transaction_id:null}),false);
  assert.equal(verify({...payment,status:"pending"}),false);
  assert.equal(verify({...payment,provider:"manual"}),false);
});
