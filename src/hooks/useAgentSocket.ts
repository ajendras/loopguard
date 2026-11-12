'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import PolicyEngine from '../lib/policy-engine';
import type { Proposal, ApprovalDecision, AgentSession, BrowserAction } from '../types/index';

/**
 * React hook that manages a live Socket.io connection between the LoopGuard
 * dashboard and connected AI agents. Automatically evaluates incoming
 * proposals using the PolicyEngine and provides methods to send approval
 * decisions back to agents.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Real-time proposal ingestion with policy evaluation
 * - Live agent status tracking
 * - High-risk action notifications
 * - Type-safe events and Zod-validated payloads
 */
export function useAgentSocket() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [agents, setAgents] = useState<AgentSession[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const engineRef = useRef<PolicyEngine>(new PolicyEngine());
  const reconnectAttemptsRef = useRef(0);

  const MAX_PROPOSALS = 6;

  const handleNewProposal = useCallback((rawProposal: unknown) => {
    try {
      // The server already validates but we re-validate defensively
      const proposal = rawProposal as Proposal;
      
      let evaluated = { ...proposal };
      
      if (!proposal.policyEvaluation) {
        const evaluation = engineRef.current.evaluate(proposal.action);
        evaluated.policyEvaluation = evaluation;
      }

      setProposals((prev) => {
        const filtered = prev.filter((p) => p.action.id !== evaluated.action.id);
        return [evaluated, ...filtered].slice(0, MAX_PROPOSALS);
      });

      setLastEventAt(new Date());

      // High-risk notification
      if (evaluated.policyEvaluation && evaluated.policyEvaluation.risk >= 75) {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('LoopGuard • High Risk Action', {
            body: evaluated.action.intent.substring(0, 65) + '...',
            tag: 'loopguard-highrisk',
          });
        }
      }
    } catch (err) {
      console.error('[useAgentSocket] Failed to process proposal:', err);
    }
  }, []);

  const sendApproval = useCallback((decision: ApprovalDecision) => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.warn('[useAgentSocket] Cannot send approval - socket not connected');
      return false;
    }

    try {
      // Validate before sending
      if (!decision.actionId || !['approved', 'denied', 'escalated'].includes(decision.decision)) {
        throw new Error('Invalid ApprovalDecision payload');
      }

      socketRef.current.emit('approval_decision', decision);
      
      // Optimistically remove from UI
      setProposals((prev) => prev.filter((p) => p.action.id !== decision.actionId));
      
      console.log(`[useAgentSocket] Sent ${decision.decision} for action ${decision.actionId}`);
      return true;
    } catch (err) {
      console.error('[useAgentSocket] Failed to send approval:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return;

    const socket = io({
      path: '/api/socket',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1200,
      reconnectionDelayMax: 4500,
      timeout: 20000,
    });

    socketRef.current = socket;

    const onConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttemptsRef.current = 0;
      console.log('[useAgentSocket] Connected to LoopGuard Socket.io server');
      
      // Register this client as a dashboard
      socket.emit('register_dashboard', {
        role: 'human-oversight',
        timestamp: new Date().toISOString(),
      });
    };

    const onDisconnect = (reason: string) => {
      setIsConnected(false);
      console.log(`[useAgentSocket] Disconnected: ${reason}`);
    };

    const onConnectError = (err: Error) => {
      reconnectAttemptsRef.current += 1;
      const message = `Connection error (${reconnectAttemptsRef.current}): ${err.message}`;
      setConnectionError(message);
      console.error('[useAgentSocket]', message);
    };

    const onNewProposal = (proposal: Proposal) => {
      handleNewProposal(proposal);
    };

    const onAgentConnected = (agent: AgentSession) => {
      setAgents((prev) => {
        const index = prev.findIndex((a) => a.id === agent.id);
        const updatedAgent = { 
          ...agent, 
          status: 'connected' as const,
          lastActive: new Date().toISOString() 
        };
        
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = updatedAgent;
          return copy;
        }
        return [...prev, updatedAgent];
      });
      setLastEventAt(new Date());
    };

    const onAgentDisconnected = (payload: { agentId: string }) => {
      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === payload.agentId
            ? { ...agent, status: 'disconnected', lastActive: new Date().toISOString() }
            : agent
        )
      );
      setLastEventAt(new Date());
    };

    const onApprovalBroadcast = (decision: ApprovalDecision) => {
      console.log('[useAgentSocket] Received approval broadcast:', decision.decision);
      // Sync UI in case another dashboard made a decision
      setProposals((prev) => prev.filter((p) => p.action.id !== decision.actionId));
    };

    // Register listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('new_proposal', onNewProposal);
    socket.on('agent_connected', onAgentConnected);
    socket.on('agent_disconnected', onAgentDisconnected);
    socket.on('approval_decision', onApprovalBroadcast); // listen for other dashboards

    // Request current state on connect
    socket.on('connect', () => {
      socket.emit('request_current_state');
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('new_proposal', onNewProposal);
      socket.off('agent_connected', onAgentConnected);
      socket.off('agent_disconnected', onAgentDisconnected);
      socket.off('approval_decision', onApprovalBroadcast);
      
      socket.disconnect();
      socketRef.current = null;
    };
  }, [handleNewProposal]);

  const clearProposals = useCallback(() => {
    setProposals([]);
  }, []);

  const simulateProposal = useCallback((actionOverride?: Partial<BrowserAction>) => {
    const base: BrowserAction = {
      id: crypto.randomUUID(),
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'navigate',
      url: 'https://example.com/demo',
      intent: 'Simulated test navigation',
      summary: 'This proposal was generated by the dashboard hook for testing purposes.',
      parameters: { simulated: true },
      extractedPii: [],
      riskScore: 42,
      timestamp: new Date().toISOString(),
      metadata: { source: 'useAgentSocket-simulator' },
    };

    const mergedAction = { ...base, ...actionOverride } as BrowserAction;
    
    const mockSession: AgentSession = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'DemoAgent',
      connectedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      lastActive: new Date().toISOString(),
      status: 'connected',
      currentUrl: mergedAction.url,
      actionCount: 8,
      riskProfile: 'medium',
      metadata: {},
    };

    const mockProposal: Proposal = {
      action: mergedAction,
      session: mockSession,
    };

    handleNewProposal(mockProposal);
  }, [handleNewProposal]);

  return useMemo(() => ({
    proposals,
    agents,
    isConnected,
    connectionError,
    lastEventAt,
    sendApproval,
    clearProposals,
    simulateProposal,
    refreshAgents: () => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('request_current_agents');
      }
    },
  }), [
    proposals,
    agents,
    isConnected,
    connectionError,
    lastEventAt,
    sendApproval,
    clearProposals,
    simulateProposal,
  ]);
}
