/**
 * Hook for fetching booking QR code from /api/booking-qr
 */

import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

function buildQRUrl(slug: string): string {
  return `${API_BASE}/booking-qr?slug=${encodeURIComponent(slug)}`;
}

export function useBookingQR(slug: string) {
  const qrUrl = buildQRUrl(slug);

  const { data: qrBlobUrl, isLoading, error } = useQuery({
    queryKey: ['bookingQR', slug],
    queryFn: async () => {
      const res = await fetch(qrUrl);
      if (!res.ok) throw new Error('Failed to fetch QR code');
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    enabled: !!slug,
    staleTime: 24 * 60 * 60 * 1000, // 24h — matches server cache
    gcTime: 24 * 60 * 60 * 1000,
  });

  const downloadQR = () => {
    if (!qrBlobUrl) return;
    const link = document.createElement('a');
    link.href = qrBlobUrl;
    link.download = `booking-qr-${slug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printQR = () => {
    if (!qrBlobUrl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const doc = printWindow.document;
    const style = doc.createElement('style');
    style.textContent = [
      'body { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; margin:0; font-family:Inter,system-ui,sans-serif; }',
      'img { max-width:300px; margin-bottom:16px; }',
      'p { font-size:14px; color:#666; margin:4px 0; }',
      'h2 { font-size:18px; color:#1C1917; margin-bottom:8px; }',
      '@media print { body { padding: 20mm; } }',
    ].join('\n');
    doc.head.appendChild(style);
    doc.title = 'QR Code - Booking';

    const heading = doc.createElement('h2');
    heading.textContent = 'Scan to Book';
    doc.body.appendChild(heading);

    const img = doc.createElement('img');
    img.src = qrBlobUrl;
    img.alt = 'QR Code';
    doc.body.appendChild(img);

    const urlText = doc.createElement('p');
    urlText.textContent = `seatable.one/book/${slug}`;
    doc.body.appendChild(urlText);

    printWindow.focus();
    // Small delay to ensure image loads before printing
    img.onload = () => printWindow.print();
  };

  return { qrUrl, qrBlobUrl, isLoading, error, downloadQR, printQR };
}
