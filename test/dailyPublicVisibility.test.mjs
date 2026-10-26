import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewCampaignDetails,DAILY_PROVIDER} from '../services/sinuanoAccess.mjs';

test('La ficha privada de Sinuano no se expone por enlace directo al público',()=>{
  const campaign={draw_provider:DAILY_PROVIDER,status:'pending',is_public:false};
  assert.equal(canViewCampaignDetails({campaign}),false);
  assert.equal(canViewCampaignDetails({campaign,isAdmin:false}),false);
  assert.equal(canViewCampaignDetails({campaign,isAdmin:true}),true);
});

test('La protección excepcional no oculta fichas tradicionales',()=>{
  for(const draw_provider of ['loteria_boyaca','baloto','loteria_medellin']) {
    assert.equal(canViewCampaignDetails({campaign:{draw_provider},isAdmin:false}),true);
  }
});
