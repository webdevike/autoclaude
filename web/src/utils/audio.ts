/**
 * Audio utilities for browser-side audio handling.
 * Handles recording from microphone and playing PCM16 audio.
 */

const SAMPLE_RATE = 24000; // OpenAI Realtime API expects 24kHz
const CHANNELS = 1; // Mono audio

/**
 * Audio recorder that captures PCM16 audio from the microphone.
 */
export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private onAudioData: ((data: string) => void) | null = null;

  /**
   * Start recording from the microphone.
   * @param onAudioData Callback that receives base64-encoded PCM16 chunks
   */
  async start(onAudioData: (data: string) => void): Promise<void> {
    this.onAudioData = onAudioData;

    // Request microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: CHANNELS,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Create audio context
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

    // Load the audio worklet processor
    await this.audioContext.audioWorklet.addModule(
      URL.createObjectURL(
        new Blob([AUDIO_WORKLET_PROCESSOR], { type: 'application/javascript' })
      )
    );

    // Create worklet node
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm16-processor');
    this.workletNode.port.onmessage = (event) => {
      if (this.onAudioData && event.data.pcm16) {
        this.onAudioData(event.data.pcm16);
      }
    };

    // Connect microphone to worklet
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    source.connect(this.workletNode);
  }

  /**
   * Stop recording.
   */
  stop(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.onAudioData = null;
  }
}

/**
 * Audio player that plays PCM16 audio data.
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private isPlaying = false;

  /**
   * Initialize the audio player.
   */
  async init(): Promise<void> {
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.nextStartTime = this.audioContext.currentTime;
  }

  /**
   * Play a chunk of PCM16 audio.
   * @param base64Data Base64-encoded PCM16 audio data
   */
  play(base64Data: string): void {
    if (!this.audioContext) {
      throw new Error('AudioPlayer not initialized');
    }

    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Convert PCM16 to Float32
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    // Create audio buffer
    const audioBuffer = this.audioContext.createBuffer(
      CHANNELS,
      float32Array.length,
      SAMPLE_RATE
    );
    audioBuffer.copyToChannel(float32Array, 0);

    // Schedule playback
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // Schedule at the right time to ensure continuous playback
    const startTime = Math.max(this.audioContext.currentTime, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
    this.isPlaying = true;

    source.onended = () => {
      if (this.nextStartTime <= this.audioContext!.currentTime) {
        this.isPlaying = false;
      }
    };
  }

  /**
   * Interrupt/clear any queued audio.
   */
  interrupt(): void {
    if (this.audioContext) {
      // Reset the next start time to now, effectively clearing the queue
      this.nextStartTime = this.audioContext.currentTime;
      this.isPlaying = false;
    }
  }

  /**
   * Check if audio is currently playing.
   */
  get playing(): boolean {
    return this.isPlaying;
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isPlaying = false;
  }
}

/**
 * AudioWorklet processor code for converting float audio to PCM16.
 */
const AUDIO_WORKLET_PROCESSOR = `
class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
    this.bufferSize = 2400; // 100ms at 24kHz
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputData = input[0];

    // Append to buffer
    const newBuffer = new Float32Array(this.buffer.length + inputData.length);
    newBuffer.set(this.buffer);
    newBuffer.set(inputData, this.buffer.length);
    this.buffer = newBuffer;

    // Process when we have enough samples
    while (this.buffer.length >= this.bufferSize) {
      const chunk = this.buffer.slice(0, this.bufferSize);
      this.buffer = this.buffer.slice(this.bufferSize);

      // Convert to PCM16
      const pcm16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Convert to base64
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      this.port.postMessage({ pcm16: base64 });
    }

    return true;
  }
}

registerProcessor('pcm16-processor', PCM16Processor);
`;

/**
 * Utility to convert ArrayBuffer to base64.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Utility to convert base64 to ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
