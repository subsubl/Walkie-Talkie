# Walkie-Talkie

This is a real-time voice communication and collaborative whiteboard application built with the latest features of Angular. It simulates a classic walkie-talkie experience with push-to-talk functionality, audio visualization, and a shared drawing canvas, all running in a zoneless Angular environment.

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

This application is built using modern web technologies and best practices:

- **Framework**: [Angular](https://angular.dev/) (v20+)
  - **Standalone Components**: The application is built entirely with standalone components, eliminating the need for NgModules.
  - **Signals**: State management is handled reactively and efficiently using Angular Signals.
  - **Zoneless Change Detection**: The app runs in a zoneless environment for improved performance.
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) for a utility-first styling approach.
- **Audio Processing**: The [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) is used for capturing microphone input, processing audio data, controlling gain (volume), and analyzing audio levels for the VU meters.
- **Networking**: The application is designed to integrate with the **Spixi SDK** for peer-to-peer data transmission (both audio and whiteboard data).
- **Language**: [TypeScript](https://www.typescriptlang.org/)

## How It Works

### Audio Pipeline
1.  **Initialization**: The `AudioService` requests microphone permissions using `navigator.mediaDevices.getUserMedia`.
2.  **Processing**: A `Web Audio API` context is created. The microphone stream is routed through a `GainNode` (for volume control) and an `AnalyserNode` (for VU meter data).
3.  **Recording**: When the PTT button is pressed, a `ScriptProcessorNode` captures raw PCM audio data.
4.  **Transmission**: The PCM data is encoded into a Base64 string and sent over the network via the `SpixiService`.
5.  **Playback**: Incoming Base64 audio chunks are decoded, converted into an `AudioBuffer`, and played through a separate `GainNode` and `AnalyserNode` for output volume control and visualization.

### Whiteboard Synchronization
1.  **Drawing**: User actions on the `<canvas>` (mouse or touch events) are captured by the `WhiteboardComponent`.
2.  **Action Serialization**: Each drawing action (e.g., a complete stroke) is serialized into a JSON object containing its color, size, and all constituent points.
3.  **Transmission**: This JSON payload is sent over the network via the `SpixiService`.
4.  **Receiving & Redrawing**: Other clients receive the JSON payload, parse it, and redraw the action on their own canvas, ensuring all whiteboards are in sync.
5.  **History Sync**: When a new user joins, they request the full drawing history from an existing peer to get up to speed.

## Project Structure

-   `index.html`: Main HTML file. Loads Tailwind CSS and initializes the Angular application.
-   `src/main.ts`: The entry point for bootstrapping the standalone Angular application.
-   `src/app.component.ts`: The root component that holds the main application logic, state management, and orchestrates the different services.
-   `src/components/`:
    -   `whiteboard/whiteboard.component.ts`: Manages the canvas, drawing logic, and history.
    -   `paint-tools/paint-tools.component.ts`: UI for selecting brush color and size.
-   `src/services/`:
    -   `audio.service.ts`: Handles all Web Audio API logic, including recording, playback, and analysis.
    -   `spixi.service.ts`: A wrapper for the Spixi SDK to handle all network communication.
    -   `whiteboard.service.ts`: Acts as a bridge between the main app component and the whiteboard, managing state like undo/redo availability and forwarding commands.
