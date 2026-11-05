import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numericProblem } from '../lib/form-feedback'
test('custom numeric controls retain native bounds and step checks without coercing empty or fractional drafts',()=>{
  assert.equal(numericProblem(''),'')
  assert.equal(numericProblem('0',0),'')
  assert.equal(numericProblem('10.25',0,100,'0.01'),'')
  assert.equal(numericProblem('999999999999.999',0,undefined,'0.001'),'')
  assert.equal(numericProblem('0.29',0,1,'0.01'),'')
  assert.equal(numericProblem('-1.25',-2,2,'0.25'),'')
  assert.equal(numericProblem('0.5',undefined,undefined,'any'),'')
  assert.match(numericProblem('0.0001',0,undefined,'0.001'),/kelipatan/)
  assert.match(numericProblem('1.5',0),/bulat/)
  assert.match(numericProblem('2',3),/minimal/)
  assert.match(numericProblem('101',0,100),/maksimal/)
  for(const v of ['1,5','NaN','Infinity','1e4','abc'])assert.match(numericProblem(v),/angka/)
})
