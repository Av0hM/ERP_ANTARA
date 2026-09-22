"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendPoint } from "@antara/contracts";

export function VelocityChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="card-dark rounded-[1.25rem] p-6">
      <p className="text-xs uppercase tracking-[0.28em] text-saffron">Velocity Trend</p>
      <h2 className="mt-2 text-xl font-semibold">Subsystem execution momentum</h2>
      <div className="mt-6 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="velocity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c9782b" stopOpacity={0.55} />
                <stop offset="95%" stopColor="#c9782b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(125, 134, 140, 0.2)" vertical={false} />
            <XAxis dataKey="label" stroke="#d8d3ca" />
            <YAxis stroke="#d8d3ca" />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke="#c9782b" fill="url(#velocity)" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}