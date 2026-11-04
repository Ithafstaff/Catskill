import test from 'node:test'
import assert from 'node:assert/strict'
import { createProfileSessionController } from '../src/authProfile.ts'
const account = id => ({id, email:`${id}@example.test`})
const profile = id => ({id, name:id, email:`${id}@example.test`, phone:'', role:'contributor'})
const flush = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  const states = [], requests = []
  let changes = 0
  const controller = createProfileSessionController({
    onChange: state => states.push(state),
    onIdentityChange: () => ++changes,
    load: user => new Promise((resolve, reject) => requests.push({user,resolve,reject})),
  })
  return {controller, states, requests, changes:()=>changes, latest:()=>states.at(-1)}
}
async function signedIn() {
  const f=fixture()
  f.controller.receive(account('first'))
  await flush()
  f.requests[0].resolve(profile('first'))
  await flush()
  return f
}
test('initial profile blocks until verified; auth callbacks defer Supabase requests', async () => {
  const f=fixture()
  f.controller.receive(account('first'))
  assert.equal(f.requests.length,0)
  assert.deepEqual(f.latest(),{user:null,loading:true,error:''})
  await flush()
  f.requests[0].resolve(profile('first'))
  await flush()
  assert.equal(f.latest().user.id,'first')
  assert.equal(f.latest().loading,false)
})
test('tab-return and token-refresh events keep the editor account mounted throughout', async () => {
  const f=await signedIn()
  const stable = f.latest().user
  f.controller.receive({...account('first')})
  assert.equal(f.latest().user,stable)
  assert.equal(f.latest().loading,false)
  await flush()
  f.controller.receive({...account('first')})
  assert.equal(f.latest().user,stable)
  assert.equal(f.latest().loading,false)
  await flush()
  f.requests[1].resolve({...profile('first'),name:'outdated'})
  await flush()
  assert.equal(f.latest().user,stable)
  f.requests[2].resolve({...profile('first'),name:'updated'})
  await flush()
  assert.equal(f.latest().user.name,'updated')
  assert.equal(f.changes(),1)
})
test('temporary background failure preserves the verified profile and reports the error', async () => {
  const f=await signedIn()
  f.controller.receive(account('first'))
  await flush()
  f.requests[1].reject(new Error('Network unavailable'))
  await flush()
  assert.equal(f.latest().user.id,'first')
  assert.equal(f.latest().loading,false)
  assert.equal(f.latest().error,'Network unavailable')
})
test('account switching clears the previous account immediately and ignores late results', async () => {
  const f=await signedIn()
  f.controller.receive(account('first')); await flush()
  f.controller.receive(account('second'))
  assert.equal(f.latest().user,null)
  assert.equal(f.latest().loading,true)
  assert.equal(f.changes(),2)
  await flush()
  f.requests[1].resolve(profile('first')); await flush()
  assert.equal(f.latest().user,null)
  f.requests[2].resolve(profile('second')); await flush()
  assert.equal(f.latest().user.id,'second')
})
test('sign-out clears the account and invalidates a pending profile refresh', async () => {
  const f=await signedIn()
  f.controller.receive(account('first')); await flush()
  f.controller.receive(null)
  assert.deepEqual(f.latest(),{user:null,loading:false,error:''})
  f.requests[1].resolve(profile('first')); await flush()
  assert.equal(f.latest().user,null)
})
test('failed initial profile or mismatched profile never grants a ready account', async () => {
  const f=fixture()
  f.controller.receive(account('first')); await flush()
  f.requests[0].resolve(profile('different')); await flush()
  assert.equal(f.latest().user,null)
  assert.match(f.latest().error,/did not match/)
})
test('confirmed login/profile edits supersede older pending profile requests', async () => {
  const f=await signedIn()
  f.controller.receive(account('first')); await flush()
  f.controller.adopt({...profile('first'),name:'New display name'})
  f.requests[1].resolve(profile('first')); await flush()
  assert.equal(f.latest().user.name,'New display name')
  f.controller.adopt(profile('other'))
  assert.equal(f.latest().user.id,'first')
})
test('cleanup prevents a response from updating an unmounted app', async () => {
  const f=fixture()
  f.controller.receive(account('first')); await flush()
  f.controller.stop()
  const count=f.states.length
  f.requests[0].resolve(profile('first')); await flush()
  f.controller.receive(account('second'))
  assert.equal(f.states.length,count)
})
