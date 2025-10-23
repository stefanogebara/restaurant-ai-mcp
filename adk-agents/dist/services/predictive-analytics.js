"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictiveAnalyticsService = void 0;
exports.getPredictiveAnalyticsService = getPredictiveAnalyticsService;
const vertexai_1 = require("@google-cloud/vertexai");
// ============================================================================
// CONFIGURATION
// ============================================================================
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id';
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const MODEL = 'gemini-2.0-flash-exp'; // Using advanced model for complex reasoning
// ============================================================================
// PREDICTIVE ANALYTICS SERVICE
// ============================================================================
class PredictiveAnalyticsService {
    vertexAI;
    constructor() {
        this.vertexAI = new vertexai_1.VertexAI({
            project: PROJECT_ID,
            location: LOCATION,
        });
    }
    /**
     * Predict no-show probability for a reservation
     */
    async predictNoShow(reservation, historicalData) {
        console.log(`[Analytics] Predicting no-show risk for reservation ${reservation.id}`);
        // Calculate historical no-show rate
        const totalReservations = historicalData.length;
        const noShows = historicalData.filter(r => r.status === 'no-show').length;
        const baselineNoShowRate = totalReservations > 0 ? noShows / totalReservations : 0.1;
        // Analyze factors
        const factors = [];
        let riskScore = baselineNoShowRate;
        // Factor 1: Last-minute booking (higher risk)
        const daysSinceBooking = this.getDaysDifference(reservation.createdAt, reservation.date);
        if (daysSinceBooking < 1) {
            riskScore += 0.15;
            factors.push('Same-day booking (higher risk)');
        }
        // Factor 2: Large party size (slightly higher risk)
        if (reservation.partySize >= 6) {
            riskScore += 0.10;
            factors.push('Large party size');
        }
        // Factor 3: Prime time slot (lower risk - people value these)
        const isPrimeTime = this.isPrimeTimeSlot(reservation.time);
        if (isPrimeTime) {
            riskScore -= 0.05;
            factors.push('Prime time slot (lower risk)');
        }
        // Factor 4: Repeat customer (lower risk)
        if (reservation.previousVisits && reservation.previousVisits > 0) {
            riskScore -= 0.15 * Math.min(reservation.previousVisits / 3, 1);
            factors.push(`Repeat customer (${reservation.previousVisits} previous visits)`);
        }
        // Factor 5: Special occasion (lower risk)
        if (reservation.specialRequests?.toLowerCase().includes('birthday') ||
            reservation.specialRequests?.toLowerCase().includes('anniversary')) {
            riskScore -= 0.10;
            factors.push('Special occasion (lower risk)');
        }
        // Normalize score
        riskScore = Math.max(0, Math.min(1, riskScore));
        // Determine risk level
        let riskLevel;
        if (riskScore < 0.20)
            riskLevel = 'low';
        else if (riskScore < 0.40)
            riskLevel = 'medium';
        else
            riskLevel = 'high';
        // Generate recommendations
        const recommendations = [];
        if (riskLevel === 'high') {
            recommendations.push('Send confirmation reminder 24 hours before');
            recommendations.push('Call to confirm 4 hours before');
            recommendations.push('Consider requiring deposit for large parties');
        }
        else if (riskLevel === 'medium') {
            recommendations.push('Send SMS reminder 24 hours before');
            recommendations.push('Note as priority for follow-up');
        }
        return {
            reservationId: reservation.id,
            noShowProbability: riskScore,
            riskLevel,
            contributingFactors: factors,
            recommendations,
        };
    }
    /**
     * Forecast demand for upcoming period
     */
    async forecastDemand(targetDate, historicalData) {
        console.log(`[Analytics] Forecasting demand for ${targetDate}`);
        const forecasts = [];
        const timeSlots = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];
        // Get day of week
        const dayOfWeek = new Date(targetDate).toLocaleDateString('en-US', { weekday: 'long' });
        for (const timeSlot of timeSlots) {
            // Filter historical data for same day of week and time slot
            const similarBookings = historicalData.filter(r => {
                const rDate = new Date(r.date);
                const rDayOfWeek = rDate.toLocaleDateString('en-US', { weekday: 'long' });
                return rDayOfWeek === dayOfWeek && r.time === timeSlot && r.status === 'completed';
            });
            // Calculate average covers
            const totalCovers = similarBookings.reduce((sum, r) => sum + r.partySize, 0);
            const averageCovers = similarBookings.length > 0
                ? Math.round(totalCovers / similarBookings.length)
                : 30; // Default estimate
            // Adjust for trends
            let predictedCovers = averageCovers;
            const factors = [`Historical average: ${averageCovers} covers`];
            // Weekend boost
            if (dayOfWeek === 'Friday' || dayOfWeek === 'Saturday') {
                predictedCovers = Math.round(predictedCovers * 1.3);
                factors.push('Weekend: +30% expected');
            }
            // Prime time boost
            if (this.isPrimeTimeSlot(timeSlot)) {
                predictedCovers = Math.round(predictedCovers * 1.2);
                factors.push('Prime time: +20% expected');
            }
            // Calculate confidence
            const confidence = Math.min(similarBookings.length / 20, 1); // High confidence with 20+ data points
            // Staffing recommendations
            const staffing = this.calculateStaffing(predictedCovers);
            forecasts.push({
                date: targetDate,
                timeSlot,
                predictedCovers,
                confidence,
                factors,
                staffingRecommendation: staffing,
            });
        }
        return forecasts;
    }
    /**
     * Analyze peak times and patterns
     */
    async analyzePeakTimes(historicalData) {
        console.log('[Analytics] Analyzing peak times');
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const analyses = [];
        for (const day of daysOfWeek) {
            // Filter data for this day
            const dayData = historicalData.filter(r => {
                const rDate = new Date(r.date);
                return rDate.toLocaleDateString('en-US', { weekday: 'long' }) === day &&
                    r.status === 'completed';
            });
            // Group by hour
            const hourlyData = new Map();
            dayData.forEach(r => {
                const hour = r.time.split(':')[0] + ':00';
                if (!hourlyData.has(hour))
                    hourlyData.set(hour, []);
                hourlyData.get(hour).push(r.partySize);
            });
            // Calculate averages
            const peakHours = Array.from(hourlyData.entries()).map(([time, partySizes]) => ({
                time,
                averageCovers: partySizes.reduce((sum, size) => sum + size, 0) / partySizes.length,
                occupancyRate: Math.min(partySizes.reduce((sum, size) => sum + size, 0) / (100 * partySizes.length), 1),
            })).sort((a, b) => b.averageCovers - a.averageCovers);
            // Generate recommendations
            const recommendations = [];
            if (peakHours.length > 0 && peakHours[0].occupancyRate > 0.85) {
                recommendations.push(`Consider additional seating capacity during ${peakHours[0].time}`);
                recommendations.push('Implement waitlist management');
            }
            recommendations.push(`Optimize staffing for peak hours: ${peakHours.slice(0, 3).map(h => h.time).join(', ')}`);
            analyses.push({
                dayOfWeek: day,
                peakHours,
                recommendations,
            });
        }
        return analyses;
    }
    /**
     * Identify revenue optimization opportunities
     */
    async optimizeRevenue(currentMonthData, averageCheckSize) {
        console.log('[Analytics] Analyzing revenue optimization opportunities');
        // Calculate current revenue
        const completedReservations = currentMonthData.filter(r => r.status === 'completed');
        const totalCovers = completedReservations.reduce((sum, r) => sum + r.partySize, 0);
        const currentRevenue = totalCovers * averageCheckSize;
        // Identify opportunities
        const opportunities = [];
        // Opportunity 1: Reduce no-shows
        const noShows = currentMonthData.filter(r => r.status === 'no-show');
        const lostCovers = noShows.reduce((sum, r) => sum + r.partySize, 0);
        const noShowImpact = lostCovers * averageCheckSize;
        if (noShows.length > 0) {
            opportunities.push({
                category: 'No-Show Reduction',
                impact: noShowImpact * 0.5, // Assume 50% reduction possible
                actionItems: [
                    'Implement SMS reminder system',
                    'Require deposits for parties of 6+',
                    'Build waitlist to fill no-show slots',
                    'Track repeat offenders',
                ],
            });
        }
        // Opportunity 2: Fill low-occupancy slots
        const lowOccupancySlots = this.identifyLowOccupancySlots(currentMonthData);
        const additionalCoversFromFilling = lowOccupancySlots * 20; // Assume 20 covers per slot
        opportunities.push({
            category: 'Off-Peak Optimization',
            impact: additionalCoversFromFilling * averageCheckSize,
            actionItems: [
                'Offer early-bird specials for 5-6 PM slots',
                'Promote lunch service to local businesses',
                'Create special events for slow nights',
                'Partner with hotels for guest dining packages',
            ],
        });
        // Opportunity 3: Upsell high-value items
        opportunities.push({
            category: 'Menu Optimization',
            impact: currentRevenue * 0.15, // 15% potential increase
            actionItems: [
                'Train staff on wine pairing recommendations',
                'Highlight premium appetizers and desserts',
                'Create tasting menu options',
                'Implement premium cocktail program',
            ],
        });
        // Opportunity 4: Increase table turns
        const averageDiningTime = 90; // minutes
        if (averageDiningTime > 100) {
            opportunities.push({
                category: 'Table Turn Optimization',
                impact: currentRevenue * 0.20, // 20% potential increase
                actionItems: [
                    'Streamline service timing',
                    'Offer express lunch menu',
                    'Pre-buss tables during meal',
                    'Optimize kitchen workflows',
                ],
            });
        }
        // Calculate total potential
        const potentialRevenue = currentRevenue + opportunities.reduce((sum, opp) => sum + opp.impact, 0);
        return {
            currentRevenue,
            potentialRevenue,
            opportunities: opportunities.sort((a, b) => b.impact - a.impact),
        };
    }
    // ============================================================================
    // HELPER METHODS
    // ============================================================================
    getDaysDifference(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2.getTime() - d1.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    isPrimeTimeSlot(time) {
        const hour = parseInt(time.split(':')[0]);
        return hour >= 18 && hour <= 20; // 6-8 PM
    }
    calculateStaffing(predictedCovers) {
        return {
            servers: Math.ceil(predictedCovers / 15), // 1 server per 15 guests
            hosts: Math.ceil(predictedCovers / 50) + 1, // 1 host per 50 guests, minimum 2
            kitchen: Math.ceil(predictedCovers / 20), // 1 kitchen staff per 20 guests
        };
    }
    identifyLowOccupancySlots(data) {
        // Simplified: count time slots with < 30% occupancy
        // In production, would analyze by day/time combinations
        const totalSlots = 100; // Example: 10 time slots * 10 tables
        const occupiedSlots = data.filter(r => r.status === 'completed').length;
        const occupancyRate = occupiedSlots / totalSlots;
        return occupancyRate < 0.3 ? Math.floor((0.3 - occupancyRate) * totalSlots) : 0;
    }
    /**
     * Generate insights using Gemini 2.5 Pro
     */
    async generateInsights(analyticsData) {
        const model = this.vertexAI.preview.getGenerativeModel({
            model: MODEL,
            systemInstruction: `You are an expert restaurant analytics consultant.
Analyze the provided data and provide actionable, specific recommendations to improve operations and revenue.
Focus on practical, implementable suggestions.`,
        });
        const prompt = `
Analyze this restaurant data and provide insights:

${JSON.stringify(analyticsData, null, 2)}

Provide:
1. Top 3 most impactful opportunities
2. Specific action steps for each
3. Expected ROI or impact
4. Implementation timeline and difficulty
`;
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            throw new Error('No response from Gemini');
        }
        return text;
    }
}
exports.PredictiveAnalyticsService = PredictiveAnalyticsService;
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let analyticsServiceInstance = null;
function getPredictiveAnalyticsService() {
    if (!analyticsServiceInstance) {
        analyticsServiceInstance = new PredictiveAnalyticsService();
    }
    return analyticsServiceInstance;
}
// ============================================================================
// USAGE EXAMPLE
// ============================================================================
/*
const analyticsService = getPredictiveAnalyticsService();

// Predict no-show
const prediction = await analyticsService.predictNoShow(reservation, historicalData);
console.log(`No-show probability: ${(prediction.noShowProbability * 100).toFixed(1)}%`);
console.log(`Risk level: ${prediction.riskLevel}`);

// Forecast demand
const forecasts = await analyticsService.forecastDemand('2025-10-20', historicalData);
console.log('Demand forecast:', forecasts);

// Analyze peak times
const peakAnalysis = await analyticsService.analyzePeakTimes(historicalData);
console.log('Peak times:', peakAnalysis);

// Optimize revenue
const revenueOpp = await analyticsService.optimizeRevenue(monthData, 65);
console.log(`Current revenue: $${revenueOpp.currentRevenue}`);
console.log(`Potential revenue: $${revenueOpp.potentialRevenue}`);
console.log(`Opportunities: ${revenueOpp.opportunities.length}`);
*/
//# sourceMappingURL=predictive-analytics.js.map