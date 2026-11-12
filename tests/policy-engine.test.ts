import { describe, it, expect, beforeEach } from 'vitest';
import PolicyEngine from '../src/lib/policy-engine';
import type { BrowserAction, PolicyRule } from '../src/types/index';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  it('initializes with exactly five secure default rules', () => {
    const rules = engine.listRules();
    expect(rules).toHaveLength(5);
    expect(rules.some((r) => r.name.includes('crypto exchanges'))).toBe(true);
    expect(rules.some((r) => r.name.includes('Protect PII'))).toBe(true);
    expect(rules.some((r) => r.name.includes('safe navigation'))).toBe(true);
  });

  it('allows low-risk navigation to safe domains', () => {
    const action: BrowserAction = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      agentId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'navigate',
      url: 'https://docs.example.com/getting-started',
      intent: 'Read documentation about the product',
      summary: 'The agent wants to learn more about the API before using it.',
      parameters: {},
      extractedPii: [],
      riskScore: 15,
      timestamp: new Date().toISOString(),
      metadata: { source: 'test' },
    };

    const result = engine.evaluate(action);
    expect(result.allow).toBe(true);
    expect(result.risk).toBeLessThan(45);
    expect(result.triggeredRules).toContain('rule-default-5');
    expect(result.suggestedDecision).toBe('approve');
  });

  it('denies navigation to crypto exchanges', () => {
    const action: BrowserAction = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      agentId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'navigate',
      url: 'https://www.coinbase.com/trade',
      intent: 'Buy bitcoin with bank account',
      summary: 'Agent is navigating to Coinbase to initiate a cryptocurrency purchase.',
      parameters: { action: 'buy' },
      extractedPii: [],
      riskScore: 65,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    const result = engine.evaluate(action);
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('Block known crypto exchanges');
    expect(result.risk).toBeGreaterThanOrEqual(90);
    expect(result.triggeredRules).toContain('rule-default-1');
    expect(result.suggestedDecision).toBe('deny');
  });

  it('requires human approval for submit actions', () => {
    const action: BrowserAction = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      agentId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'submit',
      url: 'https://checkout.example.com/pay',
      intent: 'Submit payment for order #39281',
      summary: 'Submitting checkout form with total $124.00',
      parameters: { amount: 124, method: 'card' },
      extractedPii: [],
      riskScore: 55,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    const result = engine.evaluate(action);
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('form submissions');
    expect(result.risk).toBeGreaterThan(60);
    expect(result.triggeredRules).toContain('rule-default-2');
  });

  it('detects PII and forces mandatory review', () => {
    const action: BrowserAction = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      agentId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'input',
      url: 'https://account.example.com/update',
      intent: 'Update profile with new email john.doe@example.com',
      summary: 'Saving new contact email john.doe@example.com and phone (415) 555-0123',
      parameters: { email: 'john.doe@example.com' },
      extractedPii: ['email'],
      riskScore: 30,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    const result = engine.evaluate(action);
    expect(result.triggeredRules).toContain('pii-detected');
    expect(result.triggeredRules).toContain('rule-default-4');
    expect(result.risk).toBeGreaterThan(70);
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('Personally identifiable information');
  });

  it('increases risk for dangerous keywords and high-severity actions', () => {
    const action: BrowserAction = {
      id: '550e8400-e29b-41d4-a716-446655440004',
      agentId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'execute_js',
      url: 'https://internal.example.com/admin',
      intent: 'Delete all user records permanently',
      summary: 'Executing JavaScript that calls the deleteAllUsers endpoint',
      parameters: { script: 'deleteAllUsers()' },
      extractedPii: [],
      riskScore: 40,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    const result = engine.evaluate(action);
    expect(result.risk).toBeGreaterThan(85);
    expect(result.allow).toBe(false);
  });

  it('applies domain sensitivity heuristics even without explicit rule match', () => {
    const action: BrowserAction = {
      id: '550e8400-e29b-41d4-a716-446655440005',
      agentId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'navigate',
      url: 'https://dashboard.stripe.com/payments',
      intent: 'Check recent transactions',
      summary: 'Reviewing payment history on Stripe dashboard',
      parameters: {},
      extractedPii: [],
      riskScore: 35,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    const result = engine.evaluate(action);
    expect(result.risk).toBeGreaterThan(55);
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('Sensitive domain detected');
  });

  it('supports custom rule sets passed to constructor', () => {
    const customRules: PolicyRule[] = [
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        name: 'Block social media',
        description: 'Prevent agents from visiting social networks',
        type: 'domain',
        condition: { operator: 'contains', value: 'twitter.com' },
        action: 'deny',
        priority: 90,
        enabled: true,
      },
    ];

    const customEngine = new PolicyEngine(customRules);
    const rules = customEngine.listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe('Block social media');

    const socialAction: BrowserAction = {
      id: '550e8400-e29b-41d4-a716-446655440006',
      agentId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'navigate',
      url: 'https://twitter.com/explore',
      intent: 'Check trending topics',
      summary: 'Opening Twitter to see what is trending today.',
      parameters: {},
      extractedPii: [],
      riskScore: 22,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    const result = customEngine.evaluate(socialAction);
    expect(result.allow).toBe(false);
    expect(result.triggeredRules).toContain('550e8400-e29b-41d4-a716-446655440010');
  });

  it('correctly calculates base risk scores by action type', () => {
    const cases: Array<{ type: BrowserAction['type']; expectedBase: number }> = [
      { type: 'navigate', expectedBase: 18 },
      { type: 'click', expectedBase: 25 },
      { type: 'input', expectedBase: 48 },
      { type: 'submit', expectedBase: 78 },
      { type: 'extract', expectedBase: 35 },
      { type: 'execute_js', expectedBase: 82 },
      { type: 'scroll', expectedBase: 12 },
    ];

    cases.forEach(({ type, expectedBase }) => {
      const action: BrowserAction = {
        id: '550e8400-e29b-41d4-a716-446655440007',
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        type,
        url: 'https://example.com',
        intent: `Test ${type} action`,
        summary: `Performing a ${type} operation for testing.`,
        parameters: {},
        extractedPii: [],
        riskScore: 10,
        timestamp: new Date().toISOString(),
        metadata: {},
      };

      const result = engine.evaluate(action);
      // Base risk plus any rule adjustments
      expect(result.risk).toBeGreaterThanOrEqual(expectedBase - 10);
    });
  });

  it('throws descriptive errors for invalid input', () => {
    expect(() => engine.evaluate({})).toThrow(/Invalid BrowserAction/);
    expect(() => engine.evaluate({ url: 'not-a-url' })).toThrow();
    
    const badAction = {
      id: 'not-a-uuid',
      agentId: '',
      type: 'navigate',
      url: 'https://ok.com',
      intent: 'x', // too short
      summary: 'short',
      timestamp: 'not-a-date',
    };
    
    expect(() => engine.evaluate(badAction)).toThrow(/Invalid BrowserAction/);
  });

  it('deduplicates triggered rules and returns immutable result', () => {
    const action: BrowserAction = {
      id: '550e8400-e29b-41d4-a716-446655440008',
      agentId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'submit',
      url: 'https://bank.example.com/transfer',
      intent: 'Transfer $5000 to external account',
      summary: 'High value transfer containing PII patterns',
      parameters: { amount: 5000 },
      extractedPii: ['credit_card'],
      riskScore: 92,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    const result = engine.evaluate(action);
    const uniqueRules = new Set(result.triggeredRules);
    expect(uniqueRules.size).toBe(result.triggeredRules.length);
    expect(result.allow).toBe(false);
  });

  it('supports dynamic rule addition and reset', () => {
    const initialLength = engine.listRules().length;

    const extraRule: PolicyRule = {
      id: '550e8400-e29b-41d4-a716-446655440009',
      name: 'Block localhost admin',
      type: 'domain',
      condition: { operator: 'contains', value: 'localhost' },
      action: 'deny',
      priority: 100,
      enabled: true,
    };

    engine.addRule(extraRule);
    expect(engine.listRules()).toHaveLength(initialLength + 1);
    expect(engine.listRules().some((r) => r.id === extraRule.id)).toBe(true);

    engine.resetToDefaults();
    expect(engine.listRules()).toHaveLength(5);
    expect(engine.listRules().some((r) => r.id === extraRule.id)).toBe(false);
  });
});
