DO $tests$
DECLARE r boolean:=false; p boolean:=false; a boolean:=false;
BEGIN
 BEGIN
  UPDATE public.daily_draw_campaign_authorizations SET regulatory_clearance=true
  WHERE campaign_id='11111111-1111-4111-8111-111111111111';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%Documentación regulatoria no verificada%' THEN r:=true; ELSE RAISE; END IF;
 END;
 BEGIN
  UPDATE public.daily_draw_campaign_authorizations SET payment_provider_clearance=true
  WHERE campaign_id='11111111-1111-4111-8111-111111111111';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%Autorización Wompi no verificada%' THEN p:=true; ELSE RAISE; END IF;
 END;
 BEGIN
  UPDATE public.daily_draw_campaign_authorizations SET approval_status='approved'
  WHERE campaign_id='11111111-1111-4111-8111-111111111111';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%sin doble desbloqueo documental%' THEN a:=true; ELSE RAISE; END IF;
 END;
 IF NOT (r AND p AND a) THEN
  RAISE EXCEPTION 'One or more documentary review gates were bypassed';
 END IF;
 IF (SELECT approval_status FROM public.daily_draw_campaign_authorizations
     WHERE campaign_id='11111111-1111-4111-8111-111111111111')<>'pending'
 OR (SELECT regulatory_clearance OR payment_provider_clearance FROM public.daily_draw_campaign_authorizations
     WHERE campaign_id='11111111-1111-4111-8111-111111111111') THEN
  RAISE EXCEPTION 'Exceptional campaign approvals changed while blocked';
 END IF;
 -- Traditional organizers have no additional restriction.
 UPDATE public.daily_draw_campaign_authorizations SET regulatory_clearance=true
 WHERE campaign_id='22222222-2222-4222-8222-222222222222';
 IF NOT (SELECT regulatory_clearance FROM public.daily_draw_campaign_authorizations
     WHERE campaign_id='22222222-2222-4222-8222-222222222222') THEN
  RAISE EXCEPTION 'Legacy campaign was modified by exceptional gate';
 END IF;
 IF has_table_privilege('anon','public.campaign_daily_documentary_controls','SELECT')
 OR has_table_privilege('authenticated','public.campaign_daily_documentary_controls','SELECT')
 OR has_table_privilege('service_role','public.campaign_daily_documentary_controls','UPDATE') THEN
  RAISE EXCEPTION 'Unprivileged actor gained approval control';
 END IF;
 RAISE NOTICE 'PASS: approval/clearance blocked without external review; legacy untouched; controls private';
END;
$tests$;
