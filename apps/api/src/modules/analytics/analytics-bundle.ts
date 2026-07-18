export type AnalyticsBundle = {
  overview: {
    productivityIndex: number;
    subsystemVelocity: number;
    overdueRate: number;
    clubHealth: number;
  };
  velocity: Array<{ label: string; value: number }>;
  heatmap: Array<{ day: string; intensity: number }>;
  subsystems: Array<{ name: string; velocity: number; risk: number; completion: number }>;
};
