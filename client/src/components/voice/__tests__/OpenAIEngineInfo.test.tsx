import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import OpenAIEngineInfo from '../OpenAIEngineInfo';

describe('OpenAIEngineInfo', () => {
  it('does not claim the agent is active when status is unavailable', () => {
    render(<OpenAIEngineInfo engineStatus={undefined} currentOpenAIVoice="alloy" />);
    expect(screen.getByText('Agent status is unavailable. Check the connection before forwarding calls.')).toBeInTheDocument();
    expect(screen.queryByText('Agent marked active. Confirm it answers with a test call.')).not.toBeInTheDocument();
  });

  it('describes an active record as unverified until a call is tested', () => {
    render(<OpenAIEngineInfo engineStatus="active" currentOpenAIVoice="alloy" />);
    expect(screen.getByText('Agent marked active. Confirm it answers with a test call.')).toBeInTheDocument();
  });
});
