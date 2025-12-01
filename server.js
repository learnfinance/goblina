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
import { v2 as cloudinary } from 'cloudinary';
import { GoogleGenAI } from '@google/genai';
import * as db from './db.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// CLOUDINARY CONFIGURATION
// ==========================================
const hasCloudinary = !!(
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('☁️ Cloudinary configured - image storage enabled');
} else {
  console.log('⚠️ Cloudinary not configured - images will not be stored permanently');
}

/**
 * Upload image to Cloudinary
 * @param {string} filePath - Path to the image file
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<string|null>} - Image URL or null if failed
 */
async function uploadToCloudinary(filePath, folder = 'goblina-characters') {
  if (!hasCloudinary) return null;
  
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'image',
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 'auto' }
      ]
    });
    return result.secure_url;
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    return null;
  }
}

/**
 * Upload video to Cloudinary from URL
 * @param {string} videoUrl - URL of the video to upload
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<{url: string, publicId: string}|null>} - Video URL and ID or null if failed
 */
async function uploadVideoToCloudinary(videoUrl, folder = 'goblina-videos') {
  if (!hasCloudinary) {
    console.log('⚠️ Cloudinary not configured - video will not be permanently stored');
    return null;
  }
  
  try {
    console.log('☁️ Uploading video to Cloudinary...');
    const result = await cloudinary.uploader.upload(videoUrl, {
      folder: folder,
      resource_type: 'video',
      eager: [
        { format: 'mp4', video_codec: 'h264' }
      ],
      eager_async: true
    });
    console.log('☁️ Video uploaded successfully:', result.secure_url);
    return {
      url: result.secure_url,
      publicId: result.public_id,
      duration: result.duration,
      format: result.format,
      bytes: result.bytes
    };
  } catch (err) {
    console.error('Cloudinary video upload error:', err);
    return null;
  }
}

/**
 * Upload video to Cloudinary from local file
 * @param {string} filePath - Path to the video file
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<{url: string, publicId: string}|null>}
 */
async function uploadVideoFileToCloudinary(filePath, folder = 'goblina-videos') {
  if (!hasCloudinary) return null;
  
  try {
    console.log('☁️ Uploading video file to Cloudinary...');
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'video'
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      duration: result.duration
    };
  } catch (err) {
    console.error('Cloudinary video file upload error:', err);
    return null;
  }
}

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

// ==========================================
// GOOGLE GENAI (NANO BANANA) CONFIGURATION
// ==========================================
const hasGoogleAI = !!process.env.GOOGLE_AI_API_KEY;
let googleAI = null;

if (hasGoogleAI) {
  googleAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  console.log('🍌 Google AI (Nano Banana) configured - image generation enabled');
} else {
  console.log('⚠️ GOOGLE_AI_API_KEY not set - Nano Banana image generation disabled');
}

// Valid aspect ratios for Nano Banana
const NANO_BANANA_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const NANO_BANANA_RESOLUTIONS = ['1K', '2K', '4K'];

/**
 * Build a detailed character description for high-fidelity preservation
 * This ensures the character's appearance is consistently described in every prompt
 * 
 * @param {object} styleGuide - The character's style guide from analysis
 * @param {string} characterName - The character's name
 * @param {boolean} hasReferenceImage - Whether a reference image is being provided
 * @returns {string} - Detailed character description block
 */
function buildDetailedCharacterDescription(styleGuide, characterName = 'Ms. Goblina', hasReferenceImage = false) {
  // Strong reference image instruction if provided
  const referenceInstruction = hasReferenceImage ? `
**REFERENCE IMAGE PROVIDED - CRITICAL:**
A reference image of this character is attached. You MUST:
1. Match the EXACT skin tone and color from the reference
2. Preserve the EXACT facial structure and features
3. Keep the SAME art style and rendering quality
4. Maintain all signature accessories (earrings, bangles)
5. The generated image should look like it's from the SAME animation/series
` : '';

  if (!styleGuide) {
    // Default Ms. Goblina description for consistent character preservation
    return `${referenceInstruction}
CHARACTER DESCRIPTION (preserve these exact details):
Name: ${characterName}
Species: Animated goblin woman with GREEN SKIN (this is mandatory - she is a goblin)
Skin: Vibrant emerald/lime green skin tone - NOT human skin color, she is a green goblin
Face: Expressive large eyes with dark pupils, small pointed goblin nose, wide mouth capable of exaggerated expressions, pointed goblin ears
Build: Petite, feminine figure with stylized cartoon proportions
Hair: Dark hair (black or very dark brown), usually styled casually or in a messy bun
Signature Features: Gold hoop earrings, multiple gold bangles and bracelets on wrists, casual modern clothing (hoodies, tank tops)
Art Style: 3D Pixar/DreamWorks-quality animated character, smooth rendered surfaces, soft cinematic lighting, cartoon proportions
Expression Style: Highly expressive, emotive, capable of exaggerated comedic reactions

MANDATORY CHARACTER TRAITS:
- GREEN SKIN (goblin character - this cannot be changed)
- Gold jewelry (earrings + wrist bangles)  
- 3D cartoon animation style (NOT realistic, NOT 2D)
- Young adult female goblin`;
  }

  const char = styleGuide.character || {};
  const acc = styleGuide.accessories || {};
  const colorPalette = char.colorPalette || [];
  
  // Try to extract skin color from palette (usually first green)
  const skinColor = colorPalette.find(c => c?.toLowerCase().includes('green') || c?.toLowerCase().includes('8bc') || c?.toLowerCase().includes('4caf')) || '#8BC34A';
  
  return `${referenceInstruction}
CHARACTER DESCRIPTION (preserve these exact details):
Name: ${characterName}
Physical Appearance: ${char.appearance || 'Green-skinned goblin woman, petite feminine build'}
Skin: ${char.body?.skin_tone || `GREEN SKIN - specific hex: ${skinColor} - this is a goblin character`}
Face: ${char.face?.description || 'Expressive large eyes, small pointed goblin nose, wide expressive mouth, pointed goblin ears'}
Hair: ${char.hair?.color || 'Dark'} hair, ${char.hair?.style || 'casual/messy style'}
Build: ${char.body?.build || 'Petite, feminine figure with stylized cartoon proportions'}
Signature Jewelry: ${acc.jewelry?.earrings || 'Gold hoop earrings'}, ${acc.jewelry?.wrist || 'gold bangles and bracelets on wrists'}
Clothing Style: ${char.details || 'Casual modern Gen-Z clothing - hoodies, tank tops, comfortable athleisure'}
Art Style: ${char.visualStyle || '3D Pixar/DreamWorks-quality animated character, smooth surfaces, soft lighting'}
Color Palette: ${colorPalette.join(', ') || '#8BC34A (green skin), #FFD700 (gold accents), warm earth tones'}
Expression Style: Highly expressive, emotive, exaggerated cartoon reactions

MANDATORY - DO NOT CHANGE:
- GREEN SKIN TONE (she is a goblin, not a human)
- Gold jewelry accessories
- 3D animated cartoon style (Pixar/DreamWorks quality)
- Consistent facial features across all images`;
}

/**
 * Enhance a prompt with best practices for Nano Banana image generation
 * - Hyper-specific details
 * - Context and intent
 * - Step-by-step structure for complex scenes
 * - Semantic negative prompts (positive descriptions)
 * - Camera/composition language
 * 
 * @param {string} basePrompt - The original prompt
 * @param {object} options - Enhancement options
 * @returns {string} - Enhanced prompt
 */
function enhancePromptForNanoBanana(basePrompt, options = {}) {
  const {
    characterDescription = '',
    scene = {},
    aspectRatio = '9:16',
    intent = 'social media content',
    hasReferenceImage = false
  } = options;

  // Determine camera language based on aspect ratio
  const cameraLanguage = {
    '9:16': 'vertical mobile-first composition, portrait orientation optimized for Instagram Reels/TikTok',
    '16:9': 'cinematic widescreen composition, landscape orientation for YouTube/desktop',
    '1:1': 'square composition, centered framing optimized for Instagram feed'
  }[aspectRatio] || 'balanced composition';

  // Build step-by-step structured prompt
  const parts = [];

  // PRIORITY 1: Reference Image Instruction (if provided)
  if (hasReferenceImage) {
    parts.push(`**CRITICAL - REFERENCE IMAGE ATTACHED**
You have been given a reference image of the character. 
You MUST generate an image where:
1. The character looks IDENTICAL to the reference - same face, same skin color, same style
2. The character's GREEN SKIN TONE must match exactly
3. All accessories (gold earrings, bangles) must be present
4. The art style/rendering must be consistent with the reference
5. This should look like a NEW SCENE from the SAME animation/cartoon series`);
  }

  // Step 1: Context and Intent
  parts.push(`CONTEXT: Creating ${intent} featuring an animated GOBLIN character with GREEN SKIN. 
Style: Modern 3D animation (Pixar/DreamWorks quality).
Character Type: Cartoon goblin woman - NOT a human, has GREEN SKIN.`);

  // Step 2: Character (HIGH PRIORITY - preserve details)
  if (characterDescription) {
    parts.push(characterDescription);
  }

  // Step 3: Scene Description
  parts.push(`SCENE ACTION: ${basePrompt}

IMPORTANT: The character in this scene is the SAME character from the reference image.
- Keep her GREEN SKIN
- Keep her gold jewelry (hoop earrings, bangles)
- Keep the 3D cartoon art style`);

  // Step 4: Camera and Composition
  const cameraDetails = scene.photography || {};
  parts.push(`
CAMERA & COMPOSITION:
- Framing: ${cameraLanguage}
- Shot Type: ${cameraDetails.shot_type || 'medium shot focusing on character'}
- Angle: ${cameraDetails.angle || 'eye-level, engaging perspective'}
- Lighting: ${scene.background?.lighting || 'soft, flattering lighting that highlights the character'}
- Depth: Clear foreground focus with slightly blurred background for depth
- Focus: Character is the hero of the shot`);

  // Step 5: Quality Directives (positive semantic descriptions instead of negative prompts)
  parts.push(`
QUALITY DIRECTIVES:
- Render with clean, professional quality suitable for social media
- Character should be the clear focal point with GREEN GOBLIN SKIN
- Background should complement but not distract from the character
- CONSISTENT ART STYLE: 3D animated cartoon only (no realistic mixing)
- Character's skin MUST be green (she is a goblin, not human)
- All signature accessories must be visible (gold earrings, bangles)

DO NOT:
- Change the skin color to human/realistic tones
- Mix 2D and 3D styles
- Omit the character's signature jewelry
- Change the character's facial structure`);

  return parts.join('\n\n');
}

/**
 * Generate image using Google's Nano Banana (Gemini Image Model)
 * @param {object} options - Generation options
 * @param {string} options.prompt - The image prompt
 * @param {string} options.aspectRatio - Aspect ratio (9:16, 16:9, 1:1, etc.)
 * @param {string} options.resolution - Resolution (1K, 2K, 4K)
 * @param {string[]} options.referenceImages - Array of base64 images or URLs for character consistency
 * @param {string} options.model - Model to use (gemini-2.5-flash-image or gemini-3-pro-image-preview)
 * @returns {Promise<{imageBase64: string, mimeType: string, text?: string}>}
 */
async function generateNanoBananaImage(options) {
  if (!googleAI) {
    throw new Error('Google AI not configured. Set GOOGLE_AI_API_KEY environment variable.');
  }

  const {
    prompt,
    aspectRatio = '9:16',
    resolution = '2K',
    referenceImages = [],
    model = 'gemini-2.5-flash-image' // Fast model by default
  } = options;

  // Validate aspect ratio
  if (!NANO_BANANA_ASPECT_RATIOS.includes(aspectRatio)) {
    throw new Error(`Invalid aspect ratio: ${aspectRatio}. Valid options: ${NANO_BANANA_ASPECT_RATIOS.join(', ')}`);
  }

  // Validate resolution
  if (!NANO_BANANA_RESOLUTIONS.includes(resolution)) {
    throw new Error(`Invalid resolution: ${resolution}. Valid options: ${NANO_BANANA_RESOLUTIONS.join(', ')}`);
  }

  // Build content parts
  const contentParts = [prompt];

  // Add reference images for character consistency (up to 5 for humans)
  for (const refImage of referenceImages.slice(0, 5)) {
    if (refImage.startsWith('data:')) {
      // Base64 data URL
      const [header, base64Data] = refImage.split(',');
      const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
      contentParts.push({
        inlineData: {
          mimeType,
          data: base64Data
        }
      });
    } else if (refImage.startsWith('http')) {
      // URL - fetch and convert to base64
      try {
        const response = await fetch(refImage);
        const buffer = Buffer.from(await response.arrayBuffer());
        const mimeType = response.headers.get('content-type') || 'image/png';
        contentParts.push({
          inlineData: {
            mimeType,
            data: buffer.toString('base64')
          }
        });
      } catch (err) {
        console.warn('Failed to fetch reference image:', refImage, err.message);
      }
    }
  }

  console.log(`🍌 Generating image with Nano Banana (${model})...`);
  console.log(`   Aspect ratio: ${aspectRatio}, Resolution: ${resolution}`);
  console.log(`   Reference images: ${referenceImages.length}`);

  const response = await googleAI.models.generateContent({
    model,
    contents: contentParts,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio,
        imageSize: resolution
      }
    }
  });

  // Extract result
  const result = {
    imageBase64: null,
    mimeType: null,
    text: null
  };

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.text) {
      result.text = part.text;
    } else if (part.inlineData) {
      result.imageBase64 = part.inlineData.data;
      result.mimeType = part.inlineData.mimeType || 'image/png';
    }
  }

  if (!result.imageBase64) {
    throw new Error('No image generated. The model may have refused or returned empty.');
  }

  console.log('🍌 Image generated successfully!');
  return result;
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

    // Upload to Cloudinary if configured (before cleaning up local file)
    let imageUrl = null;
    if (hasCloudinary) {
      imageUrl = await uploadToCloudinary(file.path);
      console.log('☁️ Character image uploaded:', imageUrl ? 'success' : 'failed');
    }

    // Clean up uploaded file
    fs.unlink(file.path, () => {});

    // Return character profile with cloud image URL
    const characterProfile = {
      id: Date.now().toString(),
      name: characterName || 'Unnamed Character',
      imageUrl: imageUrl,
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
  },
  // NEW: Based on example conversations for Ms. Goblina content
  'hot-mess-breakdown': {
    tone: 'self-deprecating-funny',
    pacing: 'dramatic-pause',
    emotion: 'chaotic-vulnerable',
    vibe: 'messy-but-charming',
    cameraStyle: 'intimate-close',
    shotPreference: 'close-up',
    contentType: 'meme',
    description: 'Crying in the bathroom but loving the skin glow - embracing the beautiful mess',
    exampleScenarios: [
      'Having a breakdown but noticing her skin looks amazing from the tears',
      'Ugly crying at work but checking herself out in the mirror',
      'Mental health day that turns into noticing positive side effects'
    ]
  },
  'corporate-slack-chaos': {
    tone: 'deadpan-sarcastic',
    pacing: 'build-to-reaction',
    emotion: 'internal-screaming',
    vibe: 'quiet-rage',
    cameraStyle: 'POV-then-reaction',
    shotPreference: 'screen-to-face',
    contentType: 'meme',
    description: 'Corporate Slack messages and email chaos - "quick question" energy',
    exampleScenarios: [
      'Receiving a "quick question" Slack at 5pm Friday',
      'Manager sending "can we chat?" with no context',
      'Meeting that could have been an email',
      'Being CC\'d on an email chain that has nothing to do with you'
    ],
    signatureLines: [
      'Corporate Slack messages that start with "quick question" should be illegal.',
      'Micromanager? Meet my macro boundaries.',
      'Per my last email... that you clearly didn\'t read.'
    ]
  },
  'billionaire-daydream': {
    tone: 'dreamy-comedic',
    pacing: 'montage-style',
    emotion: 'aspirational-delusional',
    vibe: 'main-character-energy',
    cameraStyle: 'glamour-shots',
    shotPreference: 'varied-fantasy',
    contentType: 'montage',
    description: 'Daydreaming about being rich while at a boring job - Bruno Mars "Billionaire" energy',
    exampleScenarios: [
      'Spacing out at work desk imagining yacht life',
      'Every scenario of what you\'d do as a billionaire',
      '25-year-old in cubicle manifesting millions'
    ]
  },
  'couples-food-drama': {
    tone: 'playful-argumentative',
    pacing: 'back-and-forth',
    emotion: 'hangry-but-loving',
    vibe: 'relatable-couples',
    cameraStyle: 'two-shot',
    shotPreference: 'medium-two-shot',
    contentType: 'dialogue',
    description: 'Food-related relationship arguments where both sides are valid',
    exampleScenarios: [
      'She wants fried chicken, he wants healthy poke bowl',
      'Deciding where to eat for the 100th time',
      'One craving comfort food, other on a health kick'
    ]
  },
  'pause-the-scroll': {
    tone: 'real-talk',
    pacing: 'moment-of-clarity',
    emotion: 'vulnerable-confrontational',
    vibe: 'relationship-therapy',
    cameraStyle: 'intimate',
    shotPreference: 'close-two-shot',
    contentType: 'dialogue',
    description: 'Real relationship conversations - "pause the scroll, solve us" energy',
    exampleScenarios: [
      'Calling out phone addiction in relationship',
      'Needing presence vs. needing decompress time',
      'Setting boundaries as a couple'
    ],
    signatureLines: [
      'Pause the scroll, solve us.',
      'When your screen wins, I feel like I don\'t.',
      'Phones down. Us up.'
    ]
  },
  'intern-energy': {
    tone: 'naive-optimistic',
    pacing: 'fast-confused',
    emotion: 'overwhelmed-eager',
    vibe: 'first-day-vibes',
    cameraStyle: 'shaky-POV',
    shotPreference: 'medium',
    contentType: 'meme',
    description: 'New job/intern struggles - learning the ropes and corporate culture',
    exampleScenarios: [
      'Not knowing what any of the acronyms mean',
      'First week trying to figure out office politics',
      'Pretending to understand in meetings'
    ]
  },
  'study-procrastination': {
    tone: 'guilty-relatable',
    pacing: 'time-lapse-chaos',
    emotion: 'stressed-avoidant',
    vibe: 'academic-spiral',
    cameraStyle: 'documentary',
    shotPreference: 'medium-wide',
    contentType: 'meme',
    description: 'Student/study procrastination struggles',
    exampleScenarios: [
      'Opening laptop to study, ending up on social media',
      'Exam tomorrow, cleaning the entire room instead',
      'The 3am study session delusion'
    ]
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
      
      "prompt": "COMPLETE Sora-ready prompt combining ALL details above using STEP-BY-STEP structure. This should be COPY-PASTE ready for Sora/Nano Banana."
    }
  ]
}

CRITICAL RULES FOR HIGH-FIDELITY CHARACTER PRESERVATION:
1. The "prompt" field must use STEP-BY-STEP structure for best results:
   - Step 1: Describe the background/setting first
   - Step 2: Describe the character in FULL DETAIL (preserve exact appearance)
   - Step 3: Describe the action/expression
   - Step 4: Specify camera work and composition

2. CHARACTER DESCRIPTION (include EVERY time for consistency):
   - "A green-skinned goblin woman with vibrant emerald-green skin"
   - "Petite feminine build with stylized Pixar/DreamWorks 3D animation proportions"  
   - "Large expressive eyes, small pointed nose, wide expressive mouth, pointed ears"
   - "Wearing [specific clothing] with gold hoop earrings and gold bangles on wrists"
   - "3D animated character with smooth surfaces and soft lighting"

3. USE SEMANTIC NEGATIVE PROMPTS (positive descriptions instead of "no X"):
   - Instead of "no other people" say "character is alone in the scene"
   - Instead of "no blurry" say "crisp, clear, high-quality render"
   - Instead of "no realistic style" say "consistent 3D animated cartoon style"

4. CAMERA LANGUAGE (use cinematic terms):
   - "Medium shot at eye-level, subject centered"
   - "Close-up with shallow depth of field"
   - "Push-in camera movement matching emotional beat"
   - "Portrait orientation (9:16) optimized for mobile viewing"

5. CONTEXT AND INTENT:
   - Always mention "for Instagram Reels/TikTok social media content"
   - Include the mood/emotion the scene should evoke

6. SCENE-SPECIFIC LIGHTING:
   - Office: "Harsh fluorescent overhead lighting casting slight shadows"
   - Bedroom: "Warm ambient lighting from bedside lamp, cozy atmosphere"
   - Bathroom: "Bright harsh bathroom lighting, mirror reflections"
   - Outdoor: "Natural daylight with soft shadows"

7. Dialogue must be SHORT and PUNCHY - Gen Z style
8. If second character present and shouldn't speak, include "Character X is visible but silent, only showing reactions"`;

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

PROMPT STRUCTURE (follow this exact format for the "prompt" field):

STEP 1 - BACKGROUND: "In a [detailed setting description with specific lighting]..."

STEP 2 - CHARACTER (FULL DETAIL FOR PRESERVATION): "A green-skinned goblin woman with vibrant emerald-green skin, petite feminine build in 3D Pixar-style animation. She has large expressive eyes, small pointed nose, wide expressive mouth, and pointed ears. She wears [specific clothing], gold hoop earrings, and gold bangles on her wrists..."

STEP 3 - ACTION & EXPRESSION: "She is [specific action] with [specific expression - e.g., 'eyes widening dramatically, eyebrows raised, jaw dropping slightly']..."

STEP 4 - CAMERA & COMPOSITION: "Shot as a [shot type] at [angle], [camera movement], portrait orientation (9:16) for mobile viewing. [Lighting description]. 3D animated style with smooth surfaces."

STEP 5 - CONTEXT: "Created for Instagram Reels/TikTok social media content, evoking [emotion/mood]."

REMEMBER:
- Be HYPER-SPECIFIC about character appearance (preserve every detail)
- Use SEMANTIC NEGATIVE PROMPTS (describe what IS there, not what isn't)
- Include CAMERA LANGUAGE (shot type, angle, movement)
- State CONTEXT AND INTENT (social media content, target emotion)

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
// NANO BANANA IMAGE GENERATION
// ==========================================

/**
 * Generate still images using Nano Banana (Google Gemini Image)
 * This creates preview images for scenes before video generation
 * 
 * POST /api/images/generate
 * Body: {
 *   prompt: string - The image prompt
 *   aspectRatio: string - '9:16', '16:9', '1:1', etc.
 *   resolution: string - '1K', '2K', '4K'
 *   referenceImages: string[] - Base64 or URLs of reference images for character consistency
 *   model: string - 'gemini-2.5-flash-image' (fast) or 'gemini-3-pro-image-preview' (advanced)
 *   saveToCloudinary: boolean - Whether to upload result to Cloudinary
 * }
 */
app.post('/api/images/generate', async (req, res) => {
  try {
    if (!googleAI) {
      return res.status(503).json({ 
        error: 'Nano Banana not configured',
        message: 'Set GOOGLE_AI_API_KEY environment variable to enable image generation.'
      });
    }

    const {
      prompt,
      aspectRatio = '9:16',
      resolution = '2K',
      referenceImages = [],
      model = 'gemini-2.5-flash-image',
      saveToCloudinary: shouldSave = true,
      // NEW: Character and scene context for high-fidelity preservation
      characterStyleGuide = null,
      characterName = 'Ms. Goblina',
      scene = {},
      enhancePrompt = true // Auto-enhance prompts with best practices
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Build enhanced prompt with character details and best practices
    let finalPrompt = prompt;
    const hasReferenceImages = referenceImages.length > 0;
    
    if (enhancePrompt) {
      const characterDescription = buildDetailedCharacterDescription(characterStyleGuide, characterName, hasReferenceImages);
      finalPrompt = enhancePromptForNanoBanana(prompt, {
        characterDescription,
        scene,
        aspectRatio,
        intent: 'Instagram Reels / TikTok social media content',
        hasReferenceImage: hasReferenceImages
      });
      console.log('🍌 Enhanced prompt with character preservation and best practices');
      if (hasReferenceImages) {
        console.log('🍌 Reference image(s) attached for character consistency');
      }
    }

    // Generate the image
    const result = await generateNanoBananaImage({
      prompt: finalPrompt,
      aspectRatio,
      resolution,
      referenceImages,
      model
    });

    let cloudinaryUrl = null;

    // Optionally save to Cloudinary
    if (shouldSave && hasCloudinary && result.imageBase64) {
      try {
        // Upload base64 directly to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(
          `data:${result.mimeType};base64,${result.imageBase64}`,
          {
            folder: 'goblina-scene-images',
            resource_type: 'image'
          }
        );
        cloudinaryUrl = uploadResult.secure_url;
        console.log('☁️ Scene image saved to Cloudinary:', cloudinaryUrl);
      } catch (uploadErr) {
        console.warn('Failed to save image to Cloudinary:', uploadErr.message);
      }
    }

    res.json({
      success: true,
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
      imageUrl: cloudinaryUrl,
      text: result.text,
      model,
      aspectRatio,
      resolution
    });

  } catch (err) {
    console.error('Image generation error:', err);
    res.status(500).json({ 
      error: 'Failed to generate image', 
      details: err.message 
    });
  }
});

/**
 * Generate multiple scene images in batch
 * 
 * POST /api/images/generate-batch
 * Body: {
 *   scenes: Array<{
 *     prompt: string,
 *     aspectRatio?: string,
 *     resolution?: string
 *   }>,
 *   referenceImages: string[] - Shared reference images for all scenes
 *   model: string
 *   characterStyleGuide: object - Character style guide for high-fidelity preservation
 *   characterName: string - Character name
 *   enhancePrompt: boolean - Whether to auto-enhance prompts
 * }
 */
app.post('/api/images/generate-batch', async (req, res) => {
  try {
    if (!googleAI) {
      return res.status(503).json({ 
        error: 'Nano Banana not configured',
        message: 'Set GOOGLE_AI_API_KEY environment variable to enable image generation.'
      });
    }

    const {
      scenes = [],
      referenceImages = [],
      model = 'gemini-2.5-flash-image',
      aspectRatio = '9:16',
      resolution = '2K',
      // Character context for consistency
      characterStyleGuide = null,
      characterName = 'Ms. Goblina',
      enhancePrompt = true
    } = req.body;

    if (!scenes.length) {
      return res.status(400).json({ error: 'At least one scene is required' });
    }

    // Pre-build character description once for all scenes
    const hasReferenceImages = referenceImages.length > 0;
    const characterDescription = enhancePrompt 
      ? buildDetailedCharacterDescription(characterStyleGuide, characterName, hasReferenceImages)
      : '';

    console.log(`🍌 Generating ${scenes.length} scene images...`);
    if (enhancePrompt) {
      console.log('🍌 Using enhanced prompts with character preservation');
    }
    if (hasReferenceImages) {
      console.log('🍌 Reference image(s) attached for character consistency');
    }

    const results = [];
    
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`🍌 Generating scene ${i + 1}/${scenes.length}...`);
      
      // Enhance prompt with character details and best practices
      let finalPrompt = scene.prompt;
      if (enhancePrompt) {
        finalPrompt = enhancePromptForNanoBanana(scene.prompt, {
          characterDescription,
          scene,
          aspectRatio: scene.aspectRatio || aspectRatio,
          intent: 'Instagram Reels / TikTok social media content',
          hasReferenceImage: hasReferenceImages
        });
      }
      
      try {
        const result = await generateNanoBananaImage({
          prompt: finalPrompt,
          aspectRatio: scene.aspectRatio || aspectRatio,
          resolution: scene.resolution || resolution,
          referenceImages,
          model
        });

        // Save to Cloudinary
        let cloudinaryUrl = null;
        if (hasCloudinary && result.imageBase64) {
          try {
            const uploadResult = await cloudinary.uploader.upload(
              `data:${result.mimeType};base64,${result.imageBase64}`,
              {
                folder: 'goblina-scene-images',
                resource_type: 'image'
              }
            );
            cloudinaryUrl = uploadResult.secure_url;
          } catch (uploadErr) {
            console.warn(`Failed to save scene ${i + 1} to Cloudinary:`, uploadErr.message);
          }
        }

        results.push({
          index: i,
          success: true,
          imageBase64: result.imageBase64,
          mimeType: result.mimeType,
          imageUrl: cloudinaryUrl,
          text: result.text
        });
      } catch (sceneErr) {
        console.error(`Scene ${i + 1} generation failed:`, sceneErr.message);
        results.push({
          index: i,
          success: false,
          error: sceneErr.message
        });
      }

      // Small delay between generations to avoid rate limiting
      if (i < scenes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`🍌 Batch complete: ${successCount}/${scenes.length} images generated`);

    res.json({
      success: successCount > 0,
      totalScenes: scenes.length,
      successCount,
      failedCount: scenes.length - successCount,
      results,
      model,
      aspectRatio,
      resolution
    });

  } catch (err) {
    console.error('Batch image generation error:', err);
    res.status(500).json({ 
      error: 'Failed to generate images', 
      details: err.message 
    });
  }
});

/**
 * Check Nano Banana availability and configuration
 * GET /api/images/status
 */
app.get('/api/images/status', (req, res) => {
  res.json({
    available: hasGoogleAI,
    cloudinaryEnabled: hasCloudinary,
    models: {
      fast: 'gemini-2.5-flash-image',
      advanced: 'gemini-3-pro-image-preview'
    },
    supportedAspectRatios: NANO_BANANA_ASPECT_RATIOS,
    supportedResolutions: NANO_BANANA_RESOLUTIONS,
    maxReferenceImages: 5
  });
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

// Image upload + generate route (supports file upload OR image URL)
app.post('/api/generate', upload.single('image'), async (req, res) => {
  let processedImagePath = null;
  let tempImagePath = null; // For URL-fetched images
  try {
    // Check if OpenAI is configured
    if (!hasOpenAI) {
      return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' });
    }

    const { prompt, model, seconds, size, imageUrl } = req.body;
    const file = req.file;

    // Either file upload or imageUrl is required
    if (!file && !imageUrl) {
      return res.status(400).json({ error: 'Image file or image URL is required.' });
    }

    let imagePath, imageMimeType, imageOriginalName;

    if (file) {
      // Use uploaded file
      imagePath = file.path;
      imageMimeType = file.mimetype;
      imageOriginalName = file.originalname;
    } else if (imageUrl) {
      // Fetch image from URL (e.g., Cloudinary)
      try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.status}`);
        }
        
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        
        // Determine mime type from URL or response
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        
        tempImagePath = path.join('uploads', `fetched_${Date.now()}.${extension}`);
        fs.writeFileSync(tempImagePath, imageBuffer);
        
        imagePath = tempImagePath;
        imageMimeType = contentType;
        imageOriginalName = `character.${extension}`;
      } catch (fetchErr) {
        console.error('Failed to fetch image from URL:', fetchErr);
        return res.status(400).json({ error: 'Failed to fetch character image from URL.' });
      }
    }

    // Detect image dimensions
    const imageMetadata = await sharp(imagePath).metadata();
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
      processedImagePath = path.join('uploads', `resized_${Date.now()}_${path.basename(imagePath)}`);
      await sharp(imagePath)
        .resize(targetWidth, targetHeight, {
          fit: 'fill',
          withoutEnlargement: false
        })
        .toFile(processedImagePath);
    } else {
      processedImagePath = imagePath;
    }

    const videoJob = await callOpenAIVideoCreate({
      prompt,
      model,
      seconds: seconds || 8,
      size: targetSize,
      imagePath: processedImagePath,
      imageMime: imageMimeType,
      imageOriginalName: imageOriginalName
    });

    // Clean up uploaded files asynchronously
    if (file?.path) fs.unlink(file.path, () => {});
    if (tempImagePath) fs.unlink(tempImagePath, () => {});
    if (processedImagePath && processedImagePath !== imagePath) {
      fs.unlink(processedImagePath, () => {});
    }

    res.json(videoJob);
  } catch (err) {
    console.error(err);
    // Clean up on error
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    if (tempImagePath) fs.unlink(tempImagePath, () => {});
    if (processedImagePath && processedImagePath !== req.file?.path && processedImagePath !== tempImagePath) {
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

  // Save a video
  app.post('/api/videos/save', async (req, res) => {
    try {
      const { id, projectId, soraJobId, prompt, structuredPrompt, status, durationSeconds } = req.body;
      if (!id || !soraJobId) {
        return res.status(400).json({ error: 'id and soraJobId are required' });
      }
      const video = await db.saveVideo(id, projectId, soraJobId, prompt, structuredPrompt);
      
      // Update status if completed
      if (status === 'completed') {
        await db.updateVideoStatus(id, 'completed');
      }
      
      res.json(video);
    } catch (err) {
      console.error('Error saving video:', err);
      res.status(500).json({ error: 'Failed to save video', details: err.message });
    }
  });

  // Toggle video favorite
  app.post('/api/videos/favorite', async (req, res) => {
    try {
      const { id, isFavorite } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }
      const video = await db.updateVideoFavorite(id, isFavorite);
      res.json(video || { success: true });
    } catch (err) {
      console.error('Error updating favorite:', err);
      res.status(500).json({ error: 'Failed to update favorite', details: err.message });
    }
  });

  // Rate a video
  app.post('/api/videos/rate', async (req, res) => {
    try {
      const { id, rating } = req.body;
      if (!id || rating === undefined) {
        return res.status(400).json({ error: 'id and rating are required' });
      }
      const video = await db.updateVideoRating(id, rating);
      res.json(video || { success: true });
    } catch (err) {
      console.error('Error updating rating:', err);
      res.status(500).json({ error: 'Failed to update rating', details: err.message });
    }
  });

  // Permanently save a video to Cloudinary
  app.post('/api/videos/save-permanent', async (req, res) => {
    try {
      const { soraJobId, videoId } = req.body;
      if (!soraJobId) {
        return res.status(400).json({ error: 'soraJobId is required' });
      }

      if (!hasCloudinary) {
        return res.status(400).json({ 
          error: 'Cloudinary not configured', 
          message: 'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to enable permanent storage' 
        });
      }

      // Get video URL from Sora
      const soraResponse = await fetch(`https://api.openai.com/v1/videos/${soraJobId}`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      });

      if (!soraResponse.ok) {
        throw new Error('Failed to fetch video from Sora');
      }

      const soraData = await soraResponse.json();
      
      if (!soraData.url) {
        return res.status(400).json({ error: 'Video not ready or already expired' });
      }

      // Upload to Cloudinary
      const cloudinaryResult = await uploadVideoToCloudinary(soraData.url);
      
      if (!cloudinaryResult) {
        throw new Error('Failed to upload to Cloudinary');
      }

      // Update database with permanent URL
      if (videoId) {
        await db.updateVideoStatus(videoId, 'completed', cloudinaryResult.url);
      }

      res.json({
        success: true,
        permanentUrl: cloudinaryResult.url,
        publicId: cloudinaryResult.publicId,
        duration: cloudinaryResult.duration
      });
    } catch (err) {
      console.error('Error saving video permanently:', err);
      res.status(500).json({ error: 'Failed to save video permanently', details: err.message });
    }
  });

  // Get storage status
  app.get('/api/storage/status', async (req, res) => {
    res.json({
      cloudinary: {
        configured: hasCloudinary,
        features: hasCloudinary ? ['images', 'videos'] : []
      },
      database: {
        configured: hasDatabase,
        features: hasDatabase ? ['characters', 'projects', 'videos', 'presets', 'prompts'] : []
      },
      recommendations: !hasCloudinary ? [
        'Set up Cloudinary for permanent video storage',
        'Videos from Sora expire after ~24 hours without Cloudinary'
      ] : []
    });
  });

  // Get favorited videos only
  app.get('/api/videos/favorites', async (req, res) => {
    try {
      const videos = await db.listVideos(null, true);
      res.json(videos);
    } catch (err) {
      console.error('Error listing favorites:', err);
      res.status(500).json({ error: 'Failed to list favorites', details: err.message });
    }
  });

  // Custom Personality Presets endpoints
  app.get('/api/personalities/custom', async (req, res) => {
    try {
      const presets = await db.listPersonalityPresets();
      res.json(presets);
    } catch (err) {
      console.error('Error listing custom presets:', err);
      res.status(500).json({ error: 'Failed to list custom presets', details: err.message });
    }
  });

  app.post('/api/personalities/custom/save', async (req, res) => {
    try {
      const { id, name, description, tone, humorStyle, captionStyle, emojiUsage } = req.body;
      if (!id || !name) {
        return res.status(400).json({ error: 'id and name are required' });
      }
      const preset = await db.savePersonalityPreset(id, name, description, {
        tone, humorStyle, captionStyle, emojiUsage
      });
      res.json(preset);
    } catch (err) {
      console.error('Error saving custom preset:', err);
      res.status(500).json({ error: 'Failed to save custom preset', details: err.message });
    }
  });

  app.delete('/api/personalities/custom/:id', async (req, res) => {
    try {
      await db.deletePersonalityPreset(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting custom preset:', err);
      res.status(500).json({ error: 'Failed to delete custom preset', details: err.message });
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
