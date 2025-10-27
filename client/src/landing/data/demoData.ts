/**
 * Demo Restaurant Data
 * La Bella Vista - Fine Italian Dining Experience
 */

export const DEMO_RESTAURANT = {
  name: "La Bella Vista",
  tagline: "Fine Italian Dining Experience",
  phone: "+1 (555) 123-DEMO",
  email: "demo@restaurant-ai-mcp.com",
  address: "123 Vista Avenue, Downtown District",
  tables: 12,
  capacity: 48,
  active_parties: 3,
  reservations: 8,
  waitlist: 2,
  occupancy: 67,
};

export const DEMO_TABLES = [
  { id: 1, number: 1, capacity: 2, status: "Available", location: "Indoor" },
  { id: 2, number: 2, capacity: 2, status: "Occupied", location: "Indoor" },
  { id: 3, number: 3, capacity: 4, status: "Reserved", location: "Indoor" },
  { id: 4, number: 4, capacity: 4, status: "Available", location: "Indoor" },
  { id: 5, number: 5, capacity: 6, status: "Occupied", location: "Indoor" },
  { id: 6, number: 6, capacity: 2, status: "Available", location: "Patio" },
  { id: 7, number: 7, capacity: 2, status: "Reserved", location: "Patio" },
  { id: 8, number: 8, capacity: 4, status: "Available", location: "Patio" },
  { id: 9, number: 9, capacity: 6, status: "Occupied", location: "Patio" },
  { id: 10, number: 10, capacity: 2, status: "Available", location: "Bar" },
  { id: 11, number: 11, capacity: 2, status: "Available", location: "Bar" },
  { id: 12, number: 12, capacity: 4, status: "Reserved", location: "Bar" },
];

export const DEMO_ACTIVE_PARTIES = [
  {
    service_id: "SRV-001",
    customer_name: "Marco Rossi",
    party_size: 2,
    tables: [2],
    time_elapsed_minutes: 45,
    time_remaining_minutes: 30,
  },
  {
    service_id: "SRV-002",
    customer_name: "Sofia Martinez",
    party_size: 6,
    tables: [5],
    time_elapsed_minutes: 20,
    time_remaining_minutes: 70,
  },
  {
    service_id: "SRV-003",
    customer_name: "Chen Wei",
    party_size: 4,
    tables: [9],
    time_elapsed_minutes: 55,
    time_remaining_minutes: 25,
  },
];

export const DEMO_RESERVATIONS = [
  {
    reservation_id: "RES-001",
    customer_name: "Isabella Romano",
    customer_phone: "+1 (555) 234-5678",
    party_size: 4,
    date: "2025-10-27",
    time: "19:00",
    reservation_time: "2025-10-27T19:00:00",
    special_requests: "Window table preferred",
    status: "confirmed",
  },
  {
    reservation_id: "RES-002",
    customer_name: "Alessandro Bianchi",
    customer_phone: "+1 (555) 345-6789",
    party_size: 2,
    date: "2025-10-27",
    time: "20:00",
    reservation_time: "2025-10-27T20:00:00",
    status: "confirmed",
  },
  {
    reservation_id: "RES-003",
    customer_name: "Lucia Ferrari",
    customer_phone: "+1 (555) 456-7890",
    party_size: 6,
    date: "2025-10-28",
    time: "18:30",
    reservation_time: "2025-10-28T18:30:00",
    special_requests: "Birthday celebration - cake request",
    status: "confirmed",
  },
];

export const DEMO_WAITLIST = [
  {
    waitlist_id: "WAIT-001",
    customer_name: "Giovanni Lombardi",
    customer_phone: "+1 (555) 567-8901",
    party_size: 2,
    estimated_wait: 15,
    added_at: "2025-10-27T18:15:00",
    status: "Waiting",
  },
  {
    waitlist_id: "WAIT-002",
    customer_name: "Francesca Conti",
    customer_phone: "+1 (555) 678-9012",
    party_size: 4,
    estimated_wait: 25,
    added_at: "2025-10-27T18:20:00",
    status: "Waiting",
  },
];

export const FEATURES = [
  {
    icon: "Bot",
    title: "AI-Powered Reservations",
    description: "Natural conversation interface for customers to book tables via voice or text",
    gradient: "from-indigo-500 to-purple-500",
    demo: "Call our demo restaurant and experience the AI in action",
  },
  {
    icon: "LayoutDashboard",
    title: "Real-Time Host Dashboard",
    description: "Comprehensive dashboard for managing walk-ins, reservations, and table assignments",
    gradient: "from-purple-500 to-pink-500",
    demo: "View live table status, occupancy, and active parties",
  },
  {
    icon: "Users",
    title: "Smart Table Matching",
    description: "Intelligent algorithm recommends optimal table combinations for any party size",
    gradient: "from-emerald-500 to-teal-500",
    demo: "See how the system finds the perfect table match instantly",
  },
  {
    icon: "Clock",
    title: "Live Wait Times",
    description: "Automatic wait time calculations based on table turnover and party sizes",
    gradient: "from-amber-500 to-orange-500",
    demo: "Real-time updates every 30 seconds for accurate estimates",
  },
  {
    icon: "Bell",
    title: "Automated Notifications",
    description: "SMS and email alerts for reservation confirmations and table ready notifications",
    gradient: "from-blue-500 to-indigo-500",
    demo: "Customers receive instant confirmation and updates",
  },
  {
    icon: "BarChart3",
    title: "Analytics & Insights",
    description: "Track occupancy rates, peak hours, and customer patterns to optimize operations",
    gradient: "from-violet-500 to-purple-500",
    demo: "Visualize your restaurant's performance metrics",
  },
];

export const PRICING_TIERS = [
  {
    name: "Starter",
    price: "$99",
    period: "/month",
    description: "Perfect for small restaurants",
    features: [
      "Up to 15 tables",
      "AI reservation assistant",
      "Host dashboard",
      "Email support",
      "Basic analytics",
    ],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Professional",
    price: "$249",
    period: "/month",
    description: "Ideal for growing restaurants",
    features: [
      "Up to 40 tables",
      "AI reservation assistant",
      "Host dashboard",
      "SMS notifications",
      "Advanced analytics",
      "Priority support",
      "Custom branding",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For restaurant groups",
    features: [
      "Unlimited tables",
      "Multi-location support",
      "Dedicated AI training",
      "Custom integrations",
      "White-label solution",
      "24/7 phone support",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export const FAQS = [
  {
    question: "How does the AI reservation assistant work?",
    answer: "Our AI uses natural language processing to understand customer requests via phone calls or text messages. It checks real-time table availability, handles booking details, and confirms reservations - all without human intervention.",
  },
  {
    question: "Can I customize the AI's responses?",
    answer: "Yes! Each restaurant can customize the AI's personality, greetings, menu knowledge, and special policies. We train the AI on your specific restaurant details during onboarding.",
  },
  {
    question: "What happens if the AI can't handle a request?",
    answer: "If the AI encounters a complex situation it can't resolve, it seamlessly transfers the call to your staff with full context of the conversation. This ensures no customer is left frustrated.",
  },
  {
    question: "How long does setup take?",
    answer: "Most restaurants are up and running within 24 hours. We'll import your table layout, configure the AI with your menu and policies, and train your staff on the host dashboard.",
  },
  {
    question: "Do I need special hardware?",
    answer: "No special hardware required! Our system works entirely in the cloud. You just need internet access and a device (computer, tablet, or phone) to access the host dashboard.",
  },
  {
    question: "Can customers still call directly?",
    answer: "Absolutely. The AI handles reservation requests, but customers can still speak to staff for special occasions, large parties, or specific questions. The AI and humans work together seamlessly.",
  },
];

export const TIMELINE_STEPS = [
  {
    step: 1,
    title: "Contact Us",
    description: "Schedule a demo call to see the platform in action",
    duration: "Day 1",
  },
  {
    step: 2,
    title: "Onboarding",
    description: "We configure your restaurant details, tables, and AI personality",
    duration: "Day 2-3",
  },
  {
    step: 3,
    title: "Staff Training",
    description: "Quick 30-minute session to train your team on the host dashboard",
    duration: "Day 3",
  },
  {
    step: 4,
    title: "Go Live",
    description: "Start accepting AI-powered reservations and managing tables",
    duration: "Day 4+",
  },
];

export const STATS = [
  {
    value: "2.3s",
    label: "Avg Reservation Time",
    description: "Faster than traditional phone bookings",
  },
  {
    value: "94%",
    label: "Customer Satisfaction",
    description: "Based on post-reservation surveys",
  },
  {
    value: "40hrs",
    label: "Saved Per Month",
    description: "Staff time freed up for guest service",
  },
  {
    value: "99.9%",
    label: "Uptime Guarantee",
    description: "Reliable service you can count on",
  },
];

export const CONTACT_INFO = {
  email: "stefanogebara@gmail.com",
  formFields: [
    { name: "name", label: "Full Name", type: "text", required: true },
    { name: "email", label: "Email Address", type: "email", required: true },
    { name: "phone", label: "Phone Number", type: "tel", required: false },
    { name: "restaurant", label: "Restaurant Name", type: "text", required: true },
    { name: "tables", label: "Number of Tables", type: "number", required: false },
    { name: "message", label: "Tell us about your needs", type: "textarea", required: true },
  ],
};
