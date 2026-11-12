/**
 * PolicyEngine.ts
 *
 * Central decision engine for LoopGuard. Evaluates every proposed
 * BrowserAction against a configurable set of PolicyRules, performs
 * PII detection, risk scoring, and returns a deterministic result.
 *
 * Features:
 * - Default high-security rule set focused on destructive actions
 * - Real-time PII scanning (email, phone, credit-card patterns)
 * - Domain sensitivity heuristics
 * - Priority-ordered rule evaluation (deny always wins)
 * - Full Zod validation with contextual error messages
 * - Immutable evaluation results for audit logging
 */

import { z } from 'zod';
import {
  BrowserAction,
  PolicyRule,
  EvaluationResult,
  parseBrowserAction,
  parsePolicyRule,
  BrowserActionSchema,
  PolicyRuleSchema,
} from '../types/index';

export class PolicyEngine {
  private rules: PolicyRule[] = [];

  /**
   * Create a new PolicyEngine.
   * If no rules are supplied, the secure default set is loaded.
   */
  constructor(initialRules: PolicyRule[] = []) {
    if (initialRules.length > 0) {
      this.rules = initialRules.map((r) => parsePolicyRule(r));
    } else {
      this.rules = this.getDefaultRules();
    }
    this.sortRulesByPriority();
  }

  /**
   * Evaluates a proposed browser action against the active policy set.
   * Returns a structured result containing allow/deny decision, risk,
   * and a list of triggered rules.
   *
   * @throws {Error} if the action fails Zod validation
   */
  public evaluate(
    actionInput: unknown,
    customRules: PolicyRule[] = []
  ): EvaluationResult {
    const action = parseBrowserAction(actionInput);
    const rulesToApply =
      customRules.length > 0
        ? customRules.map((r) => parsePolicyRule(r))
        : this.rules;

    let risk = this.calculateBaseRisk(action);
    const triggeredRules: string[] = [];
    let finalReason = 'No matching policy rules – defaulting to safe allow.';
    let allow = true;

    // PII detection augments risk and triggers dedicated rules
    const detectedPii = this.detectPii(
      `${action.summary} ${JSON.stringify(action.parameters || {})}`
    );
    if (detectedPii.length > 0) {
      risk = Math.min(100, risk + 40);
      triggeredRules.push('pii-detected');
      finalReason = 'Personally identifiable information detected in context.';
    }

    // Evaluate rules in descending priority order
    const sortedRules = [...rulesToApply].sort(
      (a, b) => b.priority - a.priority
    );

    for (const rule of sortedRules) {
      if (!rule.enabled) continue;

      if (this.ruleMatches(rule, action, risk)) {
        triggeredRules.push(rule.id);

        switch (rule.action) {
          case 'deny':
            allow = false;
            finalReason = `Explicitly denied by rule "${rule.name}"`;
            risk = Math.max(risk, 90);
            // Deny is terminal – break immediately
            break;
          case 'require_approval':
            allow = false;
            finalReason = `Human approval required by rule "${rule.name}"`;
            risk = Math.max(risk, 65);
            break;
          case 'allow':
            finalReason = `Explicitly permitted by rule "${rule.name}"`;
            break;
        }

        // Once a terminal decision is reached we can stop evaluating lower-priority rules
        if (!allow) break;
      }
    }

    // Domain sensitivity boost (applied after rules so that explicit rules can override)
    if (this.isSensitiveDomain(action.url)) {
      risk = Math.min(100, risk + 22);
      if (risk > 75 && allow) {
        finalReason =
          'Sensitive domain detected. Human review strongly recommended.';
        allow = false;
      }
    }

    const finalRisk = Math.round(Math.min(100, risk));

    return {
      allow: allow && finalRisk < 92,
      reason: finalReason,
      risk: finalRisk,
      triggeredRules: [...new Set(triggeredRules)], // deduplicate
      suggestedDecision: finalRisk > 68 ? 'deny' : 'approve',
    };
  }

  /** Calculates an initial risk score based on action type and intent keywords. */
  private calculateBaseRisk(action: BrowserAction): number {
    const typeScores: Record<BrowserAction['type'], number> = {
      navigate: 18,
      click: 25,
      input: 48,
      submit: 78,
      scroll: 12,
      extract: 35,
      execute_js: 82,
    };

    let score = typeScores[action.type] ?? 40;

    const dangerousKeywords = [
      'delete',
      'remove',
      'destroy',
      'password',
      'login',
      'transfer',
      'payment',
      'withdraw',
      'buy',
      'submit',
    ];

    const lowerIntent = action.intent.toLowerCase();
    if (dangerousKeywords.some((kw) => lowerIntent.includes(kw))) {
      score = Math.min(100, score + 32);
    }

    return score;
  }

  /** Returns true when a rule condition matches the current action context. */
  private ruleMatches(
    rule: PolicyRule,
    action: BrowserAction,
    currentRisk: number
  ): boolean {
    const { operator, value } = rule.condition;

    switch (rule.type) {
      case 'domain': {
        try {
          const hostname = new URL(action.url).hostname.toLowerCase();
          if (operator === 'contains' && typeof value === 'string') {
            return hostname.includes(value.toLowerCase());
          }
          if (operator === 'in_list' && Array.isArray(value)) {
            return value.some((v: string) =>
              hostname.includes(String(v).toLowerCase())
            );
          }
          return false;
        } catch {
          return false;
        }
      }

      case 'action_type':
        return operator === 'equals' && action.type === value;

      case 'risk_threshold':
        return (
          operator === 'greater_than' &&
          typeof value === 'number' &&
          currentRisk > value
        );

      case 'pii':
        return (
          (action.extractedPii && action.extractedPii.length > 0) ||
          this.detectPii(action.summary).length > 0
        );

      case 'keyword': {
        if (typeof value !== 'string') return false;
        const haystack = `${action.intent} ${action.summary}`.toLowerCase();
        return haystack.includes(value.toLowerCase());
      }

      default:
        return false;
    }
  }

  /** Simple regex-based PII detector. Returns an array of detected categories. */
  private detectPii(text: string): string[] {
    const findings: string[] = [];
    const normalized = text.toLowerCase();

    // Email address
    if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(normalized)) {
      findings.push('email');
    }

    // North-American style phone numbers
    if (/\b(?:\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(text)) {
      findings.push('phone');
    }

    // Credit-card like sequences (basic pattern, not full Luhn)
    if (/\b(?:\d[ -]*?){13,16}\b/.test(text)) {
      findings.push('credit_card');
    }

    return findings;
  }

  /** Returns true for domains that are typically high-risk (banking, crypto, admin panels). */
  private isSensitiveDomain(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const sensitiveTerms = [
        'bank',
        'chase',
        'wellsfargo',
        'paypal',
        'stripe',
        'coinbase',
        'binance',
        'kraken',
        'admin',
        'dashboard',
        'login',
        'account',
        'billing',
      ];
      return sensitiveTerms.some((term) => hostname.includes(term));
    } catch {
      return false;
    }
  }

  /** Returns a secure default rule set that ships with LoopGuard. */
  public getDefaultRules(): PolicyRule[] {
    const defaults: PolicyRule[] = [
      {
        id: 'rule-default-1',
        name: 'Block known crypto exchanges',
        description: 'Prevent navigation to high-risk financial platforms',
        type: 'domain',
        condition: { operator: 'in_list', value: ['coinbase', 'binance', 'kraken'] },
        action: 'deny',
        priority: 95,
        enabled: true,
      },
      {
        id: 'rule-default-2',
        name: 'Require approval for form submissions',
        description: 'Any submit action needs human sign-off',
        type: 'action_type',
        condition: { operator: 'equals', value: 'submit' },
        action: 'require_approval',
        priority: 80,
        enabled: true,
      },
      {
        id: 'rule-default-3',
        name: 'High risk threshold',
        description: 'Anything scoring above 75 requires approval',
        type: 'risk_threshold',
        condition: { operator: 'greater_than', value: 75 },
        action: 'require_approval',
        priority: 65,
        enabled: true,
      },
      {
        id: 'rule-default-4',
        name: 'Protect PII',
        description: 'Any action containing PII must be reviewed',
        type: 'pii',
        condition: { operator: 'equals', value: true },
        action: 'require_approval',
        priority: 98,
        enabled: true,
      },
      {
        id: 'rule-default-5',
        name: 'Allow safe navigation',
        description: 'General browsing is permitted',
        type: 'action_type',
        condition: { operator: 'equals', value: 'navigate' },
        action: 'allow',
        priority: 10,
        enabled: true,
      },
    ];

    return defaults.map((r) => PolicyRuleSchema.parse(r));
  }

  private sortRulesByPriority(): void {
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /** Add a new rule (will be re-sorted by priority). */
  public addRule(ruleInput: unknown): void {
    const validated = parsePolicyRule(ruleInput);
    this.rules.push(validated);
    this.sortRulesByPriority();
  }

  /** Replace the entire rule set. */
  public setRules(newRules: PolicyRule[]): void {
    this.rules = newRules.map((r) => parsePolicyRule(r));
    this.sortRulesByPriority();
  }

  /** Return a shallow copy of the currently active rules. */
  public listRules(): PolicyRule[] {
    return [...this.rules];
  }

  /** Reset to the built-in secure defaults. */
  public resetToDefaults(): void {
    this.rules = this.getDefaultRules();
  }
}

export default PolicyEngine;
