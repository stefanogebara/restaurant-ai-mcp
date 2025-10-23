/**
 * Predictive Analytics Service with Gemini 2.5 Pro
 *
 * Provides advanced analytics for restaurant operations:
 * - No-show prediction
 * - Demand forecasting
 * - Peak time analysis
 * - Revenue optimization
 * - Staffing recommendations
 */
interface ReservationData {
    id: string;
    date: string;
    time: string;
    partySize: number;
    customerName: string;
    customerPhone: string;
    status: 'confirmed' | 'cancelled' | 'no-show' | 'completed';
    createdAt: string;
    specialRequests?: string;
    previousVisits?: number;
}
interface NoShowPrediction {
    reservationId: string;
    noShowProbability: number;
    riskLevel: 'low' | 'medium' | 'high';
    contributingFactors: string[];
    recommendations: string[];
}
interface DemandForecast {
    date: string;
    timeSlot: string;
    predictedCovers: number;
    confidence: number;
    factors: string[];
    staffingRecommendation: {
        servers: number;
        hosts: number;
        kitchen: number;
    };
}
interface PeakTimeAnalysis {
    dayOfWeek: string;
    peakHours: Array<{
        time: string;
        averageCovers: number;
        occupancyRate: number;
    }>;
    recommendations: string[];
}
interface RevenueOptimization {
    currentRevenue: number;
    potentialRevenue: number;
    opportunities: Array<{
        category: string;
        impact: number;
        actionItems: string[];
    }>;
}
export declare class PredictiveAnalyticsService {
    private vertexAI;
    constructor();
    /**
     * Predict no-show probability for a reservation
     */
    predictNoShow(reservation: ReservationData, historicalData: ReservationData[]): Promise<NoShowPrediction>;
    /**
     * Forecast demand for upcoming period
     */
    forecastDemand(targetDate: string, historicalData: ReservationData[]): Promise<DemandForecast[]>;
    /**
     * Analyze peak times and patterns
     */
    analyzePeakTimes(historicalData: ReservationData[]): Promise<PeakTimeAnalysis[]>;
    /**
     * Identify revenue optimization opportunities
     */
    optimizeRevenue(currentMonthData: ReservationData[], averageCheckSize: number): Promise<RevenueOptimization>;
    private getDaysDifference;
    private isPrimeTimeSlot;
    private calculateStaffing;
    private identifyLowOccupancySlots;
    /**
     * Generate insights using Gemini 2.5 Pro
     */
    generateInsights(analyticsData: any): Promise<string>;
}
export declare function getPredictiveAnalyticsService(): PredictiveAnalyticsService;
export {};
//# sourceMappingURL=predictive-analytics.d.ts.map