import { INFOGRAPHIC_CODE_STATUSES } from "../../services/campaignAvailabilityService.js";

const VALID_STATUSES = new Set(Object.values(INFOGRAPHIC_CODE_STATUSES));

export function validateInfographicData(model) {
  const errors = [];

  if (!model?.campaignId) errors.push("campaignId faltante");
  if (!model?.name) errors.push("nombre de campaña faltante");
  if (![2, 3, 4].includes(model?.digits)) errors.push("digits inválido");
  if (!Number.isFinite(model?.codePrice) || model.codePrice <= 0) errors.push("precio inválido");

  try {
    const url = new URL(model?.publicUrl || "");
    if (!/^https?:$/.test(url.protocol)) errors.push("URL pública inválida");
  } catch {
    errors.push("URL pública inválida");
  }

  const expectedTotal = Number(model?.endNumber) - Number(model?.startNumber) + 1;
  if (!Number.isInteger(expectedTotal) || expectedTotal <= 0) errors.push("rango inválido");
  if (!Array.isArray(model?.codes)) errors.push("códigos faltantes");

  const seen = new Set();
  for (const item of model?.codes || []) {
    if (!/^\d+$/.test(item.code) || item.code.length !== model.digits) {
      errors.push(`código inválido: ${item.code}`);
      continue;
    }
    if (seen.has(item.code)) errors.push(`código duplicado: ${item.code}`);
    seen.add(item.code);
    if (!VALID_STATUSES.has(item.status)) errors.push(`estado inválido: ${item.status}`);
  }

  if ((model?.unknownCodes || []).length > 0) errors.push("existen códigos desconocidos");
  if ((model?.duplicateCodes || []).length > 0) errors.push("existen códigos duplicados en disponibilidad");
  if ((model?.codes || []).length !== expectedTotal) errors.push("cantidad total inconsistente");
  if (Number(model?.totalCodes) !== expectedTotal) errors.push("totalCodes inconsistente");
  if (Number(model?.availableCount) + Number(model?.nonAvailableCount) !== Number(model?.totalCodes)) {
    errors.push("disponibles + no disponibles no coincide con el total");
  }

  if (errors.length) {
    const error = new Error("Encontramos una inconsistencia en la información de la campaña.");
    error.code = "INFOGRAPHIC_DATA_INVALID";
    error.details = errors;
    throw error;
  }

  return model;
}

export function validateRenderedSheet(sheet) {
  const expected = Number(sheet.endNumber) - Number(sheet.startNumber) + 1;
  if (sheet.codes.length !== expected) {
    throw new Error(`La lámina ${sheet.index + 1} no contiene ${expected} posiciones.`);
  }
  return sheet;
}
