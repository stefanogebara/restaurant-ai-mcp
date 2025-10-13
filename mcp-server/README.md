# Restaurant AI MCP Server

A Model Context Protocol (MCP) server providing AI agents with comprehensive restaurant management tools.

## 🌟 Features

### 10 Production-Ready MCP Tools

1. **check_restaurant_availability** - Real-time table availability checking
2. **create_reservation** - Create new reservations with validation
3. **lookup_reservation** - Find reservations by ID, phone, or name
4. **modify_reservation** - Update existing reservations
5. **cancel_reservation** - Cancel reservations professionally
6. **get_wait_time** - Estimate current wait times
7. **get_host_dashboard_data** - Complete dashboard data for hosts
8. **seat_party** - Seat walk-ins or check-in reservations
9. **complete_service** - Mark dining service as complete
10. **mark_table_clean** - Update table status to available

## 🚀 Quick Start

### Installation

```bash
cd mcp-server
npm install
```

### Build

```bash
npm run build
```

### Configure Environment

Create `.env` file:

```env
AIRTABLE_API_KEY=your-airtable-api-key
AIRTABLE_BASE_ID=your-base-id
RESERVATIONS_TABLE_ID=your-reservations-table-id
TABLES_TABLE_ID=your-tables-table-id
SERVICE_RECORDS_TABLE_ID=your-service-records-table-id
API_URL=https://restaurant-ai-mcp.vercel.app/api
```

### Run Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### Test with MCP Inspector

```bash
npm run inspector
```

## 🔧 Usage with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application\ Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "restaurant-ai": {
      "command": "node",
      "args": [
        "/absolute/path/to/restaurant-ai-mcp/mcp-server/dist/index.js"
      ],
      "env": {
        "AIRTABLE_API_KEY": "your-key",
        "AIRTABLE_BASE_ID": "your-base-id",
        "RESERVATIONS_TABLE_ID": "your-table-id",
        "TABLES_TABLE_ID": "your-table-id",
        "SERVICE_RECORDS_TABLE_ID": "your-table-id"
      }
    }
  }
}
```

Restart Claude Desktop, and you'll see the restaurant management tools available!

## 📖 Tool Documentation

### check_restaurant_availability

Check if tables are available for a specific date, time, and party size.

**Input:**
```json
{
  "date": "2025-10-20",
  "time": "19:00",
  "party_size": 4
}
```

**Output:**
```json
{
  "available": true,
  "details": {
    "estimated_duration": "120 minutes",
    "available_seats": 34
  },
  "alternative_times": []
}
```

### create_reservation

Create a new reservation after checking availability.

**Input:**
```json
{
  "date": "2025-10-20",
  "time": "19:00",
  "party_size": 4,
  "customer_name": "John Smith",
  "customer_phone": "+15551234567",
  "customer_email": "john@example.com",
  "special_requests": "Window seat, celebrating anniversary"
}
```

**Output:**
```json
{
  "success": true,
  "reservation_id": "RES-20251020-1234",
  "message": "Reservation confirmed for John Smith, party of 4 on 2025-10-20 at 19:00"
}
```

### lookup_reservation

Find an existing reservation.

**Input (by ID):**
```json
{
  "reservation_id": "RES-20251020-1234"
}
```

**Input (by phone):**
```json
{
  "phone": "+15551234567"
}
```

**Output:**
```json
{
  "success": true,
  "reservation": {
    "reservation_id": "RES-20251020-1234",
    "customer_name": "John Smith",
    "party_size": 4,
    "date": "2025-10-20",
    "time": "19:00",
    "status": "Confirmed"
  }
}
```

### seat_party

Seat a walk-in customer or check in a reservation.

**Input:**
```json
{
  "type": "walk-in",
  "customer_name": "Jane Doe",
  "customer_phone": "+15559876543",
  "party_size": 2,
  "table_ids": [3, 4],
  "special_requests": "High chair needed"
}
```

**Output:**
```json
{
  "success": true,
  "service_id": "SVC-20251020-5678",
  "message": "Party of 2 seated successfully",
  "tables_assigned": [3, 4]
}
```

## 🧪 Testing

```bash
# Run tests
npm test

# Test individual tool with MCP Inspector
npx @modelcontextprotocol/inspector dist/index.js
```

Example test command in Inspector:

```json
{
  "method": "tools/call",
  "params": {
    "name": "check_restaurant_availability",
    "arguments": {
      "date": "2025-10-20",
      "time": "19:00",
      "party_size": 4
    }
  }
}
```

## 🏗️ Architecture

```
mcp-server/
├── src/
│   ├── index.ts              # Main MCP server + all tools
│   └── types/                # TypeScript type definitions
├── dist/                     # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## 🔒 Security

- All Airtable requests use Bearer token authentication
- Environment variables required (not hardcoded)
- Input validation with Zod schemas
- Error handling for all operations

## 📦 Publishing

To publish this MCP server for community use:

```bash
# Build
npm run build

# Publish to npm
npm publish --access public

# Or publish to GitHub Packages
npm publish --registry=https://npm.pkg.github.com
```

## 🤝 Integration Examples

### With ElevenLabs Voice Agent

```javascript
// ElevenLabs can call MCP tools directly
{
  "agent": {
    "name": "Restaurant Receptionist",
    "tools": ["check_restaurant_availability", "create_reservation"]
  }
}
```

### With Google ADK Agent

```typescript
import { Agent } from '@google-cloud/adk';

const reservationAgent = new Agent({
  name: 'Reservation Agent',
  mcpServers: ['restaurant-ai'],
  tools: ['check_restaurant_availability', 'create_reservation']
});
```

### With Custom Application

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({
  name: 'my-restaurant-app',
  version: '1.0.0'
});

// Connect to MCP server
await client.connect(transport);

// Call tool
const result = await client.callTool({
  name: 'check_restaurant_availability',
  arguments: {
    date: '2025-10-20',
    time: '19:00',
    party_size: 4
  }
});
```

## 📊 Monitoring

The server logs all operations to stderr:

```bash
# View logs
npm start 2> mcp-server.log
tail -f mcp-server.log
```

## 🐛 Troubleshooting

### "Missing required environment variables"

Make sure `.env` file exists with all required variables.

### "Airtable request error: Invalid API key"

Check that your `AIRTABLE_API_KEY` has read/write access to the base.

### "Table not found"

Verify table IDs in `.env` match your Airtable base.

### Tool not appearing in Claude Desktop

1. Check config file syntax
2. Verify absolute paths
3. Restart Claude Desktop
4. Check Claude Desktop logs: `~/Library/Logs/Claude/mcp*.log`

## 🌐 Related Projects

- [Model Context Protocol](https://github.com/modelcontextprotocol)
- [Google ADK](https://google.github.io/adk-docs/)
- [ElevenLabs MCP Integration](https://elevenlabs.io/blog/introducing-elevenlabs-mcp)

## 📄 License

MIT

## 🙏 Acknowledgments

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- [Airtable API](https://airtable.com/developers/web/api)
- [TypeScript](https://www.typescriptlang.org/)

---

**Made with ❤️ by the Restaurant AI team**
