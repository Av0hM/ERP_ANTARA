import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { Counter, Gauge, Histogram, Registry, LabelValues } from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit {
  constructor(
    @InjectMetric("http_requests_total")
    private readonly httpRequestsTotal: Counter<string>,
    @InjectMetric("http_request_duration_seconds")
    private readonly httpRequestDuration: Histogram<string>,
    @InjectMetric("active_connections")
    private readonly activeConnections: Gauge<string>,
    @InjectMetric("database_connections_active")
    private readonly dbConnectionsActive: Gauge<string>,
    @InjectMetric("queue_jobs_pending")
    private readonly queueJobsPending: Gauge<string>,
    @InjectMetric("tasks_created_total")
    private readonly tasksCreatedTotal: Counter<string>,
    @InjectMetric("worklogs_created_total")
    private readonly worklogsCreatedTotal: Counter<string>,
    @InjectMetric("ai_insights_generated_total")
    private readonly aiInsightsGeneratedTotal: Counter<string>,
    private readonly registry: Registry,
  ) {}

  onModuleInit() {
    this.registry.setDefaultLabels({
      app: "antara-erp-api",
    });
  }

  recordHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number) {
    const labels: LabelValues<string> = { method, route, status_code: String(statusCode) };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, durationSeconds);
  }

  setActiveConnections(count: number) {
    this.activeConnections.set(count);
  }

  setDatabaseConnections(active: number, idle: number) {
    const activeLabels: LabelValues<string> = { state: "active" };
    const idleLabels: LabelValues<string> = { state: "idle" };
    this.dbConnectionsActive.set(activeLabels, active);
    this.dbConnectionsActive.set({ state: "idle" }, idle);
  }

  setQueueJobsPending(queueName: string, count: number) {
    const labels: LabelValues<string> = { queue: queueName };
    this.queueJobsPending.set(labels, count);
  }

  incrementTasksCreated() {
    this.tasksCreatedTotal.inc();
  }

  incrementWorklogsCreated() {
    this.worklogsCreatedTotal.inc();
  }

  incrementAiInsightsGenerated() {
    this.aiInsightsGeneratedTotal.inc();
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}