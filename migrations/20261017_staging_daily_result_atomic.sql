-- CAMPA CLICK / STAGING ONLY. DO NOT APPLY TO PRODUCTION.
-- Never makes purchases, touches Wompi, changes legacy rifas.status or
-- declares winners for unsold, reserved or partially paid combinations.
-- The function is granted ONLY to service_role. Application MUST authenticate
-- administrator + CSRF and verify official result from external source.

BEGIN;
CREATE OR REPLACE FUNCTION public.admin_daily_draw_record_result_atomic(
 p_draw_id uuid,
 p_result text,
 p_official_reference text,
 p_actor_fingerprint text
) RETURNS TABLE(outcome text, winner_ticket_id uuid, eligible_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
 v_draw public.campaign_daily_draws%ROWTYPE;
 v_campaign public.rifas%ROWTYPE;
 v_auth public.daily_draw_campaign_authorizations%ROWTYPE;
 v_result_count integer;
 v_winner uuid;
 v_eligible integer;
 v_digest text;
BEGIN
 IF p_result !~ '^[0-9]{4}$' OR p_result IS NULL THEN
   RAISE EXCEPTION 'El resultado debe contener cuatro cifras, incluidos ceros iniciales';
 END IF;
 IF length(btrim(coalesce(p_official_reference,''))) < 12 OR length(p_official_reference)>500 THEN
   RAISE EXCEPTION 'Falta fuente oficial verificable';
 END IF;
 IF p_actor_fingerprint IS NULL OR p_actor_fingerprint !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'Administrador no autenticado';
 END IF;
 SELECT * INTO v_draw FROM public.campaign_daily_draws WHERE id=p_draw_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Jornada desconocida'; END IF;
 IF v_draw.status NOT IN ('scheduled','result_pending') OR v_draw.official_result IS NOT NULL THEN
   RAISE EXCEPTION 'Resultado ya procesado o jornada no programada';
 END IF;
 IF v_draw.cutoff_at IS NULL OR v_draw.scheduled_at IS NULL
  OR v_draw.cutoff_at>v_draw.scheduled_at OR clock_timestamp()<v_draw.scheduled_at THEN
   RAISE EXCEPTION 'No puede finalizarse antes del sorteo oficial';
 END IF;
 SELECT * INTO v_campaign FROM public.rifas WHERE id=v_draw.campaign_id FOR UPDATE;
 IF v_campaign.draw_provider<>'loteria_sinuano_noche'
   OR v_campaign.draw_mode<>'loteria_4_pleno'
   OR v_campaign.status<>'active' OR v_campaign.is_public IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Campaña inactiva o modalidad diferente';
 END IF;
 SELECT * INTO v_auth FROM public.daily_draw_campaign_authorizations
 WHERE campaign_id=v_draw.campaign_id FOR UPDATE;
 IF v_auth.approval_status<>'approved' OR v_auth.regulatory_clearance IS DISTINCT FROM true
  OR v_auth.payment_provider_clearance IS DISTINCT FROM true OR v_auth.approved_at IS NULL
  OR v_auth.revoked_at IS NOT NULL THEN
  RAISE EXCEPTION 'Falta autorización excepcional completa';
 END IF;
 -- Full, provider-approved, traceable payments only. Require the ticket
 -- was activated AFTER confirmed payment but BEFORE the draw cutoff.
 WITH eligible AS MATERIALIZED (
  SELECT t.id, t.combination
  FROM public.campaign_daily_ticket_activations a
  JOIN public.tickets t ON t.id=a.ticket_id AND t.rifa_id=v_draw.campaign_id
    AND t.order_id=a.order_id AND t.status='active'
  JOIN public.orders o ON o.id=t.order_id AND o.rifa_id=v_draw.campaign_id
    AND o.payment_status='paid' AND o.subtotal>0 AND o.total_paid>=o.subtotal
    AND coalesce(o.balance_due,0)=0
  JOIN public.payments p ON p.id=a.approved_payment_id AND p.order_id=o.id
    AND p.provider='wompi' AND p.status='approved'
    AND nullif(btrim(p.provider_transaction_id),'') IS NOT NULL
  WHERE a.campaign_id=v_draw.campaign_id
    AND a.payment_confirmation_at<=a.activated_at
    AND a.activated_at<=v_draw.cutoff_at
    AND (a.revoked_at IS NULL OR a.revoked_at>v_draw.cutoff_at)
    AND p.updated_at<=a.activated_at
    AND (SELECT coalesce(sum(approved.amount),0) FROM public.payments approved
        WHERE approved.order_id=o.id AND approved.provider='wompi'
          AND approved.status='approved' AND nullif(btrim(approved.provider_transaction_id),'') IS NOT NULL
          AND approved.updated_at<=a.payment_confirmation_at
          AND approved.updated_at<=a.activated_at) >=o.subtotal
 ), counters AS (
  SELECT count(*)::integer AS n,
    count(*) FILTER(WHERE combination=p_result)::integer AS matching_count,
    min(id::text) FILTER(WHERE combination=p_result)::uuid AS match_id,
    encode(sha256(convert_to(coalesce(string_agg(id::text||':'||combination,',' ORDER BY id::text),''),'UTF8')),'hex') AS digest
  FROM eligible
 )
 SELECT n,matching_count,match_id,digest INTO v_eligible,v_result_count,v_winner,v_digest FROM counters;
 IF v_result_count>1 THEN RAISE EXCEPTION 'Más de un ganador; detener procesamiento'; END IF;
 IF v_result_count=0 THEN v_winner:=NULL; END IF;
 UPDATE public.campaign_daily_draws SET status='completed', official_result=p_result,
   official_result_reference=btrim(p_official_reference),
   result_verified_at=clock_timestamp(),result_admin_fingerprint=p_actor_fingerprint,
   winner_ticket_id=v_winner,eligibility_digest=v_digest,
   eligible_ticket_count=v_eligible,
   outcome=CASE WHEN v_winner IS NULL THEN 'no_winner' ELSE 'winner' END
 WHERE id=p_draw_id;
 IF v_winner IS NOT NULL THEN
   INSERT INTO public.campaign_daily_awards(draw_id,ticket_id)
   VALUES(p_draw_id,v_winner);
 END IF;
 INSERT INTO public.campaign_daily_audit(campaign_id,draw_id,event_kind,actor_fingerprint,details)
 VALUES(v_draw.campaign_id,p_draw_id,'result_recorded',p_actor_fingerprint,
   jsonb_build_object('official_result',p_result,'reference',p_official_reference,
      'eligible_count',v_eligible,'outcome',CASE WHEN v_winner IS NULL THEN 'no_winner' ELSE 'winner' END,
      'eligibility_digest',v_digest));
 RETURN QUERY SELECT CASE WHEN v_winner IS NULL THEN 'no_winner' ELSE 'winner' END, v_winner, v_eligible;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_daily_draw_record_result_atomic(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_draw_record_result_atomic(uuid,text,text,text) TO service_role;
COMMIT;
