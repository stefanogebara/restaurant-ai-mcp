/**
 * Voice Selection Step - Onboarding Step 2.5
 * Allows users to preview and select AI voice for their restaurant's conversational agent
 */

import { useState, useEffect } from 'react';
import { Volume2, Play, Pause, Loader, CheckCircle2 } from 'lucide-react';
import type { OnboardingData } from '../../types/onboarding.types';

interface ElevenLabsVoice {
  id: string;
  name: string;
  description: string;
  language: string;
  gender: string;
  preview_phrase: string;
  preview_url?: string; category?: string;
}

interface Step2_5Props {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

export default function Step2_5VoiceSelection({ data, onUpdate, onNext, onPrev }: Step2_5Props) {
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(data.selected_voice_id || '');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const [audioElements, setAudioElements] = useState<Record<string, HTMLAudioElement>>({});

  // Default voice fallback when API fails
  const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel - ElevenLabs default
  const DEFAULT_VOICE_LANGUAGE = 'en';

  // Fetch voices on mount
  useEffect(() => {
    const fetchVoices = async () => {
      setIsLoading(true);
      try {
        const country = data.country || 'United States';
        const response = await fetch(`/api/elevenlabs-voices?country=${encodeURIComponent(country)}`);

        if (!response.ok) {
          throw new Error('Failed to fetch voices');
        }

        const result = await response.json();

        if (result.success && result.data.voices && result.data.voices.length > 0) {
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
        } else {
          // No voices available - use default
          setSelectedVoiceId(DEFAULT_VOICE_ID);
          onUpdate({
            selected_voice_id: DEFAULT_VOICE_ID,
            selected_voice_language: DEFAULT_VOICE_LANGUAGE
          });
        }
      } catch (error) {
        console.error('Error fetching voices:', error);
        // On error, use default voice so user can continue
        setSelectedVoiceId(DEFAULT_VOICE_ID);
        onUpdate({
          selected_voice_id: DEFAULT_VOICE_ID,
          selected_voice_language: DEFAULT_VOICE_LANGUAGE
        });
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
      const response = await fetch('/api/elevenlabs-preview', {
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
        <div className="inline-flex items-center justify-center w-16 h-16 bg-violet-500/10 rounded-full mb-6">
          <Volume2 className="w-8 h-8 text-violet-400" />
        </div>
        <h2 className="text-4xl font-bold text-gray-100 mb-4">
          Choose Your AI Voice
        </h2>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto">
          Select the voice that will represent your restaurant in phone conversations with customers.
          Click the play button to hear a preview of each voice.
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative w-16 h-16 mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-gray-800"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin"></div>
          </div>
          <p className="text-gray-400 text-lg">Loading voices...</p>
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
                  relative bg-gray-800/50 backdrop-blur-sm border-2 rounded-lg p-6 cursor-pointer
                  transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/10
                  ${isSelected
                    ? 'border-violet-500 shadow-md shadow-violet-500/20 bg-violet-500/10'
                    : 'border-gray-700 hover:border-violet-500/50'
                  }
                `}
              >
                {/* Selected Indicator */}
                {isSelected && (
                  <div className="absolute top-4 right-4">
                    <CheckCircle2 className="w-6 h-6 text-violet-400" />
                  </div>
                )}

                {/* Voice Info */}
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-100 mb-1">
                    {voice.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                    <span className="capitalize">{voice.gender}</span>
                    <span>•</span>
                    <span>{voice.language.toUpperCase()}</span>
                  </div>
                  {voice.description && (
                    <p className="text-sm text-gray-400 line-clamp-2">
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
                      ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-100'
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
          <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-8 max-w-lg mx-auto">
            <Volume2 className="w-12 h-12 text-violet-400 mx-auto mb-4" />
            <p className="text-lg text-gray-300 mb-2">
              Using default voice for your AI assistant
            </p>
            <p className="text-sm text-gray-400">
              You can customize the voice later in Settings after setup is complete.
            </p>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-8 border-t border-gray-800">
        <button
          type="button"
          onClick={onPrev}
          className="px-8 py-3 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 text-gray-100 font-semibold rounded-lg transition-all flex items-center gap-2"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedVoiceId}
          className="px-8 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold rounded-lg shadow-lg shadow-purple-500/30 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
