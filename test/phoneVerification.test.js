import test from "node:test";
import assert from "node:assert/strict";

import {
  PHONE_OTP_LENGTH,
  buildAuthenticationTemplatePayload,
  generatePhoneOtp,
  hashPhoneOtp,
  normalizeColombianMobilePhone,
  verifyPhoneOtpHash
} from "../services/phoneVerificationService.js";

test("normaliza celulares colombianos nacionales y con indicativo", () => {
  assert.deepEqual(normalizeColombianMobilePhone("316 473 9413"), {
    national: "3164739413",
    e164: "573164739413",
    display: "+57 316 473 9413"
  });
  assert.equal(normalizeColombianMobilePhone("+57 3164739413")?.national, "3164739413");
});

test("rechaza teléfonos que no son celulares colombianos válidos", () => {
  assert.equal(normalizeColombianMobilePhone("6011234567"), null);
  assert.equal(normalizeColombianMobilePhone("31647"), null);
  assert.equal(normalizeColombianMobilePhone(""), null);
});

test("genera códigos OTP de seis dígitos, incluidos ceros iniciales posibles", () => {
  for (let index = 0; index < 100; index += 1) {
    const code = generatePhoneOtp();
    assert.equal(code.length, PHONE_OTP_LENGTH);
    assert.match(code, /^\d{6}$/);
  }
});

test("firma y verifica el OTP sin almacenar el código en texto", () => {
  const input = {
    challengeId: "ef56b9fe-7239-4e71-a342-6c582a4c744e",
    phoneE164: "573164739413",
    code: "012345",
    secret: "secreto-de-prueba-con-longitud-suficiente"
  };
  const expectedHash = hashPhoneOtp(input);

  assert.equal(verifyPhoneOtpHash({ ...input, expectedHash }), true);
  assert.equal(verifyPhoneOtpHash({ ...input, code: "012346", expectedHash }), false);
});

test("construye la plantilla de autenticación con cuerpo y botón copiar", () => {
  const payload = buildAuthenticationTemplatePayload({
    to: "573164739413",
    code: "123456"
  });

  assert.equal(payload.template.name, "codigo_verificacion");
  assert.equal(payload.template.language.code, "es_CO");
  assert.equal(payload.template.components[0].parameters[0].text, "123456");
  assert.equal(payload.template.components[1].sub_type, "url");
  assert.equal(payload.template.components[1].parameters[0].text, "123456");
});
