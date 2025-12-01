# 🎥 Sora Video Sizes Guide

## Valid Sora 2 Sizes

Sora 2 only supports these specific video dimensions:

| Size | Aspect Ratio | Best For | Instagram |
|------|--------------|----------|-----------|
| **720x1280** | 9:16 (Portrait) | Instagram Reels, TikTok, Stories | ✅ Perfect |
| **1280x720** | 16:9 (Landscape) | YouTube, Horizontal videos | ❌ |
| **1024x1792** | 9:16 (Tall Portrait) | High-res portrait content | ✅ Works |
| **1792x1024** | 16:9 (Wide Landscape) | Cinematic, high-res landscape | ❌ |

---

## 📱 Instagram Content

### For Reels & Stories (Recommended):
```
720x1280
```

- Perfect 9:16 aspect ratio
- Optimized for mobile viewing
- Best for Ms. Goblina memes
- Native Instagram format

### Alternative (Higher Quality):
```
1024x1792
```

- Also 9:16 aspect ratio
- Higher resolution
- May take longer to generate
- Instagram will downscale to 1080x1920

---

## 🎬 How Auto-Mapping Works

The system automatically maps any requested size to the nearest valid Sora size.

### Examples:

**Request:** `1080x1920` (Instagram Reels native)  
**Mapped to:** `720x1280` (closest portrait format)

**Request:** `1920x1080` (YouTube standard)  
**Mapped to:** `1280x720` (landscape format)

**Request:** `1024x1024` (Square)  
**Mapped to:** `720x1280` (default portrait)

**Request:** `2560x1440` (Wide)  
**Mapped to:** `1792x1024` (wide landscape)

---

## 🔧 What Happens Behind the Scenes

```javascript
1. User uploads character image (any size)
   ↓
2. System detects: 1080x1920 (Instagram format)
   ↓
3. Maps to valid Sora size: 720x1280
   ↓
4. Resizes image to 720x1280 (Sharp)
   ↓
5. Sends to Sora with size: 720x1280
   ↓
6. Sora generates video at 720x1280
```

### Why Resize Images?

- Sora works best when image size matches video size
- Prevents aspect ratio distortion
- Ensures character consistency
- Optimizes generation quality

---

## 💡 Recommendations

### For Ms. Goblina Content:

**Use:** `720x1280`

**Reasons:**
- ✅ Perfect for Instagram Reels
- ✅ Faster generation
- ✅ Lower cost
- ✅ Mobile-optimized
- ✅ No quality loss for Instagram

### When to Use Higher Res:

**Use:** `1024x1792`

**Only if:**
- Need extra detail
- Creating high-res archives
- Planning to upscale later
- Using for other platforms

**Note:** Instagram downscales to 1080x1920 anyway, so 720x1280 is usually sufficient.

---

## 🎨 Aspect Ratio Guide

### Portrait (9:16):
- **720x1280** ← Recommended
- **1024x1792** ← High quality

**Best for:**
- Instagram Reels
- TikTok
- Snapchat
- Instagram Stories
- Mobile viewing

### Landscape (16:9):
- **1280x720** ← Standard
- **1792x1024** ← High quality

**Best for:**
- YouTube
- Desktop viewing
- Horizontal screens
- Cinematic content

---

## 🐛 Error Messages

### "Invalid value: '1080x1920'"

**Problem:** Requested size not supported by Sora

**Solution:** System now auto-maps to `720x1280`

**Fixed!** ✅

### "Invalid value: '1024x1024'"

**Problem:** Square format not supported

**Solution:** System maps to `720x1280` (portrait default)

**Fixed!** ✅

---

## 🔄 Size Selection in UI

### Simple Generator:

Now uses dropdown instead of text input:

```
Size (WxH)
┌─────────────────────────────────────────────┐
│ 720x1280 (Portrait 9:16 - Instagram Reels) │ ▼
├─────────────────────────────────────────────┤
│ 720x1280 (Portrait 9:16 - Instagram Reels) │
│ 1280x720 (Landscape 16:9)                  │
│ 1024x1792 (Tall Portrait)                  │
│ 1792x1024 (Wide Landscape)                 │
└─────────────────────────────────────────────┘
```

**Benefits:**
- No more invalid sizes
- Clear descriptions
- Shows aspect ratios
- Recommends Instagram format

---

## 📊 Size Comparison

### Visual Reference:

```
720x1280          1024x1792
(Standard)        (High Quality)

┌──────┐         ┌────────┐
│      │         │        │
│      │         │        │
│      │         │        │
│  9:16│         │  9:16  │
│      │         │        │
│      │         │        │
│      │         │        │
└──────┘         └────────┘

1280x720          1792x1024
(Standard)        (High Quality)

┌─────────────┐   ┌───────────────────┐
│             │   │                   │
│    16:9     │   │      16:9         │
│             │   │                   │
└─────────────┘   └───────────────────┘
```

---

## 🎯 Quick Reference

### I want to create:

**Instagram Reels/Stories:**
→ Use `720x1280`

**TikTok content:**
→ Use `720x1280`

**YouTube videos:**
→ Use `1280x720`

**High-quality archives:**
→ Use `1024x1792` (portrait) or `1792x1024` (landscape)

**Not sure:**
→ Use `720x1280` (safe default)

---

## 🔧 Technical Details

### Auto-Mapping Algorithm:

```javascript
function mapToValidSoraSize(requestedSize) {
  1. Parse width x height
  2. Calculate aspect ratio (width / height)
  3. Determine orientation (portrait or landscape)
  4. Find closest valid Sora size with same orientation
  5. Return valid size name
}
```

### Orientation Detection:

```javascript
if (height > width) {
  orientation = "portrait"
  → Map to 720x1280 or 1024x1792
} else {
  orientation = "landscape"
  → Map to 1280x720 or 1792x1024
}
```

---

## 📝 Best Practices

### ✅ Do:
- Use `720x1280` for Instagram content
- Match image size to video size (auto-handled)
- Choose orientation based on platform
- Use dropdown in Simple Generator

### ❌ Don't:
- Request custom sizes (will be mapped anyway)
- Use square formats (not supported)
- Upscale unnecessarily (costs more, no benefit)
- Assume 1080x1920 is valid (it's not!)

---

## 🚀 Summary

**For Ms. Goblina Instagram Reels:**

```
Use: 720x1280
Why: Perfect for Instagram, fast, cost-effective
```

**System automatically:**
- Maps any size to valid Sora format
- Resizes images to match
- Optimizes for quality

**No more errors!** ✅

---

## 🆘 Still Have Issues?

If you see size-related errors:

1. **Check the dropdown** - Use valid sizes only
2. **Let auto-detection work** - Don't force custom sizes
3. **Restart server** - Ensure latest code is running
4. **Check logs** - See what size was actually sent

---

**Updated and working!** 🎉

All size issues are now handled automatically.

