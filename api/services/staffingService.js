function calculateStaffing(covers, roles) {
  return roles.map(role => ({
    name: role.name,
    recommended: Math.max(1, Math.ceil(covers / role.covers_per_staff)),
  }));
}

function buildForecast(reservationsByDate, roles) {
  return reservationsByDate.map(({ date, covers }) => ({
    date,
    day: new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    expected_covers: covers,
    roles: calculateStaffing(covers, roles),
  }));
}

module.exports = { calculateStaffing, buildForecast };
