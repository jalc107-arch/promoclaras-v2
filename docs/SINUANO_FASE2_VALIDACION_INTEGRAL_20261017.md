# CampaClick — Informe técnico verificable, Sinuano Noche fase 2
Fecha de trabajo: 17-oct-2026 (Colombia) / 18-oct-2026 (UTC).

## Estado de los entornos
- Rama exclusivamente de desarrollo: `feature/sinuano-admin-staging-20261017`, versión funcional auditada `d4c759b489f922c77a0f8df027f81eebaf730a49`.
- Railway staging, proyecto `20359f4f-9849-41d5-b975-c7a36a03e87d`, servicio `09341e73-16df-48cd-8df6-db6eee60b227`; despliegue `23d33641-fc3d-4c14-81ab-6b49e9d9e871` **SUCCESS, ONLINE**.
- Supabase staging `xooxbkawxrdvlvbvkvjy`: ACTIVE_HEALTHY; solo se aplicaron migraciones de desarrollo. Producción `vrmctjgxvjyxepaefxzu` saludable e intacta.
- **FuerzaMarket `suponlvqoouzmmxbgcxf`: INACTIVE. NO ACTIVAR SIN NUEVA ORDEN.**
- **Prohibido fusionar con `main`** sin autorización expresa. Referencia de producción auditada: `b87af4590ab80afc12287150f4a9d03cdd3b95e0`.

## Campaña ficticia
- `prueba-interna-sinuano-noche-2500-4-cifras`; precio $2.500 COP, mínimo cinco códigos, combinaciones `0000`–`9999` automáticas después de pago completo.
- 31 sorteos diarios (1–31 diciembre 2026), uno por fecha, solo el 31 premio mayor. Permanece pendiente decidir premios 1–30 y la alternativa final (12.500.000 COP o dos motocicletas).
- En staging: campaña privada y pendiente, cero órdenes, tickets, activaciones o adjudicaciones creadas por las pruebas. Regulación y procesador de pagos siguen sin aprobación documental.
- Bloqueos simultáneos: `IS_DAILY_COMMERCIALLY_ENABLED=false` en código Y `public.campaign_daily_commerce_controls.sales_enabled=false` en PostgreSQL.

## Pruebas verificadas
### GitHub Actions
- Ejecución `39094591813`: **113 pruebas unitarias/estáticas PASSED**, ninguna omitida ni fallida, sintaxis de Node validada.
- PostgreSQL 17 efímero: migraciones reales instaladas en bases aisladas, sin credenciales ni compradores reales.
- Reconciliación: pago válido; pago revertido; orden `paid` sin saldo vigente; bloqueo de adjudicación irregular; separación de campañas ordinarias.
- 31 jornadas procesadas (simulación): **16 resultados `winner`, 15 `no_winner`, 16 adjudicaciones y 31 eventos de auditoría**; la campaña permanece abierta; reprocesamiento rechazado.
- Asignación atómica: pago íntegro ficticio de cinco códigos, cinco activaciones y cinco auditorías. Un segundo evento idéntico NO duplica códigos o activaciones.
- Dos órdenes concurrentes más la primera, **15 combinaciones únicas, 15 activaciones, 15 eventos de auditoría**, tres órdenes completas.
- Se validó que el interruptor de ventas PostgreSQL deshabilita la operación por defecto. Solo el laboratorio efímero lo habilitó temporalmente para probar el camino autorizado.
- Evidencia pública: https://github.com/jalc107-arch/promoclaras-v2/actions/runs/39094591813

### Staging real
- Migraciones `staging_daily_activation_guard_hardened_20261017`, `staging_daily_result_atomic_hardened_20261017`, `staging_daily_missing_activation_fail_closed_20261017`, `staging_daily_reversal_reconciliation_guard_20261017`, `staging_daily_atomic_full_payment_activation_20261017`, `staging_daily_commerce_gate_disabled_20261017` aplicadas a staging.
- Las funciones de pago/resultado son `SECURITY DEFINER`, revocadas a `anon` y `authenticated`, solo ejecutables por `service_role`.
- HTTP staging: `/health` respondió saludable; `/campanas` lista campañas tradicionales; Sinuano `/comprar` devolvió 403; ruta administrativa pide login.
- Preflight Railway: Wompi public/private test keys e integridad/eventos configurados en entorno staging, sin exponer valores.
- **Ninguna venta real, pago real, envío de premios o anuncio de ganador** se produjo durante las pruebas.

## Pendientes bloqueantes
1. **No hay prueba de compra real en Wompi Sandbox para Sinuano Noche** mientras los dos interruptores comerciales permanecen apagados. Esto es deliberado.
2. `payments.updated_at` todavía representa un campo modificable; no reemplaza un registro inmutable de aprobación Wompi. Incorporar ledger verificable de eventos/estado y prueba de reintentos de webhooks en múltiples instancias.
3. Reversos Wompi en la ruta heredada actual liberan códigos sin revocar automáticamente las activaciones diarias. El trigger de conciliación suspende prudentemente el resultado, pero se necesita un flujo **atómico de reversión y revocación** especial para evitar el bloqueo hasta intervención manual.
4. Verificación documental formal de la autoridad competente y autorización del procesador para sorteos diarios, además de definir premios y calendarios oficiales.
5. La verificación del resultado debe contrastarse con una fuente oficial antes de registrar ganador. La ruta de resultados pública sigue deshabilitada.
6. Staging tuvo errores intermitentes `ENOTFOUND postgres.xooxbkawxrdvlvbvkvjy` durante la reactivación, aunque la última instancia está online. Continuar observando sesiones/reintentos.
7. Conservar las campañas tradicionales, cuotas, pagos y producción inalterados. No cambiar `main` ni activar FuerzaMarket sin permiso.

## Decisión
Se aprueba la **fase técnica de laboratorio y pruebas automatizadas** descrita, NO el paso a explotación comercial. Mantener ambos bloqueos de comercialización y `main` intactos hasta pruebas completas con Wompi Sandbox, permisos regulatorios y autorización expresa del titular.
