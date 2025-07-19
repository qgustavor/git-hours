import { describe, it } from 'node:test'
import { execFile } from 'node:child_process'
import assert from 'node:assert'
import path from 'node:path'

let totalHoursCount
const scriptPath = path.resolve(import.meta.dirname, '../src/index.js')

describe('git-hours', () => {
  it('should output json', (t, done) => {
    execFile('node', [scriptPath], (err, stdout, stderr) => {
      if (err) console.error(stderr.toString())
      assert.ifError(err)
      const work = JSON.parse(stdout)
      assert.notEqual(work.total.hours.length, 0)
      assert.notEqual(work.total.commits.length, 0)
      totalHoursCount = work.total.hours
      done()
    })
  })

  it('Should analyse since today', (t, done) => {
    execFile('node', [scriptPath, '--since', 'today'], (err, stdout) => {
      if (err) console.error(stderr.toString())
      assert.ifError(err)
      const work = JSON.parse(stdout)
      assert.strictEqual(typeof work.total.hours, 'number')
      done()
    })
  })

  it('Should analyse since yesterday', (t, done) => {
    execFile('node', [scriptPath, '--since', 'yesterday'], (err, stdout) => {
      if (err) console.error(stderr.toString())
      assert.ifError(err)
      const work = JSON.parse(stdout)
      assert.strictEqual(typeof work.total.hours, 'number')
      done()
    })
  })

  it('Should analyse since last week', (t, done) => {
    execFile('node', [scriptPath, '--since', 'lastweek'], (err, stdout) => {
      if (err) console.error(stderr.toString())
      assert.ifError(err)
      const work = JSON.parse(stdout)
      assert.strictEqual(typeof work.total.hours, 'number')
      done()
    })
  })

  it('Should analyse since a specific date', (t, done) => {
    execFile('node', [scriptPath, '--since', '2015-01-01'], (err, stdout) => {
      if (err) console.error(stderr.toString())
      assert.ifError(err)
      const work = JSON.parse(stdout)
      assert.notEqual(work.total.hours, 0)
      done()
    })
  })

  it('Should analyse as without param', (t, done) => {
    execFile('node', [scriptPath, '--since', 'always'], (err, stdout) => {
      if (err) console.error(stderr.toString())
      assert.ifError(err)
      const work = JSON.parse(stdout)
      assert.equal(work.total.hours, totalHoursCount)
      done()
    })
  })
})
