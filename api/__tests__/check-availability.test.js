// Set env vars before any require so db-clients.js module-level code does not crash
process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.SUPABASE_ANON_KEY = "fake-anon-key";

jest.mock("../_lib/supabase", () => ({
  getReservations: jest.fn(),
  getRestaurantInfo: jest.fn(),
}));

jest.mock("../_lib/availability-calculator", () => ({
  checkTimeSlotAvailability: jest.fn(),
  getSuggestedTimes: jest.fn(),
}));

jest.mock("../_lib/rate-limit", () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock("../_lib/secure-logger", () => ({
  createSecureLogger: function() {
    return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  },
}));

const handler = require("../check-availability");

const { getReservations, getRestaurantInfo } = require("../_lib/supabase");
const { checkTimeSlotAvailability, getSuggestedTimes } = require("../_lib/availability-calculator");
const { checkAndApplyRateLimit } = require("../_lib/rate-limit");
function mkReqRes(overrides) {
  overrides = overrides || {};
  const res = {
    _status: null,
    _body: null,
    setHeader: jest.fn(),
    status: function(code) { this._status = code; return this; },
    json: function(body) { this._body = body; return this; },
  };
  const req = Object.assign({ method: "GET", query: {}, body: {}, headers: {} }, overrides);
  return { req: req, res: res };
}

const defaultRestaurantResult = {
  success: true,
  data: {
    records: [{
      fields: {
        Capacity: 60,
        "Opening Time": "17:00",
        "Closing Time": "22:00",
        Timezone: "America/New_York",
      },
    }],
  },
};

const defaultReservationsResult = { success: true, data: { records: [] } };

const defaultAvailabilityCheck = {
  available: true,
  estimatedDuration: 90,
  occupiedSeats: 10,
  availableSeats: 50,
  reason: null,
};

const defaultParams = {
  restaurant_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  date: "2026-03-01",
  time: "19:00",
  party_size: "4",
};
describe("check-availability handler", function() {
  beforeEach(function() {
    jest.clearAllMocks();
    checkAndApplyRateLimit.mockResolvedValue(false);
    getRestaurantInfo.mockResolvedValue(defaultRestaurantResult);
    getReservations.mockResolvedValue(defaultReservationsResult);
    checkTimeSlotAvailability.mockReturnValue(defaultAvailabilityCheck);
    getSuggestedTimes.mockReturnValue([]);
  });

  // -------------------------------------------------------
  // CORS and OPTIONS
  // -------------------------------------------------------
  describe("CORS and OPTIONS", function() {
    it("responds 200 to OPTIONS preflight request", async function() {
      var r = mkReqRes({ method: "OPTIONS" });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(200);
      expect(r.res._body).toEqual({ success: true });
    });

    it("sets CORS headers on every request", async function() {
      var r = mkReqRes({ method: "OPTIONS" });
      await handler(r.req, r.res);
      expect(r.res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", expect.any(String));
      expect(r.res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Methods", expect.stringContaining("GET"));
      expect(r.res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Headers", expect.stringContaining("Authorization"));
    });
  });

  // -------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------
  describe("rate limiting", function() {
    it("returns early when rate limited without setting a response body", async function() {
      checkAndApplyRateLimit.mockResolvedValue(true);
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(r.res._status).toBeNull();
      expect(r.res._body).toBeNull();
      expect(getRestaurantInfo).not.toHaveBeenCalled();
    });
  });
  // -------------------------------------------------------
  // Input validation
  // -------------------------------------------------------
  describe("input validation", function() {
    it("returns 400 when restaurant_id is missing", async function() {
      var r = mkReqRes({ query: { date: "2026-03-01", time: "19:00", party_size: "4" } });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(400);
      expect(r.res._body).toMatchObject({
        success: false, error: true,
        message: expect.stringContaining("restaurant_id"),
      });
    });

    it("returns 400 when date is missing but restaurant_id is provided", async function() {
      var r = mkReqRes({ query: { restaurant_id: "rest_123", time: "19:00", party_size: "4" } });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(400);
      expect(r.res._body).toMatchObject({
        success: false, error: true,
        message: expect.stringContaining("date"),
      });
    });

    it("returns 400 when time is missing", async function() {
      var r = mkReqRes({ query: { restaurant_id: "rest_123", date: "2026-03-01", party_size: "4" } });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(400);
      expect(r.res._body).toMatchObject({
        success: false, error: true,
        message: expect.stringContaining("time"),
      });
    });

    it("returns 400 when party_size is missing", async function() {
      var r = mkReqRes({ query: { restaurant_id: "rest_123", date: "2026-03-01", time: "19:00" } });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(400);
      expect(r.res._body).toMatchObject({
        success: false, error: true,
        message: expect.stringContaining("party_size"),
      });
    });
  });
  // -------------------------------------------------------
  // Restaurant info lookup
  // -------------------------------------------------------
  describe("restaurant info lookup", function() {
    it("returns 500 when getRestaurantInfo fails", async function() {
      var errorResult = { success: false, error: true, message: "DB connection error" };
      getRestaurantInfo.mockResolvedValue(errorResult);
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(500);
      expect(r.res._body).toMatchObject({ success: false, error: true, message: 'Failed to load restaurant configuration' });
    });

    it("returns 500 when restaurant records array is empty", async function() {
      getRestaurantInfo.mockResolvedValue({ success: true, data: { records: [] } });
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(500);
      expect(r.res._body).toMatchObject({
        success: false, error: true,
        message: expect.stringContaining("not found"),
      });
    });
  });

  // -------------------------------------------------------
  // Reservations lookup
  // -------------------------------------------------------
  describe("reservations lookup", function() {
    it("returns 500 when getReservations fails", async function() {
      var errorResult = { success: false, error: true, message: "Reservations query failed" };
      getReservations.mockResolvedValue(errorResult);
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(500);
      expect(r.res._body).toMatchObject({ success: false, error: true, message: 'Failed to load reservations' });
    });

    it("passes a filter that includes the requested date and active statuses", async function() {
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(getReservations).toHaveBeenCalledTimes(1);
      var calledRestaurantId = getReservations.mock.calls[0][0];
      var calledFilter = getReservations.mock.calls[0][1];
      expect(calledRestaurantId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(calledFilter).toContain("2026-03-01");
      expect(calledFilter).toContain("Confirmed");
      expect(calledFilter).toContain("Seated");
    });
  });
  // -------------------------------------------------------
  // Slot available
  // -------------------------------------------------------
  describe("availability: slot is available", function() {
    it("returns 200 with available true and seat details", async function() {
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(200);
      expect(r.res._body).toMatchObject({
        success: true,
        available: true,
        timezone: "America/New_York",
        details: { estimated_duration: "90 minutes", occupied_seats: 10, available_seats: 50 },
      });
      expect(r.res._body.message).toContain("4");
      expect(r.res._body.message).toContain("2026-03-01");
      expect(r.res._body.message).toContain("19:00");
    });

    it("uses restaurant defaults when fields are absent", async function() {
      getRestaurantInfo.mockResolvedValue({ success: true, data: { records: [{ fields: {} }] } });
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(200);
      expect(r.res._body.available).toBe(true);
      expect(r.res._body.timezone).toBe("UTC");
    });
  });

  // -------------------------------------------------------
  // Slot not available
  // -------------------------------------------------------
  describe("availability: slot is not available", function() {
    beforeEach(function() {
      checkTimeSlotAvailability.mockReturnValue({
        available: false,
        estimatedDuration: 90,
        occupiedSeats: 58,
        availableSeats: 2,
        reason: "Not enough seats",
      });
    });

    it("returns 200 with available false and a descriptive message", async function() {
      getSuggestedTimes.mockReturnValue([{ time: "18:00", availableSeats: 20 }]);
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(200);
      expect(r.res._body).toMatchObject({
        success: true,
        available: false,
        details: { requested_time: "19:00", party_size: 4, available_seats_at_time: 2, occupied_seats: 58 },
      });
      expect(r.res._body.message).toContain("19:00");
    });

    it("maps alternative_times correctly when suggestions exist", async function() {
      getSuggestedTimes.mockReturnValue([
        { time: "18:00", availableSeats: 20 },
        { time: "20:30", availableSeats: 15 },
      ]);
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(r.res._body.alternative_times).toHaveLength(2);
      expect(r.res._body.alternative_times[0]).toEqual({
        time: "18:00",
        available_seats: 20,
        message: "18:00 has 20 seats available",
      });
      expect(r.res._body.alternative_times[1]).toEqual({
        time: "20:30",
        available_seats: 15,
        message: "20:30 has 15 seats available",
      });
    });

    it("returns empty alternative_times array when no suggestions exist", async function() {
      getSuggestedTimes.mockReturnValue([]);
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(200);
      expect(r.res._body.available).toBe(false);
      expect(r.res._body.alternative_times).toEqual([]);
    });

    it("calls getSuggestedTimes with correct restaurant open/close times and capacity", async function() {
      getSuggestedTimes.mockReturnValue([]);
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(getSuggestedTimes).toHaveBeenCalledWith("19:00", 4, expect.any(Array), 60, "17:00", "22:00");
    });
  });
  // -------------------------------------------------------
  // POST method
  // -------------------------------------------------------
  describe("POST method", function() {
    it("reads params from req.body instead of req.query", async function() {
      var r = mkReqRes({ method: "POST", body: Object.assign({}, defaultParams), query: {} });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(200);
      expect(r.res._body.available).toBe(true);
      expect(getRestaurantInfo).toHaveBeenCalledWith("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    });

    it("returns 400 when POST body is missing restaurant_id", async function() {
      var r = mkReqRes({
        method: "POST",
        body: { date: "2026-03-01", time: "19:00", party_size: "4" },
        query: {},
      });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(400);
      expect(r.res._body).toMatchObject({ success: false, error: true });
    });
  });

  // -------------------------------------------------------
  // Unhandled exceptions
  // -------------------------------------------------------
  describe("unhandled exceptions", function() {
    it("returns 500 with a safe error message when an unexpected error is thrown", async function() {
      getRestaurantInfo.mockRejectedValue(new Error("Unexpected crash"));
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(r.res._status).toBe(500);
      expect(r.res._body).toMatchObject({
        success: false,
        error: true,
        message: expect.stringContaining("Unable to check availability"),
      });
    });

    it("does not leak internal error details in the 500 response", async function() {
      getRestaurantInfo.mockRejectedValue(new Error("DB password is supersecret123"));
      var r = mkReqRes({ query: Object.assign({}, defaultParams) });
      await handler(r.req, r.res);
      expect(JSON.stringify(r.res._body)).not.toContain("supersecret123");
    });
  });
});
