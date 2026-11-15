import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LEAD_PLATFORM_LABELS } from '#/lib/leads'
import {
  LEAD_STATS_PERIODS,
  type LeadStatsPeriod,
  type PlatformStats,
} from '#/lib/lead-stats'
import { getLeadStats } from '#/server/leads-actions'

const config = {
  saved: { label: 'Saved', color: 'var(--chart-1)' },
  messaged: { label: 'Messaged', color: 'var(--chart-2)' },
  replied: { label: 'Replied', color: 'var(--chart-3)' },
  won: { label: 'Won', color: 'var(--chart-4)' },
  closedNoReply: { label: 'Closed, no reply', color: 'var(--chart-5)' },
} satisfies ChartConfig

const percent = (value: number | null) =>
  value === null ? 'No data' : `${Math.round(value * 100)}%`

export function StatsPanel() {
  const [period, setPeriod] = useState<LeadStatsPeriod>(90)
  const [loaded, setLoaded] = useState<{
    period: LeadStatsPeriod
    rows: PlatformStats[] | null
  } | null>(null)

  useEffect(() => {
    let current = true
    getLeadStats({ data: period })
      .then((rows) => current && setLoaded({ period, rows }))
      .catch(() => current && setLoaded({ period, rows: null }))
    return () => {
      current = false
    }
  }, [period])

  // Results for another period are stale, so show the loading state.
  const ready = loaded?.period === period ? loaded : null
  const stats = ready?.rows ?? null
  const failed = ready !== null && ready.rows === null

  const data = (stats ?? []).map((row) => ({
    ...row,
    label: LEAD_PLATFORM_LABELS[row.platform],
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stats by platform</CardTitle>
        <CardDescription>
          Counts each lead once per step, from the events logged in the period.
        </CardDescription>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Select
            value={String(period)}
            onValueChange={(value) =>
              setPeriod(Number(value) as LeadStatsPeriod)
            }
          >
            <SelectTrigger aria-label="Period" className="w-40">
              <SelectValue>{`Last ${period} days`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATS_PERIODS.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  Last {days} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {failed ? (
          <p className="text-sm text-destructive">Could not load stats.</p>
        ) : ready === null ? (
          <p className="text-sm text-muted-foreground">Loading stats</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No lead activity in this period.
          </p>
        ) : (
          <>
            <ChartContainer config={config} className="h-56 w-full">
              <BarChart data={data}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {Object.keys(config).map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={`var(--color-${key})`}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Saved</TableHead>
                  <TableHead className="text-right">Messaged</TableHead>
                  <TableHead className="text-right">Replied</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">No reply</TableHead>
                  <TableHead className="text-right">Reply rate</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.platform}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right">{row.saved}</TableCell>
                    <TableCell className="text-right">{row.messaged}</TableCell>
                    <TableCell className="text-right">{row.replied}</TableCell>
                    <TableCell className="text-right">{row.won}</TableCell>
                    <TableCell className="text-right">
                      {row.closedNoReply}
                    </TableCell>
                    <TableCell className="text-right">
                      {percent(row.replyRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {percent(row.winRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}
