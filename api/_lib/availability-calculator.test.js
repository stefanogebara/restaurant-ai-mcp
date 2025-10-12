/**
 * Test file for availability calculator
 * Run with: node api/_lib/availability-calculator.test.js
 */

const {
  getDiningDuration,
  addMinutesToTime,
  timeRangesOverlap,
  getOccupiedSeatsAtTime,
  checkTimeSlotAvailability,
  getSuggestedTimes
} = require('./availability-calculator');

console.log('🧪 Testing Restaurant Availability Calculator\n');

// Test 1: Dining Duration
console.log('1️⃣ Testing dining duration calculations:');
console.log(`   Party of 2: ${getDiningDuration(2)} minutes (expected: 90)`);
console.log(`   Party of 4: ${getDiningDuration(4)} minutes (expected: 120)`);
console.log(`   Party of 6: ${getDiningDuration(6)} minutes (expected: 120)`);
console.log(`   Party of 8: ${getDiningDuration(8)} minutes (expected: 150)\n`);

// Test 2: Time Addition
console.log('2️⃣ Testing time addition:');
console.log(`   19:00 + 90 min = ${addMinutesToTime('19:00', 90)} (expected: 20:30)`);
console.log(`   18:30 + 120 min = ${addMinutesToTime('18:30', 120)} (expected: 20:30)`);
console.log(`   23:00 + 90 min = ${addMinutesToTime('23:00', 90)} (expected: 00:30)\n`);

// Test 3: Time Range Overlap
console.log('3️⃣ Testing time range overlap:');
console.log(`   19:00-21:00 overlaps 20:00-22:00: ${timeRangesOverlap('19:00', '21:00', '20:00', '22:00')} (expected: true)`);
console.log(`   19:00-20:00 overlaps 20:00-21:00: ${timeRangesOverlap('19:00', '20:00', '20:00', '21:00')} (expected: false)`);
console.log(`   18:00-19:00 overlaps 20:00-21:00: ${timeRangesOverlap('18:00', '19:00', '20:00', '21:00')} (expected: false)\n`);

// Test 4: Real-world scenario
console.log('4️⃣ Testing real-world scenario:');
console.log('   Restaurant capacity: 50 seats');
console.log('   Existing reservations:');

const existingReservations = [
  { fields: { Time: '18:00', 'Party Size': 4 } },  // 18:00-20:00 (4 people)
  { fields: { Time: '18:30', 'Party Size': 6 } },  // 18:30-20:30 (6 people)
  { fields: { Time: '19:00', 'Party Size': 4 } },  // 19:00-21:00 (4 people)
  { fields: { Time: '19:30', 'Party Size': 2 } },  // 19:30-21:00 (2 people)
  { fields: { Time: '20:00', 'Party Size': 8 } },  // 20:00-22:00 (8 people)
];

existingReservations.forEach((res, i) => {
  const duration = getDiningDuration(res.fields['Party Size']);
  const endTime = addMinutesToTime(res.fields.Time, duration);
  console.log(`     ${i + 1}. ${res.fields.Time}-${endTime}: ${res.fields['Party Size']} people`);
});

console.log('\n   Checking occupancy at different times:');
const checkTimes = ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];
checkTimes.forEach(time => {
  const occupied = getOccupiedSeatsAtTime(existingReservations, time);
  console.log(`     ${time}: ${occupied}/50 seats occupied (${50 - occupied} available)`);
});

// Test 5: Check availability for new reservation
console.log('\n5️⃣ Testing availability check:');

const testCases = [
  { time: '19:00', partySize: 10, expected: 'available' },
  { time: '19:00', partySize: 30, expected: 'not available' },
  { time: '20:00', partySize: 15, expected: 'not available' },
];

testCases.forEach(test => {
  const result = checkTimeSlotAvailability(
    test.time,
    test.partySize,
    existingReservations,
    50
  );

  console.log(`\n   Testing ${test.time} for ${test.partySize} people:`);
  console.log(`     Available: ${result.available}`);
  console.log(`     Reason: ${result.reason}`);
  if (result.available) {
    console.log(`     Estimated duration: ${result.estimatedDuration} minutes`);
    console.log(`     Max occupied seats during stay: ${result.occupiedSeats}`);
    console.log(`     Available seats: ${result.availableSeats}`);
  } else {
    console.log(`     Occupied seats: ${result.occupiedSeats}`);
    console.log(`     Available seats: ${result.availableSeats}`);
    console.log(`     Would need: ${result.wouldNeedSeats} seats`);
  }
});

// Test 6: Get suggested times
console.log('\n6️⃣ Testing suggested alternative times:');
const suggestions = getSuggestedTimes(
  '19:00',
  30,
  existingReservations,
  50,
  '17:00',
  '22:00'
);

if (suggestions.length > 0) {
  console.log(`   Alternative times for party of 30 at 19:00:`);
  suggestions.forEach((sug, i) => {
    console.log(`     ${i + 1}. ${sug.time} - ${sug.availableSeats} seats available`);
  });
} else {
  console.log('   No alternative times available');
}

console.log('\n✅ All tests completed!\n');

// Test 7: Edge case - Restaurant at capacity
console.log('7️⃣ Testing edge case - Full restaurant:');
const fullHouseReservations = [
  { fields: { Time: '19:00', 'Party Size': 25 } },
  { fields: { Time: '19:15', 'Party Size': 25 } },
];

const fullCheck = checkTimeSlotAvailability(
  '19:30',
  5,
  fullHouseReservations,
  50
);

console.log(`   Trying to add 5 people at 19:30 when 50/50 seats occupied:`);
console.log(`     Available: ${fullCheck.available}`);
console.log(`     Reason: ${fullCheck.reason}`);
console.log(`     Available seats: ${fullCheck.availableSeats}\n`);
