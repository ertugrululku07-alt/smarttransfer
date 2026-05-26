const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { clearTenantCache } = require('../middleware/tenant');

// In-memory translation cache (key: `${sourceLang}:${targetLang}:${text}`)
const translationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * POST /api/translate
 * Body: { texts: string[], targetLang: string, sourceLang?: string }
 * Uses DeepL API to translate texts
 */
router.post('/', async (req, res) => {
  try {
    const { texts, targetLang, sourceLang } = req.body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ success: false, error: 'texts array is required' });
    }
    if (!targetLang) {
      return res.status(400).json({ success: false, error: 'targetLang is required' });
    }
    if (texts.length > 50) {
      return res.status(400).json({ success: false, error: 'Maximum 50 texts per request' });
    }

    // Get DeepL API key from tenant settings
    const tenant = req.tenant;
    const settings = tenant?.settings || {};
    const deeplApiKey = settings.deeplApiKey || process.env.DEEPL_API_KEY;

    if (!deeplApiKey) {
      return res.status(400).json({
        success: false,
        error: 'DeepL API key not configured. Set it in Admin > Settings or DEEPL_API_KEY env var.'
      });
    }

    // Check cache first
    const results = [];
    const textsToTranslate = [];
    const textsIndices = [];

    for (let i = 0; i < texts.length; i++) {
      const cacheKey = `${sourceLang || 'auto'}:${targetLang}:${texts[i]}`;
      const cached = translationCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        results[i] = cached.translation;
      } else {
        textsToTranslate.push(texts[i]);
        textsIndices.push(i);
        results[i] = null;
      }
    }

    // If all are cached, return immediately
    if (textsToTranslate.length === 0) {
      return res.json({ success: true, data: { translations: results } });
    }

    // Determine DeepL API endpoint (free vs pro)
    const isFreeKey = deeplApiKey.endsWith(':fx');
    const baseUrl = isFreeKey
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    // Map language codes to DeepL format
    const deeplTargetLang = mapToDeepLLang(targetLang);
    const deeplSourceLang = sourceLang ? mapToDeepLLang(sourceLang) : undefined;

    // Call DeepL API
    const params = new URLSearchParams();
    textsToTranslate.forEach(t => params.append('text', t));
    params.append('target_lang', deeplTargetLang);
    if (deeplSourceLang) params.append('source_lang', deeplSourceLang);
    params.append('preserve_formatting', '1');

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${deeplApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepL API error:', response.status, errorText);
      return res.status(502).json({
        success: false,
        error: `DeepL API error: ${response.status}`,
        detail: errorText
      });
    }

    const data = await response.json();
    const translations = data.translations || [];

    // Fill results and update cache
    for (let i = 0; i < textsIndices.length; i++) {
      const idx = textsIndices[i];
      const translatedText = translations[i]?.text || textsToTranslate[i];
      results[idx] = translatedText;

      // Cache the result
      const cacheKey = `${sourceLang || 'auto'}:${targetLang}:${texts[idx]}`;
      translationCache.set(cacheKey, {
        translation: translatedText,
        timestamp: Date.now()
      });
    }

    return res.json({ success: true, data: { translations: results } });
  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({ success: false, error: 'Translation service error' });
  }
});

/**
 * POST /api/translate/batch
 * Body: { keys: Record<string, string>, targetLang: string, sourceLang?: string }
 * Translates a batch of key-value pairs (for locale file generation)
 */
router.post('/batch', async (req, res) => {
  try {
    const { keys, targetLang, sourceLang } = req.body;

    if (!keys || typeof keys !== 'object') {
      return res.status(400).json({ success: false, error: 'keys object is required' });
    }
    if (!targetLang) {
      return res.status(400).json({ success: false, error: 'targetLang is required' });
    }

    const tenant = req.tenant;
    const settings = tenant?.settings || {};
    const deeplApiKey = settings.deeplApiKey || process.env.DEEPL_API_KEY;

    if (!deeplApiKey) {
      return res.status(400).json({
        success: false,
        error: 'DeepL API key not configured.'
      });
    }

    const isFreeKey = deeplApiKey.endsWith(':fx');
    const baseUrl = isFreeKey
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const deeplTargetLang = mapToDeepLLang(targetLang);
    const deeplSourceLang = sourceLang ? mapToDeepLLang(sourceLang) : undefined;

    const entries = Object.entries(keys);
    const texts = entries.map(([, v]) => v);
    const keyNames = entries.map(([k]) => k);

    // Batch in chunks of 50
    const translated = {};
    for (let i = 0; i < texts.length; i += 50) {
      const chunk = texts.slice(i, i + 50);
      const chunkKeys = keyNames.slice(i, i + 50);

      const params = new URLSearchParams();
      chunk.forEach(t => params.append('text', t));
      params.append('target_lang', deeplTargetLang);
      if (deeplSourceLang) params.append('source_lang', deeplSourceLang);
      params.append('preserve_formatting', '1');

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${deeplApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(502).json({ success: false, error: `DeepL error: ${response.status}`, detail: errorText });
      }

      const data = await response.json();
      const translations = data.translations || [];

      for (let j = 0; j < chunkKeys.length; j++) {
        translated[chunkKeys[j]] = translations[j]?.text || chunk[j];
      }

      // Rate limit: small delay between chunks
      if (i + 50 < texts.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return res.json({ success: true, data: { translations: translated } });
  } catch (error) {
    console.error('Batch translation error:', error);
    return res.status(500).json({ success: false, error: 'Translation service error' });
  }
});

/**
 * GET /api/translate/usage
 * Returns DeepL API usage statistics
 */
router.get('/usage', async (req, res) => {
  try {
    const tenant = req.tenant;
    const settings = tenant?.settings || {};
    const deeplApiKey = settings.deeplApiKey || process.env.DEEPL_API_KEY;

    if (!deeplApiKey) {
      return res.status(400).json({ success: false, error: 'DeepL API key not configured.' });
    }

    const isFreeKey = deeplApiKey.endsWith(':fx');
    const baseUrl = isFreeKey
      ? 'https://api-free.deepl.com/v2/usage'
      : 'https://api.deepl.com/v2/usage';

    const response = await fetch(baseUrl, {
      headers: { 'Authorization': `DeepL-Auth-Key ${deeplApiKey}` }
    });

    if (!response.ok) {
      return res.status(502).json({ success: false, error: 'DeepL API error' });
    }

    const data = await response.json();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Usage check failed' });
  }
});

/**
 * POST /api/translate/settings
 * Body: { deeplApiKey: string }
 * Save DeepL API key to tenant settings
 */
router.post('/settings', async (req, res) => {
  try {
    const { deeplApiKey } = req.body;
    const tenant = req.tenant;

    if (!tenant) {
      return res.status(400).json({ success: false, error: 'Tenant not found' });
    }

    const currentSettings = tenant.settings || {};
    const updatedSettings = { ...currentSettings, deeplApiKey: deeplApiKey || null };

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { settings: updatedSettings }
    });

    // Clear tenant cache so subsequent requests use updated settings
    clearTenantCache(tenant.id, tenant.slug);

    return res.json({ success: true, message: 'DeepL API key saved.' });
  } catch (error) {
    console.error('Save DeepL settings error:', error);
    return res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

/**
 * GET /api/translate/settings
 * Get DeepL configuration status
 */
router.get('/settings', async (req, res) => {
  try {
    const tenant = req.tenant;
    const settings = tenant?.settings || {};
    const hasKey = !!(settings.deeplApiKey || process.env.DEEPL_API_KEY);
    const keySource = settings.deeplApiKey ? 'tenant' : (process.env.DEEPL_API_KEY ? 'env' : 'none');

    return res.json({
      success: true,
      data: {
        configured: hasKey,
        keySource,
        // Don't expose the full key, just show if it's free or pro
        keyType: hasKey ? ((settings.deeplApiKey || process.env.DEEPL_API_KEY || '').endsWith(':fx') ? 'free' : 'pro') : null,
        cacheSize: translationCache.size
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

// Map our locale codes to DeepL language codes
function mapToDeepLLang(lang) {
  const map = {
    'tr': 'TR',
    'en': 'EN',
    'de': 'DE',
    'ru': 'RU',
    'fr': 'FR',
    'es': 'ES',
    'it': 'IT',
    'pt': 'PT-PT',
    'nl': 'NL',
    'pl': 'PL',
    'ja': 'JA',
    'zh': 'ZH',
    'ko': 'KO',
    'ar': 'AR',
  };
  return map[lang.toLowerCase()] || lang.toUpperCase();
}

module.exports = router;
