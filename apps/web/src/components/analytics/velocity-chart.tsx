"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendPoint } from "@antara/contracts";

export function VelocityChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="glass-panel rounded-3xl p-6">
      <p className="text-xs uppercase tracking-[0.28em] text-accent">Velocity Trend</p>
      <h2 className="mt-2 text-xl font-semibold">Subsystem execution momentum</h2>
      <div className="mt-6 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="velocity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7ef2c6" stopOpacity={0.55} />
                <stop offset="95%" stopColor="#7ef2c6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="label" stroke="#8ba0c7" />
            <YAxis stroke="#8ba0c7" />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke="#7ef2c6" fill="url(#velocity)" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


