-- STAGING ONLY. Event receipts written solely AFTER app verifies Wompi checksum,
-- environment, reference, amount and currency. DB cannot verify web signature alone.
-- Append-only; never store webhook raw payload, provider secrets, buyer PII.
CREATE TABLE IF NOT EXISTS public.campaign_daily_wompi_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES public.rifas(id) ON DELETE RESTRICT,
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
 provider_transaction_id text NOT NULL,
 event_status text NOT NULL CHECK(event_status IN ('APPROVED','VOIDED')),
 event_checksum text NOT NULL CHECK(event_checksum ~ '^[a-f0-9]{64}$'),
 event_environment text NOT NULL CHECK(event_environment='test'),
 provider_event_timestamp bigint NOT NULL CHECK(provider_event_timestamp>0),
 verified_by text NOT NULL DEFAULT 'server_checksum_verified'
   CHECK(verified_by='server_checksum_verified'),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(payment_id,provider_transaction_id,event_status)
);
CREATE INDEX IF NOT EXISTS idx_daily_wompi_events_order
 ON public.campaign_daily_wompi_events(order_id,received_at);
ALTER TABLE public.campaign_daily_wompi_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campaign_daily_wompi_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.deny_daily_wompi_event_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $body$
BEGIN
 RAISE EXCEPTION 'El historial de eventos Wompi es inmutable';
END;
$body$;
DROP TRIGGER IF EXISTS trg_daily_wompi_events_immutable ON public.campaign_daily_wompi_events;
CREATE TRIGGER trg_daily_wompi_events_immutable
 BEFORE UPDATE OR DELETE ON public.campaign_daily_wompi_events
 FOR EACH ROW EXECUTE FUNCTION public.deny_daily_wompi_event_mutation();
REVOKE ALL ON FUNCTION public.deny_daily_wompi_event_mutation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.system_daily_record_verified_wompi_event(
 p_payment_id uuid,p_transaction_id text,p_status text,
 p_checksum text,p_environment text,p_event_timestamp bigint
)
RETURNS TABLE(event_id uuid,already_recorded boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $body$
DECLARE
 v_payment public.payments%ROWTYPE;
 v_order public.orders%ROWTYPE;
 v_rifa public.rifas%ROWTYPE;
 v_saved uuid;
BEGIN
 IF p_payment_id IS NULL OR length(btrim(coalesce(p_transaction_id,'')))<6
   OR p_status NOT IN ('APPROVED','VOIDED') OR p_status IS NULL
   OR p_checksum !~ '^[a-f0-9]{64}$' OR p_checksum IS NULL
   OR p_environment IS DISTINCT FROM 'test'
   OR p_event_timestamp IS NULL OR p_event_timestamp<=0 THEN
   RAISE EXCEPTION 'Evento Wompi incompleto, inválido o de entorno incorrecto';
 END IF;
 -- Same lock order as settlement and reversal to serialize multiple instances.
 SELECT o.* INTO v_order FROM public.orders o
 JOIN public.payments p ON p.order_id=o.id WHERE p.id=p_payment_id FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pago sin orden'; END IF;
 SELECT * INTO v_rifa FROM public.rifas WHERE id=v_order.rifa_id FOR UPDATE;
 IF v_rifa.draw_provider IS DISTINCT FROM 'loteria_sinuano_noche'
 OR v_rifa.draw_mode IS DISTINCT FROM 'loteria_4_pleno' THEN
   RAISE EXCEPTION 'El evento no pertenece a la modalidad diaria';
 END IF;
 SELECT * INTO v_payment FROM public.payments WHERE id=p_payment_id FOR UPDATE;
 IF NOT FOUND OR v_payment.order_id IS DISTINCT FROM v_order.id
 OR v_payment.provider NOT IN ('manual','wompi')
 OR v_payment.installment_id IS NOT NULL
 OR (v_payment.provider_transaction_id IS NOT NULL
 AND v_payment.provider_transaction_id<>btrim(p_transaction_id)) THEN
   RAISE EXCEPTION 'Referencia Wompi o pago no coincidente';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.campaign_daily_wompi_events e
  WHERE e.payment_id=p_payment_id
   AND e.provider_transaction_id<>btrim(p_transaction_id)
 ) THEN
   RAISE EXCEPTION 'Una orden no puede cambiar de transacción Wompi';
 END IF;
 IF p_status='APPROVED' AND EXISTS(
   SELECT 1 FROM public.campaign_daily_wompi_events e
   WHERE e.payment_id=p_payment_id AND e.event_status='VOIDED'
 ) THEN
   RAISE EXCEPTION 'No se puede reactivar un pago anulado con evento atrasado';
 END IF;
 IF p_status='VOIDED' AND NOT EXISTS(
  SELECT 1 FROM public.campaign_daily_wompi_events e
  WHERE e.payment_id=p_payment_id
   AND e.provider_transaction_id=btrim(p_transaction_id)
   AND e.event_status='APPROVED'
 ) THEN
   RAISE EXCEPTION 'VOIDED sin confirmación APPROVED previa';
 END IF;
 INSERT INTO public.campaign_daily_wompi_events(
   campaign_id,order_id,payment_id,provider_transaction_id,event_status,
   event_checksum,event_environment,provider_event_timestamp
 ) VALUES(v_rifa.id,v_order.id,p_payment_id,btrim(p_transaction_id),
  p_status,p_checksum,p_environment,p_event_timestamp)
 ON CONFLICT(payment_id,provider_transaction_id,event_status) DO NOTHING
 RETURNING id INTO v_saved;
 IF v_saved IS NULL THEN
   SELECT e.id INTO v_saved FROM public.campaign_daily_wompi_events e
   WHERE e.payment_id=p_payment_id
    AND e.provider_transaction_id=btrim(p_transaction_id)
    AND e.event_status=p_status;
   RETURN QUERY SELECT v_saved,true;
 ELSE
   RETURN QUERY SELECT v_saved,false;
 END IF;
END;
$body$;
REVOKE ALL ON FUNCTION public.system_daily_record_verified_wompi_event(uuid,text,text,text,text,bigint)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.system_daily_record_verified_wompi_event(uuid,text,text,text,text,bigint)
 TO service_role;

-- Settlement requires verified, immutable APPROVED receipt and zero VOIDED
-- receipts (both checked under order/raffle row locks).
DO $patch$
DECLARE
 v_definition text;
 v_anchor text := ' -- Locking the campaign serializes all allocations of the 0000-9999 space,';
 v_insert text := $gate$
 IF NOT EXISTS (
   SELECT 1 FROM public.campaign_daily_wompi_events e
   WHERE e.order_id=v_order.id AND e.payment_id=v_payment.id
     AND e.provider_transaction_id=v_payment.provider_transaction_id
     AND e.event_status='APPROVED'
 ) OR EXISTS (
   SELECT 1 FROM public.campaign_daily_wompi_events e
   WHERE e.order_id=v_order.id AND e.payment_id=v_payment.id
     AND e.event_status='VOIDED'
 ) THEN
   RAISE EXCEPTION 'Sin evidencia inmutable de Wompi APPROVED o pago ya VOIDED';
 END IF;
 -- Locking the campaign serializes all allocations of the 0000-9999 space,$gate$;
BEGIN
 SELECT pg_get_functiondef('public.system_daily_finalize_full_payment_atomic(uuid,text)'::regprocedure)
 INTO v_definition;
 IF strpos(v_definition,v_anchor)=0 THEN
   RAISE EXCEPTION 'Ancla de finalizador no encontrada';
 END IF;
 IF strpos(v_definition,'Sin evidencia inmutable de Wompi APPROVED')=0 THEN
   EXECUTE replace(v_definition,v_anchor,v_insert);
 END IF;
END $patch$;
REVOKE ALL ON FUNCTION public.system_daily_finalize_full_payment_atomic(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.system_daily_finalize_full_payment_atomic(uuid,text)
 TO service_role;
