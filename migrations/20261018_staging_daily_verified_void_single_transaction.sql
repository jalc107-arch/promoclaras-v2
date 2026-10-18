-- STAGING ONLY. A signed VOIDED event is recorded and its order/activations
-- reversed in one PostgreSQL transaction. Caller must have VERIFIED the
-- Wompi checksum, amount, COP currency, environment and order reference.
CREATE OR REPLACE FUNCTION public.system_daily_apply_verified_void_atomic(
 p_payment_id uuid,p_transaction_id text,p_checksum text,
 p_environment text,p_event_timestamp bigint
)
RETURNS TABLE(revoked_count integer,released_count integer,already_reversed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
DECLARE
 v_order_id uuid;
BEGIN
 IF p_payment_id IS NULL THEN RAISE EXCEPTION 'Pago Wompi obligatorio'; END IF;
 SELECT p.order_id INTO v_order_id FROM public.payments p WHERE p.id=p_payment_id;
 IF v_order_id IS NULL THEN RAISE EXCEPTION 'Pago Wompi inexistente'; END IF;
 -- Both calls participate in this function's transaction. Any failure
 -- rolls back the event receipt, payment, codes, activations and audit.
 PERFORM 1 FROM public.system_daily_record_verified_wompi_event(
  p_payment_id,p_transaction_id,'VOIDED',p_checksum,p_environment,p_event_timestamp);
 RETURN QUERY SELECT v.revoked_count,v.released_count,v.already_reversed
 FROM public.system_daily_void_full_payment_atomic(v_order_id,p_transaction_id) v;
END;
$body$;
REVOKE ALL ON FUNCTION public.system_daily_apply_verified_void_atomic(uuid,text,text,text,bigint)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.system_daily_apply_verified_void_atomic(uuid,text,text,text,bigint)
 TO service_role;
