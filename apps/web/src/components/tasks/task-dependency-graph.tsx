"use client";

import { useCallback, useMemo } from "react";
import {
  Node,
  Edge,
  useReactFlow,
  ReactFlowProvider,
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  Handle,
  Position,
  Connection,
  EdgeTypes,
  NodeTypes,
  XYPosition,
} from "@xyflow/react";
import { TaskStatus, TaskPriority } from "@antara/contracts";
import { AlertTriangle, GitBranch } from "lucide-react";

import { cn } from "@/lib/utils";

interface DependencyGraphNodeData {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  subsystem: string;
  assignee: { id: string; name: string } | null;
  isCriticalPath: boolean;
  [key: string]: unknown;
}

interface DependencyGraphEdgeData {
  type: "blocks" | "relates";
  [key: string]: unknown;
}

const statusColors: Record<TaskStatus, string> = {
  [TaskStatus.BACKLOG]: "bg-slate-500",
  [TaskStatus.TODO]: "bg-blue-500",
  [TaskStatus.IN_PROGRESS]: "bg-amber-500",
  [TaskStatus.BLOCKED]: "bg-red-500",
  [TaskStatus.REVIEW]: "bg-purple-500",
  [TaskStatus.COMPLETED]: "bg-emerald-500",
  [TaskStatus.OVERDUE]: "bg-rose-500",
};

const priorityColors: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: "bg-slate-400",
  [TaskPriority.MEDIUM]: "bg-blue-400",
  [TaskPriority.HIGH]: "bg-amber-400",
  [TaskPriority.CRITICAL]: "bg-red-400",
};

function TaskNode({ data }: { data: DependencyGraphNodeData }) {
  const { title, status, priority, subsystem, assignee, isCriticalPath } = data;
  const statusColor = statusColors[status] ?? "bg-slate-500";
  const priorityColor = priorityColors[priority] ?? "bg-slate-400";

  return (
    <div
      className={cn(
        "relative min-w-[220px] max-w-[280px] rounded-2xl border bg-white/5 backdrop-blur-sm p-4 shadow-xl transition-all",
        isCriticalPath && "border-saffron/50 ring-2 ring-saffron/30 animate-pulse",
      )}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-saffron/50" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-saffron/50" />

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusColor)}>
              {status}
            </span>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", priorityColor)}>
              {priority}
            </span>
          </div>
          <h3 className="font-semibold text-text truncate">{title}</h3>
          <p className="mt-1 text-xs text-muted">{subsystem}</p>
          {assignee && (
            <p className="mt-1 text-xs text-saffron/80 flex items-center gap-1">
              <GitBranch className="size-3" />
              {assignee.name}
            </p>
          )}
          {isCriticalPath && (
            <div className="mt-2 flex items-center gap-1 text-xs text-saffron">
              <AlertTriangle className="size-3" />
              <span>Critical Path</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskEdge({ data }: { data: DependencyGraphEdgeData }) {
  const isBlocks = data?.type === "blocks";

  return (
    <>
      <path
        stroke={isBlocks ? "#ef4444" : "#7d868c"}
        strokeWidth={isBlocks ? 2 : 1.5}
        strokeDasharray={isBlocks ? "8,4" : "4,4"}
        fill="none"
        className="transition-all duration-300"
      />
      <defs>
        <marker
          id={`arrowhead-${isBlocks ? "blocks" : "relates"}`}
          markerWidth={10}
          markerHeight={7}
          refX={9}
          refY={3.5}
          orient="auto"
        >
          <path
            d="M0,0 L0,7 L9,3.5 Z"
            fill={isBlocks ? "#ef4444" : "#7d868c"}
          />
        </marker>
      </defs>
    </>
  );
}

const nodeTypes: NodeTypes = {
  taskNode: TaskNode as any,
};

const edgeTypes: EdgeTypes = {
  taskEdge: TaskEdge as any,
};

interface DependencyGraphProps {
  nodes: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    subsystem: string;
    assignee: { id: string; name: string } | null;
    isCriticalPath: boolean;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: "blocks" | "relates";
  }>;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
}

export function DependencyGraph({
  nodes: nodeData,
  edges: edgeData,
  onNodeClick,
  className,
}: DependencyGraphProps) {
  const { fitView } = useReactFlow();

  const initialNodes = useMemo<Node[]>(
    () =>
      nodeData.map((n, index) => ({
        id: n.id,
        type: "taskNode",
        position: { x: (index % 3) * 280, y: Math.floor(index / 3) * 200 } as XYPosition,
        data: n,
      })),
    [nodeData],
  );

  const initialEdges = useMemo<Edge[]>(
    () =>
      edgeData.map((e) => ({
        id: `${e.from}-${e.to}`,
        source: e.from,
        target: e.to,
        type: "taskEdge",
        data: { type: e.type },
        animated: e.type === "blocks",
        style: { strokeWidth: 2 },
        markerEnd: {
          type: "arrowclosed",
          color: e.type === "blocks" ? "#ef4444" : "#7d868c",
          width: 20,
          height: 20,
        },
      })),
    [edgeData],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      console.log("Connection attempted:", connection);
    },
    [],
  );

  const onNodeClickHandler = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.stopPropagation();
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  return (
    <ReactFlowProvider>
      <div className={cn("w-full h-[500px]", className)}>
        <ReactFlow
          nodes={initialNodes}
          edges={initialEdges}
          onConnect={onConnect}
          onNodeClick={onNodeClickHandler}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          onlyRenderVisibleElements
          minZoom={0.3}
          maxZoom={2}
        >
          <Background gap={20} size={1} color="#7d868c33" />
          <Controls position="top-left" />
          <MiniMap
            position="bottom-right"
            nodeColor={(node) => (node.data.isCriticalPath ? "#c9782b" : "#3b82f6")}
            maskColor="rgba(15, 17, 21, 0.8)"
          />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

interface LegendProps {
  criticalPathCount: number;
}

export function DependencyGraphLegend({ criticalPathCount }: LegendProps) {
  return (
    <div className="card-dark rounded-xl p-4 border border-steel/30">
      <h4 className="text-sm font-semibold text-text mb-3">Legend</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-slate-500" />
          <span className="text-sm text-muted">Backlog</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-blue-500" />
          <span className="text-sm text-muted">Todo</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-amber-500" />
          <span className="text-sm text-muted">In Progress</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-red-500" />
          <span className="text-sm text-muted">Blocked</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-purple-500" />
          <span className="text-sm text-muted">Review</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-emerald-500" />
          <span className="text-sm text-muted">Completed</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-rose-500" />
          <span className="text-sm text-muted">Overdue</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-xl border-2 border-saffron/50 bg-saffron/10 flex items-center justify-center">
            <AlertTriangle className="size-3 text-saffron" />
          </div>
          <span className="text-sm text-text">Critical Path ({criticalPathCount})</span>
        </div>
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
          <span className="text-sm text-muted">Dependency (blocks)</span>
        </div>
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4,4">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
          <span className="text-sm text-muted">Related</span>
        </div>
      </div>
    </div>
  );
}