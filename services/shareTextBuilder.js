function moneyCOP(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function dateInBogota(value) {
  const raw = String(value || "").slice(0, 10);
  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) return raw;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function buildShareText(model) {
  const prize = model.prizeAmount > 0 ? moneyCOP(model.prizeAmount) : model.prizeTitle;
  const lines = [
    `✨ ${model.name.toUpperCase()} ✨`,
    "",
    `💰 Premio: ${prize}`,
    `🎟 Valor por código: ${moneyCOP(model.codePrice)}`,
    `🔢 ${model.availableCount} números disponibles.`,
    ""
  ];

  if (model.allowsInstallments && model.maxInstallments > 1) {
    lines.push(`💳 Puedes pagar hasta en ${model.maxInstallments} cuotas.`, "");
  }

  lines.push(
    `📅 Sorteo: ${dateInBogota(model.drawDate)}`,
    `🎯 Modalidad: ${model.drawMechanism} de ${model.lotteryName}.`,
    "",
    `👉 Participa aquí: ${model.publicUrl}`
  );

  return lines.join("\n");
}
