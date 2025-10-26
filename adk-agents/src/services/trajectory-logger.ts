/**
 * Trajectory Logger Service
 *
 * Tracks agent execution trajectories for observability and performance monitoring.
 * Captures agent calls, tool usage, response times, success/failure rates, and A2A communication.
 */

interface AgentCallLog {
  timestamp: Date;
  agentName: string;
  operation: string;
  duration: number; // milliseconds
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

interface ToolUsageLog {
  timestamp: Date;
  agentName: string;
  toolName: string;
  duration: number;
  success: boolean;
  error?: string;
  parameters?: Record<string, any>;
}

interface A2AMessageLog {
  timestamp: Date;
  fromAgent: string;
  toAgent: string;
  messageType: string;
  payload: any;
  responseTime?: number;
}

interface AgentMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  toolUsageCount: Record<string, number>;
  errorPatterns: Record<string, number>;
}

class TrajectoryLogger {
  private agentCalls: AgentCallLog[] = [];
  private toolUsage: ToolUsageLog[] = [];
  private a2aMessages: A2AMessageLog[] = [];
  private maxLogSize = 10000; // Keep last 10k entries

  /**
   * Log an agent call
   */
  logAgentCall(log: AgentCallLog): void {
    this.agentCalls.push(log);
    this.trimLogs(this.agentCalls);

    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Agent] ${log.agentName}.${log.operation} - ${log.duration}ms - ${log.success ? 'SUCCESS' : 'FAILED'}`);
    }
  }

  /**
   * Log tool usage
   */
  logToolUsage(log: ToolUsageLog): void {
    this.toolUsage.push(log);
    this.trimLogs(this.toolUsage);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Tool] ${log.agentName} used ${log.toolName} - ${log.duration}ms`);
    }
  }

  /**
   * Log A2A message
   */
  logA2AMessage(log: A2AMessageLog): void {
    this.a2aMessages.push(log);
    this.trimLogs(this.a2aMessages);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[A2A] ${log.fromAgent} → ${log.toAgent} (${log.messageType})`);
    }
  }

  /**
   * Get metrics for a specific agent
   */
  getAgentMetrics(agentName: string, timeWindowMs: number = 3600000): AgentMetrics {
    const cutoff = new Date(Date.now() - timeWindowMs);
    const relevantCalls = this.agentCalls.filter(
      call => call.agentName === agentName && call.timestamp >= cutoff
    );

    if (relevantCalls.length === 0) {
      return {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        toolUsageCount: {},
        errorPatterns: {}
      };
    }

    const successfulCalls = relevantCalls.filter(c => c.success);
    const failedCalls = relevantCalls.filter(c => !c.success);

    // Calculate response times
    const responseTimes = relevantCalls.map(c => c.duration).sort((a, b) => a - b);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);

    // Tool usage stats
    const relevantTools = this.toolUsage.filter(
      t => t.agentName === agentName && t.timestamp >= cutoff
    );
    const toolUsageCount: Record<string, number> = {};
    relevantTools.forEach(t => {
      toolUsageCount[t.toolName] = (toolUsageCount[t.toolName] || 0) + 1;
    });

    // Error patterns
    const errorPatterns: Record<string, number> = {};
    failedCalls.forEach(c => {
      if (c.error) {
        errorPatterns[c.error] = (errorPatterns[c.error] || 0) + 1;
      }
    });

    return {
      totalCalls: relevantCalls.length,
      successfulCalls: successfulCalls.length,
      failedCalls: failedCalls.length,
      averageResponseTime: Math.round(avgResponseTime),
      p95ResponseTime: responseTimes[p95Index] || 0,
      p99ResponseTime: responseTimes[p99Index] || 0,
      toolUsageCount,
      errorPatterns
    };
  }

  /**
   * Get all agent metrics
   */
  getAllAgentMetrics(timeWindowMs: number = 3600000): Record<string, AgentMetrics> {
    const agentNames = [...new Set(this.agentCalls.map(c => c.agentName))];
    const metrics: Record<string, AgentMetrics> = {};

    agentNames.forEach(name => {
      metrics[name] = this.getAgentMetrics(name, timeWindowMs);
    });

    return metrics;
  }

  /**
   * Get A2A communication flow
   */
  getA2AFlow(timeWindowMs: number = 3600000): A2AMessageLog[] {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return this.a2aMessages.filter(msg => msg.timestamp >= cutoff);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 100): AgentCallLog[] {
    return this.agentCalls
      .filter(call => !call.success)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Export logs for external analysis
   */
  exportLogs(): {
    agentCalls: AgentCallLog[];
    toolUsage: ToolUsageLog[];
    a2aMessages: A2AMessageLog[];
  } {
    return {
      agentCalls: [...this.agentCalls],
      toolUsage: [...this.toolUsage],
      a2aMessages: [...this.a2aMessages]
    };
  }

  /**
   * Clear all logs (use sparingly)
   */
  clearLogs(): void {
    this.agentCalls = [];
    this.toolUsage = [];
    this.a2aMessages = [];
  }

  /**
   * Trim logs to max size
   */
  private trimLogs(logs: any[]): void {
    if (logs.length > this.maxLogSize) {
      logs.splice(0, logs.length - this.maxLogSize);
    }
  }
}

// Singleton instance
export const trajectoryLogger = new TrajectoryLogger();

// Helper function to wrap agent calls with logging
export function withLogging<T>(
  agentName: string,
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const startTime = Date.now();

  return fn()
    .then(result => {
      trajectoryLogger.logAgentCall({
        timestamp: new Date(),
        agentName,
        operation,
        duration: Date.now() - startTime,
        success: true,
        metadata
      });
      return result;
    })
    .catch(error => {
      trajectoryLogger.logAgentCall({
        timestamp: new Date(),
        agentName,
        operation,
        duration: Date.now() - startTime,
        success: false,
        error: error.message || 'Unknown error',
        metadata
      });
      throw error;
    });
}

// Export types
export type {
  AgentCallLog,
  ToolUsageLog,
  A2AMessageLog,
  AgentMetrics
};
