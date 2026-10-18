import { isDailyCampaign, IS_DAILY_COMMERCIALLY_ENABLED } from './sinuanoAccess.mjs';

/**
 * This bridge is NEVER active until the exceptionally authorized daily
 * campaign has both application and database feature gates enabled.
 * The ordinary Wompi flow continues unchanged for other campaign providers.
 * A single PostgreSQL RPC atomically validates paid status, allocates unique
 * 0000..9999 combinations, and creates the activation audit.
 */
export async function finalizeDailyPaidOrderIfEnabled({
  order, supabase, enabled=IS_DAILY_COMMERCIALLY_ENABLED
}={}) {
  if (!order || !supabase) throw new Error('Orden o conexión de pagos no disponible');
  if (!isDailyCampaign(order.rifas)) return null;
  if (enabled !== true) {
    throw new Error('Modalidad diaria deshabilitada: no finalizar orden ni asignar códigos');
  }
  if (order.payment_mode !== 'full') {
    throw new Error('La modalidad diaria no admite cuotas en esta fase');
  }
  const {data:payments,error:queryError}=await supabase.from('payments')
    .select('id,provider,status,provider_transaction_id,amount')
    .eq('order_id',order.id).eq('provider','wompi').eq('status','approved')
    .limit(2);
  if (queryError) throw queryError;
  if (!Array.isArray(payments) || payments.length!==1 ||
      !payments[0].provider_transaction_id ||
      Number(payments[0].amount)!==Number(order.subtotal)) {
    throw new Error('Pago único íntegro Wompi no reconciliado');
  }
  const p=payments[0];
  const {data,error}=await supabase.rpc('system_daily_finalize_full_payment_atomic',{
    p_order_id:order.id,
    p_provider_transaction_id:p.provider_transaction_id
  });
  if (error) throw error;
  const result=Array.isArray(data)?data[0]:data;
  if (!result || Number(result.assigned_count)!==Number(order.qty) ||
      Number(result.activated_count)!==Number(order.qty)) {
    throw new Error('Finalización diaria atómica incompleta: requiere conciliación');
  }
  return {
    ok:true, daily:true, orderId:order.id,
    expectedTicketsCount:Number(order.qty),
    assignedCount:Number(result.assigned_count),
    activatedCount:Number(result.activated_count),
    alreadyProcessed:result.already_processed===true
  };
}
