import { IS_DAILY_COMMERCIALLY_ENABLED, isDailyCampaign } from './sinuanoAccess.mjs';

/** Called ONLY after index.js validates Wompi event signature, environment,
 *  reference, COP currency, and exact amount. Does not authorize sales.
 *  Each database RPC is service_role-only; ordinary campaigns bypass it. */
export async function handleSignedDailyWompiEvent({
  supabase, payment, status, transactionId, checksum, environment, timestamp,
  salesEnabled=IS_DAILY_COMMERCIALLY_ENABLED
}={}) {
  if (!supabase || !payment?.orders?.rifa_id) throw new Error('Pago sin orden y campaña');
  const campaign=await supabase.from('rifas').select('draw_provider,draw_mode')
    .eq('id',payment.orders.rifa_id).maybeSingle();
  if (campaign.error) throw campaign.error;
  if (!isDailyCampaign(campaign.data)) return null;
  if (campaign.data?.draw_mode!=='loteria_4_pleno' || payment.installment_id)
    throw new Error('Modalidad de pago diario incompatible');
  if (!['APPROVED','VOIDED'].includes(status)) return { handled:true, ignored:true };
  if (status==='APPROVED' && salesEnabled!==true)
    return { handled:true, denied:true };
  if (typeof transactionId!=='string' || transactionId.length<6 ||
      !/^[a-f0-9]{64}$/.test(String(checksum||'')) ||
      environment!=='test' || !Number.isSafeInteger(timestamp) || timestamp<=0)
    throw new Error('Evidencia Wompi firmada incompleta');
  if(status==='VOIDED') {
    // A single database transaction records the verified event and reverses
    // the payment; failures cannot leave a partially reconciled webhook.
    const reversal=await supabase.rpc('system_daily_apply_verified_void_atomic',{
      p_payment_id:payment.id,p_transaction_id:transactionId,
      p_checksum:checksum,p_environment:environment,
      p_event_timestamp:timestamp
    });
    if(reversal.error) throw reversal.error;
    return {handled:true,voided:true};
  }
  const record=await supabase.rpc('system_daily_record_verified_wompi_event',{
    p_payment_id:payment.id,p_transaction_id:transactionId,
    p_status:status,p_checksum:checksum,p_environment:environment,
    p_event_timestamp:timestamp
  });
  if(record.error) throw record.error;
  // Existing payment webhook will finalize the paid order; its exceptional
  // finalizer requires this receipt and the independent DB commerce gate.
  return {handled:true,recorded:true};
}
