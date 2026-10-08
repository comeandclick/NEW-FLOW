'use client'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Series = { key: string; color: string; opacity?: number }
/** Thin recharts wrapper, lazy-loaded by pages so charts never weigh on first load. */
export default function BarChartView({ data, series, grid, yAxis, unit }: { data: Record<string, string | number>[]; series: Series[]; grid?: boolean; yAxis?: boolean; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        {grid && <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />}
        <XAxis dataKey="name" stroke="var(--text-3)" fontSize={11} tickLine={false} axisLine={false} />
        {yAxis && <YAxis stroke="var(--text-3)" fontSize={11} tickLine={false} axisLine={false} width={44} />}
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 12 }}
          formatter={unit ? (v) => [`${v} ${unit}`, ''] : undefined} />
        {series.map((s) => <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[6, 6, 0, 0]} opacity={s.opacity} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}
