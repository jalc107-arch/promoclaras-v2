-- NOT DEPLOYED: to be applied to staging after reviewing the production index inventory.
-- Keep ticket_code globally unique per campaign for historical identity/audit.
-- Permit a released combination to be purchased again; the existing partial
-- unique index uq_tickets_rifa_combination_live protects active and reserved tickets.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tab ON tab.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tab.relnamespace
    WHERE ns.nspname = 'public'
      AND tab.relname = 'tickets'
      AND idx.relname = 'uq_tickets_rifa_combination_live'
      AND i.indisunique
      AND i.indisvalid
      AND i.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Required live-combination unique index absent or invalid; aborting';
  END IF;
END
$$;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS unique_rifa_combination;
-- Intentionally preserve tickets_rifa_ticket_code_unique and all ticket history.
COMMIT;
