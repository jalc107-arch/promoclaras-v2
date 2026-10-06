import crypto from "crypto";

export const INFOGRAPHIC_CODE_STATUSES = Object.freeze({
  AVAILABLE: "AVAILABLE",
  SOLD: "SOLD",
  RESERVED: "RESERVED",
  INSTALLMENT_RESERVED: "INSTALLMENT_RESERVED"
});

export function getLotteryDigitsByDrawMode(drawMode) {
  if (["loteria_2_primeras", "loteria_2_ultimas"].includes(drawMode)) return 2;
  if (["loteria_3_primeras", "loteria_3_ultimas"].includes(drawMode)) return 3;
  if (drawMode === "loteria_4_pleno") return 4;
  return 0;
}

export function getAllLotteryNumbersByDrawMode(drawMode) {
  const digits = getLotteryDigitsByDrawMode(drawMode);
  if (!digits) return [];

  return Array.from(
    { length: 10 ** digits },
    (_, value) => String(value).padStart(digits, "0")
  );
}

function normalizeCode(value, digits) {
  const clean = String(value ?? "").trim();
  if (!/^\d+$/.test(clean) || clean.length > digits) return null;
  return clean.padStart(digits, "0");
}

export function buildAvailabilitySnapshot({ campaign, tickets = [], reservations = [], generatedAt }) {
  const campaignId = campaign?.id;
  const digits = getLotteryDigitsByDrawMode(campaign?.draw_mode);
  if (!campaignId || !digits) throw new Error("Campaña de lotería inválida.");

  const statusByCode = new Map();
  const unknownCodes = [];
  const duplicateCodes = new Set();

  for (const ticket of tickets) {
    const code = normalizeCode(ticket.combination, digits);
    if (!code) {
      unknownCodes.push(String(ticket.combination ?? ""));
      continue;
    }
    if (statusByCode.has(code)) duplicateCodes.add(code);
    statusByCode.set(
      code,
      ticket.status === "reserved_installment"
        ? INFOGRAPHIC_CODE_STATUSES.INSTALLMENT_RESERVED
        : INFOGRAPHIC_CODE_STATUSES.SOLD
    );
  }

  for (const reservation of reservations) {
    const code = normalizeCode(reservation.selected_number, digits);
    if (!code) {
      unknownCodes.push(String(reservation.selected_number ?? ""));
      continue;
    }
    if (statusByCode.has(code)) duplicateCodes.add(code);
    if (!statusByCode.has(code)) statusByCode.set(code, INFOGRAPHIC_CODE_STATUSES.RESERVED);
  }

  const codes = getAllLotteryNumbersByDrawMode(campaign.draw_mode).map(code => ({
    code,
    status: statusByCode.get(code) || INFOGRAPHIC_CODE_STATUSES.AVAILABLE
  }));
  const availableCodes = codes.filter(item => item.status === INFOGRAPHIC_CODE_STATUSES.AVAILABLE);
  const nonAvailableCodes = codes.filter(item => item.status !== INFOGRAPHIC_CODE_STATUSES.AVAILABLE);
  const availabilityVersion = crypto
    .createHash("sha256")
    .update(codes.map(item => `${item.code}:${item.status}`).join("|"))
    .digest("hex")
    .slice(0, 16);

  return {
    campaignId,
    digits,
    totalCodes: codes.length,
    codes,
    availableCodes,
    nonAvailableCodes,
    unknownCodes,
    duplicateCodes: [...duplicateCodes],
    availabilityVersion,
    generatedAt
  };
}

async function fetchAllRows(buildQuery, pageSize = 1000) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export function createCampaignAvailabilityService({
  supabase,
  now = () => new Date(),
  logger = console
}) {
  if (!supabase) throw new Error("Supabase es obligatorio para consultar disponibilidad.");

  async function releaseExpiredLotteryReservations() {
    const { error } = await supabase
      .from("lottery_number_reservations")
      .update({ status: "expired" })
      .eq("status", "reserved")
      .lt("expires_at", now().toISOString());

    if (error) {
      logger.error("Error liberando reservas vencidas:", error);
      return { ok: false };
    }

    return { ok: true };
  }

  async function getCampaignAvailability(campaign) {
    const campaignId = campaign?.id;
    const digits = getLotteryDigitsByDrawMode(campaign?.draw_mode);

    if (!campaignId) throw new Error("La campaña es obligatoria.");
    if (!digits) throw new Error("La disponibilidad por número solo aplica a campañas de lotería.");

    await releaseExpiredLotteryReservations();

    const [tickets, reservations] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from("tickets")
          .select("combination, status")
          .eq("rifa_id", campaignId)
          .in("status", ["active", "reserved_installment"])
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from("lottery_number_reservations")
          .select("selected_number, status, expires_at")
          .eq("rifa_id", campaignId)
          .eq("status", "reserved")
          .gt("expires_at", now().toISOString())
          .range(from, to)
      )
    ]);

    const generatedAt = now().toISOString();
    return buildAvailabilitySnapshot({ campaign, tickets, reservations, generatedAt });
  }

  return {
    getCampaignAvailability,
    releaseExpiredLotteryReservations
  };
}
