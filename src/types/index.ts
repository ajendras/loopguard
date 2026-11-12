/**
 * Core TypeScript definitions for LoopGuard
 *
 * Provides validated schemas and TypeScript interfaces for all major
 * entities exchanged between AI agents, the policy engine, the dashboard,
 * and the Socket.io transport layer.
 *
 * All schemas are built with Zod for runtime validation with clear,
 * user-friendly error messages.
 */

import { z } from 'zod';

export const BrowserActionSchema = z.object({
  id: z.string().uuid('Action ID must be a valid UUID'),
  agentId: z.string().min(1, 'Agent ID is required'),
  type: z.enum([
    'navigate',
    'click',
    'input',
    'submit',
    'scroll',
    'extract',
    'execute_js',
  ], { message: 'Invalid action type' }),
  url: z.string().url('Valid URL is required for every action'),
  intent: z
    .string()
    .min(5, 'Intent must be at least 5 characters')
    .max(200, 'Intent must not exceed 200 characters'),
  summary: z
    .string()
    .min(10, 'Summary must be at least 10 characters')
    .max(500, 'Summary must not exceed 500 characters'),
  parameters: z.record(z.any()).optional().default({}),
  extractedPii: z.array(z.string()).optional().default([]),
  riskScore: z
    .number()
    .min(0, 'Risk score cannot be negative')
    .max(100, 'Risk score cannot exceed 100')
    .optional()
    .default(30),
  timestamp: z.string().datetime('Timestamp must be a valid ISO datetime string'),
  metadata: z.record(z.any()).optional().default({}),
});

export type BrowserAction = z.infer<typeof BrowserActionSchema>;

export const ApprovalDecisionSchema = z.object({
  actionId: z.string().uuid('Action ID must be a valid UUID'),
  decision: z.enum(['approved', 'denied', 'escalated'], {
    message: 'Decision must be one of: approved, denied, escalated',
  }),
  reason: z
    .string()
    .max(300, 'Reason cannot exceed 300 characters')
    .optional(),
  overridePolicy: z.boolean().optional().default(false),
  timestamp: z.string().datetime('Timestamp must be a valid ISO datetime string'),
  approver: z.string().default('human'),
});

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string().uuid('Rule ID must be a valid UUID'),
  name: z.string().min(3, 'Rule name must be at least 3 characters'),
  description: z.string().optional(),
  type: z.enum(['domain', 'action_type', 'risk_threshold', 'pii', 'keyword'], {
    message: 'Invalid rule type',
  }),
  condition: z.object({
    operator: z.enum(['equals', 'contains', 'regex', 'greater_than', 'in_list']),
    value: z.union([z.string(), z.number(), z.array(z.string())]),
  }),
  action: z.enum(['allow', 'deny', 'require_approval'], {
    message: 'Rule action must be allow, deny, or require_approval',
  }),
  priority: z
    .number()
    .int('Priority must be an integer')
    .min(1, 'Priority must be at least 1')
    .max(100, 'Priority cannot exceed 100')
    .default(50),
  enabled: z.boolean().default(true),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const AgentSessionSchema = z.object({
  id: z.string().uuid('Session ID must be a valid UUID'),
  name: z.string().min(2, 'Agent name must be at least 2 characters'),
  connectedAt: z.string().datetime(),
  lastActive: z.string().datetime(),
  status: z.enum(['connected', 'disconnected', 'paused']),
  currentUrl: z.string().url().optional(),
  actionCount: z.number().int().min(0).default(0),
  riskProfile: z.enum(['low', 'medium', 'high']).default('medium'),
  metadata: z.record(z.any()).optional().default({}),
});

export type AgentSession = z.infer<typeof AgentSessionSchema>;

export interface EvaluationResult {
  /** Whether the action is allowed to proceed without human intervention */
  allow: boolean;
  /** Human-readable explanation of the decision */
  reason: string;
  /** Aggregated risk score (0-100) */
  risk: number;
  /** IDs of all rules that were triggered during evaluation */
  triggeredRules: string[];
  /** Suggested next step for the UI when risk is elevated */
  suggestedDecision?: 'approve' | 'deny';
}

export interface Proposal {
  action: BrowserAction;
  session: AgentSession;
  policyEvaluation?: EvaluationResult;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: BrowserAction;
  decision: ApprovalDecision;
  evaluation: EvaluationResult;
  outcome: 'executed' | 'blocked' | 'escalated';
  replayUrl?: string;
}

/** Helper to safely parse a BrowserAction with helpful errors */
export function parseBrowserAction(data: unknown): BrowserAction {
  try {
    return BrowserActionSchema.parse(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(
        `Invalid BrowserAction: ${err.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`
      );
    }
    throw err;
  }
}

/** Helper to safely parse a PolicyRule */
export function parsePolicyRule(data: unknown): PolicyRule {
  try {
    return PolicyRuleSchema.parse(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(
        `Invalid PolicyRule: ${err.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`
      );
    }
    throw err;
  }
}
