import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyDraftSchedule,validateMonthlySchedule,validateDecemberSchedule } from '../services/dailyDrawSimulation.mjs';
for(const [year,month,days] of [[2026,2,28],[2028,2,29],[2026,4,30],[2026,12,31],[2027,1,31],[2100,2,28]]) {
 test('Mes '+year+'-'+month+' genera '+days+' jornadas y un solo premio mayor',()=>{
  const rows=buildMonthlyDraftSchedule(year,month);
  assert.equal(rows.length,days);
  assert.equal(rows.filter(r=>r.major_prize).length,1);
  assert.equal(rows.at(-1).major_prize,true);
  assert.ok(rows.slice(0,-1).every(r=>!r.major_prize&&r.prize_kind==='undetermined'));
  assert.equal(validateMonthlySchedule(rows).draws,days);
 });
}
test('Diciembre 2026 conserva compatibilidad con 31 jornadas',()=>{
 const rows=buildMonthlyDraftSchedule(2026,12);
 assert.equal(validateDecemberSchedule(rows,2026).last,'2026-12-31');
});
test('No acepta que el premio mayor ocurra antes del último día o haya dos',()=>{
 const rows=buildMonthlyDraftSchedule(2027,4).map(x=>({...x}));
 rows[0].major_prize=true;
 assert.throws(()=>validateMonthlySchedule(rows),/premio mayor/);
 rows[0].major_prize=false;rows.at(-1).major_prize=false;
 assert.throws(()=>validateMonthlySchedule(rows),/premio mayor/);
});
test('No acepta jornadas incompletas, duplicadas o fuera del mes',()=>{
 const rows=buildMonthlyDraftSchedule(2028,2);
 assert.throws(()=>validateMonthlySchedule(rows.slice(0,-1)),/todas sus jornadas/);
 const dup=rows.map(x=>({...x}));dup[1].draw_date=dup[0].draw_date;
 assert.throws(()=>validateMonthlySchedule(dup),/duplicadas/);
});
test('Premio mayor en borrador no puede fijar simultáneamente dos tipos',()=>{
 const rows=buildMonthlyDraftSchedule(2026,4).map(x=>({...x}));
 rows.at(-1).prize_kind='money_and_physical';
 assert.throws(()=>validateMonthlySchedule(rows),/solo dinero O especie/);
 rows.at(-1).prize_kind='physical';
 assert.equal(validateMonthlySchedule(rows).draws,30);
});
test('No acepta meses inexistentes ni años fuera del rango',()=>{
 for(const [year,month] of [[2027,0],[2027,13],[2025,12],[2101,1]])assert.throws(()=>buildMonthlyDraftSchedule(year,month),/inválido/);
});
