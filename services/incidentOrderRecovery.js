// One-time incident repair. Remove its startup hook after verifying the two orders.
// Never infer payment approval from local rows alone; query Wompi directly.
export const incidentOrders20261113 = Object.freeze([
  { id: "0468cd94-5dc8-4a40-8745-9c2aff713123", combination: "327" },
  { id: "e9abca39-3dea-4e73-b9f3-50a2723ade3c", combination: "172" }
]);

export function isVerifiedWompiRecovery({ transaction, transactionId, payment, expectedAmount = 20000 }) {
  return payment?.status === "approved"
    && payment?.provider === "wompi"
    && !!transactionId
    && String(payment?.provider_transaction_id || "") === transactionId
    && String(transaction?.id || "") === transactionId
    && String(transaction?.status || "") === "APPROVED"
    && String(transaction?.reference || "") === String(payment?.external_reference || "")
    && String(transaction?.currency || "") === "COP"
    && Number(transaction?.amount_in_cents) === expectedAmount * 100;
}

export async function recoverIncidentOrders({
  supabase, wompiPrivateKey, wompiPublicKey, finalizePaidOrder,
  sendOrderCouponsWhatsApp, processReferralReward, getTransaction = fetch,
  targets = incidentOrders20261113, log = console.log, reportError = console.error
}) {
  if (!wompiPrivateKey || !wompiPublicKey || wompiPublicKey.startsWith("pub_test_")) {
    log("incident-recovery: skipped, production Wompi credentials unavailable");
    return [];
  }

  const outcomes = [];
  for (const target of targets) {
    const label = String(target.id).slice(0, 8);
    try {
      const { data: order, error: orderError } = await supabase.from("orders")
        .select("id,payment_status,whatsapp_sent,qty,selected_numbers")
        .eq("id", target.id).maybeSingle();
      if (orderError) throw orderError;
      if (!order || Number(order.qty) !== 1 ||
          !Array.isArray(order.selected_numbers) ||
          order.selected_numbers.length !== 1 ||
          String(order.selected_numbers[0]) !== target.combination) {
        outcomes.push({ order: label, state: "order_mismatch" });
        continue;
      }
      if (order.payment_status === "paid" && order.whatsapp_sent === true) {
        outcomes.push({ order: label, state: "already_completed" });
        continue;
      }
      const { data: payment, error: paymentError } = await supabase.from("payments")
        .select("status,provider,provider_transaction_id,external_reference,amount")
        .eq("order_id", order.id).order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (paymentError) throw paymentError;
      const transactionId = String(payment?.provider_transaction_id || "");
      if (!payment || payment.status !== "approved" ||
          !/^[A-Za-z0-9_-]{1,100}$/.test(transactionId)) {
        outcomes.push({ order: label, state: "payment_not_verified" });
        continue;
      }
      const response = await getTransaction(
        `https://production.wompi.co/v1/transactions/${encodeURIComponent(transactionId)}`,
        { headers: { Authorization: `Bearer ${wompiPrivateKey}` }, signal: AbortSignal.timeout(20000) }
      );
      if (!response.ok) {
        outcomes.push({ order: label, state: "wompi_unreachable" });
        continue;
      }
      const wompiJson = await response.json();
      if (!isVerifiedWompiRecovery({
        transaction: wompiJson?.data,
        transactionId,
        payment,
        expectedAmount: Number(payment.amount)
      }) || Number(payment.amount) !== 20000) {
        outcomes.push({ order: label, state: "wompi_mismatch" });
        continue;
      }

      if (order.payment_status !== "paid") {
        await finalizePaidOrder(order.id);
      }

      const { data: updatedOrder, error: updatedError } = await supabase.from("orders")
        .select("payment_status,whatsapp_sent,qty,total_paid")
        .eq("id", order.id).maybeSingle();
      if (updatedError) throw updatedError;
      const { data: activeTickets, error: ticketsError } = await supabase.from("tickets")
        .select("id,combination")
        .eq("order_id", order.id).eq("status", "active");
      if (ticketsError) throw ticketsError;
      if (updatedOrder?.payment_status !== "paid" ||
          Number(updatedOrder.total_paid) !== 20000 ||
          (activeTickets || []).length !== Number(order.qty) ||
          !activeTickets.some(t => String(t.combination) === target.combination)) {
        throw new Error("Order did not pass post-finalization consistency checks");
      }

      if (!updatedOrder.whatsapp_sent) {
        await sendOrderCouponsWhatsApp(order.id);
      }
      if (order.payment_status !== "paid") {
        await processReferralReward(order.id);
      }
      const { data: after, error: afterError } = await supabase.from("orders")
        .select("payment_status,whatsapp_sent")
        .eq("id", order.id).maybeSingle();
      if (afterError) throw afterError;
      outcomes.push({ order: label, state: after?.whatsapp_sent ? "delivered" : "paid_whatsapp_pending" });
    } catch (err) {
      reportError("incident-recovery failed for order " + label + ": " + String(err?.message || err));
      outcomes.push({ order: label, state: "error" });
    }
  }
  outcomes.forEach(row => log("incident-recovery " + row.order + " " + row.state));
  return outcomes;
}
