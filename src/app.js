// Declare Spixi SDK global to make it accessible
/**
 * @typedef {object} SpixiAppSdk
 * @property {boolean} _isTestEnv
 * @property {function(): void} fireOnLoad
 * @property {function(string): void} sendNetworkData
 * @property {function(string, string[]): void} onInit
 * @property {function(string, string): void} onNetworkData
 */
/** @type {SpixiAppSdk} */
var SpixiAppSdk;


document.addEventListener('DOMContentLoaded', () => {

    // --- STATE ---
    const state = {
        isOfflineMode: false,
        isNightMode: false,
        appStatus: 'Initializing...',
        isRecording: false,
        isAudioInitialized: false,
        isPlayingAudio: false,
        isOtherUserPresent: false,
        isSyncingWhiteboard: false,
        talkButtonText: 'PTT',
        
        brushColor: '#FFFFFF',
        brushSize: 4,
        
        micVolume: 1,
        outputVolume: 1,

        micVudB: -60,
        outputVudB: -60,

        canUndo: false,
        canRedo: false,
    };

    // --- DOM ELEMENTS ---
    const dom = {
        body: document.body,
        radioConsole: document.getElementById('radio-console'),
        appStatus: document.getElementById('appStatus'),
        peerLed: document.getElementById('peerLed'),
        playbackLed: document.getElementById('playbackLed'),
        connectionStatus: document.getElementById('connectionStatus'),
        onAirToggle: document.getElementById('onAirToggle'),
        onAirLabel: document.getElementById('onAirLabel'),
        nightModeToggle: document.getElementById('nightModeToggle'),
        undoButton: document.getElementById('undoButton'),
        redoButton: document.getElementById('redoButton'),
        clearWhiteboardButton: document.getElementById('clearWhiteboardButton'),
        whiteboardCanvas: document.getElementById('whiteboardCanvas'),
        whiteboardOverlay: document.getElementById('whiteboardOverlay'),
        syncingOverlayContent: document.getElementById('syncingOverlayContent'),
        waitingOverlayContent: document.getElementById('waitingOverlayContent'),
        colorPalette: document.getElementById('colorPalette'),
        brushSizes: document.getElementById('brushSizes'),
        micVuNeedle: document.getElementById('micVuNeedle'),
        outputVuNeedle: document.getElementById('outputVuNeedle'),
        micVolumeSlider: document.getElementById('micVolumeSlider'),
        talkButton: document.getElementById('talkButton'),
        outputVolumeSlider: document.getElementById('outputVolumeSlider'),
    };
    
    const colors = {
      default: ['#FFFFFF', '#ff453a', '#ff9f0a', '#ffd60a', '#32d74b', '#0a84ff', '#5e5ce6', '#bf5af2'],
      night: ['#ff453a']
    };

    let presenceInterval = null;
    let presenceTimeout = null;
    let vuMeterAnimationId = null;
    let offlineAudioBuffer = [];
    let whiteboardHistoryRequested = false;


    // --- SPIXI SERVICE ---
    const spixiService = {
        initialize: () => {
            if (typeof SpixiAppSdk === 'undefined') {
                console.warn('SpixiAppSdk not found. Running in a limited environment.');
                return;
            }
            SpixiAppSdk.onInit = (sessionId, userAddresses) => {
                setState({ appStatus: 'Ready' });
                if (userAddresses.length > 1 && !whiteboardHistoryRequested) {
                    setState({ isSyncingWhiteboard: true });
                    whiteboardHistoryRequested = true;
                    spixiService.sendNetworkData('WHITEBOARD:GET_HISTORY');
                    setTimeout(() => {
                        if (state.isSyncingWhiteboard) {
                            setState({ isSyncingWhiteboard: false });
                            console.warn('Whiteboard sync timed out.');
                        }
                    }, 5000);
                }
            };
            SpixiAppSdk.onNetworkData = (senderAddress, data) => {
                handleNetworkData({ senderAddress, data });
            };
            SpixiAppSdk.fireOnLoad();
        },
        sendNetworkData: (data) => {
            if (typeof SpixiAppSdk !== 'undefined' && SpixiAppSdk.sendNetworkData) {
                SpixiAppSdk.sendNetworkData(data);
            }
        }
    };

    // --- AUDIO SERVICE ---
    const audioService = {
        isInitialized: false,
        stream: null,
        audioContext: null,
        scriptProcessor: null,
        isCurrentlyRecording: false,
        micGainNode: null,
        outputGainNode: null,
        micAnalyserNode: null,
        outputAnalyserNode: null,
        
        initialize: async () => {
            if (audioService.isInitialized) return true;
            try {
                audioService.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const AC = window.AudioContext || (window).webkitAudioContext;
                audioService.audioContext = new AC({ sampleRate: 16000 });
                
                const source = audioService.audioContext.createMediaStreamSource(audioService.stream);
                audioService.scriptProcessor = audioService.audioContext.createScriptProcessor(4096, 1, 1);
                
                audioService.micAnalyserNode = audioService.audioContext.createAnalyser();
                audioService.micAnalyserNode.fftSize = 256;
                
                audioService.outputAnalyserNode = audioService.audioContext.createAnalyser();
                audioService.outputAnalyserNode.fftSize = 256;

                audioService.scriptProcessor.onaudioprocess = (event) => audioService.processAudio(event);

                audioService.micGainNode = audioService.audioContext.createGain();
                audioService.outputGainNode = audioService.audioContext.createGain();
                
                const muteNode = audioService.audioContext.createGain();
                muteNode.gain.setValueAtTime(0, audioService.audioContext.currentTime);

                source.connect(audioService.micGainNode);
                audioService.micGainNode.connect(audioService.micAnalyserNode);
                audioService.micAnalyserNode.connect(audioService.scriptProcessor);
                audioService.scriptProcessor.connect(muteNode);
                muteNode.connect(audioService.audioContext.destination);

                audioService.outputGainNode.connect(audioService.outputAnalyserNode);
                audioService.outputAnalyserNode.connect(audioService.audioContext.destination);

                audioService.isInitialized = true;
                return true;
            } catch (error) {
                console.error('Audio initialization failed:', error);
                audioService.isInitialized = false;
                return false;
            }
        },
        startRecording: () => {
            if (!audioService.isInitialized || !audioService.audioContext) return;
            if (audioService.audioContext.state === 'suspended') {
                audioService.audioContext.resume();
            }
            audioService.isCurrentlyRecording = true;
        },
        stopRecording: () => {
            audioService.isCurrentlyRecording = false;
        },
        setMicrophoneGain: (level) => {
            if (audioService.micGainNode) {
                audioService.micGainNode.gain.setValueAtTime(level, audioService.audioContext?.currentTime ?? 0);
            }
        },
        setOutputVolume: (level) => {
            if (audioService.outputGainNode) {
                audioService.outputGainNode.gain.setValueAtTime(level, audioService.audioContext?.currentTime ?? 0);
            }
        },
        playPcmChunks: async (base64Chunks) => {
            if (!audioService.audioContext || !audioService.outputGainNode || base64Chunks.length === 0) return;
            if (audioService.audioContext.state === 'suspended') {
                await audioService.audioContext.resume();
            }

            const decodedByteArrays = base64Chunks.map(chunk => audioService.decodeBase64(chunk));
            const totalLength = decodedByteArrays.reduce((acc, val) => acc + val.length, 0);
            const combinedBytes = new Uint8Array(totalLength);
            let offset = 0;
            for (const bytes of decodedByteArrays) {
                combinedBytes.set(bytes, offset);
                offset += bytes.length;
            }

            const audioBuffer = await audioService.decodePcmData(combinedBytes, audioService.audioContext, 16000, 1);
            if (audioBuffer.duration === 0) {
                return Promise.resolve();
            }

            return new Promise((resolve) => {
                const source = audioService.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioService.outputGainNode);
                source.start();
                source.onended = () => resolve();
            });
        },
        processAudio: (event) => {
            if (!audioService.isCurrentlyRecording) return;
            const inputData = event.inputBuffer.getChannelData(0);
            const pcmData = audioService.createPcmData(inputData);
            handleLocalAudioData(pcmData);
        },
        createPcmData: (data) => {
            const l = data.length;
            const int16 = new Int16Array(l);
            for (let i = 0; i < l; i++) {
                int16[i] = data[i] * 32768;
            }
            return audioService.encodeToBase64(new Uint8Array(int16.buffer));
        },
        encodeToBase64: (bytes) => {
            let binary = '';
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        },
        decodeBase64: (base64) => {
            const binaryString = atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        },
        decodePcmData: async (data, ctx, sampleRate, numChannels) => {
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
    };
    
    // --- WHITEBOARD ---
    const whiteboard = {
      ctx: null,
      isDrawing: false,
      history: [],
      redoStack: [],
      currentStroke: null,

      initialize: () => {
        whiteboard.ctx = dom.whiteboardCanvas.getContext('2d');
        whiteboard.resizeCanvas();
        window.addEventListener('resize', whiteboard.resizeCanvas);
        
        const canvas = dom.whiteboardCanvas;
        canvas.addEventListener('mousedown', whiteboard.onMouseDown);
        canvas.addEventListener('mousemove', whiteboard.onMouseMove);
        window.addEventListener('mouseup', whiteboard.onMouseUp);
        canvas.addEventListener('touchstart', whiteboard.onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', whiteboard.onTouchMove, { passive: false });
        window.addEventListener('touchend', whiteboard.onMouseUp);
      },
      getHistoryState: () => JSON.stringify(whiteboard.history),
      loadHistoryState: (stateStr) => {
        try {
          const history = JSON.parse(stateStr);
          if (Array.isArray(history)) {
            whiteboard.history = history;
            whiteboard.redoStack = [];
            whiteboard.redrawCanvas();
            whiteboard.updateUndoRedoState();
          }
        } catch (e) {
          console.error('Failed to load whiteboard history state.', e);
        }
      },
      handleIncomingData: (data) => {
         try {
            const action = JSON.parse(data);
            switch(action.type) {
                case 'stroke':
                    whiteboard.history.push(action.payload);
                    whiteboard.redoStack = [];
                    whiteboard.redrawCanvas();
                    break;
                case 'undo':
                    if (whiteboard.history.length > 0) {
                        whiteboard.redoStack.push(whiteboard.history.pop());
                        whiteboard.redrawCanvas();
                    }
                    break;
                case 'redo':
                    if (whiteboard.redoStack.length > 0) {
                        whiteboard.history.push(whiteboard.redoStack.pop());
                        whiteboard.redrawCanvas();
                    }
                    break;
                case 'clear':
                    whiteboard.clearHistoryAndCanvas();
                    break;
            }
            whiteboard.updateUndoRedoState();
        } catch(e) { console.error("Could not parse whiteboard data", e); }
      },
      onMouseDown: (e) => {
        whiteboard.isDrawing = true;
        whiteboard.redoStack = [];
        whiteboard.currentStroke = { id: `${Date.now()}-${Math.random()}`, color: state.brushColor, size: state.brushSize, points: [] };
        whiteboard.onMouseMove(e);
      },
      onMouseUp: () => {
        if (!whiteboard.isDrawing || !whiteboard.currentStroke || whiteboard.currentStroke.points.length === 0) {
            whiteboard.isDrawing = false; return;
        };
        whiteboard.isDrawing = false;
        whiteboard.history.push(whiteboard.currentStroke);
        whiteboard.sendAction({ type: 'stroke', payload: whiteboard.currentStroke });
        whiteboard.currentStroke = null;
        whiteboard.updateUndoRedoState();
      },
      onMouseMove: (e) => {
        if (!whiteboard.isDrawing) return;
        const pos = whiteboard.getMousePos(e, dom.whiteboardCanvas);
        if (pos && whiteboard.currentStroke) {
            whiteboard.currentStroke.points.push({ x: pos[0], y: pos[1] });
            whiteboard.redrawCanvas();
        }
      },
      onTouchStart: (e) => {
        e.preventDefault();
        whiteboard.isDrawing = true;
        whiteboard.redoStack = [];
        whiteboard.currentStroke = { id: `${Date.now()}-${Math.random()}`, color: state.brushColor, size: state.brushSize, points: [] };
        whiteboard.onTouchMove(e);
      },
      onTouchMove: (e) => {
        e.preventDefault();
        if (!whiteboard.isDrawing) return;
        const pos = whiteboard.getTouchPos(e, dom.whiteboardCanvas);
        if(pos && whiteboard.currentStroke) {
            whiteboard.currentStroke.points.push({ x: pos[0], y: pos[1] });
            whiteboard.redrawCanvas();
        }
      },
      undo: () => {
          if (whiteboard.history.length > 0) {
              whiteboard.redoStack.push(whiteboard.history.pop());
              whiteboard.redrawCanvas();
              whiteboard.sendAction({ type: 'undo' });
              whiteboard.updateUndoRedoState();
          }
      },
      redo: () => {
          if (whiteboard.redoStack.length > 0) {
              whiteboard.history.push(whiteboard.redoStack.pop());
              whiteboard.redrawCanvas();
              whiteboard.sendAction({ type: 'redo' });
              whiteboard.updateUndoRedoState();
          }
      },
      clear: () => {
          whiteboard.clearHistoryAndCanvas();
          whiteboard.sendAction({ type: 'clear' });
      },
      sendAction: (action) => {
        if (!state.isOfflineMode) {
            spixiService.sendNetworkData(`DRAW:${JSON.stringify(action)}`);
        }
      },
      updateUndoRedoState: () => {
        setState({ 
          canUndo: whiteboard.history.length > 0, 
          canRedo: whiteboard.redoStack.length > 0 
        });
      },
      redrawCanvas: () => {
        const { width, height } = dom.whiteboardCanvas;
        whiteboard.ctx.clearRect(0, 0, width, height);
        whiteboard.history.forEach(stroke => whiteboard.drawStroke(stroke));
        if (whiteboard.isDrawing && whiteboard.currentStroke) {
            whiteboard.drawStroke(whiteboard.currentStroke);
        }
      },
      drawStroke: (stroke) => {
        if (!whiteboard.ctx || stroke.points.length === 0) return;
        const { ctx } = whiteboard;
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      },
      clearHistoryAndCanvas: () => {
        whiteboard.ctx.clearRect(0, 0, dom.whiteboardCanvas.width, dom.whiteboardCanvas.height);
        whiteboard.history = [];
        whiteboard.redoStack = [];
        whiteboard.updateUndoRedoState();
      },
      resizeCanvas: () => {
        const canvas = dom.whiteboardCanvas;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            whiteboard.ctx.scale(dpr, dpr);
        }
        whiteboard.redrawCanvas();
      },
      getMousePos: (e, canvas) => {
        const rect = canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
      },
      getTouchPos: (e, canvas) => {
        if (!e.touches || e.touches.length !== 1) return null;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        return [touch.clientX - rect.left, touch.clientY - rect.top];
      }
    };

    // --- STATE & UI MANAGEMENT ---
    function setState(newState) {
        const wasAnimating = state.isRecording || state.isPlayingAudio;
        Object.assign(state, newState);
        updateUI();
        const isAnimating = state.isRecording || state.isPlayingAudio;

        if (isAnimating && !wasAnimating) {
            startVuMeterLoop();
        }
    }

    function updateUI() {
        // Body classes
        dom.body.classList.toggle('night-mode', state.isNightMode);

        // Header
        dom.appStatus.textContent = state.appStatus;
        const ledStatusClass = state.isOfflineMode ? 'led-amber' : state.isOtherUserPresent ? 'led-green' : 'led-off';
        dom.peerLed.className = `w-4 h-4 rounded-full mt-1 border-2 border-black/50 transition-all duration-300 ${ledStatusClass}`;
        const playbackLedClass = state.isPlayingAudio ? 'led-blue' : 'led-off';
        dom.playbackLed.className = `w-4 h-4 rounded-full mt-1 border-2 border-black/50 transition-all duration-300 ${playbackLedClass}`;
        
        dom.connectionStatus.textContent = state.isOfflineMode ? 'OFF-AIR' : 'ON-AIR';
        dom.connectionStatus.className = `font-bold ${state.isOfflineMode ? 'text-amber-400' : 'text-green-400'}`;

        // Controls
        dom.onAirToggle.checked = !state.isOfflineMode;
        dom.onAirLabel.textContent = state.isOfflineMode ? 'OFF-AIR' : 'ON-AIR';
        dom.nightModeToggle.checked = state.isNightMode;
        dom.undoButton.disabled = !state.canUndo;
        dom.redoButton.disabled = !state.canRedo;

        // Whiteboard Overlay
        const isWhiteboardDisabled = state.isSyncingWhiteboard || (!state.isOfflineMode && !state.isOtherUserPresent);
        dom.whiteboardOverlay.classList.toggle('hidden', !isWhiteboardDisabled);
        if(isWhiteboardDisabled) {
            dom.syncingOverlayContent.classList.toggle('hidden', !state.isSyncingWhiteboard);
            dom.waitingOverlayContent.classList.toggle('hidden', state.isSyncingWhiteboard);
        }

        // PTT Button
        dom.talkButton.textContent = state.talkButtonText;
        const isTalkDisabled = !state.isAudioInitialized && state.talkButtonText !== 'PTT' && state.talkButtonText !== 'RETRY';
        dom.talkButton.disabled = isTalkDisabled;
        dom.talkButton.classList.toggle('bg-red-700', state.isRecording);
        dom.talkButton.classList.toggle('border-red-900', state.isRecording);
        dom.talkButton.classList.toggle('text-white', state.isRecording);
        
        // VU Meters - Set initial position
        updateVuMeterNeedles();
    }
    
    // --- EVENT HANDLERS & LOGIC ---
    async function handleTalkPress(event) {
        event.preventDefault();
        if (state.isRecording) return;
        if (navigator.vibrate) navigator.vibrate(50);

        if (!state.isAudioInitialized) {
            setState({ talkButtonText: '...', appStatus: 'Requesting Mic...' });
            const success = await audioService.initialize();
            if (!success) {
                setState({ isAudioInitialized: false, appStatus: 'Mic permission denied', talkButtonText: 'RETRY' });
                return;
            }
            setState({ isAudioInitialized: true, appStatus: 'Ready', talkButtonText: 'PTT' });
        }
        
        if (state.isOfflineMode) {
            offlineAudioBuffer = [];
        }
        setState({ isRecording: true, appStatus: state.isOfflineMode ? 'Recording...' : 'Transmitting...' });
        audioService.startRecording();
    }

    function handleTalkRelease() {
        if (!state.isRecording) return;
        
        audioService.stopRecording();
        setState({ isRecording: false, appStatus: 'Ready' });

        if (state.isOfflineMode && offlineAudioBuffer.length > 0) {
            setState({ appStatus: 'Playing Echo...', isPlayingAudio: true });
            const allChunks = [...offlineAudioBuffer];
            offlineAudioBuffer = [];
            audioService.playPcmChunks(allChunks).then(() => {
                setState({ appStatus: 'Ready', isPlayingAudio: false });
            }).catch(err => {
                console.error('Echo playback failed:', err);
                setState({ appStatus: 'Echo Error', isPlayingAudio: false });
            });
        }
    }

    function handleNetworkData(networkData) {
        const { data } = networkData;
        if (data.startsWith('DRAW:')) {
            whiteboard.handleIncomingData(data.substring(5));
        } else if (data.startsWith('AUDIO:')) {
            setState({ appStatus: 'Receiving...', isPlayingAudio: true });
            audioService.playPcmChunks([data.substring(6)]).then(() => {
                setState({ appStatus: 'Ready', isPlayingAudio: false });
            }).catch(err => {
                console.error("Failed to process incoming audio", err);
                setState({ appStatus: 'Playback Error', isPlayingAudio: false });
            });
        } else if (data === 'PRESENCE:PING') {
            spixiService.sendNetworkData('PRESENCE:PONG');
        } else if (data === 'PRESENCE:PONG') {
            setState({ isOtherUserPresent: true });
            if (presenceTimeout) clearTimeout(presenceTimeout);
            presenceTimeout = setTimeout(() => setState({ isOtherUserPresent: false }), 5000);
        } else if (data === 'WHITEBOARD:GET_HISTORY') {
            const historyState = whiteboard.getHistoryState();
            if (historyState) {
                spixiService.sendNetworkData(`WHITEBOARD:HISTORY:${historyState}`);
            }
        } else if (data.startsWith('WHITEBOARD:HISTORY:')) {
            const historyState = data.substring(19);
            whiteboard.loadHistoryState(historyState);
            setState({ isSyncingWhiteboard: false });
        }
    }

    function handleLocalAudioData(audioData) {
        if (state.isOfflineMode) {
            offlineAudioBuffer.push(audioData);
        } else {
            spixiService.sendNetworkData(`AUDIO:${audioData}`);
        }
    }

    function startVuMeterLoop() {
        if (vuMeterAnimationId) return;
        vuMeterAnimationId = requestAnimationFrame(updateVuMeters);
    }

    function updateVuMeterNeedles() {
        const micRotation = (Math.max(-60, Math.min(state.micVudB, 0)) + 60) / 60 * 90 - 45;
        dom.micVuNeedle.style.transform = `rotate(${micRotation}deg)`;
        const outputRotation = (Math.max(-60, Math.min(state.outputVudB, 0)) + 60) / 60 * 90 - 45;
        dom.outputVuNeedle.style.transform = `rotate(${outputRotation}deg)`;
    }

    function updateVuMeters() {
        if (!state.isRecording && !state.isPlayingAudio) {
            state.micVudB = -60;
            state.outputVudB = -60;
            updateVuMeterNeedles();
            vuMeterAnimationId = null;
            return;
        }

        if (state.isRecording) {
            state.micVudB = calculateDBFS(audioService.micAnalyserNode);
        } else {
            state.micVudB = -60;
        }
        if (state.isPlayingAudio) {
            state.outputVudB = calculateDBFS(audioService.outputAnalyserNode);
        } else {
            state.outputVudB = -60;
        }
        
        updateVuMeterNeedles();
        
        vuMeterAnimationId = requestAnimationFrame(updateVuMeters);
    }
    
    function calculateDBFS(analyserNode) {
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

    function startPresencePinging() {
        stopPresencePinging();
        if (!state.isOfflineMode) {
            presenceInterval = setInterval(() => {
                spixiService.sendNetworkData('PRESENCE:PING');
            }, 3000);
        }
    }

    function stopPresencePinging() {
        if (presenceInterval) clearInterval(presenceInterval);
        presenceInterval = null;
        if (presenceTimeout) clearTimeout(presenceTimeout);
        presenceTimeout = null;
        setState({ isOtherUserPresent: false });
    }

    function setupPaintTools() {
        const currentColors = state.isNightMode ? colors.night : colors.default;
        dom.colorPalette.innerHTML = '';
        currentColors.forEach(c => {
            const button = document.createElement('button');
            button.className = 'w-8 h-8 rounded-md transition-all ring-offset-2 ring-offset-zinc-800 active:scale-90 border-2 border-transparent';
            button.style.backgroundColor = c;
            if (c === state.brushColor) {
                button.classList.add('ring-2', 'ring-amber-400');
            }
            button.addEventListener('click', () => {
                setState({ brushColor: c });
                setupPaintTools();
            });
            dom.colorPalette.appendChild(button);
        });

        dom.brushSizes.querySelectorAll('button').forEach(btn => {
            const size = parseInt(btn.dataset.size, 10);
            const isActive = size === state.brushSize;
            btn.classList.toggle('bg-amber-500', isActive);
            btn.classList.toggle('text-zinc-900', isActive);
            btn.classList.toggle('bg-zinc-700', !isActive);
            btn.classList.toggle('text-amber-100', !isActive);
        });
    }

    // --- INITIALIZATION ---
    function init() {
        // Event Listeners
        dom.talkButton.addEventListener('mousedown', handleTalkPress);
        dom.talkButton.addEventListener('mouseup', handleTalkRelease);
        dom.talkButton.addEventListener('mouseleave', handleTalkRelease);
        dom.talkButton.addEventListener('touchstart', handleTalkPress, { passive: false });
        dom.talkButton.addEventListener('touchend', handleTalkRelease);
        dom.talkButton.addEventListener('touchcancel', handleTalkRelease);

        dom.onAirToggle.addEventListener('change', (e) => {
            setState({ isOfflineMode: !e.target.checked });
            if (state.isOfflineMode) stopPresencePinging(); else startPresencePinging();
        });
        dom.nightModeToggle.addEventListener('change', (e) => {
            const isNight = e.target.checked;
            let newState = { isNightMode: isNight };
            if (isNight && state.brushColor !== colors.night[0]) {
                newState.brushColor = colors.night[0];
            }
            setState(newState);
            setupPaintTools();
        });

        dom.clearWhiteboardButton.addEventListener('click', () => whiteboard.clear());
        dom.undoButton.addEventListener('click', () => whiteboard.undo());
        dom.redoButton.addEventListener('click', () => whiteboard.redo());
        
        dom.micVolumeSlider.addEventListener('input', (e) => {
            const micVolume = parseFloat(e.target.value) / 100;
            setState({ micVolume });
            audioService.setMicrophoneGain(micVolume);
        });
        dom.outputVolumeSlider.addEventListener('input', (e) => {
            const outputVolume = parseFloat(e.target.value) / 100;
            setState({ outputVolume });
            audioService.setOutputVolume(outputVolume);
        });
        
        dom.brushSizes.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                setState({ brushSize: parseInt(e.currentTarget.dataset.size, 10) });
                setupPaintTools();
            });
        });

        // Service & Component Initialization
        spixiService.initialize();
        whiteboard.initialize();
        
        // Initial setup
        const isTestEnv = typeof SpixiAppSdk !== 'undefined' && SpixiAppSdk._isTestEnv;
        setState({ isOfflineMode: isTestEnv });
        if (!isTestEnv) startPresencePinging();

        setupPaintTools();
        updateUI();
    }
    
    init();
});