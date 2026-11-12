import { z } from 'zod';

export const BrowserActionSchema = z.object({
  id: z.string().uuid({ message: 'Action ID must be a valid UUID' }),
  agentId: z.string().uuid({ message: 'Agent ID must be a valid UUID' }),
  type: z.enum(['navigate', 'click', 'input', 'submit', 'extract', 'execute_js']),
  url: z.string().url({ message: 'URL must be valid' }),
  intent: z.string().min(10, 'Intent must be descriptive'),
  summary: z.string().min(15, 'Summary must be meaningful'),
  parameters: z.record(z.any()).default({}),
  extractedPii: z.array(z.string()).default([]),
  riskScore: z.number().int().min(0).max(100).default(50),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
  metadata: z.record(z.any()).default({}),
});

export type BrowserAction = z.infer<typeof BrowserActionSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string().min(1, 'Rule ID is required'),
  name: z.string().min(3, 'Rule name must be at least 3 characters'),
  description: z.string().optional(),
  type: z.enum(['domain', 'action_type', 'risk_threshold', 'pii', 'keyword']),
  condition: z.object({
    operator: z.enum(['contains', 'equals', 'greater_than', 'in_list', 'matches']),
    value: z.union([
      z.string(),
      z.number(),
      z.array(z.string()),
      z.boolean(),
    ]),
  }),
  action: z.enum(['allow', 'deny', 'require_approval']),
  priority: z.number().int().min(0).max(100).default(50),
  enabled: z.boolean().default(true),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const parsePolicyRule = (data: unknown): PolicyRule => {
  return PolicyRuleSchema.parse(data);
};

export const EvaluationResultSchema = z.object({
  allow: z.boolean(),
  reason: z.string(),
  risk: z.number().int().min(0).max(100),
  triggeredRules: z.array(z.string()).default([]),
  suggestedDecision: z.enum(['approve', 'deny', 'escalate']).optional(),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

export const ApprovalDecisionSchema = z.object({
  actionId: z.string().uuid(),
  decision: z.enum(['approved', 'denied', 'escalated']),
  reason: z.string().optional(),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
  approver: z.string().default('human'),
  overridePolicy: z.boolean().default(false),
});

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ProposalSchema = z.object({
  action: BrowserActionSchema,
  session: z.object({
    id: z.string().uuid(),
    name: z.string(),
    connectedAt: z.string().datetime(),
    lastActive: z.string().datetime(),
    status: z.enum(['connected', 'disconnected']),
    currentUrl: z.string().optional(),
    actionCount: z.number().int().nonnegative(),
    riskProfile: z.enum(['low', 'medium', 'high']).optional(),
    metadata: z.record(z.any()).optional(),
  }),
  policyEvaluation: EvaluationResultSchema.optional(),
});

export type Proposal = z.infer<typeof ProposalSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  action: BrowserActionSchema,
  decision: ApprovalDecisionSchema,
  evaluation: EvaluationResultSchema,
  outcome: z.enum(['executed', 'blocked', 'escalated']),
  replayUrl: z.string().optional(),
});

export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AgentSessionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  connectedAt: z.string().datetime(),
  lastActive: z.string().datetime(),
  status: z.enum(['connected', 'disconnected']),
  currentUrl: z.string().url().optional(),
  actionCount: z.number().int().nonnegative().default(0),
  riskProfile: z.enum(['low', 'medium', 'high']).default('medium'),
  metadata: z.record(z.any()).optional(),
});

export type AgentSession = z.infer<typeof AgentSessionSchema>;

// Server-only event payloads
export const NewProposalPayloadSchema = z.object({
  proposal: ProposalSchema,
});

export const ApprovalDecisionPayloadSchema = z.object({
  decision: ApprovalDecisionSchema,
});

export type NewProposalPayload = z.infer<typeof NewProposalPayloadSchema>;
export type ApprovalDecisionPayload = z.infer<typeof ApprovalDecisionPayloadSchema>;
