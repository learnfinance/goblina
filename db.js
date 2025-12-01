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
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
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

      -- Create indexes for faster queries
      CREATE INDEX IF NOT EXISTS idx_projects_character ON projects(character_id);
      CREATE INDEX IF NOT EXISTS idx_videos_project ON videos(project_id);
      CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
      CREATE INDEX IF NOT EXISTS idx_prompt_library_category ON prompt_library(category);
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

export async function listVideos(projectId = null) {
  let query = 'SELECT * FROM videos';
  const params = [];
  
  if (projectId) {
    query += ' WHERE project_id = $1';
    params.push(projectId);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const result = await pool.query(query, params);
  return result.rows;
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

