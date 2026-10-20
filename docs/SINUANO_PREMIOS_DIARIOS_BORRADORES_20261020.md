# CampaClick · Premios diarios configurables, exclusivamente staging

## Aclaración de producto
Para cualquier mes elegido se genera un calendario hipotético de 28/29/30/31 jornadas. Los días **anteriores al último día** pueden tener cada uno un premio independiente en dinero o especie. **El último día queda reservado únicamente al premio mayor**, elegible por separado en dinero O especie, nunca ambos.

## Implementación en laboratorio
- `services/dailyDayPrizeAdmin.mjs`: un administrador puede proponer un premio por día o aplicarlo a un rango de días, ver la última revisión por fecha y consultar el presupuesto estimado.
- `campaign_daily_day_prize_drafts`: historial append-only por jornada con versión incremental, control de solicitudes repetidas y trazabilidad.
- `admin_daily_save_day_prize_drafts`: PostgreSQL bloquea la campaña antes de crear todas las propuestas del rango en una única transacción. Rechaza día final, fechas de otro mes, campañas tradicionales, revisión mensual obsoleta, ausencia de autorización administrativa, premios mezclados y ventas habilitadas.
- El presupuesto separa premios en dinero, **costos estimados de bienes** y bienes cuyo costo se desconoce. No presenta cifras incompletas como costo total real.
- Cada edición equivale a nueva revisión, sin borrar el historial ni modificar las tablas reales de resultados, premios aprobados, órdenes o pagos.

## Aprobaciones y alcance
Las propuestas siguen siendo borradores privados. Ningún cambio altera `main`, CampaClick producción o FuerzaMarket. No se levantan los interruptores de venta ni los controles regulatorios. La posibilidad de entregar premios en efectivo y realizar 31 fechas sigue sujeta al análisis jurídico y al criterio de las autoridades pertinentes; los borradores no son autorizaciones.
