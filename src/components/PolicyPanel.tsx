'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Save, 
  Play, 
  Shield, 
  AlertCircle,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import PolicyEngine from '../lib/policy-engine';
import { parsePolicyRule, type PolicyRule, type BrowserAction, type EvaluationResult } from '../types/index';
import { z } from 'zod';

const LOCAL_STORAGE_KEY = 'loopguard-policies';

interface PolicyPanelProps {
  onRulesChange?: (rules: PolicyRule[]) => void;
}

const PolicyPanel: React.FC<PolicyPanelProps> = ({ onRulesChange }) => {
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [testInput, setTestInput] = useState({
    type: 'navigate' as BrowserAction['type'],
    url: 'https://shop.example.com/checkout',
    intent: 'Complete purchase of wireless headphones',
    summary: 'Agent is about to submit a payment form with stored card details.',
  });
  const [testResult, setTestResult] = useState<EvaluationResult | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [blockedDomains, setBlockedDomains] = useState<string[]>([
    'coinbase.com', 'binance.com', 'kraken.com'
  ]);
  const [riskThreshold, setRiskThreshold] = useState(75);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const engine = React.useMemo(() => new PolicyEngine(rules), [rules]);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsedRules = JSON.parse(saved);
        const validated = parsedRules.map((r: unknown) => parsePolicyRule(r));
        setRules(validated);
        onRulesChange?.(validated);
        
        // Extract risk threshold and blocked domains from rules
        const thresholdRule = validated.find(r => r.type === 'risk_threshold');
        if (thresholdRule && typeof thresholdRule.condition.value === 'number') {
          setRiskThreshold(thresholdRule.condition.value as number);
        }
        
        const domainRule = validated.find(r => 
          r.type === 'domain' && r.name.includes('crypto')
        );
        if (domainRule && Array.isArray(domainRule.condition.value)) {
          setBlockedDomains(domainRule.condition.value as string[]);
        }
      } catch (err) {
        console.warn('Failed to load saved policies, using defaults');
        loadDefaults();
      }
    } else {
      loadDefaults();
    }
  }, [onRulesChange]);

  const loadDefaults = () => {
    const defaultEngine = new PolicyEngine();
    const defaults = defaultEngine.listRules();
    setRules(defaults);
    onRulesChange?.(defaults);
  };

  const persistRules = useCallback((updatedRules: PolicyRule[]) => {
    try {
      setSaveStatus('saving');
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedRules, null, 2));
      setRules(updatedRules);
      onRulesChange?.(updatedRules);
      
      setTimeout(() => {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      }, 420);
    } catch (err) {
      console.error('Failed to persist policies:', err);
      setSaveStatus('idle');
    }
  }, [onRulesChange]);

  const toggleRule = (id: string) => {
    const updated = rules.map(rule => 
      rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
    );
    persistRules(updated);
  };

  const deleteRule = (id: string) => {
    const updated = rules.filter(rule => rule.id !== id);
    persistRules(updated);
  };

  const addDomainBlock = () => {
    if (!newDomain.trim()) return;
    
    const domain = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '');
    if (blockedDomains.includes(domain)) {
      setNewDomain('');
      return;
    }

    const updatedDomains = [...blockedDomains, domain];
    setBlockedDomains(updatedDomains);
    setNewDomain('');

    // Update or add the crypto/domain rule
    let domainRuleIndex = rules.findIndex(r => r.id === 'rule-default-1');
    const newRuleSet = [...rules];

    if (domainRuleIndex >= 0) {
      newRuleSet[domainRuleIndex] = {
        ...newRuleSet[domainRuleIndex],
        condition: { 
          operator: 'in_list' as const, 
          value: updatedDomains 
        }
      };
    } else {
      const newDomainRule: PolicyRule = {
        id: crypto.randomUUID(),
        name: 'Block high-risk domains',
        description: 'Prevent navigation to sensitive or blocked domains',
        type: 'domain',
        condition: { operator: 'in_list', value: updatedDomains },
        action: 'deny',
        priority: 95,
        enabled: true,
      };
      newRuleSet.push(parsePolicyRule(newDomainRule));
    }

    persistRules(newRuleSet);
  };

  const updateRiskThreshold = (newThreshold: number) => {
    setRiskThreshold(newThreshold);
    
    const updatedRules = rules.map(rule => {
      if (rule.type === 'risk_threshold') {
        return {
          ...rule,
          condition: { operator: 'greater_than' as const, value: newThreshold }
        };
      }
      return rule;
    });
    
    persistRules(updatedRules);
  };

  const resetToDefaults = () => {
    const defaultEngine = new PolicyEngine();
    const defaults = defaultEngine.getDefaultRules();
    setBlockedDomains(['coinbase.com', 'binance.com', 'kraken.com']);
    setRiskThreshold(75);
    persistRules(defaults);
    setTestResult(null);
  };

  const runTestEvaluation = () => {
    try {
      const testAction: BrowserAction = {
        id: crypto.randomUUID(),
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        type: testInput.type,
        url: testInput.url,
        intent: testInput.intent,
        summary: testInput.summary,
        parameters: {},
        extractedPii: testInput.summary.toLowerCase().includes('@') || 
                       testInput.summary.toLowerCase().includes('card') 
          ? ['email', 'credit_card'] 
          : [],
        riskScore: 45,
        timestamp: new Date().toISOString(),
        metadata: { testedInPanel: true },
      };

      const result = engine.evaluate(testAction, rules);
      setTestResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Evaluation failed';
      setTestResult({
        allow: false,
        reason: `Validation error: ${message}`,
        risk: 100,
        triggeredRules: ['validation-error'],
        suggestedDecision: 'deny',
      });
    }
  };

  const addCustomRule = () => {
    const newRuleInput = {
      id: crypto.randomUUID(),
      name: 'Custom domain rule',
      description: 'User-defined policy',
      type: 'domain' as const,
      condition: { operator: 'contains' as const, value: 'example.com' },
      action: 'require_approval' as const,
      priority: 60,
      enabled: true,
    };
    
    try {
      const validated = parsePolicyRule(newRuleInput);
      const updated = [...rules, validated];
      persistRules(updated);
      setIsEditing(true);
    } catch (err) {
      console.error('Failed to add custom rule', err);
    }
  };

  const getActionColor = (action: PolicyRule['action']) => {
    if (action === 'deny') return 'text-rose-400 border-rose-400/30 bg-rose-500/10';
    if (action === 'require_approval') return 'text-amber-400 border-amber-400/30 bg-amber-500/10';
    return 'text-emerald-400 border-emerald-400/30 bg-emerald-500/10';
  };

  return (
    <div className="bg-glass-dark border border-glass-border rounded-glass shadow-glass overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-glass-light/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-400 flex items-center justify-center">
            <Settings className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-white tracking-tight">Policy Engine</div>
            <div className="text-xs text-white/40 font-mono">REAL-TIME • {rules.length} RULES LOADED</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={resetToDefaults}
            className="flex items-center gap-2 px-4 h-8 text-xs rounded-2xl border border-white/20 hover:border-white/40 text-white/70 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => persistRules(rules)}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-5 h-8 rounded-2xl text-xs font-medium text-white border border-white/20 transition-all active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            {saveStatus === 'saved' ? 'SAVED' : 'SAVE'}
          </motion.button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {/* Quick Configuration */}
        <div>
          <div className="uppercase text-xs tracking-widest text-white/50 mb-4 flex items-center gap-2">
            <Shield className="w-3 h-3" />
            QUICK CONFIGURATION
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            {/* Domain Blocklist */}
            <div className="bg-glass-light/60 border border-white/10 rounded-3xl p-5">
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm font-medium text-white">Blocked Domains</div>
                <div className="text-[10px] px-3 py-1 bg-rose-400/10 text-rose-400 rounded-3xl border border-rose-400/30">
                  {blockedDomains.length} DOMAINS
                </div>
              </div>
              
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addDomainBlock()}
                  placeholder="stripe.com"
                  className="flex-1 bg-white/5 border border-white/20 focus:border-primary-400 rounded-2xl px-4 h-10 text-sm text-white placeholder:text-white/30 focus:outline-none"
                />
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={addDomainBlock}
                  className="bg-primary-500 hover:bg-primary-600 transition-colors w-10 h-10 flex items-center justify-center rounded-2xl text-white"
                >
                  <Plus className="w-4 h-4" />
                </motion.button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                  {blockedDomains.map((domain, index) => (
                    <motion.div
                      key={domain}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="bg-white/5 text-white/80 text-xs px-3 h-7 flex items-center rounded-3xl border border-white/10 group"
                    >
                      {domain}
                      <button
                        onClick={() => {
                          const updated = blockedDomains.filter((_, i) => i !== index);
                          setBlockedDomains(updated);
                          
                          const updatedRules = rules.map(r => {
                            if (r.id === 'rule-default-1' && Array.isArray(r.condition.value)) {
                              return {
                                ...r,
                                condition: { ...r.condition, value: updated }
                              };
                            }
                            return r;
                          });
                          persistRules(updatedRules.filter(Boolean));
                        }}
                        className="ml-2 text-white/30 hover:text-rose-400 transition-colors"
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Risk Threshold */}
            <div className="bg-glass-light/60 border border-white/10 rounded-3xl p-5">
              <div className="text-sm font-medium text-white mb-1">Risk Threshold</div>
              <div className="text-xs text-white/40 mb-4">Actions above this score require approval</div>
              
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="10"
                  max="95"
                  step="5"
                  value={riskThreshold}
                  onChange={(e) => updateRiskThreshold(parseInt(e.target.value))}
                  className="flex-1 accent-primary-500"
                />
                <div className="tabular-nums w-12 text-right font-mono text-2xl font-semibold text-accent-400">
                  {riskThreshold}
                </div>
              </div>
              
              <div className="h-2.5 mt-3 bg-white/10 rounded-3xl overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400 transition-all"
                  style={{ width: `${riskThreshold}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Active Rules */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="uppercase text-xs tracking-widest text-white/50">ACTIVE RULES</div>
            <motion.button
              onClick={addCustomRule}
              className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300"
            >
              <Plus className="w-3 h-3" /> ADD RULE
            </motion.button>
          </div>

          <div className="space-y-3 max-h-[340px] overflow-auto pr-2 custom-scroll">
            <AnimatePresence initial={false}>
              {rules.map((rule, index) => (
                <motion.div
                  key={rule.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.025, 0.3) }}
                  className="group bg-glass-light border border-white/10 hover:border-white/20 rounded-3xl p-5 flex items-center gap-5 transition-all"
                >
                  <div className={`px-3 py-0.5 text-[10px] font-mono rounded-3xl border ${getActionColor(rule.action)}`}>
                    {rule.action.toUpperCase()}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white text-sm leading-none">{rule.name}</div>
                    {rule.description && (
                      <div className="text-xs text-white/40 line-clamp-1 mt-1.5">{rule.description}</div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-[10px] font-mono bg-white/5 px-3 py-1 rounded-3xl text-white/50">
                      P{rule.priority}
                    </div>
                    
                    <label className="relative inline-flex cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={rule.enabled} 
                        onChange={() => toggleRule(rule.id)}
                        className="peer sr-only"
                      />
                      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-3xl peer peer-checked:bg-emerald-500 transition-all"></div>
                      <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-3xl transition-all peer-checked:translate-x-4" />
                    </label>
                    
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Test Harness */}
        <div className="pt-4 border-t border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div className="uppercase text-xs tracking-widest text-white/50 flex items-center gap-2">
              <Play className="w-3 h-3" />
              TEST HARNESS
            </div>
            <button
              onClick={runTestEvaluation}
              className="px-6 py-2 bg-gradient-to-r from-primary-500 to-accent-400 text-white text-xs font-medium rounded-3xl flex items-center gap-2 hover:brightness-110 active:scale-[0.985] transition-all"
            >
              RUN EVALUATION
            </button>
          </div>

          <div className="bg-glass-light border border-white/10 rounded-3xl p-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-white/50 block mb-2">ACTION TYPE</label>
                <select 
                  value={testInput.type}
                  onChange={(e) => setTestInput({ ...testInput, type: e.target.value as BrowserAction['type'] })}
                  className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 h-11 text-white text-sm focus:outline-none focus:border-primary-400"
                >
                  <option value="navigate">navigate</option>
                  <option value="click">click</option>
                  <option value="input">input</option>
                  <option value="submit">submit</option>
                  <option value="extract">extract</option>
                  <option value="execute_js">execute_js</option>
                </select>
              </div>
              
              <div>
                <label className="text-xs text-white/50 block mb-2">URL</label>
                <input 
                  type="text"
                  value={testInput.url}
                  onChange={(e) => setTestInput({ ...testInput, url: e.target.value })}
                  className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 h-11 text-white text-sm font-light focus:outline-none focus:border-primary-400"
                />
              </div>
            </div>

            <div className="mt-5">
              <label className="text-xs text-white/50 block mb-2">INTENT</label>
              <input 
                type="text"
                value={testInput.intent}
                onChange={(e) => setTestInput({ ...testInput, intent: e.target.value })}
                className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 h-11 text-white text-sm focus:outline-none focus:border-primary-400"
              />
            </div>

            <div className="mt-5">
              <label className="text-xs text-white/50 block mb-2">SUMMARY / CONTEXT</label>
              <textarea 
                value={testInput.summary}
                onChange={(e) => setTestInput({ ...testInput, summary: e.target.value })}
                rows={3}
                className="w-full resize-y bg-white/5 border border-white/20 rounded-3xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary-400 font-light"
              />
            </div>

            {testResult && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-5 rounded-3xl border bg-black/30 border-white/10"
              >
                <div className="flex items-center gap-3">
                  {testResult.allow ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                  <div className="flex-1">
                    <div className={`inline text-xs font-mono tracking-widest px-4 py-1 rounded-3xl border ${
                      testResult.risk > 80 
                        ? 'border-rose-400 text-rose-400' 
                        : testResult.risk > 55 
                          ? 'border-amber-400 text-amber-400' 
                          : 'border-emerald-400 text-emerald-400'
                    }`}>
                      RISK {testResult.risk} — {testResult.allow ? 'ALLOWED' : 'BLOCKED'}
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 text-sm text-white/90 leading-snug">
                  {testResult.reason}
                </div>
                
                {testResult.triggeredRules.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-5">
                    {testResult.triggeredRules.map((ruleId) => (
                      <span 
                        key={ruleId}
                        className="text-[10px] bg-white/5 px-3 py-px rounded font-mono text-white/40"
                      >
                        {ruleId}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-white/10 text-[10px] font-mono text-white/30 flex items-center justify-between bg-glass-light/30">
        <div>PERSISTED TO LOCALSTORAGE</div>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${saveStatus === 'saved' ? 'bg-emerald-400' : 'bg-white/30'}`} />
          LAST SAVED JUST NOW
        </div>
      </div>
    </div>
  );
};

export default PolicyPanel;
