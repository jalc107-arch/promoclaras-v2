import { INFOGRAPHIC_CODE_STATUSES } from "../../services/campaignAvailabilityService.js";

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

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

function updatedAt(value) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function prizeText(model) {
  if (model.prizeAmount > 0) return moneyCOP(model.prizeAmount);
  return model.prizeTitle;
}

function infographicTitle(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòùÇç $&'().,#%+\-/]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function fitFontSize(value, preferred, minimum, threshold) {
  const length = String(value || "").length;
  if (length <= threshold) return preferred;
  return Math.max(minimum, Math.floor(preferred * threshold / length));
}

function cellPalette(status) {
  if (status === INFOGRAPHIC_CODE_STATUSES.AVAILABLE) {
    return { fill: "#dcfce7", stroke: "#86efac", text: "#14532d", marker: "" };
  }
  if (status === INFOGRAPHIC_CODE_STATUSES.RESERVED) {
    return { fill: "#fef3c7", stroke: "#f59e0b", text: "#92400e", marker: "R" };
  }
  if (status === INFOGRAPHIC_CODE_STATUSES.INSTALLMENT_RESERVED) {
    return { fill: "#ffedd5", stroke: "#fb923c", text: "#9a3412", marker: "C" };
  }
  return { fill: "#ffe4e6", stroke: "#fb7185", text: "#9f1239", marker: "X" };
}

export function renderInfographicSvg({ model, sheet, sheetCount, theme, qrDataUrl = null }) {
  const width = 1080;
  const height = 1920;
  const columns = 10;
  const cellWidth = 92;
  const cellHeight = 42;
  const gapX = 7;
  const gapY = 8;
  const gridX = 49;
  const gridY = 570;
  const renderedTitle = infographicTitle(model.name);
  const renderedPrize = prizeText(model);
  const titleFontSize = fitFontSize(renderedTitle, 42, 28, 34);
  const prizeFontSize = fitFontSize(renderedPrize, 68, 34, 24);

  const cells = sheet.codes.map((item, position) => {
    const column = position % columns;
    const row = Math.floor(position / columns);
    const x = gridX + column * (cellWidth + gapX);
    const y = gridY + row * (cellHeight + gapY);
    const palette = cellPalette(item.status);
    const marker = palette.marker
      ? `<circle cx="${x + 78}" cy="${y + 11}" r="9" fill="${palette.stroke}"/><text x="${x + 78}" y="${y + 15}" text-anchor="middle" font-size="11" font-weight="900" fill="#ffffff">${palette.marker}</text>`
      : "";

    return `<g>
      <rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="10" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="2"/>
      <text x="${x + cellWidth / 2}" y="${y + 28}" text-anchor="middle" font-size="23" font-weight="800" fill="${palette.text}">${escapeXml(item.code)}</text>
      ${marker}
    </g>`;
  }).join("");

  const installmentText = model.allowsInstallments && model.maxInstallments > 1
    ? `Paga hasta en ${model.maxInstallments} cuotas`
    : "Pago seguro en CampaClick";

  const qrBlock = qrDataUrl
    ? `<rect x="55" y="1715" width="142" height="142" rx="16" fill="#ffffff"/>
       <image x="64" y="1724" width="124" height="124" href="${escapeXml(qrDataUrl)}"/>`
    : "";
  const footerX = qrDataUrl ? 225 : 540;
  const footerAnchor = qrDataUrl ? "start" : "middle";

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <style>
        text { font-family: "DejaVu Sans", sans-serif; }
      </style>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${theme.background}"/>
        <stop offset="1" stop-color="${theme.surface}"/>
      </linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-opacity="0.25"/></filter>
    </defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <circle cx="950" cy="120" r="250" fill="${theme.primary}" opacity="0.16"/>
    <circle cx="80" cy="1770" r="240" fill="${theme.accent}" opacity="0.12"/>

    <text x="540" y="126" text-anchor="middle" font-family="DejaVu Sans" font-size="${titleFontSize}" font-weight="900" fill="${theme.text}">${escapeXml(renderedTitle)}</text>
    <text x="540" y="190" text-anchor="middle" font-family="DejaVu Sans" font-size="28" font-weight="700" fill="${theme.accent}">PREMIO</text>
    <text x="540" y="270" text-anchor="middle" font-family="DejaVu Sans" font-size="${prizeFontSize}" font-weight="900" fill="${theme.text}">${escapeXml(renderedPrize)}</text>

    <g filter="url(#shadow)">
      <rect x="55" y="320" width="970" height="150" rx="28" fill="#ffffff" opacity="0.97"/>
    </g>
    <text x="95" y="370" font-family="DejaVu Sans" font-size="24" font-weight="800" fill="#0f172a">${escapeXml(dateInBogota(model.drawDate))}</text>
    <text x="95" y="414" font-family="DejaVu Sans" font-size="22" fill="#334155">${escapeXml(model.lotteryName)} - ${escapeXml(model.drawMechanism)}</text>
    <text x="985" y="370" text-anchor="end" font-family="DejaVu Sans" font-size="30" font-weight="900" fill="${theme.primary}">${escapeXml(moneyCOP(model.codePrice))}</text>
    <text x="985" y="414" text-anchor="end" font-family="DejaVu Sans" font-size="19" fill="#475569">por código</text>

    <text x="55" y="525" font-family="DejaVu Sans" font-size="26" font-weight="900" fill="${theme.text}">NÚMEROS ${escapeXml(sheet.startCode)} - ${escapeXml(sheet.endCode)}</text>
    <text x="1025" y="525" text-anchor="end" font-family="DejaVu Sans" font-size="22" font-weight="700" fill="${theme.accent}">LÁMINA ${sheet.index + 1} DE ${sheetCount}</text>

    ${cells}

    <g transform="translate(55 1605)">
      <rect width="970" height="82" rx="20" fill="#ffffff" opacity="0.96"/>
      <circle cx="42" cy="41" r="14" fill="#22c55e"/><text x="68" y="49" font-family="DejaVu Sans" font-size="22" font-weight="800" fill="#14532d">DISPONIBLE</text>
      <circle cx="270" cy="41" r="14" fill="#fb7185"/><text x="296" y="49" font-family="DejaVu Sans" font-size="22" font-weight="800" fill="#9f1239">VENDIDO</text>
      <circle cx="500" cy="41" r="14" fill="#f59e0b"/><text x="526" y="49" font-family="DejaVu Sans" font-size="22" font-weight="800" fill="#92400e">RESERVADO</text>
      <text x="930" y="49" text-anchor="end" font-family="DejaVu Sans" font-size="21" font-weight="900" fill="#0f172a">${sheet.availableCount} disponibles aquí</text>
    </g>

    ${qrBlock}
    <text x="${footerX}" y="1750" text-anchor="${footerAnchor}" font-family="DejaVu Sans" font-size="28" font-weight="900" fill="${theme.accent}">${escapeXml(installmentText)}</text>
    <text x="${footerX}" y="1800" text-anchor="${footerAnchor}" font-family="DejaVu Sans" font-size="24" font-weight="800" fill="${theme.text}">PARTICIPA AHORA</text>
    <text x="${footerX}" y="1840" text-anchor="${footerAnchor}" font-family="DejaVu Sans" font-size="18" fill="${theme.text}">${escapeXml(model.publicUrl)}</text>
    <text x="540" y="1882" text-anchor="middle" font-family="DejaVu Sans" font-size="15" fill="${theme.text}" opacity="0.72">Disponibilidad actualizada: ${escapeXml(updatedAt(model.generatedAt))}</text>
  </svg>`;
}
