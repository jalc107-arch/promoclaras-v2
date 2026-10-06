import { AVAILABLE_STYLES, AVAILABLE_THEMES } from "../lib/infographic/themeEngine.js";
import { getLotteryDigitsByDrawMode } from "../services/campaignAvailabilityService.js";
import { streamGenerationZip } from "../services/exportService.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeOption(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function safeSlug(value) {
  return String(value || "campana")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "campana";
}

function optionTags(values, selected) {
  const labels = {
    automatic: "Automático",
    christmas: "Navidad",
    money: "Dinero",
    automotive: "Automotriz",
    minimal: "Minimalista",
    premium: "Premium",
    classic: "Clásico"
  };
  return values.map(value =>
    `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(labels[value] || value)}</option>`
  ).join("");
}

function jsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function registerOrganizerPromotionalContentRoutes({ app, supabase, promotionalContentService, sendServerError }) {
  async function loadAuthorizedCampaign(req, res) {
    const { organizerId, rifaId } = req.params;
    if (!req.session?.organizerId || String(req.session.organizerId) !== String(organizerId)) {
      res.status(403).send("No tienes permiso para administrar esta campaña.");
      return null;
    }

    const { data: organizer, error: organizerError } = await supabase
      .from("organizers")
      .select("id, profile_id")
      .eq("id", organizerId)
      .single();
    if (organizerError || !organizer) {
      res.status(404).send("Organizador no encontrado.");
      return null;
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();
    if (campaignError || !campaign) {
      res.status(404).send("Campaña no encontrada.");
      return null;
    }
    if (String(campaign.owner_id) !== String(organizer.profile_id)) {
      res.status(403).send("No tienes permiso para administrar esta campaña.");
      return null;
    }
    return { organizer, campaign };
  }

  app.get("/organizers/:organizerId/campanas/:rifaId/contenido-promocional", async (req, res) => {
    try {
      const context = await loadAuthorizedCampaign(req, res);
      if (!context) return;

      const { organizer, campaign } = context;
      const digits = getLotteryDigitsByDrawMode(campaign.draw_mode);
      const theme = safeOption(String(req.query.theme || "automatic"), AVAILABLE_THEMES, "automatic");
      const style = safeOption(String(req.query.style || "premium"), AVAILABLE_STYLES, "premium");
      const submittedConfiguration = req.query.generate === "1";
      const shouldGenerate = digits === 2 || digits === 3;
      const showQr = submittedConfiguration ? req.query.showQr === "1" : true;
      let generation = null;
      if (shouldGenerate && (digits === 2 || digits === 3)) {
        generation = await promotionalContentService.generateInfographics(campaign, { theme, style, showQr });
      }

      const basePath = `/organizers/${encodeURIComponent(organizer.id)}/campanas/${encodeURIComponent(campaign.id)}/contenido-promocional`;
      const generationPath = generation
        ? `${basePath}/generations/${encodeURIComponent(generation.generationId)}`
        : null;
      const previews = generation?.sheets.map(sheet => {
        const imageUrl = `${generationPath}/infografias/${sheet.index}.png`;
        const downloadUrl = `${imageUrl}?download=1`;
        const filename = `${safeSlug(generation.model.slug)}-${sheet.startCode}-${sheet.endCode}.png`;
        return `<article class="sheet-card">
          <div class="sheet-head"><div><strong>Lámina ${sheet.index + 1}</strong><span>${escapeHtml(sheet.startCode)}-${escapeHtml(sheet.endCode)}</span></div><span class="current generation-status">ACTUALIZADA</span></div>
          <img src="${escapeHtml(imageUrl)}" alt="Infografía de números ${escapeHtml(sheet.startCode)} a ${escapeHtml(sheet.endCode)} de ${escapeHtml(campaign.title)}" loading="lazy">
          <div class="sheet-actions">
            <a href="${escapeHtml(imageUrl)}" target="_blank">Ver</a>
            <a href="${escapeHtml(downloadUrl)}">Descargar</a>
            <button class="share-sheet primary" type="button" data-url="${escapeHtml(imageUrl)}" data-download="${escapeHtml(downloadUrl)}" data-filename="${escapeHtml(filename)}">Compartir</button>
          </div>
        </article>`;
      }).join("") || "";

      const unsupported = !digits
        ? `<div class="notice">Las cuadrículas numéricas aplican a campañas de lotería. Las campañas Baloto usan combinaciones y requieren una presentación diferente.</div>`
        : digits === 4
          ? `<div class="notice">Esta campaña tiene 10.000 números. No se generan automáticamente 50 imágenes; utiliza la consulta de números disponibles de la campaña.</div>`
          : "";
      const shareText = generation?.shareText || "";

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(`<!doctype html>
      <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Cuadrículas disponibles - ${escapeHtml(campaign.title)}</title>
        <style>
          *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#07111f;color:#e5eefc}a{text-decoration:none}button{font:inherit}.wrap{max-width:1180px;margin:auto;padding:28px 18px 60px}.hero{background:linear-gradient(135deg,#10213c,#111827);border:1px solid #24344f;border-radius:22px;padding:26px;box-shadow:0 18px 50px rgba(0,0,0,.28)}.eyebrow{color:#86efac;font-weight:900;letter-spacing:.12em;font-size:13px}.hero h1{margin:9px 0 8px;font-size:clamp(28px,5vw,48px)}.hero p{color:#b7c5da;line-height:1.55;max-width:760px}.back{display:inline-flex;margin-top:12px;color:#bfdbfe;font-weight:800}
          .config{margin-top:22px;background:#fff;color:#0f172a;border-radius:20px;padding:22px;display:grid;grid-template-columns:1fr 1fr auto auto;gap:14px;align-items:end}.field label{display:block;font-size:13px;font-weight:800;margin-bottom:7px;color:#334155}.field select{width:100%;padding:13px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;font-size:16px}.check{display:flex;align-items:center;gap:8px;min-height:48px;font-weight:800}.check input{width:19px;height:19px}.generate{border:0;border-radius:12px;padding:14px 20px;background:#16a34a;color:#fff;font-weight:900;font-size:15px;cursor:pointer}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}.metric{background:#10213c;border:1px solid #263958;border-radius:16px;padding:17px}.metric span{display:block;color:#9fb0c7;font-size:13px}.metric strong{display:block;font-size:26px;margin-top:5px}.notice,.stale{margin-top:20px;padding:18px;border-radius:16px;background:#fff7ed;color:#9a3412;border:1px solid #fdba74;line-height:1.5;font-weight:700}.stale{display:none}.stale.visible{display:block}
          .section-title{margin:32px 0 16px}.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}.toolbar a,.toolbar button{border:0;border-radius:11px;padding:12px 16px;background:#24344f;color:#fff;font-weight:800;cursor:pointer}.toolbar .primary{background:#2563eb}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.sheet-card{background:#101c30;border:1px solid #263958;border-radius:20px;padding:16px}.sheet-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.sheet-head strong,.sheet-head span{display:block}.sheet-head div span{color:#9fb0c7;margin-top:4px}.current{font-size:11px;color:#86efac;font-weight:900}.current.stale-label{color:#fdba74}.sheet-card img{width:100%;max-height:650px;object-fit:contain;background:#020617;border-radius:14px}.sheet-actions{display:flex;gap:8px;margin-top:14px}.sheet-actions a,.sheet-actions button{flex:1;text-align:center;padding:11px 7px;border:0;border-radius:11px;background:#24344f;color:#fff;font-weight:800;cursor:pointer}.sheet-actions .primary{background:#2563eb}.message{margin-top:20px;background:#101c30;border:1px solid #263958;border-radius:18px;padding:18px}.message textarea{width:100%;min-height:220px;border:1px solid #3b4c67;border-radius:12px;padding:14px;background:#07111f;color:#e5eefc;resize:vertical;font:15px/1.5 Arial,sans-serif}
          @media(max-width:760px){.config{grid-template-columns:1fr}.summary{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}.wrap{padding:16px 12px 40px}.hero{padding:20px}.sheet-card img{max-height:none}.sheet-actions{flex-wrap:wrap}.sheet-actions a,.sheet-actions button{min-width:30%}}
        </style></head><body><main class="wrap">
        <section class="hero"><div class="eyebrow">CUADRÍCULAS PARA COMPARTIR</div><h1>${escapeHtml(campaign.title)}</h1><p>Consulta y comparte la disponibilidad real de la campaña. Cada lámina contiene hasta 200 números y diferencia los disponibles, vendidos y reservados.</p><a class="back" href="/organizers/${encodeURIComponent(organizer.id)}/campanas/${encodeURIComponent(campaign.id)}/detalle">Volver al detalle</a></section>
        <form class="config" method="get" action="${escapeHtml(basePath)}"><input type="hidden" name="generate" value="1"><div class="field"><label>Tema</label><select name="theme">${optionTags(AVAILABLE_THEMES, theme)}</select></div><div class="field"><label>Estilo</label><select name="style">${optionTags(AVAILABLE_STYLES, style)}</select></div><label class="check"><input type="checkbox" name="showQr" value="1" ${showQr ? "checked" : ""}> Mostrar QR</label><button class="generate" type="submit">Actualizar cuadrículas</button></form>
        ${generation ? `<section class="summary"><div class="metric"><span>Disponibles</span><strong>${generation.model.availableCount}</strong></div><div class="metric"><span>No disponibles</span><strong>${generation.model.nonAvailableCount}</strong></div><div class="metric"><span>Láminas</span><strong>${generation.sheets.length}</strong></div></section><div id="stale-warning" class="stale">⚠️ La disponibilidad cambió. Estas cuadrículas ya no reflejan todos los movimientos. Pulsa “Actualizar cuadrículas”.</div>` : ""}
        ${unsupported}
        ${generation ? `<h2 class="section-title">Cuadrículas listas para compartir</h2><div class="toolbar"><a class="primary" href="${escapeHtml(generationPath)}/download.zip">Descargar todas (ZIP)</a><button id="copy-message" type="button">Copiar mensaje</button><button id="copy-link" type="button">Copiar enlace</button></div><section class="grid">${previews}</section><section class="message"><h3>Texto para acompañar las imágenes</h3><textarea readonly>${escapeHtml(shareText)}</textarea></section>` : ""}
      </main>
      ${generation ? `<script>
        const shareText = ${jsonForScript(shareText)};
        const publicUrl = ${jsonForScript(generation.model.publicUrl)};
        const statusUrl = ${jsonForScript(`${generationPath}/status`)};
        async function copyValue(value, button, successLabel) { try { await navigator.clipboard.writeText(value); const original = button.textContent; button.textContent = successLabel; setTimeout(() => { button.textContent = original; }, 1800); } catch { window.prompt("Copia este contenido:", value); } }
        document.getElementById("copy-message")?.addEventListener("click", event => copyValue(shareText, event.currentTarget, "✓ Mensaje copiado"));
        document.getElementById("copy-link")?.addEventListener("click", event => copyValue(publicUrl, event.currentTarget, "✓ Enlace copiado"));
        document.querySelectorAll(".share-sheet").forEach(button => { button.addEventListener("click", async () => { try { const response = await fetch(button.dataset.url, { credentials: "same-origin" }); if (!response.ok) throw new Error("download_failed"); const blob = await response.blob(); const file = new File([blob], button.dataset.filename, { type: "image/png" }); if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: ${jsonForScript(campaign.title)}, text: shareText }); return; } window.location.href = button.dataset.download; } catch (error) { if (error?.name !== "AbortError") window.location.href = button.dataset.download; } }); });
        async function refreshGenerationStatus() { try { const response = await fetch(statusUrl, { credentials: "same-origin", cache: "no-store" }); if (!response.ok) return; const status = await response.json(); if (!status.current) { document.getElementById("stale-warning")?.classList.add("visible"); document.querySelectorAll(".generation-status").forEach(label => { label.textContent = "DESACTUALIZADA"; label.classList.add("stale-label"); }); } } catch {} }
        setInterval(refreshGenerationStatus, 30000);
      </script>` : ""}</body></html>`);
    } catch (error) {
      console.error("Error en contenido promocional:", error?.details || error);
      return sendServerError(res, error);
    }
  });

  app.get("/organizers/:organizerId/campanas/:rifaId/contenido-promocional/generations/:generationId/infografias/:sheetIndex.png", async (req, res) => {
    try {
      const context = await loadAuthorizedCampaign(req, res);
      if (!context) return;
      const generation = promotionalContentService.getGeneration(req.params.generationId, context.campaign.id);
      const sheetIndex = Number.parseInt(req.params.sheetIndex, 10);
      const sheet = generation.sheets[sheetIndex];
      if (!Number.isInteger(sheetIndex) || !sheet) return res.status(404).send("Lámina no encontrada.");
      const filename = `${safeSlug(generation.model.slug)}-${sheet.startCode}-${sheet.endCode}.png`;
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename="${filename}"`);
      return res.send(sheet.png);
    } catch (error) {
      return res.status(error?.statusCode || 500).send(error?.statusCode === 404 ? "La generación expiró. Vuelve a generar las infografías." : "No fue posible obtener la infografía.");
    }
  });

  app.get("/organizers/:organizerId/campanas/:rifaId/contenido-promocional/generations/:generationId/download.zip", async (req, res) => {
    try {
      const context = await loadAuthorizedCampaign(req, res);
      if (!context) return;
      const generation = promotionalContentService.getGeneration(req.params.generationId, context.campaign.id);
      await streamGenerationZip(res, generation);
    } catch (error) {
      console.error("Error descargando infografías:", error);
      if (!res.headersSent) res.status(error?.statusCode || 500).send("No fue posible preparar la descarga.");
    }
  });

  app.get("/organizers/:organizerId/campanas/:rifaId/contenido-promocional/generations/:generationId/status", async (req, res) => {
    try {
      const context = await loadAuthorizedCampaign(req, res);
      if (!context) return;
      const generation = promotionalContentService.getGeneration(req.params.generationId, context.campaign.id);
      const status = await promotionalContentService.getGenerationStatus(generation, context.campaign);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      return res.json(status);
    } catch (error) {
      return res.status(error?.statusCode || 500).json({ current: false, error: "generation_unavailable" });
    }
  });
}
