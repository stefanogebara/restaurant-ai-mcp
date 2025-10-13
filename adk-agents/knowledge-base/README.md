# Restaurant AI Knowledge Base

This directory contains comprehensive knowledge base files for the Customer Service Agent to use with RAG (Retrieval-Augmented Generation).

## Contents

### 1. restaurant-policies.md
Complete reference for all restaurant policies:
- Reservation & cancellation policies
- Dining policies (dress code, age policy, table time limits)
- Special requests (dietary, accessibility, celebrations)
- Food & beverage policies
- Group dining & private events
- Health & safety protocols
- Parking & transportation policies
- Contact information & hours

**Use Cases:**
- Customer asking about cancellation policy
- Questions about dress code
- Dietary accommodation inquiries
- Private event planning
- Policy clarifications

### 2. menu-information.md
Detailed menu with prices, ingredients, and allergen information:
- Complete appetizer menu
- Soups & salads
- Seafood, steaks, poultry, pasta, vegetarian options
- Sides and desserts
- Beverage menu (non-alcoholic, wine, cocktails)
- Kids menu & brunch menu
- Daily specials
- Portion size information

**Use Cases:**
- Menu recommendations
- Dietary/allergy questions
- Price inquiries
- Special diet accommodations
- Wine pairings
- Kids options

### 3. faq.md
Frequently asked questions organized by category:
- Reservations
- Menu & dining
- Pricing & payment
- Atmosphere & dress code
- Groups & private events
- Parking & accessibility
- Health & safety
- Wine & bar
- Special diets

**Use Cases:**
- Quick answers to common questions
- First response for routine inquiries
- General information requests
- "Can I..." or "Do you..." questions

### 4. location-services.md
Comprehensive location and services information:
- Address & directions (from all directions)
- Detailed parking options
- Public transportation (bus, subway, commuter rail)
- Ride share information
- Nearby landmarks & hotels
- In-restaurant services & amenities
- Surrounding area attractions
- Emergency services

**Use Cases:**
- Directions requests
- Parking questions
- Hotel recommendations
- Transportation options
- Accessibility information
- Local attractions
- Emergency situations

## RAG Integration

### Implementation

The Customer Service Agent uses these knowledge files with Vertex AI RAG Engine:

```typescript
// Vector store creation
const vectorStore = await VertexAIVectorStore.fromDocuments(
  knowledgeBaseDocuments,
  embeddings,
  {
    projectId: GOOGLE_CLOUD_PROJECT,
    location: VERTEX_AI_LOCATION,
  }
);

// RAG retrieval
const relevantContext = await vectorStore.similaritySearch(query, 3);
```

### Query Examples

**Policy Questions:**
- "What's your cancellation policy?"
  → Retrieves from `restaurant-policies.md` (Reservation Policies section)

**Menu Questions:**
- "Do you have vegan options?"
  → Retrieves from `menu-information.md` (Vegetarian/Vegan sections)

**Location Questions:**
- "How do I get there by subway?"
  → Retrieves from `location-services.md` (Public Transportation section)

**General Questions:**
- "Can kids eat here?"
  → Retrieves from `faq.md` (Kids Menu section) + `restaurant-policies.md` (Age Policy)

### Maintenance

**Updating Content:**
1. Edit the relevant markdown file
2. Rebuild RAG vector store
3. Test with sample queries
4. Deploy updated knowledge base

**Adding New Content:**
1. Add information to appropriate file
2. If new category, consider new file
3. Update this README
4. Rebuild vector store

**Content Review:**
- Monthly: Review for accuracy
- Quarterly: Update prices, seasonal info
- As needed: Policy changes, menu updates

## File Format

All files use Markdown format for:
- Easy readability
- Version control friendly
- Compatible with RAG parsers
- Human-editable

**Structure:**
- Headers (# ## ###) for organization
- Bold for emphasis
- Lists for options/steps
- Code blocks for specific data

## Best Practices

### Content Organization
- Group related information together
- Use clear, hierarchical headers
- Keep sections focused and concise
- Cross-reference between files when needed

### Writing Style
- Clear, conversational language
- Specific, actionable information
- Include examples where helpful
- Avoid jargon or abbreviations

### Completeness
- Answer the obvious follow-up questions
- Include edge cases
- Provide alternatives when applicable
- Specify limitations clearly

### Accuracy
- Verify all information before publishing
- Keep prices and hours current
- Update allergen information carefully
- Double-check policy details

## RAG Performance Optimization

### Chunk Size
- Optimal: 500-1000 tokens per section
- Headers help RAG understand context
- Don't split related information

### Embedding Quality
- Use descriptive headers
- Include relevant keywords naturally
- Repeat key terms when appropriate
- Add context for abbreviations

### Retrieval Accuracy
- Test common queries regularly
- Monitor which sections are retrieved
- Adjust organization if needed
- Add clarifying information for ambiguous topics

## Integration with Agents

### Customer Service Agent
Primary user of knowledge base:
- Answers policy questions
- Provides menu information
- Explains procedures
- Handles special requests

### Reservation Agent
Secondary access:
- Menu recommendations
- Dietary accommodations
- Policy explanations for bookings

### Host Dashboard Agent
Limited access:
- Floor management policies
- Service standards
- Special request handling

## Future Enhancements

### Planned Additions
- Wine list details (pairings, regions, tasting notes)
- Chef biographies and culinary philosophy
- Ingredient sourcing and sustainability practices
- Historical information about restaurant
- Community involvement and partnerships

### Potential New Files
- `wine-guide.md` - Detailed wine information
- `team-bios.md` - Staff and chef information
- `sustainability.md` - Environmental practices
- `history.md` - Restaurant story and evolution
- `special-events.md` - Seasonal and special event menus

## Version Control

**Current Version**: 1.0.0
**Last Updated**: 2025-10-13
**Next Review**: 2025-11-13

**Change Log:**
- 2025-10-13: Initial knowledge base creation with 4 core files
- Future updates will be logged here

## Contact

For knowledge base updates or questions:
- **Technical Issues**: dev@restaurant.com
- **Content Updates**: management@restaurant.com
- **General Info**: info@restaurant.com

---

**Note**: This knowledge base is the foundation of our AI Customer Service Agent's ability to provide accurate, helpful information to guests. Maintaining its accuracy and comprehensiveness is critical to delivering exceptional customer service.
