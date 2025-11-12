import { Injectable, signal, WritableSignal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AudioService {
  isInitialized = signal(false);
  micAnalyserNode: WritableSignal<AnalyserNode | null> = signal(null);
  outputAnalyserNode: WritableSignal<AnalyserNode | null> = signal(null);
  audioData = signal<string | null>(null);

  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isCurrentlyRecording = false;
  private micGainNode: GainNode | null = null;
  private outputGainNode: GainNode | null = null;

  async initialize(): Promise<boolean> {
    if (this.isInitialized()) return true;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      const micAnalyser = this.audioContext.createAnalyser();
      micAnalyser.fftSize = 256;
      this.micAnalyserNode.set(micAnalyser);

      const outputAnalyser = this.audioContext.createAnalyser();
      outputAnalyser.fftSize = 256;
      this.outputAnalyserNode.set(outputAnalyser);

      this.scriptProcessor.onaudioprocess = (event) => this.processAudio(event);

      // Create and configure Gain nodes
      this.micGainNode = this.audioContext.createGain();
      this.outputGainNode = this.audioContext.createGain();
      
      const muteNode = this.audioContext.createGain();
      muteNode.gain.setValueAtTime(0, this.audioContext.currentTime);

      // Connect recording path: source -> micGain -> micAnalyser -> scriptProcessor -> mute -> destination
      source.connect(this.micGainNode);
      this.micGainNode.connect(micAnalyser);
      micAnalyser.connect(this.scriptProcessor);
      this.scriptProcessor.connect(muteNode);
      muteNode.connect(this.audioContext.destination);

      // Connect playback path: outputGain -> outputAnalyser -> destination
      this.outputGainNode.connect(outputAnalyser);
      outputAnalyser.connect(this.audioContext.destination);

      this.isInitialized.set(true);
      return true;
    } catch (error) {
      console.error('Audio initialization failed:', error);
      this.isInitialized.set(false);
      return false;
    }
  }

  startRecording() {
    if (!this.isInitialized() || !this.audioContext) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.isCurrentlyRecording = true;
  }

  stopRecording() {
    this.isCurrentlyRecording = false;
  }
  
  setMicrophoneGain(level: number) {
    if (this.micGainNode) {
      this.micGainNode.gain.setValueAtTime(level, this.audioContext?.currentTime ?? 0);
    }
  }

  setOutputVolume(level: number) {
    if (this.outputGainNode) {
      this.outputGainNode.gain.setValueAtTime(level, this.audioContext?.currentTime ?? 0);
    }
  }

  async playPcmChunks(base64Chunks: string[]): Promise<void> {
    if (!this.audioContext || !this.outputGainNode || base64Chunks.length === 0) return;

    if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
    }

    const decodedByteArrays = base64Chunks.map(chunk => this.decodeBase64(chunk));
    const totalLength = decodedByteArrays.reduce((acc, val) => acc + val.length, 0);
    const combinedBytes = new Uint8Array(totalLength);

    let offset = 0;
    for (const bytes of decodedByteArrays) {
        combinedBytes.set(bytes, offset);
        offset += bytes.length;
    }

    const audioBuffer = await this.decodePcmData(combinedBytes, this.audioContext, 16000, 1);
    
    if (audioBuffer.duration === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
        const source = this.audioContext!.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputGainNode!);
        source.start();
        source.onended = () => resolve();
    });
  }

  private processAudio(event: AudioProcessingEvent) {
    if (!this.isCurrentlyRecording) return;
    const inputData = event.inputBuffer.getChannelData(0);
    const pcmBlob = this.createPcmBlob(inputData);
    this.audioData.set(pcmBlob.data);
    setTimeout(() => this.audioData.set(null), 0);
  }

  private createPcmBlob(data: Float32Array): { data: string; mimeType: string } {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: this.encodeToBase64(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  }

  private encodeToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  
  private decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  
  private async decodePcmData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }
}
