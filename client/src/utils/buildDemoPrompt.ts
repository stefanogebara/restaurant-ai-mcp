/**
 * buildDemoPrompt
 * Builds a personalized voice agent prompt from scraped restaurant data
 * for the demo voice interstitial.
 */

export interface ScrapedData {
  name: string;
  address: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number;
  cuisine_type: string;
  website: string | null;
  google_maps_url?: string | null;
  editorial_summary: string | null;
  business_hours: Record<string, { open_time: string | null; close_time: string | null; is_open: boolean }> | null;
  hours_text: string[] | null;
  top_reviews: Array<{ text: string; rating: number; author: string }>;
}

function formatHours(data: ScrapedData): string {
  if (data.hours_text && data.hours_text.length > 0) {
    return data.hours_text.join('\n');
  }
  if (!data.business_hours) return 'Hours not available';

  return Object.entries(data.business_hours)
    .map(([day, info]) => {
      if (!info.is_open) return `${day}: Closed`;
      return `${day}: ${info.open_time || '?'} - ${info.close_time || '?'}`;
    })
    .join('\n');
}

function formatTopReviews(reviews: ScrapedData['top_reviews']): string {
  if (!reviews || reviews.length === 0) return '';

  const snippets = reviews
    .slice(0, 3)
    .map((r) => `"${r.text.slice(0, 120)}${r.text.length > 120 ? '...' : ''}" — ${r.author}`)
    .join('\n');

  return `\nCustomers love:\n${snippets}`;
}

export function buildDemoPrompt(data: ScrapedData): string {
  const hoursBlock = formatHours(data);
  const reviewsBlock = formatTopReviews(data.top_reviews);
  const vibeBlock = data.editorial_summary
    ? `\nRestaurant vibe: ${data.editorial_summary}`
    : '';

  return `You are the AI receptionist for ${data.name}.

Restaurant details:
- Name: ${data.name}
- Cuisine: ${data.cuisine_type}${data.address ? `\n- Address: ${data.address}` : ''}${data.phone ? `\n- Phone: ${data.phone}` : ''}${data.rating ? `\n- Rating: ${data.rating}/5 (${data.review_count} reviews)` : ''}${data.website ? `\n- Website: ${data.website}` : ''}

Business hours:
${hoursBlock}
${vibeBlock}
${reviewsBlock}

DEMO CONTEXT: This is a demo. The person speaking is the restaurant manager testing the system. They want to hear how the AI receptionist sounds to their customers. Respond as if they are a regular customer calling the restaurant.

Voice-style guidelines:
- Keep responses concise and phone-appropriate (1-3 sentences max)
- Be warm, professional, and natural — like a great human receptionist
- Speak conversationally, not like a robot reading a script
- When asked about hours, give today's hours first, then offer to share other days
- When asked about reservations, explain that you can help with bookings (but in this demo, you cannot actually create one)
- If asked something you don't know, say so honestly and offer to connect them with the team
- Do NOT use markdown, bullet points, or any text formatting — this is a voice conversation
- Do NOT mention that you are an AI unless directly asked`;
}

export function buildDemoFirstMessage(data: ScrapedData): string {
  const timeOfDay = new Date().getHours();
  const greeting = timeOfDay < 12 ? 'Good morning' : timeOfDay < 18 ? 'Good afternoon' : 'Good evening';

  return `${greeting}! Thank you for calling ${data.name}. How can I help you today?`;
}
