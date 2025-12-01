# 🏗️ System Architecture

## Complete Ms. Goblina Content Creator

---

## 📊 System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INPUT                                │
├─────────────────────────────────────────────────────────────┤
│  1. Character Image (Ms. Goblina)                           │
│  2. Personality/Tone Selection                              │
│  3. Topic OR Full Story                                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│               AI PROCESSING LAYER                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────┐    ┌────────────────────┐          │
│  │  OpenAI Vision API │    │    GPT-4o          │          │
│  │  Character Analysis│    │  Scenario/Storyboard│         │
│  └────────┬───────────┘    └──────┬─────────────┘          │
│           │                       │                         │
│           ▼                       ▼                         │
│  ┌────────────────────┐    ┌────────────────────┐          │
│  │   Style Guide      │    │  Scene Prompts     │          │
│  │  - Appearance      │    │  - Description     │          │
│  │  - Visual Style    │    │  - Duration        │          │
│  │  - Color Palette   │    │  - Dialogue        │          │
│  │  - Lighting        │    │  - Text Overlay    │          │
│  └────────┬───────────┘    └──────┬─────────────┘          │
│           │                       │                         │
│           └───────┬───────────────┘                         │
│                   │                                         │
│                   ▼                                         │
│           ┌───────────────┐                                 │
│           │ Prompt Builder│                                 │
│           │ Style + Scene │                                 │
│           └───────┬───────┘                                 │
│                   │                                         │
└───────────────────┼─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│              VIDEO GENERATION                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────┐             │
│  │           Sora 2 API                       │             │
│  │  Input: Character Image + Enhanced Prompt  │             │
│  │  Output: MP4 Video (1080x1920, 6-15s)     │             │
│  └────────────────┬───────────────────────────┘             │
│                   │                                         │
│                   ▼                                         │
│         ┌─────────────────┐                                 │
│         │  Video Polling  │                                 │
│         │  (status check) │                                 │
│         └────────┬────────┘                                 │
│                  │                                          │
│            ┌─────┴─────┐                                    │
│            ▼           ▼                                    │
│      [Completed]   [Remix?]                                 │
│                        │                                    │
│                        └──► Sora Remix API                  │
│                                                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    OUTPUT                                    │
├─────────────────────────────────────────────────────────────┤
│  • Instagram-ready video (9:16 aspect ratio)                │
│  • Character consistency maintained                         │
│  • Proper tone/personality applied                          │
│  • Download & post!                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Backend API Endpoints

### Character Analysis Pipeline

```javascript
POST /api/characters/analyze
┌──────────────────────────────────────────┐
│ 1. Receive character image upload        │
│ 2. Convert to base64                     │
│ 3. Send to OpenAI Vision API (gpt-4o)    │
│ 4. Extract style guide:                  │
│    • Physical appearance                 │
│    • Visual/art style                    │
│    • Color palette (hex codes)           │
│    • Lighting preferences                │
│    • Personality vibes                   │
│ 5. Return structured JSON                │
└──────────────────────────────────────────┘
```

### Scenario Generation Pipeline

```javascript
POST /api/scenarios/generate
┌──────────────────────────────────────────┐
│ 1. Receive:                              │
│    • Topic/struggle                      │
│    • Character style guide               │
│    • Personality preset                  │
│ 2. Build context prompt for GPT-4o       │
│ 3. AI generates:                         │
│    • Hook/concept                        │
│    • Scene description                   │
│    • Dialogue (if any)                   │
│    • Text overlay                        │
│    • Duration                            │
│    • Full Sora prompt (detailed)         │
│ 4. Return scenarios array                │
└──────────────────────────────────────────┘
```

### Storyboard Generation Pipeline

```javascript
POST /api/storyboard
┌──────────────────────────────────────────┐
│ 1. Receive:                              │
│    • Full story/narrative                │
│    • Character style guide               │
│    • Personality preset                  │
│    • Target duration                     │
│ 2. AI analyzes story structure           │
│ 3. Breaks into multiple scenes:          │
│    • Scene order                         │
│    • Description per scene               │
│    • Duration per scene                  │
│    • Prompts with character style        │
│    • Dialogue/text overlays              │
│ 4. Return scenes array + total duration  │
└──────────────────────────────────────────┘
```

### Video Generation Pipeline

```javascript
POST /api/generate
┌──────────────────────────────────────────┐
│ 1. Receive:                              │
│    • Character image                     │
│    • Enhanced prompt (from AI)           │
│    • Duration, size                      │
│ 2. Resize image if needed (Sharp)        │
│ 3. Send to Sora 2 API:                   │
│    • input_reference: character image    │
│    • prompt: enhanced prompt             │
│    • model: sora-2                       │
│    • size: 1080x1920 (Instagram)         │
│ 4. Return job ID                         │
└──────────────────────────────────────────┘

GET /api/status/:id
┌──────────────────────────────────────────┐
│ Poll Sora job status every 3 seconds:    │
│ • queued → in_progress → completed       │
│ • Return progress percentage             │
└──────────────────────────────────────────┘

POST /api/remix
┌──────────────────────────────────────────┐
│ 1. Receive:                              │
│    • Video ID                            │
│    • Targeted change prompt              │
│ 2. Call Sora remix API                   │
│ 3. Return new job ID                     │
│ 4. Poll until completed                  │
└──────────────────────────────────────────┘
```

---

## 🎨 Personality Preset System

### Four Pre-Built Presets

```javascript
{
  "genz-meme": {
    tone: "witty",
    pacing: "fast",
    emotion: "relatable",
    vibe: "casual",
    cameraStyle: "dynamic",
    shotPreference: "medium-close",
    contentType: "meme"
  },
  
  "office-humor": {
    tone: "sarcastic",
    pacing: "moderate",
    emotion: "frustrated-funny",
    vibe: "corporate-casual",
    cameraStyle: "static-push",
    shotPreference: "medium"
  },
  
  "relationship-real": {
    tone: "honest",
    pacing: "moderate",
    emotion: "genuine",
    vibe: "conversational",
    cameraStyle: "handheld",
    shotPreference: "medium-two-shot"
  },
  
  "life-struggle": {
    tone: "dramatic-comedic",
    pacing: "varied",
    emotion: "chaotic",
    vibe: "relatable-messy",
    cameraStyle: "dynamic",
    shotPreference: "varied"
  }
}
```

### How Presets Affect Prompts

```javascript
function buildPrompt(styleGuide, personality, sceneAction) {
  return `
    ${styleGuide.character.appearance}
    ${sceneAction}
    
    Rendered in ${styleGuide.character.visualStyle} style.
    ${styleGuide.character.artisticStyle}
    Color palette: ${styleGuide.character.colorPalette.join(', ')}
    ${styleGuide.character.lighting}
    
    ${personality.tone} tone
    ${personality.emotion} emotion
    ${personality.vibe} vibe
    ${personality.pacing} pacing
    
    ${personality.cameraStyle} camera movement
    ${personality.shotPreference} shot
  `.trim();
}
```

**Example Output:**
```
A green-skinned goblin woman in casual hoodie with gold bangles 
sits at a laptop in a dim office. She sees a Slack message and 
dramatically yells "Hell no!" while looking at the camera.

Rendered in 3D cartoon Pixar-like style. Clean, vibrant, modern 
illustration. Color palette: #8BC34A, #FF5722, #FFC107. 
Soft fluorescent office lighting.

Witty tone. Relatable emotion. Casual vibe. Fast pacing.

Dynamic camera movement with push-in. Medium-close shot.
```

---

## 📂 File Structure

```
/Users/cameron/TEST SORA 2/
├── server.js                    # Main Express backend
│   ├── /api/characters/analyze  # Vision API integration
│   ├── /api/scenarios/generate  # Topic → Scenarios
│   ├── /api/storyboard          # Story → Scenes
│   ├── /api/personalities/presets
│   ├── /api/generate            # Sora video generation
│   ├── /api/remix               # Sora remix
│   └── /api/status/:id          # Poll job status
│
├── public/
│   ├── index.html               # Simple generator (original)
│   └── creator.html             # Full wizard interface
│
├── uploads/                     # Temp image storage
│
├── package.json
├── .env                         # OPENAI_API_KEY
│
├── README.md                    # Original simple tool docs
├── README_CREATOR.md            # Full API documentation
├── QUICKSTART.md                # Quick start guide
├── PRODUCT_BRAINSTORM.md        # Product planning
└── ARCHITECTURE.md              # This file
```

---

## 🔄 Data Flow Example

### Creating "Quick Question" Meme

```
Step 1: CHARACTER SETUP (one-time)
────────────────────────────────────
User uploads goblina.png
    ↓
POST /api/characters/analyze
    ↓
Vision API analyzes
    ↓
Returns:
{
  styleGuide: {
    character: {
      appearance: "Green-skinned goblin woman...",
      visualStyle: "3D cartoon Pixar-like",
      colorPalette: ["#8BC34A", "#FF5722", "#FFC107"],
      ...
    }
  }
}

Step 2: SELECT PERSONALITY
────────────────────────────────────
User selects: "genz-meme"
Loaded from presets

Step 3: TOPIC → SCENARIO
────────────────────────────────────
User inputs: "Slack quick question messages"
    ↓
POST /api/scenarios/generate
{
  topic: "Slack quick question messages",
  characterStyleGuide: {...},
  personalityPreset: "genz-meme"
}
    ↓
GPT-4o generates:
{
  scenarios: [{
    hook: "When 'quick question' = 2 hours",
    description: "Ms. Goblina sees message, dramatic reaction",
    dialogue: "Hell no!",
    textOverlay: "Quick question = Illegal",
    duration: 8,
    prompt: "A 3D cartoon office scene. Ms. Goblina
            (green-skinned goblin woman, casual hoodie,
            gold bangles) sits at a laptop. Camera zooms
            in on screen showing Slack message: 'Quick
            question'. She looks at screen, eyes widen
            dramatically, turns to camera with shocked
            expression, and yells 'Hell no!'. Medium-close
            shot with push-in, fluorescent office lighting,
            dynamic camera, fast-paced, witty Gen Z meme
            style."
  }]
}

Step 4: VIDEO GENERATION
────────────────────────────────────
POST /api/generate
{
  image: goblina.png,
  prompt: [enhanced prompt from Step 3],
  seconds: 8,
  size: "1080x1920"
}
    ↓
Sora 2 API
    ↓
Poll GET /api/status/:id every 3s
    ↓
Status: queued → in_progress → completed
    ↓
GET /api/download/:id
    ↓
Instagram-ready MP4!

Optional Step 5: REMIX
────────────────────────────────────
POST /api/remix
{
  videoId: "video_123",
  prompt: "Make reaction more dramatic"
}
    ↓
Sora remix API
    ↓
Poll until completed
    ↓
Improved video!
```

---

## 🧪 Technology Stack

### Backend
- **Node.js** + Express.js
- **OpenAI SDK** (openai npm package)
  - GPT-4o for text generation
  - GPT-4o Vision for image analysis
  - Sora 2 for video generation
- **Sharp** for image resizing
- **Multer** for file uploads
- **node-fetch** for external API calls

### Frontend
- Vanilla JavaScript (no framework)
- Fetch API for backend calls
- CSS Grid + Flexbox
- Progressive wizard UI

### Storage
- Temporary file storage (uploads/)
- No database (stateless for MVP)
- Future: PostgreSQL or MongoDB

---

## 🔐 Security Considerations

### Current State (MVP)
- API key stored in .env (server-side only)
- No authentication/authorization
- Temporary file cleanup after processing
- Files stored locally (not in cloud)

### Production Recommendations
- Add user authentication
- Rate limiting per user
- Cloud storage (S3/CloudFlare R2)
- API key rotation
- CORS restrictions
- Input validation & sanitization
- Video watermarking (for free tier)

---

## 📈 Scalability Considerations

### Current Limitations
- Single server instance
- Synchronous video generation
- No caching
- Local file storage

### Future Improvements
- Queue system (Bull/Redis) for video jobs
- Worker processes for parallel generation
- CDN for video delivery
- Database for character/project persistence
- WebSocket for real-time progress updates
- Cloud deployment (Vercel/Railway/Render)

---

## 🎯 Key Design Decisions

### Why Two-Layer Prompt System?

**Style Guide** (Visual)
- Extracted once per character
- Ensures consistent look across all videos
- Reusable across projects

**Personality Config** (Emotional)
- Changes per content type
- Affects mood, pacing, camera work
- Easy to swap without re-analyzing character

### Why Separate Scenario and Storyboard?

**Scenario Mode** (Topic → Single Scene)
- Faster for quick memes
- AI does all creative work
- Perfect for single-shot content

**Storyboard Mode** (Story → Multiple Scenes)
- For complex narratives
- Multi-scene breakdowns
- User maintains creative control

### Why Wizard UI?

- Guides user through process
- Prevents missing steps
- Shows progress clearly
- Reduces cognitive load
- Better for non-technical users

---

## 🚀 Performance Metrics

### Typical Timings

```
Character Analysis:     ~3-5 seconds
Scenario Generation:    ~5-8 seconds
Storyboard Generation:  ~8-12 seconds
Video Generation:       ~2-10 minutes (Sora 2)
Remix:                  ~2-8 minutes (Sora 2)
```

### Cost Estimates (per video)

```
Vision API (character): ~$0.01 (one-time)
GPT-4o (scenario):      ~$0.02-0.05
GPT-4o (storyboard):    ~$0.05-0.10
Sora 2 (video):         ~$0.50-2.00 (varies by duration/quality)
Remix:                  ~$0.50-2.00

Total per meme:         ~$0.60-$2.20
```

---

**Built for Ms. Goblina 🧙‍♀️ | Powered by Sora 2 & OpenAI**

