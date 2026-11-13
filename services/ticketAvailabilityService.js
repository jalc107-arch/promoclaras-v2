// Availability policy for ticket assignment.
// Never recycle historical ticket identifiers (ticket_code): they are unique for
// the lifetime of a campaign and must remain traceable across order histories.
// A combination may be reused only after its previous ticket has been released.
const LIVE_STATUSES = new Set(["active", "reserved_installment"]);

export function buildTicketAvailability(tickets = []) {
  const usedTicketCodes = new Set();
  const usedCombinations = new Set();

  for (const ticket of tickets) {
    if (ticket?.ticket_code != null) {
      usedTicketCodes.add(String(ticket.ticket_code));
    }
    if (LIVE_STATUSES.has(ticket?.status) && ticket?.combination != null) {
      usedCombinations.add(String(ticket.combination));
    }
  }
  return { usedTicketCodes, usedCombinations };
}
