# 🚀 Microservice Architecture Guide

## Making Ms. Goblina Content Creator a Production Microservice

---

## 📊 Current State vs. Production-Ready

### Current State (MVP)
```
┌─────────────────────────────────────┐
│  Node.js + Express Server           │
│  • No database (stateless)          │
│  • Local file storage (uploads/)    │
│  • In-memory sessions only          │
│  • Single server instance           │
└─────────────────────────────────────┘
```

### Production-Ready Microservice
```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND                                  │
│  (Streamlit / React / Next.js)                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 API GATEWAY / LOAD BALANCER                  │
│              (Nginx / Vercel / Railway)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  API Server │  │  API Server │  │  API Server │
│  (Node.js)  │  │  (Node.js)  │  │  (Node.js)  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Database   │  │  File Store │  │  Redis      │
│  (Postgres) │  │  (S3/R2)    │  │  (Cache)    │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

## 🗄️ Database Options

### Option 1: SQLite (Simplest - Good for MVP+)

**Best for:** Solo use, small scale, getting started fast

```javascript
// Install
npm install better-sqlite3

// db.js
import Database from 'better-sqlite3';
const db = new Database('goblina.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    style_guide JSON,
    image_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    character_id TEXT,
    topic TEXT,
    scenarios JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id) REFERENCES characters(id)
  );
  
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    sora_job_id TEXT,
    prompt TEXT,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );
`);

export default db;
```

**Pros:**
- Zero setup, file-based
- No external dependencies
- Fast for small datasets
- Portable (just copy the .db file)

**Cons:**
- Not ideal for concurrent writes
- Single server only
- Not suitable for high traffic

---

### Option 2: PostgreSQL (Production Ready)

**Best for:** Multi-user, scalable, cloud deployment

```javascript
// Install
npm install pg

// db.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create tables
await pool.query(`
  CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    style_guide JSONB,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID REFERENCES characters(id),
    topic TEXT,
    personality_preset VARCHAR(50),
    scenarios JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    sora_job_id VARCHAR(255),
    prompt TEXT,
    structured_prompt JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    video_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
  );
`);

export default pool;
```

**Hosted Options:**
- **Supabase** (Free tier, PostgreSQL + Auth + Storage) ⭐ RECOMMENDED
- **Neon** (Serverless PostgreSQL, generous free tier)
- **Railway** (Easy deployment, includes PostgreSQL)
- **PlanetScale** (MySQL, but very scalable)
- **AWS RDS / Google Cloud SQL** (Enterprise)

---

### Option 3: MongoDB (Flexible JSON Documents)

**Best for:** Rapid iteration, flexible schemas, JSON-heavy data

```javascript
// Install
npm install mongodb

// db.js
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db('goblina');

// Collections (auto-created)
export const characters = db.collection('characters');
export const projects = db.collection('projects');
export const videos = db.collection('videos');

// Example document structure
const characterDoc = {
  _id: 'char_123',
  name: 'Ms. Goblina',
  styleGuide: {
    character: {
      appearance: 'Green-skinned goblin woman...',
      visualStyle: '3D cartoon Pixar-like',
      colorPalette: ['#8BC34A', '#FF5722']
    }
  },
  imagePath: 'uploads/goblina.png',
  createdAt: new Date()
};
```

**Hosted Options:**
- **MongoDB Atlas** (Free tier: 512MB)
- **Cosmos DB** (Azure, MongoDB-compatible)

---

## 💾 Persistent Data in Streamlit

### The Challenge
Streamlit's `st.session_state` only persists during a session. When the user closes the browser or the app restarts, data is lost.

### Solution 1: SQLite (Easiest for Streamlit)

```python
# streamlit_app.py
import streamlit as st
import sqlite3
import json
from pathlib import Path

# Database setup
DB_PATH = Path("data/goblina.db")
DB_PATH.parent.mkdir(exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS characters (
            id TEXT PRIMARY KEY,
            name TEXT,
            style_guide TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            character_id TEXT,
            topic TEXT,
            scenarios TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()

# Initialize on app start
init_db()

# Save character
def save_character(char_id, name, style_guide):
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO characters (id, name, style_guide) VALUES (?, ?, ?)",
        (char_id, name, json.dumps(style_guide))
    )
    conn.commit()

# Load characters
def load_characters():
    conn = get_db()
    rows = conn.execute("SELECT * FROM characters ORDER BY created_at DESC").fetchall()
    return [dict(row) for row in rows]

# Streamlit UI
st.title("Ms. Goblina Content Creator")

# Load saved characters
saved_characters = load_characters()
if saved_characters:
    st.sidebar.header("Saved Characters")
    for char in saved_characters:
        if st.sidebar.button(char['name'], key=char['id']):
            st.session_state.current_character = json.loads(char['style_guide'])
```

### Solution 2: JSON File Storage (Simplest)

```python
# For very simple persistence
import json
from pathlib import Path

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

def save_project(project_id, data):
    path = DATA_DIR / f"project_{project_id}.json"
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def load_project(project_id):
    path = DATA_DIR / f"project_{project_id}.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None

def list_projects():
    return [f.stem.replace('project_', '') for f in DATA_DIR.glob('project_*.json')]
```

### Solution 3: Supabase (Cloud Database + Auth)

```python
# Install: pip install supabase
from supabase import create_client
import streamlit as st

# Initialize Supabase client
supabase = create_client(
    st.secrets["SUPABASE_URL"],
    st.secrets["SUPABASE_KEY"]
)

# Save character
def save_character(name, style_guide):
    data = {
        "name": name,
        "style_guide": style_guide
    }
    result = supabase.table("characters").insert(data).execute()
    return result.data[0]

# Load characters
def load_characters():
    result = supabase.table("characters").select("*").order("created_at", desc=True).execute()
    return result.data

# Delete character
def delete_character(char_id):
    supabase.table("characters").delete().eq("id", char_id).execute()
```

---

## 🌐 Deployment Options

### Option 1: Railway (Recommended for Beginners) ⭐

**Why Railway:**
- One-click deploy from GitHub
- Free PostgreSQL database included
- Auto-HTTPS
- Environment variables management
- $5/month free credits

**Steps:**
```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/goblina-creator.git
git push -u origin main

# 2. Go to railway.app
# 3. "New Project" → "Deploy from GitHub Repo"
# 4. Select your repo
# 5. Add environment variables:
#    - OPENAI_API_KEY=your_key
#    - DATABASE_URL (auto-added if you add PostgreSQL)
# 6. Deploy!
```

**railway.json:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

### Option 2: Vercel (Best for Serverless)

**Why Vercel:**
- Excellent for Next.js/React frontends
- Serverless functions for API
- Free tier is generous
- Great DX (Developer Experience)

**vercel.json:**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server.js"
    },
    {
      "src": "/(.*)",
      "dest": "public/$1"
    }
  ]
}
```

**Note:** For file uploads, you'll need external storage (Vercel Blob, S3, Cloudflare R2)

---

### Option 3: Render (Simple & Reliable)

**Why Render:**
- Easy Docker deployment
- Free PostgreSQL (90-day retention on free tier)
- Web services, cron jobs, and more
- Good for Node.js apps

**render.yaml:**
```yaml
services:
  - type: web
    name: goblina-creator
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: OPENAI_API_KEY
        sync: false
      - key: DATABASE_URL
        fromDatabase:
          name: goblina-db
          property: connectionString

databases:
  - name: goblina-db
    databaseName: goblina
    plan: free
```

---

### Option 4: Docker (Most Portable)

**Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/goblina
    depends_on:
      - db
    volumes:
      - uploads:/app/uploads

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: goblina
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  uploads:
  postgres_data:
```

**Commands:**
```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

---

### Option 5: Streamlit Cloud (For Streamlit Apps)

**Why Streamlit Cloud:**
- Free hosting for Streamlit apps
- Connect to GitHub
- Secrets management
- Share with one link

**Steps:**
1. Create `streamlit_app.py` (your main app)
2. Create `requirements.txt`
3. Push to GitHub
4. Go to share.streamlit.io
5. Connect your repo
6. Add secrets (API keys)
7. Deploy!

**Limitation:** Streamlit Cloud doesn't persist files. Use SQLite or external database.

---

## 📁 File Storage Options

### For Character Images & Generated Videos

| Service | Free Tier | Best For |
|---------|-----------|----------|
| **Cloudflare R2** | 10GB free | Cost-effective S3-compatible |
| **Supabase Storage** | 1GB free | Integrated with Supabase DB |
| **AWS S3** | 5GB free (12 months) | Enterprise scale |
| **Vercel Blob** | 500MB free | Vercel deployments |
| **UploadThing** | 2GB free | Easy integration |

### Example: Cloudflare R2

```javascript
// Install
npm install @aws-sdk/client-s3

// storage.js
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const R2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadImage(key, buffer, contentType) {
  await R2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

export async function getImageUrl(key) {
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
```

---

## 🔐 Environment Variables for Production

```bash
# .env.production

# OpenAI
OPENAI_API_KEY=sk-...

# Database
DATABASE_URL=postgresql://user:pass@host:5432/goblina

# File Storage (Cloudflare R2 example)
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=goblina-uploads
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Server
PORT=3000
NODE_ENV=production

# Optional: Redis for caching
REDIS_URL=redis://localhost:6379
```

---

## 🎯 Recommended Stack for Your Use Case

### For Solo Creator (Your Girlfriend)

```
┌─────────────────────────────────────┐
│  Frontend: Streamlit (Python)       │
│  OR: Current HTML/JS (simpler)      │
├─────────────────────────────────────┤
│  Backend: Node.js + Express         │
│  (current server.js)                │
├─────────────────────────────────────┤
│  Database: SQLite                   │
│  (simple, portable)                 │
├─────────────────────────────────────┤
│  File Storage: Local filesystem     │
│  (for MVP, upgrade to R2 later)     │
├─────────────────────────────────────┤
│  Deployment: Railway                │
│  (free tier, easy setup)            │
└─────────────────────────────────────┘
```

### For Multiple Users / SaaS

```
┌─────────────────────────────────────┐
│  Frontend: Next.js + Tailwind       │
│  (or Streamlit for rapid dev)       │
├─────────────────────────────────────┤
│  Backend: Node.js + Express         │
│  + Rate limiting + Auth             │
├─────────────────────────────────────┤
│  Database: Supabase (PostgreSQL)    │
│  + Row Level Security               │
├─────────────────────────────────────┤
│  File Storage: Cloudflare R2        │
│  (cheap, fast, S3-compatible)       │
├─────────────────────────────────────┤
│  Deployment: Vercel (frontend)      │
│            + Railway (backend)      │
│  OR: Single Railway deployment      │
└─────────────────────────────────────┘
```

---

## 📋 Quick Start Checklist

### To Make This Production-Ready:

- [ ] **Choose database** (SQLite for simple, PostgreSQL for scale)
- [ ] **Add database schema** (characters, projects, videos tables)
- [ ] **Update server.js** to save/load from database
- [ ] **Choose file storage** (local → R2/S3 for production)
- [ ] **Set up deployment** (Railway recommended)
- [ ] **Configure environment variables**
- [ ] **Add error monitoring** (Sentry optional)
- [ ] **Add rate limiting** (if multi-user)
- [ ] **Add authentication** (if multi-user, use Supabase Auth)

### Minimum Changes for Persistence:

1. **Install SQLite:**
   ```bash
   npm install better-sqlite3
   ```

2. **Add database file** (see SQLite example above)

3. **Update endpoints to save/load:**
   - Save character after analysis
   - Save project after scenario generation
   - Save video jobs with status

4. **Add endpoints for loading:**
   - `GET /api/characters` - list saved characters
   - `GET /api/projects` - list saved projects
   - `GET /api/characters/:id` - load specific character

---

## 🚀 Next Steps

1. **Decide on database** → SQLite for solo use
2. **Add persistence to server.js** → I can help with this
3. **Deploy to Railway** → Free tier, easy
4. **Test with real content** → Create Ms. Goblina memes!
5. **Iterate based on usage** → Upgrade as needed

---

**Questions? Let me know what direction you want to go!** 🧙‍♀️

