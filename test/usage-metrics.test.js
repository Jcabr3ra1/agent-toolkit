import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeMeasurement,summarizeMeasurements} from '../src/usage-metrics.js';
const base={id:'call',agent:'codex',phase:'review',model:'example',source:'manual',totalTokens:0};
test('measurements reject coerced identities and invalid counters',()=>{
  for(const change of [{id:7},{id:[]},{inputTokens:'3'},{durationMs:1.2},{outputTokens:NaN},{totalTokens:null},{costUsd:Infinity}]) assert.throws(()=>normalizeMeasurement({...base,...change}));
});
test('unknown and overflow totals are never reported as zero or a complete sum',()=>{
  assert.deepEqual(summarizeMeasurements([]).counters.totalTokens,{known:0,missing:0,sum:null,complete:false});
  const report=summarizeMeasurements([normalizeMeasurement({...base,totalTokens:Number.MAX_SAFE_INTEGER}),normalizeMeasurement({...base,totalTokens:1})]);
  assert.equal(report.counters.totalTokens.sum,null);assert.equal(report.counters.totalTokens.complete,false);
});
