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
declare class AgentLogger {
    private logs;
    log(event: {
        agent: string;
        action: string;
        userIntent?: string;
        toolCalls?: string[];
        a2aMessages?: A2AMessage[];
        outcome: 'success' | 'failure' | 'pending';
        responseTime: number;
        error?: string;
    }): void;
    getLogs(): any[];
    getAgentMetrics(agentName: string): {
        totalCalls: number;
        successRate: number;
        averageResponseTime: number;
        toolUsage: Record<string, number>;
    };
    private getToolUsageStats;
}
declare abstract class BaseAgent {
    protected name: string;
    protected primeDirective: string;
    protected tools: string[];
    protected vertexAI: VertexAI;
    protected logger: AgentLogger;
    constructor(name: string, primeDirectivePath: string, tools: string[], logger: AgentLogger);
    abstract handleTask(task: string, context?: any): Promise<AgentResponse>;
    protected callLLM(prompt: string, systemInstruction?: string): Promise<string>;
    getName(): string;
    getTools(): string[];
}
declare class AgentOrchestrator {
    private agents;
    private logger;
    private a2aMessageQueue;
    constructor();
    routeTask(task: string, preferredAgent?: string): Promise<AgentResponse>;
    private determineAgent;
    processA2AMessages(messages: A2AMessage[]): Promise<void>;
    getMetrics(): Record<string, any>;
    getAllLogs(): any[];
}
export { AgentOrchestrator, BaseAgent, A2AMessage, AgentLogger };
//# sourceMappingURL=orchestrator.d.ts.map