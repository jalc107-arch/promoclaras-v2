import { INFOGRAPHIC_CODE_STATUSES } from "../../services/campaignAvailabilityService.js";

export function splitInfographicSheets(model, { maxCodesPerSheet = 200 } = {}) {
  if (model.digits >= 4 && model.totalCodes > 1000) {
    return {
      strategy: "range_required",
      sheets: [],
      suggestedOptions: ["custom_range", "last_available", "qr"]
    };
  }

  const sheets = [];

  for (let offset = 0; offset < model.codes.length; offset += maxCodesPerSheet) {
    const codes = model.codes.slice(offset, offset + maxCodesPerSheet);
    const availableCount = codes.filter(
      item => item.status === INFOGRAPHIC_CODE_STATUSES.AVAILABLE
    ).length;

    sheets.push({
      index: sheets.length,
      startNumber: Number(codes[0].code),
      endNumber: Number(codes[codes.length - 1].code),
      startCode: codes[0].code,
      endCode: codes[codes.length - 1].code,
      availableCount,
      nonAvailableCount: codes.length - availableCount,
      codes
    });
  }

  return { strategy: "automatic", sheets };
}
