import { Module, Global } from "@nestjs/common";
import { PrometheusModule } from "@willsoto/nestjs-prometheus";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
      defaultLabels: {
        app: "antara-erp-api",
      },
      customMetricPrefix: "antara_",
    }),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}