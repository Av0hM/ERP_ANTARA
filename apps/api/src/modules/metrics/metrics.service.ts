import { Injectable, OnModuleInit } from "@nestjs/common";
import { Counter, Gauge, Histogram, Registry, LabelValues, Registry as PromRegistry } from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: PromRegistry;
  private readonly httpRequestsTotal: Counter<string>;
  private readonly httpRequestDuration: Histogram<string>;
  private readonly activeConnections: Gauge<string>;
  private readonly dbConnectionsActive: Gauge<string>;
  private readonly queueJobsPending: Gauge<string>;
  private readonly tasksCreatedTotal: Counter<string>;
  private readonly worklogsCreatedTotal: Counter<string>;
  private readonly aiInsightsGeneratedTotal: Counter<string>;

  constructor() {
    this.registry = new PromRegistry();
    this.registry.setDefaultLabels({ app: "antara-erp-api" });

    // Default Node.js metrics
    const collectDefaultMetrics = require("prom-client").collectDefaultMetrics;
    collectDefaultMetrics({ register: this.registry, prefix: "antara_" });

    // Custom metrics
    this.httpRequestsTotal = new Counter({
      name: "antara_http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: "antara_http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });

    this.activeConnections = new Gauge({
      name: "antara_active_connections",
      help: "Number of active connections",
      registers: [this.registry],
    });

    this.dbConnectionsActive = new Gauge({
      name: "antara_database_connections_active",
      help: "Number of active database connections",
      labelNames: ["state"],
      registers: [this.registry],
    });

    this.queueJobsPending = new Gauge({
      name: "antara_queue_jobs_pending",
      help: "Number of pending jobs in queue",
      labelNames: ["queue"],
      registers: [this.registry],
    });

    this.tasksCreatedTotal = new Counter({
      name: "antara_tasks_created_total",
      help: "Total number of tasks created",
      registers: [this.registry],
    });

    this.worklogsCreatedTotal = new Counter({
      name: "antara_worklogs_created_total",
      help: "Total number of worklogs created",
      registers: [this.registry],
    });

    this.aiInsightsGeneratedTotal = new Counter({
      name: "antara_ai_insights_generated_total",
      help: "Total number of AI insights generated",
      registers: [this.registry],
    });
  }

  onModuleInit() {
    // Metrics are already initialized in constructor
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