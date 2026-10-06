import crypto from "crypto";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { buildInfographicCampaignData } from "../lib/infographic/dataBuilder.js";
import { splitInfographicSheets } from "../lib/infographic/sheetBuilder.js";
import { resolveTheme } from "../lib/infographic/themeEngine.js";
import { renderInfographicSvg } from "../lib/infographic/svgRenderer.js";
import { validateInfographicData, validateRenderedSheet } from "../lib/infographic/validators.js";
import { createValidatedQr } from "./qrService.js";
import { buildShareText } from "./shareTextBuilder.js";

const INFOGRAPHIC_FONT_FILES = [
  fileURLToPath(new URL("../assets/fonts/DejaVuSans.ttf", import.meta.url)),
  fileURLToPath(new URL("../assets/fonts/DejaVuSans-Bold.ttf", import.meta.url))
];

function renderSvgToPng(svg) {
  const renderer = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: {
      fontFiles: INFOGRAPHIC_FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: "DejaVu Sans",
      sansSerifFamily: "DejaVu Sans"
    }
  });

  return Buffer.from(renderer.render().asPng());
}

export function createPromotionalContentService({
  availabilityService,
  appBaseUrl,
  getProviderLabel,
  getModeLabel,
  getInstallmentConfiguration
}) {
  const cacheById = new Map();
  const cacheByFingerprint = new Map();
  const cacheTtlMs = 30 * 60 * 1000;

  function removeExpiredGenerations() {
    const currentTime = Date.now();
    for (const [id, generation] of cacheById) {
      if (generation.expiresAt <= currentTime) {
        cacheById.delete(id);
        cacheByFingerprint.delete(generation.fingerprint);
      }
    }
  }

  function generationFingerprint(generation, options) {
    const model = generation.model;
    return crypto.createHash("sha256").update(JSON.stringify({
      campaignId: model.campaignId,
      availabilityVersion: model.availabilityVersion,
      name: model.name,
      prizeTitle: model.prizeTitle,
      prizeAmount: model.prizeAmount,
      drawDate: model.drawDate,
      lotteryName: model.lotteryName,
      drawMechanism: model.drawMechanism,
      codePrice: model.codePrice,
      publicUrl: model.publicUrl,
      maxInstallments: model.maxInstallments,
      theme: generation.theme.id,
      style: generation.theme.style,
      showQr: options.showQr !== false
    })).digest("hex");
  }

  async function buildGeneration(campaign, options = {}) {
    const availability = await availabilityService.getCampaignAvailability(campaign);
    const model = buildInfographicCampaignData({
      campaign,
      availability,
      appBaseUrl,
      providerLabel: getProviderLabel(campaign.draw_provider),
      modeLabel: getModeLabel(campaign.draw_mode),
      installmentConfiguration: getInstallmentConfiguration(campaign)
    });

    validateInfographicData(model);

    const theme = resolveTheme(model, options.theme, options.style);
    const sheetResult = splitInfographicSheets(model);
    sheetResult.sheets.forEach(validateRenderedSheet);

    return { model, theme, ...sheetResult };
  }

  async function generateInfographics(campaign, options = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generation = await buildGeneration(campaign, options);
      const fingerprint = generationFingerprint(generation, options);
      removeExpiredGenerations();
      const cachedId = cacheByFingerprint.get(fingerprint);
      if (cachedId && cacheById.has(cachedId)) {
        return cacheById.get(cachedId);
      }

      const qr = options.showQr === false
        ? null
        : await createValidatedQr(generation.model.publicUrl);
      const renderedSheets = await Promise.all(generation.sheets.map(async sheet => {
        const svg = renderInfographicSvg({
          model: generation.model,
          sheet,
          sheetCount: generation.sheets.length,
          theme: generation.theme,
          qrDataUrl: qr?.dataUrl || null
        });
        const png = renderSvgToPng(svg);
        return { ...sheet, png };
      }));
      const verification = await buildGeneration(campaign, options);
      const verificationFingerprint = generationFingerprint(verification, options);

      if (verificationFingerprint === fingerprint) {
        const generationId = crypto.randomUUID();
        const stored = {
          ...generation,
          id: generationId,
          generationId,
          fingerprint,
          sheets: renderedSheets,
          shareText: buildShareText(generation.model),
          options: { ...options, showQr: options.showQr !== false },
          expiresAt: Date.now() + cacheTtlMs
        };
        cacheById.set(generationId, stored);
        cacheByFingerprint.set(fingerprint, generationId);

        while (cacheById.size > 50) {
          const oldestId = cacheById.keys().next().value;
          const oldest = cacheById.get(oldestId);
          cacheById.delete(oldestId);
          if (oldest) cacheByFingerprint.delete(oldest.fingerprint);
        }

        return stored;
      }
    }

    const error = new Error("La disponibilidad cambió durante la generación. Intenta nuevamente.");
    error.statusCode = 409;
    throw error;
  }

  function getGeneration(generationId, campaignId) {
    removeExpiredGenerations();
    const generation = cacheById.get(String(generationId));
    if (!generation || String(generation.model.campaignId) !== String(campaignId)) {
      const error = new Error("La generación no existe o expiró.");
      error.statusCode = 404;
      throw error;
    }
    return generation;
  }

  async function getGenerationStatus(generation, campaign) {
    const currentGeneration = await buildGeneration(campaign, generation.options);
    const currentFingerprint = generationFingerprint(currentGeneration, generation.options);
    return {
      current: currentFingerprint === generation.fingerprint,
      generatedAvailabilityVersion: generation.model.availabilityVersion,
      currentAvailabilityVersion: currentGeneration.model.availabilityVersion
    };
  }

  return { buildGeneration, generateInfographics, getGeneration, getGenerationStatus };
}
