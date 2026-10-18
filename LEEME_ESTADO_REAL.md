# CampaClick — fuente de verdad actual: Sinuano Noche, 17 octubre 2026

> **BLOQUEO REGULATORIO CRÍTICO (verificado 18-oct-2026):** el Decreto colombiano 1486 de 2024, art. 2 (sustituye art. 2.7.3.2 del Decreto 1068 de 2015), prohíbe los premios en dinero para la modalidad rifa y califica como permanente la operación en más de dos fechas al mes. Según Coljuegos, un juego promocional no exige pago directo por participar. Una campaña de 31 sorteos, códigos pagados y premios en efectivo NO debe declararse autorizada por su nombre comercial ni por el éxito de las pruebas. Sin dictamen jurídico y autorizaciones verificables, PROHIBIDO levantar bloqueos o aceptar cobros. Detalle: [docs/SINUANO_BLOQUEO_REGULATORIO_20261018.md](docs/SINUANO_BLOQUEO_REGULATORIO_20261018.md).


**NO ACTIVAR FUERZAMARKET**: Supabase `suponlvqoouzmmxbgcxf` estaba `INACTIVE` en la última verificación. CampaClick producción `vrmctjgxvjyxepaefxzu` no debe modificarse. Rama `main` permanece en `b87af4590ab80afc12287150f4a9d03cdd3b95e0` (verificada en este ciclo).

Rama de desarrollo: `feature/sinuano-admin-staging-20261017`. Versión de aplicación en Railway staging: `d4c759b489f922c77a0f8df027f81eebaf730a49`, deployment `23d33641-fc3d-4c14-81ab-6b49e9d9e871` (SUCCESS). Supabase staging `xooxbkawxrdvlvbvkvjy`: ACTIVE_HEALTHY.

Campaña de prueba interna Sinuano Noche: $2.500 por código, mínimo 5, cuatro cifras `0000-9999`, 31 sorteos en diciembre 2026, un solo premio mayor el 31, premios definitivos pendientes. Campaña privada, autorizaciones regulatorias y Wompi pendientes, no habilitar ventas.

**Doble puerta cerrada**: `IS_DAILY_COMMERCIALLY_ENABLED=false` en `services/sinuanoAccess.mjs`, y `campaign_daily_commerce_controls.sales_enabled=false` en staging PostgreSQL. **No alterar estos valores sin documentos y autorización expresa**.

Migraciones instaladas exclusivamente en staging: auditoría y revocaciones, motor por jornada, conciliación de activaciones, bloqueo de resultados ante pago revertido, asignación/activación atómica tras pago completo, control comercial independiente en BD. Nuevas instalaciones deben aplicar todas las migraciones en orden; no repetir ciegamente las ya instaladas.

Laboratorio PostgreSQL 17 y GitHub Actions `39094591813`: **113/113 pruebas locales, pruebas SQL de 31 jornadas, pagos ficticios, 15 códigos simultáneos únicos y rechazos de reintentos/reversos**. Las pruebas HTTP posteriores al despliegue confirman salud y compra Sinuano bloqueada. Sin transacciones reales de Wompi.

**No listo para producción.** Pendiente: documentos regulatorios y autorización Wompi, premios, ledger de confirmaciones inmutables, reversión atómica de activaciones por `VOIDED`, pruebas integrales con Wompi Sandbox, verificación oficial de resultados, revisión final de seguridad y autorización expresa para fusionar `main`.

Detalle reproducible y evidencias: [docs/SINUANO_FASE2_VALIDACION_INTEGRAL_20261017.md](docs/SINUANO_FASE2_VALIDACION_INTEGRAL_20261017.md).
