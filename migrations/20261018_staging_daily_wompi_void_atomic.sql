-- STAGING ONLY. Idempotent VOIDED and atomic revocation in SAME transaction.
-- Never reissues historical codes; past published results are flagged for review.
CREATE OR REPLACE FUNCTION public.system_daily_void_full_payment_atomic(
 p_order_id uuid,p_provider_transaction_id text
)
RETURNS TABLE(revoked_count integer,released_count integer,already_reversed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
DECLARE
 v_order public.orders%ROWTYPE;
 v_rifa public.rifas%ROWTYPE;
 v_payment public.payments%ROWTYPE;
 v_revoke integer:=0;
 v_release integer:=0;
 v_previous boolean;
 v_later integer:=0;
BEGIN
 IF p_order_id IS NULL OR length(btrim(coalesce(p_provider_transaction_id,'')))<6 THEN
  RAISE EXCEPTION 'VOIDED sin identidad de transacción';
 END IF;
 SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Orden inexistente'; END IF;
 SELECT * INTO v_rifa FROM public.rifas WHERE id=v_order.rifa_id FOR UPDATE;
 IF v_rifa.draw_provider IS DISTINCT FROM 'loteria_sinuano_noche'
    OR v_rifa.draw_mode IS DISTINCT FROM 'loteria_4_pleno' THEN
  RAISE EXCEPTION 'No es una campaña diaria excepcional';
 END IF;
 SELECT * INTO v_payment FROM public.payments
 WHERE order_id=p_order_id AND provider_transaction_id=btrim(p_provider_transaction_id)
 FOR UPDATE;
 IF NOT FOUND OR v_payment.installment_id IS NOT NULL THEN
  RAISE EXCEPTION 'Transacción Wompi VOIDED no coincide con pago';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.campaign_daily_wompi_events e
  WHERE e.payment_id=v_payment.id AND e.order_id=p_order_id
   AND e.event_status='VOIDED'
   AND e.provider_transaction_id=btrim(p_provider_transaction_id)
 ) THEN
  RAISE EXCEPTION 'No existe evento VOIDED con checksum validado por servidor';
 END IF;
 v_previous := v_payment.status='failed' AND v_order.payment_status='failed';
 IF v_payment.status NOT IN ('approved','failed')
    OR v_order.payment_status NOT IN ('paid','failed','created') THEN
  RAISE EXCEPTION 'Estado previo de anulación inconsistente';
 END IF;
 -- Activation BEFORE payment reversal so the trigger leaves an audit row.
 -- Never delete activation or replace original confirmation timestamps.
 UPDATE public.campaign_daily_ticket_activations
 SET revoked_at=clock_timestamp(),
   revoked_reason='Anulación Wompi VOIDED verificada y documentada'
 WHERE campaign_id=v_rifa.id AND order_id=p_order_id
   AND approved_payment_id=v_payment.id AND revoked_at IS NULL;
 GET DIAGNOSTICS v_revoke=ROW_COUNT;
 -- Codes remain permanently linked to the historical order for traceability.
 UPDATE public.tickets SET status='released'
 WHERE rifa_id=v_rifa.id AND order_id=p_order_id AND status='active';
 GET DIAGNOSTICS v_release=ROW_COUNT;
 UPDATE public.payments SET status='failed',updated_at=clock_timestamp(),
  platform_fee=0 WHERE id=v_payment.id AND status IS DISTINCT FROM 'failed';
 UPDATE public.orders SET payment_status='failed',total_paid=0,
  amount_paid=0,balance_due=subtotal,commission=0,
  archived_at=clock_timestamp(),archive_reason='wompi_voided'
 WHERE id=p_order_id AND payment_status IS DISTINCT FROM 'failed';
 SELECT count(*) INTO v_later
 FROM public.campaign_daily_draws d
 JOIN public.campaign_daily_ticket_activations a
   ON a.campaign_id=d.campaign_id
 WHERE d.campaign_id=v_rifa.id AND a.order_id=p_order_id
  AND d.status='completed' AND a.activated_at<=d.cutoff_at;
 IF NOT v_previous THEN
   INSERT INTO public.campaign_daily_audit(campaign_id,event_kind,actor_fingerprint,details)
   VALUES(v_rifa.id,'wompi_voided_atomic',
    encode(sha256(convert_to('SYSTEM_VERIFIED_WOMPI_VOIDED','UTF8')),'hex'),
    jsonb_build_object('order_id',p_order_id,'payment_id',v_payment.id,
       'revocations',v_revoke,'released',v_release,
       'completed_days_review_required',v_later));
 END IF;
 RETURN QUERY SELECT v_revoke,v_release,v_previous;
END;
$body$;
REVOKE ALL ON FUNCTION public.system_daily_void_full_payment_atomic(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.system_daily_void_full_payment_atomic(uuid,text)
 TO service_role;
