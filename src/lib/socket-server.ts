/**
 * Socket.io server handler for LoopGuard
 *
 * Central module that wires up Socket.io events between AI agents
 * and the human oversight dashboard. Provides a clean public API
 * that can be imported by Next.js API routes or custom servers.
 *
 * Responsibilities:
 * - Initialize Socket.io with secure defaults and proper path
 * - Register agent sessions and forward proposed actions
 * - Dispatch approval decisions back to the originating agent
 * - Maintain lightweight in-memory state for connected agents
 * - Expose event registration hooks for the policy & UI layers
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import {
  Proposal,
  ApprovalDecision,
  AgentSession,
  BrowserAction,
  parseBrowserAction,
} from '../types/index';

let ioInstance: SocketIOServer | null = null;
const proposalCallbacks: Array<(proposal: Proposal) => void> = [];
const connectedAgents = new Map<string, AgentSession>();

/**
 * Initialize the Socket.io server on top of an HTTP server.
 * Idempotent – calling multiple times returns the existing instance.
 */
export function initServer(httpServer: HttpServer): SocketIOServer {
  if (ioInstance) {
    console.warn('[LoopGuard] Socket server already initialized');
    return ioInstance;
  }

  ioInstance = new SocketIOServer(httpServer, {
    path: '/api/socket',
    cors: {
      // In production this should be locked down to the dashboard origin.
      // For self-hosted development we allow all origins.
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  ioInstance.on('connection', (socket: Socket) => {
    handleNewConnection(socket);
  });

  console.log('[LoopGuard] Socket.io server initialized on /api/socket');
  return ioInstance;
}

function handleNewConnection(socket: Socket): void {
  console.log(`[LoopGuard] Client connected: ${socket.id}`);

  // Agent registers itself with session metadata
  socket.on('register_agent', (sessionData: unknown) => {
    try {
      // Minimal validation – full schema enforcement happens on the agent SDK side
      const session = sessionData as AgentSession;
      if (!session.id || !session.name) {
        socket.emit('error', { message: 'Invalid session payload' });
        return;
      }

      const enrichedSession: AgentSession = {
        ...session,
        connectedAt: session.connectedAt || new Date().toISOString(),
        lastActive: new Date().toISOString(),
        status: 'connected',
      };

      connectedAgents.set(session.id, enrichedSession);
      socket.data.agentId = session.id;

      ioInstance?.emit('agent_connected', enrichedSession);
      socket.emit('registration_success', { agentId: session.id });
    } catch (err) {
      socket.emit('error', {
        message: err instanceof Error ? err.message : 'Registration failed',
      });
    }
  });

  // Agent proposes an action that needs human review
  socket.on('propose_action', (actionData: unknown) => {
    try {
      const validatedAction = parseBrowserAction(actionData);
      const agentId = (socket.data.agentId as string) || 'unknown-agent';

      const session =
        connectedAgents.get(agentId) ||
        ({
          id: agentId,
          name: 'Unknown Agent',
          connectedAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          status: 'connected',
          actionCount: 0,
          riskProfile: 'medium',
        } as AgentSession);

      // Bump activity timestamp
      session.lastActive = new Date().toISOString();
      session.actionCount = (session.actionCount || 0) + 1;
      connectedAgents.set(agentId, session);

      const proposal: Proposal = {
        action: validatedAction,
        session,
      };

      // Notify all registered proposal handlers (policy engine, UI, etc.)
      proposalCallbacks.forEach((cb) => {
        try {
          cb(proposal);
        } catch (handlerError) {
          console.error('[LoopGuard] Proposal handler error:', handlerError);
        }
      });

      // Also broadcast to any connected dashboard clients
      ioInstance?.emit('new_proposal', proposal);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to parse proposed action';
      socket.emit('error', { message });
      console.error('[LoopGuard] propose_action error:', message);
    }
  });

  // Agent acknowledges that an action was executed after approval
  socket.on('action_completed', (payload: { actionId: string; outcome: string }) => {
    ioInstance?.emit('action_completed', {
      ...payload,
      agentId: socket.data.agentId,
    });
  });

  socket.on('disconnect', () => {
    const agentId = socket.data.agentId as string | undefined;
    if (agentId && connectedAgents.has(agentId)) {
      const session = connectedAgents.get(agentId)!;
      session.status = 'disconnected';
      connectedAgents.set(agentId, session);
      ioInstance?.emit('agent_disconnected', { agentId });
      console.log(`[LoopGuard] Agent disconnected: ${agentId}`);
    }
  });
}

/**
 * Register a callback that will be invoked every time an agent proposes
 * a new BrowserAction. Used by the policy engine and the live dashboard feed.
 */
export function onProposal(callback: (proposal: Proposal) => void): void {
  if (typeof callback !== 'function') {
    throw new TypeError('onProposal expects a function');
  }
  proposalCallbacks.push(callback);
}

/**
 * Broadcast an approval (or denial) decision to all connected clients.
 * The originating agent will pick it up via the SDK and either proceed
 * or abort the planned action.
 */
export function broadcastApproval(decision: ApprovalDecision): void {
  if (!ioInstance) {
    throw new Error(
      'Socket server not initialized. Call initServer(httpServer) first.'
    );
  }

  try {
    // Basic validation before broadcasting
    if (!decision.actionId || !decision.decision) {
      throw new Error('ApprovalDecision must contain actionId and decision');
    }

    ioInstance.emit('approval_decision', decision);
    console.log(
      `[LoopGuard] Broadcast approval for action ${decision.actionId}: ${decision.decision}`
    );
  } catch (err) {
    console.error('[LoopGuard] Failed to broadcast approval:', err);
    throw err;
  }
}

/** Returns the underlying Socket.io server instance (for advanced use). */
export function getSocketServer(): SocketIOServer | null {
  return ioInstance;
}

/** Returns a read-only snapshot of currently connected agents. */
export function getConnectedAgents(): AgentSession[] {
  return Array.from(connectedAgents.values());
}

export default {
  initServer,
  onProposal,
  broadcastApproval,
  getSocketServer,
  getConnectedAgents,
};
