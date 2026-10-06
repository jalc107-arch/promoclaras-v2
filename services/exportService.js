import archiver from "archiver";

export async function streamGenerationZip(res, generation) {
  const slug = String(generation.model.slug || "campana")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "campana";
  const filename = `${slug}-infografias.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("warning", error => {
    if (error.code !== "ENOENT") throw error;
  });
  archive.pipe(res);

  for (const sheet of generation.sheets) {
    archive.append(sheet.png, {
      name: `${slug}-${sheet.startCode}-${sheet.endCode}.png`
    });
  }

  await archive.finalize();
}
