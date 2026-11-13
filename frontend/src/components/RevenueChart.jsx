import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
export default function RevenueChart({ months }) {
  return (
    <ResponsiveContainer width="100%" height={245}>
      <BarChart
        data={months.map((x) => ({
          ...x,
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
        <Tooltip formatter={(v) => money(v)} cursor={{ fill: "#f5f8fc" }} />
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
