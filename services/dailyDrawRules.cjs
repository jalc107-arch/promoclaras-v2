"use strict";

// Motor puro, sin BD ni efectos secundarios. No está conectado a las rutas de producción.
// Proveedor 'sinuano_noche': una combinación EXACTA de 4 cifras por jornada.
const { createHash } = require("node:crypto");
const PROVIDER = "loteria_sinuano_noche";
const MODALITY = "loteria_4_pleno";

function parseInstant(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`${field}: fecha-hora ISO con zona obligatoria`);
  }
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) throw new Error(`${field}: fecha-hora inválida`);
  return dt.getTime();
}

function parseCombination(value) {
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) {
    throw new Error("Resultado/código inválido: deben ser exactamente cuatro dígitos (0000-9999)");
  }
  return value;
}

function validateDraw(draw) {
  if (draw?.provider !== PROVIDER || draw?.mode !== MODALITY) throw new Error("Proveedor o modalidad diaria no admitidos");
  const cutoff = parseInstant(draw.cutoff_at, "cutoff_at");
  const scheduled = parseInstant(draw.scheduled_at, "scheduled_at");
  if (cutoff > scheduled) throw new Error("El cierre no puede ocurrir después del sorteo");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draw.draw_date || "")) throw new Error("Fecha de sorteo inválida");
  if (!draw.campaign_id) throw new Error("Falta identificador de campaña");
  return { cutoff, scheduled };
}

function eligibleForDraw(ticket, activation, draw) {
  const { cutoff } = validateDraw(draw);
  if (ticket?.campaign_id !== draw.campaign_id || activation?.campaign_id !== draw.campaign_id || activation?.ticket_id !== ticket.id) return false;
  if (!activation.payment_id || !activation.order_id || activation.payment_verified !== true || activation.payment_status !== "paid") return false; // verificación externa y pago íntegro obligatorios
  parseCombination(ticket.combination);
  const start = parseInstant(activation.activated_at, "activated_at");
  if (start > cutoff) return false;
  if (activation.revoked_at) {
    const revoked = parseInstant(activation.revoked_at, "revoked_at");
    if (revoked <= cutoff) return false;
  }
  return true;
}

function previewDailyResult(draw, tickets, activations) {
  validateDraw(draw);
  const result = parseCombination(draw.official_result);
  if (!draw.official_result_reference || !draw.verified_by) throw new Error("El resultado necesita referencia verificable y administrador responsable");
  if (!Array.isArray(tickets) || !Array.isArray(activations)) throw new Error("Datos inválidos");
  const byTicket = new Map();
  for (const activation of activations) {
    if (byTicket.has(activation.ticket_id)) throw new Error("Activación duplicada: bloquear publicación");
    byTicket.set(activation.ticket_id, activation);
  }
  const eligible = tickets.filter(t => eligibleForDraw(t, byTicket.get(t.id), draw));
  const combinations = new Set();
  for (const ticket of eligible) {
    if (combinations.has(ticket.combination)) throw new Error("Número elegible duplicado: bloquear adjudicación");
    combinations.add(ticket.combination);
  }
  const winners = eligible.filter(t => t.combination === result);
  if (winners.length > 1) throw new Error("Más de un ganador: bloquear adjudicación");
  const ids = eligible.map(t => String(t.id)).sort();
  return Object.freeze({
    campaign_id: draw.campaign_id,
    draw_date: draw.draw_date,
    result,
    winner_ticket_id: winners[0]?.id || null,
    eligible_count: eligible.length,
    eligibility_digest: createHash("sha256").update(ids.join("\n")).digest("hex"),
    outcome: winners.length === 1 ? "winner" : "no_winner"
  });
}

module.exports = { PROVIDER, MODALITY, validateDraw, eligibleForDraw, previewDailyResult, parseCombination };
