import "dotenv/config";
import express from "express";
import session from "express-session";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.get("/campaclick-share.jpg", (req, res) => {
  res.sendFile(path.join(__dirname, "campaclick-share.jpg"));
});

app.use("/img", express.static("public/img"));


app.use(
  session({
    secret: process.env.SESSION_SECRET || "promoclaras_v2_secret",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 4
    }
  })
);

const loginLimiter = rateLimit({
  windowMs: 1000 * 60 * 15,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Demasiados intentos de ingreso. Espera 15 minutos e intenta nuevamente."
});

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET;
const WOMPI_EVENTS_SECRET = String(process.env.WOMPI_EVENTS_SECRET || "").trim();
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY;
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();

const APP_BASE_URL = String(
  process.env.APP_BASE_URL || "https://promoclaras.com"
).replace(/\/$/, "");

const WHATSAPP_CLOUD_TOKEN = String(process.env.WHATSAPP_CLOUD_TOKEN || "").trim();
const WHATSAPP_PHONE_NUMBER_ID = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
const WHATSAPP_BUSINESS_ACCOUNT_ID = String(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "").trim();

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);


async function uploadOrganizerSupport(base64Image, organizerId, type) {
  if (!base64Image) {
    return null;
  }

  const match = String(base64Image).match(/^data:(image\/\w+);base64,(.+)$/);

  if (!match) {
    throw new Error("Formato de imagen inválido");
  }

  const mimeType = match[1];
  const base64Data = match[2];

  const extension = mimeType.includes("png") ? "png" : "jpg";
  const buffer = Buffer.from(base64Data, "base64");

  const filePath = `${organizerId}/${type}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("organizer-supports")
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage
    .from("organizer-supports")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeReferralCode(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ñ/g, "N")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20);
}

function generateReferralCode(fullName, phone) {
  const namePart = normalizeReferralCode(fullName)
    .slice(0, 8);

  const phonePart = String(phone || "")
    .replace(/\D/g, "")
    .slice(-4);

  const randomPart = String(Math.floor(100 + Math.random() * 900));

  return normalizeReferralCode(`${namePart}${phonePart}${randomPart}`);
}

function generateWompiIntegritySignature(reference, amountInCents, currency, integritySecret) {
  const raw = `${reference}${amountInCents}${currency}${integritySecret}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function safeCompare(a, b) {
  const valueA = String(a || "");
  const valueB = String(b || "");

  if (valueA.length !== valueB.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(valueA), Buffer.from(valueB));
}

function maskPhone(phone) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");

  if (!cleanPhone) {
    return "-";
  }

  if (cleanPhone.length <= 4) {
    return `${cleanPhone.charAt(0)}***`;
  }

  const first = cleanPhone.slice(0, 1);
  const last = cleanPhone.slice(-3);

  return `${first}******${last}`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const DRAW_PROVIDERS = [
  { value: "baloto", label: "Baloto" },
  
  { value: "loteria_bogota", label: "Lotería de Bogotá" },
  { value: "loteria_medellin", label: "Lotería de Medellín" },
  { value: "loteria_valle", label: "Lotería del Valle" },
  { value: "loteria_cundinamarca", label: "Lotería de Cundinamarca" },
  { value: "loteria_santander", label: "Lotería de Santander" },
  { value: "loteria_boyaca", label: "Lotería de Boyacá" },
  { value: "loteria_cauca", label: "Lotería del Cauca" },
  { value: "loteria_cruz_roja", label: "Lotería de la Cruz Roja" },
  { value: "loteria_huila", label: "Lotería del Huila" },
  { value: "loteria_meta", label: "Lotería del Meta" },
  { value: "loteria_manizales", label: "Lotería de Manizales" },
  { value: "loteria_risaralda", label: "Lotería de Risaralda" },
  { value: "loteria_quindio", label: "Lotería del Quindío" },
  { value: "loteria_tolimense", label: "Lotería del Tolima" }
];

const BALOTO_DRAW_MODES = [
  { value: "baloto_2", label: "Baloto - 2 primeras balotas en orden ascendente" },
  { value: "baloto_3", label: "Baloto - 3 primeras balotas en orden ascendente" },
  { value: "baloto_4", label: "Baloto - 4 primeras balotas en orden ascendente" },
  { value: "baloto_5", label: "Baloto - 5 balotas completas en orden ascendente" }
];

const LOTERIA_DRAW_MODES = [
  { value: "loteria_2_primeras", label: "2 primeras cifras" },
  { value: "loteria_2_ultimas", label: "2 últimas cifras" },
  { value: "loteria_3_primeras", label: "3 primeras cifras" },
  { value: "loteria_3_ultimas", label: "3 últimas cifras" },
  { value: "loteria_4_pleno", label: "4 números pleno" }
];

function getDrawProviderLabel(value) {
  const found = DRAW_PROVIDERS.find(item => item.value === value);
  return found ? found.label : value || "-";
}

function getDrawModeLabel(value) {
  const allModes = [...BALOTO_DRAW_MODES, ...LOTERIA_DRAW_MODES];
  const found = allModes.find(item => item.value === value);
  return found ? found.label : value || "-";
}

function getResultPlaceholder(drawMode) {
  if (drawMode === "baloto_2") return "Ej: 0814303541. Escribe las 5 balotas oficiales; el sistema toma las 2 primeras en orden ascendente.";
  if (drawMode === "baloto_3") return "Ej: 0814303541. Escribe las 5 balotas oficiales; el sistema toma las 3 primeras en orden ascendente.";
  if (drawMode === "baloto_4") return "Ej: 0814303541. Escribe las 5 balotas oficiales; el sistema toma las 4 primeras en orden ascendente.";
  if (drawMode === "baloto_5") return "Ej: 0814303541. Escribe las 5 balotas oficiales en orden o desorden.";

  if (drawMode === "loteria_2_primeras") return "Ej: 5839, toma 58";
  if (drawMode === "loteria_2_ultimas") return "Ej: 5839, toma 39";
  if (drawMode === "loteria_3_primeras") return "Ej: 5839, toma 583";
  if (drawMode === "loteria_3_ultimas") return "Ej: 5839, toma 839";
  if (drawMode === "loteria_4_pleno") return "Ej: 5839";

  return "Escribe el resultado ganador";
}

function isBalotoProvider(drawProvider) {
  return drawProvider === "baloto";
}

function isLoteriaProvider(drawProvider) {
  return String(drawProvider || "").startsWith("loteria_");
}

function getMinimumQtyByPrice(pricePerTicket) {
  const price = Number(pricePerTicket || 0);

  if (price === 1000) return 10;
  if (price === 2000) return 3;
  if (price === 3000) return 2;
  if (price === 4000) return 2;
  if (price >= 5000) return 1;

  return 1;
}

function getMinimumQtyText(pricePerTicket) {
  const minimumQty = getMinimumQtyByPrice(pricePerTicket);

  if (minimumQty === 1) {
    return "Puedes comprar desde 1 Código promocional.";
  }

  return `Por el valor de este código, la compra mínima es de ${minimumQty} Códigos promocionales.`;
}

function getMaxTicketsByDrawMode(drawMode) {
  // BALOTO SIN SÚPER BALOTA
  // Regla: se toman las balotas principales en orden ascendente.
  // En modalidades 2, 3 y 4 se toman las primeras balotas del resultado ordenado.
  if (drawMode === "baloto_2") return 780;       // 01-02 hasta 39-40
  if (drawMode === "baloto_3") return 10660;     // 01-02-03 hasta 39-40-41
  if (drawMode === "baloto_4") return 111930;    // 01-02-03-04 hasta 39-40-41-42
  if (drawMode === "baloto_5") return 962598;    // 01-02-03-04-05 hasta 39-40-41-42-43

  if (drawMode === "loteria_2_primeras") return 100;
  if (drawMode === "loteria_2_ultimas") return 100;
  if (drawMode === "loteria_3_primeras") return 1000;
  if (drawMode === "loteria_3_ultimas") return 1000;
  if (drawMode === "loteria_4_pleno") return 10000;

  return 0;
}

function formatDateOnly(dateValue) {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue).slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function normalizeBulkResultForCampaign(drawMode, rawValue) {
  const digits = String(rawValue || "").replace(/\D/g, "");

  if (drawMode.startsWith("baloto_")) {
    if (digits.length !== 10) {
      throw new Error("Para carga masiva de Baloto debes escribir las 5 balotas en 10 dígitos. Ejemplo: 0814303541");
    }

    const numbers = [
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 4)),
      Number(digits.slice(4, 6)),
      Number(digits.slice(6, 8)),
      Number(digits.slice(8, 10))
    ];

    validateBalotoNumbers(numbers);

    const sortedNumbers = numbers
      .sort((a, b) => a - b)
      .map(n => String(n).padStart(2, "0"));

    if (drawMode === "baloto_2") return sortedNumbers.slice(0, 2).join("-");
    if (drawMode === "baloto_3") return sortedNumbers.slice(0, 3).join("-");
    if (drawMode === "baloto_4") return sortedNumbers.slice(0, 4).join("-");
    if (drawMode === "baloto_5") return sortedNumbers.slice(0, 5).join("-");
  }

  if (drawMode.startsWith("loteria_")) {
    if (digits.length !== 4) {
      throw new Error("Para carga masiva de lotería debes escribir el resultado completo de 4 cifras. Ejemplo: 5839");
    }

    if (drawMode === "loteria_2_primeras") return digits.slice(0, 2);
    if (drawMode === "loteria_2_ultimas") return digits.slice(-2);
    if (drawMode === "loteria_3_primeras") return digits.slice(0, 3);
    if (drawMode === "loteria_3_ultimas") return digits.slice(-3);
    if (drawMode === "loteria_4_pleno") return digits.padStart(4, "0");
  }

  throw new Error("Modalidad no válida para carga masiva.");
}

function normalizeResultValue(drawMode, rawValue) {
  const digits = String(rawValue || "").replace(/\D/g, "");

if (drawMode.startsWith("baloto_")) {
    const pickCount = getBalotoPickCount(drawMode);

    if (!pickCount) {
      throw new Error("Modalidad Baloto no válida.");
    }

    if (digits.length !== 10) {
      throw new Error("Para Baloto debes escribir las 5 balotas principales en 10 dígitos. Ejemplo: 0814303541");
    }

    const numbers = [
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 4)),
      Number(digits.slice(4, 6)),
      Number(digits.slice(6, 8)),
      Number(digits.slice(8, 10))
    ];

    validateBalotoNumbers(numbers);

    const sortedNumbers = numbers.sort((a, b) => a - b);

    return sortedNumbers
      .slice(0, pickCount)
      .map(n => String(n).padStart(2, "0"))
      .join("-");
  }

  if (drawMode === "loteria_2_primeras") {
    if (digits.length < 2) {
      throw new Error("Debes escribir mínimo 2 cifras del resultado.");
    }

    return digits.slice(0, 2);
  }

  if (drawMode === "loteria_2_ultimas") {
    if (digits.length < 2) {
      throw new Error("Debes escribir mínimo 2 cifras del resultado.");
    }

    return digits.slice(-2);
  }

  if (drawMode === "loteria_3_primeras") {
    if (digits.length < 3) {
      throw new Error("Debes escribir mínimo 3 cifras del resultado.");
    }

    return digits.slice(0, 3);
  }

  if (drawMode === "loteria_3_ultimas") {
    if (digits.length < 3) {
      throw new Error("Debes escribir mínimo 3 cifras del resultado.");
    }

    return digits.slice(-3);
  }

  if (drawMode === "loteria_4_pleno") {
    if (digits.length !== 4) {
      throw new Error("Para pleno debes escribir exactamente 4 cifras.");
    }

    return digits.padStart(4, "0");
  }

  throw new Error("Modalidad de resultado inválida");
}

function validateBalotoNumbers(numbers) {
  const uniqueNumbers = new Set(numbers);

  if (uniqueNumbers.size !== numbers.length) {
    throw new Error("Las balotas no pueden repetirse.");
  }

  for (const number of numbers) {
    if (!Number.isInteger(number) || number < 1 || number > 43) {
      throw new Error("Las balotas deben estar entre 01 y 43.");
    }
  }
}

function getBalotoPickCount(drawMode) {
  if (drawMode === "baloto_2") return 2;
  if (drawMode === "baloto_3") return 3;
  if (drawMode === "baloto_4") return 4;
  if (drawMode === "baloto_5") return 5;
  return 0;
}

function getMaxAllowedLastNumberForBalotoMode(drawMode) {
  if (drawMode === "baloto_2") return 40;
  if (drawMode === "baloto_3") return 41;
  if (drawMode === "baloto_4") return 42;
  if (drawMode === "baloto_5") return 43;
  return 43;
}

function formatBalotoCombination(numbers) {
  return [...numbers]
    .sort((a, b) => a - b)
    .map(n => String(n).padStart(2, "0"))
    .join("-");
}

function isValidBalotoCombinationForMode(numbers, drawMode) {
  const pickCount = getBalotoPickCount(drawMode);

  if (!pickCount) return false;

  if (!Array.isArray(numbers) || numbers.length !== pickCount) {
    return false;
  }

  const uniqueNumbers = new Set(numbers);

  if (uniqueNumbers.size !== numbers.length) {
    return false;
  }

  if (numbers.some(n => !Number.isInteger(n) || n < 1 || n > 43)) {
    return false;
  }

  const sortedNumbers = [...numbers].sort((a, b) => a - b);
  const lastNumber = sortedNumbers[sortedNumbers.length - 1];
  const maxAllowedLastNumber = getMaxAllowedLastNumberForBalotoMode(drawMode);

  return lastNumber <= maxAllowedLastNumber;
}

function generateProviderOptions(selectedValue = "") {
  return DRAW_PROVIDERS.map(item => `
    <option value="${item.value}" ${selectedValue === item.value ? "selected" : ""}>
      ${item.label}
    </option>
  `).join("");
}

function validateProviderAndMode(drawProvider, drawMode) {
  if (isBalotoProvider(drawProvider)) {
    return drawMode.startsWith("baloto_");
  }

  if (isLoteriaProvider(drawProvider)) {
    return drawMode.startsWith("loteria_");
  }

  return false;
}

function getAllowedDrawDays(drawProvider) {
  const days = {
    baloto: [1, 3, 6], // Lunes, miércoles, sábado

    loteria_cundinamarca: [1], // Lunes
    loteria_tolimense: [1], // Lunes

    loteria_cruz_roja: [2], // Martes
    loteria_huila: [2], // Martes

    loteria_manizales: [3], // Miércoles
    loteria_meta: [3], // Miércoles
    loteria_valle: [3], // Miércoles

    loteria_bogota: [4], // Jueves
    loteria_quindio: [4], // Jueves

    loteria_santander: [5], // Viernes
    loteria_medellin: [5], // Viernes
    loteria_risaralda: [5], // Viernes

    loteria_boyaca: [6], // Sábado
    loteria_cauca: [6] // Sábado
  };

  return days[drawProvider] || [];
}

function getDayName(dayNumber) {
  const names = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado"
  ];

  return names[dayNumber] || "-";
}

function parseLocalDate(dateString) {
  const parts = String(dateString || "").split("-");

  if (parts.length !== 3) {
    return null;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function validateDrawDate(drawProvider, drawDate) {
  const selectedDate = parseLocalDate(drawDate);

  if (!selectedDate || Number.isNaN(selectedDate.getTime())) {
    throw new Error("Fecha de sorteo inválida.");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  selectedDate.setHours(0, 0, 0, 0);

  if (selectedDate <= today) {
    throw new Error("La fecha del sorteo debe ser posterior a la fecha actual.");
  }

  const selectedDay = selectedDate.getDay();
  const allowedDays = getAllowedDrawDays(drawProvider);

  if (!allowedDays.length) {
    throw new Error("No hay días configurados para el sorteo seleccionado.");
  }

  if (!allowedDays.includes(selectedDay)) {
    const allowedText = allowedDays.map(getDayName).join(", ");

    throw new Error(
      `La fecha seleccionada no corresponde al día de sorteo. Para ${getDrawProviderLabel(drawProvider)}, solo puedes escoger: ${allowedText}.`
    );
  }

  return true;
}

async function sendWhatsAppMessage(phone, message) {
  try {
    if (!WHATSAPP_CLOUD_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.log("WhatsApp Cloud API no configurado");
      return {
        ok: false,
        reason: "WhatsApp Cloud API no configurado"
      };
    }

    const cleanPhone = String(phone || "").replace(/\D/g, "");

    if (!cleanPhone) {
      console.log("Teléfono vacío para WhatsApp");
      return {
        ok: false,
        reason: "Teléfono vacío"
      };
    }

    const whatsappPhone = cleanPhone.startsWith("57")
      ? cleanPhone
      : `57${cleanPhone}`;

    const response = await fetch(
      `https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_CLOUD_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: whatsappPhone,
          type: "text",
          text: {
            preview_url: false,
            body: message
          }
        })
      }
    );

    const result = await response.json();

    console.log("WhatsApp Cloud API status:", response.status);
    console.log("WhatsApp Cloud API response:", JSON.stringify(result, null, 2));

    return {
      ok: response.ok,
      status: response.status,
      response: result
    };
  } catch (error) {
    console.error("Error enviando WhatsApp Cloud API:", error);

    return {
      ok: false,
      reason: error.message
    };
  }
}

async function sendWhatsAppTemplateConfirmacionCodigos(phone, buyerName, orderDetail, couponList, quantity, orderUrl) {
  try {
    if (!WHATSAPP_CLOUD_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.log("WhatsApp Cloud API no configurado");
      return {
        ok: false,
        reason: "WhatsApp Cloud API no configurado"
      };
    }

    const cleanPhone = String(phone || "").replace(/\D/g, "");

    if (!cleanPhone) {
      console.log("Teléfono vacío para WhatsApp");
      return {
        ok: false,
        reason: "Teléfono vacío"
      };
    }

    const whatsappPhone = cleanPhone.startsWith("57")
      ? cleanPhone
      : `57${cleanPhone}`;

    const response = await fetch(
      `https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_CLOUD_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: whatsappPhone,
          type: "template",
          template: {
            name: "confirmacion_codigos",
            language: {
              code: "es_CO"
            },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: String(buyerName || "Cliente")
                  },
                  {
                    type: "text",
                    text: String(orderDetail || "Orden aprobada en PromoClaras")
                  },
                  {
                    type: "text",
                    text: String(couponList || "-")
                  },
                  {
                    type: "text",
                    text: String(quantity || "0")
                  },
                  {
                    type: "text",
                    text: String(orderUrl || "")
                  }
                ]
              }
            ]
          }
        })
      }
    );

    const result = await response.json();

    console.log("WhatsApp plantilla confirmacion_codigos status:", response.status);
    console.log("WhatsApp plantilla confirmacion_codigos response:", JSON.stringify(result, null, 2));

    return {
      ok: response.ok,
      status: response.status,
      response: result
    };
  } catch (error) {
    console.error("Error enviando plantilla WhatsApp:", error);

    return {
      ok: false,
      reason: error.message
    };
  }
}

async function sendOrderCouponsWhatsApp(orderId, forceResend = false) {
  try {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        buyers(*),
        rifas(*)
      `)
      .eq("id", orderId)
      .single();

    if (orderError) throw orderError;
    if (!order) throw new Error("Orden no encontrada");

    if (order.whatsapp_sent && !forceResend) {
  console.log("WhatsApp ya enviado para la orden:", orderId);
  return {
    ok: true,
    skipped: true,
    reason: "WhatsApp ya enviado"
  };
}

    if (order.payment_status !== "paid") {
      console.log("Orden aún no está pagada:", orderId);
      return {
        ok: false,
        skipped: true,
        reason: "Orden no pagada"
      };
    }

    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("*")
      .eq("order_id", orderId)
      .order("ticket_code", { ascending: true });

    if (ticketsError) throw ticketsError;

    if (!tickets || tickets.length === 0) {
      console.log("Orden pagada sin Códigos asignados:", orderId);
      return {
        ok: false,
        skipped: true,
        reason: "Sin Códigos asignados"
      };
    }

    const baseUrl = APP_BASE_URL;
    const orderUrl = `${baseUrl}/orden/${order.id}`;

    const couponList = tickets
      .map(t => t.combination || t.ticket_code || "-")
      .join(", ");

    const buyerName = order.buyers?.full_name || "Cliente";
    const orderDetail = "Orden aprobada en PromoClaras";
    const quantity = String(tickets.length);

    const result = await sendWhatsAppTemplateConfirmacionCodigos(
      order.buyers?.phone,
      buyerName,
      orderDetail,
      couponList,
      quantity,
      orderUrl
    );

    if (result.ok) {
      await supabase
        .from("orders")
        .update({
          whatsapp_sent: true
        })
        .eq("id", orderId);
    }

    return result;
  } catch (error) {
    console.error("Error enviando Códigos por WhatsApp:", error);
    return {
      ok: false,
      reason: error.message
    };
  }
}

async function processReferralReward(orderId) {
  try {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        buyers(*),
        rifas(*)
      `)
      .eq("id", orderId)
      .single();

    if (orderError) throw orderError;
    if (!order) return { ok: false, reason: "Orden no encontrada" };

    if (!order.referrer_id) {
      return { ok: true, skipped: true, reason: "Orden sin referido" };
    }

    if (order.is_referral_reward) {
      return { ok: true, skipped: true, reason: "Orden de cortesía por referido" };
    }

    if (order.payment_status !== "paid") {
      return { ok: true, skipped: true, reason: "Orden no pagada" };
    }

    if (!order.rifas?.referral_program_enabled) {
      return { ok: true, skipped: true, reason: "Programa de referidos no activo" };
    }

    const requiredApprovedOrders = Number(order.rifas?.referral_required_approved_orders || 15);

    const { data: referrer, error: referrerError } = await supabase
      .from("campaign_referrers")
      .select("*")
      .eq("id", order.referrer_id)
      .single();

    if (referrerError) throw referrerError;

    const referrerPhone = String(referrer.phone || "").replace(/\D/g, "");
    const buyerPhone = String(order.buyers?.phone || "").replace(/\D/g, "");

    if (referrerPhone && buyerPhone && referrerPhone === buyerPhone) {
      return { ok: true, skipped: true, reason: "Compra propia no cuenta como referido" };
    }

    const { data: existingBuyerReferral, error: existingBuyerReferralError } = await supabase
      .from("campaign_referrals")
      .select("*")
      .eq("rifa_id", order.rifa_id)
      .eq("referrer_id", order.referrer_id)
      .eq("buyer_id", order.buyer_id)
      .maybeSingle();

    if (existingBuyerReferralError) throw existingBuyerReferralError;

    if (!existingBuyerReferral) {
      const { error: referralInsertError } = await supabase
        .from("campaign_referrals")
        .insert({
          rifa_id: order.rifa_id,
          referrer_id: order.referrer_id,
          order_id: order.id,
          buyer_id: order.buyer_id,
          status: "approved",
          counted_at: new Date().toISOString()
        });

      if (referralInsertError) throw referralInsertError;
    }

    const { count: approvedCount, error: countError } = await supabase
      .from("campaign_referrals")
      .select("id", { count: "exact", head: true })
      .eq("rifa_id", order.rifa_id)
      .eq("referrer_id", order.referrer_id)
      .eq("status", "approved");

    if (countError) throw countError;

    const rewardsShouldExist = Math.floor(Number(approvedCount || 0) / requiredApprovedOrders);

    if (rewardsShouldExist <= 0) {
      return {
        ok: true,
        skipped: true,
        approvedCount,
        reason: "Aún no cumple la meta de referidos"
      };
    }

    const { count: existingRewards, error: existingRewardsError } = await supabase
      .from("referral_rewards")
      .select("id", { count: "exact", head: true })
      .eq("rifa_id", order.rifa_id)
      .eq("referrer_id", order.referrer_id);

    if (existingRewardsError) throw existingRewardsError;

    if (Number(existingRewards || 0) >= rewardsShouldExist) {
      return {
        ok: true,
        skipped: true,
        approvedCount,
        existingRewards,
        reason: "La cortesía correspondiente ya fue creada"
      };
    }

    const { data: freshCampaign, error: freshCampaignError } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", order.rifa_id)
      .single();

    if (freshCampaignError) throw freshCampaignError;

    if (Number(freshCampaign.available_tickets || 0) < 1) {
      return {
        ok: false,
        skipped: true,
        reason: "No hay códigos disponibles para entregar cortesía"
      };
    }

    let rewardBuyer = null;

    const { data: existingBuyer, error: existingBuyerError } = await supabase
      .from("buyers")
      .select("*")
      .eq("phone", referrerPhone)
      .maybeSingle();

    if (existingBuyerError) throw existingBuyerError;

    if (existingBuyer) {
      rewardBuyer = existingBuyer;
    } else {
      const { data: newBuyer, error: newBuyerError } = await supabase
        .from("buyers")
        .insert({
          full_name: referrer.full_name,
          phone: referrerPhone,
          email: null
        })
        .select()
        .single();

      if (newBuyerError) throw newBuyerError;
      rewardBuyer = newBuyer;
    }

    const { data: rewardOrder, error: rewardOrderError } = await supabase
      .from("orders")
      .insert({
        rifa_id: order.rifa_id,
        buyer_id: rewardBuyer.id,
        qty: 1,
        subtotal: 0,
        total_paid: 0,
        commission: 0,
        payment_status: "paid",
        referral_code: referrer.referral_code,
        referrer_id: referrer.id,
        is_referral_reward: true
      })
      .select()
      .single();

    if (rewardOrderError) throw rewardOrderError;

    await supabase
      .from("payments")
      .insert({
        order_id: rewardOrder.id,
        provider: "referral_reward",
        external_reference: `ref_${Date.now()}_${rewardOrder.id.slice(0, 8)}`,
        amount: 0,
        status: "approved"
      });

    await assignTicketsToOrder(rewardOrder.id);

    const newSoldTickets = Number(freshCampaign.sold_tickets || 0) + 1;
    const newAvailableTickets = Number(freshCampaign.max_tickets || 0) - newSoldTickets;

    await supabase
      .from("rifas")
      .update({
        sold_tickets: newSoldTickets,
        available_tickets: newAvailableTickets
      })
      .eq("id", order.rifa_id);

    await supabase
      .from("referral_rewards")
      .insert({
        rifa_id: order.rifa_id,
        referrer_id: referrer.id,
        order_id: rewardOrder.id,
        reward_number: Number(existingRewards || 0) + 1,
        required_approved_orders: requiredApprovedOrders,
        status: "created"
      });

    await sendOrderCouponsWhatsApp(rewardOrder.id, true);

    return {
      ok: true,
      rewardCreated: true,
      approvedCount,
      rewardOrderId: rewardOrder.id
    };
  } catch (error) {
    console.error("Error procesando referido:", error);
    return {
      ok: false,
      reason: error.message
    };
  }
}

function campaignStatusLabel(status) {
  if (status === "active") return "Activa";
  if (status === "pending") return "Pendiente";
  if (status === "finished") return "Finalizada";
  if (status === "cancelled") return "Rechazada";
  return status || "-";
}

function moneyCOP(value) {
  return `$${Math.round(Number(value || 0)).toLocaleString("es-CO")}`;
}

function calculateFinancialSummary(payments = []) {
  const approvedPayments = (payments || []).filter(p => p.status === "approved");

  const grossRevenue = approvedPayments.reduce(
    (acc, p) => acc + Number(p.amount || 0),
    0
  );

  const platformFee = grossRevenue * 0.05;

  const wompiBaseFee = approvedPayments.reduce((acc, p) => {
    const amount = Number(p.amount || 0);
    return acc + (amount * 0.0265) + 700;
  }, 0);

  const wompiVat = wompiBaseFee * 0.19;
  const wompiEstimatedFee = wompiBaseFee + wompiVat;

  const estimatedNetToOrganizer = grossRevenue - platformFee - wompiEstimatedFee;

  return {
    approvedPaymentsCount: approvedPayments.length,
    grossRevenue,
    platformFee,
    wompiBaseFee,
    wompiVat,
    wompiEstimatedFee,
    estimatedNetToOrganizer
  };
}

function calculateWompiFeeForPayment(amount) {
  const value = Number(amount || 0);

  if (value <= 0) {
    return {
      baseFee: 0,
      vat: 0,
      totalFee: 0
    };
  }

  const baseFee = (value * 0.0265) + 700;
  const vat = baseFee * 0.19;
  const totalFee = baseFee + vat;

  return {
    baseFee,
    vat,
    totalFee
  };
}

function calculateCampaignFinancialSummary(campaign, campaignOrders = [], campaignPayments = []) {
  const paidOrderIds = new Set(
    (campaignOrders || [])
      .filter(o => o.payment_status === "paid")
      .map(o => o.id)
  );

  const approvedPayments = (campaignPayments || []).filter(p => {
    return p.status === "approved" && paidOrderIds.has(p.order_id);
  });

  const soldQty = (campaignOrders || [])
  .filter(o => o.payment_status === "paid")
  .reduce((acc, o) => acc + Number(o.qty || 0), 0);

  const grossRevenue = approvedPayments.reduce(
    (acc, p) => acc + Number(p.amount || 0),
    0
  );

  const platformFeePercent = Number(campaign.platform_fee_percent || 5);
  const platformFee = grossRevenue * (platformFeePercent / 100);

  const gatewayFee = approvedPayments.reduce((acc, p) => {
    return acc + calculateWompiFeeForPayment(p.amount).totalFee;
  }, 0);

  const prizeType = campaign.prize_type || "physical";
  const prizeCashAmount = Number(campaign.prize_cash_amount || 0);

  const prizeDeduction = prizeType === "money"
    ? prizeCashAmount
    : 0;

  const netToOrganizer = grossRevenue - platformFee - gatewayFee - prizeDeduction;

  return {
  approvedPaymentsCount: approvedPayments.length,
  soldQty,
  grossRevenue,
  platformFee,
  gatewayFee,
  prizeType,
  prizeCashAmount,
  prizeDeduction,
  netToOrganizer
};
}

function prizeTypeLabel(value) {
  if (value === "money") return "Premio en dinero";
  return "Premio físico / especie";
}

function prizeDeliveryStatusLabel(value) {
  if (value === "delivered") return "Premio entregado";
  if (value === "not_required") return "No aplica";
  return "Pendiente entrega premio";
}

function payoutStatusLabel(value) {
  if (value === "paid") return "Giro realizado";
  if (value === "blocked") return "Bloqueado";
  return "Pendiente giro";
}

function canPayOrganizer(campaign) {
  if (campaign.status !== "finished") {
    return false;
  }

  if (campaign.payout_status === "paid") {
    return false;
  }

  if (!campaign.winner_ticket_id) {
    return true;
  }

  return campaign.prize_delivery_status === "delivered";
}

function campaignStatusClass(status) {
  if (status === "finished") return "approved";
  if (status === "active") return "approved";
  if (status === "pending") return "pending";
  return "pending";
}


function generateTicketCode(drawMode) {
  if (drawMode.startsWith("baloto_")) {
    return generateBalotoCombination(drawMode);
  }

  if (drawMode === "loteria_2_primeras") {
    return String(randomInt(0, 99)).padStart(2, "0");
  }

  if (drawMode === "loteria_2_ultimas") {
    return String(randomInt(0, 99)).padStart(2, "0");
  }

  if (drawMode === "loteria_3_primeras") {
    return String(randomInt(0, 999)).padStart(3, "0");
  }

  if (drawMode === "loteria_3_ultimas") {
    return String(randomInt(0, 999)).padStart(3, "0");
  }

  if (drawMode === "loteria_4_pleno") {
    return String(randomInt(0, 9999)).padStart(4, "0");
  }

  return crypto.randomUUID().slice(0, 8);
}

function generateBalotoCombination(drawMode) {
  const quantity = getBalotoPickCount(drawMode);

  if (!quantity) {
    throw new Error("Modalidad Baloto no válida");
  }

  let attempts = 0;

  while (attempts < 5000) {
    attempts++;

    const numbers = [];

    while (numbers.length < quantity) {
      const n = randomInt(1, 43);

      if (!numbers.includes(n)) {
        numbers.push(n);
      }
    }

    if (isValidBalotoCombinationForMode(numbers, drawMode)) {
      return formatBalotoCombination(numbers);
    }
  }

  throw new Error("No fue posible generar una combinación válida para esta modalidad de Baloto.");
}

async function assignTicketsToOrder(orderId) {
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select(`
      id,
      qty,
      buyer_id,
      rifa_id,
      rifas (
        id,
        draw_mode,
        max_tickets
      )
    `)
    .eq("id", orderId)
    .single();

  if (orderError) throw orderError;
  if (!orderData) throw new Error("Orden no encontrada");

  const qty = Number(orderData.qty || 0);
  const maxTickets = Number(orderData.rifas?.max_tickets || 0);

  const { data: existingTickets, error: existingError } = await supabase
  .from("tickets")
  .select("ticket_code, combination")
  .eq("rifa_id", orderData.rifa_id);

  if (existingError) throw existingError;

  const usedTicketCodes = new Set(
  (existingTickets || []).map(t => String(t.ticket_code))
);

const usedCombinations = new Set(
  (existingTickets || []).map(t => String(t.combination))
);

  const assignedTickets = [];
  let current = 1;

while (assignedTickets.length < qty && current <= maxTickets) {
  const ticketCode = String(current).padStart(4, "0");

  if (usedTicketCodes.has(ticketCode)) {
    current++;
    continue;
  }

  let combination = "";
  let attempts = 0;

  do {
    combination = generateTicketCode(orderData.rifas?.draw_mode);
    attempts++;
  } while (usedCombinations.has(combination) && attempts < 1000);

  if (!combination || usedCombinations.has(combination)) {
    throw new Error("No fue posible generar combinación única");
  }

  assignedTickets.push({
    rifa_id: orderData.rifa_id,
    order_id: orderData.id,
    buyer_id: orderData.buyer_id,
    ticket_code: ticketCode,
    combination,
    status: "active"
  });

  usedTicketCodes.add(ticketCode);
  usedCombinations.add(combination);

  current++;
}

  if (assignedTickets.length < qty) {
    throw new Error("No hay suficientes tickets disponibles");
  }

  const { error: insertError } = await supabase
    .from("tickets")
    .insert(assignedTickets);

  if (insertError) throw insertError;

  return assignedTickets;
}

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>CampaClick</title>

      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          min-height: 100vh;
          font-family: Arial, sans-serif;
          color: white;
          background:
            radial-gradient(circle at 15% 15%, rgba(59,130,246,.55), transparent 30%),
            radial-gradient(circle at 85% 20%, rgba(168,85,247,.45), transparent 28%),
            radial-gradient(circle at 50% 90%, rgba(34,197,94,.22), transparent 32%),
            linear-gradient(135deg, #020617, #0f172a 45%, #111827);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow-x: hidden;
        }

        body::before {
          content: "";
          position: fixed;
          inset: 0;
          background:
            linear-gradient(120deg, rgba(255,255,255,.08), transparent 35%),
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.08), transparent 35%);
          pointer-events: none;
        }

        .shell {
          width: 100%;
          max-width: 1060px;
          position: relative;
          z-index: 1;
        }

        .glass-main {
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 30px;
          box-shadow:
            0 30px 90px rgba(0,0,0,.36),
            inset 0 1px 0 rgba(255,255,255,.25);
          overflow: hidden;
        }

        .hero {
          padding: 54px 34px 34px;
          text-align: center;
          background:
            linear-gradient(135deg, rgba(37,99,235,.42), rgba(124,58,237,.26)),
            rgba(255,255,255,.06);
          border-bottom: 1px solid rgba(255,255,255,.18);
        }

        .brand {
          width: 82px;
          height: 82px;
          margin: 0 auto 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 26px;
          background: rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255,255,255,.32);
          box-shadow:
            0 16px 40px rgba(0,0,0,.20),
            inset 0 1px 0 rgba(255,255,255,.35);
          font-size: 38px;
        }

        h1 {
          margin: 0;
          font-size: 52px;
          font-weight: 900;
          letter-spacing: .4px;
          text-shadow: 0 8px 26px rgba(0,0,0,.24);
        }

        .subtitle {
          margin: 16px auto 0;
          max-width: 760px;
          color: rgba(255,255,255,.86);
          font-size: 18px;
          line-height: 1.55;
        }

        .content {
          padding: 30px 34px 36px;
        }

        .notice {
          background: rgba(255,255,255,.12);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,.24);
          color: rgba(255,255,255,.90);
          padding: 17px;
          border-radius: 22px;
          line-height: 1.5;
          margin-bottom: 22px;
          text-align: center;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.22);
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .action {
          position: relative;
          overflow: hidden;
          display: block;
          padding: 24px 18px;
          border-radius: 24px;
          text-decoration: none;
          color: white;
          font-weight: 800;
          text-align: center;
          background: rgba(255,255,255,.12);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255,255,255,.26);
          box-shadow:
            0 18px 40px rgba(0,0,0,.22),
            inset 0 1px 0 rgba(255,255,255,.24);
          transition: transform .22s ease, opacity .22s ease, box-shadow .22s ease;
        }

        .action::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,.24), transparent 42%);
          opacity: .7;
          pointer-events: none;
        }

        .action:hover {
          transform: translateY(-4px) scale(1.01);
          opacity: .96;
          box-shadow:
            0 24px 54px rgba(0,0,0,.30),
            inset 0 1px 0 rgba(255,255,255,.28);
        }

        .action span,
        .action small {
          position: relative;
          z-index: 1;
        }

        .action span {
          display: block;
          font-size: 21px;
          margin-bottom: 7px;
          text-shadow: 0 4px 14px rgba(0,0,0,.20);
        }

        .action small {
          display: block;
          font-size: 13px;
          font-weight: 500;
          opacity: .88;
          line-height: 1.4;
        }

        .blue {
          background:
            linear-gradient(135deg, rgba(37,99,235,.72), rgba(29,78,216,.52)),
            rgba(255,255,255,.12);
        }

        .green {
          background:
            linear-gradient(135deg, rgba(22,163,74,.72), rgba(21,128,61,.52)),
            rgba(255,255,255,.12);
        }

        .dark {
          background:
            linear-gradient(135deg, rgba(15,23,42,.84), rgba(2,6,23,.70)),
            rgba(255,255,255,.10);
        }

        .purple {
          background:
            linear-gradient(135deg, rgba(124,58,237,.78), rgba(91,33,182,.56)),
            rgba(255,255,255,.12);
        }

        .admin-wide {
          grid-column: 1 / -1;
          max-width: 540px;
          width: 100%;
          margin: 0 auto;
        }

        .footer {
          margin-top: 24px;
          text-align: center;
          color: rgba(255,255,255,.68);
          font-size: 13px;
          line-height: 1.5;
        }

        @media (max-width: 720px) {
          body {
            padding: 14px;
            align-items: flex-start;
          }

          .hero {
            padding: 42px 22px 26px;
          }

          h1 {
            font-size: 38px;
          }

          .subtitle {
            font-size: 15px;
          }

          .content {
            padding: 22px;
          }

          .grid {
            grid-template-columns: 1fr;
          }

          .admin-wide {
            max-width: 100%;
          }
        }
      </style>
    </head>

    <body>
      <main class="shell">
        <section class="glass-main">
          <div class="hero">
            <div class="brand">🎯</div>

            <h1>CampaClick</h1>

            <p class="subtitle">
              Plataforma moderna para crear, administrar y consultar campañas promocionales
              con asignación automática de códigos después del pago aprobado.
            </p>
          </div>

          <section class="content">
            <div class="notice">
              Consulta tus códigos promocionales, explora campañas activas, ingresa como organizador
              o administra la plataforma desde un solo lugar.
            </div>

            <div class="grid">
              <a class="action blue" href="/consultar">
                <span>Consultar mis códigos</span>
                <small>Revisa tus órdenes y códigos promocionales asignados.</small>
              </a>

              <a class="action blue" href="/campanas">
                <span>Ver campañas activas</span>
                <small>Explora las campañas disponibles para participar.</small>
              </a>

              <a class="action green" href="/organizers/login">
                <span>Ingreso organizador</span>
                <small>Administra tus campañas, ventas y resultados.</small>
              </a>

              <a class="action dark" href="/organizers/register">
                <span>Crear cuenta</span>
                <small>Registra tu perfil para solicitar verificación.</small>
              </a>

              <a class="action purple admin-wide" href="/admin/login">
                <span>Ingreso administrador</span>
                <small>Revisión de organizadores, campañas y resultados.</small>
              </a>
            </div>

            <div class="footer">
              © CampaClick — Plataforma de campañas promocionales<br/>
              Los códigos se asignan automáticamente después del pago aprobado.
            </div>
          </section>
        </section>
      </main>
    </body>
    </html>
  `);
});

app.get("/health", async (req, res) => {
  try {
    const { error } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    if (error) throw error;

    return res.json({
      ok: true,
      app: "PROMOCLARAS V2",
      status: "healthy"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      app: "PROMOCLARAS V2",
      error: error.message
    });
  }
});

app.get("/organizers/register", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Registro organizador - CampaClick</title>

      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          min-height: 100vh;
          font-family: Arial, sans-serif;
          color: white;
          background:
            radial-gradient(circle at 15% 15%, rgba(59,130,246,.50), transparent 30%),
            radial-gradient(circle at 85% 20%, rgba(168,85,247,.42), transparent 30%),
            radial-gradient(circle at 50% 90%, rgba(34,197,94,.20), transparent 32%),
            linear-gradient(135deg, #020617, #0f172a 45%, #111827);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        body::before {
          content: "";
          position: fixed;
          inset: 0;
          background:
            linear-gradient(120deg, rgba(255,255,255,.08), transparent 36%),
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.08), transparent 35%);
          pointer-events: none;
        }

        .card {
          width: 100%;
          max-width: 560px;
          position: relative;
          z-index: 1;
          background: rgba(255,255,255,.13);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,.28);
          border-radius: 30px;
          padding: 34px;
          box-shadow:
            0 30px 90px rgba(0,0,0,.36),
            inset 0 1px 0 rgba(255,255,255,.25);
        }

        .brand {
          width: 72px;
          height: 72px;
          margin: 0 auto 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 24px;
          background: rgba(255,255,255,.16);
          border: 1px solid rgba(255,255,255,.32);
          box-shadow:
            0 16px 40px rgba(0,0,0,.22),
            inset 0 1px 0 rgba(255,255,255,.35);
          font-size: 34px;
        }

        h1 {
          margin: 0;
          text-align: center;
          font-size: 34px;
          font-weight: 900;
          letter-spacing: .2px;
          text-shadow: 0 8px 24px rgba(0,0,0,.24);
        }

        .subtitle {
          margin: 12px auto 26px;
          text-align: center;
          color: rgba(255,255,255,.78);
          line-height: 1.5;
          font-size: 15px;
        }

        label {
          display: block;
          margin-bottom: 7px;
          color: rgba(255,255,255,.88);
          font-weight: 700;
          font-size: 14px;
        }

        .field {
          margin-bottom: 16px;
        }

        input {
          width: 100%;
          padding: 15px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.25);
          background: rgba(255,255,255,.13);
          color: white;
          outline: none;
          font-size: 15px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
          transition: border .2s ease, background .2s ease, box-shadow .2s ease;
        }

        input::placeholder {
          color: rgba(255,255,255,.48);
        }

        input:focus {
          border: 1px solid rgba(96,165,250,.8);
          background: rgba(255,255,255,.18);
          box-shadow:
            0 0 0 4px rgba(37,99,235,.22),
            inset 0 1px 0 rgba(255,255,255,.22);
        }

        button {
          width: 100%;
          margin-top: 6px;
          padding: 16px;
          border: none;
          border-radius: 18px;
          background:
            linear-gradient(135deg, rgba(37,99,235,.95), rgba(124,58,237,.88));
          color: white;
          font-size: 17px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 18px 40px rgba(37,99,235,.28);
          transition: transform .2s ease, opacity .2s ease, box-shadow .2s ease;
        }

        button:hover {
          transform: translateY(-2px);
          opacity: .94;
          box-shadow: 0 24px 54px rgba(37,99,235,.34);
        }

        .login-link {
          margin-top: 18px;
          text-align: center;
        }

        .login-link a {
          color: white;
          font-weight: 800;
          text-decoration: none;
          padding: 11px 14px;
          display: inline-block;
          border-radius: 14px;
          background: rgba(255,255,255,.11);
          border: 1px solid rgba(255,255,255,.22);
          transition: opacity .2s ease, transform .2s ease;
        }

        .login-link a:hover {
          opacity: .88;
          transform: translateY(-1px);
        }

        .back {
          margin-top: 14px;
          text-align: center;
        }

        .back a {
          color: rgba(255,255,255,.72);
          text-decoration: none;
          font-size: 13px;
        }

        @media (max-width: 640px) {
          body {
            padding: 14px;
            align-items: flex-start;
          }

          .card {
            padding: 26px 22px;
            border-radius: 26px;
          }

          h1 {
            font-size: 29px;
          }
        }
      </style>
    </head>

    <body>
      <main class="card">
        <div class="brand">🎯</div>

        <h1>Crear cuenta de organizador</h1>

        <p class="subtitle">
          Registra tu perfil para crear campañas promocionales, solicitar verificación
          y administrar tus ventas desde CampaClick.
        </p>

        <form method="POST" action="/organizers/register">
          <div class="field">
            <label>Nombre completo</label>
            <input
              type="text"
              name="full_name"
              required
              placeholder="Ej: Juan Pérez"
            >
          </div>

          <div class="field">
            <label>Correo electrónico</label>
            <input
              type="email"
              name="email"
              required
              placeholder="Ej: correo@ejemplo.com"
            >
          </div>

          <div class="field">
            <label>Teléfono</label>
            <input
              type="text"
              name="phone"
              placeholder="Ej: 3001234567"
            >
          </div>

          <div class="field">
            <label>Contraseña</label>
            <input
              type="password"
              name="password"
              required
              placeholder="Crea una contraseña segura"
            >
          </div>

          <button type="submit">
            Crear cuenta
          </button>
        </form>

        <div class="login-link">
          <a href="/organizers/login">Ya tengo cuenta</a>
        </div>

        <div class="back">
          <a href="/">Volver al inicio</a>
        </div>
      </main>
    </body>
    </html>
  `);
});

app.post("/organizers/register", async (req, res) => {
  try {
    const fullName = String(req.body.full_name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "").trim();

    if (!fullName || !email || !password) {
      return res.status(400).send("Faltan campos obligatorios");
    }

    const { data: existingOrganizer, error: existingError } = await supabase
      .from("organizers")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingOrganizer) {
      return res.status(400).send("Ya existe un organizador con ese correo");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({})
      .select()
      .single();

    if (profileError) throw profileError;

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: organizer, error: organizerError } = await supabase
      .from("organizers")
      .insert({
        profile_id: profile.id,
        full_name: fullName,
        email,
        phone: phone || null,
        password: passwordHash,
        verification_status: "pending"
      })
      .select()
      .single();

    if (organizerError) throw organizerError;

    return res.redirect(`/organizers/login?registered=1&email=${encodeURIComponent(organizer.email)}`);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/organizers/login", (req, res) => {
  const email = String(req.query.email || "").trim();
  const registered = req.query.registered === "1";

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Ingreso organizador - CampaClick</title>

      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          min-height: 100vh;
          font-family: Arial, sans-serif;
          color: white;
          background:
            radial-gradient(circle at 15% 15%, rgba(37,99,235,.55), transparent 32%),
            radial-gradient(circle at 85% 20%, rgba(124,58,237,.45), transparent 34%),
            radial-gradient(circle at 50% 88%, rgba(22,163,74,.24), transparent 34%),
            linear-gradient(135deg, #020617, #0f172a 45%, #111827);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow-x: hidden;
        }

        body::before {
          content: "";
          position: fixed;
          inset: 0;
          background:
            linear-gradient(120deg, rgba(255,255,255,.10), transparent 38%),
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.07), transparent 36%);
          pointer-events: none;
        }

        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 560px;
          background: rgba(255,255,255,.13);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,.28);
          border-radius: 30px;
          padding: 36px;
          box-shadow:
            0 30px 90px rgba(0,0,0,.36),
            inset 0 1px 0 rgba(255,255,255,.25);
        }

        .brand {
          width: 72px;
          height: 72px;
          margin: 0 auto 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 24px;
          background: rgba(255,255,255,.16);
          border: 1px solid rgba(255,255,255,.32);
          box-shadow:
            0 16px 40px rgba(0,0,0,.22),
            inset 0 1px 0 rgba(255,255,255,.35);
          font-size: 34px;
        }

        h1 {
          margin: 0;
          text-align: center;
          font-size: 36px;
          font-weight: 900;
          letter-spacing: .2px;
          text-shadow: 0 8px 24px rgba(0,0,0,.24);
        }

        .subtitle {
          margin: 12px auto 26px;
          text-align: center;
          color: rgba(255,255,255,.78);
          line-height: 1.5;
          font-size: 15px;
        }

        .success {
          margin-bottom: 18px;
          padding: 14px;
          background: rgba(34,197,94,.18);
          border: 1px solid rgba(134,239,172,.38);
          border-radius: 16px;
          color: #dcfce7;
          font-weight: 700;
          text-align: center;
        }

        .field {
          margin-bottom: 16px;
        }

        label {
          display: block;
          margin-bottom: 7px;
          color: rgba(255,255,255,.88);
          font-weight: 700;
          font-size: 14px;
        }

        input {
          width: 100%;
          padding: 15px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.25);
          background: rgba(255,255,255,.13);
          color: white;
          outline: none;
          font-size: 15px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
          transition: border .2s ease, background .2s ease, box-shadow .2s ease;
        }

        input::placeholder {
          color: rgba(255,255,255,.48);
        }

        input:focus {
          border: 1px solid rgba(96,165,250,.8);
          background: rgba(255,255,255,.18);
          box-shadow:
            0 0 0 4px rgba(37,99,235,.22),
            inset 0 1px 0 rgba(255,255,255,.22);
        }

        button {
          width: 100%;
          margin-top: 6px;
          padding: 16px;
          border: none;
          border-radius: 18px;
          background:
            linear-gradient(135deg, rgba(22,163,74,.96), rgba(37,99,235,.88));
          color: white;
          font-size: 17px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 18px 40px rgba(22,163,74,.25);
          transition: transform .2s ease, opacity .2s ease, box-shadow .2s ease;
        }

        button:hover {
          transform: translateY(-2px);
          opacity: .94;
          box-shadow: 0 24px 54px rgba(22,163,74,.32);
        }

        .links {
          margin-top: 20px;
          display: grid;
          gap: 10px;
        }

        .links a {
          color: white;
          font-weight: 800;
          text-decoration: none;
          padding: 13px 14px;
          display: block;
          text-align: center;
          border-radius: 16px;
          background: rgba(255,255,255,.11);
          border: 1px solid rgba(255,255,255,.22);
          transition: opacity .2s ease, transform .2s ease;
        }

        .links a:hover {
          opacity: .88;
          transform: translateY(-1px);
        }

        .links .secondary {
          color: rgba(255,255,255,.74);
          font-size: 13px;
          background: transparent;
          border: none;
          padding: 6px;
        }

        @media (max-width: 640px) {
          body {
            padding: 14px;
            align-items: flex-start;
          }

          .login-card {
            padding: 28px 22px;
            border-radius: 26px;
          }

          h1 {
            font-size: 31px;
          }
        }
      </style>
    </head>

    <body>
      <main class="login-card">
        <div class="brand">🎯</div>

        <h1>Ingreso organizador</h1>

        <p class="subtitle">
          Accede a tu panel para administrar campañas, revisar ventas,
          consultar códigos y gestionar resultados.
        </p>

        ${
          registered
            ? `
              <div class="success">
                Cuenta creada correctamente. Ahora inicia sesión.
              </div>
            `
            : ""
        }

        <form method="POST" action="/organizers/login">
          <div class="field">
            <label>Correo electrónico</label>
            <input
              type="email"
              name="email"
              value="${email}"
              required
              placeholder="Ej: correo@ejemplo.com"
            >
          </div>

          <div class="field">
            <label>Contraseña</label>
            <input
              type="password"
              name="password"
              required
              placeholder="Escribe tu contraseña"
            >
          </div>

          <button type="submit">
            Ingresar
          </button>
        </form>

        <div class="links">
          <a href="/organizers/register">Crear cuenta de organizador</a>
          <a class="secondary" href="/">Volver al inicio</a>
        </div>
      </main>
    </body>
    </html>
  `);
});

app.post("/organizers/login", loginLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();

    if (!email || !password) {
      return res.status(400).send("Faltan credenciales");
    }

    const { data: organizer, error } = await supabase
  .from("organizers")
  .select("*")
  .eq("email", email)
  .maybeSingle();

if (error) throw error;

if (!organizer) {
  return res.status(401).send("Correo o contraseña incorrectos");
}

const passwordOk = await bcrypt.compare(password, organizer.password || "");

if (!passwordOk) {
  return res.status(401).send("Correo o contraseña incorrectos");
}

    req.session.organizerId = organizer.id;

    return res.redirect(`/organizers/${organizer.id}/panel`);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/organizers/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/organizers/login");
  });
});

app.get("/organizers/:organizerId/panel", async (req, res) => {
  try {
    const { organizerId } = req.params;

    if (!req.session.organizerId) {
      return res.redirect("/organizers/login");
    }

    if (String(req.session.organizerId) !== String(organizerId)) {
      return res.redirect("/organizers/login");
    }

    const { data: organizer, error } = await supabase
      .from("organizers")
      .select("*")
      .eq("id", organizerId)
      .single();

    if (error || !organizer) {
      return res.status(404).send("Organizador no encontrado");
    }

let verificationHtml = "";

if (organizer.verification_status === "verified") {
  verificationHtml = `
    <div style="margin-top:18px;padding:14px;background:#ecfdf5;border-radius:12px;color:#166534;font-weight:700;">
      ✔ Verificación aprobada
    </div>
  `;
} else if (organizer.verification_status === "rejected") {
  verificationHtml = `
    <div style="margin-top:18px;padding:14px;background:#fee2e2;border:1px solid #fecaca;border-radius:12px;color:#991b1b;font-weight:700;">
      ❌ Verificación rechazada
    </div>

    ${
      organizer.rejection_reason
        ? `
          <div style="margin-top:10px;padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;color:#9a3412;line-height:1.5;">
            <b>Motivo del rechazo:</b><br/>
            ${organizer.rejection_reason}
          </div>
        `
        : ""
    }

    <div style="margin-top:18px;">
      <a
        href="/organizers/${organizer.id}/verificacion"
        style="display:inline-block;padding:12px 18px;background:#dc2626;color:white;text-decoration:none;border-radius:10px;font-weight:700;"
      >
        Corregir verificación
      </a>
    </div>
  `;
} else if (
  organizer.document_number ||
  organizer.id_front_url ||
  organizer.id_back_url ||
  organizer.selfie_id_url ||
  organizer.payout_method ||
  organizer.account_number ||
  organizer.terms_accepted
) {
  verificationHtml = `
    <div style="margin-top:18px;padding:14px;background:#fff7ed;border-radius:12px;color:#9a3412;font-weight:700;">
      ⏳ Verificación enviada. Pendiente de revisión.
    </div>
  `;
} else {
  verificationHtml = `
    <div style="margin-top:18px;">
      <a
        href="/organizers/${organizer.id}/verificacion"
        style="display:inline-block;padding:12px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:10px;font-weight:700;"
      >
        Completar verificación
      </a>
    </div>
  `;
}

const { data: campaigns, error: campaignsError } = await supabase
  .from("rifas")
  .select("*")
  .eq("owner_id", organizer.profile_id)
  .order("created_at", { ascending: false });

if (campaignsError) throw campaignsError;

const campaignIds = (campaigns || []).map(c => c.id);

let orders = [];
let payments = [];
let tickets = [];

if (campaignIds.length > 0) {
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select(`
      *,
      buyers(*)
    `)
    .in("rifa_id", campaignIds)
    .order("created_at", { ascending: false });

  if (ordersError) throw ordersError;
  orders = ordersData || [];

  const orderIds = orders.map(o => o.id);

  if (orderIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .in("order_id", orderIds);

    if (paymentsError) throw paymentsError;
    payments = paymentsData || [];

    const { data: ticketsData, error: ticketsError } = await supabase
      .from("tickets")
      .select("*")
      .in("order_id", orderIds);

    if (ticketsError) throw ticketsError;
    tickets = ticketsData || [];
  }
}

const totalCampaignCoupons = (campaigns || []).reduce(
  (acc, c) => acc + Number(c.max_tickets || 0),
  0
);

    const availableCampaignCoupons = (campaigns || []).reduce(
  (acc, c) => acc + Number(c.available_tickets || 0),
  0
);
    
const baseUrl = APP_BASE_URL;

    const financialSummary = calculateFinancialSummary(payments);
    
const campaignRows = (campaigns || []).map(c => {
  const campaignOrders = orders.filter(o => String(o.rifa_id) === String(c.id));
  const campaignOrderIds = campaignOrders.map(o => o.id);
  const campaignPayments = payments.filter(p => campaignOrderIds.includes(p.order_id));

  const campaignFinancial = calculateCampaignFinancialSummary(
    c,
    campaignOrders,
    campaignPayments
  );

  const sold = Number(campaignFinancial.soldQty || c.sold_tickets || 0);
  const total = Number(c.max_tickets || 0);

  const percent = total > 0
    ? Math.min(100, Math.round((sold / total) * 100))
    : 0;

  return `
  
  <tr>
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${c.title}</td>
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${c.prize}</td>
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${getDrawProviderLabel(c.draw_provider)}</td>
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${getDrawModeLabel(c.draw_mode)}</td>
   <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;min-width:230px;">
  <div style="font-weight:bold;color:#111827;font-size:15px;">
    $${Number(c.price_per_ticket || 0).toLocaleString("es-CO")}
  </div>

  <div style="
    margin-top:8px;
    padding:9px;
    background:#f9fafb;
    border:1px solid #e5e7eb;
    border-radius:10px;
    font-size:12px;
    color:#374151;
    line-height:1.4;
    text-align:left;
  ">
    <div style="font-weight:bold;color:#111827;margin-bottom:4px;">
      Costos aplicables
    </div>

    <div>
      Plataforma: <b>5%</b>
    </div>

    <div>
      Wompi: <b>2.65% + $700 + IVA</b> por transacción exitosa.
    </div>

    <div style="margin-top:5px;color:#6b7280;">
      Estos valores se descuentan de las ventas aprobadas y pueden variar según las políticas del proveedor de pagos.
    </div>
  </div>
</td>

    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;min-width:160px;">
  <div style="font-weight:bold;color:#111827;">
    ${sold} / ${total}
  </div>

  <div style="height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-top:6px;">
    <div style="height:100%;width:${percent}%;background:#16a34a;border-radius:999px;"></div>
  </div>

  <div style="font-size:12px;color:#6b7280;margin-top:4px;">
    ${percent}% vendido
  </div>
</td>

<td style="padding:12px;border-bottom:1px solid #e5e7eb;min-width:260px;">
  <div style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;line-height:1.5;font-size:12px;color:#374151;">
    <div style="font-weight:bold;color:#111827;margin-bottom:6px;">
      Liquidación estimada
    </div>

    <div>Recaudo aprobado: <b>${moneyCOP(campaignFinancial.grossRevenue)}</b></div>
    <div>Comisión CampaClick: <b>${moneyCOP(campaignFinancial.platformFee)}</b></div>
    <div>Wompi estimado: <b>${moneyCOP(campaignFinancial.gatewayFee)}</b></div>
    <div>Descuento premio: <b>${moneyCOP(campaignFinancial.prizeDeduction)}</b></div>

    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;font-weight:bold;color:#065f46;">
      Neto aproximado a girar: ${moneyCOP(campaignFinancial.netToOrganizer)}
    </div>

    <div style="margin-top:8px;color:#6b7280;">
      ${prizeTypeLabel(c.prize_type)}
    </div>

    <div style="margin-top:4px;color:#6b7280;">
      Premio: ${prizeDeliveryStatusLabel(c.prize_delivery_status)}
    </div>

    <div style="margin-top:4px;color:#6b7280;">
      Giro: ${payoutStatusLabel(c.payout_status)}
    </div>
  </div>
</td>

<td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;min-width:170px;">
  <span class="badge ${campaignStatusClass(c.status)}">
    ${campaignStatusLabel(c.status)}
  </span>

  ${
    c.status === "pending"
      ? `
        <div style="margin-top:6px;font-size:12px;color:#92400e;line-height:1.3;">
          En revisión por el administrador.
        </div>
      `
      : c.status === "active"
        ? `
          <div style="margin-top:6px;font-size:12px;color:#166534;line-height:1.3;">
            Disponible para participar.
          </div>
        `
        : c.status === "cancelled"
  ? `
    <div style="margin-top:6px;font-size:12px;color:#991b1b;line-height:1.3;">
      Rechazada. Debes crear una nueva campaña corregida.
    </div>

    ${
      c.rejection_reason
        ? `
          <div style="margin-top:8px;padding:8px;background:#fee2e2;border:1px solid #fecaca;border-radius:10px;color:#7f1d1d;font-size:12px;line-height:1.4;text-align:left;">
            <b>Motivo:</b><br/>
            ${c.rejection_reason}
          </div>
        `
        : ""
    }
  `
          : c.status === "finished"
            ? `
              <div style="margin-top:6px;font-size:12px;color:#374151;line-height:1.3;">
                Campaña finalizada.
              </div>
            `
            : ""
  }
</td>
    
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;min-width:150px;">
  ${
  c.status === "finished" || c.status === "active"
    ? `
      <a
        href="/resultado/${c.id}"
        style="
          display:block;
          padding:8px 12px;
          background:#2563eb;
          color:white;
          text-decoration:none;
          border-radius:10px;
          font-weight:bold;
          font-size:13px;
          margin-bottom:7px;
        "
      >
        Ver resultado
      </a>
    `
    : `
      <div style="
        padding:8px 12px;
        background:#e5e7eb;
        color:#6b7280;
        border-radius:10px;
        font-weight:bold;
        font-size:13px;
        margin-bottom:7px;
      ">
        Resultado no disponible
      </div>
    `
}

  <a
    href="/campanas/${c.slug}"
    style="
      display:block;
      padding:8px 12px;
      background:#16a34a;
      color:white;
      text-decoration:none;
      border-radius:10px;
      font-weight:bold;
      font-size:13px;
      margin-bottom:7px;
    "
  >
    Ver campaña
  </a>

  ${
  c.status === "active"
    ? `
      <a
        target="_blank"
       href="https://wa.me/?text=${encodeURIComponent(
`Te invito a participar en esta campaña de CampaClick.

Campaña: ${c.title}
Premio: ${c.prize || "-"}
Valor por código promocional: $${Number(c.price_per_ticket || 0).toLocaleString("es-CO")}
Sorteo: ${getDrawProviderLabel(c.draw_provider)}
Modalidad: ${getDrawModeLabel(c.draw_mode)}
Fecha del sorteo: ${c.draw_date || "-"}

Link para participar:
${baseUrl}/campanas/${c.slug}

Los códigos promocionales se asignan automáticamente después del pago aprobado.`
)}"
        style="
          display:block;
          padding:8px 12px;
          background:#22c55e;
          color:white;
          text-decoration:none;
          border-radius:10px;
          font-weight:bold;
          font-size:13px;
        "
      >
        Compartir
      </a>
    `
    : `
      <div style="
        padding:8px 12px;
        background:#e5e7eb;
        color:#6b7280;
        border-radius:10px;
        font-weight:bold;
        font-size:13px;
      ">
        No disponible para compartir
      </div>
    `
}

<a
  href="/organizers/${organizer.id}/campanas/${c.id}/referidos"
  style="
    display:block;
    padding:8px 12px;
    background:#7c3aed;
    color:white;
    text-decoration:none;
    border-radius:10px;
    font-weight:bold;
    font-size:13px;
    margin-top:7px;
  "
>
  Referidos
</a>

</td>
      </tr>
`;
}).join("");
    
    res.setHeader("Content-Type", "text/html; charset=utf-8");
res.send(`
<!DOCTYPE html>
<html lang="es">

<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Panel Organizador</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Arial, sans-serif;
  color: white;
  background:
    radial-gradient(circle at 15% 12%, rgba(37,99,235,.62), transparent 34%),
    radial-gradient(circle at 85% 18%, rgba(124,58,237,.50), transparent 34%),
    radial-gradient(circle at 50% 90%, rgba(22,163,74,.22), transparent 35%),
    linear-gradient(135deg, #020617, #0f172a 48%, #111827);
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  background:
    linear-gradient(120deg, rgba(255,255,255,.10), transparent 35%),
    radial-gradient(circle at 55% 35%, rgba(255,255,255,.07), transparent 34%);
  pointer-events: none;
}

.header {
  position: relative;
  z-index: 1;
  padding: 34px 24px 72px;
  color: white;
  background: rgba(255,255,255,.08);
  border-bottom: 1px solid rgba(255,255,255,.18);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: 0 20px 70px rgba(0,0,0,.28);
}

.header h1 {
  margin: 0;
  font-size: 38px;
  font-weight: 900;
  text-shadow: 0 10px 28px rgba(0,0,0,.35);
}

.header p {
  color: rgba(255,255,255,.74);
  margin: 8px 0 0;
  line-height: 1.5;
}

.container {
  position: relative;
  z-index: 1;
  max-width: 1280px;
  margin: -46px auto 0;
  padding: 0 20px 44px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit,minmax(220px,1fr));
  gap: 18px;
  margin-bottom: 26px;
}

.card,
.table-card {
  background: rgba(255,255,255,.13);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,.26);
  border-radius: 30px;
  padding: 24px;
  box-shadow:
    0 30px 90px rgba(0,0,0,.32),
    inset 0 1px 0 rgba(255,255,255,.22);
  color: white;
}

.table-card {
  overflow: auto;
  margin-top: 26px;
}

.table-card h2 {
  margin-top: 0;
  font-size: 27px;
  font-weight: 900;
  color: white;
  text-shadow: 0 8px 24px rgba(0,0,0,.30);
}

.metric {
  font-size: 38px;
  font-weight: 900;
  color: #93c5fd;
  margin-bottom: 10px;
}

.label {
  color: rgba(255,255,255,.72);
  font-size: 15px;
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  min-width: 1000px;
}

th {
  text-align: left;
  padding: 14px;
  background: rgba(255,255,255,.16);
  color: rgba(255,255,255,.86);
  font-size: 13px;
  border-bottom: 1px solid rgba(255,255,255,.18);
  white-space: nowrap;
}

td {
  padding: 14px;
  border-bottom: 1px solid rgba(255,255,255,.12);
  font-size: 14px;
  color: rgba(255,255,255,.82);
  vertical-align: middle;
}

td b,
td strong {
  color: white;
}

.badge {
  padding: 7px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  display: inline-block;
}

.approved {
  background: rgba(34,197,94,.18);
  color: #86efac;
  border: 1px solid rgba(134,239,172,.32);
}

.pending {
  background: rgba(245,158,11,.18);
  color: #fde68a;
  border: 1px solid rgba(253,230,138,.32);
}

button {
  transition: transform .2s ease, opacity .2s ease;
}

button:hover,
a:hover {
  transform: translateY(-1px);
  opacity: .92;
}

.footer {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 30px;
  color: rgba(255,255,255,.62);
  font-size: 14px;
}

@media (max-width: 800px) {
  .header {
    padding: 28px 16px 64px;
  }

  .header h1 {
    font-size: 30px;
  }

  .container {
    padding: 0 14px 34px;
  }

  .card,
  .table-card {
    padding: 18px;
    border-radius: 26px;
  }

  table {
    min-width: 900px;
  }
}

/* AJUSTE FINAL DE LEGIBILIDAD PANEL ORGANIZADOR */

.table-card,
.card {
  color: #ffffff;
}

.table-card h2,
.card h2,
.card h3 {
  color: #ffffff;
}

th {
  color: rgba(255,255,255,.95) !important;
  background: rgba(255,255,255,.18) !important;
}

td {
  color: rgba(255,255,255,.92) !important;
  border-bottom: 1px solid rgba(255,255,255,.14) !important;
}

td b,
td strong {
  color: #ffffff !important;
}

td div,
td span,
td p,
td small {
  color: rgba(255,255,255,.90);
}

/* Corrige cajas blancas internas */
td div[style*="background:#f9fafb"],
td div[style*="background:#eff6ff"],
td div[style*="background:#ecfdf5"],
td div[style*="background:#fff7ed"],
td div[style*="background:#fee2e2"] {
  background: rgba(255,255,255,.15) !important;
  border: 1px solid rgba(255,255,255,.28) !important;
  color: rgba(255,255,255,.94) !important;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

/* Corrige textos oscuros escritos en estilos inline */
td div[style*="color:#111827"],
td div[style*="color:#374151"],
td div[style*="color:#6b7280"],
td div[style*="color:#065f46"],
td div[style*="color:#166534"],
td div[style*="color:#92400e"],
td div[style*="color:#991b1b"],
td div[style*="color:#7f1d1d"],
td span[style*="color:#111827"],
td span[style*="color:#374151"],
td span[style*="color:#6b7280"],
td span[style*="color:#065f46"],
td span[style*="color:#166534"],
td span[style*="color:#92400e"],
td span[style*="color:#991b1b"],
td span[style*="color:#7f1d1d"] {
  color: rgba(255,255,255,.92) !important;
}

/* Títulos internos de tarjetas */
td div[style*="font-weight:bold"],
td div[style*="font-weight: bold"] {
  color: #ffffff !important;
}

/* Neto, dinero y valores positivos */
td div[style*="color:#065f46"],
td div[style*="color:#166534"] {
  color: #86efac !important;
}

/* Avisos pendientes */
td div[style*="color:#92400e"],
td div[style*="color:#9a3412"] {
  color: #fde68a !important;
}

/* Rechazos o errores */
td div[style*="color:#991b1b"],
td div[style*="color:#7f1d1d"] {
  color: #fecaca !important;
}

/* Barras de avance */
td div[style*="background:#e5e7eb"] {
  background: rgba(255,255,255,.25) !important;
}

/* Botones deshabilitados grises */
td div[style*="background:#e5e7eb"][style*="color:#6b7280"] {
  background: rgba(255,255,255,.18) !important;
  color: rgba(255,255,255,.70) !important;
  border: 1px solid rgba(255,255,255,.22) !important;
}

/* Bordes viejos claros */
tr td[style*="border-bottom:1px solid #e5e7eb"],
tr td[style*="border-bottom:1px solid #eee"] {
  border-bottom: 1px solid rgba(255,255,255,.14) !important;
}

/* Bloque de códigos promocionales asignados */
div[style*="border:1px solid #e5e7eb"] {
  border-color: rgba(255,255,255,.24) !important;
}

div[style*="background:#eff6ff"] {
  background: rgba(255,255,255,.14) !important;
  color: #ffffff !important;
}

/* Inputs dentro del panel */
input,
textarea,
select {
  color: #111827 !important;
  background: rgba(255,255,255,.94) !important;
}

/* Scroll horizontal más visible */
.table-card::-webkit-scrollbar {
  height: 12px;
}

.table-card::-webkit-scrollbar-track {
  background: rgba(255,255,255,.12);
  border-radius: 999px;
}

.table-card::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,.42);
  border-radius: 999px;
}

/* Mejor lectura en móvil */
@media (max-width: 800px) {
  td,
  th {
    font-size: 13px;
  }

  .table-card {
    padding: 16px;
  }
}

</style>
</head>

<body>

<div class="header">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
    <div>
      <h1>Panel del Organizador</h1>
      <p>Consulta tus campañas, ventas y liquidación individual por campaña</p>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <a
        href="/organizers/${organizer.id}/campanas/nueva"
        style="background:#16a34a;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;"
      >
        Nueva campaña
      </a>

      <a
        href="/organizers/${organizer.id}/verificacion"
        style="background:white;color:#1d4ed8;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;"
      >
        Mi verificación
      </a>

      <a
        href="/organizers/logout"
        style="background:#111827;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;"
      >
        Cerrar sesión
      </a>
    </div>
  </div>
</div>

<div class="container">

${verificationHtml}

<div class="table-card">

<h2>Mis campañas</h2>

<table>
<thead>
<tr>
<th>Campaña</th>
<th>Premio</th>
<th>Sorteo</th>
<th>Modalidad</th>
<th>Precio</th>
<th>Avance</th>
<th>Liquidación</th>
<th>Estado</th>
<th>Acciones</th>
</tr>
</thead>

<tbody>
${campaignRows || `
<tr>
<td colspan="9" style="padding:18px;text-align:center;color:#6b7280;">
Aún no tienes campañas creadas.
</td>
</tr>
`}
</tbody>
</table>

</div>

<div class="table-card" style="margin-top:30px;">

<h2>Últimas órdenes</h2>

<table>

<thead>
<tr>
<th>Comprador</th>
<th>Teléfono</th>
<th>Cantidad</th>
<th>Pago</th>
<th>WhatsApp</th>
<th>Fecha</th>
<th>Acción</th>
</tr>
</thead>

<tbody>

${orders.map(order=>`

<tr>

<td>${order.buyers?.full_name || "-"}</td>

<td>${order.buyers?.phone || "-"}</td>

<td>${order.qty}</td>

<td>
<span class="badge ${order.payment_status === "paid" ? "approved" : "pending"}">
${order.payment_status === "paid" ? "approved" : order.payment_status}</span>
</td>

<td>
  <span class="badge ${order.whatsapp_sent ? "approved" : "pending"}">
    ${order.whatsapp_sent ? "enviado" : "pendiente"}
  </span>
</td>

<td>
${new Date(order.created_at).toLocaleString("es-CO")}
</td>

<td>
  ${
    order.payment_status === "paid"
      ? `
        <form method="POST" action="/organizers/${organizer.id}/ordenes/${order.id}/reenviar-whatsapp">
          <button
            type="submit"
            onclick="return confirm('¿Reenviar los códigos por WhatsApp a este comprador?');"
            style="
              padding:9px 12px;
              background:#16a34a;
              color:white;
              border:none;
              border-radius:10px;
              font-weight:bold;
              cursor:pointer;
              font-size:13px;
              white-space:nowrap;
            ">
            Reenviar códigos
          </button>
        </form>
      `
      : `
        <span style="color:#9ca3af;font-size:12px;">
          No disponible
        </span>
      `
  }
</td>

</tr>

`).join("")}

</tbody>

</table>

</div>

<div class="table-card" style="margin-top:30px;">

<h2>Códigos promocionales asignados por campaña</h2>

${
  (campaigns || []).map(campaign => {
    const campaignOrders = orders.filter(order => String(order.rifa_id) === String(campaign.id));
    const campaignOrderIds = campaignOrders.map(order => order.id);

    const campaignTickets = tickets.filter(ticket =>
  campaignOrderIds.map(String).includes(String(ticket.order_id))
);

    return `
      <div style="margin-top:24px;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">

        <div style="background:#eff6ff;padding:14px 16px;color:#1e3a8a;font-weight:bold;">
          ${campaign.title || "Campaña"} 
          <span style="font-weight:normal;color:#374151;">
            — ${campaignTickets.length} código${campaignTickets.length === 1 ? "" : "s"} asignado${campaignTickets.length === 1 ? "" : "s"}
          </span>
        </div>

        <table>
          <thead>
            <tr>
              <th>Comprador</th>
              <th>Teléfono</th>
              <th>Código promocional</th>
              <th>Estado</th>
            </tr>
          </thead>

          <tbody>
            ${
              campaignTickets.length > 0
                ? campaignTickets.map(ticket => {
                    const order = campaignOrders.find(o => o.id === ticket.order_id);

                    return `
                      <tr>
                        <td>${order?.buyers?.full_name || "-"}</td>
                        <td>${order?.buyers?.phone || "-"}</td>
                        <td>
                          <span class="badge approved">
                            ${ticket.combination || ticket.ticket_code || "-"}
                          </span>
                        </td>
                        <td>${ticket.status || "-"}</td>
                      </tr>
                    `;
                  }).join("")
                : `
                  <tr>
                    <td colspan="4" style="padding:16px;text-align:center;color:#6b7280;">
                      Esta campaña aún no tiene códigos promocionales asignados.
                    </td>
                  </tr>
                `
            }
          </tbody>
        </table>

      </div>
    `;
  }).join("")
}

</div>
</div>

<div class="footer">
© CampaClick — Panel de campañas
</div>

</body>
</html>
`);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/organizers/:organizerId/ordenes/:orderId/reenviar-whatsapp", async (req, res) => {
  try {
    const { organizerId, orderId } = req.params;

    if (!req.session.organizerId) {
      return res.redirect("/organizers/login");
    }

    if (String(req.session.organizerId) !== String(organizerId)) {
      return res.redirect("/organizers/login");
    }

    const { data: organizer, error: organizerError } = await supabase
      .from("organizers")
      .select("*")
      .eq("id", organizerId)
      .single();

    if (organizerError) throw organizerError;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        rifas(*)
      `)
      .eq("id", orderId)
      .single();

    if (orderError) throw orderError;

    if (!order) {
      return res.status(404).send("Orden no encontrada");
    }

    if (String(order.rifas?.owner_id) !== String(organizer.profile_id)) {
      return res.status(403).send("No tienes permiso para reenviar esta orden.");
    }

    if (order.payment_status !== "paid") {
      return res.status(400).send("Solo puedes reenviar códigos de órdenes pagadas.");
    }

    const result = await sendOrderCouponsWhatsApp(orderId, true);

    if (!result.ok) {
      console.log("No se pudo reenviar WhatsApp:", result);
    }

    return res.redirect(`/organizers/${organizerId}/panel`);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/organizers/:organizerId/campanas/:rifaId/referidos", async (req, res) => {
  try {
    const { organizerId, rifaId } = req.params;

    if (!req.session.organizerId) {
      return res.redirect("/organizers/login");
    }

    if (String(req.session.organizerId) !== String(organizerId)) {
      return res.redirect("/organizers/login");
    }

    const { data: organizer, error: organizerError } = await supabase
      .from("organizers")
      .select("*")
      .eq("id", organizerId)
      .single();

    if (organizerError) throw organizerError;

    const { data: campaign, error: campaignError } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();

    if (campaignError) throw campaignError;

    if (!campaign) {
      return res.status(404).send("Campaña no encontrada");
    }

    if (String(campaign.owner_id) !== String(organizer.profile_id)) {
      return res.status(403).send("No tienes permiso para ver estos referidos.");
    }

    const { data: referrers, error: referrersError } = await supabase
      .from("campaign_referrers")
      .select("*")
      .eq("rifa_id", rifaId)
      .order("created_at", { ascending: false });

    if (referrersError) throw referrersError;

    const referrerIds = (referrers || []).map(r => r.id);

    let referrals = [];
    let rewards = [];

    if (referrerIds.length > 0) {
      const { data: referralsData, error: referralsError } = await supabase
        .from("campaign_referrals")
        .select("*")
        .in("referrer_id", referrerIds);

      if (referralsError) throw referralsError;
      referrals = referralsData || [];

      const { data: rewardsData, error: rewardsError } = await supabase
        .from("referral_rewards")
        .select("*")
        .in("referrer_id", referrerIds);

      if (rewardsError) throw rewardsError;
      rewards = rewardsData || [];
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Referidos - ${campaign.title}</title>
      </head>

      <body style="font-family:Arial;background:#f3f6fb;padding:30px;">
        <div style="max-width:1100px;margin:auto;background:white;padding:26px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);">

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <h1 style="margin:0;">Referidos de campaña</h1>
              <p style="color:#6b7280;margin:8px 0 0;">
                Campaña: <b>${campaign.title}</b>
              </p>
            </div>

            <a
              href="/organizers/${organizer.id}/panel"
              style="background:#111827;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;">
              Volver al panel
            </a>
          </div>

          <div style="margin-top:20px;padding:16px;background:${campaign.referral_program_enabled ? "#ecfdf5" : "#fee2e2"};border-radius:14px;color:${campaign.referral_program_enabled ? "#166534" : "#991b1b"};font-weight:bold;line-height:1.5;">
            ${
              campaign.referral_program_enabled
                ? `Programa activo. Por cada ${campaign.referral_required_approved_orders || 15} compras aprobadas, el referido gana 1 código promocional de cortesía.`
                : `El programa de referidos no está activo para esta campaña.`
            }
          </div>

          <div style="margin-top:22px;padding:18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:16px;">
            <h2 style="margin-top:0;">Crear referido</h2>

            <form method="POST" action="/organizers/${organizer.id}/campanas/${campaign.id}/referidos">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
                <div>
                  <label>Nombre completo</label>
                  <input name="full_name" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:10px;">
                </div>

                <div>
                  <label>Teléfono</label>
                  <input name="phone" required placeholder="Ej: 3001234567" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:10px;">
                </div>

                <div>
                  <label>Código personalizado opcional</label>
                  <input name="referral_code" placeholder="Ej: JUAN123" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:10px;">
                </div>
              </div>

              <button
                type="submit"
                style="margin-top:14px;width:100%;padding:14px;background:#16a34a;color:white;border:none;border-radius:12px;font-weight:bold;cursor:pointer;">
                Crear referido
              </button>
            </form>
          </div>

          <div style="margin-top:26px;overflow:auto;">
            <h2>Referidos registrados</h2>

            <table style="width:100%;min-width:900px;border-collapse:collapse;">
              <thead>
                <tr style="background:#eff6ff;">
                  <th style="padding:12px;text-align:left;">Nombre</th>
                  <th style="padding:12px;text-align:left;">Teléfono</th>
                  <th style="padding:12px;text-align:left;">Código</th>
                  <th style="padding:12px;text-align:left;">Link</th>
                  <th style="padding:12px;text-align:left;">Aprobadas</th>
                  <th style="padding:12px;text-align:left;">Cortesías</th>
                  <th style="padding:12px;text-align:left;">Compartir</th>
                </tr>
              </thead>

              <tbody>
                ${
                  referrers && referrers.length > 0
                    ? referrers.map(referrer => {
                        const approvedCount = referrals.filter(r =>
                          String(r.referrer_id) === String(referrer.id) &&
                          r.status === "approved"
                        ).length;

                        const rewardCount = rewards.filter(r =>
                          String(r.referrer_id) === String(referrer.id)
                        ).length;

                        const link = `${APP_BASE_URL}/campanas/${campaign.slug}?ref=${encodeURIComponent(referrer.referral_code)}`;

                        const shareText = encodeURIComponent(
                          [
                            `Te invito a participar en esta campaña de CampaClick.`,
                            ``,
                            `Campaña: ${campaign.title}`,
                            `Premio: ${campaign.prize || "-"}`,
                            `Valor por código promocional: $${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")}`,
                            ``,
                            `Link para participar:`,
                            `${link}`,
                            ``,
                            `Los códigos se asignan automáticamente después del pago aprobado.`
                          ].join("\\n")
                        );

                        return `
                          <tr>
                            <td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;">${referrer.full_name}</td>
                            <td style="padding:12px;border-bottom:1px solid #eee;">${referrer.phone}</td>
                            <td style="padding:12px;border-bottom:1px solid #eee;">
                              <span style="background:#dbeafe;color:#1e40af;padding:7px 10px;border-radius:999px;font-weight:bold;">
                                ${referrer.referral_code}
                              </span>
                            </td>
                            <td style="padding:12px;border-bottom:1px solid #eee;">
                              <input readonly value="${link}" style="width:100%;padding:9px;border:1px solid #ddd;border-radius:8px;">
                            </td>
                            <td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;">${approvedCount}</td>
                            <td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;">${rewardCount}</td>
                            <td style="padding:12px;border-bottom:1px solid #eee;">
                              <a
                                target="_blank"
                                href="https://wa.me/?text=${shareText}"
                                style="display:inline-block;padding:9px 12px;background:#22c55e;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">
                                WhatsApp
                              </a>
                            </td>
                          </tr>
                        `;
                      }).join("")
                    : `
                      <tr>
                        <td colspan="7" style="padding:18px;text-align:center;color:#6b7280;">
                          Aún no hay referidos registrados para esta campaña.
                        </td>
                      </tr>
                    `
                }
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/organizers/:organizerId/campanas/:rifaId/referidos", async (req, res) => {
  try {
    const { organizerId, rifaId } = req.params;

    if (!req.session.organizerId) {
      return res.redirect("/organizers/login");
    }

    if (String(req.session.organizerId) !== String(organizerId)) {
      return res.redirect("/organizers/login");
    }

    const fullName = String(req.body.full_name || "").trim();
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    let referralCode = normalizeReferralCode(req.body.referral_code);

    if (!fullName || !phone) {
      return res.status(400).send("Faltan nombre o teléfono del referido.");
    }

    const { data: organizer, error: organizerError } = await supabase
      .from("organizers")
      .select("*")
      .eq("id", organizerId)
      .single();

    if (organizerError) throw organizerError;

    const { data: campaign, error: campaignError } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();

    if (campaignError) throw campaignError;

    if (!campaign) {
      return res.status(404).send("Campaña no encontrada");
    }

    if (String(campaign.owner_id) !== String(organizer.profile_id)) {
      return res.status(403).send("No tienes permiso para crear referidos en esta campaña.");
    }

    if (!referralCode) {
      referralCode = generateReferralCode(fullName, phone);
    }

    const { error: insertError } = await supabase
      .from("campaign_referrers")
      .insert({
        rifa_id: campaign.id,
        full_name: fullName,
        phone,
        referral_code: referralCode,
        status: "active"
      });

    if (insertError) {
      return res.status(400).send(`
        No fue posible crear el referido. Puede que el código "${referralCode}" ya exista para esta campaña.
        <br/><br/>
        <a href="/organizers/${organizerId}/campanas/${rifaId}/referidos">Volver</a>
      `);
    }

    return res.redirect(`/organizers/${organizerId}/campanas/${rifaId}/referidos`);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/organizers/:organizerId/verificacion", async (req, res) => {
  try {
    const { organizerId } = req.params;

    if (!req.session.organizerId) {
      return res.redirect("/organizers/login");
    }

    if (String(req.session.organizerId) !== String(organizerId)) {
      return res.redirect("/organizers/login");
    }

    const { data: organizer, error } = await supabase
      .from("organizers")
      .select("*")
      .eq("id", organizerId)
      .single();

    if (error || !organizer) {
      return res.status(404).send("Organizador no encontrado");
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Verificación del organizador</title>
      </head>
      <body style="font-family: Arial, sans-serif; background:#f5f7fb; padding:40px;">
        <div style="max-width:760px;margin:0 auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
          <h1>Verificación del organizador</h1>

          <div style="margin-bottom:18px;padding:14px;background:#eff6ff;border-radius:12px;color:#1e3a8a;">
            Completa esta información para continuar con el proceso de validación.
          </div>

          <form method="POST" action="/organizers/${organizer.id}/verificacion">
            <div style="margin-bottom:12px;">
              <label>Número de cédula</label><br/>
              <input type="text" name="document_number" required value="${organizer.document_number || ""}" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

<div style="margin-bottom:16px;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
  <b>Soportes de identidad</b>

  <p style="margin:8px 0 14px;color:#6b7280;font-size:14px;line-height:1.5;">
    Las fotos deben tomarse directamente desde la cámara en esta página.
    No se permite cargar imágenes desde galería.
  </p>

  <input type="hidden" name="id_front_image" id="id_front_image">
  <input type="hidden" name="id_back_image" id="id_back_image">
  <input type="hidden" name="selfie_id_image" id="selfie_id_image">

  <div style="display:grid;gap:14px;">

    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
      <div style="font-weight:bold;margin-bottom:8px;">Foto cédula frente</div>

      <button
        type="button"
        onclick="openCamera('id_front_image', 'preview_front', 'environment')"
        style="width:100%;padding:13px;background:#2563eb;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
        Tomar foto cédula frente
      </button>

      <div id="preview_front" style="margin-top:10px;color:#166534;font-weight:bold;">
        ${organizer.id_front_url ? "Foto registrada previamente" : "Pendiente por tomar"}
      </div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
      <div style="font-weight:bold;margin-bottom:8px;">Foto cédula reverso</div>

      <button
        type="button"
        onclick="openCamera('id_back_image', 'preview_back', 'environment')"
        style="width:100%;padding:13px;background:#2563eb;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
        Tomar foto cédula reverso
      </button>

      <div id="preview_back" style="margin-top:10px;color:#166534;font-weight:bold;">
        ${organizer.id_back_url ? "Foto registrada previamente" : "Pendiente por tomar"}
      </div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
      <div style="font-weight:bold;margin-bottom:8px;">Selfie con cédula</div>

      <button
        type="button"
        onclick="openCamera('selfie_id_image', 'preview_selfie', 'user')"
        style="width:100%;padding:13px;background:#16a34a;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
        Tomar selfie con cédula
      </button>

      <div id="preview_selfie" style="margin-top:10px;color:#166534;font-weight:bold;">
        ${organizer.selfie_id_url ? "Foto registrada previamente" : "Pendiente por tomar"}
      </div>
    </div>

  </div>
</div>

<div id="cameraModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;padding:18px;">
  <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:18px;">
    <h2 style="margin-top:0;">Tomar foto</h2>

    <video
      id="cameraVideo"
      autoplay
      playsinline
      style="width:100%;border-radius:14px;background:#111827;">
    </video>

    <canvas id="cameraCanvas" style="display:none;"></canvas>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <button
        type="button"
        onclick="capturePhoto()"
        style="padding:13px;background:#16a34a;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
        Capturar
      </button>

      <button
        type="button"
        onclick="closeCamera()"
        style="padding:13px;background:#dc2626;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
        Cancelar
      </button>
    </div>
  </div>
</div>

<script>
  let currentStream = null;
  let currentHiddenInputId = null;
  let currentPreviewId = null;

  async function openCamera(hiddenInputId, previewId, facingMode) {
    try {
      currentHiddenInputId = hiddenInputId;
      currentPreviewId = previewId;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Este navegador no permite abrir la cámara directamente. Usa un navegador actualizado en el celular.");
        return;
      }

      currentStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      const video = document.getElementById("cameraVideo");
      video.srcObject = currentStream;

      document.getElementById("cameraModal").style.display = "block";
    } catch (error) {
      console.error(error);
      alert("No fue posible abrir la cámara. Revisa permisos del navegador.");
    }
  }

  function capturePhoto() {
    const video = document.getElementById("cameraVideo");
    const canvas = document.getElementById("cameraCanvas");

    if (!video || !currentHiddenInputId || !currentPreviewId) {
      alert("No hay cámara activa.");
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);

    const imageBase64 = canvas.toDataURL("image/jpeg", 0.78);

    document.getElementById(currentHiddenInputId).value = imageBase64;
    document.getElementById(currentPreviewId).innerHTML = "Foto tomada y lista para guardar";

    closeCamera();
  }

  function closeCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }

    document.getElementById("cameraModal").style.display = "none";
  }
</script>

            <div style="margin-bottom:12px;">
              <label>Método de pago</label><br/>
              <select name="payout_method" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
                <option value="">Seleccionar</option>
                <option value="bank_transfer" ${organizer.payout_method === "bank_transfer" ? "selected" : ""}>Transferencia bancaria</option>
                <option value="nequi" ${organizer.payout_method === "nequi" ? "selected" : ""}>Nequi</option>
                <option value="daviplata" ${organizer.payout_method === "daviplata" ? "selected" : ""}>Daviplata</option>
              </select>
            </div>

            <div style="margin-bottom:12px;">
              <label>Banco</label><br/>
              <input type="text" name="bank_name" value="${organizer.bank_name || ""}" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:12px;">
              <label>Tipo de cuenta</label><br/>
              <input type="text" name="account_type" value="${organizer.account_type || ""}" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:12px;">
              <label>Número de cuenta</label><br/>
              <input type="text" name="account_number" value="${organizer.account_number || ""}" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:12px;">
              <label>Titular de la cuenta</label><br/>
              <input type="text" name="account_holder" value="${organizer.account_holder || ""}" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:16px;">
              <label>Link soporte del premio</label><br/>
              <input type="text" name="prize_proof_url" value="${organizer.prize_proof_url || ""}" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:18px;">
              <label style="display:flex;align-items:center;gap:8px;">
                <input type="checkbox" name="terms_accepted" value="true" ${organizer.terms_accepted ? "checked" : ""}>
                Acepto las políticas de uso, comisiones, tratamiento de datos y condiciones de participación de CampaClick. Declaro que conozco que la plataforma cobra una comisión del 5% sobre transacciones exitosas y que Wompi descuenta sus costos propios por procesamiento de pago.
              </label>
            </div>

            <div style="margin-bottom:18px;padding:14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;color:#1e3a8a;font-size:14px;line-height:1.5;">
  <b>Información importante:</b><br/>
  La comisión de CampaClick es del <b>5%</b> sobre transacciones exitosas. 
  Además, Wompi aplica sus costos propios de procesamiento: <b>2.65% + $700 + IVA</b> por transacción exitosa, según tarifa vigente del proveedor.
  <br/><br/>
  <a href="/terminos-organizadores" target="_blank" style="color:#2563eb;font-weight:bold;">
  Ver políticas completas
</a>
</div>

            <button type="submit" style="width:100%;padding:14px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-weight:700;">
              Guardar verificación
            </button>
          </form>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/organizers/:organizerId/verificacion", async (req, res) => {
  try {
    const { organizerId } = req.params;

    if (!req.session.organizerId) {
      return res.redirect("/organizers/login");
    }

    if (String(req.session.organizerId) !== String(organizerId)) {
      return res.redirect("/organizers/login");
    }

    const documentNumber = String(req.body.document_number || "").trim();
    const idFrontImage = String(req.body.id_front_image || "").trim();
    const idBackImage = String(req.body.id_back_image || "").trim();
    const selfieIdImage = String(req.body.selfie_id_image || "").trim();
    const payoutMethod = String(req.body.payout_method || "").trim();
    const bankName = String(req.body.bank_name || "").trim();
    const accountType = String(req.body.account_type || "").trim();
    const accountNumber = String(req.body.account_number || "").trim();
    const accountHolder = String(req.body.account_holder || "").trim();
    const prizeProofUrl = String(req.body.prize_proof_url || "").trim();
    const termsAccepted = req.body.terms_accepted === "true";

    if (!documentNumber) {
      return res.status(400).send("Falta el número de cédula");
    }

    if (!termsAccepted) {
  return res.status(400).send("Debes aceptar las políticas de uso, comisiones, tratamiento de datos y condiciones de participación de CampaClick.");
}

const { data: currentOrganizer, error: currentOrganizerError } = await supabase
  .from("organizers")
  .select("id_front_url,id_back_url,selfie_id_url")
  .eq("id", organizerId)
  .single();

if (currentOrganizerError) throw currentOrganizerError;

const finalIdFrontUrl = idFrontImage
  ? await uploadOrganizerSupport(idFrontImage, organizerId, "cedula-frente")
  : currentOrganizer?.id_front_url;

const finalIdBackUrl = idBackImage
  ? await uploadOrganizerSupport(idBackImage, organizerId, "cedula-reverso")
  : currentOrganizer?.id_back_url;

const finalSelfieIdUrl = selfieIdImage
  ? await uploadOrganizerSupport(selfieIdImage, organizerId, "selfie-cedula")
  : currentOrganizer?.selfie_id_url;

if (!finalIdFrontUrl || !finalIdBackUrl || !finalSelfieIdUrl) {
    return res.status(400).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Soportes obligatorios</title>
    </head>
    <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
      <div style="max-width:650px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
        <h1>Soportes obligatorios</h1>
        <p>
          Para enviar la verificación debes cargar todos los soportes:
        </p>

        <div style="text-align:left;display:inline-block;line-height:1.8;">
          <div>✅ Link foto cédula frente</div>
          <div>✅ Link foto cédula reverso</div>
          <div>✅ Link selfie con cédula</div>
          </div>

        <br/>

        <a
          href="/organizers/${organizerId}/verificacion"
          style="display:inline-block;margin-top:22px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
          Volver a completar verificación
        </a>
      </div>
    </body>
    </html>
  `);
}

    const { error } = await supabase
      .from("organizers")
      .update({
        document_number: documentNumber,
        id_front_url: finalIdFrontUrl || null,
        id_back_url: finalIdBackUrl || null,
        selfie_id_url: finalSelfieIdUrl || null,
        payout_method: payoutMethod || null,
        bank_name: bankName || null,
        account_type: accountType || null,
        account_number: accountNumber || null,
        account_holder: accountHolder || null,
        prize_proof_url: prizeProofUrl || null,
        terms_accepted: termsAccepted,
        terms_accepted_at: termsAccepted ? new Date().toISOString() : null,
        terms_accepted_ip: termsAccepted ? (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "") : null,
        terms_accepted_user_agent: termsAccepted ? String(req.headers["user-agent"] || "") : null,
        verification_status: "pending"
      })
      .eq("id", organizerId);

    if (error) throw error;

    return res.redirect(`/organizers/${organizerId}/panel`);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/organizers/:organizerId/campanas/nueva", async (req, res) => {
  try {
    const { organizerId } = req.params;

    if (!req.session.organizerId) {
      return res.redirect("/organizers/login");
    }

    if (String(req.session.organizerId) !== String(organizerId)) {
      return res.redirect("/organizers/login");
    }

    const { data: organizer, error } = await supabase
      .from("organizers")
      .select("*")
      .eq("id", organizerId)
      .single();

    if (error || !organizer) {
      return res.status(404).send("Organizador no encontrado");
    }

    if (organizer.verification_status !== "verified") {
      return res.status(403).send("Tu cuenta aún no ha sido aprobada por el administrador.");
    }

   
    if (!organizer.terms_accepted) {
  return res.status(403).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Políticas pendientes</title>
    </head>
    <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
      <div style="max-width:650px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
        <h1>Debes aceptar las políticas</h1>

        <p style="line-height:1.6;color:#374151;">
          Para crear campañas en CampaClick, primero debes aceptar las políticas,
          términos, condiciones y costos aplicables de la plataforma.
        </p>

        <a
          href="/organizers/${organizer.id}/verificacion"
          style="display:inline-block;margin-top:18px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
          Ir a mi verificación
        </a>

        <a
          href="/terminos-organizadores"
          target="_blank"
          style="display:inline-block;margin-top:18px;margin-left:8px;padding:14px 18px;background:#111827;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
          Ver políticas
        </a>
      </div>
    </body>
    </html>
  `);
}

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Nueva campaña</title>
      </head>
      <body style="font-family: Arial, sans-serif; background:#f5f7fb; padding:40px;">
        <div style="max-width:760px;margin:0 auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
         
          <h1>Crear nueva campaña</h1>

          <div style="margin-bottom:18px;padding:16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;color:#9a3412;line-height:1.5;">
  <b>Información importante sobre comisiones:</b><br/><br/>

  Al crear esta campaña aceptas que CampaClick cobrará una comisión del
  <b>5% sobre las ventas aprobadas</b> por el uso de la plataforma.

  <br/><br/>

  Además, Wompi cobra sus propios costos de procesamiento por transacción exitosa,
  que actualmente pueden ser aproximadamente <b>2.65% + $700 + IVA</b>.
  Esta comisión corresponde a la pasarela de pagos, no a CampaClick.

  <br/><br/>

  <a href="/terminos-organizadores" target="_blank" style="color:#2563eb;font-weight:bold;">
    Ver términos y condiciones para organizadores
  </a>
</div>

          <form method="POST" action="/organizers/${organizer.id}/campanas/nueva">
            <div style="margin-bottom:12px;">
              <label>Título</label><br/>
              <input type="text" name="title" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:12px;">
              <label>Premio</label><br/>
              <input type="text" name="prize" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:12px;">
  <label>Tipo de premio</label><br/>
  <select
    name="prize_type"
    required
    style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;"
  >
    <option value="physical">Premio físico / especie</option>
    <option value="money">Premio en dinero</option>
  </select>

  <div style="margin-top:6px;color:#6b7280;font-size:13px;line-height:1.4;">
    Si el premio es en dinero, CampaClick descontará ese valor del recaudo antes de calcular el giro al organizador.
  </div>
</div>

<div style="margin-bottom:12px;">
  <label>Valor del premio en dinero</label><br/>
  <input
    type="number"
    name="prize_cash_amount"
    min="0"
    value="0"
    style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;"
  >

  <div style="margin-top:6px;color:#6b7280;font-size:13px;line-height:1.4;">
    Déjalo en 0 si el premio no es en dinero.
  </div>
</div>

            <div style="margin-bottom:12px;">
              <label>Descripción</label><br/>
              <textarea name="description" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;min-height:100px;"></textarea>
            </div>

            <div style="margin-bottom:12px;">
  <label>Proveedor de sorteo</label><br/>
  <select
    name="draw_provider"
    id="draw_provider"
    required
    onchange="updateDrawModes()"
    style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;"
  >
    ${generateProviderOptions()}
  </select>
</div>

<div style="margin-bottom:12px;">
  <label>Modalidad</label><br/>
  <select
    name="draw_mode"
    id="draw_mode"
    required
    style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;"
  >
  </select>

  <div style="margin-top:6px;color:#6b7280;font-size:13px;">
    Las modalidades cambian según el proveedor seleccionado.
  </div>
</div>

<script>
  const balotoModes = ${JSON.stringify(BALOTO_DRAW_MODES)};
  const loteriaModes = ${JSON.stringify(LOTERIA_DRAW_MODES)};

  function updateDrawModes() {
    const provider = document.getElementById("draw_provider").value;
    const modeSelect = document.getElementById("draw_mode");

    const modes = provider === "baloto" ? balotoModes : loteriaModes;

    modeSelect.innerHTML = modes.map(item => {
      return '<option value="' + item.value + '">' + item.label + '</option>';
    }).join("");
  }

  updateDrawModes();
</script>

            <div style="margin-bottom:12px;">
              <label>Precio por Código promocional</label><br/>
              <input type="number" name="price_per_ticket" min="1" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:16px;">
              <label>Fecha del sorteo</label><br/>
              <input type="date" name="draw_date" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:18px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;">
  <h3 style="margin-top:0;color:#166534;">Programa de referidos</h3>

  <label style="display:flex;align-items:flex-start;gap:10px;line-height:1.5;">
    <input
      type="checkbox"
      name="referral_program_enabled"
      value="true"
      style="width:auto;margin-top:4px;"
    >
    <span>
      Activar programa de referidos para esta campaña.
      Los referidores podrán recibir códigos promocionales de cortesía según las compras aprobadas que generen.
    </span>
  </label>

  <div style="margin-top:14px;">
    <label>Cantidad de compras aprobadas necesarias para entregar 1 código de cortesía</label>

    <input
      type="number"
      name="referral_required_approved_orders"
      min="5"
      max="50"
      value="15"
      style="width:100%;padding:12px;border-radius:12px;border:1px solid #ddd;"
    >

    <small style="display:block;margin-top:8px;color:#166534;line-height:1.4;">
      Recomendado: 15. Mínimo permitido: 5. Máximo permitido: 50.
      Solo cuentan transacciones aprobadas por Wompi.
    </small>
  </div>
</div>

            <div style="margin-bottom:18px;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
  <label style="display:flex;gap:10px;align-items:flex-start;line-height:1.5;">
    <input type="checkbox" name="campaign_terms_accepted" value="true" required style="margin-top:4px;">
    <span>
      Declaro que he leído y acepto los términos para organizadores.
      Entiendo que CampaClick cobra una comisión del <b>5%</b> sobre ventas aprobadas
      y que Wompi cobra sus propios costos de procesamiento, aproximadamente
      <b>2.65% + $700 + IVA</b> por transacción exitosa.
    </span>
  </label>
</div>

            <button type="submit" style="width:100%;padding:14px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-weight:700;">
              Guardar campaña
            </button>
          </form>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/organizers/:organizerId/campanas/nueva", async (req, res) => {
  try {
    const { organizerId } = req.params;

    if (!req.session.organizerId) {
      return res.redirect("/organizers/login");
    }

    if (String(req.session.organizerId) !== String(organizerId)) {
      return res.redirect("/organizers/login");
    }

    const { data: organizer, error: organizerError } = await supabase
      .from("organizers")
      .select("*")
      .eq("id", organizerId)
      .single();

    if (organizerError || !organizer) {
      return res.status(404).send("Organizador no encontrado");
    }

    if (organizer.verification_status !== "verified") {
      return res.status(403).send("Tu cuenta aún no ha sido aprobada por el administrador.");
    }

    if (!organizer.terms_accepted) {
  return res.status(403).send("Debes aceptar las políticas y condiciones antes de crear campañas.");
}

    const title = String(req.body.title || "").trim();
    const prize = String(req.body.prize || "").trim();
    const description = String(req.body.description || "").trim();
    const prizeType = String(req.body.prize_type || "physical").trim();
    const prizeCashAmount = Number(req.body.prize_cash_amount || 0);
    const drawProvider = String(req.body.draw_provider || "").trim();
    const drawMode = String(req.body.draw_mode || "").trim();
    const pricePerTicket = Number(req.body.price_per_ticket || 0);
    const drawDate = String(req.body.draw_date || "").trim();
    const campaignTermsAccepted = req.body.campaign_terms_accepted === "true";
    const referralProgramEnabled = req.body.referral_program_enabled === "true";

let referralRequiredApprovedOrders = Number(req.body.referral_required_approved_orders || 15);

if (!Number.isInteger(referralRequiredApprovedOrders)) {
  referralRequiredApprovedOrders = 15;
}

if (referralRequiredApprovedOrders < 5) {
  referralRequiredApprovedOrders = 5;
}

if (referralRequiredApprovedOrders > 50) {
  referralRequiredApprovedOrders = 50;
}

    if (!title || !prize || !drawProvider || !drawMode || !drawDate) {
      return res.status(400).send("Faltan campos obligatorios");
    }

    try {
  validateDrawDate(drawProvider, drawDate);
} catch (dateError) {
  return res.status(400).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Fecha de sorteo inválida</title>
    </head>
    <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
      <div style="max-width:650px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
        <h1>Fecha de sorteo inválida</h1>

        <p style="line-height:1.6;color:#374151;">
          ${dateError.message}
        </p>

        <a
          href="/organizers/${organizerId}/campanas/nueva"
          style="display:inline-block;margin-top:18px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
          Volver a crear campaña
        </a>
      </div>
    </body>
    </html>
  `);
}

    if (!campaignTermsAccepted) {
  return res.status(400).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Aceptación requerida</title>
    </head>
    <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
      <div style="max-width:650px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
        <h1>Aceptación requerida</h1>
        <p>
          Para crear una campaña debes aceptar los términos para organizadores,
          incluyendo la comisión de CampaClick del 5% y los costos de procesamiento de Wompi.
        </p>

        <a
          href="/organizers/${organizerId}/campanas/nueva"
          style="display:inline-block;margin-top:18px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
          Volver a crear campaña
        </a>
      </div>
    </body>
    </html>
  `);
}

    if (!Number.isFinite(pricePerTicket) || pricePerTicket <= 0) {
      return res.status(400).send("Precio inválido");
    }

    if (!["physical", "money"].includes(prizeType)) {
  return res.status(400).send("Tipo de premio inválido");
}

if (prizeType === "money") {
  if (!Number.isFinite(prizeCashAmount) || prizeCashAmount <= 0) {
    return res.status(400).send("Si el premio es en dinero, debes escribir el valor del premio.");
  }
}

if (prizeType === "physical" && prizeCashAmount > 0) {
  return res.status(400).send("Si el premio es físico, el valor del premio en dinero debe quedar en 0.");
}

    if (!validateProviderAndMode(drawProvider, drawMode)) {
  return res.status(400).send("La modalidad no corresponde al proveedor seleccionado");
}

const maxTickets = getMaxTicketsByDrawMode(drawMode);

if (maxTickets <= 0) {
  return res.status(400).send("Modalidad inválida");
}

    let slug = slugify(title);
    if (!slug) {
      slug = `campana-${Date.now()}`;
    }

    const { data: existingSlug } = await supabase
      .from("rifas")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existingSlug) {
      slug = `${slug}-${Date.now().toString().slice(-6)}`;
    }

    const { error: insertError } = await supabase
      .from("rifas")
      .insert({
        owner_id: organizer.profile_id,
        title,
        prize,
        description,
        draw_provider: drawProvider,
        draw_mode: drawMode,
        modality: drawMode,
        price_per_ticket: pricePerTicket,
        max_tickets: maxTickets,
        sold_tickets: 0,
        available_tickets: maxTickets,
        draw_date: drawDate,
        status: "pending",
        slug,
        prize_type: prizeType,
prize_cash_amount: prizeType === "money" ? prizeCashAmount : 0,
prize_delivery_status: "pending",
payout_status: "pending",
        platform_fee_percent: 5,

referral_program_enabled: referralProgramEnabled,
referral_required_approved_orders: referralRequiredApprovedOrders,
referral_reward_qty: 1,

campaign_terms_accepted: true,
        campaign_terms_accepted_at: new Date().toISOString(),
        payment_gateway_fee_note: "Wompi cobra costos propios de procesamiento, aproximadamente 2.65% + $700 + IVA por transacción exitosa."
      });

    if (insertError) throw insertError;

    return res.redirect(`/organizers/${organizerId}/panel`);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/campanas/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const referralCode = normalizeReferralCode(req.query.ref);

    const { data: campaign, error } = await supabase
      .from("rifas")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error || !campaign) {
      return res.status(404).send("Campaña no encontrada");
    }

const { data: campaignOrganizer } = await supabase
  .from("organizers")
  .select("full_name, phone")
  .eq("profile_id", campaign.owner_id)
  .maybeSingle();

const organizerPhoneClean = String(campaignOrganizer?.phone || "").replace(/\D/g, "");
const organizerWhatsAppPhone = organizerPhoneClean
  ? organizerPhoneClean.startsWith("57")
    ? organizerPhoneClean
    : `57${organizerPhoneClean}`
  : "";

const contactOrganizerMessage = encodeURIComponent(
  [
    `Hola, estoy interesado(a) en esta campaña de CampaClick.`,
    ``,
    `Campaña: ${campaign.title || "-"}`,
    `Premio: ${campaign.prize || "-"}`,
    `Valor por código promocional: $${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")}`,
    ``,
    `Necesito ayuda o más información sobre la campaña.`,
    ``,
    `Link de la campaña:`,
    `${APP_BASE_URL}/campanas/${campaign.slug}`
  ].join("\n")
);
    
    const totalCoupons = Number(campaign.max_tickets || 0);
    const soldCoupons = Number(campaign.sold_tickets || 0);
    
    const soldPercentage = totalCoupons > 0
      ? Math.min(100, Math.round((soldCoupons / totalCoupons) * 100))
      : 0;

    let publicStatusLabel = "Pendiente";
    let publicStatusColor = "#f59e0b";

    if (campaign.status === "active") {
      publicStatusLabel = "Activa";
      publicStatusColor = "#16a34a";
    }

    if (campaign.status === "finished") {
      publicStatusLabel = "Finalizada";
      publicStatusColor = "#111827";
    }

    if (campaign.status === "cancelled") {
      publicStatusLabel = "Cancelada";
      publicStatusColor = "#dc2626";
    }

    const baseUrl = APP_BASE_URL;
    const campaignPublicUrl = `${baseUrl}/campanas/${campaign.slug}`;
    
   const whatsappShareMessage = [
  `Te invito a participar en esta campaña de CampaClick.`,
  ``,
  `Campaña: ${campaign.title}`,
  `Premio: ${campaign.prize || "-"}`,
  `Valor por código promocional: $${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")}`,
  `Sorteo: ${getDrawProviderLabel(campaign.draw_provider)}`,
  `Modalidad: ${getDrawModeLabel(campaign.draw_mode)}`,
  `Fecha del sorteo: ${campaign.draw_date || "-"}`,
  ``,
  `Link para participar:`,
  `${campaignPublicUrl}`,
  ``,
  `Los códigos promocionales se asignan automáticamente después del pago aprobado.`
].join("\n");

const whatsappShareText = encodeURIComponent(whatsappShareMessage);
    
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>

<title>${campaign.title}</title>


<meta property="og:title" content="${campaign.title} | CampaClick" />
<meta property="og:description" content="Premio: ${campaign.prize || "-"} · Valor por código: $${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")} · Fecha del sorteo: ${campaign.draw_date || "-"}" />
<meta property="og:url" content="${campaignPublicUrl}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="CampaClick" />
<meta property="og:image" content="${APP_BASE_URL}/campaclick-share.jpg" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${campaign.title} | CampaClick" />
<meta name="twitter:description" content="Premio: ${campaign.prize || "-"} · Valor por código: $${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")}" />
<meta name="twitter:image" content="${APP_BASE_URL}/campaclick-share.jpg" />
<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, sans-serif;
  color: #111827;
  min-height: 100vh;
  background:
    radial-gradient(circle at 12% 18%, rgba(37,99,235,.35), transparent 28%),
    radial-gradient(circle at 88% 12%, rgba(34,197,94,.22), transparent 24%),
    radial-gradient(circle at 50% 90%, rgba(255,255,255,.70), transparent 30%),
    linear-gradient(135deg, #dbeafe 0%, #eef4ff 45%, #f8fafc 100%);
}

.header {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(29,78,216,.82), rgba(37,99,235,.62));
  padding: 58px 20px 70px;
  color: white;
  text-align: center;
  border-bottom: 1px solid rgba(255,255,255,.28);
  box-shadow: 0 22px 60px rgba(37,99,235,.22);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
}

.header::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(120deg, rgba(255,255,255,.24), transparent 38%),
    radial-gradient(circle at top right, rgba(255,255,255,.20), transparent 28%);
  pointer-events: none;
}

.header h1,
.header p {
  position: relative;
  z-index: 1;
}

.header h1 {
  margin: 0;
  font-size: 44px;
  font-weight: 900;
  letter-spacing: .5px;
}

.header p {
  margin-top: 12px;
  font-size: 18px;
  opacity: .95;
}

.container {
  max-width: 1050px;
  margin: -45px auto 0;
  padding: 0 20px 35px;
  position: relative;
  z-index: 2;
}

.card {
  position: relative;
  overflow: hidden;
  background: rgba(255,255,255,.38);
  border: 1px solid rgba(255,255,255,.48);
  border-radius: 26px;
  padding: 28px;
  box-shadow:
    0 22px 55px rgba(15,23,42,.12),
    inset 0 1px 0 rgba(255,255,255,.55);
  margin-bottom: 24px;
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
}

.card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: rgba(255,255,255,.75);
}

.progress-card {
  background: rgba(255,255,255,.28);
  border: 1px solid rgba(255,255,255,.42);
  border-radius: 22px;
  padding: 26px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.58),
    0 14px 38px rgba(30,41,59,.08);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.progress-title {
  margin: 0;
  font-size: 25px;
  color: #111827;
}

.progress-description {
  margin-top: 7px;
  color: #4b5563;
  font-size: 15px;
}

.progress-right {
  text-align: right;
}

.progress-percent {
  font-size: 42px;
  font-weight: 900;
  color: #2563eb;
  line-height: 1;
}

.status-chip {
  display: inline-block;
  margin-top: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: bold;
  background: ${publicStatusColor};
  color: white;
  box-shadow:
    0 8px 20px rgba(15,23,42,.12),
    inset 0 1px 0 rgba(255,255,255,.35);
}

.progress-bar-wrap {
  width: 100%;
  height: 20px;
  background: rgba(255,255,255,.42);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 16px;
  border: 1px solid rgba(255,255,255,.45);
  box-shadow: inset 0 2px 8px rgba(15,23,42,.08);
}

.progress-bar {
  height: 100%;
  width: ${soldPercentage}%;
  background: linear-gradient(90deg, rgba(22,163,74,.95), rgba(34,197,94,.85));
  border-radius: 999px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.55),
    0 0 18px rgba(34,197,94,.35);
}

.info-grid {
  display: grid;
  grid-template-columns: .9fr 1.1fr;
  gap: 22px;
  align-items: start;
}

/* Información de campaña a la derecha */
.info-grid > .card:first-child {
  order: 2;
}

/* Precio y botones a la izquierda */
.info-grid > .card:last-child {
  order: 1;
}

.section-title {
  margin: 0 0 14px;
  font-size: 24px;
  color: #111827;
}

.description {
  color: #374151;
  line-height: 1.6;
  margin: 0;
  font-size: 16px;
}

.price-card {
  background: rgba(255,255,255,.30);
  border: 1px solid rgba(255,255,255,.46);
  border-radius: 22px;
  padding: 28px;
  min-height: 360px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.58),
    0 16px 36px rgba(30,41,59,.10);
  backdrop-filter: blur(22px) saturate(170%);
  -webkit-backdrop-filter: blur(22px) saturate(170%);
}

.price-label {
  color: #4b5563;
  font-size: 15px;
  margin-bottom: 8px;
}

.price {
  font-size: 44px;
  font-weight: 900;
  color: #16a34a;
  margin-bottom: 18px;
}

.price-card {
  min-height: 360px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.button {
  position: relative;
  overflow: hidden;
  display: block;
  width: 100%;
  padding: 17px;
  color: white;
  text-decoration: none;
  text-align: center;
  border-radius: 17px;
  font-size: 19px;
  font-weight: 900;
  background: linear-gradient(135deg, rgba(37,99,235,.86), rgba(59,130,246,.68));
  border: 1px solid rgba(255,255,255,.32);
  box-shadow:
    0 13px 28px rgba(37,99,235,.25),
    inset 0 1px 0 rgba(255,255,255,.38);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease;
}

.price-card > a.button:first-of-type {
  padding: 24px 18px;
  font-size: 24px;
  letter-spacing: 1px;
  text-transform: uppercase;
  background:
    linear-gradient(135deg, #16a34a 0%, #2563eb 48%, #7c3aed 100%);
  border: 2px solid rgba(255,255,255,.70);
  box-shadow:
    0 24px 55px rgba(37,99,235,.42),
    0 0 0 8px rgba(34,197,94,.12),
    inset 0 1px 0 rgba(255,255,255,.65);
  animation: pulseButton 1.8s infinite;
}

@keyframes pulseButton {
  0% {
    transform: scale(1);
    box-shadow:
      0 22px 48px rgba(34,197,94,.35),
      0 0 0 6px rgba(34,197,94,.12),
      inset 0 1px 0 rgba(255,255,255,.55);
  }

  50% {
    transform: scale(1.025);
    box-shadow:
      0 26px 58px rgba(37,99,235,.45),
      0 0 0 10px rgba(37,99,235,.14),
      inset 0 1px 0 rgba(255,255,255,.60);
  }

  100% {
    transform: scale(1);
    box-shadow:
      0 22px 48px rgba(34,197,94,.35),
      0 0 0 6px rgba(34,197,94,.12),
      inset 0 1px 0 rgba(255,255,255,.55);
  }
}

.button::before {
  content: "";
  position: absolute;
  top: 1px;
  left: 1px;
  right: 1px;
  height: 48%;
  border-radius: 16px;
  background: linear-gradient(to bottom, rgba(255,255,255,.34), rgba(255,255,255,.07));
  pointer-events: none;
}

.button:hover {
  transform: translateY(-2px);
  opacity: .98;
  box-shadow:
    0 18px 38px rgba(37,99,235,.32),
    inset 0 1px 0 rgba(255,255,255,.42);
}

.button-dark {
  background: linear-gradient(135deg, rgba(17,24,39,.90), rgba(31,41,55,.76));
}

.button-secondary {
  background: linear-gradient(135deg, rgba(17,24,39,.90), rgba(31,41,55,.76));
  margin-top: 12px;
}

.button-whatsapp {
  background: linear-gradient(135deg, rgba(22,163,74,.90), rgba(34,197,94,.70));
  margin-top: 12px;
}

.finished-box {
  margin-top: 15px;
  padding: 16px;
  background: rgba(255,255,255,.38);
  color: #991b1b;
  border: 1px solid rgba(248,113,113,.32);
  border-radius: 16px;
  font-weight: bold;
  text-align: center;
  line-height: 1.4;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.small-note {
  margin-top: 12px;
  color: #4b5563;
  font-size: 13px;
  text-align: center;
}

.footer {
  text-align: center;
  padding: 28px;
  color: #6b7280;
  font-size: 14px;
}

@media (max-width: 800px) {
  .header h1 {
    font-size: 34px;
  }

  .container {
    margin-top: -35px;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .info-grid > .card:first-child {
  order: 2;
}

.info-grid > .card:last-child {
  order: 1;
}

  .progress-right {
    text-align: left;
  }

  .progress-percent {
    font-size: 36px;
  }

  .price {
    font-size: 38px;
  }
}
</style>
</head>

<body>

<div class="header">
  <h1>${campaign.title}</h1>
  <p>Participa fácilmente desde cualquier lugar</p>
</div>

<div class="container">

  <div class="card">
    <div class="progress-card">

      <div class="progress-header">
        <div>
          <h2 class="progress-title">Avance de la campaña</h2>
          <div class="progress-description">
              Sigue el progreso de participación de la campaña en tiempo real.
          </div>
        </div>

        <div class="progress-right">
          <div class="progress-percent">${soldPercentage}%</div>
          <div class="status-chip">${publicStatusLabel}</div>
        </div>
      </div>

      <div class="progress-bar-wrap">
        <div class="progress-bar"></div>
      </div>

      
    </div>
  </div>

  <div class="info-grid">

    <div class="card">
      <h2 class="section-title">Información de la campaña</h2>

      <p class="description">
        ${campaign.description || "Campaña promocional disponible para participar de forma rápida y segura."}
      </p>

      <div style="margin-top:20px;color:#374151;line-height:1.7;">
  <div><b>Premio:</b> ${campaign.prize || "-"}</div>
  <div><b>Fecha del sorteo:</b> ${campaign.draw_date || "-"}</div>
  <div><b>Sorteo:</b> ${getDrawProviderLabel(campaign.draw_provider)}</div>
  <div><b>Modalidad:</b> ${getDrawModeLabel(campaign.draw_mode)}</div>

  ${
    campaign.draw_provider === "baloto"
      ? `
        <div style="margin-top:10px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;color:#1e3a8a;font-size:13px;line-height:1.5;">
          <b>Regla Baloto:</b><br/>
          Se toman únicamente las 5 balotas principales del resultado oficial, sin incluir la súper balota.
          Las balotas se organizan de menor a mayor y, según la modalidad, se validan las primeras 2, 3, 4 o las 5 balotas completas.
        </div>
      `
      : ""
  }

  ${
  campaign.referral_program_enabled
    ? `
      <div style="margin-top:10px;padding:12px;background:#ecfdf5;border:1px solid #86efac;border-radius:10px;color:#166534;font-size:13px;line-height:1.5;">
        <b>Programa de referidos promocionales:</b><br/>
        Por cada ${campaign.referral_required_approved_orders || 15} compras aprobadas realizadas mediante un enlace de referido válido,
        la persona referidora podrá recibir 1 código promocional de cortesía para participar en esta misma campaña.
        Este beneficio no es canjeable por dinero ni constituye comisión económica.
      </div>
    `
    : ""
}
</div>
    </div>

    <div class="card">
      <div class="price-card">
        <div class="price-label">Valor por código promocional</div>

        <div class="price">
          $${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")}
        </div>

       ${
  campaign.status === "active"
    ? `
      <a
  class="button"
  href="/campanas/${campaign.slug}/comprar${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ""}">
  Participar ahora
</a>

      
      ${
        organizerWhatsAppPhone
          ? `
            <a
              class="button button-whatsapp"
              target="_blank"
              href="https://wa.me/${organizerWhatsAppPhone}?text=${contactOrganizerMessage}">
              Contactar al organizador
            </a>
          `
          : ""
      }

      <a
        class="button button-whatsapp"
        target="_blank"
        href="https://wa.me/?text=${whatsappShareText}">
        Compartir campaña por WhatsApp
      </a>

      <div class="small-note">
        Tu código promocional se asigna automáticamente después del pago aprobado.
      </div>
    `
    : campaign.status === "finished"
      ? `
        <div class="finished-box">
          Esta campaña ya finalizó.<br/>
          No se permiten más compras.
        </div>

        <a
          class="button button-dark"
          style="margin-top:16px;"
          href="/resultado/${campaign.id}">
          Ver resultado
        </a>
      `
      : campaign.status === "cancelled"
        ? `
          <div class="finished-box">
            Esta campaña no se encuentra disponible.
          </div>

          
        `
        : `
          <div class="finished-box" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;">
            Esta campaña está pendiente de aprobación por el administrador.<br/>
            Aún no se permiten compras.
          </div>

                  `
}
      </div>
    </div>

  </div>

</div>

<div class="footer">
  © CampaClick — Plataforma de campañas promocionales
</div>

</body>
</html>
`);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/r/:slug", async (req, res) => {
  return res.redirect(`/campanas/${req.params.slug}`);
});

app.get("/campanas", async (req, res) => {
  try {
    const { data: campaigns, error } = await supabase
      .from("rifas")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Campañas activas - CampaClick</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Arial, sans-serif;
  color: white;
  background:
    radial-gradient(circle at 15% 12%, rgba(37,99,235,.62), transparent 34%),
    radial-gradient(circle at 85% 20%, rgba(124,58,237,.50), transparent 34%),
    radial-gradient(circle at 50% 90%, rgba(22,163,74,.22), transparent 35%),
    linear-gradient(135deg, #020617, #0f172a 48%, #111827);
  padding: 0;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  background:
    linear-gradient(120deg, rgba(255,255,255,.10), transparent 35%),
    radial-gradient(circle at 55% 35%, rgba(255,255,255,.07), transparent 34%);
  pointer-events: none;
}

.header {
  position: relative;
  z-index: 1;
  padding: 58px 20px 88px;
  text-align: center;
}

.brand {
  width: 74px;
  height: 74px;
  margin: 0 auto 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 26px;
  background: rgba(255,255,255,.14);
  border: 1px solid rgba(255,255,255,.30);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow:
    0 18px 48px rgba(0,0,0,.28),
    inset 0 1px 0 rgba(255,255,255,.30);
  font-size: 34px;
}

.header h1 {
  margin: 0;
  font-size: 48px;
  font-weight: 900;
  letter-spacing: .4px;
  text-shadow: 0 10px 28px rgba(0,0,0,.35);
}

.header p {
  margin: 12px auto 0;
  max-width: 720px;
  font-size: 18px;
  color: rgba(255,255,255,.80);
  line-height: 1.5;
}

.container {
  position: relative;
  z-index: 1;
  max-width: 1160px;
  margin: -48px auto 0;
  padding: 0 20px 44px;
}

.glass-card {
  background: rgba(255,255,255,.13);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,.28);
  border-radius: 32px;
  padding: 28px;
  box-shadow:
    0 30px 90px rgba(0,0,0,.36),
    inset 0 1px 0 rgba(255,255,255,.25);
}

.top-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.top-actions a {
  text-decoration: none;
  padding: 13px 18px;
  border-radius: 16px;
  font-weight: 900;
  color: white;
  transition: transform .2s ease, opacity .2s ease;
  border: 1px solid rgba(255,255,255,.18);
}

.top-actions a:hover {
  transform: translateY(-2px);
  opacity: .92;
}

.btn-home {
  background: rgba(15,23,42,.72);
}

.btn-consult {
  background: linear-gradient(135deg, rgba(37,99,235,.95), rgba(124,58,237,.82));
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
}

.campaign {
  min-height: 330px;
  padding: 24px;
  border-radius: 28px;
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.24);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    0 22px 60px rgba(0,0,0,.28),
    inset 0 1px 0 rgba(255,255,255,.18);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: transform .22s ease, box-shadow .22s ease, background .22s ease;
}

.campaign:hover {
  transform: translateY(-4px);
  background: rgba(255,255,255,.16);
  box-shadow:
    0 28px 72px rgba(0,0,0,.35),
    inset 0 1px 0 rgba(255,255,255,.24);
}

.campaign h2 {
  margin: 0 0 12px;
  font-size: 23px;
  color: white;
  line-height: 1.2;
  text-shadow: 0 8px 22px rgba(0,0,0,.25);
}

.description {
  color: rgba(255,255,255,.78);
  line-height: 1.55;
  font-size: 14px;
  margin-bottom: 16px;
}

.info {
  color: rgba(255,255,255,.82);
  font-size: 14px;
  line-height: 1.8;
  margin-bottom: 18px;
}

.info b {
  color: white;
}

.price {
  display: inline-block;
  font-size: 32px;
  font-weight: 900;
  color: #4ade80;
  margin-bottom: 16px;
  text-shadow: 0 10px 26px rgba(0,0,0,.32);
}

.btn {
  display: block;
  width: 100%;
  text-align: center;
  padding: 15px;
  color: white;
  text-decoration: none;
  border-radius: 18px;
  font-weight: 900;
  transition: transform .2s ease, opacity .2s ease;
}

.btn:hover {
  transform: translateY(-2px);
  opacity: .93;
}

.btn-primary {
  background: linear-gradient(135deg, rgba(37,99,235,.98), rgba(124,58,237,.86));
  box-shadow: 0 18px 40px rgba(37,99,235,.25);
}

.btn-secondary {
  background: rgba(15,23,42,.78);
  border: 1px solid rgba(255,255,255,.18);
  margin-top: 10px;
}

.empty {
  padding: 24px;
  background: rgba(245,158,11,.18);
  border: 1px solid rgba(253,230,138,.35);
  color: #fef3c7;
  border-radius: 22px;
  text-align: center;
  font-weight: 900;
}

.footer {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 26px;
  color: rgba(255,255,255,.62);
  font-size: 14px;
}

@media (max-width: 720px) {
  .header {
    padding: 38px 16px 72px;
  }

  .header h1 {
    font-size: 36px;
  }

  .header p {
    font-size: 15px;
  }

  .container {
    margin-top: -42px;
    padding: 0 14px 34px;
  }

  .glass-card {
    padding: 20px;
    border-radius: 28px;
  }

  .campaign {
    min-height: auto;
  }
}
</style>
</head>

<body>

<div class="header">
  <div class="brand">🎯</div>
  <h1>Campañas activas</h1>
  <p>Consulta las campañas disponibles y participa de forma segura con códigos asignados automáticamente.</p>
</div>

<div class="container">
  <div class="glass-card">

    <div class="top-actions">
      <a class="btn-home" href="/">Inicio</a>
      <a class="btn-consult" href="/consultar">Consultar mis códigos</a>
    </div>

    ${
      campaigns && campaigns.length > 0
        ? `
          <div class="grid">
            ${campaigns.map(campaign => `
              <div class="campaign">
                <div>
                  <h2>${campaign.title || "Campaña"}</h2>

                  <div class="description">
                    ${campaign.description || "Campaña promocional disponible para participar."}
                  </div>

                  <div class="info">
                    <div><b>Premio:</b> ${campaign.prize || "-"}</div>
                    <div><b>Fecha del sorteo:</b> ${campaign.draw_date || "-"}</div>
                    <div><b>Sorteo:</b> ${getDrawProviderLabel(campaign.draw_provider)}</div>
                    <div><b>Modalidad:</b> ${getDrawModeLabel(campaign.draw_mode)}</div>
                  </div>

                  <div class="price">
                    $${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")}
                  </div>
                </div>

                <div>
                  <a class="btn btn-primary" href="/campanas/${campaign.slug}">
                    Ver campaña
                  </a>

                  <a class="btn btn-secondary" href="/campanas/${campaign.slug}/comprar">
                    Participar ahora
                  </a>
                </div>
              </div>
            `).join("")}
          </div>
        `
        : `
          <div class="empty">
            En este momento no hay campañas activas disponibles.
          </div>
        `
    }

  </div>
</div>

<div class="footer">
  © CampaClick — Plataforma de campañas promocionales
</div>

</body>
</html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/consultar", async (req, res) => {
  try {
    const phone = String(req.query.phone || "").trim();

    let orders = [];

    if (phone) {
      const cleanPhone = phone.replace(/\D/g, "");

      const { data: buyer, error: buyerError } = await supabase
        .from("buyers")
        .select("*")
        .eq("phone", cleanPhone)
        .maybeSingle();

      if (buyerError) throw buyerError;

      if (buyer) {
        const { data: ordersData, error: ordersError } = await supabase
          .from("orders")
          .select(`
            *,
            rifas(*),
            tickets(*)
          `)
          .eq("buyer_id", buyer.id)
          .order("created_at", { ascending: false });

        if (ordersError) throw ordersError;

        orders = (ordersData || []).sort((a, b) => {
          const aPaid = a.payment_status === "paid" ? 1 : 0;
          const bPaid = b.payment_status === "paid" ? 1 : 0;

          return bPaid - aPaid;
        });
      }
    }

    const baseUrl = APP_BASE_URL;

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Consultar mis códigos - CampaClick</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            font-family: Arial, sans-serif;
            color: white;
            background:
              radial-gradient(circle at 15% 15%, rgba(37,99,235,.55), transparent 32%),
              radial-gradient(circle at 85% 20%, rgba(124,58,237,.45), transparent 34%),
              radial-gradient(circle at 50% 88%, rgba(22,163,74,.24), transparent 34%),
              linear-gradient(135deg, #020617, #0f172a 45%, #111827);
            padding: 26px;
          }

          body::before {
            content: "";
            position: fixed;
            inset: 0;
            background:
              linear-gradient(120deg, rgba(255,255,255,.10), transparent 38%),
              radial-gradient(circle at 50% 50%, rgba(255,255,255,.07), transparent 36%);
            pointer-events: none;
          }

          .container {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 980px;
            margin: 0 auto;
            padding-top: 30px;
          }

          .glass-card {
            background: rgba(255,255,255,.13);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(255,255,255,.28);
            border-radius: 30px;
            padding: 34px;
            box-shadow:
              0 30px 90px rgba(0,0,0,.36),
              inset 0 1px 0 rgba(255,255,255,.25);
          }

          .brand {
            width: 70px;
            height: 70px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 24px;
            background: rgba(255,255,255,.16);
            border: 1px solid rgba(255,255,255,.32);
            box-shadow:
              0 16px 40px rgba(0,0,0,.22),
              inset 0 1px 0 rgba(255,255,255,.35);
            font-size: 32px;
          }

          h1 {
            margin: 0;
            font-size: 38px;
            font-weight: 900;
            letter-spacing: .2px;
            text-shadow: 0 8px 24px rgba(0,0,0,.24);
          }

          .subtitle {
            margin: 12px 0 26px;
            color: rgba(255,255,255,.78);
            line-height: 1.5;
            font-size: 16px;
          }

          label {
            display: block;
            margin-bottom: 8px;
            color: rgba(255,255,255,.88);
            font-weight: 800;
            font-size: 14px;
          }

          input {
            width: 100%;
            padding: 16px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,.25);
            background: rgba(255,255,255,.13);
            color: white;
            outline: none;
            font-size: 16px;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
            transition: border .2s ease, background .2s ease, box-shadow .2s ease;
          }

          input::placeholder {
            color: rgba(255,255,255,.48);
          }

          input:focus {
            border: 1px solid rgba(96,165,250,.85);
            background: rgba(255,255,255,.18);
            box-shadow:
              0 0 0 4px rgba(37,99,235,.22),
              inset 0 1px 0 rgba(255,255,255,.22);
          }

          .btn {
            display: block;
            width: 100%;
            margin-top: 16px;
            padding: 16px;
            border: none;
            border-radius: 18px;
            color: white;
            font-size: 17px;
            font-weight: 900;
            text-align: center;
            text-decoration: none;
            cursor: pointer;
            transition: transform .2s ease, opacity .2s ease, box-shadow .2s ease;
          }

          .btn:hover {
            transform: translateY(-2px);
            opacity: .94;
          }

          .btn-primary {
            background: linear-gradient(135deg, rgba(37,99,235,.98), rgba(124,58,237,.88));
            box-shadow: 0 18px 40px rgba(37,99,235,.28);
          }

          .btn-green {
            background: linear-gradient(135deg, rgba(22,163,74,.96), rgba(37,99,235,.80));
            box-shadow: 0 18px 40px rgba(22,163,74,.25);
          }

          .btn-dark {
            background: rgba(15,23,42,.72);
            border: 1px solid rgba(255,255,255,.18);
          }

          .btn-blue {
            background: rgba(37,99,235,.78);
            border: 1px solid rgba(255,255,255,.18);
          }

          .back-link {
            display: inline-block;
            margin-top: 18px;
            color: rgba(255,255,255,.82);
            font-weight: 800;
            text-decoration: none;
          }

          .back-link:hover {
            color: white;
          }

          .alert {
            margin-top: 24px;
            padding: 16px;
            border-radius: 18px;
            font-weight: 800;
            background: rgba(245,158,11,.20);
            border: 1px solid rgba(253,230,138,.35);
            color: #fef3c7;
          }

          .orders-title {
            margin: 30px 0 16px;
            font-size: 24px;
            font-weight: 900;
          }

          .orders-grid {
            display: grid;
            gap: 16px;
          }

          .order-card {
            background: rgba(255,255,255,.12);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,.22);
            border-radius: 24px;
            padding: 20px;
            box-shadow:
              0 18px 50px rgba(0,0,0,.24),
              inset 0 1px 0 rgba(255,255,255,.18);
          }

          .order-title {
            font-size: 20px;
            font-weight: 900;
            margin-bottom: 12px;
          }

          .info-line {
            margin-top: 8px;
            color: rgba(255,255,255,.82);
            line-height: 1.4;
          }

          .info-line b {
            color: white;
          }

          .coupon-wrap {
            margin-top: 14px;
          }

          .coupon-list {
            margin-top: 10px;
            display: flex;
            gap: 9px;
            flex-wrap: wrap;
          }

          .coupon {
            background: rgba(37,99,235,.85);
            color: white;
            padding: 9px 13px;
            border-radius: 999px;
            font-weight: 900;
            border: 1px solid rgba(255,255,255,.22);
            box-shadow: 0 10px 24px rgba(37,99,235,.20);
          }

          .pending-text {
            margin-top: 12px;
            color: #fef3c7;
            line-height: 1.5;
            font-weight: 700;
          }

          .actions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 10px;
            margin-top: 18px;
          }

          .actions .btn {
            margin-top: 0;
            padding: 14px;
            font-size: 14px;
          }

          @media (max-width: 720px) {
            body {
              padding: 14px;
            }

            .container {
              padding-top: 10px;
            }

            .glass-card {
              padding: 26px 20px;
              border-radius: 26px;
            }

            h1 {
              font-size: 30px;
            }

            .subtitle {
              font-size: 14px;
            }
          }
        </style>
      </head>

      <body>
        <main class="container">
          <section class="glass-card">
            <div class="brand">🔎</div>

            <h1>Consultar mis códigos</h1>

            <p class="subtitle">
              Ingresa el número de teléfono usado en la compra para consultar tus órdenes
              y códigos promocionales asignados.
            </p>

            <form method="GET" action="/consultar">
              <label>Teléfono</label>

              <input
                type="text"
                name="phone"
                value="${phone}"
                placeholder="Ej: 3238123392"
                required
              />

              <button class="btn btn-primary" type="submit">
                Consultar códigos
              </button>
            </form>

            <a class="back-link" href="/">
              ← Volver al inicio
            </a>

            ${
              phone && orders.length === 0
                ? `
                  <div class="alert">
                    No encontramos órdenes asociadas a ese teléfono.
                  </div>
                `
                : ""
            }

            ${
              orders.length > 0
                ? `
                  <h2 class="orders-title">Órdenes encontradas</h2>

                  <div class="orders-grid">
                    ${orders.map(order => {
                      const coupons = (order.tickets || [])
                        .map(t => t.combination || t.ticket_code || "-")
                        .join(", ");

                      const paid = order.payment_status === "paid";

                      let paymentStatusLabel = order.payment_status || "created";

                      if (order.payment_status === "paid") {
                        paymentStatusLabel = "Pago aprobado";
                      }

                      if (order.payment_status === "created") {
                        paymentStatusLabel = "Pago pendiente";
                      }

                      if (order.payment_status === "failed") {
                        paymentStatusLabel = "Pago fallido";
                      }

                      const shareText = encodeURIComponent(
                        `Hola, estos son mis códigos promocionales de la campaña ${order.rifas?.title || ""}: ${coupons || "pendientes"}. Consulta la orden aquí: ${baseUrl}/orden/${order.id}`
                      );

                      return `
                        <div class="order-card">
                          <div class="order-title">
                            ${order.rifas?.title || "Campaña"}
                          </div>

                          <div class="info-line">
                            <b>Estado:</b> ${paymentStatusLabel}
                          </div>

                          <div class="info-line">
                            <b>Cantidad:</b> ${order.qty}
                          </div>

                          <div class="info-line">
                            <b>Total:</b> $${Number(order.total_paid || 0).toLocaleString("es-CO")}
                          </div>

                          ${
                            coupons
                              ? `
                                <div class="coupon-wrap">
                                  <b>Códigos asignados:</b>

                                  <div class="coupon-list">
                                    ${(order.tickets || []).map(t => `
                                      <span class="coupon">
                                        ${t.combination || t.ticket_code || "-"}
                                      </span>
                                    `).join("")}
                                  </div>
                                </div>
                              `
                              : `
                                <div class="pending-text">
                                  Aún no hay códigos promocionales asignados. Si ya pagaste,
                                  espera unos segundos y vuelve a consultar.
                                </div>
                              `
                          }

                          <div class="actions">
                            <a class="btn btn-green" href="/orden/${order.id}">
                              ${paid ? "Ver orden" : "Continuar pago"}
                            </a>

                            <a class="btn btn-dark" href="/campanas/${order.rifas?.slug || ""}">
                              Ver campaña
                            </a>

                            ${
                              coupons
                                ? `
                                  <a
                                    class="btn btn-blue"
                                    target="_blank"
                                    href="https://wa.me/?text=${shareText}">
                                    Compartir códigos
                                  </a>
                                `
                                : ""
                            }
                          </div>
                        </div>
                      `;
                    }).join("")}
                  </div>
                `
                : ""
            }
          </section>
        </main>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/campanas/:slug/comprar", async (req, res) => {
  try {
    const { slug } = req.params;

    const referralCode = normalizeReferralCode(req.query.ref);

    const { data: campaign, error } = await supabase
      .from("rifas")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error || !campaign) {
      return res.status(404).send("Campaña no encontrada");
    }

    if (campaign.status !== "active") {
      if (campaign.status === "finished") {
        return res.redirect(`/resultado/${campaign.id}`);
      }

      return res.status(403).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1"/>
          <title>Campaña no disponible</title>
        </head>
        <body style="font-family:Arial;background:#020617;color:white;padding:40px;">
          <div style="max-width:620px;margin:auto;background:rgba(255,255,255,.12);backdrop-filter:blur(20px);padding:30px;border-radius:28px;text-align:center;">
            <h1>Campaña no disponible</h1>
            <p>Esta campaña aún no está habilitada para compras.</p>

            <a
              href="/campanas/${campaign.slug}"
              style="display:inline-block;margin-top:18px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:14px;font-weight:bold;">
              Volver a la campaña
            </a>
          </div>
        </body>
        </html>
      `);
    }

    const minimumQty = getMinimumQtyByPrice(campaign.price_per_ticket);
    const minimumQtyText = getMinimumQtyText(campaign.price_per_ticket);

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>

        <title>Comprar - ${campaign.title}</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            font-family: Arial, sans-serif;
            color: white;
            background:
              radial-gradient(circle at 15% 12%, rgba(37,99,235,.62), transparent 32%),
              radial-gradient(circle at 85% 18%, rgba(124,58,237,.52), transparent 34%),
              radial-gradient(circle at 45% 92%, rgba(16,185,129,.18), transparent 34%),
              linear-gradient(135deg, #020617, #0f172a 48%, #111827);
            padding: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow-x: hidden;
          }

          body::before {
            content: "";
            position: fixed;
            inset: 0;
            background:
              linear-gradient(120deg, rgba(255,255,255,.10), transparent 35%),
              radial-gradient(circle at 55% 35%, rgba(255,255,255,.08), transparent 34%);
            pointer-events: none;
          }

          .glass-card {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 820px;
            background: rgba(255,255,255,.13);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(255,255,255,.28);
            border-radius: 34px;
            padding: 34px;
            box-shadow:
              0 30px 90px rgba(0,0,0,.36),
              inset 0 1px 0 rgba(255,255,255,.24);
          }

          .top-badge {
            width: 76px;
            height: 76px;
            margin: 0 auto 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 28px;
            background: rgba(255,255,255,.14);
            border: 1px solid rgba(255,255,255,.30);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            box-shadow:
              0 18px 48px rgba(0,0,0,.28),
              inset 0 1px 0 rgba(255,255,255,.30);
            font-size: 36px;
          }

          h1 {
            margin: 0;
            text-align: center;
            font-size: 38px;
            font-weight: 900;
            letter-spacing: .3px;
            line-height: 1.15;
            text-shadow: 0 10px 28px rgba(0,0,0,.35);
          }

          .price {
            margin: 18px auto 24px;
            width: fit-content;
            padding: 12px 22px;
            border-radius: 999px;
            background: rgba(34,197,94,.16);
            border: 1px solid rgba(134,239,172,.38);
            color: #86efac;
            font-size: 32px;
            font-weight: 900;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
          }

          .form-grid {
            display: grid;
            gap: 16px;
          }

          label {
            display: block;
            margin-bottom: 8px;
            color: rgba(255,255,255,.86);
            font-weight: bold;
          }

          input {
            width: 100%;
            padding: 15px 16px;
            border-radius: 17px;
            border: 1px solid rgba(255,255,255,.26);
            background: rgba(255,255,255,.12);
            color: white;
            outline: none;
            font-size: 16px;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            box-shadow: inset 0 1px 0 rgba(255,255,255,.16);
          }

          input::placeholder {
            color: rgba(255,255,255,.48);
          }

          input:focus {
            border-color: rgba(96,165,250,.85);
            box-shadow:
              0 0 0 4px rgba(37,99,235,.22),
              inset 0 1px 0 rgba(255,255,255,.18);
          }

          .info-box {
            margin-top: 6px;
            padding: 15px;
            border-radius: 20px;
            background: rgba(255,255,255,.11);
            border: 1px solid rgba(255,255,255,.22);
            color: rgba(255,255,255,.82);
            line-height: 1.5;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
          }

          .rule-box {
            margin-top: 12px;
            padding: 16px;
            border-radius: 22px;
            background: rgba(37,99,235,.20);
            border: 1px solid rgba(147,197,253,.35);
            color: rgba(255,255,255,.88);
            line-height: 1.5;
          }

          .pay-button {
            width: 100%;
            margin-top: 22px;
            padding: 18px;
            border: none;
            border-radius: 20px;
            background: linear-gradient(135deg, #2563eb, #7c3aed);
            color: white;
            font-size: 19px;
            font-weight: 900;
            cursor: pointer;
            box-shadow:
              0 18px 42px rgba(37,99,235,.34),
              inset 0 1px 0 rgba(255,255,255,.20);
            transition: transform .2s ease, opacity .2s ease;
          }

          .pay-button:hover {
            transform: translateY(-2px);
            opacity: .94;
          }

          .back {
            display: block;
            margin-top: 18px;
            text-align: center;
            color: rgba(255,255,255,.78);
            font-weight: bold;
            text-decoration: none;
          }

          .back:hover {
            color: white;
          }

          .small-note {
            margin-top: 14px;
            text-align: center;
            color: rgba(255,255,255,.62);
            font-size: 13px;
            line-height: 1.4;
          }

          @media (max-width: 700px) {
            body {
              align-items: flex-start;
              padding: 16px;
            }

            .glass-card {
              padding: 24px;
              border-radius: 30px;
            }

            h1 {
              font-size: 29px;
            }

            .price {
              font-size: 28px;
            }
          }
        </style>
      </head>

      <body>
        <div class="glass-card">
          <div class="top-badge">🎯</div>

          <h1>${campaign.title}</h1>

          <div class="price">
            $${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")}
          </div>

          <form method="POST" action="/campanas/${campaign.slug}/comprar">
          <input type="hidden" name="referral_code" value="${referralCode}">
            <div class="form-grid">

              <div>
                <label>Nombre completo</label>
                <input
                  type="text"
                  name="buyer_name"
                  required
                  placeholder="Escribe tu nombre completo"
                >
              </div>

              <div>
                <label>Teléfono</label>
                <input
                  type="text"
                  name="buyer_phone"
                  required
                  placeholder="Ej: 3238123392"
                >
              </div>

              <div>
                <label>Correo electrónico</label>
                <input
                  type="email"
                  name="buyer_email"
                  placeholder="Opcional"
                >
              </div>

              <div>
                <label>Cantidad de códigos</label>

                <input
                  type="number"
                  name="qty"
                  min="${minimumQty}"
                  max="${Math.min(20, Number(campaign.available_tickets || 0))}"
                  value="${minimumQty}"
                  required
                >

                <div class="info-box">
                  Compra mínima para esta campaña:
                  <b>${minimumQty}</b> ${minimumQty === 1 ? "código promocional" : "códigos promocionales"}.
                </div>

                <div class="rule-box">
                  <b>Regla de compra:</b><br/>
                  ${minimumQtyText}
                </div>
              </div>

            </div>

            <button class="pay-button" type="submit">
              Continuar al pago
            </button>
          </form>

          <div class="small-note">
            Tus códigos promocionales se asignan automáticamente después del pago aprobado.
          </div>

          <a class="back" href="/campanas/${campaign.slug}">
            Volver a la campaña
          </a>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/campanas/:slug/comprar", async (req, res) => {
  try {
    const { slug } = req.params;

    const buyerName = String(req.body.buyer_name || "").trim();
    const buyerPhone = String(req.body.buyer_phone || "").trim();
    const cleanBuyerPhone = buyerPhone.replace(/\D/g, "");
    const buyerEmail = String(req.body.buyer_email || "").trim();
    const qty = Number(req.body.qty || 0);
    const referralCode = normalizeReferralCode(req.body.referral_code);

    if (!buyerName || !cleanBuyerPhone) {
  return res.status(400).send("Faltan nombre o teléfono");
}

    if (!Number.isInteger(qty) || qty <= 0 || qty > 20) {
      return res.status(400).send("Cantidad inválida");
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("rifas")
      .select("*")
      .eq("slug", slug)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).send("Campaña no encontrada");
    }

if (campaign.status !== "active") {
  return res.status(403).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Campaña no disponible</title>
    </head>
    <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
      <div style="max-width:600px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
        <h1>Campaña no disponible</h1>
        <p>Esta campaña no está habilitada para compras en este momento.</p>

        ${
          campaign.status === "finished"
            ? `
              <a
                href="/resultado/${campaign.id}"
                style="display:inline-block;margin-top:18px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
                Ver resultado
              </a>
            `
            : `
              <a
                href="/campanas/${campaign.slug}"
                style="display:inline-block;margin-top:18px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
                Volver a la campaña
              </a>
            `
        }
      </div>
    </body>
    </html>
  `);
}

    const minimumQty = getMinimumQtyByPrice(campaign.price_per_ticket);

if (qty < minimumQty) {
  return res.status(400).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Cantidad mínima</title>
    </head>
    <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
      <div style="max-width:600px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
        <h1>Cantidad mínima requerida</h1>

        <p>
          Para esta campaña, el valor del código promocional exige una compra mínima de
          <b>${minimumQty} cupones</b>.
        </p>

        <a
          href="/campanas/${campaign.slug}/comprar"
          style="display:inline-block;margin-top:18px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
          Volver a comprar
        </a>
      </div>
    </body>
    </html>
  `);
}    

    const availableTickets = Number(campaign.available_tickets || 0);

if (qty > availableTickets) {
  return res.status(400).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Cantidad no disponible</title>
    </head>
    <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
      <div style="max-width:600px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
        <h1>No fue posible procesar la cantidad solicitada</h1>

        <p>
          En este momento no es posible asignar esa cantidad de códigos promocionales.
          Intenta con una cantidad menor.
        </p>

        <a
          href="/campanas/${campaign.slug}/comprar"
          style="display:inline-block;margin-top:18px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
          Volver a comprar
        </a>
      </div>
    </body>
    </html>
  `);
}

    let referrerId = null;

if (campaign.referral_program_enabled && referralCode) {
  const { data: referrer, error: referrerError } = await supabase
    .from("campaign_referrers")
    .select("*")
    .eq("rifa_id", campaign.id)
    .eq("referral_code", referralCode)
    .eq("status", "active")
    .maybeSingle();

  if (referrerError) throw referrerError;

  if (referrer) {
    const referrerPhone = String(referrer.phone || "").replace(/\D/g, "");

    if (referrerPhone !== cleanBuyerPhone) {
      referrerId = referrer.id;
    }
  }
}
    
    let buyer = null;

    const { data: existingBuyer, error: existingBuyerError } = await supabase
      .from("buyers")
      .select("*")
      .eq("phone", cleanBuyerPhone)
      .maybeSingle();

    if (existingBuyerError) throw existingBuyerError;

    if (existingBuyer) {
      buyer = existingBuyer;
    } else {
      const { data: newBuyer, error: newBuyerError } = await supabase
        .from("buyers")
        .insert({
          full_name: buyerName,
          phone: cleanBuyerPhone,
          email: buyerEmail || null
        })
        .select()
        .single();

      if (newBuyerError) throw newBuyerError;
      buyer = newBuyer;
    }

const subtotal = qty * Number(campaign.price_per_ticket || 0);
    const totalPaid = subtotal;
    const commission = 0;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
  rifa_id: campaign.id,
  buyer_id: buyer.id,
  qty,
  subtotal,
  total_paid: totalPaid,
  commission,
  payment_status: "created",
  referral_code: referralCode || null,
  referrer_id: referrerId
})
      .select()
      .single();

    if (orderError) throw orderError;

    const externalReference = `ord_${Date.now()}_${order.id.slice(0, 8)}`;

    const { error: paymentError } = await supabase
      .from("payments")
      .insert({
        order_id: order.id,
        provider: "manual",
        external_reference: externalReference,
        amount: totalPaid,
        status: "pending"
      });

    if (paymentError) throw paymentError;

    return res.redirect(`/orden/${order.id}`);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/orden/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        rifas(*),
        buyers(*)
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).send("Orden no encontrada");
    }

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) throw paymentError;

    if (!payment) {
      return res.status(404).send("Pago no encontrado");
    }

    const wompiTransactionId = String(req.query.id || "").trim();

if (wompiTransactionId && payment.status !== "approved") {
  if (!WOMPI_PRIVATE_KEY) {
    return res.status(500).send("Falta WOMPI_PRIVATE_KEY");
  }

  const wompiBaseUrl = WOMPI_PUBLIC_KEY?.startsWith("pub_test_")
    ? "https://sandbox.wompi.co/v1"
    : "https://production.wompi.co/v1";

  const wompiResponse = await fetch(`${wompiBaseUrl}/transactions/${wompiTransactionId}`, {
    headers: {
      Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`
    }
  });

  const wompiJson = await wompiResponse.json();
  const transaction = wompiJson?.data;
  const transactionStatus = transaction?.status;

  if (transactionStatus === "APPROVED") {
    await supabase
      .from("payments")
      .update({
        status: "approved",
        provider: "wompi",
        provider_transaction_id: wompiTransactionId
      })
      .eq("id", payment.id);

    await supabase
      .from("orders")
      .update({
        payment_status: "paid"
      })
      .eq("id", orderId);

    const { data: existingTickets } = await supabase
      .from("tickets")
      .select("id")
      .eq("order_id", orderId);

   if (!existingTickets || existingTickets.length === 0) {
  await assignTicketsToOrder(orderId);

  const { data: updatedOrderData } = await supabase
    .from("orders")
    .select(`
      *,
      rifas(*)
    `)
    .eq("id", orderId)
    .single();

  if (updatedOrderData?.rifas) {
    const soldTickets =
      Number(updatedOrderData.rifas.sold_tickets || 0) + Number(updatedOrderData.qty || 0);

    const availableTickets =
      Number(updatedOrderData.rifas.max_tickets || 0) - soldTickets;

    await supabase
      .from("rifas")
      .update({
        sold_tickets: soldTickets,
        available_tickets: availableTickets
      })
      .eq("id", updatedOrderData.rifas.id);
  }
}

await sendOrderCouponsWhatsApp(orderId);
await processReferralReward(orderId);

return res.redirect(`/orden/${orderId}`);
  }
}

    const { data: tickets } = await supabase
  .from("tickets")
  .select("*")
  .eq("order_id", orderId);

    if (!WOMPI_PUBLIC_KEY || !WOMPI_INTEGRITY_SECRET) {
      return res.status(500).send("Faltan variables de Wompi");
    }

    const currency = "COP";
    const amountInCents = Math.round(Number(order.total_paid || 0) * 100).toString();
    const reference = payment.external_reference;
    const signature = generateWompiIntegritySignature(
      reference,
      amountInCents,
      currency,
      WOMPI_INTEGRITY_SECRET
    );

    const baseUrl = APP_BASE_URL;
    const redirectUrl = `${APP_BASE_URL}/orden/${order.id}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Orden ${order.id}</title>
      </head>
      <body style="font-family: Arial, sans-serif; background:#f5f7fb; padding:40px;">
        <div style="max-width:860px;margin:0 auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
          <h1 style="margin-top:0;">Resumen de tu orden</h1>

          <div style="margin-bottom:10px;"><b>Campaña:</b> ${order.rifas?.title || "-"}</div>
          <div style="margin-bottom:10px;"><b>Comprador:</b> ${order.buyers?.full_name || "-"}</div>
          <div style="margin-bottom:10px;"><b>Teléfono:</b> ${order.buyers?.phone || "-"}</div>
          <div style="margin-bottom:10px;"><b>Cantidad:</b> ${order.qty}</div>
          <div style="margin-bottom:10px;"><b>Subtotal:</b> $${Number(order.subtotal || 0).toLocaleString("es-CO")}</div>
          <div style="margin-bottom:10px;"><b>Total:</b> $${Number(order.total_paid || 0).toLocaleString("es-CO")}</div>
          <div style="margin-bottom:10px;"><b>Estado de orden:</b> ${order.payment_status}</div>
          <div style="margin-bottom:18px;"><b>Estado de pago:</b> ${payment.status || "-"}</div>

       ${
  tickets && tickets.length
    ? `
    <div style="margin-bottom:18px;">
      <b>Códigos asignadas:</b>

      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
        ${tickets.map(t => `
          <div style="
            background:#1e3a8a;
            color:white;
            padding:10px 14px;
            border-radius:10px;
            font-weight:bold;
          ">
            ${t.combination || t.ticket_code || "-"}
          </div>
        `).join("")}
      </div>

      <a
        target="_blank"
        href="https://wa.me/?text=${encodeURIComponent(
  `Hola, estas son mis Códigos de la campaña ${order.rifas?.title || ""}: ${(tickets || []).map(t => t.combination || t.ticket_code).join(", ")}. Consulta la orden aquí: ${baseUrl}/orden/${order.id}`
)}"
        style="
          display:block;
          margin-top:18px;
          padding:14px;
          background:#16a34a;
          color:white;
          text-align:center;
          text-decoration:none;
          border-radius:12px;
          font-weight:bold;
        "
      >
        Compartir mis Códigos por WhatsApp
      </a>
    </div>
    `
    : ""
}

          
         ${payment.status !== "approved" ? `
<div style="margin-top:18px;padding:14px;background:#eff6ff;border-radius:12px;color:#1e3a8a;">
Ya puedes continuar al pago de forma segura.
</div>

<form action="https://checkout.wompi.co/p/" method="GET">

  <input type="hidden" name="public-key" value="${WOMPI_PUBLIC_KEY}">
  <input type="hidden" name="currency" value="${currency}">
  <input type="hidden" name="amount-in-cents" value="${amountInCents}">
  <input type="hidden" name="reference" value="${reference}">
  <input type="hidden" name="signature:integrity" value="${signature}">
  <input type="hidden" name="redirect-url" value="${redirectUrl}">

  <button
  type="submit"
  style="
    width:100%;
    padding:20px;
    background:#2563eb;
    color:#fff;
    border:none;
    border-radius:14px;
    font-weight:900;
    font-size:20px;
    cursor:pointer;
    box-shadow:0 10px 24px rgba(37,99,235,.35);
  ">
  Pagar seguro con Nequi, PSE o tarjeta
</button>

</form>
` : `
<div style="
margin-top:20px;
padding:16px;
background:#ecfdf5;
border:1px solid #10b981;
border-radius:12px;
color:#065f46;
font-weight:bold;
text-align:center;
">
✅ Pago aprobado correctamente
</div>
`}

<div style="margin-top:18px;">
  <a
    href="/campanas/${order.rifas?.slug || ""}"
    style="
      display:block;
      padding:14px;
      background:#111827;
      color:white;
      text-align:center;
      text-decoration:none;
      border-radius:12px;
      font-weight:bold;
    "
  >
    Volver a la campaña
  </a>
</div>

<div style="margin-top:12px;">
  <a
    href="/consultar"
    style="
      display:block;
      padding:14px;
      background:#2563eb;
      color:white;
      text-align:center;
      text-decoration:none;
      border-radius:12px;
      font-weight:bold;
    "
  >
    Consultar mis Códigos
  </a>
</div>

        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/webhooks/wompi", async (req, res) => {
  try {
    const payload = req.body || {};
    const event = payload.event;
    const data = payload.data || {};
    const transaction = data.transaction || {};
    const signature = payload.signature || {};

    if (!WOMPI_EVENTS_SECRET) {
      return res.status(500).send("Falta WOMPI_EVENTS_SECRET");
    }

    if (event !== "transaction.updated" || !transaction.id) {
      return res.status(200).send("Evento ignorado");
    }

    const properties = Array.isArray(signature.properties) ? signature.properties : [];
    const expectedChecksum = String(signature.checksum || "").toLowerCase();
    const timestamp = String(payload.timestamp || "").trim();

    const getValue = (base, property) => {
      const path = String(property || "").split(".");
      let current = base;

      for (const key of path) {
        if (current && typeof current === "object" && key in current) {
          current = current[key];
        } else {
          return "";
        }
      }

      return String(current ?? "");
    };

    const valuesFromData = properties.map((p) => getValue(data, p)).join("");
    const valuesFromPayload = properties.map((p) => getValue(payload, p)).join("");

    const checksumFromData = crypto
      .createHash("sha256")
      .update(`${valuesFromData}${timestamp}${WOMPI_EVENTS_SECRET}`)
      .digest("hex")
      .toLowerCase();

    const checksumFromPayload = crypto
      .createHash("sha256")
      .update(`${valuesFromPayload}${timestamp}${WOMPI_EVENTS_SECRET}`)
      .digest("hex")
      .toLowerCase();

    const validSignature =
      safeCompare(checksumFromData, expectedChecksum) ||
      safeCompare(checksumFromPayload, expectedChecksum);

    if (!validSignature) {
      console.log("Firma Wompi inválida");
      console.log("properties:", properties);
      console.log("timestamp:", timestamp);
      return res.status(401).send("Firma inválida");
    }

    const reference = transaction.reference || "";
    const transactionStatus = transaction.status || "";
    const transactionId = transaction.id || "";

    if (!reference) {
      return res.status(200).send("Sin referencia");
    }

    const { data: payment, error: paymentLookupError } = await supabase
      .from("payments")
      .select("*")
      .eq("external_reference", reference)
      .maybeSingle();

    if (paymentLookupError) throw paymentLookupError;

    if (!payment) {
      return res.status(200).send("Pago no encontrado");
    }

    let localPaymentStatus = "pending";
    let localOrderStatus = "created";

   if (transactionStatus === "APPROVED") {
  localPaymentStatus = "approved";
  localOrderStatus = "paid";

  const { data: existingTickets } = await supabase
    .from("tickets")
    .select("id")
    .eq("order_id", payment.order_id);

  if (!existingTickets || existingTickets.length === 0) {
    await assignTicketsToOrder(payment.order_id);

    const { data: orderData } = await supabase
      .from("orders")
      .select(`
        *,
        rifas(*)
      `)
      .eq("id", payment.order_id)
      .single();

    if (orderData?.rifas) {
      const soldTickets =
        Number(orderData.rifas.sold_tickets || 0) + Number(orderData.qty || 0);

      const availableTickets =
        Number(orderData.rifas.max_tickets || 0) - soldTickets;

      await supabase
        .from("rifas")
        .update({
          sold_tickets: soldTickets,
          available_tickets: availableTickets,
          })
        .eq("id", orderData.rifas.id);
    }
  }
}

  
    if (["DECLINED", "ERROR", "VOIDED"].includes(transactionStatus)) {
      localPaymentStatus = "failed";
      localOrderStatus = "failed";
    }

   const { error: updatePaymentError } = await supabase
  .from("payments")
  .update({
    status: localPaymentStatus,
    provider: "wompi"
  })
  .eq("id", payment.id);

if (updatePaymentError) throw updatePaymentError;

    const { error: updateOrderError } = await supabase
  .from("orders")
  .update({
    payment_status: localOrderStatus
  })
  .eq("id", payment.order_id);

if (updateOrderError) throw updateOrderError;

if (localOrderStatus === "paid") {
  await sendOrderCouponsWhatsApp(payment.order_id);
  await processReferralReward(payment.order_id);
}

return res.status(200).send("ok");
    
  } catch (error) {
    console.error("Webhook Wompi error:", error);
    return res.status(500).send(error.message);
  }
});


app.get("/resultado/:rifaId", async (req, res) => {
  try {
    const { rifaId } = req.params;

    const { data: rifa, error } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();

    if (error || !rifa) {
      return res.status(404).send("Resultado no encontrado");
    }

    let winnerHtml = "";
    let statusBoxHtml = "";

    if (!rifa.result_value) {
      statusBoxHtml = `
        <div class="status-box pending-box">
          <div class="status-icon">⏳</div>
          <h2>Resultado pendiente</h2>
          <p>
            El resultado oficial aún no ha sido cargado por el administrador.
            Cuando esté disponible, podrás consultarlo en esta misma página.
          </p>
        </div>
      `;
    } else if (rifa.winner_ticket_id) {
      const { data: ticket } = await supabase
        .from("tickets")
        .select(`
          *,
          buyers(*)
        `)
        .eq("id", rifa.winner_ticket_id)
        .single();

      if (ticket) {
        statusBoxHtml = `
          <div class="status-box winner-box">
            <div class="status-icon">🎉</div>
            <h2>¡Tenemos ganador!</h2>
            <p>La campaña ya cuenta con un código promocional ganador registrado.</p>
          </div>
        `;

        winnerHtml = `
          <div class="winner-card">
            <h3>Información del ganador</h3>

            <div class="winner-row">
              <span>Nombre</span>
              <strong>${ticket.buyers?.full_name || "-"}</strong>
            </div>

            <div class="winner-row">
  <span>Teléfono</span>
  <strong>${maskPhone(ticket.buyers?.phone)}</strong>
</div>

            <div class="winner-row">
              <span>Código promocional ganador</span>
              <strong class="ticket-badge">${ticket.combination || ticket.ticket_code || "-"}</strong>
            </div>
          </div>
        `;
      }
    } else {
      statusBoxHtml = `
        <div class="status-box no-winner-box">
          <div class="status-icon">🔎</div>
          <h2>No hubo ganador</h2>
          <p>
            El resultado fue cargado correctamente, pero ningún código vendido
            coincide con el resultado oficial.
          </p>
        </div>
      `;
    }

    const publicCampaignUrl = rifa.slug ? `/campanas/${rifa.slug}` : "/";
    const shareText = encodeURIComponent(
      `Resultado de la campaña ${rifa.title}: ${rifa.result_value || "pendiente"}`
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>

        <title>Resultado - ${rifa.title}</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f3f6fb;
            color: #111827;
          }

          .hero {
            background: linear-gradient(135deg, #1d4ed8, #2563eb);
            color: white;
            padding: 50px 20px;
            text-align: center;
          }

          .hero h1 {
            margin: 0;
            font-size: 38px;
          }

          .hero p {
            margin: 10px 0 0;
            opacity: .9;
            font-size: 17px;
          }

          .container {
            max-width: 850px;
            margin: -35px auto 0;
            padding: 0 20px 40px;
          }

          .main-card {
            background: white;
            border-radius: 22px;
            padding: 30px;
            box-shadow: 0 14px 40px rgba(0,0,0,.10);
          }

          .campaign-title {
            margin: 0 0 8px;
            font-size: 28px;
            color: #111827;
          }

          .campaign-subtitle {
            margin: 0 0 24px;
            color: #6b7280;
          }

          .result-box {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 18px;
            padding: 24px;
            text-align: center;
            margin-bottom: 24px;
          }

          .result-label {
            color: #1e3a8a;
            font-weight: bold;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: .08em;
          }

          .result-value {
            margin-top: 10px;
            font-size: 46px;
            color: #2563eb;
            font-weight: 900;
          }

          .status-box {
            border-radius: 18px;
            padding: 24px;
            margin-bottom: 24px;
            text-align: center;
          }

          .status-icon {
            font-size: 42px;
            margin-bottom: 8px;
          }

          .status-box h2 {
            margin: 0 0 8px;
            font-size: 26px;
          }

          .status-box p {
            margin: 0;
            line-height: 1.5;
          }

          .winner-box {
            background: #dcfce7;
            color: #166534;
            border: 1px solid #86efac;
          }

          .no-winner-box {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fecaca;
          }

          .pending-box {
            background: #fef3c7;
            color: #92400e;
            border: 1px solid #fde68a;
          }

          .winner-card {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 18px;
            padding: 22px;
            margin-bottom: 24px;
          }

          .winner-card h3 {
            margin-top: 0;
            color: #111827;
          }

          .winner-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 13px 0;
            border-bottom: 1px solid #e5e7eb;
          }

          .winner-row:last-child {
            border-bottom: none;
          }

          .winner-row span {
            color: #6b7280;
          }

          .winner-row strong {
            color: #111827;
            text-align: right;
          }

          .ticket-badge {
            background: #1d4ed8;
            color: white !important;
            padding: 8px 12px;
            border-radius: 999px;
            display: inline-block;
          }

          .actions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
            margin-top: 20px;
          }

          .btn {
            display: block;
            padding: 15px;
            border-radius: 14px;
            text-align: center;
            text-decoration: none;
            font-weight: bold;
          }

          .btn-primary {
            background: #2563eb;
            color: white;
          }

          .btn-whatsapp {
            background: #16a34a;
            color: white;
          }

          .footer {
            text-align: center;
            color: #6b7280;
            padding: 24px;
            font-size: 14px;
          }

          @media (max-width: 600px) {
            .hero h1 {
              font-size: 30px;
            }

            .result-value {
              font-size: 38px;
            }

            .winner-row {
              flex-direction: column;
            }

            .winner-row strong {
              text-align: left;
            }
          }
        </style>
      </head>

      <body>

        <div class="hero">
          <h1>Resultado de la campaña</h1>
          <p>CampaClick — Consulta oficial del resultado</p>
        </div>

        <div class="container">
          <div class="main-card">

            <h2 class="campaign-title">${rifa.title}</h2>
            <p class="campaign-subtitle">
              Premio: ${rifa.prize || "-"}
            </p>

            <div class="result-box">
              <div class="result-label">Resultado oficial</div>
              <div class="result-value">${rifa.result_value || "Pendiente"}</div>
            </div>

            ${statusBoxHtml}

            ${winnerHtml}

            <div class="actions">
              <a class="btn btn-primary" href="${publicCampaignUrl}">
                Volver a la campaña
              </a>

              <a
                class="btn btn-whatsapp"
                target="_blank"
                href="https://wa.me/?text=${shareText}"
              >
                Compartir por WhatsApp
              </a>
            </div>

          </div>
        </div>

        <div class="footer">
          © CampaClick — Plataforma de campañas promocionales
        </div>

      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/admin/login", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Ingreso administrador - CampaClick</title>

      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          min-height: 100vh;
          font-family: Arial, sans-serif;
          color: white;
          background:
            radial-gradient(circle at 18% 15%, rgba(37,99,235,.62), transparent 34%),
            radial-gradient(circle at 82% 20%, rgba(124,58,237,.50), transparent 34%),
            radial-gradient(circle at 50% 90%, rgba(14,165,233,.18), transparent 35%),
            linear-gradient(135deg, #020617, #0f172a 48%, #111827);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow: hidden;
        }

        body::before {
          content: "";
          position: fixed;
          inset: 0;
          background:
            linear-gradient(120deg, rgba(255,255,255,.10), transparent 35%),
            radial-gradient(circle at 55% 35%, rgba(255,255,255,.08), transparent 34%);
          pointer-events: none;
        }

        .glass-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 520px;
          background: rgba(255,255,255,.13);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,.28);
          border-radius: 32px;
          padding: 34px;
          box-shadow:
            0 30px 90px rgba(0,0,0,.36),
            inset 0 1px 0 rgba(255,255,255,.25);
        }

        .brand {
          width: 72px;
          height: 72px;
          margin: 0 auto 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 26px;
          background: rgba(255,255,255,.14);
          border: 1px solid rgba(255,255,255,.30);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          box-shadow:
            0 18px 48px rgba(0,0,0,.28),
            inset 0 1px 0 rgba(255,255,255,.30);
          font-size: 34px;
        }

        h1 {
          margin: 0 0 8px;
          text-align: center;
          font-size: 36px;
          font-weight: 900;
          letter-spacing: .3px;
          text-shadow: 0 10px 28px rgba(0,0,0,.35);
        }

        .subtitle {
          text-align: center;
          margin: 0 0 26px;
          color: rgba(255,255,255,.74);
          line-height: 1.5;
          font-size: 15px;
        }

        label {
          display: block;
          margin-bottom: 8px;
          color: rgba(255,255,255,.86);
          font-weight: bold;
        }

        input {
          width: 100%;
          padding: 15px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.26);
          background: rgba(255,255,255,.12);
          color: white;
          outline: none;
          font-size: 16px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.16);
        }

        input:focus {
          border-color: rgba(96,165,250,.85);
          box-shadow:
            0 0 0 4px rgba(37,99,235,.22),
            inset 0 1px 0 rgba(255,255,255,.18);
        }

        button {
          width: 100%;
          margin-top: 20px;
          padding: 16px;
          border: none;
          border-radius: 18px;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          color: white;
          font-size: 17px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 18px 40px rgba(37,99,235,.30);
          transition: transform .2s ease, opacity .2s ease;
        }

        button:hover {
          transform: translateY(-2px);
          opacity: .94;
        }

        .back {
          display: block;
          margin-top: 18px;
          text-align: center;
          color: rgba(255,255,255,.78);
          font-weight: bold;
          text-decoration: none;
        }

        .back:hover {
          color: white;
        }

        @media (max-width: 600px) {
          body {
            align-items: flex-start;
            padding-top: 34px;
          }

          .glass-card {
            padding: 26px;
            border-radius: 28px;
          }

          h1 {
            font-size: 30px;
          }
        }
      </style>
    </head>

    <body>
      <div class="glass-card">
        <div class="brand">🛡️</div>

        <h1>Ingreso administrador</h1>

        <p class="subtitle">
          Accede al panel de control para revisar organizadores, campañas, resultados y liquidaciones.
        </p>

        <form method="POST" action="/admin/login">
          <label>Clave administrador</label>

          <input
            type="password"
            name="password"
            required
            placeholder="Ingresa la clave de administrador"
          />

          <button type="submit">
            Ingresar
          </button>
        </form>

        <a class="back" href="/">
          Volver al inicio
        </a>
      </div>
    </body>
    </html>
  `);
});

app.post("/admin/login", loginLimiter, (req, res) => {
  const password = String(req.body.password || "").trim();

  if (!ADMIN_PASSWORD) {
    return res.status(500).send("Falta ADMIN_PASSWORD en Railway");
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).send("Clave incorrecta");
  }

  req.session.isAdmin = true;
  return res.redirect("/admin/resultados");
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

app.get("/admin/organizadores", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const { data: organizers, error } = await supabase
      .from("organizers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Admin - Organizadores</title>
      </head>

      <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
        <div style="max-width:1200px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);overflow-x:auto;">

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
            <div>
              <h1 style="margin:0;">Administrador de organizadores</h1>
              <p style="margin:8px 0 0;color:#6b7280;">
                Revisa el estado de verificación de los organizadores registrados.
              </p>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <a
                href="/admin/resultados"
                style="background:#2563eb;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;">
                Campañas
              </a>

              <a
                href="/admin/logout"
                style="background:#111827;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;">
                Cerrar sesión
              </a>
            </div>
          </div>

          <table style="width:100%;min-width:1000px;border-collapse:collapse;">
            <thead>
              <tr style="background:#eff6ff;">
                <th style="padding:12px;text-align:left;">Nombre</th>
                <th style="padding:12px;text-align:left;">Correo</th>
                <th style="padding:12px;text-align:left;">Teléfono</th>
                <th style="padding:12px;text-align:left;">Documento</th>
                <th style="padding:12px;text-align:left;">Método pago</th>
                <th style="padding:12px;text-align:left;">Soportes</th>
                <th style="padding:12px;text-align:left;">Estado</th>
                <th style="padding:12px;text-align:left;">Acción</th>
              </tr>
            </thead>

            <tbody>
              ${(organizers || []).map(o => {
                let statusLabel = "Pendiente";
                let statusStyle = "background:#fef3c7;color:#92400e;";

                if (o.verification_status === "verified") {
                  statusLabel = "Aprobado";
                  statusStyle = "background:#dcfce7;color:#166534;";
                }

                if (o.verification_status === "rejected") {
                  statusLabel = "Rechazado";
                  statusStyle = "background:#fee2e2;color:#991b1b;";
                }

                return `
                  <tr>
                    <td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;">
                      ${o.full_name || "-"}
                    </td>

                    <td style="padding:12px;border-bottom:1px solid #eee;">
                      ${o.email || "-"}
                    </td>

                    <td style="padding:12px;border-bottom:1px solid #eee;">
                      ${o.phone || "-"}
                    </td>

                    <td style="padding:12px;border-bottom:1px solid #eee;">
                      ${o.document_number || "-"}
                    </td>

                    <td style="padding:12px;border-bottom:1px solid #eee;">
  ${o.payout_method || "-"}
</td>

<td style="padding:12px;border-bottom:1px solid #eee;">
  <div style="display:flex;flex-direction:column;gap:6px;min-width:140px;">
    ${
      o.id_front_url
        ? `<a href="${o.id_front_url}" target="_blank" style="color:#2563eb;font-weight:bold;">Cédula frente</a>`
        : `<span style="color:#9ca3af;">Sin cédula frente</span>`
    }

    ${
      o.id_back_url
        ? `<a href="${o.id_back_url}" target="_blank" style="color:#2563eb;font-weight:bold;">Cédula reverso</a>`
        : `<span style="color:#9ca3af;">Sin cédula reverso</span>`
    }

    ${
      o.selfie_id_url
        ? `<a href="${o.selfie_id_url}" target="_blank" style="color:#2563eb;font-weight:bold;">Selfie</a>`
        : `<span style="color:#9ca3af;">Sin selfie</span>`
    }

    ${
      o.prize_proof_url
        ? `<a href="${o.prize_proof_url}" target="_blank" style="color:#2563eb;font-weight:bold;">Soporte premio</a>`
        : `<span style="color:#9ca3af;">Sin soporte premio</span>`
    }
  </div>
</td>

<td style="padding:12px;border-bottom:1px solid #eee;">
  <span style="display:inline-block;padding:7px 11px;border-radius:999px;font-weight:bold;font-size:12px;${statusStyle}">
    ${statusLabel}
  </span>
</td>

                    <td style="padding:12px;border-bottom:1px solid #eee;">
  <div style="display:flex;flex-direction:column;gap:8px;min-width:150px;">

    ${
      o.verification_status !== "verified"
        ? `
          <form method="POST" action="/admin/organizadores/${o.id}/aprobar">
            <button
              type="submit"
              style="width:100%;padding:9px;background:#16a34a;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
              Aprobar
            </button>
          </form>
        `
        : ""
    }

    ${
      o.verification_status !== "rejected"
        ? `
          <form method="POST" action="/admin/organizadores/${o.id}/rechazar">
  <textarea
    name="rejection_reason"
    placeholder="Motivo del rechazo"
    required
    style="width:100%;min-height:70px;padding:9px;border:1px solid #fecaca;border-radius:10px;font-family:Arial;font-size:13px;margin-bottom:6px;"
  ></textarea>

  <button
    type="submit"
    style="width:100%;padding:9px;background:#dc2626;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
    Rechazar
  </button>
</form>
        `
        : ""
    }

  </div>
</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>

        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/admin/organizadores/:organizerId/aprobar", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const { organizerId } = req.params;

    const { data: organizer, error: organizerError } = await supabase
      .from("organizers")
      .select("*")
      .eq("id", organizerId)
      .single();

    if (organizerError) throw organizerError;

    if (!organizer) {
      return res.status(404).send("Organizador no encontrado");
    }

    const missingSupports = [];

    if (!organizer.document_number) missingSupports.push("Número de cédula");
    if (!organizer.id_front_url) missingSupports.push("Cédula frente");
    if (!organizer.id_back_url) missingSupports.push("Cédula reverso");
    if (!organizer.selfie_id_url) missingSupports.push("Selfie con cédula");
    
    if (missingSupports.length > 0) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1"/>
          <title>No se puede aprobar</title>
        </head>
        <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
          <div style="max-width:700px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
            <h1>No se puede aprobar este organizador</h1>

            <p>
              Faltan los siguientes soportes obligatorios:
            </p>

            <div style="display:inline-block;text-align:left;line-height:1.8;color:#991b1b;font-weight:bold;">
              ${missingSupports.map(item => `<div>• ${item}</div>`).join("")}
            </div>

            <br/>

            <a
              href="/admin/organizadores"
              style="display:inline-block;margin-top:22px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
              Volver a organizadores
            </a>
          </div>
        </body>
        </html>
      `);
    }

    const { error } = await supabase
      .from("organizers")
      .update({
        verification_status: "verified"
      })
      .eq("id", organizerId);

    if (error) throw error;

   await sendWhatsAppMessage(
  organizer.phone,
  [
    `Hola ${organizer.full_name || ""}.`,
    ``,
    `Tu cuenta de organizador en CampaClick fue aprobada correctamente.`,
    ``,
    `Ya puedes ingresar al panel y crear campañas para revisión del administrador.`,
    ``,
    `Ingreso organizador:`,
    `${APP_BASE_URL}/organizers/login`
  ].join("\n")
);

    return res.redirect("/admin/organizadores");
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/admin/organizadores/:organizerId/rechazar", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const { organizerId } = req.params;

    const rejectionReason = String(req.body.rejection_reason || "").trim();

if (!rejectionReason) {
  return res.status(400).send("Debes escribir el motivo del rechazo.");
}

    const { data: organizer, error: organizerLookupError } = await supabase
      .from("organizers")
      .select("*")
      .eq("id", organizerId)
      .single();

    if (organizerLookupError) throw organizerLookupError;

    if (!organizer) {
      return res.status(404).send("Organizador no encontrado");
    }

    const { error } = await supabase
      .from("organizers")
      .update({
  verification_status: "rejected",
  rejection_reason: rejectionReason
})
      .eq("id", organizerId);

    if (error) throw error;

   await sendWhatsAppMessage(
  organizer.phone,
  [
    `Hola ${organizer.full_name || ""}.`,
    ``,
    `Tu verificación como organizador en CampaClick fue rechazada.`,
    ``,
    `Motivo del rechazo:`,
    `${rejectionReason}`,
    ``,
    `Por favor ingresa nuevamente al panel, revisa la información y vuelve a enviar tus soportes de identidad.`,
    ``,
    `Ingreso organizador:`,
    `${APP_BASE_URL}/organizers/login`
  ].join("\n")
);

    return res.redirect("/admin/organizadores");
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/admin/resultados", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const { data: campaigns, error } = await supabase
      .from("rifas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const campaignIds = (campaigns || []).map(c => c.id);

let adminOrders = [];
let adminPayments = [];

if (campaignIds.length > 0) {
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .in("rifa_id", campaignIds);

  if (ordersError) throw ordersError;

  adminOrders = ordersData || [];

  const orderIds = adminOrders.map(o => o.id);

  if (orderIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .in("order_id", orderIds);

    if (paymentsError) throw paymentsError;

    adminPayments = paymentsData || [];
  }
}

const adminFinancialSummary = calculateFinancialSummary(adminPayments);

    const { data: adminOrganizers, error: adminOrganizersError } = await supabase
  .from("organizers")
  .select("*");

if (adminOrganizersError) throw adminOrganizersError;

const adminCampaignRows = (campaigns || []).map(c => {
  const campaignOrders = adminOrders.filter(o => String(o.rifa_id) === String(c.id));
  const campaignOrderIds = campaignOrders.map(o => String(o.id));
  const campaignPayments = adminPayments.filter(p => campaignOrderIds.includes(String(p.order_id)));
  const campaignFinancial = calculateCampaignFinancialSummary(c, campaignOrders, campaignPayments);

 const organizer = (adminOrganizers || []).find(o => String(o.profile_id) === String(c.owner_id));

  const payoutAllowed = canPayOrganizer(c);

  let controlHtml = "";

  if (c.status !== "finished") {
    controlHtml = `
      <div style="padding:9px;background:#fef3c7;color:#92400e;border-radius:10px;font-weight:bold;text-align:center;">
        Campaña no finalizada
      </div>
    `;
  } else if (c.winner_ticket_id && c.prize_delivery_status !== "delivered") {
    controlHtml = `
      <form method="POST" action="/admin/campanas/${c.id}/premio-entregado">
        <textarea
          name="prize_delivery_notes"
          placeholder="Soporte o nota de entrega del premio"
          required
          style="width:100%;min-height:70px;padding:9px;border:1px solid #bbf7d0;border-radius:10px;font-family:Arial;font-size:13px;margin-bottom:6px;"
        ></textarea>

        <button
          type="submit"
          style="width:100%;padding:9px;background:#16a34a;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
          Marcar premio entregado
        </button>
      </form>

      <div style="margin-top:6px;padding:8px;background:#fff7ed;color:#9a3412;border-radius:10px;font-size:12px;text-align:center;">
        El giro al organizador queda bloqueado hasta entregar el premio.
      </div>
    `;
  } else if (c.payout_status === "paid") {
    controlHtml = `
      <div style="padding:9px;background:#dcfce7;color:#166534;border-radius:10px;font-weight:bold;text-align:center;">
        Giro realizado
      </div>

      <div style="margin-top:6px;font-size:12px;color:#374151;">
        Ref: ${c.payout_reference || "-"}
      </div>
    `;
  } else if (payoutAllowed) {
    controlHtml = `
      <form method="POST" action="/admin/campanas/${c.id}/giro-organizador">
        <input
          type="text"
          name="payout_reference"
          placeholder="Referencia del giro"
          required
          style="width:100%;padding:9px;border:1px solid #ccc;border-radius:10px;margin-bottom:6px;"
        />

        <textarea
          name="payout_notes"
          placeholder="Notas del pago al organizador"
          style="width:100%;min-height:60px;padding:9px;border:1px solid #ccc;border-radius:10px;font-family:Arial;font-size:13px;margin-bottom:6px;"
        ></textarea>

        <button
          type="submit"
          style="width:100%;padding:9px;background:#2563eb;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
          Registrar giro al organizador
        </button>
      </form>
    `;
  }

  return `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;">
        ${c.title || "-"}
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;">
        <div><b>${organizer?.full_name || "-"}</b></div>
        <div style="font-size:12px;color:#6b7280;">${organizer?.email || "-"}</div>
        <div style="font-size:12px;color:#6b7280;">${organizer?.phone || "-"}</div>
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;">
        ${c.prize || "-"}
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">
          ${prizeTypeLabel(c.prize_type)}
        </div>
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;">
        ${getDrawProviderLabel(c.draw_provider)}<br/>
        <span style="font-size:12px;color:#6b7280;">${getDrawModeLabel(c.draw_mode)}</span>
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;">
        ${c.draw_date || "-"}
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;">
        ${c.result_value || "Pendiente"}
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;min-width:260px;">
        <div style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;line-height:1.5;font-size:12px;color:#374151;">
          <div>Recaudo aprobado: <b>${moneyCOP(campaignFinancial.grossRevenue)}</b></div>
          <div>CampaClick 5%: <b>${moneyCOP(campaignFinancial.platformFee)}</b></div>
          <div>Wompi estimado: <b>${moneyCOP(campaignFinancial.gatewayFee)}</b></div>
          <div>Descuento premio: <b>${moneyCOP(campaignFinancial.prizeDeduction)}</b></div>

          <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;font-weight:bold;color:#065f46;">
            Neto a girar: ${moneyCOP(campaignFinancial.netToOrganizer)}
          </div>

          <div style="margin-top:8px;color:#6b7280;">
            Pagos aprobados: ${campaignFinancial.approvedPaymentsCount}
          </div>
        </div>
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;">
        <div>${campaignStatusLabel(c.status)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">
          Premio: ${prizeDeliveryStatusLabel(c.prize_delivery_status)}
        </div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">
          Giro: ${payoutStatusLabel(c.payout_status)}
        </div>
      </td>

      <td style="padding:12px;border-bottom:1px solid #eee;min-width:220px;">
        <div style="display:flex;flex-direction:column;gap:8px;">

          ${
            c.status === "pending"
              ? `
                <form method="POST" action="/admin/campanas/${c.id}/aprobar">
                  <button
                    type="submit"
                    style="width:100%;padding:9px;background:#16a34a;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
                    Aprobar
                  </button>
                </form>

                <form method="POST" action="/admin/campanas/${c.id}/cancelar">
                  <textarea
                    name="rejection_reason"
                    placeholder="Motivo del rechazo"
                    required
                    style="width:100%;min-height:70px;padding:9px;border:1px solid #fecaca;border-radius:10px;font-family:Arial;font-size:13px;margin-bottom:6px;"
                  ></textarea>

                  <button
                    type="submit"
                    style="width:100%;padding:9px;background:#dc2626;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer;">
                    Rechazar
                  </button>
                </form>
              `
              : ""
          }

          <a
            href="/campanas/${c.slug}"
            target="_blank"
            style="display:block;text-align:center;padding:9px;background:#111827;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">
            Ver campaña
          </a>

          ${
            c.status === "active" && new Date(`${c.draw_date}T00:00:00`) <= new Date()
              ? `
                <a
                  href="/admin/campanas/${c.id}/resultado"
                  style="display:block;text-align:center;padding:9px;background:#2563eb;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">
                  Cargar resultado
                </a>
              `
              : c.status === "active"
                ? `
                  <div style="padding:9px;background:#fef3c7;color:#92400e;border-radius:10px;font-weight:bold;text-align:center;">
                    Esperando fecha sorteo
                  </div>
                `
                : ""
          }

          ${controlHtml}

        </div>
      </td>
    </tr>
  `;
}).join("");

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Resultados Admin</title>
      </head>

      <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
        <div style="max-width:1300px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);overflow-x:auto;">
          
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
  <h1>Administrador de campañas</h1>

  <div style="display:flex;gap:10px;flex-wrap:wrap;">
    <a
      href="/admin/organizadores"
      style="background:#2563eb;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;"
    >
      Organizadores
    </a>

    <a
      href="/admin/resultados-pendientes"
      style="background:#16a34a;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;"
    >
      Resultados pendientes
    </a>

    <a
      href="/admin/resultados/masivo"
      style="background:#7c3aed;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;"
    >
      Cargar resultado masivo
    </a>

   <a
      href="/admin/logout"
      style="background:#111827;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;"
    >
      Cerrar sesión
    </a>
  </div>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:22px 0;">
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:16px;">
    <div style="color:#1e3a8a;font-weight:bold;">Recaudo bruto aprobado</div>
    <div style="font-size:26px;font-weight:900;margin-top:8px;">
      ${moneyCOP(adminFinancialSummary.grossRevenue)}
    </div>
  </div>

  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:16px;">
    <div style="color:#166534;font-weight:bold;">Comisión CampaClick 5%</div>
    <div style="font-size:26px;font-weight:900;margin-top:8px;">
      ${moneyCOP(adminFinancialSummary.platformFee)}
    </div>
  </div>

  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:16px;">
    <div style="color:#9a3412;font-weight:bold;">Wompi estimado</div>
    <div style="font-size:26px;font-weight:900;margin-top:8px;">
      ${moneyCOP(adminFinancialSummary.wompiEstimatedFee)}
    </div>
  </div>

  <div style="background:#ecfdf5;border:1px solid #86efac;border-radius:14px;padding:16px;">
    <div style="color:#065f46;font-weight:bold;">Neto aproximado a girar</div>
    <div style="font-size:26px;font-weight:900;margin-top:8px;">
      ${moneyCOP(adminFinancialSummary.estimatedNetToOrganizer)}
    </div>
  </div>
</div>

          <table style="width:100%;min-width:1100px;border-collapse:collapse;">
            <thead>
              <tr style="background:#eff6ff;">
                <th style="padding:12px;text-align:left;">Campaña</th>
<th style="padding:12px;text-align:left;">Organizador</th>
<th style="padding:12px;text-align:left;">Premio</th>
<th style="padding:12px;text-align:left;">Sorteo / Modalidad</th>
<th style="padding:12px;text-align:left;">Fecha sorteo</th>
<th style="padding:12px;text-align:left;">Resultado</th>
<th style="padding:12px;text-align:left;">Liquidación</th>
<th style="padding:12px;text-align:left;">Estado</th>
<th style="padding:12px;text-align:left;">Acción</th>
              </tr>
            </thead>

            <tbody>

       ${adminCampaignRows || `
  <tr>
    <td colspan="9" style="padding:18px;text-align:center;color:#6b7280;">
      No hay campañas creadas.
    </td>
  </tr>
`}
           
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/admin/resultados-pendientes", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayText = today.toISOString().slice(0, 10);

    const { data: campaigns, error } = await supabase
      .from("rifas")
      .select("*")
      .eq("status", "active")
      .is("result_value", null)
      .lte("draw_date", todayText)
      .order("draw_date", { ascending: true });

    if (error) throw error;

    const grouped = {};

    for (const c of campaigns || []) {
      const key = `${getDrawProviderLabel(c.draw_provider)} - ${c.draw_date}`;

      if (!grouped[key]) {
        grouped[key] = [];
      }

      grouped[key].push(c);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Resultados pendientes</title>
      </head>

      <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
        <div style="max-width:1300px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);">

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
            <div>
              <h1 style="margin:0;">Resultados pendientes</h1>
              <p style="margin:8px 0 0;color:#6b7280;">
                Campañas activas cuya fecha de sorteo ya llegó y aún no tienen resultado cargado.
              </p>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <a href="/admin/resultados/masivo" style="background:#7c3aed;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;">
                Cargar resultado masivo
              </a>

              <a href="/admin/resultados" style="background:#111827;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;">
                Volver a campañas
              </a>
            </div>
          </div>

          ${
            campaigns && campaigns.length > 0
              ? Object.keys(grouped).map(groupName => `
                <div style="margin-top:24px;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
                  <div style="background:#eff6ff;padding:14px 16px;color:#1e3a8a;font-weight:bold;">
                    ${groupName}
                  </div>

                  <table style="width:100%;border-collapse:collapse;">
                    <thead>
                      <tr style="background:#f9fafb;">
                        <th style="padding:12px;text-align:left;">Campaña</th>
                        <th style="padding:12px;text-align:left;">Premio</th>
                        <th style="padding:12px;text-align:left;">Modalidad</th>
                        <th style="padding:12px;text-align:left;">Vendidos</th>
                        <th style="padding:12px;text-align:left;">Acción</th>
                      </tr>
                    </thead>

                    <tbody>
                      ${grouped[groupName].map(c => `
                        <tr>
                          <td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;">
                            ${c.title || "-"}
                          </td>

                          <td style="padding:12px;border-bottom:1px solid #eee;">
                            ${c.prize || "-"}
                          </td>

                          <td style="padding:12px;border-bottom:1px solid #eee;">
                            ${getDrawModeLabel(c.draw_mode)}
                          </td>

                          <td style="padding:12px;border-bottom:1px solid #eee;">
                            ${Number(c.sold_tickets || 0)} / ${Number(c.max_tickets || 0)}
                          </td>

                          <td style="padding:12px;border-bottom:1px solid #eee;">
                            <a
                              href="/admin/campanas/${c.id}/resultado"
                              style="display:inline-block;padding:9px 12px;background:#2563eb;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">
                              Cargar individual
                            </a>
                          </td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>
              `).join("")
              : `
                <div style="padding:20px;background:#ecfdf5;border:1px solid #86efac;border-radius:14px;color:#166534;font-weight:bold;text-align:center;">
                  No hay resultados pendientes por cargar.
                </div>
              `
          }

        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/admin/resultados/masivo", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Cargar resultado masivo</title>
      </head>

      <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
        <div style="max-width:720px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
          <h1>Cargar resultado masivo</h1>

          <div style="margin-bottom:18px;padding:14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;color:#1e3a8a;line-height:1.5;">
            Esta opción carga el resultado a todas las campañas activas del mismo sorteo y fecha que aún no tengan resultado.
          </div>

          <form method="POST" action="/admin/resultados/masivo">

            <div style="margin-bottom:14px;">
              <label>Sorteo</label><br/>
              <select
                name="draw_provider"
                required
                style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;">
                ${generateProviderOptions()}
              </select>
            </div>

            <div style="margin-bottom:14px;">
              <label>Fecha del sorteo</label><br/>
              <input
                type="date"
                name="draw_date"
                required
                style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;">
            </div>

            <div style="margin-bottom:14px;">
              <label>Resultado oficial completo</label><br/>
              <input
                type="text"
                name="result_value"
                required
                placeholder="Baloto: 0814303541 / Lotería: 5839"
                style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;">
            </div>

            <div style="margin-bottom:18px;padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;color:#9a3412;line-height:1.5;">
              <b>Importante:</b><br/>
              Para Baloto escribe las 5 balotas completas en 10 dígitos. Ejemplo: 0814303541.<br/>
              Para loterías escribe el número completo de 4 cifras. Ejemplo: 5839.
            </div>

            <button
              type="submit"
              style="width:100%;padding:15px;background:#7c3aed;color:white;border:none;border-radius:12px;font-weight:bold;cursor:pointer;">
              Cargar resultado masivo
            </button>
          </form>

          <div style="margin-top:18px;">
            <a href="/admin/resultados-pendientes" style="color:#2563eb;font-weight:bold;">
              Ver resultados pendientes
            </a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/admin/resultados/masivo", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const drawProvider = String(req.body.draw_provider || "").trim();
    const drawDate = String(req.body.draw_date || "").trim();
    const rawResultValue = String(req.body.result_value || "").trim();

    if (!drawProvider || !drawDate || !rawResultValue) {
      return res.status(400).send("Faltan datos para cargar el resultado masivo.");
    }

    const { data: campaigns, error: campaignsError } = await supabase
      .from("rifas")
      .select("*")
      .eq("draw_provider", drawProvider)
      .eq("draw_date", drawDate)
      .eq("status", "active")
      .is("result_value", null);

    if (campaignsError) throw campaignsError;

    if (!campaigns || campaigns.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1"/>
          <title>Sin campañas</title>
        </head>
        <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
          <div style="max-width:650px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
            <h1>No hay campañas para actualizar</h1>
            <p>No encontramos campañas activas, sin resultado, para ese sorteo y esa fecha.</p>

            <a
              href="/admin/resultados/masivo"
              style="display:inline-block;margin-top:18px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
              Volver
            </a>
          </div>
        </body>
        </html>
      `);
    }

    const processed = [];

    for (const campaign of campaigns) {
      const resultValue = normalizeBulkResultForCampaign(
        campaign.draw_mode,
        rawResultValue
      );

      const { data: winnerTicket, error: ticketError } = await supabase
        .from("tickets")
        .select("*")
        .eq("rifa_id", campaign.id)
        .eq("combination", resultValue)
        .maybeSingle();

      if (ticketError) throw ticketError;

      const winnerTicketId = winnerTicket?.id || null;

      const { error: updateError } = await supabase
        .from("rifas")
        .update({
          result_value: resultValue,
          winner_ticket_id: winnerTicketId,
          status: "finished"
        })
        .eq("id", campaign.id)
        .eq("status", "active")
        .is("result_value", null);

      if (updateError) throw updateError;

      if (winnerTicketId) {
        await sendWinnerWhatsApp(campaign.id, winnerTicketId);
      }

      processed.push({
        title: campaign.title,
        mode: getDrawModeLabel(campaign.draw_mode),
        resultValue,
        winner: Boolean(winnerTicketId)
      });
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Resultado masivo cargado</title>
      </head>

      <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
        <div style="max-width:900px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
          <h1>Resultado masivo cargado</h1>

          <div style="margin-bottom:18px;padding:14px;background:#ecfdf5;border:1px solid #86efac;border-radius:12px;color:#166534;font-weight:bold;">
            Se procesaron ${processed.length} campañas de ${getDrawProviderLabel(drawProvider)} con fecha ${drawDate}.
          </div>

          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#eff6ff;">
                <th style="padding:12px;text-align:left;">Campaña</th>
                <th style="padding:12px;text-align:left;">Modalidad</th>
                <th style="padding:12px;text-align:left;">Resultado aplicado</th>
                <th style="padding:12px;text-align:left;">Ganador</th>
              </tr>
            </thead>

            <tbody>
              ${processed.map(item => `
                <tr>
                  <td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;">
                    ${item.title}
                  </td>

                  <td style="padding:12px;border-bottom:1px solid #eee;">
                    ${item.mode}
                  </td>

                  <td style="padding:12px;border-bottom:1px solid #eee;">
                    ${item.resultValue}
                  </td>

                  <td style="padding:12px;border-bottom:1px solid #eee;">
                    ${
                      item.winner
                        ? `<span style="background:#dcfce7;color:#166534;padding:7px 10px;border-radius:999px;font-weight:bold;">Sí</span>`
                        : `<span style="background:#fee2e2;color:#991b1b;padding:7px 10px;border-radius:999px;font-weight:bold;">No</span>`
                    }
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div style="margin-top:22px;display:flex;gap:10px;flex-wrap:wrap;">
            <a
              href="/admin/resultados-pendientes"
              style="display:inline-block;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
              Ver pendientes
            </a>

            <a
              href="/admin/resultados"
              style="display:inline-block;padding:14px 18px;background:#111827;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
              Volver al admin
            </a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});



app.post("/admin/campanas/:rifaId/aprobar", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const { rifaId } = req.params;

    const { data: campaign, error: campaignError } = await supabase
      .from("rifas")
      .select(`
        *,
        profiles(*)
      `)
      .eq("id", rifaId)
      .single();

    if (campaignError) throw campaignError;

    if (!campaign) {
      return res.status(404).send("Campaña no encontrada");
    }

    const { error } = await supabase
      .from("rifas")
      .update({
        status: "active"
      })
      .eq("id", rifaId)
      .eq("status", "pending");

    if (error) throw error;

    const { data: organizer } = await supabase
      .from("organizers")
      .select("*")
      .eq("profile_id", campaign.owner_id)
      .maybeSingle();

    if (organizer?.phone) {
      await sendWhatsAppMessage(
  organizer.phone,
  [
    `Hola ${organizer.full_name || ""}.`,
    ``,
    `Tu campaña fue aprobada en CampaClick.`,
    ``,
    `Campaña: ${campaign.title || "-"}`,
    `Premio: ${campaign.prize || "-"}`,
    ``,
    `Ya puedes compartirla y recibir participantes.`,
    ``,
    `Link de la campaña:`,
    `${APP_BASE_URL}/campanas/${campaign.slug}`
  ].join("\n")
);
    }

    return res.redirect("/admin/resultados");
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/admin/campanas/:rifaId/cancelar", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const { rifaId } = req.params;

    const rejectionReason = String(req.body.rejection_reason || "").trim();

if (!rejectionReason) {
  return res.status(400).send("Debes escribir el motivo del rechazo.");
}

    const { data: campaign, error: campaignError } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();

    if (campaignError) throw campaignError;

    if (!campaign) {
      return res.status(404).send("Campaña no encontrada");
    }

    const { error } = await supabase
      .from("rifas")
      .update({
  status: "cancelled",
  rejection_reason: rejectionReason
})
      .eq("id", rifaId)
      .eq("status", "pending");

    if (error) throw error;

    const { data: organizer } = await supabase
      .from("organizers")
      .select("*")
      .eq("profile_id", campaign.owner_id)
      .maybeSingle();

    if (organizer?.phone) {
      await sendWhatsAppMessage(
  organizer.phone,
  [
    `Hola ${organizer.full_name || ""}.`,
    ``,
    `Tu campaña fue rechazada en CampaClick.`,
    ``,
    `Campaña: ${campaign.title || "-"}`,
    `Premio: ${campaign.prize || "-"}`,
    ``,
    `Motivo del rechazo:`,
    `${rejectionReason}`,
    ``,
    `Por favor revisa la información de la campaña antes de volver a crearla o solicitar una nueva revisión.`,
    ``,
    `Ingreso organizador:`,
    `${APP_BASE_URL}/organizers/login`
  ].join("\n")
);
    }

    return res.redirect("/admin/resultados");
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

async function sendWinnerWhatsApp(rifaId, winnerTicketId) {
  try {
    if (!winnerTicketId) {
      console.log("No hay ganador para enviar WhatsApp");
      return {
        ok: false,
        skipped: true,
        reason: "Sin ganador"
      };
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        *,
        buyers(*),
        rifas(*)
      `)
      .eq("id", winnerTicketId)
      .single();

    if (ticketError) throw ticketError;

    if (!ticket) {
      return {
        ok: false,
        reason: "Ticket ganador no encontrado"
      };
    }

    const baseUrl = APP_BASE_URL;

const message = [
  `🎉 ¡Felicitaciones ${ticket.buyers?.full_name || ""}!`,
  ``,
  `Tu código promocional resultó ganador en CampaClick.`,
  ``,
  `Campaña: ${ticket.rifas?.title || "-"}`,
  `Premio: ${ticket.rifas?.prize || "-"}`,
  `Código ganador: ${ticket.combination || ticket.ticket_code || "-"}`,
  ``,
  `Consulta el resultado aquí:`,
  `${baseUrl}/resultado/${rifaId}`,
  ``,
  `Pronto el organizador o el equipo de validación se comunicará contigo para continuar el proceso de entrega del premio.`
].join("\n");

    return await sendWhatsAppMessage(ticket.buyers?.phone, message);
  } catch (error) {
    console.error("Error enviando WhatsApp al ganador:", error);
    return {
      ok: false,
      reason: error.message
    };
  }
}

app.get("/admin/campanas/:rifaId/resultado", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const { rifaId } = req.params;

    const { data: rifa, error } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();

    if (error || !rifa) {
      return res.status(404).send("Campaña no encontrada");
    }

    if (rifa.status === "finished" || rifa.result_value) {
  return res.status(403).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Resultado cerrado</title>
    </head>
    <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
      <div style="max-width:650px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
        <h1>Resultado cerrado</h1>
        <p>
          Esta campaña ya tiene un resultado cargado y no puede ser modificado.
        </p>

        <div style="margin-top:14px;padding:16px;background:#eff6ff;border-radius:12px;color:#1e3a8a;font-weight:bold;">
          Resultado registrado: ${rifa.result_value}
        </div>

        <a
          href="/resultado/${rifa.id}"
          style="display:inline-block;margin-top:20px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
          Ver resultado
        </a>

        <a
          href="/admin/resultados"
          style="display:inline-block;margin-top:20px;margin-left:8px;padding:14px 18px;background:#111827;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
          Volver al admin
        </a>
      </div>
    </body>
    </html>
  `);
}

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Cargar resultado</title>
      </head>

      <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
        <div style="max-width:650px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
          <h1>Cargar resultado</h1>

          <p><b>Campaña:</b> ${rifa.title}</p>
          <p><b>Sorteo:</b> ${getDrawProviderLabel(rifa.draw_provider)}</p>
          <p><b>Modalidad:</b> ${getDrawModeLabel(rifa.draw_mode)}</p>

          <form method="POST" action="/admin/campanas/${rifa.id}/resultado">
            <label>Resultado ganador</label><br/>

            <input
  type="text"
  name="result_value"
  required
  placeholder="${getResultPlaceholder(rifa.draw_mode)}"
  value="${rifa.result_value || ""}"
  style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;margin:8px 0 8px;"
/>

<div style="margin-bottom:18px;color:#6b7280;font-size:13px;line-height:1.4;">
  ${getResultPlaceholder(rifa.draw_mode)}
</div>

            <button
              type="submit"
              style="width:100%;padding:15px;background:#2563eb;color:white;border:none;border-radius:12px;font-weight:bold;">
              Guardar resultado
            </button>
          </form>

          <div style="margin-top:18px;">
            <a href="/admin/resultados">Volver</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/admin/campanas/:rifaId/resultado", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const { rifaId } = req.params;
    const rawResultValue = String(req.body.result_value || "").trim();

    if (!rawResultValue) {
  return res.status(400).send("Falta el resultado");
}

    const { data: currentRifa, error: currentRifaError } = await supabase
  .from("rifas")
  .select("*")
  .eq("id", rifaId)
  .single();

if (currentRifaError) throw currentRifaError;

if (!currentRifa) {
  return res.status(404).send("Campaña no encontrada");
}

if (currentRifa.status === "finished" || currentRifa.result_value) {
  return res.status(403).send("El resultado de esta campaña ya fue cargado y no puede modificarse.");
}

    const resultValue = normalizeResultValue(
  currentRifa.draw_mode,
  rawResultValue
);

const { data: winnerTicket, error: ticketError } = await supabase
  .from("tickets")
  .select("*")
  .eq("rifa_id", rifaId)
  .eq("combination", resultValue)
  .maybeSingle();

    if (ticketError) throw ticketError;

const winnerTicketId = winnerTicket?.id || null;

const { error: updateError } = await supabase
  .from("rifas")
  .update({
    result_value: resultValue,
    winner_ticket_id: winnerTicketId,
    status: "finished"
  })
  .eq("id", rifaId);

if (updateError) throw updateError;

if (winnerTicketId) {
  await sendWinnerWhatsApp(rifaId, winnerTicketId);
}

return res.redirect(`/resultado/${rifaId}`);
    
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/terminos-organizadores", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Términos para Organizadores - CampaClick</title>
    </head>

    <body style="font-family:Arial;background:#f3f6fb;padding:40px;color:#111827;">
      <div style="max-width:900px;margin:auto;background:white;padding:32px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);line-height:1.6;">
        <h1>Términos y condiciones para organizadores</h1>

        <p>
          Estos términos regulan el uso de CampaClick por parte de los organizadores que crean campañas promocionales dentro de la plataforma.
        </p>

        <h2>1. Naturaleza de la plataforma</h2>
        <p>
          CampaClick es una plataforma tecnológica que permite crear, administrar y consultar campañas promocionales digitales, con asignación automática de códigos promocionales después del pago aprobado.
        </p>

        <h2>2. Comisión de la plataforma CampaClick</h2>
        <p>
          El organizador acepta que CampaClick cobra una comisión por el uso de la plataforma equivalente al <b>5% del valor total de las ventas efectivamente aprobadas</b> dentro de cada campaña.
        </p>

        <p>
          Esta comisión corresponde al uso de la infraestructura tecnológica, administración de campañas, consulta de códigos, panel de organizador, gestión de resultados, notificaciones y demás funcionalidades ofrecidas por la plataforma.
        </p>

        <h2>3. Comisión de la pasarela de pago Wompi</h2>
        <p>
          El organizador declara conocer y aceptar que los pagos realizados por los participantes son procesados a través de Wompi u otra pasarela de pagos habilitada.
        </p>

        <p>
          Wompi cobra sus propias tarifas por cada transacción exitosa. De acuerdo con la información comercial visualizada, dicha tarifa puede corresponder aproximadamente a <b>2.65% + $700 + IVA por transacción exitosa</b>.
        </p>

        <p>
          Esta comisión no es cobrada por CampaClick, sino directamente por la pasarela de pagos encargada del procesamiento de la transacción.
        </p>

        <h2>4. Valor neto a recibir por el organizador</h2>
        <p>
          El organizador entiende y acepta que el valor neto a recibir podrá ser inferior al valor total vendido, debido a:
        </p>

        <ul>
          <li>Comisión de CampaClick del 5%.</li>
          <li>Comisiones, valores fijos e IVA cobrados por Wompi.</li>
          <li>Retenciones, descuentos, reversos o contracargos aplicados por bancos, franquicias, entidades financieras o pasarelas de pago.</li>
        </ul>

        <h2>5. Ejemplo ilustrativo</h2>
        <p>
          Si una campaña vende $100.000, CampaClick podrá descontar el 5%, equivalente a $5.000. Adicionalmente, Wompi podrá descontar sus costos por procesamiento, como el porcentaje, valor fijo e impuestos aplicables.
        </p>

        <p>
          Este ejemplo es únicamente ilustrativo. El valor final puede variar según la tarifa vigente de la pasarela, impuestos, retenciones o condiciones comerciales aplicables.
        </p>

        <h2>6. Aceptación expresa</h2>
        <p>
          Al registrarse como organizador, completar su verificación o crear una campaña, el organizador manifiesta que ha leído, entendido y aceptado estos términos, incluyendo la comisión de CampaClick y los costos de procesamiento de Wompi.
        </p>

        <h2>7. Cambios en tarifas</h2>
        <p>
          CampaClick podrá actualizar sus tarifas, comisiones o condiciones de uso. Las nuevas condiciones serán informadas o publicadas dentro de la plataforma.
        </p>

        <div style="margin-top:28px;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;color:#1e3a8a;">
          <b>Resumen:</b><br/>
          Comisión CampaClick: <b>5%</b><br/>
          Comisión Wompi aproximada: <b>2.65% + $700 + IVA por transacción exitosa</b>
        </div>

        <div style="margin-top:24px;">
          <a href="/" style="display:inline-block;padding:13px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
            Volver al inicio
          </a>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.post("/admin/campanas/:rifaId/premio-entregado", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const { rifaId } = req.params;
    const notes = String(req.body.prize_delivery_notes || "").trim();

    if (!notes) {
      return res.status(400).send("Debes registrar una nota o soporte de entrega del premio.");
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();

    if (campaignError) throw campaignError;

    if (!campaign) {
      return res.status(404).send("Campaña no encontrada");
    }

    if (campaign.status !== "finished") {
      return res.status(400).send("Solo puedes marcar entrega de premio cuando la campaña ya está finalizada.");
    }

    if (!campaign.winner_ticket_id) {
      return res.status(400).send("Esta campaña no tiene ganador registrado. No requiere entrega de premio.");
    }

    const { error } = await supabase
      .from("rifas")
      .update({
        prize_delivery_status: "delivered",
        prize_delivered_at: new Date().toISOString(),
        prize_delivery_notes: notes
      })
      .eq("id", rifaId);

    if (error) throw error;

    return res.redirect("/admin/resultados");
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/admin/campanas/:rifaId/giro-organizador", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const { rifaId } = req.params;
    const payoutReference = String(req.body.payout_reference || "").trim();
    const payoutNotes = String(req.body.payout_notes || "").trim();

    if (!payoutReference) {
      return res.status(400).send("Debes registrar la referencia del giro.");
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();

    if (campaignError) throw campaignError;

    if (!campaign) {
      return res.status(404).send("Campaña no encontrada");
    }

    if (campaign.status !== "finished") {
      return res.status(400).send("No puedes girar al organizador si la campaña no está finalizada.");
    }

    if (campaign.payout_status === "paid") {
      return res.status(400).send("Esta campaña ya tiene giro registrado.");
    }

    if (campaign.winner_ticket_id && campaign.prize_delivery_status !== "delivered") {
      return res.status(400).send("No puedes girar al organizador hasta confirmar la entrega del premio al ganador.");
    }

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .eq("rifa_id", rifaId);

    if (ordersError) throw ordersError;

    const orderIds = (orders || []).map(o => o.id);

    let payments = [];

    if (orderIds.length > 0) {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("payments")
        .select("*")
        .in("order_id", orderIds);

      if (paymentsError) throw paymentsError;

      payments = paymentsData || [];
    }

    const financial = calculateCampaignFinancialSummary(campaign, orders || [], payments || []);

    if (financial.netToOrganizer < 0) {
      return res.status(400).send("La liquidación arroja valor negativo. Revisa la campaña antes de registrar giro.");
    }

    const { error } = await supabase
      .from("rifas")
      .update({
        payout_status: "paid",
        payout_paid_at: new Date().toISOString(),
        payout_reference: payoutReference,
        payout_notes: payoutNotes || null,
        gross_revenue_last: financial.grossRevenue,
        platform_fee_last: financial.platformFee,
        gateway_fee_last: financial.gatewayFee,
        prize_deduction_last: financial.prizeDeduction,
        net_to_organizer_last: financial.netToOrganizer
      })
      .eq("id", rifaId);

    if (error) throw error;

    const { data: organizer } = await supabase
      .from("organizers")
      .select("*")
      .eq("profile_id", campaign.owner_id)
      .maybeSingle();

    if (organizer?.phone) {
      await sendWhatsAppMessage(
        organizer.phone,
        [
          `Hola ${organizer.full_name || ""}.`,
          ``,
          `Se registró el giro de liquidación de tu campaña en CampaClick.`,
          ``,
          `Campaña: ${campaign.title || "-"}`,
          `Recaudo aprobado: ${moneyCOP(financial.grossRevenue)}`,
          `Comisión CampaClick: ${moneyCOP(financial.platformFee)}`,
          `Wompi estimado: ${moneyCOP(financial.gatewayFee)}`,
          `Descuento premio: ${moneyCOP(financial.prizeDeduction)}`,
          ``,
          `Neto girado: ${moneyCOP(financial.netToOrganizer)}`,
          `Referencia: ${payoutReference}`,
          ``,
          `Gracias por usar CampaClick.`
        ].join("\n")
      );
    }

    return res.redirect("/admin/resultados");
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

const WHATSAPP_VERIFY_TOKEN = String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim();

app.get("/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    console.log("Webhook WhatsApp verificado correctamente");
    return res.status(200).send(challenge);
  }

  console.log("Error verificando webhook WhatsApp");
  return res.sendStatus(403);
});

app.post("/webhooks/whatsapp", async (req, res) => {
  try {
    console.log("Webhook WhatsApp recibido:");
    console.log(JSON.stringify(req.body, null, 2));

    return res.sendStatus(200);
  } catch (error) {
    console.error("Error webhook WhatsApp:", error.message);
    return res.sendStatus(500);
  }
});

app.get("/admin/test-whatsapp", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Prueba WhatsApp</title>
      </head>

      <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
        <div style="max-width:600px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
          <h1>Prueba WhatsApp Cloud API</h1>

          <form method="POST" action="/admin/test-whatsapp">
            <div style="margin-bottom:14px;">
              <label>Teléfono</label><br/>
              <input
                type="text"
                name="phone"
                placeholder="Ej: 3238123392"
                required
                style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;"
              />
            </div>

            <div style="margin-bottom:14px;">
              <label>Mensaje</label><br/>
              <textarea
                name="message"
                required
                style="width:100%;min-height:150px;padding:14px;border:1px solid #ccc;border-radius:10px;"
              >Hola, este es un mensaje de prueba de PromoClaras.</textarea>
            </div>

            <button
              type="submit"
              style="width:100%;padding:15px;background:#2563eb;color:white;border:none;border-radius:12px;font-weight:bold;">
              Enviar prueba
            </button>
          </form>

          <div style="margin-top:18px;">
            <a href="/admin/resultados">Volver al admin</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/admin/test-whatsapp", async (req, res) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/login");
    }

    const phone = String(req.body.phone || "").trim();
    const message = String(req.body.message || "").trim();

    if (!phone || !message) {
      return res.status(400).send("Falta teléfono o mensaje.");
    }

    const result = await sendWhatsAppMessage(phone, message);

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Resultado prueba WhatsApp</title>
      </head>

      <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
        <div style="max-width:700px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
          <h1>Resultado de prueba WhatsApp</h1>

          <div style="padding:14px;background:${result.ok ? "#ecfdf5" : "#fee2e2"};border-radius:12px;color:${result.ok ? "#166534" : "#991b1b"};font-weight:bold;">
            ${result.ok ? "Mensaje enviado correctamente." : "No se pudo enviar el mensaje."}
          </div>

          <pre style="margin-top:18px;background:#111827;color:#e5e7eb;padding:16px;border-radius:12px;overflow:auto;">${JSON.stringify(result, null, 2)}</pre>

          <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
            <a href="/admin/test-whatsapp" style="padding:12px 16px;background:#2563eb;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">
              Hacer otra prueba
            </a>

            <a href="/admin/resultados" style="padding:12px 16px;background:#111827;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">
              Volver al admin
            </a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
