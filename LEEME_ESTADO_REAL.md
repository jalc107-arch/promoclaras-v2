# CampaClick — fuente de verdad vigente: Sinuano Noche

**Revisión técnica: 18 de octubre de 2026.** Fuente única para continuar trabajos de la modalidad excepcional sin resucitar estados o commits antiguos.

**La regla de programación excepcional vigente**: cada campaña hipotética tiene una cantidad de jornadas igual al número de días del **mes y año seleccionados** (28/29/30/31); días previos al último: un premio diario por fecha; último día: **un solo premio mayor**, seleccionado posteriormente **en dinero O en especie, nunca ambos**. Los premios siguen en borrador y la elección final todavía NO se ha realizado. Esta decisión sustituye la interpretación antigua que fijaba siempre 31 jornadas de diciembre. La campaña de diciembre de 2026 permanece únicamente como fixture de staging. Véase [regla mensual](docs/SINUANO_REGLA_MENSUAL_PREMIO_UNICO_20261018.md).

## BLOQUEO REGULATORIO Y COMERCIAL — NO LEVANTAR
La modalidad propuesta contempla códigos vendidos a $2.500 COP (compra mínima cinco), 31 jornadas durante diciembre de 2026, resultados de cuatro cifras 0000–9999, premio diario aún no definido, un premio mayor propuesto al día 31 ($12.500.000 COP **o** dos motocicletas, decisión pendiente), y una regla «sin ganador» que está sometida a revisión jurídica.

El Decreto 1486 de 2024, la regulación de rifas y la clasificación de juegos promocionales presentan objeciones sustantivas a 31 fechas, premios en efectivo y cobros directos. **No declarar autorizable ni comerciable este diseño sin pronunciamiento jurídico y regulatorio específico y aceptación escrita de Wompi.** Véanse [bloqueo normativo](docs/SINUANO_BLOQUEO_REGULATORIO_20261018.md) y [consulta formal preparada, no radicada](docs/SINUANO_CONSULTA_FORMAL_COLJUEGOS_20261018.md). El nombre comercial «campaña» no elimina restricciones legales.

Ambas puertas de comercialización siguen **DESACTIVADAS**: `IS_DAILY_COMMERCIALLY_ENABLED=false` en `services/sinuanoAccess.mjs` y `public.campaign_daily_commerce_controls.sales_enabled=false` en Supabase staging. El expediente está `pending`, privado, sin registros regulatorios o Wompi aprobados, sin compras.

## Repositorio y ambientes confirmados
- Desarrollo GitHub: `jalc107-arch/promoclaras-v2`, rama `feature/sinuano-admin-staging-20261017`.
- Commit de aplicación **desplegado** en Railway staging: `5f11e0121f02fdb4e0120a9d2e4bef8dc84b01c9`. Deployment `edc2a6e3-bcbe-4256-a99e-8563a82b2a2e`, resultado `SUCCESS`, servicio online (verificación 18-oct-2026). Actualizar esta referencia si se despliega otro commit; un commit solo documental puede dejar HEAD más reciente que el desplegado.
- Supabase staging `xooxbkawxrdvlvbvkvjy` ACTIVE_HEALTHY.
- Supabase CampaClick producción `vrmctjgxvjyxepaefxzu` ACTIVE_HEALTHY, **sin modificar**.
- Supabase FuerzaMarket `suponlvqoouzmmxbgcxf` **INACTIVE** por instrucción expresa. **NO ACTIVAR**.
- Rama producción `main` seguía en `b87af4590ab80afc12287150f4a9d03cdd3b95e0`, sin fusión. No tocar producción ni fusionar sin autorización expresa.

## Estructura técnica disponible en STAGING, no en explotación real
1. Campaña excepcional ficticia `prueba-interna-sinuano-noche-2500-4-cifras`, 31 jornadas independientes del 1 al 31 de diciembre 2026, todas `draft`, solamente día 31 señalado como premio mayor. Premios y horarios oficiales aún por definir.
2. Motor aislado de combinaciones de cuatro cifras; asignación automática únicamente tras pago completo; comprobación de saldos, conciliación del evento de Wompi, cronología e idempotencia.
3. Historial append-only de eventos de pago verificados y revocaciones atómicas de `VOIDED`, auditoría, resultados diarios independientes y comprobación de no adjudicar sin activación elegible.
4. **Centro administrativo de preparación** `/admin/sorteos-diarios/:campaignId/preparacion`, accesible solo a sesión administrador bajo CSRF: checklist de once requisitos y notas, registro de alternativas de premios en borrador y auditoría. La base usa `campaign_daily_preflight_notes` y `campaign_daily_prize_proposals`. Dos alternativas no aprobadas del día 31 están cargadas; no modifican `campaign_daily_draws`.
5. **Candado documental adicional**: `campaign_daily_documentary_controls` con ambos valores `regulatory_review_unlocked=false` y `processor_review_unlocked=false`. Trigger `trg_daily_documentary_approval` rechaza aprobación basada únicamente en una referencia escrita; la tabla no concede escritura al rol `service_role`. Las opciones de aprobación del panel están deshabilitadas, y los POST directos se rechazan.
6. Todas las migraciones de preparación y bloqueo documental están aplicadas **solo** a staging: `20261018113140_staging_daily_preparation_only_20261018` y `20261018113702_staging_daily_documentary_approval_guard_20261018`. No repetirlas allí sin inventario previo.

## Pruebas más recientes
- GitHub Actions [39123894303](https://github.com/jalc107-arch/promoclaras-v2/actions/runs/39123894303): **136 pruebas locales aprobadas (0 fallos)** y batería PostgreSQL 17 independiente, incluida validación de no aprobación sin evidencia documental externa.
- Railway staging: servicio online, `/health` saludable, listado de campañas tradicionales visible, ruta de compra Sinuano retorna `403` y nueva ruta de preparación exige login.
- Base staging comprobada tras migraciones: 31 jornadas `draft`, dos propuestas del premio mayor, cero órdenes y cero activaciones, habilitación comercial `false`, ambos candados documentales `false`.
- **No** se ha demostrado una venta real end-to-end Wompi Sandbox de esta modalidad; se mantienen bloqueados pagos reales y premios.

## Pendiente para autorización futura
Pronunciamiento regulatorio, modalidad autorizable y jurisdicción, aceptación expresa de Wompi, derechos de uso de resultados, reglas de premio no adjudicado, plan de premios definitivo, impuestos/garantías, horarios oficiales, pruebas externas verificables y revisión final de seguridad. Cualquier sustitución de diseño debe documentarse y contar con decisión expresa.

**No reactivar FuerzaMarket, no alterar CampaClick producción, no levantar barreras de seguridad por pruebas ficticias y no fusionar con `main`.**

## Actualización técnica 20 de octubre de 2026 — premios diarios

- Se recuperó y comprobó escritura directa del conector de GitHub en la cuenta `jalc107-arch` (permiso admin/push).
- Se agregó el editor privado de premios diarios `services/dailyDayPrizeAdmin.mjs` para una jornada o rango del mes, con tipos excluyentes dinero/especie y presupuestos estimados. Mantiene el último día reservado al único premio mayor configurado por separado.
- Tabla append-only `public.campaign_daily_day_prize_drafts`, SQL `admin_daily_save_day_prize_drafts`, revocación de escritura pública, bloqueo de campaña pendiente sin permisos/ventas, historial de revisiones, idempotencia por `request_id` y auditoría. Migración `staging_daily_day_prize_drafts_20261020` aplicada **exclusivamente** a Supabase staging `xooxbkawxrdvlvbvkvjy`.
- GitHub Actions `39469163033`: **162/162 pruebas Node aprobadas**, más pruebas SQL PostgreSQL 17, incluidas rango, revisiones solapadas, duplicados, jornada mayor protegida y campaña tradicional.
- Commit de código validado: `a1a0dfd6f9d102a5eb0d61c0069dcc8c1b9f5d8c`. Railway staging recibió y confirmó un cambio de **configuración de fuente** apuntando a este SHA; **no se ha podido confirmar aún un nuevo deployment de ese commit**. El último deployment visible sigue `edc2a6e3-bcbe-4256-a99e-8563a82b2a2e` (commit `5f11e0121f02fdb4e0120a9d2e4bef8dc84b01c9`). **No afirmar que el editor diario está activo vía web hasta validar despliegue y prueba HTTP.**
- Último estado de staging de la campaña: enero 2027 con una revisión mensual, cero premios diarios guardados, cero órdenes y activaciones; doble bloqueo de ventas vigente. FuerzaMarket `INACTIVE`, producción y `main` sin modificación.
