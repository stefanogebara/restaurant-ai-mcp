require('dotenv').config({ path: '.env.local', quiet: true });
const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET.replace(/\\n$/, '').trim();
const token = jwt.sign(
  {
    sub: 'stress-test-user',
    email: 'test@testrestaurant.com',
    restaurant_id: '632069d2-e356-4525-b145-db8e00dd9b6b',
  },
  secret,
  { expiresIn: '2h' }
);
process.stdout.write(token);
