import { useEffect, useRef } from 'react';

interface ElevenLabsWidgetProps {
  agentId: string;
}

export default function ElevenLabsWidget({ agentId }: ElevenLabsWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && agentId && agentId !== 'YOUR_AGENT_ID_HERE') {
      // Create the custom element programmatically
      const widget = document.createElement('elevenlabs-convai');
      widget.setAttribute('agent-id', agentId);

      // Clear existing content and append the widget
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(widget);
    }
  }, [agentId]);

  return <div ref={containerRef} className="elevenlabs-widget-container" />;
}
