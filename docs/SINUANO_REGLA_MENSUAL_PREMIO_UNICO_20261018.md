# CampaClick — regla mensual y premio mayor único (18 octubre de 2026)

## Decisión más reciente: reemplaza el calendario rígido de diciembre
La modalidad excepcional se **prepara por mes calendario y año escogidos**. Hay un único resultado por cada fecha propuesta del mes. En las jornadas previas al último día habrá un premio diario, cuyo valor o bien sigue sin definir. En la **última fecha del mes** habrá exclusivamente un premio mayor, **en dinero o en especie, no ambos**. Al configurar el premio mayor, debe elegirse exactamente una de esas dos clases. Es válido dejar la elección `NULL` en borradores; no es válido programar una jornada real sin su tipo definido.

Ejemplos de fechas técnicas: febrero de 2027 = 28 días, febrero de 2028 = 29, abril = 30, diciembre = 31. Los calendarios están sujetos a confirmar días de operación oficial del sorteo externo, autorización regulatoria y derecho de uso; generar días no implica que ocurrirán legalmente ni que el tercero sortee cada día.

## Componentes instalados exclusivamente en staging
- Validador puro `buildMonthlyDraftSchedule(year,month)` / `validateMonthlySchedule(rows)`, conservando `validateDecemberSchedule` para compatibilidad.
- Restricción PostgreSQL `daily_major_calendar_month_end`: el premio mayor **solamente** puede estar marcado el último día del mes. Restricción `daily_prize_kind_selected_before_schedule`: no hay programación de jornadas con premio `undetermined`.
- Vista de solo lectura `GET /admin/sorteos-diarios/:campaignId/preparacion/mes?year=2028&month=2`, accesible a sesión de administrador: calendario hipotético y presentación de borradores. El GET no crea calendarios ni modifica la campaña existente.
- Acción administrativa CSRF-protegida `POST .../preparacion/mes/borrador` para guardar **revisiones privadas del plan mensual**; no crea sorteos oficiales, campañas, órdenes, pagos, activaciones ni premios.
- Tabla `campaign_daily_monthly_plan_drafts` con historial inmutable y un solo campo `major_prize_kind` de valor `money`, `physical` o `NULL`; los requisitos de descripción, cantidad o monto son mutuamente excluyentes y fallan al recibir valores NULL inválidos. La RPC `admin_daily_save_month_plan_draft` exige campaña excepcional privada `pending`, controles de venta y documentales desactivados; accesible solo a `service_role` desde un administrador autenticado. Bloqueo por fila de campaña al calcular revisión evita duplicados concurrentes.
- Migraciones `staging_daily_month_end_major_guard_20261018` y `staging_daily_monthly_plan_drafts_20261018`, solo Supabase staging.
- Pruebas GitHub Actions https://github.com/jalc107-arch/promoclaras-v2/actions/runs/39126436006 : 156/156 pruebas locales y pruebas SQL PostgreSQL 17 incluyendo febrero bisiesto, abril, validación de tipos y rechazo a adjudicar dos clases simultáneas.

## Estado de las alternativas antiguas
La campaña de prueba diciembre 2026 **no se elimina ni se reinicia**. Continúa con 31 borradores. Sus dos propuestas históricas —$12.500.000 y dos motocicletas— son **alternativas**, no dos premios mayores, y ninguna está seleccionada. Elegir el premio principal en un futuro plan mensual requiere decisión expresa, luego revisión de legalidad. Los demás días no tienen premios definitivos.

## Bloqueo comercial y regulatorio
Se mantienen `IS_DAILY_COMMERCIALLY_ENABLED=false`, `campaign_daily_commerce_controls.sales_enabled=false`, ambos controles documentales `false`, el expediente privado `pending` y Wompi Sandbox separado. El Decreto 1486 de 2024 y las reglas de juegos promocionales plantean obstáculos sustantivos para sorteos diarios pagados, especialmente en efectivo. NO habilitar ventas ni resultados oficiales, NO fusionar en `main`, NO modificar CampaClick producción ni reactivar FuerzaMarket sin nueva instrucción.
