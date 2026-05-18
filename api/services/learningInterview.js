/**
 * Learning Interview Service
 *
 * Multi-turn AI conversation that interviews restaurant owners
 * to build deep knowledge about their restaurant personality,
 * cuisine identity, atmosphere, and unique characteristics.
 *
 * Topics: cuisine_identity, atmosphere_vibe, signature_dishes, guest_experience,
 *         unique_differentiators, communication_style, special_occasions, things_to_know
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { getAnthropicClient } = require('./restaurantIntelligence');
const { AI_MODEL, AI_MODEL_FAST } = require('../_lib/ai-client');

const logger = createSecureLogger('LearningInterview');

// Anthropic API call timeout (25s, leaving buffer for Vercel 60s limit)
const ANTHROPIC_TIMEOUT_MS = 25000;

const INTERVIEW_TOPICS = [
  {
    id: 'cuisine_identity',
    label: 'Cuisine Identity',
    description: 'What makes your cuisine unique',
    starter: "Let's talk about your cuisine. What would you say defines your restaurant's culinary identity? Are there specific traditions, regions, or philosophies that inspire your kitchen?"
  },
  {
    id: 'atmosphere_vibe',
    label: 'Atmosphere & Vibe',
    description: 'The feeling of being in your restaurant',
    starter: "Now I'd love to understand the atmosphere. When guests walk into your restaurant, what feeling do you want them to have? How would you describe the vibe?"
  },
  {
    id: 'signature_dishes',
    label: 'Signature Dishes',
    description: 'Your most special menu items',
    starter: "Let's talk about your standout dishes. What are the items that guests always rave about or that you're most proud of? What makes them special?"
  },
  {
    id: 'guest_experience',
    label: 'Guest Experience',
    description: 'How you treat your guests',
    starter: "Tell me about the guest experience you aim for. From the moment someone calls to make a reservation until they leave - what should that journey feel like?"
  },
  {
    id: 'unique_differentiators',
    label: 'Unique Differentiators',
    description: 'What sets you apart',
    starter: "What makes your restaurant truly different from others? If a guest asked 'Why should I choose you over the restaurant next door?' - what would you say?"
  },
  {
    id: 'communication_style',
    label: 'Communication Style',
    description: 'How you talk to guests',
    starter: "How would you describe the way your team communicates with guests? Is it formal and elegant, casual and friendly, or something else entirely? Any phrases or words you typically use?"
  },
  {
    id: 'special_occasions',
    label: 'Special Occasions',
    description: 'How you handle celebrations',
    starter: "How do you handle special occasions? Birthdays, anniversaries, proposals - do you do anything special? Any memorable stories?"
  },
  {
    id: 'things_to_know',
    label: 'Important Details',
    description: 'Things guests should know',
    starter: "Are there any important things that guests or the AI receptionist should always know? Dietary accommodations, parking tips, dress code, or any other details that come up often?"
  },
  {
    id: 'operations_philosophy',
    label: 'Operations Philosophy',
    description: 'How you run your restaurant day-to-day',
    starter: "Now let's talk about how you run things behind the scenes. What's your approach to managing a busy service? Any rituals, systems, or philosophies that keep your team in sync?"
  },
  {
    id: 'team_culture',
    label: 'Team Culture',
    description: 'Your team dynamics and values',
    starter: "Tell me about your team. What kind of culture have you built? How do you handle training, feedback, or team morale? What makes your staff stick around?"
  },
  {
    id: 'business_goals',
    label: 'Business Goals',
    description: 'Where you want to take the restaurant',
    starter: "What are your goals for the next 6-12 months? Are you looking to grow covers, improve margins, launch new concepts, or something else entirely?"
  },
  {
    id: 'ai_expectations',
    label: 'AI Expectations',
    description: 'What you want from your AI manager',
    starter: "Finally, what would make your AI manager truly valuable to you? What tasks drain your time the most? What decisions would you love help with? What would make you say 'this was worth it'?"
  }
];

const SYSTEM_PROMPT = `You are an expert restaurant consultant conducting a discovery interview with a restaurant owner. Your goal is to deeply understand their restaurant's personality, soul, and unique characteristics so you can build an authentic AI persona for their receptionist.

Guidelines:
- Be warm, curious, and conversational - make the owner feel heard
- Ask follow-up questions that dig deeper into specifics
- Pick up on emotional cues and stories - those reveal the restaurant's soul
- When you have enough information on a topic, naturally transition to the next one
- Extract concrete details: specific dish names, specific greetings, specific feelings
- Keep responses concise (2-4 sentences) with one focused follow-up question
- Reference what the owner has shared to show you're actively listening
- DO NOT make things up or assume - always ask when you need more detail

When you feel a topic is well-covered (usually after 2-3 exchanges), indicate this by including [TOPIC_COMPLETE] at the very end of your message.

Current interview context will be provided in each message.`;

/**
 * Start or resume an interview session
 * @param {string} sessionId - Session ID
 * @param {string} restaurantConfigId - Restaurant config ID
 * @param {object} intelligenceData - Pre-gathered intelligence
 * @returns {object} Session state and first/next AI message
 */
async function startOrResumeInterview(sessionId, restaurantConfigId, intelligenceData) {
  if (!supabaseAdmin) {
    throw new Error('Database not available');
  }

  // Check for existing session
  const { data: existingSession } = await supabaseAdmin
    .schema('restaurant')
    .from('learning_interviews')
    .select('id, restaurant_config_id, status, current_topic_index, messages, extracted_knowledge, intelligence_context, started_at')
    .eq('id', sessionId)
    .single();

  if (existingSession) {
    logger.info('Resuming interview session:', sessionId);
    const currentTopicIndex = existingSession.current_topic_index || 0;
    const currentTopic = INTERVIEW_TOPICS[currentTopicIndex];
    const sessionMessages = existingSession.messages || [];
    const lastAiMsg = [...sessionMessages].reverse().find(m => m.role === 'assistant');

    return {
      session_id: sessionId,
      restaurant_config_id: restaurantConfigId,
      status: existingSession.status,
      current_topic: currentTopic?.id || 'completed',
      current_topic_label: currentTopic?.label || 'Completed',
      topics_completed: currentTopicIndex,
      total_topics: INTERVIEW_TOPICS.length,
      completion_percentage: Math.round((currentTopicIndex / INTERVIEW_TOPICS.length) * 100),
      ai_message: lastAiMsg?.content || null,
      messages: sessionMessages,
      extracted_knowledge: existingSession.extracted_knowledge || {}
    };
  }

  // Create new session
  const intelligenceSummary = intelligenceData?.summary || {};
  const contextMessage = buildIntelligenceContext(intelligenceSummary);
  const firstTopic = INTERVIEW_TOPICS[0];

  const aiGreeting = intelligenceSummary.description
    ? `Great! I've already found some information about your restaurant - it looks like ${intelligenceSummary.description} Let me ask a few questions to really understand the soul of your place.\n\n${firstTopic.starter}`
    : `I'm excited to learn about your restaurant! I'll ask you a series of questions to understand what makes your place truly special. This will help your AI receptionist represent you authentically.\n\n${firstTopic.starter}`;

  const initialMessages = [
    { role: 'assistant', content: aiGreeting, timestamp: new Date().toISOString() }
  ];

  const { error } = await supabaseAdmin
    .schema('restaurant')
    .from('learning_interviews')
    .insert({
      id: sessionId,
      restaurant_config_id: restaurantConfigId,
      status: 'in_progress',
      current_topic_index: 0,
      messages: initialMessages,
      extracted_knowledge: {},
      intelligence_context: contextMessage,
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create interview session:', error);
    // Surface the actual Postgres error so we can see column/FK/RLS failures
    // instead of the opaque generic message. Audit 2026-05-18.
    throw new Error(`Failed to create interview session: ${error.message || error.code || JSON.stringify(error).slice(0, 200)}`);
  }

  return {
    session_id: sessionId,
    restaurant_config_id: restaurantConfigId,
    status: 'in_progress',
    current_topic: firstTopic.id,
    current_topic_label: firstTopic.label,
    topics_completed: 0,
    total_topics: INTERVIEW_TOPICS.length,
    completion_percentage: 0,
    ai_message: aiGreeting,
    messages: initialMessages,
    extracted_knowledge: {}
  };
}

/**
 * Process a user message in the interview and return AI response
 * @param {string} sessionId - Session ID
 * @param {string} userMessage - User's message
 * @returns {object} AI response, extracted data, completion info
 */
async function processInterviewMessage(sessionId, userMessage) {
  if (!supabaseAdmin) {
    throw new Error('Database not available');
  }

  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Fetch current session
  const { data: session, error: fetchError } = await supabaseAdmin
    .schema('restaurant')
    .from('learning_interviews')
    .select('id, restaurant_config_id, status, current_topic_index, messages, extracted_knowledge, intelligence_context')
    .eq('id', sessionId)
    .single();

  if (fetchError || !session) {
    throw new Error('Interview session not found');
  }

  if (session.status === 'completed') {
    return {
      ai_message: "We've already completed the interview! You can now generate your restaurant's AI persona.",
      is_complete: true,
      completion_percentage: 100
    };
  }

  const currentTopicIndex = session.current_topic_index || 0;
  const currentTopic = INTERVIEW_TOPICS[currentTopicIndex];
  const existingMessages = session.messages || [];

  // Create new messages array (immutable - no mutation of existing array)
  const updatedMessages = [
    ...existingMessages,
    {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    }
  ];

  // Build conversation for Claude (use sliding window to limit tokens)
  const contextInfo = `
Current topic: ${currentTopic.label} (${currentTopicIndex + 1}/${INTERVIEW_TOPICS.length})
Topic description: ${currentTopic.description}
${session.intelligence_context ? `\nPre-gathered intelligence:\n${session.intelligence_context}` : ''}`;

  // Sliding window: send last 20 messages to avoid unbounded token growth
  const recentMessages = updatedMessages.slice(-20);
  const claudeMessages = recentMessages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  }));

  // Run Sonnet conversation and Haiku extraction in parallel (independent)
  const conversationController = new AbortController();
  const conversationTimeout = setTimeout(() => conversationController.abort(), ANTHROPIC_TIMEOUT_MS);

  const [response, newKnowledge] = await Promise.all([
    anthropic.messages.create({
      model: AI_MODEL,  // Routed via OpenRouter; the SDK-format Anthropic ID
      max_tokens: 500,
      system: `${SYSTEM_PROMPT}\n\n${contextInfo}`,
      messages: claudeMessages,
      signal: conversationController.signal
    }),
    extractInterviewKnowledge(
      session.extracted_knowledge || {},
      currentTopic.id,
      userMessage,
      anthropic
    )
  ]);
  clearTimeout(conversationTimeout);

  let aiMessage = response.content[0]?.text || '';
  const topicComplete = aiMessage.includes('[TOPIC_COMPLETE]');
  aiMessage = aiMessage.replace('[TOPIC_COMPLETE]', '').trim();

  let nextTopicIndex = currentTopicIndex;
  let status = 'in_progress';
  let quickReplies = null;

  if (topicComplete) {
    nextTopicIndex = currentTopicIndex + 1;

    if (nextTopicIndex >= INTERVIEW_TOPICS.length) {
      status = 'ready_for_persona';
      aiMessage += "\n\nI now have a great understanding of your restaurant! You can generate your AI persona whenever you're ready.";
    } else {
      const nextTopic = INTERVIEW_TOPICS[nextTopicIndex];
      aiMessage += `\n\n${nextTopic.starter}`;
    }
  }

  // Create final messages array with AI response (immutable)
  const finalMessages = [
    ...updatedMessages,
    {
      role: 'assistant',
      content: aiMessage,
      timestamp: new Date().toISOString(),
      topic: currentTopic.id
    }
  ];

  // Generate quick replies for next message
  if (status !== 'ready_for_persona') {
    quickReplies = generateQuickReplies(INTERVIEW_TOPICS[nextTopicIndex]?.id || currentTopic.id);
  }

  // Update session
  const { error: updateError } = await supabaseAdmin
    .schema('restaurant')
    .from('learning_interviews')
    .update({
      current_topic_index: nextTopicIndex,
      messages: finalMessages,
      extracted_knowledge: newKnowledge,
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  if (updateError) {
    logger.error('Failed to update interview session:', updateError);
    throw new Error('Failed to save interview progress');
  }

  const completionPercentage = Math.round((nextTopicIndex / INTERVIEW_TOPICS.length) * 100);

  // Return the actual topic IDs covered (avoids lossy round-trip in the API layer)
  const topicsCovered = INTERVIEW_TOPICS.slice(0, nextTopicIndex).map(t => t.id);

  return {
    ai_message: aiMessage,
    extracted_data_updates: newKnowledge,
    quick_replies: quickReplies,
    completion_percentage: completionPercentage,
    is_complete: status === 'ready_for_persona',
    current_topic: INTERVIEW_TOPICS[nextTopicIndex]?.id || 'completed',
    current_topic_label: INTERVIEW_TOPICS[nextTopicIndex]?.label || 'Completed',
    topics_covered: topicsCovered
  };
}

/**
 * Extract structured knowledge from interview exchange
 * @param {object} existingKnowledge - Already extracted knowledge
 * @param {string} topicId - Current topic ID
 * @param {string} userMessage - User's latest message
 * @param {string} anthropicKey - API key
 * @returns {object} Updated knowledge object
 */
async function extractInterviewKnowledge(existingKnowledge, topicId, userMessage, anthropicClient) {
  try {
    const anthropic = typeof anthropicClient === 'object' ? anthropicClient : getAnthropicClient();
    if (!anthropic) return existingKnowledge;

    const extractionController = new AbortController();
    const extractionTimeout = setTimeout(() => extractionController.abort(), 15000);

    const response = await anthropic.messages.create({
      model: AI_MODEL_FAST,  // Haiku via OpenRouter for fast knowledge extraction
      max_tokens: 500,
      signal: extractionController.signal,
      messages: [{
        role: 'user',
        content: `Extract key facts from this restaurant owner's response about the topic "${topicId}". Return a JSON object with the topic ID as key and an array of extracted facts. Only include concrete, specific information.

Return format: { "${topicId}": ["fact 1", "fact 2"] }
Merge with any existing facts for this topic. Return ONLY valid JSON.

Existing knowledge: ${JSON.stringify(existingKnowledge)}

Owner's response: ${JSON.stringify(userMessage)}`
      }]
    });
    clearTimeout(extractionTimeout);

    const responseText = response.content[0]?.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return existingKnowledge;

    let newFacts;
    try {
      newFacts = JSON.parse(jsonMatch[0]);
    } catch {
      logger.warn('Invalid JSON from knowledge extraction');
      return existingKnowledge;
    }

    // Merge with existing knowledge (immutable)
    const merged = { ...existingKnowledge };
    for (const [key, facts] of Object.entries(newFacts)) {
      if (!Array.isArray(facts)) continue;
      const existingFacts = merged[key] || [];
      merged[key] = [...new Set([...existingFacts, ...facts])];
    }

    return merged;
  } catch (error) {
    logger.error('Knowledge extraction error:', error);
    return existingKnowledge;
  }
}

/**
 * Generate quick reply suggestions based on current topic
 * @param {string} topicId - Current topic
 * @returns {string[]} Quick reply suggestions
 */
function generateQuickReplies(topicId) {
  const replies = {
    cuisine_identity: [
      "We focus on traditional recipes with a modern twist",
      "Our cuisine is inspired by local, seasonal ingredients",
      "We specialize in authentic regional cooking"
    ],
    atmosphere_vibe: [
      "Warm and intimate, like dining at a friend's home",
      "Energetic and lively, with an open kitchen vibe",
      "Elegant but relaxed, not stuffy"
    ],
    signature_dishes: [
      "Our most popular dish is...",
      "Guests always come back for...",
      "Our chef's specialty is..."
    ],
    guest_experience: [
      "We want guests to feel like family",
      "We aim for a memorable, personalized experience",
      "We keep it simple but attentive"
    ],
    unique_differentiators: [
      "Our location and history make us unique",
      "It's really about our team and their passion",
      "We do things differently because..."
    ],
    communication_style: [
      "We're friendly and casual, first-name basis",
      "Professional but warm, never stiff",
      "We match the guest's energy"
    ],
    special_occasions: [
      "We love celebrating with our guests!",
      "We have special arrangements for occasions",
      "We keep it subtle unless asked"
    ],
    things_to_know: [
      "We accommodate most dietary needs",
      "Parking can be tricky, so we always mention...",
      "We have a smart casual dress code"
    ],
    operations_philosophy: [
      "We run tight pre-service briefings every day",
      "Our kitchen and front-of-house communicate constantly",
      "We rely on checklists and routines"
    ],
    team_culture: [
      "We're like a family — everyone pitches in",
      "We invest heavily in training and development",
      "Low turnover is our biggest achievement"
    ],
    business_goals: [
      "We want to grow covers without sacrificing quality",
      "We're focused on improving margins this year",
      "We're planning to expand or open a new location"
    ],
    ai_expectations: [
      "Help me stay on top of no-shows and cancellations",
      "I want daily insights without checking 10 reports",
      "Help with staffing decisions and forecasting"
    ]
  };

  return replies[topicId] || null;
}

/**
 * Complete an interview session
 * @param {string} sessionId - Session ID
 * @returns {object} Final interview data
 */
async function completeInterview(sessionId) {
  const { data: session, error } = await supabaseAdmin
    .schema('restaurant')
    .from('learning_interviews')
    .select('id, restaurant_config_id, status, extracted_knowledge, questions_asked, answers, completed_at, created_at, updated_at')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    throw new Error('Interview session not found');
  }

  const { error: updateError } = await supabaseAdmin
    .schema('restaurant')
    .from('learning_interviews')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', sessionId);

  if (updateError) {
    logger.error('Failed to complete interview:', updateError);
  }

  return {
    session_id: sessionId,
    status: 'completed',
    extracted_knowledge: session.extracted_knowledge || {},
    messages_count: (session.messages || []).length,
    topics_covered: session.current_topic_index || 0
  };
}

/**
 * Build a text summary of intelligence data for interview context
 * @param {object} summary - Intelligence summary
 * @returns {string} Context string
 */
function buildIntelligenceContext(summary) {
  if (!summary || Object.keys(summary).length === 0) return '';

  const parts = [];
  if (summary.description) parts.push(`Description: ${summary.description}`);
  if (summary.cuisine_type) parts.push(`Cuisine: ${summary.cuisine_type}`);
  if (summary.atmosphere) parts.push(`Atmosphere: ${summary.atmosphere}`);
  if (summary.rating) parts.push(`Rating: ${summary.rating}/5 (${summary.review_count} reviews)`);
  if (summary.price_level) parts.push(`Price level: ${summary.price_level}`);
  if (summary.signature_dishes?.length > 0) {
    parts.push(`Known dishes: ${summary.signature_dishes.join(', ')}`);
  }

  return parts.join('\n');
}

module.exports = {
  startOrResumeInterview,
  processInterviewMessage,
  extractInterviewKnowledge,
  completeInterview,
  INTERVIEW_TOPICS
};
