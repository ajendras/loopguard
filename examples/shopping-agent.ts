import { io, Socket } from 'socket.io-client';
import type {
  BrowserAction,
  ApprovalDecision,
  AgentSession,
} from '../src/types/index';

/**
 * LoopGuard Agent SDK – Tiny TypeScript wrapper
 *
 * Provides a clean, promise-based API for any AI automation (Playwright,
 * Puppeteer, fetch, etc.) to request human approval before performing
 * potentially destructive or privacy-sensitive web actions.
 *
 * Usage:
 *   npx tsx examples/shopping-agent.ts
 *
 * The demo connects to a locally running LoopGuard dashboard (npm run dev)
 * and walks through a realistic shopping flow, pausing for approval at each
 * step. All actions are logged and can be observed live in the glassmorphic UI.
 */

class LoopGuardClient {
  private socket: Socket | null = null;
  private readonly agentId: string;
  private readonly agentName: string;
  private readonly serverUrl: string;
  private connected = false;
  private readonly pending = new Map<
    string,
    (decision: ApprovalDecision) => void
  >();

  constructor(config: {
    agentName: string;
    agentId?: string;
    serverUrl?: string;
  }) {
    this.agentName = config.agentName;
    this.agentId =
      config.agentId ?? `agent-${Date.now().toString(36).toUpperCase()}`;
    this.serverUrl = config.serverUrl ?? 'http://localhost:3000';
  }

  /**
   * Connect to the LoopGuard dashboard and register this agent.
   * Uses automatic reconnection with exponential backoff.
   */
  async connect(): Promise<void> {
    if (this.connected && this.socket) return;

    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        path: '/socket.io',
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 800,
        timeout: 15000,
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.connected = true;
        console.log(
          `\x1b[32m[LoopGuardClient]\x1b[0m Connected as \x1b[36m${this.agentName}\x1b[0m (\x1b[90m${this.agentId}\x1b[0m)`
        );

        const session: Partial<AgentSession> = {
          id: this.agentId,
          name: this.agentName,
          connectedAt: new Date().toISOString(),
          status: 'connected',
          currentUrl: 'https://www.amazon.com',
          actionCount: 0,
          riskProfile: 'medium',
          metadata: {
            framework: 'demo-sdk',
            version: '0.1.0',
          },
        };

        this.socket!.emit('register_agent', session);
        resolve();
      });

      this.socket.on('approval_decision', (decision: ApprovalDecision) => {
        const resolver = this.pending.get(decision.actionId);
        if (resolver) {
          resolver(decision);
          this.pending.delete(decision.actionId);
        }
      });

      this.socket.on('connect_error', (err: Error) => {
        console.error(
          `\x1b[31m[LoopGuardClient]\x1b[0m Connection error: ${err.message}`
        );
        if (!this.connected) reject(err);
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        console.log(
          `\x1b[33m[LoopGuardClient]\x1b[0m Disconnected from dashboard`
        );
      });
    });
  }

  /**
   * Propose a BrowserAction for human review.
   * Returns a promise that resolves with the ApprovalDecision.
   * Times out after 45 seconds if no response is received.
   */
  async proposeAction(
    partial: Omit<
      BrowserAction,
      'id' | 'agentId' | 'timestamp' | 'riskScore' | 'extractedPii'
    > & {
      riskScore?: number;
      extractedPii?: string[];
    }
  ): Promise<ApprovalDecision> {
    if (!this.socket || !this.connected) {
      throw new Error(
        'LoopGuardClient must be connected before proposing actions. Call await client.connect() first.'
      );
    }

    const action: BrowserAction = {
      id: `act-${Date.now().toString(36)}`,
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
      riskScore: partial.riskScore ?? 35,
      extractedPii: partial.extractedPii ?? [],
      parameters: partial.parameters ?? {},
      metadata: {
        source: 'shopping-agent-demo',
        simulated: true,
      },
      ...partial,
    } as BrowserAction;

    console.log(
      `\n\x1b[34m[PROPOSAL]\x1b[0m \x1b[1m${action.type.toUpperCase()}\x1b[0m → ${action.intent}`
    );
    console.log(`\x1b[90m${action.summary}\x1b[0m`);
    if (action.extractedPii.length > 0) {
      console.log(
        `\x1b[31m[PII DETECTED]\x1b[0m ${action.extractedPii.join(', ')}`
      );
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(action.id);
        reject(new Error(`Approval timeout for action ${action.id}`));
      }, 45000);

      this.pending.set(action.id, (decision: ApprovalDecision) => {
        clearTimeout(timeoutId);
        console.log(
          `\x1b[32m[DECISION]\x1b[0m \x1b[1m${decision.decision.toUpperCase()}\x1b[0m – ${decision.reason}`
        );
        resolve(decision);
      });

      this.socket!.emit('propose_action', action);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }
}

/**
 * Runnable shopping demo that mimics a realistic autonomous agent.
 * Each step is proposed to the LoopGuard dashboard for approval.
 */
async function runDemo(): Promise<void> {
  console.log('\n\x1b[35m══════════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1m\x1b[35mLoopGuard Shopping Agent Demo\x1b[0m');
  console.log('Real-time human oversight for an AI-powered shopping flow');
  console.log('\x1b[35m══════════════════════════════════════════════════════════════\x1b[0m\n');

  const client = new LoopGuardClient({
    agentName: 'ShoppingBot-v2',
    agentId: 'demo-shopping-001',
  });

  try {
    await client.connect();

    const steps: Array<
      Omit<
        BrowserAction,
        'id' | 'agentId' | 'timestamp' | 'riskScore' | 'extractedPii'
      > & { riskScore?: number; extractedPii?: string[] }
    > = [
      {
        type: 'navigate',
        url: 'https://www.amazon.com',
        intent: 'Open Amazon homepage to begin product research',
        summary:
          'The agent is navigating to the Amazon homepage to start a search for premium noise-cancelling headphones.',
        parameters: { category: 'electronics' },
        riskScore: 18,
      },
      {
        type: 'input',
        url: 'https://www.amazon.com/s',
        intent: 'Search for Sony WH-1000XM5 headphones',
        summary:
          'Entering a precise product query into the search bar. No personal data is being submitted.',
        parameters: {
          query: 'Sony WH-1000XM5 wireless noise cancelling headphones',
          field: 'search',
        },
        riskScore: 24,
      },
      {
        type: 'click',
        url: 'https://www.amazon.com/Sony-WH-1000XM5-Canceling-Headphones/dp/B0BS1N1YVJ',
        intent: 'View detailed product page and customer reviews',
        summary:
          'Clicking the top result to inspect specifications, price, and verified buyer feedback.',
        parameters: { target: 'product_link', productId: 'B0BS1N1YVJ' },
        riskScore: 31,
      },
      {
        type: 'submit',
        url: 'https://www.amazon.com/cart/add',
        intent: 'Add Sony WH-1000XM5 to shopping cart',
        summary:
          'Submitting an "Add to Cart" request for a $398.00 item. This is a commercial transaction but does not yet involve payment details.',
        parameters: {
          item: 'Sony WH-1000XM5',
          price: 398,
          quantity: 1,
        },
        riskScore: 67,
        extractedPii: [],
      },
      {
        type: 'navigate',
        url: 'https://www.amazon.com/checkout',
        intent: 'Proceed to checkout with saved address',
        summary:
          'Navigating to the checkout page using a previously saved shipping address. High-risk step that may trigger payment form.',
        parameters: { stage: 'checkout' },
        riskScore: 82,
      },
    ];

    let approvedCount = 0;

    for (const step of steps) {
      const decision = await client.proposeAction(step);

      if (decision.decision === 'approved') {
        approvedCount++;
        console.log(
          `\x1b[32m✓ EXECUTING\x1b[0m ${step.type} on ${new URL(step.url).hostname}`
        );
        // Simulate real automation delay (in production this would be Playwright/Puppeteer)
        await new Promise((r) => setTimeout(r, 1100));
      } else if (decision.decision === 'denied') {
        console.log(
          `\x1b[31m✗ STOPPED\x1b[0m Agent halted because the human operator denied the action.`
        );
        break;
      } else {
        console.log(
          `\x1b[33m⚠ ESCALATED\x1b[0m Action escalated for further review.`
        );
        break;
      }
    }

    console.log('\n\x1b[35m══════════════════════════════════════════════════════════════\x1b[0m');
    console.log(
      `\x1b[32m✓ DEMO COMPLETE\x1b[0m — ${approvedCount}/${steps.length} actions approved and executed`
    );
    console.log(
      'Check the LoopGuard dashboard for the full audit trail and session replay.'
    );
    console.log('\x1b[35m══════════════════════════════════════════════════════════════\x1b[0m\n');
  } catch (err) {
    console.error('\x1b[31mDemo failed\x1b[0m', err);
    process.exitCode = 1;
  } finally {
    client.disconnect();
  }
}

// Auto-run when executed directly
if (import.meta.url === `file://${process.argv[1]}` || require.main === module) {
  runDemo();
}

export { LoopGuardClient };
