-- Ephemeral DB; two different paid orders finalized concurrently by two psql processes.
INSERT INTO public.orders(id,rifa_id,payment_status,subtotal,total_paid,balance_due,qty,buyer_id,payment_mode)
VALUES
('10101010-1010-4010-8010-101010101010','11111111-1111-4111-8111-111111111111','created',12500,0,12500,5,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','full'),
('20202020-2020-4020-8020-202020202020','11111111-1111-4111-8111-111111111111','created',12500,0,12500,5,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','full');
INSERT INTO public.payments(id,order_id,provider,status,provider_transaction_id,amount)
VALUES
('30303030-3030-4030-8030-303030303030','10101010-1010-4010-8010-101010101010','wompi','approved','sandbox_concurrent_A_1010',12500),
('40404040-4040-4040-8040-404040404040','20202020-2020-4020-8020-202020202020','wompi','approved','sandbox_concurrent_B_2020',12500);

SELECT * FROM public.system_daily_record_verified_wompi_event(
 '30303030-3030-4030-8030-303030303030',
 'sandbox_concurrent_A_1010','APPROVED',repeat('b',64),'test',1792300100);
SELECT * FROM public.system_daily_record_verified_wompi_event(
 '40404040-4040-4040-8040-404040404040',
 'sandbox_concurrent_B_2020','APPROVED',repeat('c',64),'test',1792300101);
