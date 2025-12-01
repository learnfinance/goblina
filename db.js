import pg from 'pg';
const { Pool } = pg;

// Connection pool for PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

/**
 * Initialize database tables
 */
export async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔧 Initializing database tables...');
    
    await client.query(`
      -- Characters table: stores Ms. Goblina and other character profiles
      CREATE TABLE IF NOT EXISTS characters (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        style_guide JSONB,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Projects table: stores content creation projects
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(50) PRIMARY KEY,
        character_id VARCHAR(50) REFERENCES characters(id) ON DELETE SET NULL,
        topic TEXT,
        personality_preset VARCHAR(50) DEFAULT 'genz-meme',
        scenarios JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Videos table: stores video generation jobs
      CREATE TABLE IF NOT EXISTS videos (
        id VARCHAR(50) PRIMARY KEY,
        project_id VARCHAR(50) REFERENCES projects(id) ON DELETE CASCADE,
        sora_job_id VARCHAR(255),
        prompt TEXT,
        structured_prompt JSONB,
        status VARCHAR(50) DEFAULT 'pending',
        video_url TEXT,
        duration_seconds INTEGER,
        is_favorite BOOLEAN DEFAULT FALSE,
        rating INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
      
      -- Personality presets table: stores custom user presets
      CREATE TABLE IF NOT EXISTS personality_presets (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        tone TEXT,
        humor_style TEXT,
        caption_style TEXT,
        emoji_usage TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Prompts library: stores successful prompts for reuse
      CREATE TABLE IF NOT EXISTS prompt_library (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255),
        category VARCHAR(100),
        structured_prompt JSONB,
        text_prompt TEXT,
        tags TEXT[],
        use_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Generated images table: stores all AI-generated images
      CREATE TABLE IF NOT EXISTS generated_images (
        id VARCHAR(50) PRIMARY KEY,
        project_id VARCHAR(50) REFERENCES projects(id) ON DELETE SET NULL,
        character_id VARCHAR(50) REFERENCES characters(id) ON DELETE SET NULL,
        prompt TEXT,
        cloudinary_url TEXT NOT NULL,
        cloudinary_public_id TEXT,
        aspect_ratio VARCHAR(20),
        resolution VARCHAR(10),
        model VARCHAR(100),
        scene_index INTEGER,
        metadata JSONB,
        is_favorite BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Create indexes for faster queries
      CREATE INDEX IF NOT EXISTS idx_projects_character ON projects(character_id);
      CREATE INDEX IF NOT EXISTS idx_videos_project ON videos(project_id);
      CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
      CREATE INDEX IF NOT EXISTS idx_prompt_library_category ON prompt_library(category);
      CREATE INDEX IF NOT EXISTS idx_generated_images_project ON generated_images(project_id);
      CREATE INDEX IF NOT EXISTS idx_generated_images_character ON generated_images(character_id);
      CREATE INDEX IF NOT EXISTS idx_generated_images_created ON generated_images(created_at DESC);
    `);
    
    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ==========================================
// CHARACTER OPERATIONS
// ==========================================

export async function saveCharacter(id, name, styleGuide, imageUrl = null) {
  const result = await pool.query(
    `INSERT INTO characters (id, name, style_guide, image_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       style_guide = EXCLUDED.style_guide,
       image_url = COALESCE(EXCLUDED.image_url, characters.image_url),
       updated_at = NOW()
     RETURNING *`,
    [id, name, JSON.stringify(styleGuide), imageUrl]
  );
  return result.rows[0];
}

export async function getCharacter(id) {
  const result = await pool.query(
    'SELECT * FROM characters WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function listCharacters() {
  const result = await pool.query(
    'SELECT * FROM characters ORDER BY updated_at DESC'
  );
  return result.rows;
}

export async function deleteCharacter(id) {
  await pool.query('DELETE FROM characters WHERE id = $1', [id]);
}

/**
 * Update a character's image URL
 * @param {string} id - Character ID
 * @param {string} imageUrl - New Cloudinary image URL
 * @returns {Promise<object>} - Updated character record
 */
export async function updateCharacterImage(id, imageUrl) {
  const result = await pool.query(
    `UPDATE characters SET image_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [imageUrl, id]
  );
  return result.rows[0];
}

// ==========================================
// PROJECT OPERATIONS
// ==========================================

export async function saveProject(id, characterId, topic, personalityPreset, scenarios) {
  const result = await pool.query(
    `INSERT INTO projects (id, character_id, topic, personality_preset, scenarios)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       character_id = EXCLUDED.character_id,
       topic = EXCLUDED.topic,
       personality_preset = EXCLUDED.personality_preset,
       scenarios = EXCLUDED.scenarios,
       updated_at = NOW()
     RETURNING *`,
    [id, characterId, topic, personalityPreset, JSON.stringify(scenarios)]
  );
  return result.rows[0];
}

export async function getProject(id) {
  const result = await pool.query(
    `SELECT p.*, c.name as character_name, c.style_guide
     FROM projects p
     LEFT JOIN characters c ON p.character_id = c.id
     WHERE p.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function listProjects(characterId = null) {
  let query = `
    SELECT p.*, c.name as character_name
    FROM projects p
    LEFT JOIN characters c ON p.character_id = c.id
  `;
  const params = [];
  
  if (characterId) {
    query += ' WHERE p.character_id = $1';
    params.push(characterId);
  }
  
  query += ' ORDER BY p.updated_at DESC';
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function deleteProject(id) {
  await pool.query('DELETE FROM projects WHERE id = $1', [id]);
}

// ==========================================
// VIDEO OPERATIONS
// ==========================================

export async function saveVideo(id, projectId, soraJobId, prompt, structuredPrompt = null) {
  const result = await pool.query(
    `INSERT INTO videos (id, project_id, sora_job_id, prompt, structured_prompt, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (id) DO UPDATE SET
       sora_job_id = EXCLUDED.sora_job_id,
       prompt = EXCLUDED.prompt,
       structured_prompt = EXCLUDED.structured_prompt
     RETURNING *`,
    [id, projectId, soraJobId, prompt, structuredPrompt ? JSON.stringify(structuredPrompt) : null]
  );
  return result.rows[0];
}

export async function updateVideoStatus(id, status, videoUrl = null) {
  const completedAt = status === 'completed' ? 'NOW()' : 'NULL';
  const result = await pool.query(
    `UPDATE videos SET
       status = $1,
       video_url = COALESCE($2, video_url),
       completed_at = ${status === 'completed' ? 'NOW()' : 'completed_at'}
     WHERE id = $3 OR sora_job_id = $3
     RETURNING *`,
    [status, videoUrl, id]
  );
  return result.rows[0];
}

export async function getVideo(id) {
  const result = await pool.query(
    'SELECT * FROM videos WHERE id = $1 OR sora_job_id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function listVideos(projectId = null, favoritesOnly = false) {
  let query = 'SELECT * FROM videos';
  const params = [];
  const conditions = [];
  
  if (projectId) {
    conditions.push(`project_id = $${params.length + 1}`);
    params.push(projectId);
  }
  
  if (favoritesOnly) {
    conditions.push('is_favorite = TRUE');
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY created_at DESC';
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function updateVideoFavorite(id, isFavorite) {
  const result = await pool.query(
    `UPDATE videos SET is_favorite = $1 WHERE id = $2 OR sora_job_id = $2 RETURNING *`,
    [isFavorite, id]
  );
  return result.rows[0];
}

export async function updateVideoRating(id, rating) {
  const result = await pool.query(
    `UPDATE videos SET rating = $1 WHERE id = $2 OR sora_job_id = $2 RETURNING *`,
    [rating, id]
  );
  return result.rows[0];
}

// ==========================================
// GENERATED IMAGE OPERATIONS
// ==========================================

/**
 * Save a generated image to the database
 * @param {object} imageData - Image data to save
 * @returns {Promise<object>} - Saved image record
 */
export async function saveGeneratedImage(imageData) {
  const {
    id,
    projectId = null,
    characterId = null,
    prompt,
    cloudinaryUrl,
    cloudinaryPublicId = null,
    aspectRatio = '9:16',
    resolution = '2K',
    model = 'gemini-2.5-flash-image',
    sceneIndex = null,
    metadata = null
  } = imageData;

  const result = await pool.query(
    `INSERT INTO generated_images 
     (id, project_id, character_id, prompt, cloudinary_url, cloudinary_public_id, 
      aspect_ratio, resolution, model, scene_index, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       cloudinary_url = EXCLUDED.cloudinary_url,
       cloudinary_public_id = EXCLUDED.cloudinary_public_id,
       metadata = COALESCE(EXCLUDED.metadata, generated_images.metadata)
     RETURNING *`,
    [id, projectId, characterId, prompt, cloudinaryUrl, cloudinaryPublicId, 
     aspectRatio, resolution, model, sceneIndex, metadata ? JSON.stringify(metadata) : null]
  );
  return result.rows[0];
}

/**
 * Get a generated image by ID
 */
export async function getGeneratedImage(id) {
  const result = await pool.query(
    'SELECT * FROM generated_images WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * List generated images with optional filters
 */
export async function listGeneratedImages(filters = {}) {
  const { projectId, characterId, favoritesOnly, limit = 50, offset = 0 } = filters;
  
  let query = 'SELECT * FROM generated_images';
  const params = [];
  const conditions = [];
  
  if (projectId) {
    conditions.push(`project_id = $${params.length + 1}`);
    params.push(projectId);
  }
  
  if (characterId) {
    conditions.push(`character_id = $${params.length + 1}`);
    params.push(characterId);
  }
  
  if (favoritesOnly) {
    conditions.push('is_favorite = TRUE');
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Toggle favorite status for an image
 */
export async function updateImageFavorite(id, isFavorite) {
  const result = await pool.query(
    `UPDATE generated_images SET is_favorite = $1 WHERE id = $2 RETURNING *`,
    [isFavorite, id]
  );
  return result.rows[0];
}

/**
 * Delete a generated image
 */
export async function deleteGeneratedImage(id) {
  await pool.query('DELETE FROM generated_images WHERE id = $1', [id]);
}

/**
 * Get image count for a project
 */
export async function getImageCountByProject(projectId) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM generated_images WHERE project_id = $1',
    [projectId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Get recent images (for gallery/history)
 */
export async function getRecentImages(limit = 20) {
  const result = await pool.query(
    `SELECT gi.*, c.name as character_name 
     FROM generated_images gi
     LEFT JOIN characters c ON gi.character_id = c.id
     ORDER BY gi.created_at DESC 
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ==========================================
// PERSONALITY PRESET OPERATIONS
// ==========================================

export async function savePersonalityPreset(id, name, description, config) {
  const result = await pool.query(
    `INSERT INTO personality_presets (id, name, description, tone, humor_style, caption_style, emoji_usage)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       tone = EXCLUDED.tone,
       humor_style = EXCLUDED.humor_style,
       caption_style = EXCLUDED.caption_style,
       emoji_usage = EXCLUDED.emoji_usage
     RETURNING *`,
    [id, name, description, config.tone, config.humorStyle, config.captionStyle, config.emojiUsage]
  );
  return result.rows[0];
}

export async function listPersonalityPresets() {
  const result = await pool.query(
    'SELECT * FROM personality_presets ORDER BY is_default DESC, name ASC'
  );
  return result.rows;
}

export async function getPersonalityPreset(id) {
  const result = await pool.query(
    'SELECT * FROM personality_presets WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function deletePersonalityPreset(id) {
  await pool.query('DELETE FROM personality_presets WHERE id = $1 AND is_default = FALSE', [id]);
}

// ==========================================
// PROMPT LIBRARY OPERATIONS
// ==========================================

export async function savePromptToLibrary(id, name, category, structuredPrompt, textPrompt, tags = []) {
  const result = await pool.query(
    `INSERT INTO prompt_library (id, name, category, structured_prompt, text_prompt, tags)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       category = EXCLUDED.category,
       structured_prompt = EXCLUDED.structured_prompt,
       text_prompt = EXCLUDED.text_prompt,
       tags = EXCLUDED.tags
     RETURNING *`,
    [id, name, category, JSON.stringify(structuredPrompt), textPrompt, tags]
  );
  return result.rows[0];
}

export async function getPromptFromLibrary(id) {
  // Increment use count when fetched
  const result = await pool.query(
    `UPDATE prompt_library SET use_count = use_count + 1
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

export async function listPromptsFromLibrary(category = null) {
  let query = 'SELECT * FROM prompt_library';
  const params = [];
  
  if (category) {
    query += ' WHERE category = $1';
    params.push(category);
  }
  
  query += ' ORDER BY use_count DESC, created_at DESC';
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function searchPromptLibrary(searchTerm) {
  const result = await pool.query(
    `SELECT * FROM prompt_library
     WHERE name ILIKE $1 OR $2 = ANY(tags) OR text_prompt ILIKE $1
     ORDER BY use_count DESC`,
    [`%${searchTerm}%`, searchTerm]
  );
  return result.rows;
}

// ==========================================
// UTILITY
// ==========================================

export async function healthCheck() {
  try {
    const result = await pool.query('SELECT NOW()');
    return { status: 'healthy', timestamp: result.rows[0].now };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
}

export default pool;

