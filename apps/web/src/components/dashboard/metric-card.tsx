import { DashboardMetric } from "@antara/contracts";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

interface ExtendedMetric {
  label: string;
  value: string;
  delta?: string;
  direction?: "up" | "down" | "flat";
  trend?: "up" | "down" | "neutral";
  icon?: React.ElementType;
}

const iconMap = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: ArrowRight,
};

export function MetricCard({ metric }: { metric: ExtendedMetric }) {
  const Icon = metric.icon ?? (metric.direction ? iconMap[metric.direction] : ArrowRight);

  return (
    <div className="glass-panel rounded-3xl p-5">
      <p className="text-sm text-muted">{metric.label}</p>
      <div className="mt-3 flex items-end justify-between">
        <h3 className="text-3xl font-semibold">{metric.value}</h3>
        {metric.delta && (
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-accent">
            <Icon className="size-4" />
            {metric.delta}
          </div>
        )}
      </div>
    </div>
  );
}


