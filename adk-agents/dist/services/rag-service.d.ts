/**
 * RAG (Retrieval-Augmented Generation) Service
 *
 * Integrates Vertex AI RAG Engine with restaurant knowledge base
 * to provide accurate, context-aware responses for Customer Service Agent
 */
interface RetrievalResult {
    content: string;
    source: string;
    relevanceScore: number;
    metadata: Record<string, any>;
}
interface RAGResponse {
    query: string;
    retrievedContext: RetrievalResult[];
    answer?: string;
    confidence: number;
}
export declare class RAGService {
    private vertexAI;
    private documents;
    private embeddings;
    constructor();
    /**
     * Initialize RAG service by loading and embedding knowledge base
     */
    initialize(knowledgeBasePath: string): Promise<void>;
    /**
     * Generate embeddings for all knowledge base documents
     */
    private generateEmbeddings;
    /**
     * Simple embedding creation (for demonstration)
     * In production, use proper Vertex AI embedding endpoint
     */
    private createSimpleEmbedding;
    private simpleHash;
    /**
     * Retrieve relevant context for a query
     */
    retrieve(query: string, topK?: number): Promise<RetrievalResult[]>;
    /**
     * Calculate cosine similarity between two embeddings
     */
    private cosineSimilarity;
    /**
     * Generate RAG-enhanced response
     */
    generateResponse(query: string, topK?: number): Promise<RAGResponse>;
    /**
     * Get knowledge base statistics
     */
    getStatistics(): {
        totalDocuments: number;
        totalEmbeddings: number;
        categories: string[];
        sources: string[];
    };
}
export declare function initializeRAGService(knowledgeBasePath: string): Promise<RAGService>;
export declare function getRAGService(): RAGService;
export {};
//# sourceMappingURL=rag-service.d.ts.map