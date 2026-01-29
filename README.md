# ✊ FistFirst Learn

> **Interactive AR Physics Sandbox with Hand Tracking & AI**

An immersive browser-based learning experience that combines augmented reality, real-time hand tracking, physics simulation, and AI assistance. Use your hands to interact with physics objects directly through your webcam!

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-00A67E?style=flat&logo=google&logoColor=white)
![Matter.js](https://img.shields.io/badge/Matter.js-4B5562?style=flat&logo=javascript&logoColor=white)

---

## ✨ Features

### 🖐️ Hand Tracking
- **Real-time hand detection** using MediaPipe Tasks Vision
- **Pinch to grab** - Pick up and throw physics objects
- **Palm gesture** - Hold palm facing camera for 3 seconds to move the play area
- **Fist to lock** - Close fist to lock the play area in position

### ⚙️ Physics Engine
- **Matter.js 2D physics** with realistic collisions and gravity
- **Bouncy objects** - Adjustable bounciness and friction
- **Boundary walls** - Objects stay within the play area
- **Throw mechanics** - Grab and release to throw objects with velocity

### 🤖 AI Assistant
- **Natural language commands** - "Create 5 red balls", "Add gravity", "Make a rainbow"
- **Powered by GLM 4.5 AIR** via OpenRouter (free tier available)
- **Voice input support** - Speak commands using your microphone

### 🎮 Interactive UI
- **Moveable play area** - 80% of screen, repositionable via hand gestures
- **Chat interface** - Text or voice input for AI commands
- **Real-time feedback** - Visual indicators for hand tracking and gestures
- **Recall button** - Bring all balls back to center

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Modern browser (Chrome or Edge recommended)
- Webcam

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/fistfirst-learn.git
   cd fistfirst-learn
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your OpenRouter API key:
   ```
   VITE_OPENAI_API_KEY=your_openrouter_api_key_here
   ```
   
   > 💡 Get a free API key at [openrouter.ai/keys](https://openrouter.ai/keys)

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   
   Navigate to `http://localhost:5173` and click **"Start Learning"**

---

## 🎯 How to Use

| Gesture | Action |
|---------|--------|
| ✋ **Palm facing camera (3s)** | Move the play area |
| ✊ **Close fist** | Lock play area position |
| 🤏 **Pinch (thumb + index)** | Grab objects |
| 👋 **Release pinch** | Throw objects |

### AI Commands (Examples)
- `"Create a red ball"` - Spawns a red physics ball
- `"Add 10 rainbow balls"` - Creates multiple colorful balls
- `"Enable gravity"` - Turns on downward gravity
- `"Clear all"` - Removes all objects
- `"Make it bouncy"` - Increases object bounciness

---

## 🏗️ Project Structure

```
fistfirst-learn/
├── src/
│   ├── main.ts          # App entry point & game loop
│   ├── handTracking.ts  # MediaPipe hand tracking
│   ├── physics.ts       # Matter.js physics engine
│   ├── playingField.ts  # Moveable play area with gestures
│   ├── ai.ts            # AI assistant (OpenRouter/GLM)
│   ├── voice.ts         # Voice recognition
│   ├── webcam.ts        # Webcam management
│   ├── renderer.ts      # Canvas rendering
│   ├── uiManager.ts     # Dynamic UI elements
│   └── styles.css       # Styling
├── index.html           # Main HTML file
├── vite.config.ts       # Vite configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies & scripts
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **TypeScript** | Type-safe development |
| **Vite** | Fast development & building |
| **MediaPipe Tasks Vision** | Real-time hand tracking |
| **Matter.js** | 2D physics simulation |
| **OpenRouter API** | AI assistant (GLM 4.5 AIR) |
| **Web Speech API** | Voice recognition |

---

## 📦 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_OPENAI_API_KEY` | OpenRouter API key for AI features | Optional* |

*AI features are optional - hand tracking and physics work without an API key.

### Hand Tracking Settings

The hand tracker uses these default settings (configurable in `handTracking.ts`):
- Detection confidence: 0.3
- Tracking confidence: 0.3
- Max hands: 2
- GPU acceleration enabled

---

## 🌐 Browser Support

| Browser | Status |
|---------|--------|
| Chrome 90+ | ✅ Recommended |
| Edge 90+ | ✅ Fully supported |
| Firefox 90+ | ⚠️ Works, minor issues |
| Safari | ❌ Not supported |

> **Note:** WebRTC and MediaPipe require modern browser APIs. Chrome/Edge provide the best experience.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [MediaPipe](https://mediapipe.dev/) for the hand tracking solution
- [Matter.js](https://brm.io/matter-js/) for the physics engine
- [OpenRouter](https://openrouter.ai/) for AI API access
- [Vite](https://vitejs.dev/) for the blazing fast build tool

---

<div align="center">

**Made with ✊ by the FistFirst Learn Team**

[Report Bug](../../issues) · [Request Feature](../../issues)

</div>
