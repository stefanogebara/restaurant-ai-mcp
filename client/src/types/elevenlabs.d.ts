// TypeScript declaration for ElevenLabs Conversational AI widget
// Documentation: https://elevenlabs.io/docs/conversational-ai/customization/widget

declare namespace JSX {
  interface IntrinsicElements {
    'elevenlabs-convai': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        'agent-id': string;
      },
      HTMLElement
    >;
  }
}
