# Hotfix preparado: pago aprobado sin códigos, 13 de noviembre de 2026

**Estado:** solo rama de corrección; no aplicado a staging ni producción.

## Evidencias
- Orden `0468cd94`, creada a las 10:00 COT. Pago de 20.000 COP aprobado en `payments` con ID de transacción, pero `orders.payment_status=created`, sin códigos activos ni registro de WhatsApp.
- El usuario aportó comprobante de débito 10:02 COT, referencia `M05242811`.
- Railway registró SQLSTATE 23505 al finalizar el webhook `assignTicketsToOrder` y errores por códigos previamente asignados.
- El primer `ticket_code` seleccionado por el algoritmo, `0016`, ya existe con estado `released`, por lo que su restricción única global lo rechaza.
- La combinación solicitada `327` aparece con estado `released`, pero el constraint global `unique_rifa_combination` también impide su nueva asignación.
- El índice parcial `uq_tickets_rifa_combination_live` existe en producción y protege combinaciones `active` y `reserved_installment`.

## Corrección limitada
1. Mantener `ticket_code` históricamente exclusivo. El algoritmo de asignación ahora consulta todos los estados para los identificadores.
2. Permitir reutilizar una combinación de tickets `released`, jamás una combinación activa o reservada.
3. SQL de migración separado y protegido: elimina solo la exclusividad histórica de combinaciones y mantiene índice único de combinaciones vivas y de identificadores históricos.
4. Firma, validación de valor/moneda, pagos, órdenes, resultados y cuotas NO se alteran en este parche.

## Precauciones / pendientes
- Ejecutar SQL primero en Supabase staging (aún no fue posible acceder) y verificar índices y reglas de recuperación.
- Probar por completo Wompi Sandbox: APPROVED, DECLINED, VOIDED, reintentos y webhook simultáneo, compras normales y cuotas.
- Verificar si campañas con `max_tickets` próximos al agotamiento necesitan separar el identificador de ticket de la capacidad vendible, antes del despliegue.
- Verificar transacción del comprador directamente en Wompi y comprobar que no fue anulada/reembolsada.
- Reconciliar únicamente la orden afectada mediante una operación idempotente; no marcar paid ni enviar WhatsApp sin tickets activos confirmados.
- No aplicar cambios en producción ni activar/desactivar campañas sin autorización expresa.
