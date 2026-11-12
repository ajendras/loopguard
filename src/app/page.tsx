'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Users, 
  Clock, 
  Plus, 
  Download, 
  Activity 
} from 'lucide-react';
import ActionPreview from '../components/ActionPreview';
import type { 
  Proposal, 
  AgentSession, 
  AuditLogEntry, 
  ApprovalDecision, 
  BrowserAction 
} from '../types/index';

const createMockProposal = (id: string): Proposal => {
  const baseActions: Array<Partial<BrowserAction>> = [
    {
      type: 'navigate',
      url: 'https://shop.example.com/products/summer-sale',
      intent: 'Browse summer collection for lightweight jackets',
      summary: 'Agent wants to visit a retail site to gather product information and pricing for a summer apparel campaign.',
      parameters: { category: 'jackets' },
      extractedPii: [],
      riskScore: 28,
    },
    {
      type: 'input',
      url: 'https://account.example.com/settings',
      intent: 'Enter new shipping address for order #39281',
      summary: 'The agent is about to fill a form with name, street address and postal code. No credit card data present.',
      parameters: { field: 'address' },
      extractedPii: ['address'],
      riskScore: 67,
    },
    {
      type: 'click',
      url: 'https://bank.example.com/transfer',
      intent: 'Initiate a wire transfer of $1250',
      summary: 'High risk financial action. Agent is attempting to move money to an external account.',
      parameters: { amount: 1250, recipient: 'ACME Corp' },
      extractedPii: [],
      riskScore: 94,
    },
  ];

  const actionBase = baseActions[Math.floor(Math.random() * baseActions.length)];
  const timestamp = new Date().toISOString();

  const action: BrowserAction = {
    id: `act-${Date.now()}`,
    agentId: '550e8400-e29b-41d4-a716-446655440000',
    type: actionBase.type!,
    url: actionBase.url!,
    intent: actionBase.intent!,
    summary: actionBase.summary!,
    parameters: actionBase.parameters || {},
    extractedPii: actionBase.extractedPii || [],
    riskScore: actionBase.riskScore || 45,
    timestamp,
    metadata: { simulated: true },
  };

  const session: AgentSession = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'ShoppingBot-v2',
    connectedAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    lastActive: timestamp,
    status: 'connected',
    currentUrl: action.url,
    actionCount: 19,
    riskProfile: 'medium',
  };

  return {
    action,
    session,
    policyEvaluation: {
      allow: false,
      reason: 'Human review required per policy',
      risk: action.riskScore,
      triggeredRules: action.riskScore > 70 ? ['rule-default-3', 'risk_threshold'] : ['rule-default-2'],
      suggestedDecision: action.riskScore > 68 ? 'deny' : 'approve',
    },
  };
};

export default function LoopGuardDashboard() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [agents, setAgents] = useState<AgentSession[]>([]);
  const [history, setHistory] = useState<AuditLogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Load initial data from REST endpoint
  const loadInitialData = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      
      setAgents(data.agents || []);
      setHistory(data.historicSessions || []);
      
      // Seed with one live proposal
      if (proposals.length === 0) {
        setProposals([createMockProposal('seed-1')]);
      }
    } catch (err) {
      console.warn('Failed to load initial data from API, using mocks');
      setAgents([
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'ShoppingBot-v2',
          connectedAt: new Date(Date.now() - 1000 * 60 * 67).toISOString(),
          lastActive: new Date().toISOString(),
          status: 'connected',
          currentUrl: 'https://shop.example.com',
          actionCount: 19,
          riskProfile: 'medium',
        },
      ]);
      setHistory([]);
    }
  }, [proposals.length]);

  useEffect(() => {
    loadInitialData();
    
    // Simulate occasional new proposals
    const interval = setInterval(() => {
      if (Math.random() > 0.6 && proposals.length < 3) {
        const newProposal = createMockProposal(`live-${Date.now()}`);
        setProposals((prev) => [newProposal, ...prev]);
        setLastUpdated(new Date());
        
        // Optional browser notification
        if (Notification.permission === 'granted' && newProposal.action.riskScore > 65) {
          new Notification('LoopGuard Alert', {
            body: `High-risk action proposed: ${newProposal.action.intent}`,
            icon: '/favicon.ico',
          });
        }
      }
    }, 13500);

    return () => clearInterval(interval);
  }, [loadInitialData, proposals.length]);

  const removeProposal = (actionId: string) => {
    setProposals((prev) => prev.filter((p) => p.action.id !== actionId));
  };

  const addToHistory = (proposal: Proposal, decision: ApprovalDecision, outcome: 'executed' | 'blocked' | 'escalated') => {
    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: proposal.action,
      decision,
      evaluation: proposal.policyEvaluation || {
        allow: decision.decision === 'approved',
        reason: decision.reason || 'Manual decision',
        risk: proposal.action.riskScore || 50,
        triggeredRules: [],
      },
      outcome,
      replayUrl: `/replay/${proposal.action.id}`,
    };
    
    setHistory((prev) => [logEntry, ...prev].slice(0, 12));
    setLastUpdated(new Date());
  };

  const handleApprove = (proposal: Proposal, decision: ApprovalDecision) => {
    removeProposal(proposal.action.id);
    addToHistory(proposal, decision, 'executed');
    console.log(`[LoopGuard] APPROVED action ${decision.actionId}`);
    // In full implementation this would call socket.emit('approval_decision', decision)
  };

  const handleDeny = (proposal: Proposal, decision: ApprovalDecision) => {
    removeProposal(proposal.action.id);
    addToHistory(proposal, decision, 'blocked');
    console.log(`[LoopGuard] DENIED action ${decision.actionId}`);
  };

  const handleEscalate = (proposal: Proposal, decision: ApprovalDecision) => {
    removeProposal(proposal.action.id);
    addToHistory(proposal, { ...decision, decision: 'escalated' }, 'escalated');
    console.log(`[LoopGuard] ESCALATED action ${decision.actionId}`);
  };

  const simulateNewProposal = () => {
    const newProposal = createMockProposal(`sim-${Date.now()}`);
    setProposals((prev) => [newProposal, ...prev]);
    setLastUpdated(new Date());
  };

  const exportHistory = () => {
    const json = JSON.stringify(history, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loopguard-audit-${new Date().toISOString().slice(0, 16)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-mesh-soft overflow-hidden relative">
      {/* Subtle mesh overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff15_0.8px,transparent_1px)] [background-size:48px_48px] pointer-events-none" />
      
      <div className="relative z-10 max-w-[1480px] mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 bg-glass-dark/70 backdrop-blur-glass px-10 py-5">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-400 flex items-center justify-center shadow-glass-inner">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tighter text-white">loopguard</h1>
              <p className="text-[10px] text-white/40 -mt-1 font-mono">HUMAN-IN-THE-LOOP AI OVERSIGHT</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-glass-light/80 backdrop-blur-md px-4 h-9 rounded-3xl border border-white/10">
              <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="text-xs font-medium text-white/80">LIVE • SELF-HOSTED</span>
            </div>

            <button
              onClick={simulateNewProposal}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors text-white text-sm font-medium px-5 h-9 rounded-2xl border border-white/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              SIMULATE PROPOSAL
            </button>

            <button
              onClick={exportHistory}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors text-white text-sm font-medium px-5 h-9 rounded-2xl border border-white/20 active:scale-95"
            >
              <Download className="w-4 h-4" />
              EXPORT
            </button>

            <div className="text-xs text-white/40 font-mono tabular-nums">
              UPDATED {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </header>

        <div className="flex h-[calc(100vh-78px)]">
          {/* Left Sidebar - Connected Agents */}
          <div className="w-80 border-r border-white/10 bg-glass-dark/40 backdrop-blur-glass p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="uppercase text-xs tracking-[0.5px] font-medium text-white/60 flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                CONNECTED AGENTS
              </div>
              <div className="px-2.5 py-0.5 text-[10px] rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/30">
                {agents.length} LIVE
              </div>
            </div>

            <div className="space-y-3 flex-1">
              <AnimatePresence>
                {agents.map((agent) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-glass-light border border-white/10 rounded-3xl p-5 hover:border-primary-500/30 group transition-all"
                  >
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium text-white">{agent.name}</div>
                        <div className="text-xs text-white/50 font-mono mt-0.5">{agent.id.slice(0, 8)}…</div>
                      </div>
                      <div className={`text-[10px] px-3 h-5 flex items-center rounded-3xl border ${agent.status === 'connected' ? 'border-emerald-400 text-emerald-400 bg-emerald-400/10' : 'border-amber-400 text-amber-400'}`}>
                        {agent.status}
                      </div>
                    </div>
                    
                    <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-white/40">ACTIONS</div>
                        <div className="text-2xl font-semibold text-white tabular-nums mt-0.5">{agent.actionCount}</div>
                      </div>
                      <div>
                        <div className="text-white/40">RISK</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className={`h-2 w-2 rounded-full ${agent.riskProfile === 'low' ? 'bg-emerald-400' : agent.riskProfile === 'medium' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                          <span className="capitalize text-white">{agent.riskProfile}</span>
                        </div>
                      </div>
                    </div>
                    
                    {agent.currentUrl && (
                      <div className="mt-4 text-[10px] text-white/40 line-clamp-1 font-mono">
                        {agent.currentUrl.replace('https://', '')}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="mt-auto pt-8 border-t border-white/10">
              <div className="text-[10px] text-white/30 leading-relaxed">
                All agents authenticated via Socket.io.<br />
                Policy engine running with 5 active rules.
              </div>
            </div>
          </div>

          {/* Main Content - Live Feed */}
          <div className="flex-1 flex flex-col">
            <div className="px-8 pt-8 pb-4 border-b border-white/10 bg-glass-dark/30 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Activity className="text-primary-500" />
                <div>
                  <div className="text-white text-2xl font-medium tracking-tight">Live Proposals</div>
                  <div className="text-sm text-white/50">Awaiting human review • Real-time from connected agents</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 text-xs uppercase font-mono tracking-widest text-white/40">
                <div className="bg-white/5 px-4 py-2 rounded-3xl border border-white/10">
                  {proposals.length} PENDING
                </div>
              </div>
            </div>

            <div className="flex-1 p-8 overflow-auto">
              {proposals.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-6">
                    <Shield className="w-8 h-8 text-white/30" />
                  </div>
                  <div className="text-white/70 text-xl">All clear</div>
                  <p className="max-w-xs text-white/40 mt-3">No pending actions. Your AI agents are idle or operating within safe policy bounds.</p>
                  <button 
                    onClick={simulateNewProposal}
                    className="mt-10 text-sm border border-white/20 hover:border-white/40 transition-colors px-6 py-3 rounded-2xl text-white/70 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> CREATE TEST PROPOSAL
                  </button>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto space-y-6 pb-12">
                  <AnimatePresence initial={false}>
                    {proposals.map((proposal) => (
                      <ActionPreview
                        key={proposal.action.id}
                        proposal={proposal}
                        onApprove={(decision) => handleApprove(proposal, decision)}
                        onDeny={(decision) => handleDeny(proposal, decision)}
                        onEscalate={(decision) => handleEscalate(proposal, decision)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - Audit History */}
          <div className="w-96 border-l border-white/10 bg-glass-dark/60 backdrop-blur-glass flex flex-col">
            <div className="px-6 py-6 border-b border-white/10 flex items-center justify-between">
              <div className="uppercase text-xs font-medium tracking-widest text-white/60 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                AUDIT TRAIL
              </div>
              <div className="text-[10px] text-white/40 font-mono">{history.length} entries</div>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
              <AnimatePresence>
                {history.map((entry, index) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.6) }}
                    className="bg-glass-light border border-white/10 rounded-3xl p-5 text-xs group"
                  >
                    <div className="flex justify-between items-start">
                      <div className="line-clamp-2 font-medium text-white pr-2">
                        {entry.action.intent}
                      </div>
                      <div
                        className={`text-[9px] font-mono uppercase tracking-widest px-3 py-px rounded-3xl border self-start mt-0.5 ${
                          entry.outcome === 'executed'
                            ? 'border-emerald-400 text-emerald-300'
                            : entry.outcome === 'blocked'
                            ? 'border-rose-400 text-rose-300'
                            : 'border-amber-400 text-amber-300'
                        }`}
                      >
                        {entry.outcome}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4 text-white/40">
                      <span className="font-mono text-[10px]">{new Date(entry.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                      <span className="text-white/20">•</span>
                      <span className="font-medium text-accent-400">{entry.action.type}</span>
                    </div>

                    <div className="mt-3 text-[10px] text-white/50 line-clamp-2">
                      {entry.evaluation.reason}
                    </div>

                    {entry.action.extractedPii && entry.action.extractedPii.length > 0 && (
                      <div className="inline-flex mt-3 text-rose-400 text-[10px] items-center gap-1">
                        <span className="block w-1.5 h-1.5 bg-current rounded-full" />
                        PII DETECTED
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {history.length === 0 && (
                <div className="h-full flex items-center justify-center text-white/30 text-sm">
                  History will appear here
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 text-[10px] text-center text-white/30 font-mono">
              Immutable • Signed • Exportable
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
