// Recovery only after a server-side Wompi GET verified transaction reference, amount and currency.
export function shouldReconcileVerifiedApprovedPayment({ verifiedStatus, verifiedTransactionId, paymentStatus, recordedTransactionId, orderStatus }) {
  return verifiedStatus === "APPROVED" && paymentStatus === "approved"
    && !!verifiedTransactionId && recordedTransactionId === verifiedTransactionId && orderStatus !== "paid";
}
export function shouldResendVerifiedOrderWhatsApp({ verifiedStatus, verifiedTransactionId, paymentStatus, recordedTransactionId, orderStatus, whatsappSent }) {
  return verifiedStatus === "APPROVED" && paymentStatus === "approved" && !!verifiedTransactionId
    && recordedTransactionId === verifiedTransactionId && orderStatus === "paid" && whatsappSent !== true;
}
