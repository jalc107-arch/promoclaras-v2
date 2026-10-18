# CampaClick — Sinuano Noche: bloqueo jurídico y comercial
Última revisión: 18 octubre 2026 (Colombia). Esta nota complementa la auditoría técnica de staging y tiene prioridad sobre propuestas anteriores de venta diaria.

## Hechos confirmados
1. La campaña ficticia Sinuano Noche planea vender códigos de $2.500 COP (mínimo cinco) con 31 resultados durante diciembre de 2026 y premios diarios en efectivo o bienes, especialmente $12.500.000 COP o dos motocicletas el 31. Los premios y la alternativa final **aún no son definitivos**.
2. El **Decreto 1486 de 2024**, artículo 2, modificó el artículo 2.7.3.2 del Decreto 1068 de 2015: califica como operación de rifas permanentes aquella realizada en **más de dos fechas al mes** y **prohíbe rifas con premios en dinero**. Fuente primaria: https://www.presidencia.gov.co/Documents/241213-Decreto-1486-del-13-de-diciembre-de-2024.pdf . Texto concordado: https://normograma.dian.gov.co/dian/compilacion/docs/decreto_1486_2024.htm .
3. **Coljuegos** señala que los juegos promocionales se caracterizan por no cobrar directamente al participante: https://www.coljuegos.gov.co/publicaciones/300635/promocionales_/index.php .
4. La obligación de adjudicar el premio y los procedimientos para una combinación no vendida podrían contradecir la regla técnica `no_winner` y deben evaluarse conforme a los artículos 2.7.3.8 y 2.7.3.9 aplicables. Referencia normativa: https://normograma.dian.gov.co/dian/compilacion/docs/decreto_1486_2024.htm .
5. No hemos obtenido ni examinado **autorización del regulador competente** ni **confirmación escrita de Wompi** de que esta modalidad, frecuencia, plan de premios y cobro directo sean aceptables. Los reglamentos del comercio pueden consultarse en https://wompi.co/es/co/reglamento-comercios/ ; una clave de Sandbox o la conexión técnica **no constituye aval**.

## Consecuencia
No es correcto dar por autorizable Sinuano Noche en su configuración actual. **No puedo confirmar** que pueda operar legalmente sin cambiar sustancialmente sus reglas o sin una figura regulatoria distinta específicamente autorizada. El nombre comercial "campaña" no determina la clasificación jurídica.

**Mantener bloqueo absoluto de ventas y premios:** `IS_DAILY_COMMERCIALLY_ENABLED=false` y `campaign_daily_commerce_controls.sales_enabled=false`; campaña `pending`, privada y expediente administrativo `pending`; no alterar `main` ni producción; no activar FuerzaMarket.

## Ruta de decisión
- Obtener concepto escrito de abogado colombiano especializado en juegos de suerte y azar, y criterio de la autoridad competente para la **mecánica exacta**: 31 fechas, cobro por código, uso de resultados de Sinuano Noche, repetición de combinaciones por jornadas, ausencia de ganador, premios en efectivo o bienes.
- Presentar a Wompi esa descripción completa y pedir autorización documental para la actividad económica y el medio de pago.
- Solo con los documentos verificados determinar modalidad permitida, frecuencia, premios y reglas de resultado. Cualquier rediseño que sustituya la campaña vigente exige decisión explícita; no imponer una modalidad alternativa automáticamente.
- **No usar la habilitación técnica de una sandbox como medio para eludir restricciones regulatorias.** Se permiten pruebas sintéticas aisladas y verificaciones sin cobros.

## Estado técnico de la rama
- La versión funcional de staging `2104e51ad218ca11da2aeef7a45c8066e1a67d00` fue desplegada por Railway deployment `35ebed63-8a55-43f8-a590-d90fd92082c2` (SUCCESS) y las pruebas HTTP públicas muestran que compra diaria devuelve 403.
- GitHub Actions `39099186039`: 126 pruebas aprobadas, 0 fallidas, más integración PostgreSQL 17 (31 fechas, reversos, historial inmutable, pagos concurrentes, idempotencia).
- Pago `VOIDED`: evento verificado + reversión ahora se ejecutan en **una transacción PostgreSQL** y el retorno GET para Sinuano no realiza cambios de estado.
- **No hay evidencia de transacción externa real de Wompi Sandbox** para la modalidad bloqueada y no es apropiado afirmarla como prueba completada.
- Entornos: Supabase staging `xooxbkawxrdvlvbvkvjy`; prod `vrmctjgxvjyxepaefxzu`; FuerzaMarket `suponlvqoouzmmxbgcxf`, debe continuar INACTIVE.

Este documento **actualiza** cualquier conclusión anterior de "fase aprobada" para comercialización: únicamente las pruebas de laboratorio están aprobadas; su lanzamiento jurídico y comercial está BLOQUEADO.
