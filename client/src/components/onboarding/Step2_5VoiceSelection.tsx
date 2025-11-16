/**
 * Voice Selection Step - Onboarding Step 2.5
 * Allows users to preview and select AI voice for their restaurant's conversational agent
 */

import { useState, useEffect } from 'react';
import { Volume2, Play, Pause, Loader, CheckCircle2 } from 'lucide-react';
import type { OnboardingData } from '../../types/onboarding.types';

interface CartesiaVoice {
  id: string;
  name: string;
  description: string;
  language: string;
  gender: string;
  preview_phrase: string;
  is_starred: boolean;
}

interface Step2_5Props {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

export default function Step2_5VoiceSelection({ data, onUpdate, onNext, onPrev }: Step2_5Props) {
  const [voices, setVoices] = useState<CartesiaVoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(data.selected_voice_id || '');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const [audioElements, setAudioElements] = useState<Record<string, HTMLAudioElement>>({});

  // Fetch voices on mount
  useEffect(() => {
    const fetchVoices = async () => {
      setIsLoading(true);
      try {
        const country = data.country || 'United States';
        const response = await fetch(`/api/cartesia-voices?country=${encodeURIComponent(country)}`);

        if (!response.ok) {
          throw new Error('Failed to fetch voices');
        }

        const result = await response.json();

        if (result.success && result.data.voices) {
          setVoices(result.data.voices);
          // Auto-select first voice if none selected
          if (!selectedVoiceId && result.data.voices.length > 0) {
            const firstVoice = result.data.voices[0];
            setSelectedVoiceId(firstVoice.id);
            onUpdate({
              selected_voice_id: firstVoice.id,
              selected_voice_language: firstVoice.language || 'en'
            });
          }
        }
      } catch (error) {
        console.error('Error fetching voices:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVoices();
  }, [data.country]);

  // Handle voice preview
  const handlePlayVoice = async (voiceId: string, previewText: string) => {
    // If already playing this voice, pause it
    if (playingVoiceId === voiceId) {
      audioElements[voiceId]?.pause();
      setPlayingVoiceId(null);
      return;
    }

    // Pause any currently playing audio
    if (playingVoiceId && audioElements[playingVoiceId]) {
      audioElements[playingVoiceId].pause();
    }

    // If audio already exists, play it
    if (audioElements[voiceId]) {
      audioElements[voiceId].play();
      setPlayingVoiceId(voiceId);
      return;
    }

    // Generate new audio
    setLoadingAudio(voiceId);
    try {
      const response = await fetch('/api/cartesia-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_id: voiceId,
          text: previewText
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }

      const result = await response.json();

      if (result.success && result.data.audio) {
        // Create audio element
        const audio = new Audio(result.data.audio);
        audio.onended = () => setPlayingVoiceId(null);
        audio.onerror = () => {
          setPlayingVoiceId(null);
          console.error('Audio playback error');
        };

        // Store audio element
        setAudioElements(prev => ({ ...prev, [voiceId]: audio }));

        // Play audio
        await audio.play();
        setPlayingVoiceId(voiceId);
      }
    } catch (error) {
      console.error('Error playing voice:', error);
    } finally {
      setLoadingAudio(null);
    }
  };

  // Handle voice selection
  const handleSelectVoice = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    // Find the selected voice to get its language
    const selectedVoice = voices.find(v => v.id === voiceId);
    onUpdate({
      selected_voice_id: voiceId,
      selected_voice_language: selectedVoice?.language || 'en'
    });
  };

  // Handle continue
  const handleContinue = () => {
    if (selectedVoiceId) {
      onUpdate({ selected_voice_id: selectedVoiceId });
      onNext();
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
          <Volume2 className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-4xl font-bold text-foreground mb-4">
          Choose Your AI Voice
        </h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Select the voice that will represent your restaurant in phone conversations with customers.
          Click the play button to hear a preview of each voice.
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative w-16 h-16 mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-muted"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">Loading voices...</p>
        </div>
      )}

      {/* Voice Grid */}
      {!isLoading && voices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {voices.map((voice) => {
            const isSelected = selectedVoiceId === voice.id;
            const isPlaying = playingVoiceId === voice.id;
            const isLoadingAudio = loadingAudio === voice.id;

            return (
              <div
                key={voice.id}
                onClick={() => handleSelectVoice(voice.id)}
                className={`
                  relative bg-card border-2 rounded-lg p-6 cursor-pointer
                  transition-all duration-200 hover:shadow-lg
                  ${isSelected
                    ? 'border-primary shadow-md bg-primary/5'
                    : 'border-border hover:border-primary/50'
                  }
                `}
              >
                {/* Selected Indicator */}
                {isSelected && (
                  <div className="absolute top-4 right-4">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                  </div>
                )}

                {/* Voice Info */}
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-foreground mb-1">
                    {voice.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <span className="capitalize">{voice.gender}</span>
                    <span>"</span>
                    <span>{voice.language.toUpperCase()}</span>
                  </div>
                  {voice.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {voice.description}
                    </p>
                  )}
                </div>

                {/* Play Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayVoice(voice.id, voice.preview_phrase);
                  }}
                  disabled={isLoadingAudio}
                  className={`
                    w-full py-3 px-4 rounded-lg font-semibold transition-all
                    flex items-center justify-center gap-2
                    ${isPlaying
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-muted hover:bg-muted-foreground/10 text-foreground'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {isLoadingAudio ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : isPlaying ? (
                    <>
                      <Pause className="w-5 h-5" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      <span>Play Preview</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* No Voices Message */}
      {!isLoading && voices.length === 0 && (
        <div className="text-center py-20">
          <p className="text-lg text-muted-foreground">
            No voices available for your selected country. Using default voice.
          </p>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-8 border-t border-border">
        <button
          type="button"
          onClick={onPrev}
          className="px-8 py-3 border border-border rounded-lg font-semibold
                   text-foreground hover:bg-muted transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedVoiceId}
          className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-semibold
                   hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
