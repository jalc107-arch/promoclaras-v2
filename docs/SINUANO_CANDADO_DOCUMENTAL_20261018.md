# Candado documental para la modalidad Sinuano Noche

La modalidad excepcional requiere concepto y autorización jurídica y aprobación escrita de Wompi. Una cadena de texto o referencia introducida por el administrador **no demuestra ninguna de esas condiciones**. Se añadió en staging una tabla de desbloqueo documental independiente y un trigger que rechaza cualquier transición a `regulatory_clearance=true`, `payment_provider_clearance=true` o `approval_status=approved` mientras el correspondiente desbloqueo siga en `false`.

Los desbloqueos están cerrados por defecto, sin permiso `UPDATE` para `service_role`, `anon` o `authenticated`. Su apertura futura requerirá decisión separada, controlada y documentada de mantenimiento DB, después de validar documentos auténticos. Las rutas del administrador también muestran estas acciones deshabilitadas y rechazan las solicitudes directas.

El centro de preparación `/admin/sorteos-diarios/:campaignId/preparacion` registra notas no verificadas y propuestas de premios, sin aprobar la campaña, programar sorteos, publicar resultados ni habilitar cobros. Este candado no toca campañas tradicionales ni el backend de producción. No reactivar FuerzaMarket.

Documento regulatorio: `docs/SINUANO_BLOQUEO_REGULATORIO_20261018.md`. No se debe declarar que el permiso existe.
