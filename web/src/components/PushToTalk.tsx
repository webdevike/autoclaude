import { useEffect, useRef, useState, useCallback } from 'react';

interface PushToTalkProps {
  onAudioChunk: (data: ArrayBuffer) => void;
  onCommit: () => void;
  disabled?: boolean;
}

export function PushToTalk({ onAudioChunk, onCommit, disabled = false }: PushToTalkProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;

    workletNodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(track => track.stop());
    audioContextRef.current?.close();

    workletNodeRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;

    setIsRecording(false);
    onCommit();
  }, [isRecording, onCommit]);

  const startRecording = useCallback(async () => {
    if (isRecording || disabled) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      setHasPermission(true);
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      // Create an AudioWorklet for PCM16 conversion
      await audioContext.audioWorklet.addModule(
        URL.createObjectURL(
          new Blob(
            [
              `
              class PCM16Processor extends AudioWorkletProcessor {
                process(inputs) {
                  const input = inputs[0];
                  if (input && input[0]) {
                    const samples = input[0];
                    const pcm16 = new Int16Array(samples.length);
                    for (let i = 0; i < samples.length; i++) {
                      const s = Math.max(-1, Math.min(1, samples[i]));
                      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
                  }
                  return true;
                }
              }
              registerProcessor('pcm16-processor', PCM16Processor);
            `,
            ],
            { type: 'application/javascript' }
          )
        )
      );

      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'pcm16-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        onAudioChunk(event.data);
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (err) {
      setHasPermission(false);
      console.error('Microphone permission denied:', err);
    }
  }, [isRecording, disabled, onAudioChunk]);

  useEffect(() => {
    function isInputFocused(): boolean {
      const tag = document.activeElement?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA';
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isInputFocused() && !disabled) {
        e.preventDefault();
        startRecording();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isInputFocused()) {
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startRecording, stopRecording, disabled]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      workletNodeRef.current?.disconnect();
      streamRef.current?.getTracks().forEach(track => track.stop());
      audioContextRef.current?.close();
    };
  }, []);

  return (
    <div className={`push-to-talk ${isRecording ? 'recording' : ''} ${disabled ? 'disabled' : ''}`}>
      <div className="mic-icon">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </div>
      <span className="status-text">
        {disabled
          ? 'Processing...'
          : isRecording
            ? 'Listening...'
            : 'Hold Space to talk'}
      </span>
      {hasPermission === false && (
        <span className="error">Microphone access denied</span>
      )}
    </div>
  );
}
