function safeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function buildInfographicCampaignData({
  campaign,
  availability,
  appBaseUrl,
  providerLabel,
  modeLabel,
  installmentConfiguration
}) {
  const totalCodes = availability.totalCodes;
  const allowsInstallments = Boolean(
    campaign.installments_enabled && installmentConfiguration?.enabled
  );

  return {
    campaignId: campaign.id,
    slug: campaign.slug,
    name: campaign.title,
    shortName: campaign.title,
    category: campaign.prize_type === "money" ? "money" : "general",
    description: campaign.description || "",
    prizeTitle: campaign.prize || "Premio",
    prizeAmount: Number(campaign.prize_cash_amount || 0),
    prizeDescription: campaign.prize || "",
    currency: "COP",
    drawDate: campaign.draw_date,
    drawTime: null,
    lotteryName: providerLabel,
    drawMechanism: modeLabel,
    modality: campaign.draw_mode,
    digits: availability.digits,
    startNumber: 0,
    endNumber: totalCodes - 1,
    codePrice: Number(campaign.price_per_ticket || 0),
    publicUrl: `${safeBaseUrl(appBaseUrl)}/campanas/${encodeURIComponent(campaign.slug || "")}`,
    allowsInstallments,
    maxInstallments: allowsInstallments
      ? Number(installmentConfiguration.maximumInstallments || 1)
      : null,
    campaignImage: campaign.image_url || null,
    organizerLogo: null,
    primaryColor: null,
    secondaryColor: null,
    totalCodes,
    availableCount: availability.availableCodes.length,
    nonAvailableCount: availability.nonAvailableCodes.length,
    codes: availability.codes,
    unknownCodes: availability.unknownCodes,
    duplicateCodes: availability.duplicateCodes,
    availabilityVersion: availability.availabilityVersion,
    generatedAt: availability.generatedAt,
    timezone: "America/Bogota"
  };
}
