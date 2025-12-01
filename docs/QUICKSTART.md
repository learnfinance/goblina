# 🚀 Quick Start Guide

## For Your Girlfriend's Content Creation

### What You Built

A **custom AI tool** specifically for creating Ms. Goblina Instagram content:

```
Topic/Idea → AI Brainstorm → Sora Video Generation → Instagram-Ready Content
```

---

## 🎯 Two Ways to Use It

### Option 1: **Creator Wizard** (Recommended)
📍 **http://localhost:3000/creator.html**

**Step-by-step guided workflow:**
1. Upload Ms. Goblina character image → AI analyzes style
2. Choose personality (Gen Z Meme, Office Humor, etc.)
3. Enter topic or full story → AI generates scenarios
4. Generate videos with character consistency
5. Remix scenes individually before final export

**Perfect for:** Creating new content from scratch

---

### Option 2: **Simple Generator** (Existing)
📍 **http://localhost:3000**

**Direct video generation:**
1. Upload character image
2. Write full prompt manually
3. Generate video
4. Remix if needed

**Perfect for:** When you already have the exact prompt you want

---

## 📱 Example Workflow: "Quick Question" Meme

### What She Wants to Create:
*"A meme about Slack messages that start with 'quick question' being annoying"*

### Using the Creator Wizard:

1. **Upload Ms. Goblina image** (one-time setup)
   - Tool extracts: "Green-skinned goblin, 3D cartoon style, office/casual settings"

2. **Select "Gen Z Meme"** personality
   - Sets tone: witty, fast-paced, relatable

3. **Enter topic:** 
   ```
   Slack messages that start with 'quick question'
   ```

4. **AI Generates:**
   ```
   Hook: "When 'quick question' actually means 2 hours of work"
   Scene: Ms. Goblina at desk, sees message, dramatic "Hell no!" reaction
   Text Overlay: "Quick question = Illegal"
   Duration: 8 seconds
   
   Full Sora Prompt:
   "A 3D cartoon office scene. Ms. Goblina (green-skinned goblin woman, 
   casual hoodie, gold bangles) sits at a laptop. Camera zooms in on 
   screen showing Slack message: 'Quick question'. She looks at screen, 
   eyes widen dramatically, turns to camera with shocked expression, 
   and yells 'Hell no!'. Medium-close shot with push-in, fluorescent 
   office lighting, dynamic camera, fast-paced, witty Gen Z meme style."
   ```

5. **Generate Video** → Sora creates it with character consistency

6. **Remix** (optional): "Make the reaction more exaggerated"

7. **Download** → Post to Instagram!

---

## 🎨 Content Ideas from Her Chat History

### Office/Work
- ✅ "Micromanager? Meet my macro boundaries"
- ✅ "Slack 'quick question' messages should be illegal"
- ✅ "25-year-old office worker daydreaming about billions"

### Relationships
- ✅ "Pause the scroll, solve us" (phone addiction in relationships)
- ✅ "Boyfriend wants healthy food, I want fried chicken"
- ✅ Arguments where both sides are valid

### Life Struggles
- ✅ "Crying in bathroom but noticing glowing skin from tears"
- ✅ Gen Z/millennial relatable chaos

---

## 🔧 Setup (One-Time)

```bash
# 1. Install dependencies
cd "/Users/cameron/TEST SORA 2"
npm install

# 2. Set API key
echo 'OPENAI_API_KEY=your_key_here' > .env

# 3. Start server
npm start

# 4. Open creator
# → http://localhost:3000/creator.html
```

---

## 📡 API Quick Reference

### Analyze Character Style
```bash
POST /api/characters/analyze
- Upload character image
- Returns style guide (appearance, colors, lighting, etc.)
```

### Generate Scenarios from Topic
```bash
POST /api/scenarios/generate
- Input: "crying in bathroom, glowing skin"
- Output: Full scene with prompt, dialogue, text overlay
```

### Generate Storyboard from Story
```bash
POST /api/storyboard
- Input: Full story/script
- Output: Multiple scenes with timing and prompts
```

### Generate Video
```bash
POST /api/generate
- Upload character image + prompt
- Sora generates video with character consistency
```

### Remix Video
```bash
POST /api/remix
- Input: Video ID + targeted change
- Output: New version with modification
```

---

## 💡 Pro Tips

### For Better Results:

1. **Use the same character image** for all videos
   - Ensures visual consistency
   - Style guide keeps AI on-brand

2. **Start with Topic mode**
   - Faster for quick memes
   - AI handles the creative work

3. **Choose the right personality**
   - Gen Z Meme → Fast, witty, punchy
   - Office Humor → Sarcastic, relatable work struggles
   - Relationship Real → Honest, conversational
   - Life Struggle → Chaotic, dramatic-comedic

4. **Remix before finalizing**
   - Perfect each scene individually
   - Easier than regenerating everything

### Instagram Optimization:

- **Size:** 1080x1920 (9:16 for Reels)
- **Duration:** 6-15 seconds (sweet spot)
- **Text Overlays:** Include the main punchline
- **Audio:** Add trending sounds after export

---

## 🆘 Troubleshooting

**"Vision API failed"**
- Check OpenAI API key in `.env`
- Ensure GPT-4 Vision access on account

**"Video generation taking forever"**
- Sora can take 2-10 minutes per video
- Check status: https://status.openai.com

**"Character doesn't look consistent"**
- Make sure using the SAME character image
- Include character description in every prompt

---

## 📚 More Help

- **Full API Docs:** `README_CREATOR.md`
- **Product Planning:** `PRODUCT_BRAINSTORM.md`
- **Technical Details:** `server.js`

---

## 🎬 What's Next?

### Immediate Improvements:
- [ ] Save character profiles (don't re-upload every time)
- [ ] Video merging (combine multiple scenes)
- [ ] Text overlay tool (add animated text)

### Future Features:
- [ ] Music library integration
- [ ] Direct Instagram upload
- [ ] Template library (pre-made story formats)
- [ ] Batch generation (create 5 memes at once)

---

**Now go create some viral Goblina content! 🧙‍♀️✨**

