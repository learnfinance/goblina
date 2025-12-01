import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import sharp from 'sharp';
import OpenAI from 'openai';
import * as db from './db.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Basic checks
const hasOpenAI = !!process.env.OPENAI_API_KEY;
if (!hasOpenAI) {
  console.warn('⚠️ OPENAI_API_KEY is not set. The Sora video endpoints will fail until this is configured.');
} else {
  console.log('✅ OPENAI_API_KEY found - AI features enabled');
}

// Check for database URL
const hasDatabase = !!process.env.DATABASE_URL;
if (hasDatabase) {
  console.log('✅ DATABASE_URL found - persistence enabled');
} else {
  console.log('⚠️ DATABASE_URL not set - running in stateless mode');
}

// Initialize OpenAI client only if API key is present
let openai = null;
if (hasOpenAI) {
  openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// PASSWORD PROTECTION
// ==========================================
const APP_PASSWORD = process.env.APP_PASSWORD;
const hasPasswordProtection = !!APP_PASSWORD;

if (hasPasswordProtection) {
  console.log('🔒 Password protection ENABLED');
} else {
  console.log('⚠️ No APP_PASSWORD set - app is publicly accessible');
}

// Simple session store (in production, use Redis or database)
const sessions = new Map();

// Generate session token
function generateSessionToken() {
  return Array.from({ length: 32 }, () => 
    Math.random().toString(36).charAt(2)
  ).join('');
}

// Cookie parser middleware
app.use((req, res, next) => {
  const cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = value;
    });
  }
  req.cookies = cookies;
  next();
});

// Auth check middleware
function requireAuth(req, res, next) {
  // Skip auth if no password set
  if (!hasPasswordProtection) {
    return next();
  }

  // Allow login endpoint
  if (req.path === '/api/auth/login' || req.path === '/login.html') {
    return next();
  }

  // Check session
  const sessionToken = req.cookies?.session;
  if (sessionToken && sessions.has(sessionToken)) {
    const session = sessions.get(sessionToken);
    // Check if session is still valid (24 hours)
    if (Date.now() - session.created < 24 * 60 * 60 * 1000) {
      return next();
    }
    sessions.delete(sessionToken);
  }

  // Not authenticated
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
  
  // Redirect to login for HTML pages
  return res.redirect('/login.html');
}

// Login endpoint
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;

  if (!hasPasswordProtection) {
    return res.json({ success: true, message: 'No password required' });
  }

  if (password === APP_PASSWORD) {
    const token = generateSessionToken();
    sessions.set(token, { created: Date.now() });
    
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    return res.json({ success: true });
  }

  return res.status(401).json({ error: 'Invalid password' });
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  const sessionToken = req.cookies?.session;
  if (sessionToken) {
    sessions.delete(sessionToken);
  }
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
  res.json({ success: true });
});

// Check auth status
app.get('/api/auth/status', (req, res) => {
  if (!hasPasswordProtection) {
    return res.json({ authenticated: true, passwordRequired: false });
  }

  const sessionToken = req.cookies?.session;
  const isValid = sessionToken && sessions.has(sessionToken);
  
  res.json({ 
    authenticated: isValid, 
    passwordRequired: true 
  });
});

// Static frontend (with auth for protected pages)
const publicDir = path.join(process.cwd(), 'public');

// Serve login page without auth
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

// Apply auth to all other routes
app.use(requireAuth);
app.use(express.static(publicDir));

// Ensure uploads directory exists
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer setup for image uploads (stored in tmp folder by default)
const upload = multer({ dest: uploadsDir });

// ==========================================
// CHARACTER STYLE GUIDE - Vision API
// ==========================================

/**
 * Analyzes character image using Vision API to extract style guide
 */
app.post('/api/characters/analyze', upload.single('image'), async (req, res) => {
  try {
    // Check if OpenAI is configured
    if (!openai) {
      return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
    }

    const file = req.file;
    const { characterName } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Character image is required.' });
    }

    // Read image and convert to base64
    const imageBuffer = fs.readFileSync(file.path);
    const base64Image = imageBuffer.toString('base64');
    const imageMimeType = file.mimetype || 'image/jpeg';

    // Call Vision API to analyze character
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this character image and extract a detailed style guide. Respond with valid JSON in the following structure:
{
  "character": {
    "appearance": "Detailed physical description (skin color, hair, clothing, accessories, body type)",
    "visualStyle": "Art style (e.g., 3D cartoon, Pixar-like, anime, realistic)",
    "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4"],
    "artisticStyle": "Overall artistic approach (e.g., clean lines, painterly, cel-shaded)",
    "lighting": "Typical lighting style (e.g., soft natural, dramatic, fluorescent office)",
    "details": "Distinctive visual details and textures"
  },
  "personality": {
    "vibe": "Overall personality vibe from visual cues",
    "emotion": "Typical emotional range shown",
    "context": "What scenarios/settings this character fits"
  }
}

Be specific and detailed. Extract actual hex color codes from dominant colors in the image. Return only valid JSON.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${imageMimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
      response_format: { type: 'json_object' }
    });

    const styleGuide = JSON.parse(response.choices[0].message.content);

    // Clean up uploaded file
    fs.unlink(file.path, () => {});

    // Return character profile
    const characterProfile = {
      id: Date.now().toString(),
      name: characterName || 'Unnamed Character',
      imageUrl: null, // We could save this to cloud storage
      styleGuide,
      createdAt: new Date().toISOString()
    };

    res.json(characterProfile);
  } catch (err) {
    console.error('Character analysis error:', err);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Failed to analyze character', details: err.message });
  }
});

// ==========================================
// PERSONALITY PRESETS
// ==========================================

const PERSONALITY_PRESETS = {
  'genz-meme': {
    tone: 'witty',
    pacing: 'fast',
    emotion: 'relatable',
    vibe: 'casual',
    cameraStyle: 'dynamic',
    shotPreference: 'medium-close',
    contentType: 'meme',
    description: 'Quick, punchy, relatable Gen Z meme content'
  },
  'office-humor': {
    tone: 'sarcastic',
    pacing: 'moderate',
    emotion: 'frustrated-funny',
    vibe: 'corporate-casual',
    cameraStyle: 'static-push',
    shotPreference: 'medium',
    contentType: 'meme',
    description: 'Office/work struggles with humor'
  },
  'relationship-real': {
    tone: 'honest',
    pacing: 'moderate',
    emotion: 'genuine',
    vibe: 'conversational',
    cameraStyle: 'handheld',
    shotPreference: 'medium-two-shot',
    contentType: 'dialogue',
    description: 'Honest relationship conversations'
  },
  'life-struggle': {
    tone: 'dramatic-comedic',
    pacing: 'varied',
    emotion: 'chaotic',
    vibe: 'relatable-messy',
    cameraStyle: 'dynamic',
    shotPreference: 'varied',
    contentType: 'meme',
    description: 'Life chaos and struggles, comedic take'
  }
};

app.get('/api/personalities/presets', (req, res) => {
  res.json(PERSONALITY_PRESETS);
});

// ==========================================
// SCENARIO GENERATION
// ==========================================

/**
 * Generates scenario ideas and prompts from a topic/struggle
 * Enhanced with detailed structured prompts matching Example JSON prompt.json format
 */
app.post('/api/scenarios/generate', async (req, res) => {
  try {
    // Check if OpenAI is configured
    if (!openai) {
      return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
    }

    const { 
      topic, 
      characterStyleGuide, 
      personalityPreset = 'genz-meme', 
      sceneCount = 1,
      useStructuredPrompts = true // New: enable detailed structured prompts
    } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const personality = PERSONALITY_PRESETS[personalityPreset] || PERSONALITY_PRESETS['genz-meme'];

    // Build prompt for scenario generation with DETAILED structure
    const systemPrompt = `You are a Gen Z meme content creator expert specializing in creating DETAILED, production-ready video prompts for AI video generation (Sora 2).

CHARACTER DETAILS:
- Name: Ms. Goblina (or custom character)
- Appearance: ${characterStyleGuide?.character?.appearance || 'Green-skinned goblin woman, petite build'}
- Visual Style: ${characterStyleGuide?.character?.visualStyle || '3D cartoon, Pixar-like animation'}
- Signature look: ${characterStyleGuide?.character?.details || 'Casual hoodie, gold bangles and jewelry, expressive face'}
- Color Palette: ${characterStyleGuide?.character?.colorPalette?.join(', ') || '#8BC34A (green), #FF5722 (orange accent), #FFC107 (gold)'}

CONTENT PERSONALITY:
- Tone: ${personality.tone}
- Pacing: ${personality.pacing}  
- Emotion: ${personality.emotion}
- Vibe: ${personality.vibe}
- Camera Style: ${personality.cameraStyle}
- Shot Preference: ${personality.shotPreference}
- Content Type: ${personality.contentType}

Generate ${sceneCount} scenario(s) for the topic: "${topic}"

For EACH scenario, provide this DETAILED structure:

{
  "scenarios": [
    {
      "hook": "One punchy sentence describing the concept",
      "description": "Detailed scene description",
      "duration": 8,
      "dialogue": "Short, punchy dialogue (under 10 words)",
      "textOverlay": "The on-screen caption/punchline",
      
      "subject": {
        "description": "Full character description with action",
        "expression": "Specific facial expression (e.g., 'eyes widening dramatically, jaw dropping')",
        "pose": "Body position",
        "action": "Specific action",
        "clothing": {
          "top": {"type": "hoodie/tank/etc", "color": "specific", "details": "specifics"},
          "bottom": {"type": "jeans/sweats/etc", "color": "specific", "details": "specifics"}
        }
      },
      
      "accessories": {
        "jewelry": {"earrings": "gold hoops", "wrist": "gold bangles"},
        "device": {"type": "laptop/phone", "screen_content": "what's on screen if visible"},
        "prop": {"type": "coffee/food/etc", "details": "specifics"}
      },
      
      "second_character": null OR {
        "description": "Second character full description",
        "role": "manager/boyfriend/friend",
        "action": "what they're doing",
        "speaks": false,
        "reaction": "their silent reaction"
      },
      
      "photography": {
        "camera_style": "${personality.cameraStyle}",
        "shot_type": "${personality.shotPreference}",
        "camera_movement": "push_in/static/tracking (match the emotion)",
        "angle": "eye-level/low/high",
        "composition": "framing details"
      },
      
      "background": {
        "setting": "specific location (dim office/cozy bedroom/bathroom)",
        "elements": ["laptop on desk", "fluorescent lights", "etc"],
        "lighting": "specific lighting (fluorescent office/warm bedroom/harsh bathroom)",
        "atmosphere": "mood description"
      },
      
      "negative_prompt": ["no extra characters", "no blurry text", "etc"],
      
      "prompt": "COMPLETE Sora-ready prompt combining ALL details above into one coherent paragraph. Include: character description, action, dialogue marker, camera work, lighting, style, and negative constraints. This should be COPY-PASTE ready for Sora."
    }
  ]
}

CRITICAL RULES:
1. The "prompt" field must be EXTREMELY detailed and ready to paste into Sora
2. For Ms. Goblina: ALWAYS include green skin, 3D Pixar style, gold bangles
3. Dialogue must be SHORT and PUNCHY - Gen Z style
4. If second character present and shouldn't speak, include "Character X is silent, only reacts" in prompt
5. Include specific camera movements that match the emotional beat
6. Office scenes: fluorescent lighting, desk, laptop
7. Bedroom scenes: warm lighting, cozy elements
8. Bathroom scenes: harsh lighting, mirror reflection`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Topic: ${topic}

Generate ${sceneCount} detailed scenario(s) that are relatable, funny, and perfect for Instagram Reels.

Remember: The "prompt" field should be a COMPLETE, DETAILED paragraph ready to paste into Sora with:
- Full character description (green-skinned goblin, specific clothing, accessories)
- Specific action and dialogue
- Camera movement and shot type  
- Lighting and atmosphere
- Visual style (3D cartoon, Pixar-like)
- Any constraints (e.g., "second character does not speak")

This is for a Gen Z audience so make it relatable and punchy!

IMPORTANT: Respond with valid JSON only.`
        }
      ],
      max_tokens: 3500,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);

    res.json(result);
  } catch (err) {
    console.error('Scenario generation error:', err);
    res.status(500).json({ error: 'Failed to generate scenarios', details: err.message });
  }
});

// ==========================================
// STRUCTURED JSON PROMPT GENERATION
// ==========================================

/**
 * JSON Schema for structured prompts (matches Example JSON prompt.json format)
 * This ensures the AI generates prompts with sufficient detail for high-quality video generation
 */
const STRUCTURED_PROMPT_SCHEMA = {
  subject: {
    description: "Overall description of subject and action",
    character_name: "Ms. Goblina",
    character_type: "3d_animated",
    age: "young adult (20s)",
    expression: "emotional expression",
    pose: "body positioning",
    action: "what they're doing",
    dialogue: "spoken words if any",
    body: {
      skin_tone: "green-skinned",
      build: "description"
    },
    hair: {
      color: "color",
      style: "style description"
    },
    clothing: {
      top: { type: "", color: "", details: "" },
      bottom: { type: "", color: "", details: "" }
    },
    face: {
      preserve_original: true,
      makeup: "makeup description"
    }
  },
  accessories: {
    headwear: { type: "", details: "" },
    jewelry: { earrings: "", necklace: "", wrist: "", rings: "" },
    device: { type: "", details: "", screen_content: "" },
    prop: { type: "", details: "" }
  },
  photography: {
    camera_style: "dynamic/static/handheld",
    angle: "eye-level/low/high",
    shot_type: "medium/close_up/wide",
    shot_composition: "framing details",
    camera_movement: "push_in/static/tracking",
    aspect_ratio: "9:16",
    texture: "visual quality",
    visual_style: "3D cartoon Pixar-like"
  },
  background: {
    setting: "location type",
    setting_details: "specific details",
    elements: [],
    atmosphere: "mood/vibe",
    lighting: "lighting setup"
  },
  video_specific: {
    duration_seconds: 8,
    pacing: "fast/moderate/slow",
    motion_intensity: "moderate",
    text_overlay: "on-screen text"
  },
  negative_prompt: ["things to avoid"]
};

/**
 * Generates a detailed structured JSON prompt from a topic/idea
 * This matches the level of detail in Example JSON prompt.json
 */
app.post('/api/prompts/structured', async (req, res) => {
  try {
    // Check if OpenAI is configured
    if (!openai) {
      return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
    }

    const { 
      topic, 
      characterStyleGuide, 
      personalityPreset = 'genz-meme',
      includeSecondCharacter = false,
      secondCharacterDescription = null
    } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const personality = PERSONALITY_PRESETS[personalityPreset] || PERSONALITY_PRESETS['genz-meme'];

    // Build detailed system prompt for structured JSON generation
    const systemPrompt = `You are an expert video prompt engineer for AI video generation (Sora 2). 
Your task is to create EXTREMELY DETAILED structured JSON prompts.

CHARACTER STYLE GUIDE (if provided):
${characterStyleGuide ? JSON.stringify(characterStyleGuide, null, 2) : 'Default: Ms. Goblina - green-skinned goblin woman, 3D Pixar-like cartoon style, casual hoodie, gold bangles'}

PERSONALITY CONFIG:
- Tone: ${personality.tone}
- Pacing: ${personality.pacing}
- Emotion: ${personality.emotion}
- Vibe: ${personality.vibe}
- Camera Style: ${personality.cameraStyle}
- Shot Preference: ${personality.shotPreference}

${includeSecondCharacter && secondCharacterDescription ? `SECOND CHARACTER: ${secondCharacterDescription}` : ''}

Generate a DETAILED structured JSON prompt following this EXACT schema:

{
  "subject": {
    "description": "Full description of the main character and what they're doing in the scene",
    "character_name": "Ms. Goblina",
    "character_type": "3d_animated",
    "age": "young adult (20s-30s)",
    "expression": "Specific facial expression (e.g., 'eyes widening dramatically, jaw dropping, scrunched nose')",
    "pose": "Body positioning and gesture",
    "action": "Specific action being performed",
    "dialogue": "Exact spoken words if any (keep short and punchy for memes)",
    "body": {
      "skin_tone": "green-skinned",
      "build": "petite/average"
    },
    "hair": {
      "color": "specific color",
      "style": "specific style (e.g., 'messy bun with loose strands')"
    },
    "clothing": {
      "top": {
        "type": "specific garment type (e.g., 'oversized hoodie', 'cropped tank')",
        "color": "specific color",
        "details": "specific details (e.g., 'hood up, sleeves pulled over hands')"
      },
      "bottom": {
        "type": "specific garment",
        "color": "specific color",
        "details": "specific details"
      }
    },
    "face": {
      "preserve_original": true,
      "features": "Any notable facial features to emphasize"
    }
  },
  "accessories": {
    "jewelry": {
      "earrings": "specific jewelry (e.g., 'large gold hoop earrings')",
      "necklace": "specific necklace",
      "wrist": "specific wrist items (e.g., 'gold bangles and bracelets mixed')",
      "rings": "ring details"
    },
    "device": {
      "type": "device type if relevant (e.g., 'laptop', 'smartphone')",
      "details": "device specifics",
      "screen_content": "what's on screen if visible (e.g., 'Slack message saying Quick question')"
    },
    "prop": {
      "type": "any prop character interacts with",
      "details": "prop specifics"
    }
  },
  "second_character": ${includeSecondCharacter ? `{
    "description": "Full description of second character",
    "role": "their role (e.g., 'manager', 'boyfriend')",
    "action": "what they're doing",
    "speaks": false,
    "reaction": "their reaction (e.g., 'startled expression, brief blink, silent eye-roll')"
  }` : 'null'},
  "photography": {
    "camera_style": "specific style (e.g., 'smartphone_selfie', 'cinematic', 'documentary')",
    "angle": "specific angle (e.g., 'eye-level', 'low angle looking up', 'over-the-shoulder')",
    "shot_type": "specific shot (e.g., 'medium_close', 'close_up', 'two_shot')",
    "shot_composition": "framing details (e.g., 'subject positioned right of frame, negative space left')",
    "camera_movement": "specific movement (e.g., 'push_in from medium to close-up during dialogue', 'static', 'slight handheld shake')",
    "aspect_ratio": "9:16",
    "texture": "visual quality (e.g., 'sharp focus, clean details, social media aesthetic')",
    "visual_style": "3D cartoon, Pixar-like, vibrant colors, clean lines"
  },
  "background": {
    "setting": "specific location (e.g., 'dim open-plan office', 'cozy bedroom', 'office bathroom')",
    "setting_details": "more specifics about the location",
    "elements": [
      "list of specific background elements",
      "e.g., 'laptop on desk'",
      "e.g., 'fluorescent lights overhead'",
      "e.g., 'coworkers blurred in background'"
    ],
    "atmosphere": "mood (e.g., 'corporate casual', 'cozy intimate', 'chaotic')",
    "lighting": "specific lighting (e.g., 'fluorescent office lighting, soft shadows', 'warm golden hour through window')"
  },
  "video_specific": {
    "duration_seconds": 6-15,
    "pacing": "fast/moderate/slow",
    "motion_intensity": "minimal/moderate/dynamic",
    "text_overlay": "on-screen text/caption if any (the punchline)",
    "text_position": "where text appears"
  },
  "negative_prompt": [
    "things to explicitly avoid",
    "e.g., 'no extra characters'",
    "e.g., 'no blurry faces'",
    "e.g., 'no second voice if second character present'"
  ],
  "sora_prompt_text": "The FULL text prompt to send to Sora, combining ALL the above details into a coherent paragraph. Include character description, action, dialogue, camera work, lighting, and style."
}

IMPORTANT RULES:
1. Be EXTREMELY specific - vague prompts produce poor results
2. For Ms. Goblina, ALWAYS include: green skin, 3D cartoon/Pixar style, gold bangles
3. For office scenes: include fluorescent lighting, desk, laptop
4. For meme content: keep dialogue SHORT and PUNCHY (under 10 words ideal)
5. Camera work should match the ${personality.cameraStyle} style
6. Pacing should be ${personality.pacing}
7. Include negative prompts to avoid common AI mistakes
8. The sora_prompt_text should be a COMPLETE, ready-to-use prompt`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Create a detailed structured prompt for this meme/content idea: "${topic}"
          
Make sure the prompt captures the Gen Z relatable vibe and includes specific visual details that will make this content engaging for Instagram Reels.

IMPORTANT: Respond with valid JSON only.`
        }
      ],
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    });

    const structuredPrompt = JSON.parse(response.choices[0].message.content);

    res.json({
      success: true,
      structuredPrompt,
      // Also provide a flattened text version for direct Sora use
      soraPrompt: structuredPrompt.sora_prompt_text || flattenPromptToText(structuredPrompt)
    });
  } catch (err) {
    console.error('Structured prompt generation error:', err);
    res.status(500).json({ error: 'Failed to generate structured prompt', details: err.message });
  }
});

/**
 * Helper function to flatten structured prompt to text
 */
function flattenPromptToText(prompt) {
  const parts = [];
  
  // Subject
  if (prompt.subject) {
    parts.push(prompt.subject.description);
    if (prompt.subject.dialogue) {
      parts.push(`Character says: "${prompt.subject.dialogue}"`);
    }
  }
  
  // Second character
  if (prompt.second_character) {
    parts.push(prompt.second_character.description);
    if (prompt.second_character.reaction) {
      parts.push(`They react: ${prompt.second_character.reaction}`);
    }
    if (!prompt.second_character.speaks) {
      parts.push('Second character does not speak.');
    }
  }
  
  // Photography
  if (prompt.photography) {
    const p = prompt.photography;
    parts.push(`${p.shot_type} shot, ${p.camera_movement} camera movement.`);
    parts.push(`${p.visual_style}.`);
  }
  
  // Background
  if (prompt.background) {
    parts.push(`Setting: ${prompt.background.setting}.`);
    parts.push(`Lighting: ${prompt.background.lighting}.`);
    parts.push(`Atmosphere: ${prompt.background.atmosphere}.`);
  }
  
  // Negative
  if (prompt.negative_prompt && prompt.negative_prompt.length > 0) {
    parts.push(`Avoid: ${prompt.negative_prompt.join(', ')}.`);
  }
  
  return parts.join(' ');
}

// ==========================================
// STORYBOARD GENERATION
// ==========================================

/**
 * Takes a story/narrative and breaks it into scenes with prompts
 */
app.post('/api/storyboard', async (req, res) => {
  try {
    // Check if OpenAI is configured
    if (!openai) {
      return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
    }

    const { story, characterStyleGuide, personalityPreset = 'genz-meme', targetDuration = 15 } = req.body;

    if (!story) {
      return res.status(400).json({ error: 'Story is required' });
    }

    const personality = PERSONALITY_PRESETS[personalityPreset] || PERSONALITY_PRESETS['genz-meme'];

    const systemPrompt = `You are an AI video director. Break down stories into scenes for video generation.

Character Style: ${JSON.stringify(characterStyleGuide?.character || {})}
Personality: ${personality.description}
Target Duration: ${targetDuration} seconds
Camera Style: ${personality.cameraStyle}
Shot Preference: ${personality.shotPreference}

Break the story into scenes. Each scene should:
- Be 3-8 seconds long
- Have clear visual action
- Maintain character consistency
- Include detailed Sora prompt with character description, action, camera movement, lighting

Return JSON:
{
  "scenes": [
    {
      "order": 1,
      "description": "What happens",
      "duration": 5,
      "prompt": "Detailed Sora prompt with character style, action, camera, lighting",
      "dialogue": "Optional spoken words",
      "textOverlay": "Optional text to display"
    }
  ],
  "totalDuration": 15
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `${story}

IMPORTANT: Respond with valid JSON only.`
        }
      ],
      max_tokens: 2500,
      response_format: { type: 'json_object' }
    });

    const storyboard = JSON.parse(response.choices[0].message.content);

    res.json(storyboard);
  } catch (err) {
    console.error('Storyboard generation error:', err);
    res.status(500).json({ error: 'Failed to generate storyboard', details: err.message });
  }
});

// ==========================================
// VIDEO GENERATION (existing + enhanced)
// ==========================================

// Valid Sora video sizes
const VALID_SORA_SIZES = [
  { width: 720, height: 1280, ratio: 9/16, name: '720x1280' },   // Portrait (9:16)
  { width: 1280, height: 720, ratio: 16/9, name: '1280x720' },   // Landscape (16:9)
  { width: 1024, height: 1792, ratio: 9/16, name: '1024x1792' }, // Tall portrait
  { width: 1792, height: 1024, ratio: 16/9, name: '1792x1024' }  // Wide landscape
];

// Map any size to nearest valid Sora size
function mapToValidSoraSize(requestedSize) {
  // Parse requested size
  const [width, height] = requestedSize.split('x').map(Number);
  
  if (!width || !height) {
    return '720x1280'; // Default to portrait
  }

  const requestedRatio = width / height;
  const isPortrait = height > width;

  // Find closest match by aspect ratio and orientation
  let bestMatch = VALID_SORA_SIZES[0];
  let smallestDiff = Math.abs(requestedRatio - bestMatch.ratio);

  for (const validSize of VALID_SORA_SIZES) {
    const validIsPortrait = validSize.height > validSize.width;
    
    // Prefer same orientation
    if (validIsPortrait !== isPortrait) continue;
    
    const diff = Math.abs(requestedRatio - validSize.ratio);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      bestMatch = validSize;
    }
  }

  return bestMatch.name;
}

// Helper to call OpenAI Sora video API
async function callOpenAIVideoCreate({ prompt, model, seconds, size, imagePath, imageMime, imageOriginalName }) {
  const form = new FormData();
  if (prompt) form.append('prompt', prompt);
  form.append('model', model || 'sora-2');
  if (seconds) form.append('seconds', String(seconds));
  
  // Ensure size is valid
  const validSize = mapToValidSoraSize(size || '720x1280');
  form.append('size', validSize);

  if (imagePath) {
    const fileStream = fs.createReadStream(imagePath);
    form.append('input_reference', fileStream, {
      filename: imageOriginalName || path.basename(imagePath),
      contentType: imageMime || 'image/jpeg',
      knownLength: fs.statSync(imagePath).size
    });
  }

  const response = await fetch('https://api.openai.com/v1/videos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      ...form.getHeaders()
    },
    body: form
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI video create failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

// Image upload + generate route
app.post('/api/generate', upload.single('image'), async (req, res) => {
  let processedImagePath = null;
  try {
    // Check if OpenAI is configured
    if (!hasOpenAI) {
      return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
    }

    const { prompt, model, seconds, size } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Image file is required.' });
    }

    // Detect image dimensions
    const imageMetadata = await sharp(file.path).metadata();
    const imageWidth = imageMetadata.width;
    const imageHeight = imageMetadata.height;

    // Determine target size and map to valid Sora size
    let requestedSize = size;
    if (!requestedSize && imageWidth && imageHeight) {
      // Auto-detect: use image dimensions
      requestedSize = `${imageWidth}x${imageHeight}`;
    } else if (!requestedSize) {
      // Fallback to portrait format (good for Instagram Reels)
      requestedSize = '720x1280';
    }

    // Map to valid Sora size
    const targetSize = mapToValidSoraSize(requestedSize);

    // Parse target size
    const [targetWidth, targetHeight] = targetSize.split('x').map(Number);

    // If image dimensions don't match target, resize the image
    if (imageWidth !== targetWidth || imageHeight !== targetHeight) {
      processedImagePath = path.join('uploads', `resized_${Date.now()}_${path.basename(file.path)}`);
      await sharp(file.path)
        .resize(targetWidth, targetHeight, {
          fit: 'fill',
          withoutEnlargement: false
        })
        .toFile(processedImagePath);
    } else {
      processedImagePath = file.path;
    }

    const videoJob = await callOpenAIVideoCreate({
      prompt,
      model,
      seconds: seconds || 8,
      size: targetSize,
      imagePath: processedImagePath,
      imageMime: file.mimetype,
      imageOriginalName: file.originalname
    });

    // Clean up uploaded files asynchronously
    fs.unlink(file.path, () => {});
    if (processedImagePath !== file.path) {
      fs.unlink(processedImagePath, () => {});
    }

    res.json(videoJob);
  } catch (err) {
    console.error(err);
    // Clean up on error
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    if (processedImagePath && processedImagePath !== req.file?.path) {
      fs.unlink(processedImagePath, () => {});
    }
    res.status(500).json({ error: 'Failed to start video generation', details: err.message });
  }
});

// Poll status for a given video id with retry logic
app.get('/api/status/:id', async (req, res) => {
  // Check if OpenAI is configured
  if (!hasOpenAI) {
    return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
  }

  const { id } = req.params;
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    const response = await fetch(`https://api.openai.com/v1/videos/${id}`, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
        const errorData = JSON.parse(errorText);
        
        // If it's a 500 error, retry
        if (response.status === 500 || response.status === 502 || response.status === 503) {
          lastError = new Error(`OpenAI server error (${response.status}), attempt ${attempt}/${maxRetries}`);
          console.warn(`Attempt ${attempt}/${maxRetries} failed:`, errorData.error?.message || errorText);
          
          if (attempt < maxRetries) {
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
        }
        
      throw new Error(`OpenAI video retrieve failed (${response.status}): ${errorText}`);
    }

    const json = await response.json();
      return res.json(json);
  } catch (err) {
      lastError = err;
      
      // If network error or temporary issue, retry
      if (attempt < maxRetries && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
        console.warn(`Network error on attempt ${attempt}/${maxRetries}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      
      // If it's the last attempt or a non-retryable error, fail
      if (attempt === maxRetries) {
        console.error('All retry attempts failed:', err);
        return res.status(500).json({ 
          error: 'Failed to retrieve video status after multiple attempts',
          details: err.message,
          retryable: true,
          suggestion: 'OpenAI servers may be experiencing issues. Please try again in a few moments.'
        });
      }
    }
  }

  // Fallback if loop exits without returning
  res.status(500).json({ 
    error: 'Failed to retrieve video status',
    details: lastError?.message || 'Unknown error',
    retryable: true
  });
});

// Download / stream completed video
app.get('/api/download/:id', async (req, res) => {
  // Check if OpenAI is configured
  if (!hasOpenAI) {
    return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
  }

  try {
    const { id } = req.params;
    const variant = req.query.variant || 'video';

    const response = await fetch(`https://api.openai.com/v1/videos/${id}/content?variant=${variant}`, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI video download failed (${response.status}): ${errorText}`);
    }

    // Pipe headers
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="${id}.mp4"`);

    response.body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download video content', details: err.message });
  }
});

// Remix an existing video
app.post('/api/remix', async (req, res) => {
  // Check if OpenAI is configured
  if (!hasOpenAI) {
    return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
  }

  try {
    const { videoId, prompt } = req.body;
    if (!videoId || !prompt) {
      return res.status(400).json({ error: 'videoId and prompt are required for remix.' });
    }

    const response = await fetch(`https://api.openai.com/v1/videos/${videoId}/remix`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI video remix failed (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    res.json(json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start remix job', details: err.message });
  }
});

// Fallback to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ==========================================
// DATABASE PERSISTENCE ENDPOINTS
// ==========================================

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: hasDatabase ? await db.healthCheck() : { status: 'disabled' },
    openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing'
  };
  res.json(health);
});

// Character persistence endpoints (only if database is configured)
if (hasDatabase) {
  // List all saved characters
  app.get('/api/characters', async (req, res) => {
    try {
      const characters = await db.listCharacters();
      res.json(characters);
    } catch (err) {
      console.error('Error listing characters:', err);
      res.status(500).json({ error: 'Failed to list characters', details: err.message });
    }
  });

  // Get a specific character
  app.get('/api/characters/:id', async (req, res) => {
    try {
      const character = await db.getCharacter(req.params.id);
      if (!character) {
        return res.status(404).json({ error: 'Character not found' });
      }
      res.json(character);
    } catch (err) {
      console.error('Error getting character:', err);
      res.status(500).json({ error: 'Failed to get character', details: err.message });
    }
  });

  // Save a character (called after analysis)
  app.post('/api/characters/save', async (req, res) => {
    try {
      const { id, name, styleGuide, imageUrl } = req.body;
      if (!id || !name) {
        return res.status(400).json({ error: 'id and name are required' });
      }
      const character = await db.saveCharacter(id, name, styleGuide, imageUrl);
      res.json(character);
    } catch (err) {
      console.error('Error saving character:', err);
      res.status(500).json({ error: 'Failed to save character', details: err.message });
    }
  });

  // Delete a character
  app.delete('/api/characters/:id', async (req, res) => {
    try {
      await db.deleteCharacter(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting character:', err);
      res.status(500).json({ error: 'Failed to delete character', details: err.message });
    }
  });

  // Project persistence endpoints
  app.get('/api/projects', async (req, res) => {
    try {
      const { characterId } = req.query;
      const projects = await db.listProjects(characterId);
      res.json(projects);
    } catch (err) {
      console.error('Error listing projects:', err);
      res.status(500).json({ error: 'Failed to list projects', details: err.message });
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    try {
      const project = await db.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project);
    } catch (err) {
      console.error('Error getting project:', err);
      res.status(500).json({ error: 'Failed to get project', details: err.message });
    }
  });

  app.post('/api/projects/save', async (req, res) => {
    try {
      const { id, characterId, topic, personalityPreset, scenarios } = req.body;
      if (!id || !topic) {
        return res.status(400).json({ error: 'id and topic are required' });
      }
      const project = await db.saveProject(id, characterId, topic, personalityPreset, scenarios);
      res.json(project);
    } catch (err) {
      console.error('Error saving project:', err);
      res.status(500).json({ error: 'Failed to save project', details: err.message });
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      await db.deleteProject(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting project:', err);
      res.status(500).json({ error: 'Failed to delete project', details: err.message });
    }
  });

  // Prompt library endpoints
  app.get('/api/prompts/library', async (req, res) => {
    try {
      const { category, search } = req.query;
      let prompts;
      if (search) {
        prompts = await db.searchPromptLibrary(search);
      } else {
        prompts = await db.listPromptsFromLibrary(category);
      }
      res.json(prompts);
    } catch (err) {
      console.error('Error listing prompts:', err);
      res.status(500).json({ error: 'Failed to list prompts', details: err.message });
    }
  });

  app.post('/api/prompts/library/save', async (req, res) => {
    try {
      const { id, name, category, structuredPrompt, textPrompt, tags } = req.body;
      if (!id || !name || !category) {
        return res.status(400).json({ error: 'id, name, and category are required' });
      }
      const prompt = await db.savePromptToLibrary(id, name, category, structuredPrompt, textPrompt, tags);
      res.json(prompt);
    } catch (err) {
      console.error('Error saving prompt:', err);
      res.status(500).json({ error: 'Failed to save prompt', details: err.message });
    }
  });

  app.get('/api/prompts/library/:id', async (req, res) => {
    try {
      const prompt = await db.getPromptFromLibrary(req.params.id);
      if (!prompt) {
        return res.status(404).json({ error: 'Prompt not found' });
      }
      res.json(prompt);
    } catch (err) {
      console.error('Error getting prompt:', err);
      res.status(500).json({ error: 'Failed to get prompt', details: err.message });
    }
  });

  // Video tracking endpoints
  app.get('/api/videos', async (req, res) => {
    try {
      const { projectId } = req.query;
      const videos = await db.listVideos(projectId);
      res.json(videos);
    } catch (err) {
      console.error('Error listing videos:', err);
      res.status(500).json({ error: 'Failed to list videos', details: err.message });
    }
  });

  app.get('/api/videos/:id', async (req, res) => {
    try {
      const video = await db.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }
      res.json(video);
    } catch (err) {
      console.error('Error getting video:', err);
      res.status(500).json({ error: 'Failed to get video', details: err.message });
    }
  });
}

// ==========================================
// START SERVER
// ==========================================

async function startServer() {
  // Initialize database if configured
  if (hasDatabase) {
    try {
      await db.initDatabase();
      console.log('✅ Database initialized');
    } catch (err) {
      console.error('❌ Failed to initialize database:', err);
      console.log('⚠️ Continuing without database persistence...');
    }
  }

app.listen(port, () => {
    console.log(`\n🎬 Ms. Goblina Content Creator`);
    console.log(`   Server running on http://localhost:${port}`);
    console.log(`   Database: ${hasDatabase ? 'Connected' : 'Not configured'}`);
    console.log(`   OpenAI: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured'}\n`);
});
}

startServer();
