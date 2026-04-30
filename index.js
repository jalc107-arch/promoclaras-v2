import "dotenv/config";
import express from "express";
import session from "express-session";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "promoclaras_v2_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax"
    }
  })
);

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY;
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET;
const WOMPI_EVENTS_SECRET = String(process.env.WOMPI_EVENTS_SECRET || "").trim();
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateTicketCode(drawMode) {
  if (drawMode === "baloto_2") {
    const numbers = [];

    while (numbers.length < 2) {
      const n = randomInt(1, 43);

      if (!numbers.includes(n)) {
        numbers.push(n);
      }
    }

    numbers.sort((a, b) => a - b);

    return numbers.map(n => String(n).padStart(2, "0")).join("-");
  }

  if (drawMode === "baloto_3") {
    const numbers = [];

    while (numbers.length < 3) {
      const n = randomInt(1, 43);

      if (!numbers.includes(n)) {
        numbers.push(n);
      }
    }

    numbers.sort((a, b) => a - b);

    return numbers.map(n => String(n).padStart(2, "0")).join("-");
  }

  if (drawMode === "loteria_2_primeras") {
    return String(randomInt(0, 99)).padStart(2, "0");
  }

  if (drawMode === "loteria_3_primeras") {
    return String(randomInt(0, 999)).padStart(3, "0");
  }

  return crypto.randomUUID().slice(0, 8);
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
    .select("ticket_code")
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
  res.send("PROMOCLARAS V2 funcionando");
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

    const { data: organizer, error: organizerError } = await supabase
      .from("organizers")
      .insert({
        profile_id: profile.id,
        full_name: fullName,
        email,
        phone: phone || null,
        password,
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

app.post("/organizers/login", async (req, res) => {
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
      .eq("password", password)
      .maybeSingle();

    if (error) throw error;

    if (!organizer) {
      return res.status(401).send("Correo o contraseña incorrectos");
    }

    req.session.organizerId = organizer.id;

    return res.redirect(`/organizers/${organizer.id}/panel`);
  } catch (error) {
    return res.status(500).send(error.message);
  }
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

const campaignRows = (campaigns || []).map(c => `
  <tr>
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${c.title}</td>
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${c.prize}</td>
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${c.draw_provider}</td>
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${c.draw_mode}</td>
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${Number(c.price_per_ticket || 0).toLocaleString("es-CO")}</td>
    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;">${c.status}</td>
  </tr>
`).join("");
    
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
<h1>Panel del Organizador</h1>
<p>Resumen general de campañas y ventas</p>
</div>

<div class="container">

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
<div class="label">Boletas Vendidas</div>
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

<h2>Últimas órdenes</h2>
<h2 style="margin-top:40px;">Boletas asignadas</h2>

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

<h2>Boletas asignadas</h2>

<table>
<thead>
<tr>
<th>Comprador</th>
<th>Teléfono</th>
<th>Boleta</th>
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

            <div style="margin-bottom:12px;">
              <label>Link foto cédula frente</label><br/>
              <input type="text" name="id_front_url" value="${organizer.id_front_url || ""}" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:12px;">
              <label>Link foto cédula reverso</label><br/>
              <input type="text" name="id_back_url" value="${organizer.id_back_url || ""}" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:12px;">
              <label>Link selfie con cédula</label><br/>
              <input type="text" name="selfie_id_url" value="${organizer.selfie_id_url || ""}" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

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
                Acepto términos y confirmo que la información es real
              </label>
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
    const idFrontUrl = String(req.body.id_front_url || "").trim();
    const idBackUrl = String(req.body.id_back_url || "").trim();
    const selfieIdUrl = String(req.body.selfie_id_url || "").trim();
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
      return res.status(400).send("Debes aceptar los términos");
    }

    const { error } = await supabase
      .from("organizers")
      .update({
        document_number: documentNumber,
        id_front_url: idFrontUrl || null,
        id_back_url: idBackUrl || null,
        selfie_id_url: selfieIdUrl || null,
        payout_method: payoutMethod || null,
        bank_name: bankName || null,
        account_type: accountType || null,
        account_number: accountNumber || null,
        account_holder: accountHolder || null,
        prize_proof_url: prizeProofUrl || null,
        terms_accepted: termsAccepted,
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
              <select name="draw_provider" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
                <option value="baloto">Baloto</option>
                <option value="loteria_meta">Lotería del Meta</option>
                <option value="loteria_bogota">Lotería de Bogotá</option>
              </select>
            </div>

            <div style="margin-bottom:12px;">
              <label>Modalidad</label><br/>
              <select name="draw_mode" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
                <option value="baloto_2">2 balotas</option>
                <option value="baloto_3">3 balotas</option>
                <option value="loteria_2_primeras">2 primeras cifras</option>
                <option value="loteria_3_primeras">3 primeras cifras</option>
              </select>
            </div>

            <div style="margin-bottom:12px;">
              <label>Precio por cupón</label><br/>
              <input type="number" name="price_per_ticket" min="1" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
            </div>

            <div style="margin-bottom:16px;">
              <label>Fecha del sorteo</label><br/>
              <input type="date" name="draw_date" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
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

    const title = String(req.body.title || "").trim();
    const prize = String(req.body.prize || "").trim();
    const description = String(req.body.description || "").trim();
    const drawProvider = String(req.body.draw_provider || "").trim();
    const drawMode = String(req.body.draw_mode || "").trim();
    const pricePerTicket = Number(req.body.price_per_ticket || 0);
    const drawDate = String(req.body.draw_date || "").trim();

    if (!title || !prize || !drawProvider || !drawMode || !drawDate) {
      return res.status(400).send("Faltan campos obligatorios");
    }

    if (!Number.isFinite(pricePerTicket) || pricePerTicket <= 0) {
      return res.status(400).send("Precio inválido");
    }

    let maxTickets = 0;

    if (drawMode === "baloto_2") maxTickets = 903;
    if (drawMode === "baloto_3") maxTickets = 12341;
    if (drawMode === "loteria_2_primeras") maxTickets = 100;
    if (drawMode === "loteria_3_primeras") maxTickets = 1000;

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
        slug
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

res.setHeader("Content-Type", "text/html; charset=utf-8");
res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>

<title>${campaign.title}</title>

<style>

body{
margin:0;
font-family:Arial,sans-serif;
background:#f3f6fb;
color:#111827;
}

.header{
background:linear-gradient(135deg,#1d4ed8,#2563eb);
padding:60px 20px;
color:white;
text-align:center;
}

.header h1{
margin:0;
font-size:42px;
}

.header p{
margin-top:10px;
font-size:18px;
opacity:.9;
}

.container{
max-width:1100px;
margin:auto;
padding:30px 20px;
}

.card{
background:white;
border-radius:18px;
padding:28px;
box-shadow:0 10px 30px rgba(0,0,0,.08);
margin-bottom:24px;
}

.grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
gap:18px;
}

.metric{
background:#f9fbff;
border:1px solid #e5e7eb;
border-radius:14px;
padding:20px;
text-align:center;
}

.metric h2{
margin:0;
font-size:30px;
color:#2563eb;
}

.metric span{
display:block;
margin-top:8px;
color:#6b7280;
font-size:14px;
}

.price{
font-size:42px;
font-weight:bold;
color:#16a34a;
margin-top:10px;
}

.button{
display:inline-block;
width:100%;
padding:18px;
background:#2563eb;
color:white;
text-decoration:none;
text-align:center;
border-radius:14px;
font-size:20px;
font-weight:bold;
margin-top:20px;
}

.button:hover{
opacity:.92;
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
<h1>${campaign.title}</h1>
<p>Participa fácilmente desde cualquier lugar</p>
</div>

<div class="container">

<div class="card">

<div class="grid">

<div class="metric">
<h2>${campaign.max_tickets || 0}</h2>
<span>Boletas Totales</span>
</div>

<div class="metric">
<h2>${campaign.sold_tickets || 0}</h2>
<span>Boletas Vendidas</span>
</div>

<div class="metric">
<h2>${campaign.available_tickets || 0}</h2>
<span>Disponibles</span>
</div>

<div class="metric">
<h2>${campaign.status || "active"}</h2>
<span>Estado</span>
</div>

</div>

</div>

<div class="card">

<h2 style="margin-top:0;">Valor por boleta</h2>

<div class="price">
$${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")}
</div>

<a
class="button"
href="/campanas/${campaign.slug}/comprar">
Participar ahora
</a>

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
          <label>Cantidad de boletas</label><br/>
          <input
            type="number"
            name="qty"
            min="1"
            max="20"
            value="1"
            required
            style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;"
          >
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
    const buyerEmail = String(req.body.buyer_email || "").trim();
    const qty = Number(req.body.qty || 0);

    if (!buyerName || !buyerPhone) {
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

    let buyer = null;

    const { data: existingBuyer, error: existingBuyerError } = await supabase
      .from("buyers")
      .select("*")
      .eq("phone", buyerPhone)
      .maybeSingle();

    if (existingBuyerError) throw existingBuyerError;

    if (existingBuyer) {
      buyer = existingBuyer;
    } else {
      const { data: newBuyer, error: newBuyerError } = await supabase
        .from("buyers")
        .insert({
          full_name: buyerName,
          phone: buyerPhone,
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
    }

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

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const redirectUrl = `${baseUrl}/orden/${order.id}`;

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
      <b>Boletas asignadas:</b>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
        ${tickets.map(t => `
          <div style="
            background:#1e3a8a;
            color:white;
            padding:10px 14px;
            border-radius:10px;
            font-weight:bold;
          ">
            ${t.combination}
          </div>
        `).join("")}
      </div>
    </div>
    `
    : ""
}

          
         ${payment.status !== "approved" ? `
<div style="margin-top:18px;padding:14px;background:#eff6ff;border-radius:12px;color:#1e3a8a;">
Ya puedes continuar al pago con Wompi Sandbox.
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
          status: "active"
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

    await supabase
      .from("orders")
      .update({
        payment_status: localOrderStatus
      })
      .eq("id", payment.order_id);

    return res.status(200).send("ok");
  } catch (error) {
    console.error("Webhook Wompi error:", error);
    return res.status(500).send(error.message);
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
