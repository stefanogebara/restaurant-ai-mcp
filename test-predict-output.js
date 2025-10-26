const { predictNoShow } = require('./api/ml/predict');
const { getCustomerStats } = require('./api/_lib/customer-history');

async function testPredict() {
  const reservation = {
    reservation_id: 'TEST-123',
    date: '2025-10-28',
    time: '19:00',
    party_size: 2,
    customer_name: 'Test',
    customer_phone: '+15551234567',
    customer_email: 'test@example.com',
    special_requests: '',
    booking_created_at: new Date().toISOString(),
    is_special_occasion: false,
    confirmation_sent_at: new Date().toISOString(),
    confirmation_clicked: false
  };

  const customerHistory = {
    totalReservations: 0,
    completedVisits: 0,
    noShows: 0,
    cancellations: 0,
    noShowRate: 0
  };

  console.log('Testing predictNoShow function...\n');

  const prediction = predictNoShow(reservation, customerHistory);

  console.log('Prediction result:', JSON.stringify(prediction, null, 2));

  console.log('\n=== Property Check ===');
  console.log(`prediction.noShowProbability: ${prediction.noShowProbability}`);
  console.log(`prediction.noShowRisk: ${prediction.noShowRisk}`);
  console.log(`prediction.confidence: ${prediction.confidence}`);
  console.log(`prediction.metadata?.modelVersion: ${prediction.metadata?.modelVersion}`);

  console.log('\n=== What batch-predict will write ===');
  const mlFields = {
    'ML Risk Score': Math.round(prediction.noShowProbability * 100),
    'ML Risk Level': prediction.noShowRisk,
    'ML Confidence': Math.round(prediction.confidence * 100),
    'ML Model Version': prediction.metadata?.modelVersion || '1.0.0'
  };
  console.log(JSON.stringify(mlFields, null, 2));
}

testPredict();
