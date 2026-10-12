import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInstallmentReversalState,
  matchesApprovedWompiTransaction
} from "../services/wompiPaymentStateService.js";

test("solo acepta una anulacion de la misma transaccion aprobada", () => {
  assert.equal(matchesApprovedWompiTransaction({
    approvedTransactionId: "txn_aprobada_123",
    incomingTransactionId: "txn_aprobada_123"
  }), true);

  assert.equal(matchesApprovedWompiTransaction({
    approvedTransactionId: "txn_aprobada_123",
    incomingTransactionId: "txn_otro_intento"
  }), false);

  assert.equal(matchesApprovedWompiTransaction({
    approvedTransactionId: "",
    incomingTransactionId: "txn_aprobada_123"
  }), false);
});

test("recalcula una orden con una cuota aprobada restante", () => {
  const state = buildInstallmentReversalState({
    totalAmount: 60000,
    schedules: [
      { status: "approved", amount: 30000 },
      { status: "pending", amount: 30000 }
    ]
  });

  assert.deepEqual(state, {
    approvedInstallments: 1,
    amountPaid: 30000,
    balanceDue: 30000,
    hasApprovedInstallments: true,
    planStatus: "active",
    orderStatus: "partially_paid"
  });
});

test("regresa el plan a primera cuota cuando no queda ningún pago aprobado", () => {
  const state = buildInstallmentReversalState({
    totalAmount: 40000,
    schedules: [
      { status: "pending", amount: 20000 },
      { status: "pending", amount: 20000 }
    ]
  });

  assert.deepEqual(state, {
    approvedInstallments: 0,
    amountPaid: 0,
    balanceDue: 40000,
    hasApprovedInstallments: false,
    planStatus: "pending_first",
    orderStatus: "created"
  });
});
