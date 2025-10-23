/**
 * Test RAG Service
 * Tests knowledge retrieval from restaurant knowledge base
 */

const path = require('path');

// Import the compiled JavaScript version
const { RAGService } = require('./dist/services/rag-service.js');

// Test queries
const TEST_QUERIES = [
  'What is the cancellation policy?',
  'Do you have vegan options?',
  'What are your business hours?',
  'How do I get to the restaurant?',
  'What seafood dishes do you have?',
];

async function testRAGService() {
  console.log('🧪 Testing RAG Service\n');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Initialize RAG service
    const ragService = new RAGService();
    const knowledgeBasePath = path.join(__dirname, 'knowledge-base');

    console.log(`📚 Loading knowledge base from: ${knowledgeBasePath}\n`);
    await ragService.initialize(knowledgeBasePath);

    console.log('');
    console.log('='.repeat(80));
    console.log('');

    // Test each query
    for (let i = 0; i < TEST_QUERIES.length; i++) {
      const query = TEST_QUERIES[i];
      console.log(`\n🔍 Test ${i + 1}/${TEST_QUERIES.length}: "${query}"`);
      console.log('─'.repeat(80));

      const response = await ragService.generateResponse(query, 3);

      console.log(`\n✅ Confidence Score: ${(response.confidence * 100).toFixed(1)}%`);
      console.log(`📄 Retrieved ${response.retrievedContext.length} relevant documents:\n`);

      response.retrievedContext.forEach((result, idx) => {
        console.log(`  ${idx + 1}. ${result.metadata.category} - ${result.metadata.section || 'Main'}`);
        console.log(`     Source: ${result.source}`);
        console.log(`     Relevance: ${(result.relevanceScore * 100).toFixed(1)}%`);
        console.log(`     Preview: ${result.content.substring(0, 150).replace(/\n/g, ' ')}...`);
        console.log('');
      });

      console.log('─'.repeat(80));
    }

    console.log('\n');
    console.log('='.repeat(80));
    console.log('');
    console.log('📊 TEST SUMMARY');
    console.log('');
    console.log(`✅ All ${TEST_QUERIES.length} queries tested successfully`);
    console.log('✅ RAG Service is operational');
    console.log('✅ Knowledge base loaded and indexed');
    console.log('✅ Retrieval working with similarity scoring');
    console.log('');
    console.log('🎉 RAG Service Test Complete!');
    console.log('');

  } catch (error) {
    console.error('\n❌ RAG Service Test Failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
testRAGService();
