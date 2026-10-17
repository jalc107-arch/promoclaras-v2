# CampaClick — desarrollo aislado Sinuano Noche (17-10-2026)

## Estado REAL
- **NO DESPLEGADO NI FUSIONADO:** el navegador de GitHub no consiguió pegar archivos con exactitud y los permisos de escritura del conector GitHub devolvieron 403. La rama `feature/sinuano-admin-staging-20261017` existe pero debe verificarse antes de cualquier subida. `main`/Railway producción siguen intactos.
- FuerzaMarket `ACTIVE_HEALTHY`, staging Supabase `INACTIVE`, CampaClick producción `ACTIVE_HEALTHY` (última verificación).
- En staging ya hay una campaña de prueba PRIVADA y PENDIENTE de $2.500, cuatro cifras, cero órdenes/pagos, autorización especial PENDIENTE y verificaciones regulatoria/Wompi en FALSE.
- Los archivos en este paquete se prepararon y probaron LOCALMENTE; **no constituyen una integración E2E de pagos ni múltiples sorteos operativos**.

## Qué implementa este paquete (staging exclusivamente)
1. `index.js`: importa controles de seguridad y panel de expedientes, registrando middleware ANTES de cualquier ruta de compra, crédito, publicación o aprobación administrativa.
2. `services/sinuanoAccess.mjs`: toda operación comercial sobre `loteria_sinuano_noche` queda bloqueada en servidor, incluso si estado active/public; activación comercial por defecto false.
3. `services/dailyDrawAdmin.mjs`: consultas privadas de expedientes y decisiones administrativas con validación de sesión, CSRF global y RPC transaccional. La aprobación del expediente NO activa venta.
4. `services/dailyDrawRules.cjs`: simulación pura de fecha, resultado de cuatro cifras, ganador o sin ganador y elegibilidad condicionada a pago verificado e íntegro.
5. `migrations/20261017_staging_daily_draws_admin_guard.sql`: tablas de calendario/resultados/elegibilidad/auditoría y decisión administrativa atómica, SOLO staging.
6. `migrations/20261017_staging_daily_calendar_fixture.sql`: 31 borradores del 1 al 31 diciembre de 2026, con el 31 exclusivamente premio mayor; premios y horarios por definir, ningún resultado real, no publicados.
7. `scripts/05_wompi_preflight.mjs`: exige claves de prueba `pub_test_`/`prv_test_`, Supabase staging y URL staging sin exponer secretos.
8. `test/*.mjs`, `test/*.cjs`: pruebas en memoria. Se ejecutan con `node --test test/*.mjs test/*.cjs`.

## Bloqueos importantes
- NO aplicar SQL a producción ni tocar datos históricos.
- NO habilitar Wompi real ni permitir ventas de campaña diaria sin autorización de autoridad competente y aceptación del procesador de pagos. Falta comprobar variables ocultas de Railway staging.
- El 31 es el único premio de esa fecha. Valor o elección entre $12.500.000 y dos motos no fue formalizada.
- Son **31 borradores**; sin horarios reales de cierre, calendario oficial verificado ni fuente de resultados, por seguridad no pueden publicarse.
- Falta integrar activación automática con webhook Wompi y asignación de códigos (las rutas legadas de lotería admiten selección manual), y carga oficial diaria validada.
- El usuario acordó pausar FuerzaMarket SOLO en una ventana controlada; está restaurado y NO DEBE PAUSARSE hasta completar código, permisos GitHub y pruebas locales.
- La aprobación administrativa de esta fase se atribuye a huella de sesión y no a cuenta de administrador nominativa; antes de producción exigir identidad administrativa individual y trazabilidad reforzada.
- Los permisos GitHub 403 y la edición web con formateo involuntario impiden subir/desplegar automáticamente los archivos ahora. No dar por terminado hasta subida, revisión PR, staging funcional, prueba sandbox y rollback.

## Comprobaciones antes de un futuro despliegue
1. Actualizar rama desde `main` si evolucionó, no reemplazar avances nuevos.
2. Confirmar diferencias aisladas respecto a main y reproducir `node --check index.js` y test Node.
3. Aplicar las migraciones SOLO en Supabase staging, verificar columnas/PK/RLS y RPC; fixture calendario pendiente/privado.
4. Confirmar las variables de Wompi Sandbox en Railway staging SIN revelarlas.
5. Probar rutas protegidas con cliente HTTP autenticado, CSRF, acceso no admin, doble click de aprobación, revocación, pago parcial y webhook duplicado.
6. Mantener Wompi PROD, campañas antiguas y resultados legado sin cambios.
7. Dejar staging inactivo y FuerzaMarket `ACTIVE_HEALTHY` al concluir.
