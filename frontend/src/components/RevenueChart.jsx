import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatMoney } from "../services/money";
export default function RevenueChart({ months }) {
  return (
    <ResponsiveContainer width="100%" height={245}>
      <BarChart
        data={months.map((x) => ({
          ...x,
          revenue_exact: x.revenue,
          expenses_exact: x.expenses,
          revenue: Number(x.revenue),
          expenses: Number(x.expenses),
        }))}
        barGap={5}
      >
        <CartesianGrid
          strokeDasharray="3 4"
          vertical={false}
          stroke="#edf1f7"
        />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#8993a6", fontSize: 12 }}
        />
        <YAxis
          tickFormatter={(n) => (n >= 1000 ? `${n / 1000}k` : n)}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#8993a6", fontSize: 11 }}
        />
        <Tooltip
          formatter={(v, name, item) =>
            formatMoney(item?.payload?.[item.dataKey + "_exact"] ?? v)
          }
          cursor={{ fill: "#f5f8fc" }}
        />
        <Bar
          dataKey="revenue"
          name="Received"
          fill="#528af3"
          radius={[5, 5, 0, 0]}
          maxBarSize={24}
        />
        <Bar
          dataKey="expenses"
          name="Expenses"
          fill="#cdddf8"
          radius={[5, 5, 0, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
