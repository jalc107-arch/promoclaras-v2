import crypto from "crypto";

export const PHONE_OTP_LENGTH = 6;
export const PHONE_OTP_TTL_MINUTES = 10;
export const PHONE_OTP_MAX_ATTEMPTS = 5;

export function normalizeColombianMobilePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("57")) {
    digits = digits.slice(2);
  }

  if (!/^3\d{9}$/.test(digits)) {
    return null;
  }

  return {
    national: digits,
    e164: `57${digits}`,
    display: `+57 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  };
}

export function generatePhoneOtp() {
  return String(crypto.randomInt(0, 10 ** PHONE_OTP_LENGTH))
    .padStart(PHONE_OTP_LENGTH, "0");
}

export function hashPhoneOtp({ challengeId, phoneE164, code, secret }) {
  return crypto
    .createHmac("sha256", String(secret || ""))
    .update(`${String(challengeId)}:${String(phoneE164)}:${String(code)}`)
    .digest("hex");
}

export function verifyPhoneOtpHash({ challengeId, phoneE164, code, secret, expectedHash }) {
  const actualHash = hashPhoneOtp({ challengeId, phoneE164, code, secret });
  const expected = String(expectedHash || "");

  if (actualHash.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expected));
}

export function buildAuthenticationTemplatePayload({
  to,
  code,
  templateName = "codigo_verificacion",
  languageCode = "es_CO"
}) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: String(to),
    type: "template",
    template: {
      name: String(templateName),
      language: {
        code: String(languageCode)
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: String(code)
            }
          ]
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [
            {
              type: "text",
              text: String(code)
            }
          ]
        }
      ]
    }
  };
}
