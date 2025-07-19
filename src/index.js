#!/usr/bin/env node

import { startOfDay, startOfWeek, subDays, subWeeks, parse, format } from 'date-fns'
import pkg from '../package.json' with { type: 'json' }
import childProcess from 'node:child_process'
import { program } from 'commander'
import fs from 'node:fs'

const DATE_FORMAT = 'yyyy-MM-dd'

let config = {
  // Maximum time diff between 2 subsequent commits in minutes which are
  // counted to be in the same coding "session"
  maxCommitDiffInMinutes: 2 * 60,

  // How many minutes should be added for the first commit of coding session
  firstCommitAdditionInMinutes: 2 * 60,

  // Include commits since time x
  since: 'always',
  until: 'always',

  // Include merge requests
  mergeRequest: true,

  // Git repo
  gitPath: '.',

  // Aliases of emails for grouping the same activity as one person
  emailAliases: {},
  branch: null,
}

// Estimates spent working hours based on commit dates
function estimateHours (dates) {
  if (dates.length < 2) {
    return 0
  }

  // Oldest commit first, newest last
  const sortedDates = dates.sort((a, b) => a - b)
  const allButLast = sortedDates.slice(0, -1)

  const totalHours = allButLast.reduce((hours, date, index) => {
    const nextDate = sortedDates[index + 1]
    const diffInMinutes = (nextDate - date) / 1000 / 60

    // Check if commits are counted to be in same coding session
    if (diffInMinutes < config.maxCommitDiffInMinutes) {
      return hours + diffInMinutes / 60
    }

    // The date difference is too big to be inside single coding session
    // The work of first commit of a session cannot be seen in git history,
    // so we make a blunt estimate of it
    return hours + config.firstCommitAdditionInMinutes / 60
  }, 0)

  return Math.round(totalHours)
}

/**
 * Prepares the git command before execution
 *
 * @return {String} Prepared command
 */
function getGitOptions () {
  const sinceAlways = config.since === 'always' || !config.since
  const untilAlways = config.until === 'always' || !config.until

  const params = [
    '--no-pager',
    'log',
    config.mergeRequest ? '-m' : '',
    config.branch ? config.branch : '',
    '--date=iso-local',
    '--reverse',
    !sinceAlways ? `--since=${format(config.since, DATE_FORMAT)}` : '',
    !untilAlways ? `--until=${format(config.until, DATE_FORMAT)}` : '',
    '--pretty=format:{"sha":"%H","date":"%ad","message":"%f","author":{"name":"%an","email":"%ae"}}',
  ]

  return params.filter(item => item) // filtering falsy
}

function getBranchCommits () {
  return new Promise((resolve, reject) => {
    childProcess.execFile('git', getGitOptions(), {
      cwd: config.gitPath
    }, (error, stdout, stderr) => {
      // all commits array
      const commits = []

      if (error) {
        reject(new Error('git failed with ' + stderr))
        return
      }

      // convert string to json, filtering empty
      const logs = stdout.toString().trim().split('\n').filter(item => item)

      for (const commit of logs) {
        const item = JSON.parse(commit)
        commits.push(item)
      }

      resolve(commits)
    })
  })
}

// Git Commits of getting all commits in repository
async function getCommits () {
  const commits = await getBranchCommits()

  // Multiple branches might share commits, so take unique
  const uniqueCommits = Array.from(new Map(commits.map(c => [c.sha, c])).values())

  return uniqueCommits.filter(({ message }) => {
    // Exclude all commits starting with "Merge ..."
    if (!config.mergeRequest && message.startsWith('Merge ')) {
      return false
    }
    return true
  })
}

function parseEmailAlias (value) {
  if (value.indexOf('=') > 0) {
    const email = value.substring(0, value.indexOf('=')).trim()
    const alias = value.substring(value.indexOf('=') + 1).trim()
    if (config.emailAliases === undefined) {
      config.emailAliases = {}
    }
    config.emailAliases[email] = alias
  } else {
    console.error(`ERROR: Invalid alias: ${value}`)
  }
}

function mergeDefaultsWithArgs (conf) {
  const options = program.opts()
  return {
    range: options.range,
    maxCommitDiffInMinutes: options.maxCommitDiff || conf.maxCommitDiffInMinutes,
    firstCommitAdditionInMinutes: options.firstCommitAdd || conf.firstCommitAdditionInMinutes,
    since: options.since || conf.since,
    until: options.until || conf.until,
    gitPath: options.path || conf.gitPath,
    mergeRequest: options.mergeRequest !== undefined ? (options.mergeRequest === 'true') : conf.mergeRequest,
    branch: options.branch || conf.branch,
  }
}

function parseInputDate (inputDate) {
  const today = new Date()

  switch (inputDate) {
    case 'today':
      return startOfDay(today)
    case 'yesterday':
      return startOfDay(subDays(today, 1))
    case 'thisweek':
      return startOfWeek(today)
    case 'lastweek':
      return startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })
    case 'always':
      return 'always'
    default:
      // WARN this can lead to undefined behavior
      return parse(inputDate, DATE_FORMAT, new Date())
  }
}

function parseSinceDate (since) {
  return parseInputDate(since)
}

function parseUntilDate (until) {
  return parseInputDate(until)
}

function parseArgs () {
  function int (val) {
    return parseInt(val, 10)
  }

  program
    .version(pkg.version)
    .usage('[options]')
    .option(
      '-d, --max-commit-diff [max-commit-diff]',
      `maximum difference in minutes between commits counted to one session. Default: ${config.maxCommitDiffInMinutes}`,
      int
    )
    .option(
      '-a, --first-commit-add [first-commit-add]',
      `how many minutes first commit of session should add to total. Default: ${config.firstCommitAdditionInMinutes}`,
      int
    )
    .option(
      '-s, --since [since-certain-date]',
      `Analyze data since certain date. [always|yesterday|today|lastweek|thisweek|yyyy-mm-dd] Default: ${config.since}`,
      String
    )
    .option(
      '-e, --email [emailOther=emailMain]',
      'Group person by email address. Default: none',
      String
    )
    .option(
      '-u, --until [until-certain-date]',
      `Analyze data until certain date. [always|yesterday|today|lastweek|thisweek|yyyy-mm-dd] Default: ${config.until}`,
      String
    )
    .option(
      '-m, --merge-request [false|true]',
      `Include merge requests into calculation. Default: ${config.mergeRequest}`,
      String
    )
    .option(
      '-p, --path [git-repo]',
      `Git repository to analyze. Default: ${config.gitPath}`,
      String
    )
    .option(
      '-b, --branch [branch-name]',
      `Analyze only data on the specified branch. Default: ${config.branch}`,
      String
    )

  program.on('--help', () => {
    console.log([
      '  Examples:',
      '   - Estimate hours of project',
      '       $ git-hours',
      '   - Estimate hours in repository where developers commit more seldom: they might have 4h(240min) pause between commits',
      '       $ git-hours --max-commit-diff 240',
      '   - Estimate hours in repository where developer works 5 hours before first commit in day',
      '       $ git-hours --first-commit-add 300',
      '   - Estimate hours work in repository since yesterday',
      '       $ git-hours --since yesterday',
      '   - Estimate hours work in repository since 2015-01-31',
      '       $ git-hours --since 2015-01-31',
      '   - Estimate hours work in repository on the "master" branch',
      '       $ git-hours --branch master',
      '  For more details, visit https://github.com/qgustavor/git-hours',
    ].join('\n\n'))
  })

  program.parse()
}

function exitIfShallow () {
  if (fs.existsSync('.git/shallow')) {
    console.log('Cannot analyze shallow copies!')
    console.log('Please run git fetch --unshallow before continuing!')
    process.exit(1)
  }
}

exitIfShallow()

parseArgs()
config = mergeDefaultsWithArgs(config)
config.since = parseSinceDate(config.since)
config.until = parseUntilDate(config.until)

// Poor man`s multiple args support
// https://github.com/tj/commander.js/issues/531
for (let i = 0; i < process.argv.length; i += 1) {
  const k = process.argv[i]
  let n = i <= process.argv.length - 1 ? process.argv[i + 1] : undefined
  if (k === '-e' || k === '--email') {
    parseEmailAlias(n)
  } else if (k.startsWith('--email=')) {
    n = k.substring(k.indexOf('=') + 1)
    parseEmailAlias(n)
  }
}

const commits = await getCommits()
const commitsByEmail = commits.reduce((sum, commit) => {
  const { author } = commit
  let email = author.email || 'unknown'
  if (config.emailAliases !== undefined && config.emailAliases[email] !== undefined) {
    email = config.emailAliases[email]
  }
  if (!sum[email]) sum[email] = []
  sum[email].push(commit)
  return sum
}, {})

const authorWorks = Object.entries(commitsByEmail).map(([authorEmail, authorCommits]) => ({
  email: authorEmail,
  name: authorCommits[0].author.name,
  hours: estimateHours(authorCommits.map(e => e.date)),
  commits: authorCommits.length,
}))

// XXX: This relies on the implementation detail that json is printed
// in the same order as the keys were added. This is anyway just for
// making the output easier to read, so it doesn't matter if it
// isn't sorted in some cases.
const sortedWork = {}

const sortedWorks = authorWorks.slice().sort((a, b) => a.hours - b.hours)
for (const authorWork of sortedWorks) {
  const authorClone = Object.assign({}, authorWork)
  delete authorClone.email
  sortedWork[authorWork.email] = authorClone
}

const totalHours = Object.values(sortedWork).reduce((sum, { hours }) => sum + hours, 0)

sortedWork.total = {
  hours: totalHours,
  commits: commits.length,
}

console.log(JSON.stringify(sortedWork, undefined, 2))
