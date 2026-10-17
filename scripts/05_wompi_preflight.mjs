// Revisar en Railway staging, nunca en el ordenador del usuario ni en producción.
// NO imprime ni almacena claves o secretos; solo informa controles OK/BLOCKED.
const e=process.env;
const checks={
  'URL Supabase de staging':String(e.SUPABASE_URL||'').includes('xooxbkawxrdvlvbvkvjy'),
  'Sesiones separadas de producción':String(e.DATABASE_URL||e.SESSION_DATABASE_URL||'').includes('xooxbkawxrdvlvbvkvjy'),
  'URL pública de staging':String(e.APP_BASE_URL||'').includes('staging')&&!String(e.APP_BASE_URL||'').includes('www.promoclaras.com'),
  'Wompi clave pública de pruebas':String(e.WOMPI_PUBLIC_KEY||'').startsWith('pub_test_'),
  'Wompi clave privada de pruebas':String(e.WOMPI_PRIVATE_KEY||'').startsWith('prv_test_'),
  'Wompi integridad configurada':Boolean(e.WOMPI_INTEGRITY_SECRET),
  'Wompi eventos configurada':Boolean(e.WOMPI_EVENTS_SECRET)
};
for(const [name,ok] of Object.entries(checks)) console.log(`${name}: ${ok?'OK':'BLOCKED'}`);
const failed=Object.values(checks).filter(x=>!x).length;
if(failed){console.error('NO se autorizan pruebas de pagos: configuración incompleta o no aislada.');process.exitCode=1}
