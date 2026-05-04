import "dotenv/config";
import express from "express";
import session from "express-session";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

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

const ULTRAMSG_INSTANCE_ID = String(process.env.ULTRAMSG_INSTANCE_ID || "").trim();
const ULTRAMSG_TOKEN = String(process.env.ULTRAMSG_TOKEN || "").trim();

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
  { value: "baloto_2", label: "2 balotas" },
  { value: "baloto_3", label: "3 balotas" },
  { value: "baloto_4", label: "4 balotas" },
  { value: "baloto_5", label: "5 balotas" }
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
  if (drawMode === "baloto_2") return "Ej: 0814 para 08-14";
  if (drawMode === "baloto_3") return "Ej: 081430 para 08-14-30";
  if (drawMode === "baloto_4") return "Ej: 08143041 para 08-14-30-41";
  if (drawMode === "baloto_5") return "Ej: 0814303541 para 08-14-30-35-41";

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
  if (drawMode === "baloto_2") return 903;
  if (drawMode === "baloto_3") return 12341;
  if (drawMode === "baloto_4") return 123410;
  if (drawMode === "baloto_5") return 962598;

  if (drawMode === "loteria_2_primeras") return 100;
  if (drawMode === "loteria_2_ultimas") return 100;
  if (drawMode === "loteria_3_primeras") return 1000;
  if (drawMode === "loteria_3_ultimas") return 1000;
  if (drawMode === "loteria_4_pleno") return 10000;

  return 0;
}


function normalizeResultValue(drawMode, rawValue) {
  const digits = String(rawValue || "").replace(/\D/g, "");

  if (drawMode === "baloto_2") {
    if (digits.length !== 4) {
      throw new Error("Para Baloto 2 balotas debes escribir 4 dígitos. Ejemplo: 0814");
    }

    const numbers = [
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 4))
    ];

    validateBalotoNumbers(numbers);

    return numbers
      .sort((a, b) => a - b)
      .map(n => String(n).padStart(2, "0"))
      .join("-");
  }

  if (drawMode === "baloto_3") {
    if (digits.length !== 6) {
      throw new Error("Para Baloto 3 balotas debes escribir 6 dígitos. Ejemplo: 081430");
    }

    const numbers = [
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 4)),
      Number(digits.slice(4, 6))
    ];

    validateBalotoNumbers(numbers);

    return numbers
      .sort((a, b) => a - b)
      .map(n => String(n).padStart(2, "0"))
      .join("-");
  }

  if (drawMode === "baloto_4") {
    if (digits.length !== 8) {
      throw new Error("Para Baloto 4 balotas debes escribir 8 dígitos. Ejemplo: 08143041");
    }

    const numbers = [
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 4)),
      Number(digits.slice(4, 6)),
      Number(digits.slice(6, 8))
    ];

    validateBalotoNumbers(numbers);

    return numbers
      .sort((a, b) => a - b)
      .map(n => String(n).padStart(2, "0"))
      .join("-");
  }

  if (drawMode === "baloto_5") {
    if (digits.length !== 10) {
      throw new Error("Para Baloto 5 balotas debes escribir 10 dígitos. Ejemplo: 0814303541");
    }

    const numbers = [
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 4)),
      Number(digits.slice(4, 6)),
      Number(digits.slice(6, 8)),
      Number(digits.slice(8, 10))
    ];

    validateBalotoNumbers(numbers);

    return numbers
      .sort((a, b) => a - b)
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

async function sendWhatsAppMessage(phone, message) {
  try {
    if (!ULTRAMSG_INSTANCE_ID || !ULTRAMSG_TOKEN) {
      console.log("UltraMsg no configurado");
      return {
        ok: false,
        reason: "UltraMsg no configurado"
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
      `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          token: ULTRAMSG_TOKEN,
          to: whatsappPhone,
          body: message
        })
      }
    );

    const resultText = await response.text();

    console.log("UltraMsg status:", response.status);
    console.log("UltraMsg response:", resultText);

    return {
      ok: response.ok,
      status: response.status,
      response: resultText
    };
  } catch (error) {
    console.error("Error enviando WhatsApp UltraMsg:", error);
    return {
      ok: false,
      reason: error.message
    };
  }
}

async function sendOrderCouponsWhatsApp(orderId) {
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

    if (order.whatsapp_sent) {
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

    const couponList = tickets
  .map(t => `• ${t.combination || t.ticket_code || "-"}`)
  .join("\n");

const couponLabel = tickets.length === 1
  ? "Código promocional asignado"
  : "Códigos promocionales asignados";

const message = [
  `Hola ${order.buyers?.full_name || ""}, tu pago fue aprobado en CampaClick.`,
  ``,
  `Campaña: ${order.rifas?.title || "-"}`,
  ``,
  `${couponLabel}:`,
  couponList,
  ``,
  `Cantidad total: ${tickets.length}`,
  ``,
  `Consulta tu orden aquí:`,
  `${baseUrl}/orden/${order.id}`,
  ``,
  `Gracias por participar.`
].join("\n");

    const result = await sendWhatsAppMessage(
      order.buyers?.phone,
      message
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

function campaignStatusLabel(status) {
  if (status === "active") return "Activa";
  if (status === "pending") return "Pendiente";
  if (status === "finished") return "Finalizada";
  if (status === "cancelled") return "Rechazada";
  return status || "-";
}

function campaignStatusClass(status) {
  if (status === "finished") return "approved";
  if (status === "active") return "approved";
  if (status === "pending") return "pending";
  return "pending";
}


function generateTicketCode(drawMode) {
  if (drawMode === "baloto_2") {
    return generateBalotoCombination(2);
  }

  if (drawMode === "baloto_3") {
    return generateBalotoCombination(3);
  }

  if (drawMode === "baloto_4") {
    return generateBalotoCombination(4);
  }

  if (drawMode === "baloto_5") {
    return generateBalotoCombination(5);
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

function generateBalotoCombination(quantity) {
  const numbers = [];

  while (numbers.length < quantity) {
    const n = randomInt(1, 43);

    if (!numbers.includes(n)) {
      numbers.push(n);
    }
  }

  numbers.sort((a, b) => a - b);

  return numbers.map(n => String(n).padStart(2, "0")).join("-");
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
          background:
            radial-gradient(circle at top left, rgba(37,99,235,.18), transparent 32%),
            linear-gradient(135deg, #eef4ff, #f8fafc);
          color: #111827;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .shell {
          width: 100%;
          max-width: 980px;
          background: rgba(255,255,255,.92);
          border: 1px solid #e5e7eb;
          border-radius: 28px;
          box-shadow: 0 24px 70px rgba(15,23,42,.14);
          overflow: hidden;
        }

        .hero {
          padding: 42px 34px 28px;
          text-align: center;
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          color: white;
        }

        .brand {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 72px;
          height: 72px;
          border-radius: 22px;
          background: rgba(255,255,255,.18);
          font-size: 34px;
          margin-bottom: 14px;
        }

        h1 {
          margin: 0;
          font-size: 44px;
          letter-spacing: .3px;
        }

        .subtitle {
          margin: 14px auto 0;
          max-width: 720px;
          font-size: 18px;
          line-height: 1.5;
          opacity: .94;
        }

        .content {
          padding: 30px 34px 34px;
        }

        .notice {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1e3a8a;
          padding: 16px;
          border-radius: 18px;
          line-height: 1.5;
          margin-bottom: 22px;
          text-align: center;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .action {
          display: block;
          padding: 22px 18px;
          border-radius: 18px;
          text-decoration: none;
          color: white;
          font-weight: 800;
          text-align: center;
          box-shadow: 0 10px 24px rgba(15,23,42,.12);
          transition: transform .15s ease, opacity .15s ease;
        }

        .action:hover {
          transform: translateY(-2px);
          opacity: .95;
        }

        .action span {
          display: block;
          font-size: 20px;
          margin-bottom: 6px;
        }

        .action small {
          display: block;
          font-size: 13px;
          font-weight: 500;
          opacity: .92;
          line-height: 1.4;
        }

        .blue {
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
        }

        .green {
          background: linear-gradient(135deg, #15803d, #16a34a);
        }

        .dark {
          background: linear-gradient(135deg, #020617, #111827);
        }

        .purple {
          background: linear-gradient(135deg, #5b21b6, #7c3aed);
        }

        .admin-wide {
  grid-column: 1 / -1;
  max-width: 520px;
  width: 100%;
  margin: 0 auto;
}

        .footer {
          margin-top: 24px;
          text-align: center;
          color: #6b7280;
          font-size: 13px;
          line-height: 1.5;
        }

        @media (max-width: 720px) {
          body {
            padding: 14px;
            align-items: flex-start;
          }

          .hero {
            padding: 34px 22px 24px;
          }

          h1 {
            font-size: 36px;
          }

          .subtitle {
            font-size: 16px;
          }

          .content {
            padding: 22px;
          }

          .grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>

    <body>
      <main class="shell">
        <section class="hero">
          <div class="brand">🎯</div>
          <h1>CampaClick</h1>
          <p class="subtitle">
            Plataforma para crear, administrar y consultar campañas promocionales con asignación automática de códigos después del pago aprobado.
          </p>
        </section>

        <section class="content">
          <div class="notice">
            Desde aquí puedes consultar tus códigos promocionales, ingresar como organizador, crear tu cuenta o acceder al panel administrador.
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
      <title>Registro organizador</title>
    </head>
    <body style="font-family: Arial, sans-serif; background:#f5f7fb; padding:40px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
        <h1>Crear cuenta de organizador</h1>

        <form method="POST" action="/organizers/register">
          <div style="margin-bottom:12px;">
            <label>Nombre completo</label><br/>
            <input type="text" name="full_name" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <div style="margin-bottom:12px;">
            <label>Correo</label><br/>
            <input type="email" name="email" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <div style="margin-bottom:12px;">
            <label>Teléfono</label><br/>
            <input type="text" name="phone" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <div style="margin-bottom:16px;">
            <label>Contraseña</label><br/>
            <input type="password" name="password" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <button type="submit" style="width:100%;padding:14px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-weight:700;">
            Crear cuenta
          </button>
        </form>

        <div style="margin-top:14px;">
          <a href="/organizers/login">Ya tengo cuenta</a>
        </div>
      </div>
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
      <title>Ingreso organizador</title>
    </head>
    <body style="font-family: Arial, sans-serif; background:#f5f7fb; padding:40px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
        <h1>Ingreso organizador</h1>

        ${registered ? `
          <div style="margin-bottom:14px;padding:12px;background:#ecfdf5;border:1px solid #86efac;border-radius:10px;color:#166534;">
            Cuenta creada correctamente. Ahora inicia sesión.
          </div>
        ` : ""}

        <form method="POST" action="/organizers/login">
          <div style="margin-bottom:12px;">
            <label>Correo</label><br/>
            <input type="email" name="email" value="${email}" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <div style="margin-bottom:16px;">
            <label>Contraseña</label><br/>
            <input type="password" name="password" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <button type="submit" style="width:100%;padding:14px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-weight:700;">
            Ingresar
          </button>
        </form>

        <div style="margin-top:14px;">
          <a href="/organizers/register">Crear cuenta</a>
        </div>
      </div>
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
    
const campaignRows = (campaigns || []).map(c => {
  const sold = Number(c.sold_tickets || 0);
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
        href="https://wa.me/?text=${encodeURIComponent(`Participa en esta campaña: ${c.title} - ${baseUrl}/campanas/${c.slug}`)}"
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

body{
margin:0;
font-family:Arial,sans-serif;
background:#f3f6fb;
color:#111827;
}

.header{
background:linear-gradient(135deg,#1d4ed8,#2563eb);
padding:30px;
color:white;
}

.header h1{
margin:0;
font-size:34px;
}

.container{
max-width:1200px;
margin:auto;
padding:30px 20px;
}

.grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
gap:20px;
margin-bottom:30px;
}

.card{
background:white;
padding:24px;
border-radius:18px;
box-shadow:0 10px 30px rgba(0,0,0,.06);
}

.metric{
font-size:38px;
font-weight:bold;
color:#2563eb;
margin-bottom:10px;
}

.label{
color:#6b7280;
font-size:15px;
}

.table-card{
background:white;
border-radius:18px;
padding:24px;
box-shadow:0 10px 30px rgba(0,0,0,.06);
overflow:auto;
}

table{
width:100%;
border-collapse:collapse;
}

th{
text-align:left;
padding:14px;
background:#eff6ff;
color:#1e3a8a;
font-size:14px;
}

td{
padding:14px;
border-bottom:1px solid #f1f5f9;
font-size:14px;
}

.badge{
padding:6px 10px;
border-radius:999px;
font-size:12px;
font-weight:bold;
display:inline-block;
}

.approved{
background:#dcfce7;
color:#166534;
}

.pending{
background:#fef3c7;
color:#92400e;
}

.footer{
text-align:center;
padding:30px;
color:#6b7280;
font-size:14px;
}

</style>
</head>

<body>

<div class="header">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
    <div>
      <h1>Panel del Organizador</h1>
      <p>Resumen general de campañas y ventas</p>
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

<div class="grid">

<div class="card">
<div class="metric">${orders.length}</div>
<div class="label">Órdenes Totales</div>
</div>

<div class="card">
<div class="metric">${payments.filter(p=>p.status==="approved").length}</div>
<div class="label">Pagos Aprobados</div>
</div>

<div class="card">
<div class="metric">${tickets.length}</div>
<div class="label">Códigos Vendidos</div>
</div>

<div class="card">
<div class="metric">${availableCampaignCoupons}</div>
<div class="label">Códigos Disponibles</div>
</div>

<div class="card">
<div class="metric">${totalCampaignCoupons}</div>
<div class="label">Códigos Totales</div>
</div>

<div class="card">
<div class="metric">
$${Number(
payments
.filter(p=>p.status==="approved")
.reduce((acc,p)=>acc+Number(p.amount || 0),0)
).toLocaleString("es-CO")}
</div>
<div class="label">Recaudo Total</div>
</div>

</div>

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
<th>Estado</th>
<th>Acciones</th>
</tr>
</thead>

<tbody>
${campaignRows || `
<tr>
<td colspan="8" style="padding:18px;text-align:center;color:#6b7280;">
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
<th>Fecha</th>
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
${new Date(order.created_at).toLocaleString("es-CO")}
</td>

</tr>

`).join("")}

</tbody>

</table>

</div>

<div class="table-card" style="margin-top:30px;">

<h2>Códigos promocionales asignadas</h2>

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
${tickets.map(ticket => {
  const order = orders.find(o => o.id === ticket.order_id);
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
}).join("")}
</tbody>
</table>

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
  <a href="/politicas" target="_blank" style="color:#2563eb;font-weight:bold;">
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
    const drawProvider = String(req.body.draw_provider || "").trim();
    const drawMode = String(req.body.draw_mode || "").trim();
    const pricePerTicket = Number(req.body.price_per_ticket || 0);
    const drawDate = String(req.body.draw_date || "").trim();
    const campaignTermsAccepted = req.body.campaign_terms_accepted === "true";

    if (!title || !prize || !drawProvider || !drawMode || !drawDate) {
      return res.status(400).send("Faltan campos obligatorios");
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
        platform_fee_percent: 5,
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

    const { data: campaign, error } = await supabase
      .from("rifas")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error || !campaign) {
      return res.status(404).send("Campaña no encontrada");
    }

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
    
    const whatsappShareText = encodeURIComponent(
  `Participa en esta campaña: ${campaign.title}. Link: ${campaignPublicUrl}`
);
    
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>

<title>${campaign.title}</title>

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

.header {
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  padding: 58px 20px 70px;
  color: white;
  text-align: center;
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
  opacity: .92;
}

.container {
  max-width: 1050px;
  margin: -45px auto 0;
  padding: 0 20px 35px;
}

.card {
  background: white;
  border-radius: 22px;
  padding: 28px;
  box-shadow: 0 14px 40px rgba(0,0,0,.10);
  margin-bottom: 24px;
}

.progress-card {
  background: #f9fbff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 26px;
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
  color: #6b7280;
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
}

.progress-bar-wrap {
  width: 100%;
  height: 20px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 16px;
}

.progress-bar {
  height: 100%;
  width: ${soldPercentage}%;
  background: linear-gradient(90deg, #16a34a, #22c55e);
  border-radius: 999px;
}


.info-grid {
  display: grid;
  grid-template-columns: 1.1fr .9fr;
  gap: 22px;
}

.section-title {
  margin: 0 0 14px;
  font-size: 24px;
  color: #111827;
}

.description {
  color: #4b5563;
  line-height: 1.6;
  margin: 0;
  font-size: 16px;
}

.price-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 24px;
}

.price-label {
  color: #6b7280;
  font-size: 15px;
  margin-bottom: 8px;
}

.price {
  font-size: 44px;
  font-weight: 900;
  color: #16a34a;
  margin-bottom: 18px;
}

.button {
  display: block;
  width: 100%;
  padding: 17px;
  background: #2563eb;
  color: white;
  text-decoration: none;
  text-align: center;
  border-radius: 14px;
  font-size: 19px;
  font-weight: bold;
}

.button:hover {
  opacity: .93;
}

.button-dark {
  background: #111827;
}

.button-secondary {
  background: #111827;
  margin-top: 12px;
}

.button-whatsapp {
  background: #16a34a;
  margin-top: 12px;
}

.finished-box {
  margin-top: 15px;
  padding: 16px;
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 14px;
  font-weight: bold;
  text-align: center;
  line-height: 1.4;
}

.small-note {
  margin-top: 12px;
  color: #6b7280;
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
        href="/campanas/${campaign.slug}/comprar">
        Participar ahora
      </a>

      <a
        class="button button-secondary"
        href="/consultar">
        Consultar mis Códigos promocionales
      </a>

      <a
        class="button button-whatsapp"
        target="_blank"
        href="https://wa.me/?text=${whatsappShareText}">
        Compartir por WhatsApp
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

          <a
            class="button button-secondary"
            style="margin-top:16px;"
            href="/consultar">
            Consultar mis Códigos promocionales
          </a>
        `
        : `
          <div class="finished-box" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;">
            Esta campaña está pendiente de aprobación por el administrador.<br/>
            Aún no se permiten compras.
          </div>

          <a
            class="button button-secondary"
            style="margin-top:16px;"
            href="/consultar">
            Consultar mis Códigos promocionales
          </a>
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
  font-family: Arial, sans-serif;
  background: #f3f6fb;
  color: #111827;
}

.header {
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: white;
  padding: 48px 20px;
  text-align: center;
}

.header h1 {
  margin: 0;
  font-size: 42px;
  font-weight: 900;
}

.header p {
  margin-top: 10px;
  font-size: 17px;
  opacity: .92;
}

.container {
  max-width: 1150px;
  margin: -28px auto 0;
  padding: 0 20px 40px;
}

.card {
  background: white;
  border-radius: 22px;
  padding: 26px;
  box-shadow: 0 14px 40px rgba(0,0,0,.10);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px;
}

.campaign {
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 20px;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 260px;
}

.campaign h2 {
  margin: 0 0 10px;
  font-size: 21px;
  color: #111827;
}

.description {
  color: #4b5563;
  line-height: 1.5;
  font-size: 14px;
  margin-bottom: 14px;
}

.info {
  color: #374151;
  font-size: 14px;
  line-height: 1.7;
  margin-bottom: 16px;
}

.price {
  font-size: 26px;
  font-weight: 900;
  color: #16a34a;
  margin-bottom: 14px;
}

.btn {
  display: block;
  width: 100%;
  text-align: center;
  padding: 14px;
  background: #2563eb;
  color: white;
  text-decoration: none;
  border-radius: 13px;
  font-weight: bold;
}

.btn-secondary {
  background: #111827;
  margin-top: 10px;
}

.empty {
  padding: 24px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #92400e;
  border-radius: 16px;
  text-align: center;
  font-weight: bold;
}

.top-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.top-actions a {
  text-decoration: none;
  padding: 12px 16px;
  border-radius: 12px;
  font-weight: bold;
  color: white;
}

.footer {
  text-align: center;
  padding: 26px;
  color: #6b7280;
  font-size: 14px;
}
</style>
</head>

<body>

<div class="header">
  <h1>Campañas activas</h1>
  <p>Consulta las campañas disponibles y participa de forma segura.</p>
</div>

<div class="container">
  <div class="card">

    <div class="top-actions">
      <a href="/" style="background:#111827;">Inicio</a>
      <a href="/consultar" style="background:#2563eb;">Consultar mis códigos</a>
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
                  <a class="btn" href="/campanas/${campaign.slug}">
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
        <title>Consultar mis Códigos promocionales</title>
      </head>

      <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
        <div style="max-width:850px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);">

          <h1 style="margin-top:0;">Consultar mis Códigos promocionales</h1>

          <p style="color:#6b7280;">
            Ingresa el número de teléfono usado en la compra para consultar tus órdenes y Códigos promocionales asignados.
          </p>

          <form method="GET" action="/consultar" style="margin-top:20px;margin-bottom:28px;">
            <label>Teléfono</label><br/>

            <input
              type="text"
              name="phone"
              value="${phone}"
              placeholder="Ej: 3238123392"
              required
              style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;margin:8px 0 14px;"
            />

            <button
              type="submit"
              style="width:100%;padding:15px;background:#2563eb;color:white;border:none;border-radius:12px;font-weight:bold;cursor:pointer;">
              Consultar
            </button>
          </form>

          ${
            phone && orders.length === 0
              ? `
                <div style="padding:16px;background:#fef3c7;color:#92400e;border-radius:12px;font-weight:bold;">
                  No encontramos órdenes asociadas a ese teléfono.
                </div>
              `
              : ""
          }

          ${
            orders.length > 0
              ? `
                <h2>Órdenes encontradas</h2>

                <div style="display:grid;gap:16px;">
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
  `Hola, estos son mis Códigos promocionales de la campaña ${order.rifas?.title || ""}: ${coupons || "pendientes"}. Consulta la orden aquí: ${baseUrl}/orden/${order.id}`
);

return `
                      <div style="border:1px solid #e5e7eb;border-radius:16px;padding:18px;background:#f9fafb;">
                        <div style="font-size:18px;font-weight:bold;color:#111827;">
                          ${order.rifas?.title || "Campaña"}
                        </div>

                        <div style="margin-top:8px;color:#374151;">
                          <b>Estado:</b> ${paymentStatusLabel}
                        </div>

                        <div style="margin-top:8px;color:#374151;">
                          <b>Cantidad:</b> ${order.qty}
                        </div>

                        <div style="margin-top:8px;color:#374151;">
                          <b>Total:</b> $${Number(order.total_paid || 0).toLocaleString("es-CO")}
                        </div>

                        ${
                          coupons
                            ? `
                              <div style="margin-top:12px;">
                                <b>Cupones:</b>
                                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
                                  ${(order.tickets || []).map(t => `
                                    <span style="background:#1e3a8a;color:white;padding:8px 12px;border-radius:999px;font-weight:bold;">
                                      ${t.combination || t.ticket_code || "-"}
                                    </span>
                                  `).join("")}
                                </div>
                              </div>
                            `
                            : `
                              <div style="margin-top:12px;color:#92400e;">
                                Aún no hay Códigos promocionales asignados. Si ya pagaste, espera unos segundos y vuelve a consultar.
                              </div>
                            `
                        }

                       <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:16px;">
  <a
    href="/orden/${order.id}"
    style="display:block;padding:13px;background:#16a34a;color:white;text-align:center;text-decoration:none;border-radius:12px;font-weight:bold;">
    ${paid ? "Ver orden" : "Continuar pago"}
  </a>

  <a
    href="/campanas/${order.rifas?.slug || ""}"
    style="display:block;padding:13px;background:#111827;color:white;text-align:center;text-decoration:none;border-radius:12px;font-weight:bold;">
    Ver campaña
  </a>

  ${
    coupons
      ? `
        <a
          target="_blank"
          href="https://wa.me/?text=${shareText}"
          style="display:block;padding:13px;background:#2563eb;color:white;text-align:center;text-decoration:none;border-radius:12px;font-weight:bold;">
          Compartir Códigos promocionales
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

          <div style="margin-top:24px;">
            <a href="/" style="color:#2563eb;font-weight:bold;">Volver al inicio</a>
          </div>

        </div>
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
    <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
      <div style="max-width:600px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;">
        <h1>Campaña no disponible</h1>
        <p>Esta campaña aún no está habilitada para compras.</p>

        <a
          href="/campanas/${campaign.slug}"
          style="display:inline-block;margin-top:18px;padding:14px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:12px;font-weight:bold;">
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
      </head>

      <body style="
        font-family:Arial,sans-serif;
        background:#f3f6fb;
        padding:40px;
      ">

      <div style="
        max-width:700px;
        margin:auto;
        background:white;
        padding:30px;
        border-radius:18px;
        box-shadow:0 10px 30px rgba(0,0,0,.08);
      ">

      <h1>${campaign.title}</h1>

      <div style="margin-bottom:20px;color:#16a34a;font-size:28px;font-weight:bold;">
        $${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")}
      </div>

      <form method="POST" action="/campanas/${campaign.slug}/comprar">

        <div style="margin-bottom:14px;">
          <label>Nombre completo</label><br/>
          <input
            type="text"
            name="buyer_name"
            required
            style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;"
          >
        </div>

        <div style="margin-bottom:14px;">
          <label>Teléfono</label><br/>
          <input
            type="text"
            name="buyer_phone"
            required
            style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;"
          >
        </div>

        <div style="margin-bottom:14px;">
          <label>Correo electrónico</label><br/>
          <input
            type="email"
            name="buyer_email"
            style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;"
          >
        </div>

        <div style="margin-bottom:20px;">
  <label>Cantidad de Códigos</label><br/>

 <input
  type="number"
  name="qty"
  min="${minimumQty}"
  max="${Math.min(20, Number(campaign.available_tickets || 0))}"
  value="${minimumQty}"
  required
  style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;"
>

<div style="margin-top:8px;color:#6b7280;font-size:13px;line-height:1.4;">
  Compra mínima para esta campaña: <b>${minimumQty}</b> ${minimumQty === 1 ? "cupón" : "cupones"}.
</div>

  <div style="margin-top:8px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;color:#1e3a8a;font-size:14px;line-height:1.4;">
    <b>Regla de compra:</b><br/>
    ${minimumQtyText}
  </div>
</div>

        <button
          type="submit"
          style="
            width:100%;
            padding:16px;
            background:#2563eb;
            color:white;
            border:none;
            border-radius:12px;
            font-size:18px;
            font-weight:bold;
            cursor:pointer;
          "
        >
          Continuar al pago
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

app.post("/campanas/:slug/comprar", async (req, res) => {
  try {
    const { slug } = req.params;

    const buyerName = String(req.body.buyer_name || "").trim();
    const buyerPhone = String(req.body.buyer_phone || "").trim();
    const cleanBuyerPhone = buyerPhone.replace(/\D/g, "");
    const buyerEmail = String(req.body.buyer_email || "").trim();
    const qty = Number(req.body.qty || 0);

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
        payment_status: "created"
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
    style="width:100%;padding:14px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">
    Pagar con Wompi
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
      <title>Admin</title>
    </head>
    <body style="font-family:Arial;background:#f3f6fb;padding:40px;">
      <div style="max-width:420px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
        <h1>Ingreso administrador</h1>

        <form method="POST" action="/admin/login">
          <label>Clave administrador</label><br/>
          <input
            type="password"
            name="password"
            required
            style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;margin:8px 0 18px;"
          />

          <button
            type="submit"
            style="width:100%;padding:15px;background:#2563eb;color:white;border:none;border-radius:12px;font-weight:bold;">
            Ingresar
          </button>
        </form>
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
      href="/admin/logout"
      style="background:#111827;color:white;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:bold;"
    >
      Cerrar sesión
    </a>
  </div>
</div>

          <table style="width:100%;min-width:1100px;border-collapse:collapse;">
            <thead>
              <tr style="background:#eff6ff;">
                <th style="padding:12px;text-align:left;">Campaña</th>
                <th style="padding:12px;text-align:left;">Premio</th>
                <th style="padding:12px;text-align:left;">Descripción</th>
                <th style="padding:12px;text-align:left;">Modalidad</th>
                <th style="padding:12px;text-align:left;">Precio</th>
                <th style="padding:12px;text-align:left;">Fecha sorteo</th>
                <th style="padding:12px;text-align:left;">Resultado</th>
                <th style="padding:12px;text-align:left;">Estado</th>
                <th style="padding:12px;text-align:left;">Acción</th>
              </tr>
            </thead>

            <tbody>

            ${(campaigns || []).map(c => `
  <tr>
    <td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;">
      ${c.title || "-"}
    </td>

    <td style="padding:12px;border-bottom:1px solid #eee;">
      ${c.prize || "-"}
    </td>

    <td style="padding:12px;border-bottom:1px solid #eee;width:320px;max-width:320px;line-height:1.4;color:#374151;white-space:normal;word-break:break-word;">
  <div style="max-height:70px;overflow:auto;">
    ${c.description || "-"}
  </div>
</td>

    <td style="padding:12px;border-bottom:1px solid #eee;">
  ${getDrawModeLabel(c.draw_mode)}
</td>

<td style="padding:12px;border-bottom:1px solid #eee;">
  $${Number(c.price_per_ticket || 0).toLocaleString("es-CO")}
</td>

<td style="padding:12px;border-bottom:1px solid #eee;">
  ${c.draw_date || "-"}
</td>

<td style="padding:12px;border-bottom:1px solid #eee;">
  ${c.result_value || "Pendiente"}
</td>

    <td style="padding:12px;border-bottom:1px solid #eee;">
      ${campaignStatusLabel(c.status)}
    </td>

    <td style="padding:12px;border-bottom:1px solid #eee;">
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
  c.status === "active"
    ? `
      <a
        href="/admin/campanas/${c.id}/resultado"
        style="display:block;text-align:center;padding:9px;background:#2563eb;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">
        Cargar resultado
      </a>
    `
    : c.status === "finished"
      ? `
        <div style="
          padding:9px;
          background:#e5e7eb;
          color:#6b7280;
          border-radius:10px;
          font-weight:bold;
          text-align:center;">
          Resultado cerrado
        </div>
      `
      : ""
}

      </div>
    </td>
  </tr>
`).join("")}
           
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
