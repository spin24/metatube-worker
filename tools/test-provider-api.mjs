// Failure boundaries: array/missing maps, omitted registrations, wrong provider
// casing, empty/invalid website URLs, changed error routes, or accidental D1 use.
// Runs the production entry locally with the existing DB-free test config.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = mkdtempSync(join(tmpdir(), 'metatube-provider-api-'))
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const base = `http://127.0.0.1:${port}`
const entry = process.argv[2] || 'src/index.ts'
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', entry, '--config', 'wrangler.test.toml', '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', join(root, 'state'), '--log-level', 'error'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''; worker.stdout.on('data', data => log += data); worker.stderr.on('data', data => log += data)
const checks = []; let passed = false; let failure
try {
  let ready = false
  for (let n = 0; n < 150; n++) {
    if (worker.exitCode !== null) throw Error(`worker exited: ${log}`)
    try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, `worker did not start: ${log}`)
  const registered = (await (await fetch(base)).json()).data
  const response = await fetch(base + '/v1/providers')
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/json/)
  const payload = await response.json()
  writeFileSync(join(root, 'providers.json'), JSON.stringify(payload, null, 2))
  assert.ok(payload.data && !Array.isArray(payload.data), 'provider data must use the Go server object contract')
  assert.deepEqual(Object.keys(payload.data).sort(), ['actor_providers', 'movie_providers'])
  for (const [key, names] of [['movie_providers', registered.providers], ['actor_providers', registered.actor_providers]]) {
    const mapping = payload.data[key]
    assert.ok(mapping && !Array.isArray(mapping))
    assert.deepEqual(Object.keys(mapping).sort(), [...names].sort(), `${key} must include every registered name with its original case`)
    for (const [name, value] of Object.entries(mapping)) {
      assert.equal(typeof value, 'string', `${name} must have a website URL`)
      const url = new URL(value)
      assert.equal(url.protocol, 'https:')
      assert.ok(url.hostname.includes('.'), `${name} needs a valid hostname`)
    }
    checks.push(`${key}: ${names.length} registered names and HTTPS websites`)
  }
  assert.equal(payload.data.movie_providers.FC2, 'https://adult.contents.fc2.com/')
  assert.equal(payload.data.movie_providers.Getchu, 'https://dl.getchu.com/')
  assert.equal(payload.data.actor_providers.Gfriends, 'https://github.com/gfriends/gfriends')
  for (const [path, status] of [['/v1/movies/search', 400], ['/v1/actors/search', 400], ['/v1/movies/unknown/id', 404], ['/missing', 404]]) {
    const response = await fetch(base + path)
    assert.equal(response.status, status, path)
    assert.equal(typeof (await response.json()).error, 'string')
    checks.push(`${path}: ${status}`)
  }
  passed = true
} catch (error) { failure = error.stack || String(error); throw error } finally {
  writeFileSync(join(root, 'checks.json'), JSON.stringify({ entry, passed, checks, failure }, null, 2))
  writeFileSync(join(root, 'worker.log'), log)
  if (worker.exitCode === null) { worker.kill('SIGTERM'); await once(worker, 'exit') }
  console.log(`Artifacts: ${root}`)
}
