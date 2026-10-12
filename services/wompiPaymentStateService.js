export function matchesApprovedWompiTransaction({
  approvedTransactionId,
  incomingTransactionId
}) {
  const approved = String(approvedTransactionId || "").trim();
  const incoming = String(incomingTransactionId || "").trim();

  return Boolean(approved && incoming && approved === incoming);
}

export function buildInstallmentReversalState({ schedules, totalAmount }) {
  const approvedSchedules = (Array.isArray(schedules) ? schedules : [])
    .filter(item => item?.status === "approved");
  const amountPaid = approvedSchedules.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );
  const balanceDue = Math.max(0, Number(totalAmount || 0) - amountPaid);
  const hasApprovedInstallments = approvedSchedules.length > 0;

  return {
    approvedInstallments: approvedSchedules.length,
    amountPaid,
    balanceDue,
    hasApprovedInstallments,
    planStatus: hasApprovedInstallments ? "active" : "pending_first",
    orderStatus: hasApprovedInstallments ? "partially_paid" : "created"
  };
}
