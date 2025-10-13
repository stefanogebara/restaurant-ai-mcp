/**
 * RAG (Retrieval-Augmented Generation) Service
 *
 * Integrates Vertex AI RAG Engine with restaurant knowledge base
 * to provide accurate, context-aware responses for Customer Service Agent
 */

import { VertexAI } from '@google-cloud/vertexai';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id';
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const EMBEDDING_MODEL = 'text-embedding-004'; // Latest Vertex AI embedding model

// ============================================================================
// TYPES
// ============================================================================

interface KnowledgeDocument {
  id: string;
  source: string;
  content: string;
  metadata: {
    category: string;
    filename: string;
    section?: string;
  };
}

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

// ============================================================================
// KNOWLEDGE BASE LOADER
// ============================================================================

class KnowledgeBaseLoader {
  private knowledgeBasePath: string;

  constructor(knowledgeBasePath: string) {
    this.knowledgeBasePath = knowledgeBasePath;
  }

  /**
   * Load and parse all knowledge base markdown files
   */
  async loadDocuments(): Promise<KnowledgeDocument[]> {
    const documents: KnowledgeDocument[] = [];
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
  private splitByHeaders(content: string, filename: string): KnowledgeDocument[] {
    const chunks: KnowledgeDocument[] = [];
    const lines = content.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];
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
      } else {
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

  private getCategoryFromFilename(filename: string): string {
    const name = filename.replace('.md', '');
    return name.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
}

// ============================================================================
// RAG ENGINE
// ============================================================================

export class RAGService {
  private vertexAI: VertexAI;
  private documents: KnowledgeDocument[] = [];
  private embeddings: Map<string, number[]> = new Map();

  constructor() {
    this.vertexAI = new VertexAI({
      project: PROJECT_ID,
      location: LOCATION,
    });
  }

  /**
   * Initialize RAG service by loading and embedding knowledge base
   */
  async initialize(knowledgeBasePath: string): Promise<void> {
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
  private async generateEmbeddings(): Promise<void> {
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
        } catch (error) {
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
  private createSimpleEmbedding(text: string): number[] {
    // Simplified: create embedding based on key terms
    const terms = text.toLowerCase().split(/\W+/);
    const embedding = new Array(128).fill(0);

    terms.forEach((term, idx) => {
      const hash = this.simpleHash(term);
      embedding[hash % 128] += 1;
    });

    return embedding;
  }

  private simpleHash(str: string): number {
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
  async retrieve(query: string, topK: number = 3): Promise<RetrievalResult[]> {
    console.log(`[RAG] Retrieving context for query: "${query}"`);

    // Generate embedding for query
    const queryEmbedding = this.createSimpleEmbedding(query);

    // Calculate similarity scores
    const scores: { docId: string; score: number }[] = [];

    this.embeddings.forEach((embedding, docId) => {
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      scores.push({ docId, score: similarity });
    });

    // Sort by relevance and take top K
    scores.sort((a, b) => b.score - a.score);
    const topResults = scores.slice(0, topK);

    // Map back to documents
    const results: RetrievalResult[] = topResults.map(result => {
      const doc = this.documents.find(d => d.id === result.docId);
      if (!doc) throw new Error(`Document ${result.docId} not found`);

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
  private cosineSimilarity(a: number[], b: number[]): number {
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
  async generateResponse(query: string, topK: number = 3): Promise<RAGResponse> {
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

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let ragServiceInstance: RAGService | null = null;

export async function initializeRAGService(knowledgeBasePath: string): Promise<RAGService> {
  if (!ragServiceInstance) {
    ragServiceInstance = new RAGService();
    await ragServiceInstance.initialize(knowledgeBasePath);
  }
  return ragServiceInstance;
}

export function getRAGService(): RAGService {
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
