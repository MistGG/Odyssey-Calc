/**
 * Pull Supabase API (edge_logs) aggregates for the last N hours via Management API.
 * Requires SUPABASE_ACCESS_TOKEN (personal token from dashboard/account/tokens).
 *
 * Usage:
 *   node scripts/pull-supabase-api-logs.mjs
 *   node scripts/pull-supabase-api-logs.mjs --hours 3
 */
import process from 'node:process'

const PROJECT_REF = 'fnbixrelavkfvzprlgzc'
const hours = Number(process.argv.find((a, i) => process.argv[i - 1] === '--hours') || 3)

const token =
  process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
  process.env.SBP_ACCESS_TOKEN?.trim() ||
  ''

if (!token) {
  console.error(
    'Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens',
  )
  process.exit(1)
}

const end = new Date()
const start = new Date(end.getTime() - hours * 60 * 60 * 1000)
const isoStart = start.toISOString()
const isoEnd = end.toISOString()

const sqlByPath = `
select
  r.path as path,
  count(*) as requests,
  countif(r.method = 'GET') as get_requests,
  countif(response.status_code >= 400) as error_requests,
  countif(response.status_code = 403) as forbidden_requests
from edge_logs as t
cross join unnest(t.metadata) as m
cross join unnest(m.request) as r
cross join unnest(m.response) as response
where
  datetime(t.timestamp) between datetime('${isoStart}') and datetime('${isoEnd}')
  and r.path is not null
group by path
order by requests desc
limit 40
`

const sqlByPathAndStatus = `
select
  r.path as path,
  response.status_code as status_code,
  count(*) as requests
from edge_logs as t
cross join unnest(t.metadata) as m
cross join unnest(m.request) as r
cross join unnest(m.response) as response
where
  datetime(t.timestamp) between datetime('${isoStart}') and datetime('${isoEnd}')
  and r.path is not null
group by path, status_code
order by requests desc
limit 60
`

async function queryLogs(sql) {
  const url = new URL(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all`,
  )
  url.searchParams.set('sql', sql)
  url.searchParams.set('iso_timestamp_start', isoStart)
  url.searchParams.set('iso_timestamp_end', isoEnd)

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`logs.all HTTP ${res.status}: ${JSON.stringify(body).slice(0, 500)}`)
  }
  return body
}

function printTable(title, rows) {
  console.log(`\n=== ${title} ===`)
  if (!rows?.length) {
    console.log('(no rows)')
    return
  }
  const cols = Object.keys(rows[0])
  console.log(cols.join('\t'))
  for (const row of rows) {
    console.log(cols.map((c) => String(row[c] ?? '')).join('\t'))
  }
}

async function fetchUsageCounts() {
  const url = new URL(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/usage.api-counts`,
  )
  url.searchParams.set('interval', '1h')
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { error: `usage.api-counts HTTP ${res.status}` }
  return body
}

console.log(`Project: ${PROJECT_REF}`)
console.log(`Window: ${isoStart} → ${isoEnd} (${hours}h)`)

const [byPath, byPathStatus, usage] = await Promise.all([
  queryLogs(sqlByPath),
  queryLogs(sqlByPathAndStatus),
  fetchUsageCounts(),
])

printTable('Top paths by request count', byPath.result ?? byPath.data ?? byPath)
printTable('Top path + status', byPathStatus.result ?? byPathStatus.data ?? byPathStatus)

if (usage.error) {
  console.log(`\nUsage API: ${usage.error}`)
} else {
  const rows = usage.result ?? []
  const recent = rows.slice(-Math.min(rows.length, hours + 1))
  console.log('\n=== REST request counts (hourly buckets, recent) ===')
  for (const r of recent) {
    console.log(
      `${r.timestamp}\trest=${r.total_rest_requests ?? r.total_rest_requests}\tauth=${r.total_auth_requests}\tstorage=${r.total_storage_requests}`,
    )
  }
}
