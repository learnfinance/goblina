## TEST SORA – Instagram Content Creator (Sora 2)

This is a **complete AI-powered content creation system** designed for creating Instagram Reels/memes with character consistency.

### ✨ Two Tools in One:

1. **Content Creator Wizard** (`/creator.html`) - **RECOMMENDED**
   - AI character analysis with Vision API
   - Topic → Scenario generation with GPT-4o
   - Full story → Multi-scene storyboards
   - Personality presets for tone/vibe
   - Character consistency across all videos
   - Per-scene remix before final export

2. **Simple Generator** (`/index.html`) - Original tool
   - Upload image + write prompt
   - Generate Sora 2 video
   - Remix feature
   - Direct download

### Prerequisites

- Node.js 18+ installed.
- An OpenAI API key with access to the Sora video endpoints.

### Setup

1. Install dependencies:

   ```bash
   cd "/Users/cameron/TEST SORA 2"
   npm install
   ```

2. Create a `.env` file in the project root:

   ```bash
   cat > .env <<EOF
   OPENAI_API_KEY=your_openai_api_key_here
   PORT=3000
   EOF
   ```

3. Start the dev server:

   ```bash
   npm run start
   ```

4. Open the UI:

   - Visit `http://localhost:3000` in your browser.

### How it works

#### Backend (`server.js`):
**AI Content Creation:**
- `POST /api/characters/analyze` – Upload character image, returns style guide (Vision API)
- `GET /api/personalities/presets` – Returns tone/vibe presets
- `POST /api/scenarios/generate` – Topic → AI-generated scenarios (GPT-4o)
- `POST /api/storyboard` – Full story → Multi-scene breakdown (GPT-4o)

**Video Generation (Sora 2):**
- `POST /api/generate` – Image + prompt → Video generation
- `GET /api/status/:id` – Poll job status
- `GET /api/download/:id` – Download completed video
- `POST /api/remix` – Targeted video improvements

#### Frontend:
- `public/home.html` – Landing page with tool selection
- `public/creator.html` – Full wizard interface (recommended)
- `public/index.html` – Simple generator (original)


