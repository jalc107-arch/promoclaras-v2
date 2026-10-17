"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { eligibleForDraw, previewDailyResult, parseCombination } = require("../services/dailyDrawRules.cjs");
const source = fs.readFileSync(path.join(__dirname,"../index.js"),"utf8");
const f = source.match(/function getMinimumQtyByPrice\(pricePerTicket\)\s*\{[\s\S]*?\n\}/);
assert.ok(f, "No se encuentra regla central de mínimo");
const getMinimumQtyByPrice = vm.runInNewContext(f[0] + "\ngetMinimumQtyByPrice");
const draw = Object.freeze({provider:"loteria_sinuano_noche",mode:"loteria_4_pleno",campaign_id:"A",draw_date:"2027-01-02",cutoff_at:"2027-01-02T22:15:00-05:00",scheduled_at:"2027-01-02T22:30:00-05:00",official_result:"0042",official_result_reference:"oficial/fecha/numero",verified_by:"admin-1"});
function ticket(id,code){return {id,combination:code,campaign_id:"A"};}
function activation(id,when,extra={}){return {ticket_id:id,campaign_id:"A",activated_at:when,order_id:`order-${id}`,payment_id:`approved-${id}`,payment_verified:true,payment_status:"paid",...extra};}

for (const [price,expected] of [[1000,10],[1999,1],[2000,5],[2001,5],[2499,5],[2999,5],[2999.99,5],[3000,2],[4000,2],[5000,1],[20000,1]]) test(`compra mínima ${price} => ${expected}`,()=>assert.equal(getMinimumQtyByPrice(price),expected));

test("módulo no conectado a producción: mantiene 403 del organizador pendiente y reglas de órdenes",()=>{
 assert.match(source,/organizer\.verification_status !== "verified"/);
 assert.match(source,/getMinimumQtyByPrice\(campaign\.price_per_ticket\)/);
 assert.match(source,/if \(qty < minimumCreditQty\)/);
 assert.match(source,/min="\$\{minimumCreditQty\}"/);
});
test("preservar ceros a la izquierda",()=>assert.equal(parseCombination("0042"),"0042"));
test("rechazar resultados corruptos",()=>assert.throws(()=>parseCombination("42")));
test("rechazar fecha sin zona horaria",()=>assert.throws(()=>eligibleForDraw(ticket("1","0042"),activation("1","2027-01-02T10:00:00"),draw)));
test("número con pago previo al cierre participa",()=>assert.equal(eligibleForDraw(ticket("1","0042"),activation("1","2027-01-02T20:00:00-05:00"),draw),true));
test("pago realizado exactamente al cierre participa",()=>assert.equal(eligibleForDraw(ticket("1","0042"),activation("1",draw.cutoff_at),draw),true));
test("pago posterior al cierre no participa",()=>assert.equal(eligibleForDraw(ticket("1","0042"),activation("1","2027-01-02T22:16:00-05:00"),draw),false));
test("reserva a cuotas sin constancia de pago aprobado no participa",()=>assert.equal(eligibleForDraw(ticket("1","0042"),activation("1","2027-01-02T20:00:00-05:00",{payment_id:null}),draw),false));
test("revocación previa al cierre no participa",()=>assert.equal(eligibleForDraw(ticket("1","0042"),activation("1","2027-01-01T20:00:00-05:00",{revoked_at:"2027-01-02T22:00:00-05:00"}),draw),false));
test("revocación posterior al cierre no invalida participación histórica",()=>assert.equal(eligibleForDraw(ticket("1","0042"),activation("1","2027-01-01T20:00:00-05:00",{revoked_at:"2027-01-03T08:00:00-05:00"}),draw),true));
test("cuenta de otra campaña no participa",()=>assert.equal(eligibleForDraw({...ticket("1","0042"),campaign_id:"B"},activation("1","2027-01-01T20:00:00-05:00"),draw),false));
test("resultado sin código adquirido no tiene ganador",()=>{
 const r=previewDailyResult(draw,[ticket("1","1122")],[activation("1","2027-01-01T20:00:00-05:00")]);
 assert.equal(r.winner_ticket_id,null);assert.equal(r.outcome,"no_winner");assert.equal(r.eligible_count,1);
});
test("resultado con coincidencia válida adjudica solo un código",()=>{
 const r=previewDailyResult(draw,[ticket("1","0042"),ticket("2","1122")],[activation("1","2027-01-01T20:00:00-05:00"),activation("2","2027-01-02T23:00:00-05:00")]);
 assert.equal(r.winner_ticket_id,"1");assert.equal(r.eligible_count,1);assert.equal(r.eligibility_digest.length,64);
});
test("un mismo código participa en otro día aunque ya haya ganado",()=>{
 const next={...draw,draw_date:"2027-01-03",cutoff_at:"2027-01-03T22:15:00-05:00",scheduled_at:"2027-01-03T22:30:00-05:00"};
 assert.equal(previewDailyResult(draw,[ticket("1","0042")],[activation("1","2027-01-01T20:00:00-05:00")]).winner_ticket_id,"1");
 assert.equal(previewDailyResult(next,[ticket("1","0042")],[activation("1","2027-01-01T20:00:00-05:00")]).winner_ticket_id,"1");
});
test("números duplicados bloquean adjudicación",()=>assert.throws(()=>previewDailyResult(draw,[ticket("1","0042"),ticket("2","0042")],[activation("1","2027-01-01T20:00:00-05:00"),activation("2","2027-01-01T20:00:00-05:00")]),/duplicado/));
test("doble activación bloquea adjudicación",()=>assert.throws(()=>previewDailyResult(draw,[ticket("1","0042")],[activation("1","2027-01-01T20:00:00-05:00"),activation("1","2027-01-01T20:00:00-05:00")]),/duplicada/));
test("cierre posterior a sorteo no permitido",()=>assert.throws(()=>previewDailyResult({...draw,cutoff_at:"2027-01-02T23:00:00-05:00"},[],[]),/cierre/));
test("sin referencia oficial y admin no puede calcular premio",()=>assert.throws(()=>previewDailyResult({...draw,official_result_reference:null},[],[]),/referencia/));

test("pago no verificado no participa",()=>assert.equal(eligibleForDraw(ticket("1","0042"),activation("1","2027-01-01T20:00:00-05:00",{payment_verified:false}),draw),false));
test("estado de pago parcial no participa",()=>assert.equal(eligibleForDraw(ticket("1","0042"),activation("1","2027-01-01T20:00:00-05:00",{payment_status:"partially_paid"}),draw),false));
