import test from "node:test";
import assert from "node:assert/strict";
import { shouldReconcileVerifiedApprovedPayment, shouldResendVerifiedOrderWhatsApp } from "../services/wompiApprovedReconciliation.js";
const base = { verifiedStatus:"APPROVED",verifiedTransactionId:"valid-wompi-transaction",paymentStatus:"approved",recordedTransactionId:"valid-wompi-transaction",orderStatus:"created" };
test("matching verified approved transaction can reconcile pending order",()=>assert.equal(shouldReconcileVerifiedApprovedPayment(base),true));
test("mismatching, voided, declined or paid transactions cannot be reconciled",()=>{
  for (const patch of [{verifiedStatus:"VOIDED"},{verifiedStatus:"DECLINED"},{verifiedTransactionId:"other"},{recordedTransactionId:"other"},{orderStatus:"paid"},{paymentStatus:"pending"}]) assert.equal(shouldReconcileVerifiedApprovedPayment({...base,...patch}),false);
});
test("WhatsApp retry only on verified paid order without confirmed prior send",()=>{
  assert.equal(shouldResendVerifiedOrderWhatsApp({...base,orderStatus:"paid",whatsappSent:false}),true);
  assert.equal(shouldResendVerifiedOrderWhatsApp({...base,orderStatus:"paid",whatsappSent:true}),false);
  assert.equal(shouldResendVerifiedOrderWhatsApp({...base,orderStatus:"created",whatsappSent:false}),false);
});
