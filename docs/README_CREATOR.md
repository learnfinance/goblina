# 🧙‍♀️ Ms. Goblina Content Creator

**AI-Powered Instagram Meme Generator with Character Consistency**

A specialized micro-product for creating Gen Z relatable content using Sora 2, built specifically for character-driven meme content creation.

---

## 🎯 What It Does

This tool helps your girlfriend create **Ms. Goblina** Instagram Reels with AI:

1. **Upload character image** → AI extracts style guide (using OpenAI Vision API)
2. **Choose personality/tone** → Select meme style (Gen Z, Office Humor, Relationship, etc.)
3. **Input topic or story** → AI generates scenarios and video prompts
4. **Generate videos** → Sora 2 creates videos with character consistency
5. **Remix scenes** → Refine individual scenes before final export

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd "/Users/cameron/TEST SORA 2"
npm install
```

### 2. Set Up API Key

Create `.env` file:

```bash
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

### 3. Start the Server

```bash
npm start
```

### 4. Open the Creator Tool

- **Main Interface**: http://localhost:3000/creator.html
- **Simple Tool (existing)**: http://localhost:3000/

---

## 🏗️ API Endpoints

### Character Analysis

```bash
POST /api/characters/analyze
```

**Upload a character image** → Returns style guide

**Body (multipart/form-data):**
- `image`: Character image file
- `characterName`: "Ms. Goblina"

**Response:**
```json
{
  "id": "1732123456789",
  "name": "Ms. Goblina",
  "styleGuide": {
    "character": {
      "appearance": "Green-skinned goblin woman...",
      "visualStyle": "3D cartoon, Pixar-like",
      "colorPalette": ["#8BC34A", "#FF5722", "#FFC107"],
      "artisticStyle": "Clean, vibrant, modern cartoon",
      "lighting": "Soft fluorescent office / warm home lighting",
      "details": "Smooth textures, rounded features"
    },
    "personality": {
      "vibe": "Sarcastic, relatable, witty",
      "emotion": "Frustrated-funny, honest",
      "context": "Office, home, relationship scenarios"
    }
  },
  "createdAt": "2025-11-20T..."
}
```

---

### Personality Presets

```bash
GET /api/personalities/presets
```

Returns available personality/tone presets:

```json
{
  "genz-meme": {
    "tone": "witty",
    "pacing": "fast",
    "emotion": "relatable",
    "vibe": "casual",
    "cameraStyle": "dynamic",
    "shotPreference": "medium-close",
    "contentType": "meme",
    "description": "Quick, punchy, relatable Gen Z meme content"
  },
  "office-humor": { ... },
  "relationship-real": { ... },
  "life-struggle": { ... }
}
```

---

### Scenario Generation (Topic → Scenarios)

```bash
POST /api/scenarios/generate
```

**Give it a topic** → AI suggests full scenarios with prompts

**Body:**
```json
{
  "topic": "Slack messages that start with 'quick question'",
  "characterStyleGuide": { ... },
  "personalityPreset": "genz-meme",
  "sceneCount": 1
}
```

**Response:**
```json
{
  "scenarios": [
    {
      "hook": "When 'quick question' actually means 2 hours of work",
      "sceneDescription": "Ms. Goblina at desk, sees Slack message, dramatic reaction",
      "dialogue": "Hell no!",
      "textOverlay": "Quick question = Illegal",
      "duration": 8,
      "prompt": "A 3D cartoon office scene. Ms. Goblina (green-skinned goblin woman, casual hoodie, gold bangles) sits at a laptop. Camera zooms in on screen showing Slack message: 'Quick question'. She looks at screen, eyes widen, turns to camera with shocked expression, and yells dramatically. Medium-close shot with push-in, fluorescent office lighting, dynamic camera, fast-paced, witty Gen Z meme style."
    }
  ]
}
```

---

### Storyboard Generation (Full Story → Scenes)

```bash
POST /api/storyboard
```

**Give it a full story** → AI breaks it into multiple scenes

**Body:**
```json
{
  "story": "Ms. Goblina is in the office working. Her micromanaging boss leans over and points at her screen. Ms. Goblina rolls her eyes, looks at the camera, and says 'Micromanager? Meet my macro boundaries.' The boss looks surprised and silently rolls her eyes.",
  "characterStyleGuide": { ... },
  "personalityPreset": "office-humor",
  "targetDuration": 15
}
```

**Response:**
```json
{
  "scenes": [
    {
      "order": 1,
      "description": "Establishing shot: Ms. Goblina typing at desk",
      "duration": 3,
      "prompt": "Wide shot of dimly lit open-plan office. Ms. Goblina (green-skinned goblin woman...) types at laptop. Fluorescent lighting, subtle office background motion.",
      "dialogue": null,
      "textOverlay": null
    },
    {
      "order": 2,
      "description": "Manager appears, points at screen",
      "duration": 5,
      "prompt": "Medium two-shot. Manager (tall brown-skinned woman in white shirt) leans over Ms. Goblina's desk, points at laptop screen with annoyed expression. Ms. Goblina looks up, rolls eyes slightly...",
      "dialogue": "Micromanager? Meet my macro boundaries.",
      "textOverlay": "MACRO BOUNDARIES"
    },
    {
      "order": 3,
      "description": "Manager's silent reaction",
      "duration": 4,
      "prompt": "Close-up of manager's face. Startled expression, blink, then silent eye-roll and exhale. No dialogue, mouth stays closed.",
      "dialogue": null,
      "textOverlay": null
    }
  ],
  "totalDuration": 12
}
```

---

### Video Generation (existing endpoints)

```bash
POST /api/generate
POST /api/remix
GET /api/status/:id
GET /api/download/:id
```

*See original README.md for details*

---

## 🎨 Workflow Example

### Scenario 1: "Quick Question" Meme

```javascript
// Step 1: Analyze character (one-time setup)
const formData = new FormData();
formData.append('image', characterImageFile);
formData.append('characterName', 'Ms. Goblina');

const character = await fetch('/api/characters/analyze', {
  method: 'POST',
  body: formData
}).then(r => r.json());

// Step 2: Generate scenario from topic
const scenario = await fetch('/api/scenarios/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    topic: 'Slack messages that start with quick question',
    characterStyleGuide: character.styleGuide,
    personalityPreset: 'genz-meme'
  })
}).then(r => r.json());

// Step 3: Generate video with Sora using the prompt
const videoFormData = new FormData();
videoFormData.append('image', characterImageFile);
videoFormData.append('prompt', scenario.scenarios[0].prompt);
videoFormData.append('seconds', scenario.scenarios[0].duration);
videoFormData.append('size', '1080x1920'); // Instagram Reel size

const videoJob = await fetch('/api/generate', {
  method: 'POST',
  body: videoFormData
}).then(r => r.json());

// Step 4: Poll for completion
// ... (see existing code in index.html)

// Step 5: (Optional) Remix if needed
const remix = await fetch('/api/remix', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    videoId: videoJob.id,
    prompt: 'Make her reaction more dramatic and exaggerated'
  })
}).then(r => r.json());
```

---

## 🧪 Testing the API

### Test Character Analysis

```bash
curl -X POST http://localhost:3000/api/characters/analyze \
  -F "image=@path/to/goblina.png" \
  -F "characterName=Ms. Goblina"
```

### Test Scenario Generation

```bash
curl -X POST http://localhost:3000/api/scenarios/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "crying in the bathroom at work but pausing to admire glowing skin from tears",
    "personalityPreset": "office-humor",
    "sceneCount": 1
  }'
```

### Test Storyboard

```bash
curl -X POST http://localhost:3000/api/storyboard \
  -H "Content-Type: application/json" \
  -d '{
    "story": "Ms. Goblina cries in office bathroom. Mid-sob, she catches her reflection - her skin is glowing from the tears. She stops crying, leans closer to mirror, touches her face admiringly, then goes back to crying.",
    "personalityPreset": "life-struggle",
    "targetDuration": 10
  }'
```

---

## 📝 Content Ideas from Chat History

Based on her actual content ideas:

### Office/Work Memes
- "Micromanager? Meet my macro boundaries."
- "Slack messages starting with 'quick question' should be illegal"
- "POV: You get a 'quick question' on Slack"
- "25-year-old thinking about being a billionaire while working in office"

### Relationship Memes
- "Pause the scroll, solve us" (attention vs. phone)
- "I want fried chicken, he wants healthy poke bowl"
- Girlfriend vs boyfriend arguments where both are right

### Life Struggle Memes
- Crying in bathroom but noticing glowing skin from tears
- Gen Z in their 20s/30s relatable struggles

---

## 🎬 Pro Tips for Your Girlfriend

### Character Consistency
- **Always use the same character image** for `input_reference` in video generation
- The style guide ensures AI understands the visual style across all videos
- Save the character profile after first analysis

### Prompt Engineering
- **Be specific about camera angles**: "Medium shot", "Close-up", "Wide shot"
- **Specify pacing**: "Fast-paced", "Relaxed", "Dramatic slow-mo"
- **Include character details**: Always mention "green-skinned goblin woman" + outfit
- **Add text overlay hints**: "Text appears: [message]"

### Best Practices
1. **Start with topic mode** for quick memes (AI suggests everything)
2. **Use story mode** for complex multi-scene narratives
3. **Remix scenes** before merging if something isn't perfect
4. **Save successful prompts** for similar future content

### Instagram Optimization
- Use **1080x1920** (9:16) for Reels and Stories
- Keep videos **6-15 seconds** for maximum engagement
- Add **text overlays** with the main punchline
- Export with **captions** (coming soon)

---

## 🔧 Technical Architecture

### Style Guide + Personality System

**Two-Layer Prompt System:**

1. **Style Guide** (Visual consistency - WHAT it looks like)
   - Character appearance
   - Art style
   - Color palette
   - Lighting

2. **Personality Config** (Emotional consistency - HOW it feels)
   - Tone (witty, dramatic, honest)
   - Pacing (fast, relaxed, slow)
   - Camera style (dynamic, handheld, static)
   - Vibe (casual, cinematic, gritty)

**Combined in every prompt:**
```
[Character Appearance from Style Guide] +
[Scene Action from User/AI] +
[Visual Style from Style Guide] +
[Mood/Tone from Personality Config] +
[Camera Work from Personality Config]
```

---

## 🚀 Next Steps / Future Features

### Phase 2
- [ ] **Character Library** - Save/reuse multiple characters
- [ ] **Video Merging** - Combine scenes with transitions (ffmpeg)
- [ ] **Text Overlay Tool** - Add animated text to videos
- [ ] **Music Integration** - Background music from library
- [ ] **Project Saving** - Save drafts and come back later
- [ ] **Batch Generation** - Generate multiple memes at once

### Phase 3
- [ ] **Template Library** - Pre-made story templates
- [ ] **Cloud Storage** - Save projects online
- [ ] **Instagram Direct Upload** - Post directly from tool
- [ ] **Analytics** - Track which content performs best
- [ ] **Collaboration** - Share characters/templates with friends

---

## 🐛 Troubleshooting

### "Failed to analyze character"
- Make sure image is valid JPEG/PNG/WebP
- Check that OPENAI_API_KEY is set correctly
- Ensure OpenAI account has GPT-4 Vision access

### "Failed to generate video"
- Verify Sora 2 API access on your OpenAI account
- Check that image size matches video size (or will be auto-resized)
- Ensure prompt is under character limit

### "Video generation stuck at 'queued'"
- Sora can take 2-10 minutes per video
- Check OpenAI API status: https://status.openai.com
- Poll /api/status/:id to see progress

---

## 💡 Need Help?

- Check `PRODUCT_BRAINSTORM.md` for detailed product planning
- See `server.js` for all endpoint implementations
- Test with `creator.html` UI or `index.html` (simple version)

---

Built with ❤️ using Sora 2, OpenAI Vision API, and Express.js

