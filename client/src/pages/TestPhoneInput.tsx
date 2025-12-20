/**
 * Test page for PhoneInput component
 * Access at /test-phone-input
 */

import { useState, useCallback } from 'react';
import PhoneInput from '../components/common/PhoneInput';

export default function TestPhoneInput() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isValid, setIsValid] = useState(false);

  const handlePhoneChange = useCallback((fullNumber: string, valid: boolean) => {
    setPhoneNumber(fullNumber);
    setIsValid(valid);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Phone Input Test</h1>

        <PhoneInput
          value={phoneNumber}
          onChange={handlePhoneChange}
          defaultCountry="ES"
          label="Test Phone Number"
          required
        />

        <div className="mt-6 p-4 bg-gray-800 rounded-lg">
          <p className="text-gray-300 text-sm">
            <strong>Value:</strong> {phoneNumber || '(empty)'}
          </p>
          <p className="text-gray-300 text-sm mt-2">
            <strong>Valid:</strong>{' '}
            <span className={isValid ? 'text-green-400' : 'text-red-400'}>
              {isValid ? 'Yes' : 'No'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
