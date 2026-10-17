from pathlib import Path
p=Path(__file__).resolve().parents[1]/'index.js'
s=p.read_text()
anchor='import express from "express";'
assert s.count(anchor)==1
s=s.replace(anchor,anchor+'\nimport { registerDailyDrawFailClosedGuards } from "./services/sinuanoAccess.mjs";\nimport { registerDailyDrawAdminRoutes } from "./services/dailyDrawAdmin.mjs";')
anchor='const campaignAvailabilityService = createCampaignAvailabilityService({'
assert s.count(anchor)==1
s=s.replace(anchor,'// Guardias fail-closed previas a toda operación comercial.\nregisterDailyDrawFailClosedGuards(app, { supabase });\n// Expediente admin excepcional, comercialización siempre deshabilitada.\nregisterDailyDrawAdminRoutes(app, { supabase, escapeHtml });\n\n'+anchor)
p.write_text(s)
print('Patch: imports y guardias ubicadas antes de las rutas, length',len(s))
