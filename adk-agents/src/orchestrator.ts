/**
 * Google ADK Multi-Agent Orchestrator
 *
 * Coordinates multiple specialized agents:
 * - Reservation Agent: Handles customer reservations
 * - Host Dashboard Agent: Manages floor operations
 * - Customer Service Agent: Resolves issues and answers questions
 *
 * Implements A2A (Agent-to-Agent) protocol for inter-agent communication
 */

import { VertexAI } from '@google-cloud/vertexai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id';
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const MODEL = 'gemini-2.0-flash-exp'; // or gemini-2.5-pro for advanced reasoning

// ============================================================================
// A2A MESSAGE TYPES
// ============================================================================

interface A2AMessage {
  from: string;
  to: string;
  task: string;
  context: any;
  priority: 'low' | 'medium' | 'high';
  timestamp: string;
}

interface AgentResponse {
  agent: string;
  success: boolean;
  result: any;
  messages?: A2AMessage[];
}

// ============================================================================
// AGENT LOGGER (Observability)
// ============================================================================

class AgentLogger {
  private logs: any[] = [];

  log(event: {
    agent: string;
    action: string;
    userIntent?: string;
    toolCalls?: string[];
    a2aMessages?: A2AMessage[];
    outcome: 'success' | 'failure' | 'pending';
    responseTime: number;
    error?: string;
  }) {
    const logEntry = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.logs.push(logEntry);
    console.log('[Agent Log]', JSON.stringify(logEntry, null, 2));

    // In production, send to Cloud Logging, DataDog, etc.
  }

  getLogs() {
    return this.logs;
  }

  getAgentMetrics(agentName: string) {
    const agentLogs = this.logs.filter(log => log.agent === agentName);

    return {
      totalCalls: agentLogs.length,
      successRate: agentLogs.filter(log => log.outcome === 'success').length / agentLogs.length,
      averageResponseTime: agentLogs.reduce((sum, log) => sum + log.responseTime, 0) / agentLogs.length,
      toolUsage: this.getToolUsageStats(agentLogs),
    };
  }

  private getToolUsageStats(logs: any[]) {
    const toolCounts: Record<string, number> = {};

    logs.forEach(log => {
      if (log.toolCalls) {
        log.toolCalls.forEach((tool: string) => {
          toolCounts[tool] = (toolCounts[tool] || 0) + 1;
        });
      }
    });

    return toolCounts;
  }
}

// ============================================================================
// BASE AGENT CLASS
// ============================================================================

abstract class BaseAgent {
  protected name: string;
  protected primeDirective: string;
  protected tools: string[];
  protected vertexAI: VertexAI;
  protected logger: AgentLogger;

  constructor(name: string, primeDirectivePath: string, tools: string[], logger: AgentLogger) {
    this.name = name;
    this.primeDirective = fs.readFileSync(primeDirectivePath, 'utf-8');
    this.tools = tools;
    this.logger = logger;

    this.vertexAI = new VertexAI({
      project: PROJECT_ID,
      location: LOCATION,
    });
  }

  abstract handleTask(task: string, context?: any): Promise<AgentResponse>;

  protected async callLLM(prompt: string, systemInstruction?: string): Promise<string> {
    const model = this.vertexAI.preview.getGenerativeModel({
      model: MODEL,
      systemInstruction: systemInstruction || this.primeDirective,
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No response from LLM');
    }
    return text;
  }

  getName() {
    return this.name;
  }

  getTools() {
    return this.tools;
  }
}

// ============================================================================
// SPECIALIZED AGENTS
// ============================================================================

class ReservationAgent extends BaseAgent {
  constructor(logger: AgentLogger) {
    super(
      'Reservation Agent',
      path.join(__dirname, 'prompts', 'reservation-agent.txt'),
      [
        'check_restaurant_availability',
        'create_reservation',
        'modify_reservation',
        'cancel_reservation',
        'lookup_reservation',
        'get_wait_time',
      ],
      logger
    );
  }

  async handleTask(task: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // In production, this would call the actual LLM with MCP tools
      // For now, simulating the agent logic

      const prompt = `
Task: ${task}
Context: ${JSON.stringify(context || {})}

Please handle this reservation-related task using your available tools.
Follow your prime directive and behavior guidelines.
      `;

      const response = await this.callLLM(prompt);

      const responseTime = Date.now() - startTime;

      this.logger.log({
        agent: this.name,
        action: 'handleTask',
        userIntent: task,
        toolCalls: this.extractToolCalls(response),
        outcome: 'success',
        responseTime,
      });

      return {
        agent: this.name,
        success: true,
        result: response,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.log({
        agent: this.name,
        action: 'handleTask',
        userIntent: task,
        outcome: 'failure',
        responseTime,
        error: error.message,
      });

      return {
        agent: this.name,
        success: false,
        result: error.message,
      };
    }
  }

  private extractToolCalls(response: string): string[] {
    // Simple extraction - in production, parse structured output
    const tools: string[] = [];
    this.tools.forEach(tool => {
      if (response.includes(tool)) {
        tools.push(tool);
      }
    });
    return tools;
  }
}

class HostDashboardAgent extends BaseAgent {
  constructor(logger: AgentLogger) {
    super(
      'Host Dashboard Agent',
      path.join(__dirname, 'prompts', 'host-agent.txt'),
      [
        'get_host_dashboard_data',
        'seat_party',
        'complete_service',
        'mark_table_clean',
        'check_restaurant_availability',
        'lookup_reservation',
      ],
      logger
    );
  }

  async handleTask(task: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const prompt = `
Task: ${task}
Context: ${JSON.stringify(context || {})}

Please handle this host dashboard task using your available tools.
Follow your prime directive for efficient floor management.
      `;

      const response = await this.callLLM(prompt);

      const responseTime = Date.now() - startTime;

      this.logger.log({
        agent: this.name,
        action: 'handleTask',
        userIntent: task,
        toolCalls: this.extractToolCalls(response),
        outcome: 'success',
        responseTime,
      });

      return {
        agent: this.name,
        success: true,
        result: response,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.log({
        agent: this.name,
        action: 'handleTask',
        userIntent: task,
        outcome: 'failure',
        responseTime,
        error: error.message,
      });

      return {
        agent: this.name,
        success: false,
        result: error.message,
      };
    }
  }

  private extractToolCalls(response: string): string[] {
    const tools: string[] = [];
    this.tools.forEach(tool => {
      if (response.includes(tool)) {
        tools.push(tool);
      }
    });
    return tools;
  }
}

class CustomerServiceAgent extends BaseAgent {
  constructor(logger: AgentLogger) {
    super(
      'Customer Service Agent',
      path.join(__dirname, 'prompts', 'customer-service-agent.txt'),
      [
        'lookup_reservation',
        'cancel_reservation',
        'modify_reservation',
      ],
      logger
    );
  }

  async handleTask(task: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const prompt = `
Task: ${task}
Context: ${JSON.stringify(context || {})}

Please handle this customer service request with empathy and professionalism.
Follow your prime directive to provide exceptional customer experience.
      `;

      const response = await this.callLLM(prompt);

      const responseTime = Date.now() - startTime;

      this.logger.log({
        agent: this.name,
        action: 'handleTask',
        userIntent: task,
        toolCalls: this.extractToolCalls(response),
        outcome: 'success',
        responseTime,
      });

      return {
        agent: this.name,
        success: true,
        result: response,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.logger.log({
        agent: this.name,
        action: 'handleTask',
        userIntent: task,
        outcome: 'failure',
        responseTime,
        error: error.message,
      });

      return {
        agent: this.name,
        success: false,
        result: error.message,
      };
    }
  }

  private extractToolCalls(response: string): string[] {
    const tools: string[] = [];
    this.tools.forEach(tool => {
      if (response.includes(tool)) {
        tools.push(tool);
      }
    });
    return tools;
  }
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

class AgentOrchestrator {
  private agents: Map<string, BaseAgent>;
  private logger: AgentLogger;
  private a2aMessageQueue: A2AMessage[] = [];

  constructor() {
    this.logger = new AgentLogger();
    this.agents = new Map();

    // Initialize all agents
    this.agents.set('reservation', new ReservationAgent(this.logger));
    this.agents.set('host', new HostDashboardAgent(this.logger));
    this.agents.set('customer-service', new CustomerServiceAgent(this.logger));

    console.log('[Orchestrator] Initialized with agents:', Array.from(this.agents.keys()));
  }

  async routeTask(task: string, preferredAgent?: string): Promise<AgentResponse> {
    // Determine which agent should handle this task
    const agentName = preferredAgent || this.determineAgent(task);
    const agent = this.agents.get(agentName);

    if (!agent) {
      return {
        agent: 'orchestrator',
        success: false,
        result: `Unknown agent: ${agentName}`,
      };
    }

    console.log(`[Orchestrator] Routing task to ${agent.getName()}`);

    const response = await agent.handleTask(task);

    // Process any A2A messages generated
    if (response.messages) {
      await this.processA2AMessages(response.messages);
    }

    return response;
  }

  private determineAgent(task: string): string {
    const taskLower = task.toLowerCase();

    // Simple keyword matching - in production, use LLM-based routing
    if (taskLower.includes('reservation') || taskLower.includes('book') || taskLower.includes('cancel')) {
      return 'reservation';
    } else if (taskLower.includes('seat') || taskLower.includes('table') || taskLower.includes('walk-in')) {
      return 'host';
    } else if (taskLower.includes('complaint') || taskLower.includes('question') || taskLower.includes('help')) {
      return 'customer-service';
    }

    // Default to customer service for general queries
    return 'customer-service';
  }

  async processA2AMessages(messages: A2AMessage[]) {
    for (const message of messages) {
      console.log('[A2A] Processing message:', message);

      const targetAgent = this.agents.get(message.to);
      if (targetAgent) {
        const response = await targetAgent.handleTask(message.task, message.context);
        console.log('[A2A] Response:', response);
      }
    }
  }

  getMetrics() {
    const metrics: Record<string, any> = {};

    this.agents.forEach((agent, name) => {
      metrics[name] = this.logger.getAgentMetrics(agent.getName());
    });

    return metrics;
  }

  getAllLogs() {
    return this.logger.getLogs();
  }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

async function main() {
  const orchestrator = new AgentOrchestrator();

  // Example 1: Customer wants to make a reservation
  console.log('\n=== Example 1: Reservation Request ===');
  const result1 = await orchestrator.routeTask(
    'I need a table for 4 this Saturday at 7pm'
  );
  console.log('Result:', result1);

  // Example 2: Host needs to seat a walk-in
  console.log('\n=== Example 2: Walk-In Seating ===');
  const result2 = await orchestrator.routeTask(
    'Seat party of 2 at table 5',
    'host'
  );
  console.log('Result:', result2);

  // Example 3: Customer service inquiry
  console.log('\n=== Example 3: Customer Service ===');
  const result3 = await orchestrator.routeTask(
    'What is your cancellation policy?'
  );
  console.log('Result:', result3);

  // View metrics
  console.log('\n=== Agent Metrics ===');
  console.log(JSON.stringify(orchestrator.getMetrics(), null, 2));
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { AgentOrchestrator, BaseAgent, A2AMessage, AgentLogger };
