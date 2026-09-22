import { HeatmapCell } from "@/lib/operations-types";

export function HeatmapGrid({ data }: { data: HeatmapCell[] }) {
  return (
    <div className="card-dark rounded-[1.25rem] p-6">
      <p className="text-xs uppercase tracking-[0.28em] text-saffron">Contribution Heatmap</p>
      <h2 className="mt-2 text-xl font-semibold">Engineering effort density</h2>
      <div className="mt-6 grid grid-cols-7 gap-3">
        {data.map((cell) => (
          <div key={cell.day} className="space-y-2 text-center">
            <div
              className="h-20 rounded-2xl border border-steel/30"
              style={{
                background: `rgba(201, 120, 43, ${0.12 + cell.intensity * 0.14})`,
              }}
            />
            <p className="text-xs text-muted">{cell.day}</p>
          </div>
        ))}
      </div>
    </div>
  );
}