# JavaScript Walkie-Talkie

This is a real-time voice communication and collaborative whiteboard application built with standard web technologies. It simulates a classic walkie-talkie experience with push-to-talk functionality, audio visualization, and a shared drawing canvas.

## Features

- **Real-Time Audio Communication**: Push-to-Talk (PTT) voice streaming between connected peers.
- **Collaborative Whiteboard**: A shared canvas where users can draw together in real-time. Drawing actions are synced instantly across all participants.
- **Audio Visualization**: Analog-style VU meters provide real-time visual feedback for both microphone input (Mic Gain) and incoming audio (Output Vol).
- **Presence Detection**: The UI indicates when another user is present in the session (`PEER` status LED).
- **On-Air / Off-Air Modes**: 
    - **On-Air**: Enables live communication with peers.
    - **Off-Air**: A local "echo" mode to test microphone input and audio playback without transmitting.
- **Paint Tools**: Users can change brush color and size.
- **Whiteboard Controls**: Includes undo, redo, and clear screen functionalities.
- **Night Mode**: A stylish, alternative red-and-black theme for low-light environments.
- **Responsive Design**: The interface is designed to work seamlessly on both desktop and mobile devices.

## Tech Stack

This application is built using modern web technologies and best practices, without relying on any external frameworks.

- **Framework**: None (Vanilla JavaScript).
- **Language**: JavaScript (ES6+)
- **APIs**:
  - **[Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)**: Used for capturing microphone input, processing audio data, controlling gain (volume), and analyzing audio levels for the VU meters.
  - **[Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)**: Powers the collaborative whiteboard for all drawing operations.
- **Styling**: Self-contained custom CSS and utility classes embedded directly in the `index.html` file.
- **Networking**: The application is designed to integrate with the **Spixi SDK** for peer-to-peer data transmission (both audio and whiteboard data).

## How It Works

### Audio Pipeline
1.  **Initialization**: The application requests microphone permissions using `navigator.mediaDevices.getUserMedia`.
2.  **Processing**: A `Web Audio API` context is created. The microphone stream is routed through a `GainNode` (for volume control) and an `AnalyserNode` (for VU meter data).
3.  **Recording**: When the PTT button is pressed, a `ScriptProcessorNode` captures raw PCM audio data.
4.  **Transmission**: The PCM data is encoded into a Base64 string and sent over the network via the Spixi SDK.
5.  **Playback**: Incoming Base64 audio chunks are decoded, converted into an `AudioBuffer`, and played through a separate `GainNode` and `AnalyserNode` for output volume control and visualization.

### Whiteboard Synchronization
1.  **Drawing**: User actions on the `<canvas>` (mouse or touch events) are captured by event listeners.
2.  **Action Serialization**: Each drawing action (e.g., a complete stroke) is serialized into a JSON object containing its color, size, and all constituent points.
3.  **Transmission**: This JSON payload is sent over the network via the Spixi SDK.
4.  **Receiving & Redrawing**: Other clients receive the JSON payload, parse it, and redraw the action on their own canvas, ensuring all whiteboards are in sync.
5.  **History Sync**: When a new user joins, they request the full drawing history from an existing peer to get up to speed.

## Project Structure

The project has been simplified to a minimal set of files for a framework-less web application.

-   `index.html`: The main HTML file that defines the entire structure of the application. It also contains all the necessary CSS styles, removing the need for external stylesheets.
-   `src/app.js`: A single, comprehensive JavaScript file that contains all the application logic. This includes state management, DOM manipulation, event handling, audio processing, whiteboard drawing logic, and all network communication.
-   `metadata.json`: Contains metadata for the application.
-   `index.tsx`: The primary entry point file required by the hosting environment.