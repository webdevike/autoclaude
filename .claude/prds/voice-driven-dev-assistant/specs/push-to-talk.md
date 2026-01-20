# Push-to-Talk Component

## Objective

Implement a React component that captures audio while the spacebar is held down and sends it to the server via WebSocket.

Expected outcome:
- `PushToTalk` component with visual indicator
- Spacebar activates recording, release stops
- Audio streamed to server in real-time
- Visual feedback for recording state

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: React app scaffold
- **Dependents**: E2E Integration

## Acceptance Criteria

- [ ] Spacebar keydown starts audio recording
- [ ] Spacebar keyup stops recording and commits
- [ ] Visual indicator shows recording state (pulsing mic icon)
- [ ] Audio sent via WebSocket as PCM16 chunks
- [ ] Works only when input not focused (don't capture typing)
- [ ] Handles permission denied gracefully

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `web/src/components/PushToTalk.tsx` |
| Key patterns | Use Web Audio API + MediaRecorder |
| Technical constraints | PCM16 @ 24kHz to match OpenAI format |

### Example

```tsx
import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

export function PushToTalk() {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const { sendAudio, commitAudio } = useWebSocket();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isInputFocused()) {
        e.preventDefault();
        startRecording();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 24000, channelCount: 1 }
      });
      setHasPermission(true);

      // Set up AudioWorklet for PCM16 conversion
      const audioContext = new AudioContext({ sampleRate: 24000 });
      const source = audioContext.createMediaStreamSource(stream);
      // ... process and send audio chunks

      setIsRecording(true);
    } catch (err) {
      setHasPermission(false);
      console.error('Microphone permission denied:', err);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    commitAudio();
    setIsRecording(false);
  }

  return (
    <div className={`push-to-talk ${isRecording ? 'recording' : ''}`}>
      <MicIcon />
      <span>{isRecording ? 'Listening...' : 'Hold Space to talk'}</span>
      {hasPermission === false && (
        <span className="error">Microphone access denied</span>
      )}
    </div>
  );
}

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}
```

## Testing Requirements

- [ ] Unit test keydown/keyup handlers
- [ ] Test recording state transitions
- [ ] Manual test with actual microphone

## Out of Scope

- Voice activity detection (using push-to-talk instead)
- Audio visualization (may add later)
- Mobile support (spacebar only)
