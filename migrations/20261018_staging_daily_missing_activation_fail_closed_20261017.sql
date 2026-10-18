-- STAGING ONLY, NEVER production. Already installed in staging as
-- 20261018021632_staging_daily_missing_activation_fail_closed_20261017.
-- Re-run only for a brand-new staging database, AFTER result_atomic.sql.
-- Blocks premature no_winner when an order was fully paid before cutoff but
-- tickets or activation records are missing. No Wompi/legacy modification.
DO $migration$
DECLARE
 v_original text;
 v_anchor text := ' WITH eligible AS MATERIALIZED (';
 v_guard text := $gate$
 IF EXISTS (
   SELECT 1
   FROM public.orders o
   WHERE o.rifa_id=v_draw.campaign_id
     AND o.payment_status='paid'
     AND o.subtotal>0 AND o.total_paid>=o.subtotal
     AND coalesce(o.balance_due,0)=0
     AND (SELECT coalesce(sum(p.amount),0)
          FROM public.payments p
          WHERE p.order_id=o.id
            AND p.provider='wompi' AND p.status='approved'
            AND nullif(btrim(p.provider_transaction_id),'') IS NOT NULL
            AND p.updated_at<=v_draw.cutoff_at) >= o.subtotal
     AND (
       (SELECT count(*) FROM public.tickets t
        WHERE t.order_id=o.id AND t.rifa_id=v_draw.campaign_id
          AND t.status='active' AND t.created_at<=v_draw.cutoff_at) <> o.qty
       OR EXISTS (
         SELECT 1 FROM public.tickets t
         WHERE t.order_id=o.id AND t.rifa_id=v_draw.campaign_id
           AND t.status='active' AND t.created_at<=v_draw.cutoff_at
           AND NOT EXISTS (
             SELECT 1 FROM public.campaign_daily_ticket_activations a
             WHERE a.ticket_id=t.id AND a.campaign_id=v_draw.campaign_id
               AND a.order_id=o.id
           )
       )
     )
 ) THEN
   RAISE EXCEPTION 'Conciliación diaria pendiente: pago íntegro con códigos faltantes o sin activación';
 END IF;
 WITH eligible AS MATERIALIZED ($gate$;
BEGIN
 SELECT pg_get_functiondef('public.admin_daily_draw_record_result_atomic(uuid,text,text,text)'::regprocedure)
 INTO v_original;
 IF v_original IS NULL OR strpos(v_original,v_anchor)=0 THEN
   RAISE EXCEPTION 'Función inexistente o ancla no encontrada';
 END IF;
 IF strpos(substr(v_original,strpos(v_original,v_anchor)+length(v_anchor)),v_anchor)>0 THEN
   RAISE EXCEPTION 'Ancla duplicada: detener migración';
 END IF;
 IF strpos(v_original,'Conciliación diaria pendiente:')>0 THEN
   RAISE EXCEPTION 'La comprobación ya estaba instalada';
 END IF;
 EXECUTE replace(v_original,v_anchor,v_guard);
END $migration$;
REVOKE ALL ON FUNCTION public.admin_daily_draw_record_result_atomic(uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_draw_record_result_atomic(uuid,text,text,text)
  TO service_role;
