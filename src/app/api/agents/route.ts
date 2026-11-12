import { NextResponse } from 'next/server';
import { getConnectedAgents } from '../../../lib/socket-server';
import type { AgentSession, AuditLogEntry, BrowserAction, ApprovalDecision, EvaluationResult } from '../../../types/index';

const DEMO_HISTORY: AuditLogEntry[] = [
  {
    id: 'audit-001',
    timestamp: new Date(Date.now() - 1000 * 60 * 27).toISOString(),
    action: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'navigate',
      url: 'https://example.com/search?q=wireless-headphones',
      intent: 'Browse popular wireless headphones on a retail site',
      summary: 'The agent is navigating to an e-commerce product listing page to compare prices and reviews for Sony WH-1000XM5 headphones.',
      parameters: { query: 'wireless headphones' },
      extractedPii: [],
      riskScore: 24,
      timestamp: new Date(Date.now() - 1000 * 60 * 29).toISOString(),
      metadata: { source: 'playwright' },
    },
    decision: {
      actionId: '550e8400-e29b-41d4-a716-446655440001',
      decision: 'approved',
      reason: 'Safe navigation within allow-listed retail domain',
      timestamp: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
      approver: 'human',
    },
    evaluation: {
      allow: true,
      reason: 'Explicitly permitted by rule "Allow safe navigation"',
      risk: 24,
      triggeredRules: ['rule-default-5'],
      suggestedDecision: 'approve',
    },
    outcome: 'executed',
  },
  {
    id: 'audit-002',
    timestamp: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
    action: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'submit',
      url: 'https://checkout.stripe.com/pay',
      intent: 'Complete purchase of $239.00 headphones',
      summary: 'Submitting payment form with stored credit card ending in 4242. High risk action.',
      parameters: { amount: 239, cardLast4: '4242' },
      extractedPii: ['credit_card'],
      riskScore: 89,
      timestamp: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
      metadata: {},
    },
    decision: {
      actionId: '550e8400-e29b-41d4-a716-446655440002',
      decision: 'denied',
      reason: 'High risk payment action blocked by policy',
      timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      approver: 'human',
      overridePolicy: false,
    },
    evaluation: {
      allow: false,
      reason: 'Explicitly denied by rule "Protect PII"',
      risk: 92,
      triggeredRules: ['rule-default-4', 'pii-detected'],
      suggestedDecision: 'deny',
    },
    outcome: 'blocked',
  },
  {
    id: 'audit-003',
    timestamp: new Date(Date.now() - 1000 * 60 * 44).toISOString(),
    action: {
      id: '550e8400-e29b-41d4-a716-446655440003',
      agentId: '550e8400-e29b-41d4-a716-446655440002',
      type: 'extract',
      url: 'https://news.ycombinator.com',
      intent: 'Extract top 5 story titles and links',
      summary: 'Reading the front page of Hacker News and returning structured data.',
      parameters: { selector: '.titleline' },
      extractedPii: [],
      riskScore: 31,
      timestamp: new Date(Date.now() - 1000 * 60 * 46).toISOString(),
      metadata: { tool: 'puppeteer' },
    },
    decision: {
      actionId: '550e8400-e29b-41d4-a716-446655440003',
      decision: 'approved',
      reason: 'Low-risk data extraction',
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      approver: 'human',
    },
    evaluation: {
      allow: true,
      reason: 'No matching policy rules – defaulting to safe allow.',
      risk: 31,
      triggeredRules: [],
      suggestedDecision: 'approve',
    },
    outcome: 'executed',
  },
];

function getMockAgents(): AgentSession[] {
  return [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'ShoppingBot-v2',
      connectedAt: new Date(Date.now() - 1000 * 60 * 67).toISOString(),
      lastActive: new Date().toISOString(),
      status: 'connected',
      currentUrl: 'https://amazon.com',
      actionCount: 17,
      riskProfile: 'medium',
      metadata: { framework: 'playwright' },
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'ResearchAgent',
      connectedAt: new Date(Date.now() - 1000 * 60 * 183).toISOString(),
      lastActive: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      status: 'connected',
      currentUrl: 'https://news.ycombinator.com',
      actionCount: 41,
      riskProfile: 'low',
      metadata: { framework: 'puppeteer' },
    },
  ];
}

export async function GET() {
  let agents = getConnectedAgents();

  if (agents.length === 0) {
    agents = getMockAgents();
  }

  return NextResponse.json({
    success: true,
    agents,
    historicSessions: DEMO_HISTORY,
    totalHistoric: DEMO_HISTORY.length,
    timestamp: new Date().toISOString(),
  });
}
