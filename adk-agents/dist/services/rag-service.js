"use strict";
/**
 * RAG (Retrieval-Augmented Generation) Service
 *
 * Integrates Vertex AI RAG Engine with restaurant knowledge base
 * to provide accurate, context-aware responses for Customer Service Agent
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGService = void 0;
exports.initializeRAGService = initializeRAGService;
exports.getRAGService = getRAGService;
const vertexai_1 = require("@google-cloud/vertexai");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ============================================================================
// CONFIGURATION
// ============================================================================
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id';
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const EMBEDDING_MODEL = 'text-embedding-004'; // Latest Vertex AI embedding model
// ============================================================================
// KNOWLEDGE BASE LOADER
// ============================================================================
class KnowledgeBaseLoader {
    knowledgeBasePath;
    constructor(knowledgeBasePath) {
        this.knowledgeBasePath = knowledgeBasePath;
    }
    /**
     * Load and parse all knowledge base markdown files
     */
    async loadDocuments() {
        const documents = [];
        const files = fs.readdirSync(this.knowledgeBasePath);
        for (const file of files) {
            if (file.endsWith('.md') && file !== 'README.md') {
                const filePath = path.join(this.knowledgeBasePath, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                // Split by headers to create smaller, more focused chunks
                const chunks = this.splitByHeaders(content, file);
                documents.push(...chunks);
            }
        }
        console.log(`[RAG] Loaded ${documents.length} knowledge chunks from ${files.length} files`);
        return documents;
    }
    /**
     * Split markdown content by headers for better RAG retrieval
     */
    splitByHeaders(content, filename) {
        const chunks = [];
        const lines = content.split('\n');
        let currentSection = '';
        let currentContent = [];
        let sectionNumber = 0;
        for (const line of lines) {
            // Check if line is a header (starts with #)
            if (line.startsWith('#')) {
                // Save previous section if it exists
                if (currentContent.length > 0) {
                    chunks.push({
                        id: `${filename}-${sectionNumber}`,
                        source: filename,
                        content: currentContent.join('\n').trim(),
                        metadata: {
                            category: this.getCategoryFromFilename(filename),
                            filename,
                            section: currentSection,
                        },
                    });
                    sectionNumber++;
                }
                // Start new section
                currentSection = line.replace(/^#+\s*/, ''); // Remove # symbols
                currentContent = [line]; // Include header in content
            }
            else {
                currentContent.push(line);
            }
        }
        // Save last section
        if (currentContent.length > 0) {
            chunks.push({
                id: `${filename}-${sectionNumber}`,
                source: filename,
                content: currentContent.join('\n').trim(),
                metadata: {
                    category: this.getCategoryFromFilename(filename),
                    filename,
                    section: currentSection,
                },
            });
        }
        return chunks;
    }
    getCategoryFromFilename(filename) {
        const name = filename.replace('.md', '');
        return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
}
// ============================================================================
// RAG ENGINE
// ============================================================================
class RAGService {
    vertexAI;
    documents = [];
    embeddings = new Map();
    constructor() {
        this.vertexAI = new vertexai_1.VertexAI({
            project: PROJECT_ID,
            location: LOCATION,
        });
    }
    /**
     * Initialize RAG service by loading and embedding knowledge base
     */
    async initialize(knowledgeBasePath) {
        console.log('[RAG] Initializing RAG service...');
        // Load documents
        const loader = new KnowledgeBaseLoader(knowledgeBasePath);
        this.documents = await loader.loadDocuments();
        // Generate embeddings for all documents
        await this.generateEmbeddings();
        console.log('[RAG] RAG service initialized successfully');
    }
    /**
     * Generate embeddings for all knowledge base documents
     */
    async generateEmbeddings() {
        console.log('[RAG] Generating embeddings...');
        const model = this.vertexAI.preview.getGenerativeModel({
            model: 'text-embedding-004',
        });
        // Process in batches to avoid rate limits
        const batchSize = 5;
        for (let i = 0; i < this.documents.length; i += batchSize) {
            const batch = this.documents.slice(i, i + batchSize);
            for (const doc of batch) {
                try {
                    const result = await model.generateContent({
                        contents: [{ role: 'user', parts: [{ text: doc.content }] }],
                    });
                    // Note: This is a simplified version. In production, use proper embedding endpoint
                    // For now, we'll use a simple similarity based on content overlap
                    this.embeddings.set(doc.id, this.createSimpleEmbedding(doc.content));
                }
                catch (error) {
                    console.error(`[RAG] Error generating embedding for ${doc.id}:`, error);
                }
            }
        }
        console.log(`[RAG] Generated ${this.embeddings.size} embeddings`);
    }
    /**
     * Simple embedding creation (for demonstration)
     * In production, use proper Vertex AI embedding endpoint
     */
    createSimpleEmbedding(text) {
        // Simplified: create embedding based on key terms
        const terms = text.toLowerCase().split(/\W+/);
        const embedding = new Array(128).fill(0);
        terms.forEach((term, idx) => {
            const hash = this.simpleHash(term);
            embedding[hash % 128] += 1;
        });
        return embedding;
    }
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
    /**
     * Retrieve relevant context for a query
     */
    async retrieve(query, topK = 3) {
        console.log(`[RAG] Retrieving context for query: "${query}"`);
        // Generate embedding for query
        const queryEmbedding = this.createSimpleEmbedding(query);
        // Calculate similarity scores
        const scores = [];
        this.embeddings.forEach((embedding, docId) => {
            const similarity = this.cosineSimilarity(queryEmbedding, embedding);
            scores.push({ docId, score: similarity });
        });
        // Sort by relevance and take top K
        scores.sort((a, b) => b.score - a.score);
        const topResults = scores.slice(0, topK);
        // Map back to documents
        const results = topResults.map(result => {
            const doc = this.documents.find(d => d.id === result.docId);
            if (!doc)
                throw new Error(`Document ${result.docId} not found`);
            return {
                content: doc.content,
                source: doc.source,
                relevanceScore: result.score,
                metadata: doc.metadata,
            };
        });
        console.log(`[RAG] Retrieved ${results.length} relevant documents`);
        return results;
    }
    /**
     * Calculate cosine similarity between two embeddings
     */
    cosineSimilarity(a, b) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    /**
     * Generate RAG-enhanced response
     */
    async generateResponse(query, topK = 3) {
        // Retrieve relevant context
        const retrievedContext = await this.retrieve(query, topK);
        // Calculate confidence based on top relevance score
        const confidence = retrievedContext.length > 0
            ? retrievedContext[0].relevanceScore
            : 0;
        return {
            query,
            retrievedContext,
            confidence,
        };
    }
    /**
     * Get knowledge base statistics
     */
    getStatistics() {
        return {
            totalDocuments: this.documents.length,
            totalEmbeddings: this.embeddings.size,
            categories: [...new Set(this.documents.map(d => d.metadata.category))],
            sources: [...new Set(this.documents.map(d => d.source))],
        };
    }
}
exports.RAGService = RAGService;
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let ragServiceInstance = null;
async function initializeRAGService(knowledgeBasePath) {
    if (!ragServiceInstance) {
        ragServiceInstance = new RAGService();
        await ragServiceInstance.initialize(knowledgeBasePath);
    }
    return ragServiceInstance;
}
function getRAGService() {
    if (!ragServiceInstance) {
        throw new Error('RAG service not initialized. Call initializeRAGService first.');
    }
    return ragServiceInstance;
}
// ============================================================================
// USAGE EXAMPLE
// ============================================================================
/*
// Initialize RAG service
const knowledgeBasePath = path.join(__dirname, '..', '..', 'knowledge-base');
const ragService = await initializeRAGService(knowledgeBasePath);

// Query the service
const response = await ragService.generateResponse('What is your cancellation policy?');

console.log('Query:', response.query);
console.log('Confidence:', response.confidence);
console.log('Retrieved Context:');
response.retrievedContext.forEach((result, idx) => {
  console.log(`  ${idx + 1}. [${result.source}] (${result.relevanceScore.toFixed(3)})`);
  console.log(`     ${result.content.substring(0, 150)}...`);
});

// Get statistics
const stats = ragService.getStatistics();
console.log('RAG Statistics:', stats);
*/
//# sourceMappingURL=rag-service.js.map