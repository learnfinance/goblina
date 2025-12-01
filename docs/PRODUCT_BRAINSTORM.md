# Instagram Content Creator - Product Brainstorm
## For "Ms. Goblina" Character-Driven Meme Content

## 🎯 Core Concept
A micro product that helps create Instagram Reels/meme content using AI with a consistent character ("Ms. Goblina"). User inputs a relatable topic/struggle → AI suggests scenarios → Generates short video memes with character consistency.

**Target User:** Content creator making Gen Z relatable content (work, relationships, life struggles)
**Character:** Ms. Goblina - green-skinned goblin woman, 3D Pixar-like cartoon style
**Content Format:** 6-15 second meme videos with dialogue and text overlays

---

## 📋 User Flow

### **Step 1: Character Setup**
- User uploads **character image(s)** (can be multiple angles/expressions)
- System uses **Vision API** to analyze:
  - Character appearance (hair, clothing, features)
  - Visual style (artistic, realistic, cartoon, etc.)
  - Color palette
  - Mood/aesthetic
- Generates a **Style Guide** (JSON/text) that will be used for all future generations
- User can name/save the character for reuse

**Output:** Character profile with style guide

---

### **Step 2: Story Input**
- User types out their **story/narrative** (freeform text)
- Could be:
  - A short story
  - Scene descriptions
  - Instagram post concept
  - Series of events

**Output:** Raw story text

---

### **Step 3: AI Storyboarding**
- System uses **GPT-5** to analyze the story and break it into **scenes**
- For each scene, generates:
  - **Scene description** (what happens)
  - **Visual prompt** (camera angle, lighting, motion)
  - **Suggested duration** (seconds)
  - **Suggested number of scenes** (if story is long)
- User can:
  - Review/edit scene prompts
  - Adjust scene durations
  - Add/remove scenes
  - Reorder scenes

**Output:** Array of scene objects with prompts and metadata

---

### **Step 4: Scene Generation**
- For each scene:
  - Combine **character style guide** + **scene prompt** + **story context**
  - Generate video using **Sora 2** with character image as `input_reference`
  - Track progress per scene
- Show **scene-by-scene progress** (like a storyboard grid)
- User can:
  - See which scenes are queued/in-progress/completed
  - Preview individual scenes
  - **Remix individual scenes** before merging

**Output:** Array of completed video scenes

---

### **Step 5: Scene Remix & Refinement**
- For each scene, user can:
  - Click "Remix" button
  - Enter targeted prompt (e.g., "make it more dramatic", "change lighting to golden hour")
  - Generate remix version
  - Compare original vs remix
  - Keep preferred version
- This happens **before** merging, so user can perfect each scene

**Output:** Refined scene videos

---

### **Step 6: Video Composition**
- Merge all scenes into **one continuous video**
- Options:
  - Simple concatenation (scene 1 → scene 2 → scene 3)
  - Transitions (fade, crossfade, etc.)
  - Instagram-optimized:
    - **9:16 aspect ratio** (1080x1920 for Reels/Stories)
    - Max duration (15s, 30s, 60s, 90s)
    - Auto-trim if needed
- Generate final MP4

**Output:** Final Instagram-ready video

---

### **Step 7: Export & Download**
- Download final video
- Optionally:
  - Generate thumbnail
  - Add captions/text overlays
  - Export in different formats

---

## 🏗️ Technical Architecture

### **Backend Endpoints Needed:**

```
POST /api/characters
  - Upload character image(s)
  - Analyze with Vision API
  - Generate style guide
  - Save character profile

GET /api/characters/:id
  - Retrieve character + style guide

POST /api/storyboard
  - Input: story text, character style guide
  - Output: array of scene prompts with durations

POST /api/scenes/generate
  - Input: scene prompt, character image, style guide
  - Output: video job ID

GET /api/scenes/:id/status
  - Poll scene generation status

POST /api/scenes/:id/remix
  - Remix individual scene

POST /api/compose
  - Input: array of scene video IDs
  - Output: merged video job ID

GET /api/compose/:id/status
  - Poll composition status

GET /api/download/:id
  - Download final video
```

### **Data Models:**

```javascript
Character {
  id: string
  name: string
  images: string[] // paths/URLs
  styleGuide: {
    appearance: string
    visualStyle: string
    colorPalette: string[]
    mood: string
    visionAnalysis: object
  }
  createdAt: timestamp
}

Story {
  id: string
  text: string
  characterId: string
  scenes: Scene[]
  createdAt: timestamp
}

Scene {
  id: string
  storyId: string
  order: number
  prompt: string
  duration: number // seconds
  videoId: string | null // OpenAI video ID
  status: 'pending' | 'queued' | 'in_progress' | 'completed' | 'failed'
  remixHistory: Remix[]
}

Remix {
  id: string
  sceneId: string
  prompt: string
  videoId: string
  status: string
  createdAt: timestamp
}

Composition {
  id: string
  storyId: string
  sceneIds: string[]
  videoId: string | null
  status: string
  format: 'reel' | 'story' | 'post'
  aspectRatio: '9:16' | '1:1' | '16:9'
}
```

---

## 🎨 UI/UX Considerations

### **Multi-Step Wizard Flow:**
1. **Character Setup** (one-time or per project)
2. **Story Input** (text editor)
3. **Storyboard Review** (editable grid of scenes)
4. **Scene Generation** (progress dashboard)
5. **Scene Refinement** (remix per scene)
6. **Final Composition** (preview + export)

### **Key UI Components:**
- **Character Gallery** (saved characters)
- **Storyboard Grid** (visual scene breakdown)
- **Scene Preview Cards** (with remix buttons)
- **Progress Dashboard** (all scenes status)
- **Video Player** (with comparison for remixes)
- **Export Panel** (Instagram format options)

---

## 🔧 Technical Challenges & Solutions

### **1. Video Merging**
- **Challenge:** Sora outputs individual MP4s, need to merge them
- **Solution:** Use `ffmpeg` (or `fluent-ffmpeg` Node.js wrapper) to concatenate videos
- **Consideration:** Handle different resolutions, add transitions

### **2. Character Consistency**
- **Challenge:** Ensuring character looks same across scenes
- **Solution:** 
  - Use character image as `input_reference` for each scene
  - Include style guide in every prompt
  - Use same character image for all scenes (or multiple angles)

### **3. Instagram Format Optimization**
- **Challenge:** Instagram Reels are 9:16, Sora might generate 16:9
- **Solution:**
  - Resize character images to 1080x1920 before generation
  - Or use `ffmpeg` to crop/resize after generation
  - Add letterboxing/padding if needed

### **4. Long Stories**
- **Challenge:** Stories might need 10+ scenes, each taking minutes
- **Solution:**
  - Generate scenes in parallel (if API allows)
  - Show progress for all scenes simultaneously
  - Allow user to generate scenes in batches
  - Save progress so user can resume later

### **5. Style Guide Generation**
- **Challenge:** Converting Vision API analysis into usable style guide
- **Solution:**
  - Use GPT-4 Vision to analyze character image
  - Generate structured JSON style guide
  - Include in every scene prompt as context

---

## 🚀 MVP Features (Phase 1)

1. ✅ Character upload + Vision analysis
2. ✅ Story input
3. ✅ AI storyboarding (GPT-4)
4. ✅ Scene-by-scene generation (Sora)
5. ✅ Individual scene remix
6. ✅ Basic video merging (ffmpeg)
7. ✅ Instagram format export (9:16)

---

## 🎯 Future Enhancements (Phase 2+)

- **Character Library** (save/reuse characters)
- **Story Templates** (pre-made story structures)
- **Advanced Transitions** (fade, zoom, etc.)
- **Music/Audio** (add background music)
- **Text Overlays** (captions, titles)
- **Batch Processing** (generate multiple stories)
- **Cloud Storage** (save projects in cloud)
- **Collaboration** (share characters/stories)
- **Analytics** (track which scenes perform best)

---

## 📦 Dependencies to Add

```json
{
  "openai": "^4.x", // Official OpenAI SDK (better than node-fetch)
  "fluent-ffmpeg": "^2.x", // Video merging
  "sharp": "^0.33.x", // Image processing (already added)
  "uuid": "^9.x" // Generate IDs
}
```

---

## 🎬 Example User Journey

1. **Sarah uploads** a character image of a "cyberpunk cat"
2. **System analyzes** → Style guide: "Futuristic, neon colors, sleek design, urban setting"
3. **Sarah types:** "The cat walks through a neon-lit alley, then jumps onto a rooftop, and looks at the city skyline"
4. **AI storyboards:**
   - Scene 1: "Wide shot of cat walking through neon alley, tracking camera" (5s)
   - Scene 2: "Low angle of cat jumping onto rooftop, dynamic motion" (4s)
   - Scene 3: "Close-up of cat looking at city skyline, golden hour" (6s)
5. **System generates** all 3 scenes with character consistency
6. **Sarah remixes** Scene 2: "Make the jump more dramatic with slow motion"
7. **System merges** all scenes → 15s Instagram Reel
8. **Sarah downloads** and posts to Instagram ✨

---

## 🤔 Questions to Consider

1. **Storage:** Where to store character images? (local filesystem vs cloud)
2. **Persistence:** Save projects? (database vs JSON files)
3. **Cost:** Each scene = API call. How to manage costs?
4. **Rate Limits:** OpenAI rate limits? Handle gracefully?
5. **User Experience:** How long should user wait? Show progress clearly?
6. **Error Handling:** What if one scene fails? Allow retry/regenerate?

---

## 💡 Implementation Status

### ✅ Completed (Phase 1 MVP)

1. ✅ **Character Analysis** - Vision API integration (`/api/characters/analyze`)
2. ✅ **Style Guide Extraction** - Automatic style guide from character image
3. ✅ **Personality Presets** - 4 pre-made tone/style presets (`/api/personalities/presets`)
4. ✅ **Scenario Generation** - Topic → AI-generated scenarios (`/api/scenarios/generate`)
5. ✅ **Storyboard Generation** - Story → Multi-scene breakdown (`/api/storyboard`)
6. ✅ **Video Generation** - Sora 2 integration with character reference (`/api/generate`)
7. ✅ **Remix Feature** - Per-scene refinement (`/api/remix`)
8. ✅ **Creator UI** - Wizard interface for full workflow (`creator.html`)

### 🚧 In Progress

- **Video Merging** - ffmpeg integration to combine scenes
- **Character Persistence** - Save character profiles to file/database
- **Complete UI** - Finish video generation step in creator.html

### 📋 Next Steps (Phase 2)

1. **Complete video generation UI** - Wire up Step 4 fully
2. **Add video merging** - ffmpeg to concatenate scenes
3. **Character library** - Save/load character profiles
4. **Text overlay tool** - Add animated text to videos
5. **Music integration** - Background music support
6. **Project persistence** - Save/resume projects

