# CampaClick — estado vigente de Sinuano Noche (17-10-2026 Colombia, 18-10 UTC)

## Regla de aislamiento
- GitHub: `jalc107-arch/promoclaras-v2`; rama de trabajo `feature/sinuano-admin-staging-20261017`. **No fusionar con main sin autorización explícita**. main verificado antes de estas pruebas: `b87af4590ab80afc12287150f4a9d03cdd3b95e0`.
- CampaClick producción en Supabase `vrmctjgxvjyxepaefxzu`: ACTIVE_HEALTHY, sin cambios en base ni pagos.
- FuerzaMarket Supabase `suponlvqoouzmmxbgcxf`: INACTIVE por solicitud explícita del usuario. **NO REACTIVAR**.
- Staging Supabase `xooxbkawxrdvlvbvkvjy`: ACTIVE_HEALTHY. Railway staging servicio `09341e73-16df-48cd-8df6-db6eee60b227`: online.
- Wompi únicamente SANDBOX en staging, sin pagos externos durante las pruebas descritas.
- No existen pruebas documentales completas de autorización regulatoria ni aprobación específica del procesador de pagos. Mantener `IS_DAILY_COMMERCIALLY_ENABLED=false`.

## Campaña interna en staging
- Slug: `prueba-interna-sinuano-noche-2500-4-cifras`. Valor código $2.500 COP, mínimo cinco por orden, resultados de cuatro cifras `0000`–`9999`.
- 31 sorteos en borrador del 1 al 31 diciembre 2026, solo el 31 marcado premio mayor. Premios 1–30 y alternativa definitiva del 31 aún sin concretar.
- Campaña PRIVATE/PENDING, aprobación excepcional PENDING, verificaciones regulatoria y Wompi FALSE. Cero órdenes, códigos, activaciones, adjudicaciones y resultados definitivos tras transacciones de prueba reversibles.

## Migraciones aplicadas en staging, registradas en Supabase
1. `20261018000035` `staging_daily_draws_admin_guard_20261017`; `20261018000050` fixture de calendario.
2. `20261018013304` `staging_daily_activation_guard_20261017`; `20261018013306` `staging_daily_result_atomic_20261017`.
3. `20261018013344` `staging_daily_activation_guard_hardened_20261017`: revocaciones inmutables con auditoría.
4. `20261018013541` `staging_daily_result_atomic_hardened_20261017`: premios definitivos y códigos elegibles válidos sin duplicados.
5. `20261018021632` `staging_daily_missing_activation_fail_closed_20261017`: pago completo sin códigos o activaciones bloquea resultado, incluso ante resultado sin ganador.

Los archivos de migración en GitHub son las fuentes para nuevas instalaciones. **Estas migraciones ya están aplicadas en staging, no ejecutarlas otra vez allí**. El archivo de conciliación comprueba que no esté instalada, y se detiene si ya existe. Revalidar siempre historial y esquema antes de migrar.

## Evidencia técnica de pruebas SQL realizadas con datos ficticios y ROLLBACK
- Rechazados: pago parcial, pago aprobado insuficiente, fecha de activación retroactiva, activación duplicada, actualización indebida/reversión de revocación, aprobación sin autorización, resultado anticipado.
- Aprobados: activación por pago completo; auditoría de activación y revocación; dos sorteos independientes (ganador y sin ganador); mismo código válido para sorteo posterior; doble resultado bloqueado.
- Nueva conciliación: pago íntegro con menos códigos que `orders.qty` bloqueado; pago íntegro con códigos sin activación bloqueado; cinco códigos íntegros activados permiten ganador único; ninguna jornada finalizó de forma persistente al concluir pruebas.
- Resultados SQL reales de staging, **no equivalentes a pruebas webhook Wompi ni a test E2E externo**.

## Pendientes antes de producción
- Conectar transacción autenticada de Wompi Sandbox a activación y asignación automática en backend (sin selección manual).
- Sustituir `payments.updated_at` como prueba cronológica por eventos verificables e inmutables; idempotencia transaccional en DB para procesos paralelos e incidencias `VOIDED`.
- Identidad nominativa administrativa para decisiones sensibles; verificación oficial del resultado y documentos regulatorios de modalidad diaria.
- Completar pruebas HTTP autenticadas, CSRF, concurrencia, 31 jornadas consecutivas y regresión de campañas tradicionales.
- GitHub Actions de esta rama ejecuta pruebas de código sin secretos; **un resultado CI exitoso no autoriza ventas**.
- No cambiar Wompi de producción ni fusionar main sin autorización del usuario.

## Pruebas de regresión adicionales — 17 oct 2026
- La simulación transaccional reprodujo un fallo: pago Wompi ficticio revocado/fallido tras crear activaciones; la función de adjudicación podía devolver `no_winner` sin exigir conciliación.
- Se incorporó la migración aditiva `20261018_staging_daily_reversal_reconciliation_guard.sql` para bloquear resultados diarios mientras existan activaciones pre-corte con pago revertido o códigos de una orden marcada pagada cuyo importe vigente ya no concilia.
- Esta comprobación es defensiva, **no demuestra el evento de pago inmutable**; mantener bloqueo comercial, prohibición de aprobación automática y no declarar apta la modalidad sin pruebas del webhook real Sandbox y de concurrencia.
- No tocar el motor de campañas tradicionales. FuerzaMarket debe seguir INACTIVE.
