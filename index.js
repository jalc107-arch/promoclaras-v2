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
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Panel organizador</title>
      </head>
      <body style="font-family: Arial, sans-serif; background:#f5f7fb; padding:40px;">
        <div style="max-width:900px;margin:0 auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
          <h1>Panel del organizador</h1>

          <div style="margin-top:10px;font-size:18px;">
            <b>Nombre:</b> ${organizer.full_name}
          </div>

          <div style="margin-top:10px;font-size:18px;">
            <b>Correo:</b> ${organizer.email}
          </div>

          <div style="margin-top:10px;font-size:18px;">
            <b>Teléfono:</b> ${organizer.phone || "-"}
          </div>

          <div style="margin-top:10px;font-size:18px;">
            <b>Estado de verificación:</b> ${organizer.verification_status}
          </div>

          <div style="margin-top:24px;padding:16px;background:#eff6ff;border-radius:12px;color:#1e3a8a;">
  Módulo 4 activo: ya puedes completar la verificación del organizador.
</div>

${verificationHtml}

${organizer.verification_status === "verified" ? `
  <div style="margin-top:18px;">
    <a
      href="/organizers/${organizer.id}/campanas/nueva"
      style="display:inline-block;padding:12px 18px;background:#16a34a;color:white;text-decoration:none;border-radius:10px;font-weight:700;"
    >
      Crear campaña
    </a>
  </div>
` : ""}

<div style="margin-top:28px;">
  <h2 style="margin-bottom:12px;">Mis campañas</h2>

  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:auto;">
    <table style="width:100%;border-collapse:collapse;min-width:760px;">
      <thead style="background:#0f172a;color:white;">
        <tr>
          <th style="padding:12px;text-align:left;">Título</th>
          <th style="padding:12px;text-align:left;">Premio</th>
          <th style="padding:12px;text-align:left;">Proveedor</th>
          <th style="padding:12px;text-align:left;">Modalidad</th>
          <th style="padding:12px;text-align:right;">Precio</th>
          <th style="padding:12px;text-align:center;">Estado</th>
        </tr>
      </thead>
      <tbody>
        ${campaignRows || `<tr><td colspan="6" style="padding:16px;">Aún no tienes campañas creadas.</td></tr>`}
      </tbody>
    </table>
  </div>
</div>

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
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${campaign.title}</title>
  </head>
  <body style="font-family: Arial, sans-serif; background:#f5f7fb; padding:40px;">
    <div style="max-width:980px;margin:0 auto;display:grid;grid-template-columns:1.1fr .9fr;gap:20px;">
      <div style="background:#fff;padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
        <div style="display:inline-block;padding:8px 12px;border-radius:999px;background:#e5e7eb;font-weight:700;margin-bottom:12px;">
          Estado: ${campaign.status}
        </div>

        <h1 style="margin-top:0;">${campaign.title}</h1>

        <div style="margin-bottom:10px;font-size:18px;">
          <b>Premio:</b> ${campaign.prize}
        </div>

        <div style="margin-bottom:10px;">
          <b>Descripción:</b> ${campaign.description || "-"}
        </div>

        <div style="margin-bottom:10px;">
          <b>Proveedor de sorteo:</b> ${campaign.draw_provider}
        </div>

        <div style="margin-bottom:10px;">
          <b>Modalidad:</b> ${campaign.draw_mode}
        </div>

        <div style="margin-bottom:10px;">
          <b>Precio por cupón:</b> $${Number(campaign.price_per_ticket || 0).toLocaleString("es-CO")}
        </div>

        <div style="margin-bottom:10px;">
          <b>Máximo de cupones:</b> ${campaign.max_tickets}
        </div>

        <div style="margin-bottom:10px;">
          <b>Vendidos:</b> ${campaign.sold_tickets}
        </div>

        <div style="margin-bottom:10px;">
          <b>Disponibles:</b> ${campaign.available_tickets}
        </div>

        <div style="margin-bottom:18px;">
          <b>Fecha del sorteo:</b> ${campaign.draw_date}
        </div>
      </div>

      <div style="background:#fff;padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);">
        <h2 style="margin-top:0;">Participar en esta campaña</h2>

        <form method="POST" action="/campanas/${campaign.slug}/comprar">
          <div style="margin-bottom:12px;">
            <label>Nombre completo</label><br/>
            <input type="text" name="buyer_name" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <div style="margin-bottom:12px;">
            <label>Teléfono</label><br/>
            <input type="text" name="buyer_phone" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <div style="margin-bottom:12px;">
            <label>Correo electrónico</label><br/>
            <input type="email" name="buyer_email" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <div style="margin-bottom:16px;">
            <label>Cantidad de cupones</label><br/>
            <input type="number" name="qty" min="1" max="20" value="1" required style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;">
          </div>

          <button type="submit" style="width:100%;padding:14px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-weight:700;">
            Continuar compra
          </button>
        </form>

        <div style="margin-top:14px;padding:14px;background:#eff6ff;border-radius:12px;color:#1e3a8a;">
          Módulo 6 activo: aquí empezamos el flujo limpio de compra.
        </div>
      </div>
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

          <div style="margin-bottom:18px;padding:14px;background:#eff6ff;border-radius:12px;color:#1e3a8a;">
            Ya puedes continuar al pago con Wompi Sandbox.
          </div>

          <form action="https://checkout.wompi.co/p/" method="GET">
            <input type="hidden" name="public-key" value="${WOMPI_PUBLIC_KEY}">
            <input type="hidden" name="currency" value="${currency}">
            <input type="hidden" name="amount-in-cents" value="${amountInCents}">
            <input type="hidden" name="reference" value="${reference}">
            <input type="hidden" name="signature:integrity" value="${signature}">
            <input type="hidden" name="redirect-url" value="${redirectUrl}">

            <button type="submit" style="width:100%;padding:14px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:16px;">
              Pagar con Wompi
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

  const { data: orderData } = await supabase
    .from("orders")
    .select("rifa_id, qty")
    .eq("id", payment.order_id)
    .single();

  if (orderData) {
    const { data: campaign } = await supabase
      .from("rifas")
      .select("sold_tickets, available_tickets")
      .eq("id", orderData.rifa_id)
      .single();

    if (campaign) {
      const soldTickets =
        Number(campaign.sold_tickets || 0) + Number(orderData.qty || 0);

      const availableTickets =
        Number(campaign.available_tickets || 0) - Number(orderData.qty || 0);

      await supabase
        .from("rifas")
        .update({
          sold_tickets: soldTickets,
          available_tickets: availableTickets,
          status: "active"
        })
        .eq("id", orderData.rifa_id);
    }
  }
}

    if (["DECLINED", "ERROR", "VOIDED"].includes(transactionStatus)) {
      localPaymentStatus = "failed";
      localOrderStatus = "failed";
    }

    await supabase
      .from("payments")
      .update({
        status: localPaymentStatus,
        provider: "wompi",
        provider_transaction_id: transactionId
      })
      .eq("id", payment.id);

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
