import { useState } from 'react';

interface Props { slug: string; }

export default function EmbedSnippetPanel({ slug }: Props) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="https://restaurant-ai-mcp.vercel.app/widget.js?slug=${slug}"></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">Booking Widget</h2>
      <p className="text-xs text-warm-stone">
        Paste this snippet anywhere on your website to add a "Book a Table" button.
      </p>
      <div className="relative">
        <pre className="bg-soft-gray rounded-xl px-4 py-3 text-xs text-deep-charcoal overflow-x-auto whitespace-pre-wrap break-all">
          {snippet}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy snippet"
          className="absolute top-2 right-2 px-3 py-1 bg-deep-charcoal text-white text-xs rounded-lg hover:bg-charcoal-dark transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
