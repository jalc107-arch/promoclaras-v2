import "dotenv/config";
import express from "express";
import session from "express-session";
import { createClient } from "@supabase/supabase-js";

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

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

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
            Módulo 3 funcionando: registro, login y panel básico del organizador.
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
