# ✊ FistFirst Learn

> **Interactive AR Physics Sandbox with Hand Tracking, AI Agent & Scene Awareness**

An immersive browser-based learning experience that combines augmented reality, real-time hand tracking, physics simulation, and a **conversational AI agent**. Use your hands to interact with physics objects directly through your webcam - and talk to an AI that understands what's on screen!

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-00A67E?style=flat&logo=google&logoColor=white)
![Matter.js](https://img.shields.io/badge/Matter.js-4B5562?style=flat&logo=javascript&logoColor=white)
![AI Powered](https://img.shields.io/badge/AI-GLM%204.5-ff6b6b?style=flat)

---

## ✨ Features

### 🤖 Conversational AI Agent
- **Scene-aware AI** that knows what objects are on screen
- **Natural language commands** - "Create 5 rainbow triangles", "How many red balls?"
- **Pointing integration** - Point and say "Put a star here!"
- **Object modification** - "Make it bigger", "Change it to purple"
- **Query the scene** - "Count all the hexagons", "What's at my finger?"

### 🖐️ Hand Tracking
- **Real-time hand detection** using MediaPipe Tasks Vision
- **Pinch to grab** - Pick up and throw physics objects
- **Point to select** - Extend index finger to select objects
- **Palm gesture** - Hold palm facing camera for 3 seconds to move play area
- **Fist to lock** - Close fist to lock play area position

### ⚙️ Physics Engine
- **Matter.js 2D physics** with realistic collisions and gravity
- **Multiple shapes** - Balls, rectangles, triangles, hexagons, stars, pentagons
- **Custom polygons** - Any regular polygon with configurable sides
- **Boundary walls** - Objects stay within the play area
- **Throw mechanics** - Grab and release to throw objects with velocity

### 🎨 Shape Creation
| Shape | Command Examples |
|-------|-----------------|
| **Balls/Circles** | "Create a red ball", "Add 10 blue circles" |
| **Rectangles/Squares** | "Make a green box", "Create 3 squares" |
| **Triangles** | "Add a purple triangle", "5 rainbow triangles" |
| **Hexagons** | "Create a hexagon here", "10 yellow hexagons" |
| **Pentagons** | "Make a pentagon", "Create 5-sided polygon" |
| **Stars** | "Add a gold star", "Create 5 rainbow stars" |

### 🎮 Interactive Features
- **Moveable play area** - 80% of screen, repositionable via hand gestures
- **Chat interface** - Text or voice input for AI commands
- **Scene queries** - Ask "How many objects?", "Count red balls"
- **Object selection** - Point at objects to select and modify them
- **Recall button** - Bring all objects back to center

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Modern browser (Chrome or Edge recommended)
- Webcam

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ShadowFull12/FistFirst-Learn.git
   cd FistFirst-Learn
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

### Hand Gestures
| Gesture | Action |
|---------|--------|
| ✋ **Palm facing camera (3s)** | Move the play area |
| ✊ **Close fist** | Lock play area position |
| 🤏 **Pinch (thumb + index)** | Grab objects |
| 👆 **Point (index extended)** | Select objects / specify position |
| 👋 **Release pinch** | Throw objects |

### AI Commands
| Command Type | Examples |
|--------------|----------|
| **Create** | "Create a red ball", "Make 5 triangles" |
| **Query** | "How many balls?", "Count red objects" |
| **Modify** | "Make it bigger", "Change to purple" |
| **Physics** | "Add gravity", "Enable bouncy mode" |
| **Pointing** | "Put a star here", "Create hexagon where I'm pointing" |
| **Patterns** | "10 balls in a circle", "5 stars in a line" |

### Voice Commands
Click the microphone button and speak naturally:
- "Create 10 rainbow stars"
- "How many objects are on screen?"
- "Add a slider for gravity"
- "Clear everything"

---

## 🏗️ Project Structure

```
FistFirst-Learn/
├── src/
│   ├── main.ts          # App entry point & game loop
│   ├── ai.ts            # Conversational AI agent with scene awareness
│   ├── handTracking.ts  # MediaPipe hand tracking + pointing detection
│   ├── physics.ts       # Matter.js physics engine + shapes
│   ├── playingField.ts  # Moveable play area with gestures
│   ├── renderer.ts      # Canvas rendering for all shapes
│   ├── uiManager.ts     # Dynamic UI elements
│   ├── voice.ts         # Voice recognition
│   ├── webcam.ts        # Webcam management
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

## 🤖 AI Capabilities

The AI agent is **scene-aware** and can:

### Create Objects
```
"Create a red ball"
"Make 5 rainbow triangles"
"Add 10 hexagons in a circle pattern"
"Put a star where I'm pointing"
```

### Query the Scene
```
"How many balls are there?"
"Count the red objects"
"What objects are on screen?"
```

### Modify Objects
```
"Make it bigger" (selected object)
"Change it to purple"
"Delete that"
"Make it static"
```

### Control Physics
```
"Add gravity"
"Disable gravity"
"Make everything bouncy"
"Enable magnetic attraction"
```

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

### Supported Shapes
- Circle/Ball
- Rectangle/Square/Box
- Triangle (3 sides)
- Pentagon (5 sides)
- Hexagon (6 sides)
- Star (5 points)
- Custom polygon (any sides)

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
- [GLM 4.5 AIR](https://openrouter.ai/models/z-ai/glm-4.5-air:free) for the conversational AI

---

<div align="center">

**Made with ✊ by the FistFirst Learn Team**

[Report Bug](../../issues) · [Request Feature](../../issues)

</div>
