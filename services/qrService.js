import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";

export async function createValidatedQr(url, { width = 180 } = {}) {
  const target = new URL(url).toString();
  const png = await QRCode.toBuffer(target, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width
  });

  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const decoded = jsQR(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    info.width,
    info.height
  );

  if (!decoded || decoded.data !== target) {
    throw new Error("El QR generado no pudo validarse.");
  }

  return {
    png,
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
    decodedUrl: decoded.data
  };
}
