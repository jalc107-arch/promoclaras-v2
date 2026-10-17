-- SOLO STAGING (proyecto xooxbkawxrdvlvbvkvjy). NO HABILITA COBROS.
-- Se ejecuta DESPUÉS de 20261017_staging_daily_draws_admin_guard.sql.
-- Los horarios oficiales y premios del 1 al 30 requieren definición y validación.
-- El 31 será EXCLUSIVAMENTE premio mayor, con alternativa pendiente de elegir.
BEGIN;
INSERT INTO public.campaign_daily_draws (
  campaign_id,draw_date,provider,draw_mode,prize_kind,prize_description,
  prize_amount,major_prize,cutoff_at,scheduled_at,status
)
SELECT r.id, DATE '2026-12-01' + days.i, 'loteria_sinuano_noche','loteria_4_pleno',
       'undetermined',
       CASE WHEN days.i=30 THEN 'PREMIO MAYOR: $12.500.000 o dos motocicletas (elección pendiente)' 
            ELSE 'PREMIO DIARIO: dinero o bien pendiente de configuración' END,
       NULL, days.i=30, NULL, NULL, 'draft'
FROM public.rifas r CROSS JOIN generate_series(0,30) AS days(i)
WHERE r.slug='prueba-interna-sinuano-noche-2500-4-cifras'
  AND r.status='pending' AND r.is_public=false
ON CONFLICT(campaign_id,draw_date) DO NOTHING;
COMMIT;
-- Validación: SELECT count(*) FROM public.campaign_daily_draws WHERE campaign_id=(SELECT id FROM public.rifas WHERE slug='prueba-interna-sinuano-noche-2500-4-cifras'); -- Debe ser 31
