import { Component, ChangeDetectionStrategy, signal, effect, ElementRef, inject, OnInit, OnDestroy, WritableSignal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

import { WhiteboardComponent } from './components/whiteboard/whiteboard.component';
import { PaintToolsComponent } from './components/paint-tools/paint-tools.component';
import { AudioService } from './services/audio.service';
import { SpixiService, SpixiNetworkData } from './services/spixi.service';
import { WhiteboardService } from './services/whiteboard.service';

// Declare Spixi SDK global to make it accessible
declare var SpixiAppSdk: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, WhiteboardComponent, PaintToolsComponent]
})
export class AppComponent implements OnInit, OnDestroy {
  audioService = inject(AudioService);
  spixiService = inject(SpixiService);
  whiteboardService = inject(WhiteboardService);

  isOfflineMode = signal(false);
  isNightMode = signal(false);
  appStatus = signal('Initializing...');
  isRecording = signal(false);
  isAudioInitialized = signal(false);
  isPlayingAudio = signal(false);
  isOtherUserPresent = signal(false);
  talkButtonText = signal('PTT');
  
  brushColor = signal('#FFFFFF');
  brushSize = signal(4);
  isErasing = signal(false);
  micVolume = signal(1); // Gain value (e.g., 0-1.5)
  outputVolume = signal(1); // Gain value (e.g., 0-1)

  // VU Meter Signals
  micVudB = signal(-60);
  outputVudB = signal(-60);

  isWhiteboardDisabled = computed(() => !this.isOfflineMode() && !this.isOtherUserPresent());
  connectionStatus = computed(() => this.isOfflineMode() ? 'OFF-AIR' : 'ON-AIR');
  connectionStatusColor = computed(() => this.isOfflineMode() ? 'text-amber-400' : 'text-green-400');
  ledStatusClass = computed(() => {
    if (this.isOfflineMode()) {
        return 'led-amber';
    }
    if (this.isOtherUserPresent()) {
        return 'led-green';
    }
    return 'led-off';
  });
  playbackLedClass = computed(() => {
    return this.isPlayingAudio() ? 'led-blue' : 'led-off';
  });

  // VU Meter Needle Rotation
  private vuMeterRotation = (dbSignal: WritableSignal<number>) => computed(() => {
    const db = dbSignal();
    const clampedDb = Math.max(-60, Math.min(db, 0));
    // Map -60dB to -45deg, 0dB to 45deg
    const rotation = (clampedDb + 60) / 60 * 90 - 45;
    return `rotate(${rotation}deg)`;
  });
  micVuRotation = this.vuMeterRotation(this.micVudB);
  outputVuRotation = this.vuMeterRotation(this.outputVudB);

  private vuMeterAnimationId: number | null = null;
  private offlineAudioBuffer: string[] = [];
  private presenceInterval: any;
  private presenceTimeout: any;

  private platformId = inject(PLATFORM_ID);

  constructor() {
    effect(() => {
      const initData = this.spixiService.initData();
      if (initData) {
        this.appStatus.set('Ready');
      }
    });

    effect(() => {
        const networkData = this.spixiService.networkData();
        if (networkData) {
            this.handleNetworkData(networkData);
        }
    });

    effect(() => {
      const audioData = this.audioService.audioData();
      if (audioData) {
          this.handleLocalAudioData(audioData);
      }
    });

    effect(() => {
        const drawData = this.whiteboardService.outgoingDrawData();
        if(drawData) {
            if (!this.isOfflineMode()) {
                this.spixiService.sendNetworkData(`DRAW:${drawData}`);
            }
        }
    });

    // Effect to update microphone gain in the service
    effect(() => {
      const gain = this.micVolume();
      if (this.isAudioInitialized()) {
        this.audioService.setMicrophoneGain(gain);
      }
    });

    // Effect to update output volume in the service
    effect(() => {
      const volume = this.outputVolume();
      if (this.isAudioInitialized()) {
        this.audioService.setOutputVolume(volume);
      }
    });
    
    // Effect to manage presence detection when mode changes
    effect(() => {
      if (this.isOfflineMode()) {
          this.stopPresencePinging();
      } else {
          this.startPresencePinging();
      }
    });

    // Effect to start/stop the VU meter animation loop
    effect(() => {
      if (this.isRecording() || this.isPlayingAudio()) {
        this.startVuMeterLoop();
      }
    });
  }

  ngOnInit() {
    this.spixiService.initialize();
    const isTestEnv = typeof SpixiAppSdk !== 'undefined' && SpixiAppSdk._isTestEnv;
    this.isOfflineMode.set(isTestEnv);
  }

  ngOnDestroy() {
    if (this.vuMeterAnimationId) {
      cancelAnimationFrame(this.vuMeterAnimationId);
    }
    this.stopPresencePinging();
  }

  async handleTalkPress(event: Event) {
    event.preventDefault();
    if (this.isRecording()) return;

    if (isPlatformBrowser(this.platformId) && navigator.vibrate) {
      navigator.vibrate(50);
    }

    if (!this.isAudioInitialized()) {
      this.talkButtonText.set('...');
      this.appStatus.set('Requesting Mic...');
      const success = await this.audioService.initialize();
      this.isAudioInitialized.set(success);
      if (!success) {
        this.appStatus.set('Mic permission denied');
        this.talkButtonText.set('RETRY');
        return;
      }
      this.talkButtonText.set('PTT');
      this.appStatus.set('Ready');
    }

    if (this.isOfflineMode()) {
        this.offlineAudioBuffer = [];
    }

    this.isRecording.set(true);
    this.appStatus.set(this.isOfflineMode() ? 'Recording...' : 'Transmitting...');
    this.audioService.startRecording();
  }

  handleTalkRelease() {
    if (!this.isRecording()) return;

    this.isRecording.set(false);
    this.audioService.stopRecording();
    this.appStatus.set('Ready');

    if (this.isOfflineMode() && this.offlineAudioBuffer.length > 0) {
        this.appStatus.set('Playing Echo...');
        this.isPlayingAudio.set(true);
        const allChunks = [...this.offlineAudioBuffer];
        this.offlineAudioBuffer = [];
        this.audioService.playPcmChunks(allChunks).then(() => {
            this.appStatus.set('Ready');
            this.isPlayingAudio.set(false);
        }).catch(err => {
            console.error('Echo playback failed:', err);
            this.appStatus.set('Echo Error');
            this.isPlayingAudio.set(false);
        });
    }
  }

  toggleOfflineMode(event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.isOfflineMode.set(isChecked);
  }

  toggleNightMode(event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.isNightMode.set(isChecked);
  }

  clearWhiteboard() {
    this.whiteboardService.clear();
  }

  undoLastAction() {
    this.whiteboardService.undo();
  }
  
  redoLastAction() {
    this.whiteboardService.redo();
  }

  handleColorChange(color: string) {
    this.brushColor.set(color);
    this.isErasing.set(false);
  }

  handleSizeChange(size: number) {
    this.brushSize.set(size);
  }

  handleEraserSelect() {
    this.isErasing.set(true);
  }

  handleMicVolumeChange(event: Event) {
    const sliderValue = parseFloat((event.target as HTMLInputElement).value);
    this.micVolume.set(sliderValue / 100);
  }

  handleOutputVolumeChange(event: Event) {
    const sliderValue = parseFloat((event.target as HTMLInputElement).value);
    this.outputVolume.set(sliderValue / 100);
  }

  private handleNetworkData(networkData: SpixiNetworkData) {
    const { data } = networkData;
    if (data.startsWith('DRAW:')) {
      this.whiteboardService.processIncomingData(data.substring(5));
    } else if (data.startsWith('AUDIO:')) {
      this.appStatus.set('Receiving...');
      this.isPlayingAudio.set(true);
      this.audioService.playPcmChunks([data.substring(6)]).then(() => {
        this.appStatus.set('Ready');
        this.isPlayingAudio.set(false);
      }).catch(err => {
        console.error("Failed to process incoming audio", err);
        this.appStatus.set('Playback Error');
        this.isPlayingAudio.set(false);
      });
    } else if (data === 'PRESENCE:PING') {
        this.spixiService.sendNetworkData('PRESENCE:PONG');
    } else if (data === 'PRESENCE:PONG') {
        this.isOtherUserPresent.set(true);
        if (this.presenceTimeout) {
            clearTimeout(this.presenceTimeout);
        }
        this.presenceTimeout = setTimeout(() => {
            this.isOtherUserPresent.set(false);
        }, 5000); // Assume offline if no pong for 5 seconds
    }
  }

    private handleLocalAudioData(audioData: string) {
        if (this.isOfflineMode()) {
            this.offlineAudioBuffer.push(audioData);
        } else {
            this.spixiService.sendNetworkData(`AUDIO:${audioData}`);
        }
    }

  private startVuMeterLoop() {
    if (this.vuMeterAnimationId) return;
    this.updateVuMeters();
  }

  private updateVuMeters = () => {
    if (!this.isRecording() && !this.isPlayingAudio()) {
      this.micVudB.set(-60);
      this.outputVudB.set(-60);
      this.vuMeterAnimationId = null;
      return;
    }

    if (this.isRecording()) {
      this.micVudB.set(this.calculateDBFS(this.audioService.micAnalyserNode()));
    } else {
      this.micVudB.set(-60);
    }

    if (this.isPlayingAudio()) {
      this.outputVudB.set(this.calculateDBFS(this.audioService.outputAnalyserNode()));
    } else {
      this.outputVudB.set(-60);
    }

    this.vuMeterAnimationId = requestAnimationFrame(this.updateVuMeters);
  }

  private calculateDBFS(analyserNode: AnalyserNode | null): number {
    if (!analyserNode) return -60;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteTimeDomainData(dataArray);

    let sumSquares = 0.0;
    for (const amplitude of dataArray) {
      const floatValue = (amplitude / 128.0) - 1.0;
      sumSquares += floatValue * floatValue;
    }
    const rms = Math.sqrt(sumSquares / bufferLength);

    if (rms === 0) return -60;

    const db = 20 * Math.log10(rms);
    return Math.max(-60, db);
  }

  private startPresencePinging() {
    this.stopPresencePinging();
    if (!this.isOfflineMode()) {
        this.presenceInterval = setInterval(() => {
            this.spixiService.sendNetworkData('PRESENCE:PING');
        }, 3000);
    }
  }

  private stopPresencePinging() {
      if (this.presenceInterval) {
          clearInterval(this.presenceInterval);
          this.presenceInterval = null;
      }
      if(this.presenceTimeout) {
          clearTimeout(this.presenceTimeout);
          this.presenceTimeout = null;
      }
      this.isOtherUserPresent.set(false);
  }
}
