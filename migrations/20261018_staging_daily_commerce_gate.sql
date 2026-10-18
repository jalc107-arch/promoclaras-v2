-- STAGING ONLY. Independent database kill switch for exceptional daily sales.
-- Defaults to OFF, even when an exceptional authorization row is approved.
-- An explicit documented DBA migration is required before commercial use.
CREATE TABLE IF NOT EXISTS public.campaign_daily_commerce_controls(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton IS TRUE),
 sales_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 reason text
);
INSERT INTO public.campaign_daily_commerce_controls(singleton,sales_enabled,reason)
 VALUES(true,false,'Deshabilitado: permisos regulatorios y de Wompi pendientes')
 ON CONFLICT(singleton) DO NOTHING;
ALTER TABLE public.campaign_daily_commerce_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campaign_daily_commerce_controls FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE
 source_sql text;
 anchor text:= ' IF v_order.payment_mode IS DISTINCT FROM ''full''';
 guarded text:=$guard$
 IF NOT EXISTS (SELECT 1 FROM public.campaign_daily_commerce_controls
 WHERE singleton=true AND sales_enabled=true) THEN
   RAISE EXCEPTION 'Sinuano deshabilitado por control independiente de base de datos';
 END IF;
 IF v_order.payment_mode IS DISTINCT FROM 'full'$guard$;
BEGIN
 SELECT pg_get_functiondef('public.system_daily_finalize_full_payment_atomic(uuid,text)'::regprocedure)
 INTO source_sql;
 IF source_sql IS NULL OR strpos(source_sql,anchor)=0 THEN
   RAISE EXCEPTION 'No se encuentra la funcion de pago excepcional o ancla de control';
 END IF;
 IF strpos(source_sql,'Sinuano deshabilitado por control independiente')=0 THEN
   EXECUTE replace(source_sql,anchor,guarded);
 END IF;
END $patch$;
REVOKE ALL ON FUNCTION public.system_daily_finalize_full_payment_atomic(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.system_daily_finalize_full_payment_atomic(uuid,text)
 TO service_role;
