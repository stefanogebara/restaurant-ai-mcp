const { supabaseAdmin } = require('./supabase');

/**
 * Build a plain-text knowledge document from restaurant data.
 */
function buildKnowledgeDoc(config, managerFacts, menuItems) {
  const lines = [];

  lines.push(`# ${config.restaurant_name || 'Restaurant'}`);
  lines.push('');

  // Basic info
  if (config.phone) lines.push(`Phone: ${config.phone}`);
  if (config.email) lines.push(`Email: ${config.email}`);
  if (config.city || config.country) {
    lines.push(`Location: ${[config.city, config.country].filter(Boolean).join(', ')}`);
  }
  if (config.restaurant_type) lines.push(`Type: ${config.restaurant_type}`);
  if (config.timezone) lines.push(`Timezone: ${config.timezone}`);
  lines.push('');

  // Business hours
  if (config.business_hours) {
    lines.push('## Business Hours');
    if (typeof config.business_hours === 'object') {
      for (const [day, hours] of Object.entries(config.business_hours)) {
        lines.push(`- ${day}: ${typeof hours === 'string' ? hours : JSON.stringify(hours)}`);
      }
    } else {
      lines.push(String(config.business_hours));
    }
    lines.push('');
  }

  // Reservation policies
  if (config.average_dining_duration_minutes) {
    lines.push(`Average dining duration: ${config.average_dining_duration_minutes} minutes`);
  }
  if (config.deposit_config) {
    const dc = config.deposit_config;
    if (dc.enabled) {
      lines.push(`Deposit required: ${dc.type === 'per_person' ? `R$${dc.amount} per person` : `R$${dc.amount} flat`} for parties of ${dc.min_party_size}+`);
    }
  }
  lines.push('');

  // Persona / profile
  if (config.agent_greeting) {
    lines.push('## Greeting');
    lines.push(config.agent_greeting);
    lines.push('');
  }

  if (config.persona_prompt_override) {
    lines.push('## Personality & Persona');
    lines.push(config.persona_prompt_override);
    lines.push('');
  }

  if (config.ai_personality) {
    const p = typeof config.ai_personality === 'string'
      ? (() => { try { return JSON.parse(config.ai_personality); } catch { return null; } })()
      : config.ai_personality;
    if (p) {
      lines.push('## AI Personality');
      if (p.tone) lines.push(`Tone: ${p.tone}`);
      if (p.style) lines.push(`Style: ${p.style}`);
      if (p.language) lines.push(`Language: ${p.language}`);
      lines.push('');
    }
  }

  // POS menu items (synced from Square/Toast)
  if (menuItems && menuItems.length > 0) {
    lines.push('## Menu');
    // Group by category
    const categories = {};
    for (const item of menuItems) {
      const cat = item.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(item);
    }
    for (const [category, items] of Object.entries(categories)) {
      lines.push(`### ${category}`);
      for (const item of items) {
        const price = item.price_cents ? ` — $${(item.price_cents / 100).toFixed(2)}` : '';
        lines.push(`- ${item.name}${price}${item.description ? `: ${item.description}` : ''}`);
      }
    }
    lines.push('');
  }

  // Manager knowledge (extracted from documents + learned facts)
  if (managerFacts.length > 0) {
    lines.push('## Additional Knowledge');
    for (const fact of managerFacts) {
      lines.push(`- ${fact.content}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Load every input before replacing a tenant's existing KB document. */
async function loadKnowledgeBaseData(restaurantId) {
  if (!restaurantId) throw new Error('Restaurant ID required');
  const [configResult, factsResult, menuResult] = await Promise.all([
    supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name, phone, email, city, country, restaurant_type, timezone, business_hours, average_dining_duration_minutes, deposit_config, ai_personality, agent_greeting, persona_prompt_override, elevenlabs_agent_id, elevenlabs_kb_doc_id')
      .eq('id', restaurantId)
      .single(),
    supabaseAdmin
      .from('manager_memory')
      .select('content')
      .eq('restaurant_id', restaurantId)
      .eq('type', 'fact')
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('pos_menu_items')
      .select('name, description, price_cents, category')
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true)
      .order('category')
      .limit(100),
  ]);

  if (configResult.error || !configResult.data) {
    const error = new Error('Restaurant not found');
    error.code = 'RESTAURANT_NOT_FOUND';
    throw error;
  }
  if (factsResult.error) throw new Error('Failed to load restaurant knowledge');
  if (menuResult.error) throw new Error('Failed to load restaurant menu');
  return {
    config: configResult.data,
    managerFacts: factsResult.data || [],
    menuItems: menuResult.data || [],
  };
}

module.exports = { buildKnowledgeDoc, loadKnowledgeBaseData };
