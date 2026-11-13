import test from "node:test";
import assert from "node:assert/strict";
import { buildTicketAvailability } from "../services/ticketAvailabilityService.js";

test("historical ticket identifiers remain unavailable after release", () => {
  const used = buildTicketAvailability([
    { ticket_code: "0016", combination: "721", status: "released" },
    { ticket_code: "0017", combination: "643", status: "active" },
    { ticket_code: "0018", combination: "555", status: "reserved_installment" }
  ]);
  assert.deepEqual([...used.usedTicketCodes].sort(), ["0016", "0017", "0018"]);
});

test("only active and installment-reserved combinations block a new assignment", () => {
  const used = buildTicketAvailability([
    { ticket_code: "0055", combination: "327", status: "released" },
    { ticket_code: "0017", combination: "643", status: "active" },
    { ticket_code: "0018", combination: "555", status: "reserved_installment" }
  ]);
  assert.equal(used.usedCombinations.has("327"), false);
  assert.equal(used.usedCombinations.has("643"), true);
  assert.equal(used.usedCombinations.has("555"), true);
});

test("empty history produces no occupied codes", () => {
  const used = buildTicketAvailability();
  assert.equal(used.usedTicketCodes.size, 0);
  assert.equal(used.usedCombinations.size, 0);
});
