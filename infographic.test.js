import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  buildAvailabilitySnapshot,
  getAllLotteryNumbersByDrawMode,
  INFOGRAPHIC_CODE_STATUSES
} from "../services/campaignAvailabilityService.js";
import { splitInfographicSheets } from "../lib/infographic/sheetBuilder.js";
import { validateInfographicData, validateRenderedSheet } from "../lib/infographic/validators.js";
import { resolveTheme } from "../lib/infographic/themeEngine.js";
import { renderInfographicSvg } from "../lib/infographic/svgRenderer.js";
import { createValidatedQr } from "../services/qrService.js";
import { buildShareText } from "../services/shareTextBuilder.js";
import { createPromotionalContentService } from "../services/promotionalContentService.js";

function makeModel(drawMode = "loteria_3_primeras", unavailable = []) {
  const codes = getAllLotteryNumbersByDrawMode(drawMode);
  const digits = codes[0].length;
  const unavailableSet = new Set(unavailable);
  const mappedCodes = codes.map(code => ({
    code,
    status: unavailableSet.has(code)
      ? INFOGRAPHIC_CODE_STATUSES.SOLD
      : INFOGRAPHIC_CODE_STATUSES.AVAILABLE
  }));

  return {
    campaignId: "campaign-test",
    slug: "navidad-millonaria-2026",
    name: "NAVIDAD MILLONARIA 2026",
    description: "Campaña de Navidad",
    prizeTitle: "$4.000.000 en efectivo",
    prizeAmount: 4000000,
    drawDate: "2026-12-26",
    lotteryName: "Lotería de Boyacá",
    drawMechanism: "3 primeras cifras",
    digits,
    startNumber: 0,
    endNumber: codes.length - 1,
    codePrice: 20000,
    publicUrl: "https://www.promoclaras.com/campanas/navidad-millonaria-2026",
    allowsInstallments: true,
    maxInstallments: 2,
    totalCodes: codes.length,
    availableCount: codes.length - unavailableSet.size,
    nonAvailableCount: unavailableSet.size,
    codes: mappedCodes,
    unknownCodes: [],
    duplicateCodes: [],
    availabilityVersion: "test-version",
    generatedAt: "2026-10-03T13:36:00.000Z"
  };
}

test("genera 00-99 con padding y una lámina", () => {
  const numbers = getAllLotteryNumbersByDrawMode("loteria_2_primeras");
  assert.equal(numbers.length, 100);
  assert.equal(numbers[0], "00");
  assert.equal(numbers[5], "05");
  assert.equal(numbers[99], "99");

  const model = makeModel("loteria_2_primeras");
  validateInfographicData(model);
  const result = splitInfographicSheets(model);
  assert.equal(result.sheets.length, 1);
  assert.equal(result.sheets[0].codes.length, 100);
});

test("mapea exactamente ventas, cuotas y reservas temporales", () => {
  const snapshot = buildAvailabilitySnapshot({
    campaign: { id: "campaign-test", draw_mode: "loteria_3_primeras" },
    tickets: [
      { combination: "028", status: "active" },
      { combination: "685", status: "reserved_installment" }
    ],
    reservations: [
      { selected_number: "721", status: "reserved" }
    ],
    generatedAt: "2026-10-03T13:36:00.000Z"
  });

  assert.equal(snapshot.codes[28].status, INFOGRAPHIC_CODE_STATUSES.SOLD);
  assert.equal(snapshot.codes[685].status, INFOGRAPHIC_CODE_STATUSES.INSTALLMENT_RESERVED);
  assert.equal(snapshot.codes[721].status, INFOGRAPHIC_CODE_STATUSES.RESERVED);
  assert.equal(snapshot.codes[57].status, INFOGRAPHIC_CODE_STATUSES.AVAILABLE);
  assert.equal(snapshot.availableCodes.length, 997);
  assert.equal(snapshot.nonAvailableCodes.length, 3);
});

test("genera 000-999 en cinco láminas de 200 posiciones", () => {
  const model = makeModel();
  validateInfographicData(model);
  const result = splitInfographicSheets(model);

  assert.equal(result.strategy, "automatic");
  assert.equal(result.sheets.length, 5);
  assert.deepEqual(result.sheets.map(sheet => sheet.codes.length), [200, 200, 200, 200, 200]);
  assert.equal(result.sheets[0].startCode, "000");
  assert.equal(result.sheets[0].endCode, "199");
  assert.equal(result.sheets[4].startCode, "800");
  assert.equal(result.sheets[4].endCode, "999");
  assert.deepEqual(result.sheets.map(sheet => sheet.availableCount), [200, 200, 200, 200, 200]);
  result.sheets.forEach(validateRenderedSheet);
});

test("cuenta los disponibles de cada cuadrícula sin mezclar otras láminas", () => {
  const model = makeModel("loteria_3_primeras", ["028", "199", "200", "685", "999"]);
  const result = splitInfographicSheets(model);

  assert.deepEqual(result.sheets.map(sheet => sheet.availableCount), [198, 199, 200, 199, 199]);
  assert.deepEqual(result.sheets.map(sheet => sheet.nonAvailableCount), [2, 1, 0, 1, 1]);
});

test("conserva vendidos exactamente una vez y en su posición", () => {
  const unavailable = ["028", "057", "685", "721"];
  const model = makeModel("loteria_3_primeras", unavailable);
  validateInfographicData(model);

  for (const code of unavailable) {
    const matches = model.codes.filter(item => item.code === code);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].status, INFOGRAPHIC_CODE_STATUSES.SOLD);
    assert.equal(model.codes[Number(code)].code, code);
  }
});

test("padding de tres cifras convierte 5 en 005", () => {
  const numbers = getAllLotteryNumbersByDrawMode("loteria_3_ultimas");
  assert.equal(numbers[5], "005");
  assert.equal(numbers[78], "078");
});

test("10.000 números exige rango y no genera 50 láminas", () => {
  const model = makeModel("loteria_4_pleno");
  validateInfographicData(model);
  const result = splitInfographicSheets(model);
  assert.equal(result.strategy, "range_required");
  assert.equal(result.sheets.length, 0);
});

test("rechaza duplicados e inconsistencias de conteo", () => {
  const model = makeModel();
  model.codes[1] = { ...model.codes[0] };
  assert.throws(() => validateInfographicData(model), /inconsistencia/i);
});

test("renderiza SVG determinístico y PNG 1080x1920", async () => {
  const model = makeModel("loteria_3_primeras", ["028", "057", "685", "721"]);
  model.name = "�� ðŸŽ„ 🔥🎄 NAVIDAD MILLONARIA 2026 🎄🔥 ðŸŽ„ ��";
  const { sheets } = splitInfographicSheets(model);
  const theme = resolveTheme(model, "automatic", "premium");
  const svg = renderInfographicSvg({ model, sheet: sheets[0], sheetCount: sheets.length, theme });

  assert.match(svg, />028</);
  assert.match(svg, />057</);
  assert.match(svg, />199</);
  assert.match(svg, /LÁMINA 1 DE 5/);
  assert.match(svg, /198 disponibles aquí/);
  assert.match(svg, />NAVIDAD MILLONARIA 2026<\/text>/);
  assert.doesNotMatch(svg, /�|ð|Ÿ|Ž|„|🔥|🎄/);
  assert.match(svg, /font-family: "DejaVu Sans"/);
  assert.doesNotMatch(svg, /font-family="Arial/);

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);
  assert.equal(metadata.format, "png");
});

test("premium, clásico y minimalista producen diseños visualmente distintos", async () => {
  const model = makeModel("loteria_3_primeras", ["028", "057"]);
  const { sheets } = splitInfographicSheets(model);
  const renderStyle = style => renderInfographicSvg({
    model,
    sheet: sheets[0],
    sheetCount: sheets.length,
    theme: resolveTheme(model, "christmas", style)
  });

  const premium = renderStyle("premium");
  const classic = renderStyle("classic");
  const minimal = renderStyle("minimal");

  assert.match(premium, /data-style="premium"/);
  assert.match(classic, /data-style="classic"/);
  assert.match(minimal, /data-style="minimal"/);
  assert.notEqual(premium, classic);
  assert.notEqual(classic, minimal);
  assert.notEqual(premium, minimal);

  for (const svg of [premium, classic, minimal]) {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, 1920);
  }
});

test("genera y decodifica QR con la URL pública exacta", async () => {
  const url = "https://www.promoclaras.com/campanas/navidad-millonaria-2026";
  const qr = await createValidatedQr(url);
  assert.equal(qr.decodedUrl, url);
  assert.match(qr.dataUrl, /^data:image\/png;base64,/);
});

test("construye texto promocional únicamente con datos del modelo", () => {
  const text = buildShareText(makeModel());
  assert.match(text, /NAVIDAD MILLONARIA 2026/);
  assert.match(text, /\$\s?4[.]000[.]000/);
  assert.match(text, /2 cuotas/);
  assert.match(text, /navidad-millonaria-2026/);
});

test("genera un paquete coherente y reutiliza la misma versión en caché", async () => {
  const campaign = {
    id: "campaign-test",
    slug: "navidad-millonaria-2026",
    title: "NAVIDAD MILLONARIA 2026",
    description: "Campaña de Navidad",
    prize: "$4.000.000 en efectivo",
    prize_cash_amount: 4000000,
    prize_type: "money",
    draw_date: "2026-12-26",
    draw_provider: "boyaca",
    draw_mode: "loteria_2_primeras",
    price_per_ticket: 20000,
    installments_enabled: true
  };
  const snapshot = buildAvailabilitySnapshot({
    campaign,
    tickets: [{ combination: "28", status: "active" }],
    reservations: [],
    generatedAt: "2026-10-03T13:36:00.000Z"
  });
  const availabilityService = {
    async getCampaignAvailability() { return snapshot; }
  };
  const service = createPromotionalContentService({
    availabilityService,
    appBaseUrl: "https://www.promoclaras.com",
    getProviderLabel: () => "Lotería de Boyacá",
    getModeLabel: () => "2 primeras cifras",
    getInstallmentConfiguration: () => ({ enabled: true, maximumInstallments: 2 })
  });

  const first = await service.generateInfographics(campaign, { theme: "automatic", style: "premium", showQr: true });
  const second = await service.generateInfographics(campaign, { theme: "automatic", style: "premium", showQr: true });
  assert.equal(first.generationId, second.generationId);
  assert.equal(first.sheets.length, 1);
  assert.ok(first.sheets[0].png.length > 1000);
  const renderedMetadata = await sharp(first.sheets[0].png).metadata();
  assert.equal(renderedMetadata.width, 1080);
  assert.equal(renderedMetadata.height, 1920);
  assert.equal(first.sheets[0].codes.length, 100);
  assert.equal(service.getGeneration(first.generationId, campaign.id).model.availabilityVersion, snapshot.availabilityVersion);

  campaign.price_per_ticket = 25000;
  const status = await service.getGenerationStatus(first, campaign);
  assert.equal(status.current, false);
});
