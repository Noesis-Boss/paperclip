import { Link } from "@/lib/router";
import { AgentIcon } from "./AgentIconPicker";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import type { ActivityEvent, Agent } from "@paperclipai/shared";
import { issueStatusIcon, issueStatusIconDefault } from "../lib/status-colors";
import {
  FileText,
  UserPlus,
  Loader2,
  Bot,
  User,
  Settings,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function actionLabel(action: string, details?: Record<string, unknown> | null): string {
  switch (action) {
    case "issue.created":
      return "created a task";
    case "issue.document_created":
      return "created a document";
    case "issue.document_updated":
      return "updated a document";
    case "issue.updated": {
      const status = details?.status as string | undefined;
      if (status === "in_review") return "submitted for review";
      return "updated task";
    }
    case "approval.created":
      return "submitted for approval";
    case "approval.approved":
      return "approved";
    case "approval.rejected":
      return "requested changes";
    case "issue.work_product_created":
      return "delivered a work product";
    case "agent.created":
      return "new agent created";
    default:
      return action.replace(/[._]/g, " ");
  }
}

/** Map action → task status for the status circle indicator */
function deriveTaskStatus(action: string, details?: Record<string, unknown> | null): string | null {
  switch (action) {
    case "issue.created":
      return "todo";
    case "issue.updated": {
      const status = details?.status as string | undefined;
      return status ?? null;
    }
    case "issue.document_created":
    case "issue.document_updated":
      return "in_progress";
    case "issue.work_product_created":
      return "in_review";
    case "approval.created":
      return "in_review";
    case "approval.approved":
      return "done";
    case "approval.rejected":
      return "blocked";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Status Circle — matches StatusIcon rendering                       */
/* ------------------------------------------------------------------ */

function StatusCircle({ status, className }: { status: string; className?: string }) {
  const colorClass = issueStatusIcon[status] ?? issueStatusIconDefault;
  return (
    <span className={cn("relative inline-flex h-4 w-4 rounded-full border-2 shrink-0", colorClass, className)}>
      {status === "done" && (
        <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-current" />
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Actor Icon                                                         */
/* ------------------------------------------------------------------ */

function ActorIcon({ event, agentMap }: { event: ActivityEvent; agentMap: Map<string, Agent> }) {
  if (event.actorType === "agent") {
    const agent = agentMap.get(event.actorId);
    return <AgentIcon icon={agent?.icon ?? null} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  if (event.actorType === "user") {
    return <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  return <Settings className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface FeedCardProps {
  event: ActivityEvent;
  agentMap: Map<string, Agent>;
  entityNameMap: Map<string, string>;
  entityTitleMap?: Map<string, string>;
  entityStatusMap?: Map<string, string>;
  isActive?: boolean;
  className?: string;
}

export function FeedCard({
  event,
  agentMap,
  entityNameMap,
  entityTitleMap,
  entityStatusMap,
  isActive,
  className,
}: FeedCardProps) {
  const actor = event.actorType === "agent" ? agentMap.get(event.actorId) : null;
  const actorName = actor?.name
    ?? (event.actorType === "system" ? "System"
      : event.actorType === "user" ? "Board"
      : event.actorId || "Unknown");

  const entityName = entityNameMap.get(`${event.entityType}:${event.entityId}`);
  const entityTitle = entityTitleMap?.get(`${event.entityType}:${event.entityId}`);
  const details = event.details as Record<string, unknown> | null;
  const docKey = details?.key as string | undefined;
  const summary = details?.summary as string | undefined;

  // For approval events, resolve the agent name from requestedByAgentId
  // so we show "Tax Advisor" instead of an opaque approval UUID.
  const isApprovalEvent = event.entityType === "approval";
  const approvalAgentId = details?.requestedByAgentId as string | undefined;
  const approvalAgentName = approvalAgentId ? agentMap.get(approvalAgentId)?.name : undefined;

  const eventStatus = deriveTaskStatus(event.action, details);
  const currentStatus = entityStatusMap?.get(`${event.entityType}:${event.entityId}`) ?? null;
  const taskStatus = currentStatus ?? eventStatus;
  const isAgentEvent = event.action === "agent.created";

  // Determine the display title. For approval events, prefer the requesting
  // agent's name; if we can't resolve it (older events without the id in
  // details), fall back to a generic label rather than leaking a raw UUID.
  const approvalType = details?.type as string | undefined;
  const approvalFallbackTitle =
    approvalType === "agent_hire"
      ? "Agent hire"
      : approvalType
        ? `Approval · ${approvalType}`
        : "Approval request";
  const title = isAgentEvent
    ? (details?.name as string | undefined) ?? entityName ?? event.entityId
    : isApprovalEvent
      ? approvalAgentName ?? entityTitle ?? entityName ?? approvalFallbackTitle
      : docKey ?? entityTitle ?? entityName ?? event.entityId;

  // Link to permanent home — deep-link to the specific document when applicable
  const isDocEvent =
    event.action === "issue.document_created" || event.action === "issue.document_updated";
  const issueSlug = entityName ?? event.entityId;
  // Approval cards: approved hire_agent → agent detail page; anything else
  // (pending, rejected, or approved non-hire) → the approval detail page,
  // which is where the Board takes action on it from the inbox.
  const hiredAgentId = details?.hiredAgentId as string | undefined;
  const approvalLink =
    event.action === "approval.approved" && hiredAgentId
      ? `/agents/${hiredAgentId}`
      : `/approvals/${event.entityId}`;
  const link = event.entityType === "issue"
    ? isDocEvent && docKey
      ? `/issues/${issueSlug}#document-${encodeURIComponent(docKey)}`
      : `/issues/${issueSlug}`
    : event.entityType === "agent"
      ? `/agents/${event.entityId}`
      : event.entityType === "approval"
        ? approvalLink
        : null;

  // Status indicator for the body row
  const renderStatusIndicator = () => {
    if (isActive) {
      return <Loader2 className="h-4 w-4 shrink-0 text-amber-500 animate-spin" />;
    }
    if (isAgentEvent) {
      return <UserPlus className="h-4 w-4 shrink-0 text-purple-500" />;
    }
    if (event.action === "issue.document_created" || event.action === "issue.document_updated") {
      return <FileText className="h-4 w-4 shrink-0 text-blue-500" />;
    }
    if (taskStatus) {
      return <StatusCircle status={taskStatus} />;
    }
    return <StatusCircle status="backlog" />;
  };

  const card = (
    <div
      className={cn(
        "mx-3 my-2 rounded-lg border bg-card p-3 text-xs transition-all hover:bg-accent/50 hover:shadow-sm",
        link && "cursor-pointer",
        className,
      )}
    >
      {/* Top: actor icon + name + action + timestamp */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <ActorIcon event={event} agentMap={agentMap} />
          <span className="text-xs font-medium truncate text-muted-foreground">{actorName}</span>
          <span className="text-muted-foreground truncate text-xs">
            {actionLabel(event.action, details)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {timeAgo(event.createdAt)}
        </span>
      </div>

      {/* Body: status indicator + title */}
      <div className="flex items-center gap-2">
        {renderStatusIndicator()}
        <span className="font-medium truncate">{title}</span>
      </div>

      {/* Optional summary */}
      {summary && (
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
          {summary}
        </p>
      )}
    </div>
  );

  if (link) {
    return (
      <Link to={link} className="no-underline text-inherit block">
        {card}
      </Link>
    );
  }

  return card;
}
