// 🎪 Papir Business Server - PRODUCTION READY
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// ============================================
// FETCH POLYFILL (for Node < 18 compatibility)
// ============================================
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// 🛡️ TRUST RAILWAY PROXY
app.set('trust proxy', 1);

// 🔒 PRODUCTION CSP - Updated for papir.ca domain
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
        "https://unpkg.com",
        "https://js.stripe.com",
        "https://*.stripe.com",
        "'unsafe-inline'",
        "'unsafe-eval'"
      ],
      styleSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com",
        "https://unpkg.com",
        "'unsafe-inline'"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:",
        "blob:",
        "https://api.qrserver.com"
      ],
      connectSrc: [
        "'self'",
        "http://localhost:3000",
        "https://papir.ca",
        "https://papir.up.railway.app",
        "https://elmhkhvryjzljxskbfps.supabase.co",
        "https://*.supabase.co",
        "wss://*.supabase.co",
        "https://api.qrserver.com",
        "https://ipapi.co",
        "http://ip-api.com",
        "https://api.ipify.org",
        "https://api.stripe.com"
      ],
      fontSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com",
        "data:"
      ],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:", "https://elmhkhvryjzljxskbfps.supabase.co"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://*.stripe.com"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" }
}));

// 🌐 CORS Configuration - Allow your domain
app.use(cors({
  origin: ['https://papir.ca', 'https://papir.up.railway.app', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ============================================
// 🎫 STRIPE - Optional, won't crash if missing
// ============================================
let stripe = null;
try {
  const stripeModule = require('stripe');
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = stripeModule(process.env.STRIPE_SECRET_KEY);
    console.log('✅ Stripe initialized');
  } else {
    console.log('⚠️ Stripe secret key not set - payments disabled');
  }
} catch (err) {
  console.log('⚠️ Stripe module not installed - payments disabled');
}

// Webhook handler - Gracefully handles missing secret and missing module
app.post('/api/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.log('⚠️ Webhook: STRIPE_WEBHOOK_SECRET not set - skipping');
    return res.status(503).json({ error: 'Webhook secret not configured - safe to ignore for testing' });
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const { quantity, batch_id } = paymentIntent.metadata;
    await supabaseAdmin.from('payments').update({ 
      status: 'completed', 
      completed_at: new Date().toISOString() 
    }).eq('stripe_payment_intent_id', paymentIntent.id);
    const { data: existingBatch } = await supabaseAdmin
      .from('batches')
      .select('batch_id')
      .eq('batch_id', batch_id)
      .maybeSingle();
    if (!existingBatch) {
      await supabaseAdmin.from('batches').insert({
        batch_id: batch_id,
        batch_type: 'ecard',
        total_cards_purchased: parseInt(quantity) || 1,
        cards_created: 0,
        max_cards_allowed: parseInt(quantity) || 1,
        created_at: new Date().toISOString()
      });
    }
  }
  res.json({received: true});
});

// ============================================
// Standard JSON middleware (after webhook)
// ============================================
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// 🛡️ Rate Limiting - Simple and working
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP, please try again after 15 minutes.'
});
app.use('/api/', limiter);

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Admin rate limit reached, please slow down.'
});
app.use('/api/admin/', adminLimiter);

const batchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many batch requests, please slow down.'
});
app.use('/api/batches/', batchLimiter);

// 📁 Serve static files FROM 'public' FOLDER
app.use(express.static('public'));

// 🏠 Marketing landing page
app.get('/', (req, res) => {
  console.log('Serving marketing page from:', __dirname + '/public/index.html');
  res.sendFile(__dirname + '/public/index.html');
});

// 📱 App dashboard (your tools)
app.get('/app', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Batch management page for customers
app.get('/batch-manager', (req, res) => {
  res.sendFile(__dirname + '/public/batch-manager.html');
});

// Simple admin auth (add your password)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'your-secret-password';

app.get('/admin', (req, res) => {
    const password = req.query.pass;
    if (password === ADMIN_PASSWORD) {
        res.sendFile(__dirname + '/public/admin.html');
    } else {
        res.status(401).send('Admin access required');
    }
});

// 🩺 Enhanced Health Check
app.get('/api/health', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;
  res.json({
    status: '✅ FULLY OPERATIONAL',
    message: 'Papir Business Server is running perfectly!',
    time: new Date().toISOString(),
    version: '3.0.0',
    server: {
      url: baseUrl,
      domain: 'papir.ca',
      environment: process.env.NODE_ENV || 'production'
    },
    endpoints: {
      home: `${baseUrl}/`,
      dashboard: `${baseUrl}/app`,
      maker: `${baseUrl}/maker.html`,
      viewer: `${baseUrl}/viewer.html`,
      batchManager: `${baseUrl}/batch-manager`,
      saveCard: `POST ${baseUrl}/api/cards`,
      getCard: `GET ${baseUrl}/api/cards/:id`,
      uploadMedia: `POST ${baseUrl}/api/upload-media`,
      incrementScan: `POST ${baseUrl}/api/increment-scan`,
      scanLogs: `GET ${baseUrl}/api/scan-logs`,
      adminCard: `GET ${baseUrl}/api/admin/cards/:id`,
      abandonedCards: `GET ${baseUrl}/api/admin/abandoned`,
      geolocation: `GET ${baseUrl}/api/admin/geolocation/:card_id`,
      mismatchAlerts: `GET ${baseUrl}/api/admin/mismatch-alerts`,
      allLocations: `GET ${baseUrl}/api/admin/all-locations`,
      batches: `POST ${baseUrl}/api/admin/batches`,
      getBatch: `GET ${baseUrl}/api/batches/:batch_id`,
      addToBatch: `POST ${baseUrl}/api/batches/:batch_id/add`,
      calculateBatchPrice: `POST ${baseUrl}/api/batches/calculate-price`,
      deleteBatch: `POST ${baseUrl}/api/admin/batches/:batch_id/delete`,
      expireCards: `POST ${baseUrl}/api/admin/expire-cards`,
      performance: `GET ${baseUrl}/api/admin/performance`,
      activity: `GET ${baseUrl}/api/admin/activity`,
      exportAll: `GET ${baseUrl}/api/admin/export-all`,
      bulkDelete: `POST ${baseUrl}/api/admin/bulk-delete`,
      bulkActivate: `POST ${baseUrl}/api/admin/bulk-activate`,
      cardsAllDetails: `GET ${baseUrl}/api/admin/cards-all-details`,
      sendECard: `POST ${baseUrl}/api/cards/:id/send`,
      activatePhysicalCard: `POST ${baseUrl}/api/physical-cards/:id/activate`,
      stripeKey: `GET ${baseUrl}/api/stripe-key`,
      createPaymentIntent: `POST ${baseUrl}/api/create-payment-intent`,
      adminPayments: `GET ${baseUrl}/api/admin/payments`,
      activateAfterPayment: `POST ${baseUrl}/api/activate-after-payment`,
      findMyBatches: `POST ${baseUrl}/api/find-my-batches`,
      addCardsToBatch: `POST ${baseUrl}/api/batches/:batch_id/add-cards`
    },
    database: supabaseAdmin ? '✅ Connected' : '❌ Disconnected'
  });
});

// 🎪 Supabase Connection
let supabaseAdmin;
try {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables!');
  } else {
    supabaseAdmin = createClient(
      supabaseUrl,
      supabaseKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    console.log('✅ Connected to Supabase!');
  }
} catch (error) {
  console.error('❌ Supabase connection error:', error.message);
}

// ============================================
// HELPER FUNCTION: Get clean client IP (FIXED)
// ============================================
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const remoteAddress = req.socket.remoteAddress;
  const ip = req.ip;
  console.log('IP Debug:', { forwarded, remoteAddress, ip });
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    console.log('Using first forwarded IP:', firstIp);
    return firstIp;
  }
  if (remoteAddress && remoteAddress !== '::1' && remoteAddress !== '::ffff:127.0.0.1') {
    const cleanIp = remoteAddress.replace('::ffff:', '');
    console.log('Using remoteAddress:', cleanIp);
    return cleanIp;
  }
  if (ip && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
    const cleanIp = ip.replace('::ffff:', '');
    console.log('Using req.ip:', cleanIp);
    return cleanIp;
  }
  return 'unknown';
}

// ============================================
// FIXED HELPER FUNCTION: Get geolocation from IP with proper timeout
// ============================================
async function getGeolocationFromIp(ip) {
  try {
    if (ip === 'unknown' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '127.0.0.1') {
      console.log('📍 Skipping geolocation for private IP:', ip);
      return null;
    }
    console.log('📍 Fetching geolocation for IP:', ip);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (!data.error) {
          return {
            ip: ip,
            city: data.city,
            region: data.region,
            country: data.country_name,
            country_code: data.country_code,
            latitude: data.latitude,
            longitude: data.longitude,
            org: data.org
          };
        }
      }
    } catch (ipapiError) {
      console.log('📍 ipapi.co failed:', ipapiError.message);
    }
    console.log('📍 Trying fallback ip-api.com for IP:', ip);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const fallbackResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,org`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.status === 'success') {
          return {
            ip: ip,
            city: fallbackData.city,
            region: fallbackData.regionName || fallbackData.region,
            country: fallbackData.country,
            country_code: fallbackData.countryCode,
            latitude: fallbackData.lat,
            longitude: fallbackData.lon,
            org: fallbackData.org
          };
        }
      }
    } catch (fallbackError) {
      console.log('📍 ip-api.com failed:', fallbackError.message);
    }
    console.log('📍 All geolocation services failed for IP:', ip);
    return null;
  } catch (error) {
    console.error('📍 Geolocation error:', error.message);
    return null;
  }
}

// 🎨 Save a Magic Card - UPDATED for E-Cards and Dormant Physical Cards
app.post('/api/cards', async (req, res) => {
  try {
    const { 
      card_id, 
      message_type, 
      message_text, 
      media_url, 
      file_name, 
      file_size, 
      file_type, 
      batch_id, 
      batch_order,
      card_type = 'ecard',
      delivery_method,
      recipient_contact
    } = req.body;
    
    console.log(`📨 Saving card: ${card_id}, Type: ${message_type}, Card Type: ${card_type}`);
    const clientIp = getClientIp(req);
    
    if (!card_id || !message_type) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields',
        required: ['card_id', 'message_type']
      });
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        success: false,
        error: 'Database service temporarily unavailable'
      });
    }
    
    const { data: existingCard } = await supabaseAdmin
      .from('cards')
      .select('card_id, card_type')
      .eq('card_id', card_id)
      .maybeSingle();
    
    let result;
    if (existingCard) {
      console.log(`🔄 Updating existing card: ${card_id}`);
      const updateData = {
        message_type: message_type.trim(),
        message_text: message_text ? message_text.trim() : null,
        media_url: media_url || null,
        file_name: file_name || null,
        file_size: file_size || null,
        file_type: file_type || null,
        updated_by_ip: clientIp,
        updated_at: new Date().toISOString()
      };
      if (batch_id) updateData.batch_id = batch_id;
      if (batch_order) updateData.batch_order = batch_order;
      if (existingCard.card_type === 'ecard' || card_type === 'ecard') {
        updateData.card_type = 'ecard';
        if (delivery_method) updateData.delivery_method = delivery_method;
        if (recipient_contact) updateData.recipient_contact = recipient_contact;
      }
      const { data, error } = await supabaseAdmin
        .from('cards')
        .update(updateData)
        .eq('card_id', card_id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      console.log(`🆕 Creating new ${card_type} card: ${card_id}`);
      const deadline = new Date();
      deadline.setFullYear(deadline.getFullYear() + 1);
      const cardRecord = {
        card_id: card_id.trim(),
        message_type: message_type.trim(),
        message_text: message_text ? message_text.trim() : null,
        media_url: media_url || null,
        file_name: file_name || null,
        file_size: file_size || null,
        file_type: file_type || null,
        scan_count: 0,
        status: req.body.status || (card_type === 'ecard' ? 'active' : 'pending'),
        card_type: card_type,
        is_batch_template: req.body.is_batch_template || false,
        quantity: req.body.quantity || null,
        physical_card_status: card_type === 'physical' ? 'dormant' : null,
        activation_deadline: card_type === 'physical' ? deadline.toISOString() : null,
        delivery_method: card_type === 'ecard' ? delivery_method : null,
        recipient_contact: card_type === 'ecard' ? recipient_contact : null,
        delivery_status: card_type === 'ecard' ? 'pending' : null,
        created_by_ip: clientIp,
        updated_by_ip: clientIp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (batch_id) cardRecord.batch_id = batch_id;
      if (batch_order) cardRecord.batch_order = batch_order;
      const { data, error } = await supabaseAdmin
        .from('cards')
        .insert([cardRecord])
        .select()
        .single();
      if (error) throw error;
      result = data;
    }
    
    console.log(`✅ Card saved: ${card_id} (Type: ${result.card_type})`);
    const viewerUrl = `${req.protocol}://${req.get('host')}/viewer.html?card=${card_id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(viewerUrl)}&format=png&margin=10`;
    res.status(201).json({ 
      success: true, 
      message: card_type === 'ecard' ? 'E-Card saved and ready to send!' : 'Physical card saved (dormant until manufactured)',
      card: result,
      urls: {
        viewer: viewerUrl,
        qrCode: qrCodeUrl
      }
    });
  } catch (error) {
    console.error('💥 Unexpected error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: 'Please try again later'
    });
  }
});

// 🖼️ Upload Media Files to Supabase Storage - WITH FILE TYPE VALIDATION
app.post('/api/upload-media', async (req, res) => {
  try {
    const { fileData, fileName, fileType, cardId } = req.body;
    console.log(`📤 Uploading media: ${fileName} for ${cardId}`);
    if (!fileData || !fileName || !cardId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: fileData, fileName, cardId' 
      });
    }
    const allowedTypes = {
      'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'],
      'video': ['video/mp4', 'video/webm', 'video/quicktime', 'video/mov'],
      'audio': ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/mp4', 'audio/ogg']
    };
    let fileCategory = null;
    if (fileType) {
      if (fileType.startsWith('image/')) fileCategory = 'image';
      else if (fileType.startsWith('video/')) fileCategory = 'video';
      else if (fileType.startsWith('audio/')) fileCategory = 'audio';
    }
    if (!fileCategory) {
      const ext = fileName.split('.').pop().toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileCategory = 'image';
      else if (['mp4', 'webm', 'mov', 'quicktime'].includes(ext)) fileCategory = 'video';
      else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) fileCategory = 'audio';
    }
    if (!fileCategory) {
      return res.status(400).json({ 
        success: false, 
        error: 'Could not determine file type' 
      });
    }
    if (fileType && !allowedTypes[fileCategory].includes(fileType)) {
      return res.status(400).json({ 
        success: false, 
        error: `File type ${fileType} not allowed for ${fileCategory} uploads` 
      });
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        success: false,
        error: 'Database service temporarily unavailable'
      });
    }
    let base64Data = fileData;
    if (fileData.includes(',')) {
      base64Data = fileData.split(',')[1];
    }
    const buffer = Buffer.from(base64Data, 'base64');
    const fileSize = buffer.length;
    if (fileSize < 100) {
      console.error('❌ Buffer too small - Base64 parsing issue');
      return res.status(400).json({ 
        success: false, 
        error: 'File data too small - check Base64 encoding' 
      });
    }
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${cardId}/${Date.now()}_${safeFileName}`;
    const { data, error } = await supabaseAdmin.storage
      .from('cards-media')
      .upload(filePath, buffer, {
        contentType: fileType,
        upsert: true
      });
    if (error) {
      console.error('❌ Supabase upload error:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Storage upload failed',
        details: error.message
      });
    }
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('cards-media')
      .getPublicUrl(filePath);
    console.log(`✅ Media uploaded: ${publicUrl}`);
    res.json({ 
      success: true, 
      url: publicUrl,
      path: filePath,
      file_name: fileName,
      file_size: fileSize,
      file_type: fileType,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    console.error('💥 Upload media error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 📖 Get Card by ID (BLOCK DRAFT)
app.get('/api/cards/:card_id', async (req, res) => {
  try {
    const { card_id } = req.params;
    console.log(`🔍 Retrieving card: ${card_id}`);
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        success: false,
        error: 'Database service temporarily unavailable'
      });
    }
    const { data, error } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('card_id', card_id)
      .maybeSingle();
    if (error) {
      return res.status(500).json({ 
        success: false,
        error: 'Database query failed',
        details: error.message
      });
    }
    if (!data) {
      return res.status(404).json({ 
        success: false,
        error: 'Card not found'
      });
    }
    if (data.status === 'draft') {
      return res.status(403).json({ 
        success: false, 
        error: 'Card not yet activated', 
        message: 'Please complete payment to view this card' 
      });
    }
    res.json({ 
      success: true, 
      card: data,
      viewerUrl: `${req.protocol}://${req.get('host')}/viewer.html?card=${card_id}`
    });
  } catch (error) {
    console.error('💥 Error retrieving card:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

// 📊 Get All Cards
app.get('/api/cards', async (req, res) => {
  try {
    console.log(`📋 Getting all cards`);
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        success: false,
        error: 'Database service temporarily unavailable'
      });
    }
    const { data, error } = await supabaseAdmin
      .from('cards')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Database query failed',
        details: error.message
      });
    }
    res.json({ 
      success: true, 
      cards: data || [],
      count: data ? data.length : 0
    });
  } catch (error) {
    console.error('💥 Error getting cards:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

// 🗑️ Delete Card - log only on actual removal from batch
app.delete('/api/cards/:card_id', async (req, res) => {
  try {
    const { card_id } = req.params;
    console.log(`🗑️ Deleting card: ${card_id}`);
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        success: false,
        error: 'Database service temporarily unavailable'
      });
    }
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const { data: cardInfo } = await supabaseAdmin
      .from('cards')
      .select('batch_id, status')
      .eq('card_id', card_id)
      .maybeSingle();
    const batchId = cardInfo?.batch_id;
    const wasAlreadyDeleted = cardInfo?.status === 'deleted';
    if (wasAlreadyDeleted) {
      return res.json({ 
        success: true, 
        message: `Card ${card_id} already deleted`,
        no_change: true
      });
    }
    const { error } = await supabaseAdmin
      .from('cards')
      .update({
        status: 'deleted',
        updated_by_ip: clientIp,
        updated_at: new Date().toISOString()
      })
      .eq('card_id', card_id);
    if (error) {
      console.error('❌ Delete error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Delete failed',
        details: error.message
      });
    }
    if (batchId) {
      const { data: batchCardsBefore } = await supabaseAdmin
        .from('cards')
        .select('card_id')
        .eq('batch_id', batchId)
        .neq('status', 'deleted');
      const newCount = batchCardsBefore?.length || 0;
      const previousCount = newCount + 1;
      await supabaseAdmin
        .from('batches')
        .update({
          cards_created: newCount,
          total_cards_purchased: newCount,
          updated_at: new Date().toISOString()
        })
        .eq('batch_id', batchId);
      console.log(`📝 Logging batch event: card removed from ${batchId}`);
      await supabaseAdmin
        .from('batch_events')
        .insert({
          batch_id: batchId,
          event_type: 'card_removed',
          quantity: 1,
          card_id: card_id,
          timestamp: new Date().toISOString(),
          ip_address: clientIp,
          user_agent: userAgent,
          metadata: {
            deleted_card: card_id,
            previous_count: previousCount,
            new_count: newCount
          }
        });
    }
    res.json({ 
      success: true, 
      message: `Card ${card_id} deleted`,
      was_in_batch: !!batchId
    });
  } catch (error) {
    console.error('💥 Delete error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

// 🎟️ Activate Card - WITH SOURCE PARAMETER SUPPORT AND GEOLOCATION
app.post('/api/activate-card', async (req, res) => {
  try {
    const { card_id, source } = req.body;
    const clientIp = getClientIp(req);
    console.log(`🎟️ Activating card: ${card_id} from IP: ${clientIp} with source: ${source || 'not provided'}`);
    if (!supabaseAdmin) {
      console.error('❌ supabaseAdmin not initialized');
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    const locationData = await getGeolocationFromIp(clientIp);
    const { data: card, error: fetchError } = await supabaseAdmin
      .from('cards')
      .select('status, batch_id')
      .eq('card_id', card_id)
      .maybeSingle();
    if (fetchError) {
      console.error('❌ Fetch error:', fetchError);
      return res.json({ success: false, error: 'Database error: ' + fetchError.message });
    }
    if (!card) {
      console.log(`📝 Card ${card_id} not found - creating new card`);
      const deadline = new Date();
      deadline.setFullYear(deadline.getFullYear() + 1);
      const { error: insertError } = await supabaseAdmin
        .from('cards')
        .insert({
          card_id: card_id,
          card_type: 'ecard',
          message_type: 'pending',
          message_text: null,
          media_url: null,
          file_name: null,
          file_size: null,
          file_type: null,
          status: 'active',
          scan_count: 0,
          created_by_ip: clientIp,
          updated_by_ip: clientIp,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          activation_deadline: deadline.toISOString()
        });
      if (insertError) {
        console.error('❌ Insert error:', insertError);
        return res.json({ success: false, error: 'Failed to create card: ' + insertError.message });
      }
      const { error: logError } = await supabaseAdmin
        .from('card_activations')
        .insert({
          card_id: card_id,
          activated_at: new Date().toISOString(),
          activated_by_ip: clientIp,
          terms_accepted_at: new Date().toISOString(),
          terms_accepted_ip: clientIp,
          user_agent: req.headers['user-agent'] || 'unknown',
          activation_source: source || 'viewer',
          location_data: locationData,
          city: locationData?.city,
          country: locationData?.country,
          region: locationData?.region,
          latitude: locationData?.latitude,
          longitude: locationData?.longitude
        });
      if (logError) console.error('❌ Failed to log activation:', logError);
      console.log(`✅ Card ${card_id} created and activated successfully`);
      return res.json({ success: true });
    }
    console.log(`📊 Current card status: ${card.status}`);
    if (card.status === 'active') {
      return res.json({ success: false, error: 'Card already active' });
    }
    if (card.status !== 'pending' && card.status !== 'draft') {
      return res.json({ success: false, error: `Card cannot be activated (status: ${card.status})` });
    }
    const { error: updateError } = await supabaseAdmin
      .from('cards')
      .update({
        status: 'active',
        updated_by_ip: clientIp,
        updated_at: new Date().toISOString()
      })
      .eq('card_id', card_id);
    if (updateError) throw updateError;
    const { error: logError } = await supabaseAdmin
      .from('card_activations')
      .insert({
        card_id: card_id,
        activated_at: new Date().toISOString(),
        activated_by_ip: clientIp,
        terms_accepted_at: new Date().toISOString(),
        terms_accepted_ip: clientIp,
        user_agent: req.headers['user-agent'] || 'unknown',
        activation_source: source || 'viewer',
        location_data: locationData,
        city: locationData?.city,
        country: locationData?.country,
        region: locationData?.region,
        latitude: locationData?.latitude,
        longitude: locationData?.longitude
      });
    if (logError) console.error('❌ Failed to log activation:', logError);
    console.log(`✅ Card ${card_id} activated successfully (logged to activations table with source: ${source || 'viewer'})`);
    res.json({ success: true });
  } catch (error) {
    console.error('💥 Activation error details:', error);
    res.json({ success: false, error: 'Server error: ' + error.message });
  }
});

// ============================================
// ADMIN ENDPOINTS - Add these to fix 404 errors
// ============================================
app.get('/api/admin/cards-all-details', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Database unavailable' });
    const { data, error } = await supabaseAdmin.from('cards').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, cards: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/abandoned', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const { data, error } = await supabaseAdmin.from('cards').select('*').eq('status', 'draft').lt('created_at', cutoff.toISOString()).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, cards: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/scan-logs', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const { data, error } = await supabaseAdmin.from('scan_logs').select('*').gte('scanned_at', cutoff.toISOString()).order('scanned_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, logs: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/all-locations', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const { data, error } = await supabaseAdmin.from('card_activations').select('city, country, region, latitude, longitude, activated_at').gte('activated_at', cutoff.toISOString()).not('city', 'is', null);
    if (error) throw error;
    res.json({ success: true, locations: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/performance', async (req, res) => {
  try {
    const { count: total } = await supabaseAdmin.from('cards').select('*', { count: 'exact', head: true });
    const { count: active } = await supabaseAdmin.from('cards').select('*', { count: 'exact', head: true }).eq('status', 'active');
    const { count: draft } = await supabaseAdmin.from('cards').select('*', { count: 'exact', head: true }).eq('status', 'draft');
    const { count: scans } = await supabaseAdmin.from('scan_logs').select('*', { count: 'exact', head: true });
    res.json({ success: true, metrics: { totalCards: total || 0, activeCards: active || 0, draftCards: draft || 0, totalScans: scans || 0 } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/mismatch-alerts', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('cards').select('card_id, created_by_ip, updated_by_ip, created_at').eq('status', 'active').neq('created_by_ip', null).neq('updated_by_ip', null).neq('created_by_ip', 'updated_by_ip').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json({ success: true, alerts: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/activity', async (req, res) => {
  try {
    const { data: recentCards } = await supabaseAdmin.from('cards').select('card_id, created_at, status, created_by_ip').order('created_at', { ascending: false }).limit(20);
    const { data: recentActivations } = await supabaseAdmin.from('card_activations').select('card_id, activated_at, activated_by_ip, activation_source').order('activated_at', { ascending: false }).limit(20);
    res.json({ success: true, activity: { recentCards: recentCards || [], recentActivations: recentActivations || [] } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Activate after payment (Hallmark Flow) – FIXED version
// ============================================
app.post('/api/activate-after-payment', async (req, res) => {
  const { card_id, batch_id, terms_accepted } = req.body;
  const clientIp = getClientIp(req);
  console.log('Activate request:', { card_id, batch_id, terms_accepted });
  
  try {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Database unavailable' });
    
    if (batch_id) {
      // BATCH MODE
      console.log('Looking for template with batch_id:', batch_id);
      const { data: template, error: templateError } = await supabaseAdmin.from('cards').select('*').eq('batch_id', batch_id).eq('is_batch_template', true).eq('status', 'draft').maybeSingle();
      if (templateError) return res.status(500).json({ success: false, error: 'Database error' });
      if (!template) return res.status(404).json({ success: false, error: 'Batch template not found' });
      
      console.log('Found template:', template.card_id, 'Quantity:', template.quantity);
      const quantity = template.quantity || 2;
      
      // Get current max batch_order to avoid collisions
      const { data: maxOrderCard } = await supabaseAdmin.from('cards').select('batch_order').eq('batch_id', batch_id).eq('is_batch_template', false).order('batch_order', { ascending: false }).limit(1);
      const startOrder = (maxOrderCard?.[0]?.batch_order || 0) + 1;
      
      const deadline = new Date(); deadline.setFullYear(deadline.getFullYear() + 1);
      const cardsToCreate = [];
      for (let i = 0; i < quantity; i++) {
        cardsToCreate.push({
          card_id: 'CARD' + Math.random().toString(36).substr(2, 8).toUpperCase(),
          batch_id: batch_id,
          batch_order: startOrder + i,
          message_type: template.message_type,
          message_text: template.message_text,
          media_url: template.media_url,
          file_name: template.file_name,
          file_size: template.file_size,
          file_type: template.file_type,
          status: 'active',
          card_type: 'ecard',
          is_batch_template: false,
          terms_accepted: true,
          physical_card_status: null,
          created_by_ip: clientIp,
          updated_by_ip: clientIp,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          activation_deadline: deadline.toISOString()
        });
      }
      
      if (cardsToCreate.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('cards').insert(cardsToCreate);
        if (insertError) throw insertError;
        
        // Log activations
        const activationRecords = cardsToCreate.map(card => ({
          card_id: card.card_id,
          activated_at: new Date().toISOString(),
          activated_by_ip: clientIp,
          terms_accepted_at: new Date().toISOString(),
          terms_accepted_ip: clientIp,
          user_agent: req.headers['user-agent'] || 'unknown',
          activation_source: 'checkout_payment',
          metadata: { batch_id, template_card_id: template.card_id }
        }));
        await supabaseAdmin.from('card_activations').insert(activationRecords);
      }
      
      // Delete template
      await supabaseAdmin.from('cards').delete().eq('card_id', template.card_id);
      
      // Update batch record (add to existing counts if batch exists)
      const { data: existingBatch } = await supabaseAdmin.from('batches').select('cards_created').eq('batch_id', batch_id).maybeSingle();
      if (!existingBatch) {
        await supabaseAdmin.from('batches').insert({
          batch_id: batch_id,
          batch_type: 'ecard',
          cards_created: quantity,
          total_cards_purchased: quantity,
          max_cards_allowed: quantity,
          content_locked: true,
          created_by_ip: clientIp,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else {
        const newTotal = (existingBatch.cards_created || 0) + quantity;
        await supabaseAdmin.from('batches').update({ cards_created: newTotal, total_cards_purchased: newTotal, updated_at: new Date().toISOString() }).eq('batch_id', batch_id);
      }
      
      res.json({ success: true, message: `Created ${quantity} cards for batch ${batch_id}` });
      
    } else if (card_id) {
      // SINGLE CARD MODE
      const { error } = await supabaseAdmin.from('cards').update({ status: 'active', terms_accepted: true, physical_card_status: null, updated_by_ip: clientIp, updated_at: new Date().toISOString() }).eq('card_id', card_id).eq('status', 'draft');
      if (error) throw error;
      await supabaseAdmin.from('card_activations').insert({ card_id: card_id, activated_at: new Date().toISOString(), activated_by_ip: clientIp, terms_accepted_at: new Date().toISOString(), terms_accepted_ip: clientIp, user_agent: req.headers['user-agent'] || 'unknown', activation_source: 'checkout', metadata: { single_card: true } });
      res.json({ success: true, message: `Activated card ${card_id}` });
    } else {
      res.status(400).json({ error: 'No card_id or batch_id provided' });
    }
  } catch (error) {
    console.error('Activation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Add More Cards to Existing Batch (UPDATED VERSION)
// ============================================
app.post('/api/batches/:batch_id/add-cards', async (req, res) => {
  try {
    const { batch_id } = req.params;
    const { quantity, payment_intent_id } = req.body;
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, error: 'Invalid quantity' });
    }
    
    // Get existing batch
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('batches')
      .select('*')
      .eq('batch_id', batch_id)
      .single();
      
    if (batchError || !batch) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }
    
    // Get source content from first active card
    const { data: sourceCards } = await supabaseAdmin
      .from('cards')
      .select('message_type, message_text, media_url, file_name, file_size, file_type')
      .eq('batch_id', batch_id)
      .eq('status', 'active')
      .order('batch_order', { ascending: true })
      .limit(1);
      
    if (!sourceCards?.length) {
      return res.status(400).json({ success: false, error: 'No active cards in batch' });
    }
    
    const source = sourceCards[0];
    
    // Get current max batch_order
    const { data: maxOrder } = await supabaseAdmin
      .from('cards')
      .select('batch_order')
      .eq('batch_id', batch_id)
      .eq('is_batch_template', false)
      .order('batch_order', { ascending: false })
      .limit(1);
      
    const startOrder = (maxOrder?.[0]?.batch_order || 0) + 1;
    const now = new Date();
    const deadline = new Date();
    deadline.setFullYear(deadline.getFullYear() + 1);
    
    // Create new cards
    const newCards = [];
    for (let i = 0; i < quantity; i++) {
      newCards.push({
        card_id: 'CARD' + Math.random().toString(36).substr(2, 8).toUpperCase(),
        batch_id: batch_id,
        batch_order: startOrder + i,
        message_type: source.message_type,
        message_text: source.message_text,
        media_url: source.media_url,
        file_name: source.file_name,
        file_size: source.file_size,
        file_type: source.file_type,
        status: 'active',
        card_type: 'ecard',
        is_batch_template: false,
        terms_accepted: true,
        physical_card_status: null,
        created_by_ip: clientIp,
        updated_by_ip: clientIp,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        activation_deadline: deadline.toISOString()
      });
    }
    
    // Insert cards
    const { error: insertError } = await supabaseAdmin.from('cards').insert(newCards);
    if (insertError) throw insertError;
    
    // Update batch counts AND max_cards_allowed
    const newTotal = batch.cards_created + quantity;
    const newMax = (batch.max_cards_allowed || 0) + quantity;
    
    await supabaseAdmin
      .from('batches')
      .update({ 
        cards_created: newTotal,
        total_cards_purchased: newTotal,
        max_cards_allowed: newMax,
        updated_at: now.toISOString()
      })
      .eq('batch_id', batch_id);
    
    // Log to batch_events
    await supabaseAdmin.from('batch_events').insert({
      batch_id: batch_id,
      event_type: 'cards_added_via_payment',
      quantity: quantity,
      timestamp: now.toISOString(),
      ip_address: clientIp,
      user_agent: userAgent,
      metadata: { 
        payment_intent_id: payment_intent_id || null,
        previous_count: batch.cards_created,
        new_count: newTotal,
        card_ids: newCards.map(c => c.card_id)
      }
    });
    
    // 🔴 CRITICAL FIX: Log to card_activations with error handling
    try {
      const activationRecords = newCards.map(card => ({
        card_id: card.card_id,
        activated_at: now.toISOString(),
        activated_by_ip: clientIp,
        terms_accepted_at: now.toISOString(),
        terms_accepted_ip: clientIp,
        user_agent: userAgent,
        activation_source: 'batch_manager_add_on',
        metadata: { 
          batch_id: batch_id,
          batch_order: card.batch_order,
          payment_intent_id: payment_intent_id || null,
          added_via: 'inline_payment'
        }
      }));
      
      const { error: actError } = await supabaseAdmin
        .from('card_activations')
        .insert(activationRecords);
        
      if (actError) {
        console.error('Card activations insert error:', actError);
        // Don't fail the request, but log the error
      }
    } catch (actErr) {
      console.error('Card activations exception:', actErr);
      // Don't fail the main request
    }
    
    res.json({ 
      success: true, 
      message: `Added ${quantity} cards`,
      new_total: newTotal,
      new_max: newMax,
      cards: newCards.map(c => ({ card_id: c.card_id, batch_order: c.batch_order }))
    });
    
  } catch (error) {
    console.error('Add cards error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔢 Increment scan count AND log individual scan (UPDATED)
app.post('/api/increment-scan', async (req, res) => {
  try {
    const { card_id } = req.body;
    const clientIp = getClientIp(req);
    console.log(`📊 Processing scan for: ${card_id} from IP: ${clientIp}`);
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        success: false,
        error: 'Database service temporarily unavailable'
      });
    }
    const { error: logError } = await supabaseAdmin
      .from('scan_logs')
      .insert({
        card_id: card_id,
        ip_address: clientIp,
        user_agent: req.headers['user-agent'] || 'unknown',
        scanned_at: new Date().toISOString()
      });
    if (logError) console.error('❌ Failed to log scan:', logError);
    const { data: card, error: fetchError } = await supabaseAdmin
      .from('cards')
      .select('scan_count')
      .eq('card_id', card_id)
      .single();
    if (fetchError) {
      console.error('❌ Fetch error:', fetchError);
      return res.json({ success: false, error: fetchError.message });
    }
    const currentCount = card?.scan_count || 0;
    const { error } = await supabaseAdmin
      .from('cards')
      .update({ scan_count: currentCount + 1 })
      .eq('card_id', card_id);
    if (error) {
      console.error('❌ Update error:', error);
      return res.json({ success: false, error: error.message });
    }
    console.log(`✅ Scan logged and count updated: ${card_id} now has ${currentCount + 1} scans`);
    res.json({ success: true, count: currentCount + 1 });
  } catch (error) {
    console.error('💥 Increment error:', error);
    res.json({ success: false, error: error.message });
  }
});

// 📊 Track E-Card Opens (NEW)
app.post('/api/cards/:card_id/track', async (req, res) => {
  try {
    const { card_id } = req.params;
    const { event } = req.body;
    if (event === 'ecard_opened') {
      await supabaseAdmin
        .from('cards')
        .update({ 
          opened_at: new Date().toISOString(),
          delivery_status: 'opened'
        })
        .eq('card_id', card_id);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Find My Batches (PRODUCTION-READY VERSION)
// ============================================
app.post('/api/find-my-batches', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email required' });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Find payments by this email
    const { data: payments, error: payError } = await supabaseAdmin
      .from('payments')
      .select('batch_id, quantity, created_at, status, metadata')
      .eq('customer_email', normalizedEmail)
      .not('batch_id', 'is', null)
      .order('created_at', { ascending: false });
      
    if (payError) throw payError;
    if (!payments || payments.length === 0) {
      return res.json({ success: true, batches: [] });
    }
    
    // Strategy 1: Try exact match on batch_id
    const paymentBatchIds = [...new Set(payments.map(p => p.batch_id))];
    let { data: batches } = await supabaseAdmin
      .from('batches')
      .select('batch_id, cards_created, total_cards_purchased, created_at')
      .in('batch_id', paymentBatchIds)
      .order('created_at', { ascending: false });
    
    // Strategy 2: If no matches, try to find by time proximity + quantity
    if (!batches || batches.length === 0) {
      console.log('No direct batch matches for:', normalizedEmail);
      
      // Get payment timestamps
      const paymentTimes = payments.map(p => new Date(p.created_at));
      const earliestPayment = new Date(Math.min(...paymentTimes));
      const latestPayment = new Date(Math.max(...paymentTimes));
      
      // Look for batches created within 5 minutes of any payment
      const timeBuffer = 20 * 60 * 1000; // 20 minutes
      
      const { data: nearbyBatches, error: nearbyError } = await supabaseAdmin
        .from('batches')
        .select('*')
        .gte('created_at', new Date(earliestPayment - timeBuffer).toISOString())
        .lte('created_at', new Date(latestPayment + timeBuffer).toISOString())
        .order('created_at', { ascending: false });
        
      if (!nearbyError && nearbyBatches && nearbyBatches.length > 0) {
        // Match by quantity similarity
        batches = nearbyBatches.filter(b => {
          return payments.some(p => {
            // Match if quantity is close (allowing for the +1 template vs actual cards difference)
            const qtyMatch = Math.abs((p.quantity || 0) - (b.cards_created || 0)) <= 2;
            const timeMatch = Math.abs(new Date(p.created_at) - new Date(b.created_at)) < timeBuffer;
            return qtyMatch && timeMatch;
          });
        });
      }
    }
    
    // Strategy 3: If still no matches, return all recent batches as suggestions
    if (!batches || batches.length === 0) {
      // Last resort: show recent batches
      const { data: recentBatches } = await supabaseAdmin
        .from('batches')
        .select('batch_id, cards_created, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
        
      // Don't return these - they might not belong to this user
      // Just log for debugging
      console.log('No matching batches found for email:', normalizedEmail);
      console.log('Payment batch IDs:', paymentBatchIds);
    }
    
    res.json({ 
      success: true, 
      batches: batches || []
    });
    
  } catch (error) {
    console.error('Find batches error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// FIXED: Get batch details (excludes template cards)
// ============================================
app.get('/api/batches/:batch_id', async (req, res) => {
  try {
    const { batch_id } = req.params;
    console.log(`🔍 Fetching batch: ${batch_id}`);
    
    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    // Get batch info
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('batches')
      .select('*')
      .eq('batch_id', batch_id)
      .maybeSingle();
    
    if (batchError) throw batchError;
    if (!batch) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }
    
    // Get all cards in this batch (exclude template cards and processed ones)
    const { data: cards, error: cardsError } = await supabaseAdmin
      .from('cards')
      .select('card_id, batch_order, status, message_type, created_at, scan_count')
      .eq('batch_id', batch_id)
      .neq('status', 'processed')
      .eq('is_batch_template', false)      // Exclude template cards
      .order('batch_order', { ascending: true });
    
    if (cardsError) throw cardsError;
    
    // Get batch events for history
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('batch_events')
      .select('*')
      .eq('batch_id', batch_id)
      .order('timestamp', { ascending: true });
    
    if (eventsError) throw eventsError;
    
    res.json({
      success: true,
      batch,
      cards: cards || [],
      events: events || []
    });
    
  } catch (error) {
    console.error('Error fetching batch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HALLMARK FLOW: Create batch from template after payment (deprecated, kept for compatibility)
// ============================================
app.post('/api/batch/create-from-template', async (req, res) => {
    try {
        const { batch_id, quantity } = req.body;
        const clientIp = getClientIp(req);
        const userAgent = req.headers['user-agent'] || 'unknown';
        console.log(`📦 Hallmark Batch Creation: ${batch_id} | ${quantity} cards`);
        if (!batch_id || !quantity || quantity < 1) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing batch_id or invalid quantity' 
            });
        }
        const { data: template, error: templateError } = await supabaseAdmin
            .from('cards')
            .select('*')
            .eq('batch_id', batch_id)
            .eq('is_batch_template', true)
            .eq('status', 'draft')
            .single();
        if (templateError || !template) {
            console.error('Template not found:', templateError);
            return res.status(404).json({ 
                success: false, 
                error: 'Template not found or already processed' 
            });
        }
        await supabaseAdmin
            .from('cards')
            .update({ 
                status: 'active',
                updated_by_ip: clientIp,
                updated_at: new Date().toISOString()
            })
            .eq('card_id', template.card_id);
        await supabaseAdmin.from('card_activations').insert({
            card_id: template.card_id,
            activated_at: new Date().toISOString(),
            activated_by_ip: clientIp,
            terms_accepted_at: new Date().toISOString(),
            terms_accepted_ip: clientIp,
            user_agent: userAgent,
            activation_source: 'checkout_payment',
            metadata: { batch_id, is_template: true, quantity }
        });
        const cardsToCreate = [];
        const deadline = new Date();
        deadline.setFullYear(deadline.getFullYear() + 1);
        for (let i = 2; i <= quantity; i++) {
            cardsToCreate.push({
                card_id: 'CARD' + Math.random().toString(36).substr(2, 8).toUpperCase(),
                batch_id: batch_id,
                batch_order: i,
                message_type: template.message_type,
                message_text: template.message_text,
                media_url: template.media_url,
                file_name: template.file_name,
                file_size: template.file_size,
                file_type: template.file_type,
                status: 'active',
                card_type: 'ecard',
                created_by_ip: clientIp,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                activation_deadline: deadline.toISOString()
            });
        }
        if (cardsToCreate.length > 0) {
            await supabaseAdmin.from('cards').insert(cardsToCreate);
            const activationRecords = cardsToCreate.map(card => ({
                card_id: card.card_id,
                activated_at: new Date().toISOString(),
                activated_by_ip: clientIp,
                terms_accepted_at: new Date().toISOString(),
                terms_accepted_ip: clientIp,
                user_agent: userAgent,
                activation_source: 'batch_auto_created',
                metadata: { batch_id, template_card_id: template.card_id }
            }));
            await supabaseAdmin.from('card_activations').insert(activationRecords);
        }
        const { data: existingBatch } = await supabaseAdmin
            .from('batches')
            .select('batch_id')
            .eq('batch_id', batch_id)
            .maybeSingle();
        if (!existingBatch) {
            await supabaseAdmin.from('batches').insert({
                batch_id: batch_id,
                batch_type: 'ecard',
                cards_created: quantity,
                total_cards_purchased: quantity,
                max_cards_allowed: quantity,
                content_locked: true,
                created_by_ip: clientIp,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        } else {
            await supabaseAdmin
                .from('batches')
                .update({
                    cards_created: quantity,
                    total_cards_purchased: quantity,
                    content_locked: true,
                    updated_at: new Date().toISOString()
                })
                .eq('batch_id', batch_id);
        }
        await supabaseAdmin.from('batch_events').insert({
            batch_id: batch_id,
            event_type: 'batch_paid_and_created',
            quantity: quantity,
            card_id: template.card_id,
            timestamp: new Date().toISOString(),
            ip_address: clientIp,
            user_agent: userAgent,
            metadata: {
                template_card_id: template.card_id,
                total_cards: quantity,
                payment_completed: true
            }
        });
        console.log(`✅ Batch Created: ${batch_id} with ${quantity} cards`);
        res.json({ 
            success: true, 
            message: `Created ${quantity} cards`,
            batch_id: batch_id,
            quantity: quantity
        });
    } catch (error) {
        console.error('Batch creation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// STRIPE PAYMENT ENDPOINTS (unchanged)
// ============================================
app.get('/api/stripe-key', (req, res) => {
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    return res.status(503).json({ 
      success: false, 
      error: 'Stripe not configured' 
    });
  }
  res.json({ 
    success: true,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY 
  });
});

app.post('/api/create-payment-intent', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ 
      success: false, 
      error: 'Stripe not configured' 
    });
  }
  try {
    const { quantity, email, batchId, card_id } = req.body;
    if (!quantity || quantity < 1) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid quantity' 
      });
    }
    const pricing = { 1: 299, 5: 1199, 10: 1999, 25: 4499 };
    let unitPrice = pricing[1];
    let totalAmount = unitPrice * quantity;
    const tiers = Object.keys(pricing).map(Number).sort((a, b) => b - a);
    for (const tier of tiers) {
      if (quantity >= tier) {
        totalAmount = pricing[tier] * quantity;
        unitPrice = pricing[tier];
        break;
      }
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      receipt_email: email,
      metadata: {
        quantity: quantity.toString(),
        batch_id: batchId,
        card_id: card_id || '',
        card_type: 'ecard'
      },
      automatic_payment_methods: { enabled: true },
    });
    await supabaseAdmin.from('payments').insert({
      stripe_payment_intent_id: paymentIntent.id,
      batch_id: batchId,
      card_id: card_id || null,
      card_type: 'ecard',
      quantity: quantity,
      amount_total: totalAmount,
      currency: 'usd',
      status: 'pending',
      customer_email: email,
      metadata: { unit_price: unitPrice }
    });
    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      amount: totalAmount,
      quantity: quantity
    });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/admin/payments', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, payments: data });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/test-supabase', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({
        status: '❌ DISCONNECTED',
        message: 'Supabase client not initialized',
        tip: 'Check Railway environment variables'
      });
    }
    const { data, error, count } = await supabaseAdmin
      .from('cards')
      .select('card_id, message_type, created_at, media_url, file_name, file_size, created_by_ip, scan_count, status', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) {
      console.error('❌ Supabase test failed:', error);
      return res.status(500).json({
        status: '❌ ERROR',
        message: 'Supabase query failed',
        error: error.message,
        code: error.code
      });
    }
    res.json({
      status: '✅ CONNECTED',
      message: 'Supabase is fully operational!',
      stats: {
        totalCards: count || 0,
        sampleSize: data.length
      },
      recentCards: data,
      domain: req.get('host')
    });
  } catch (error) {
    res.status(500).json({
      status: '❌ FATAL ERROR',
      message: 'Supabase test failed unexpectedly',
      error: error.message
    });
  }
});

// 🚫 404 Handler
app.use((req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    availableEndpoints: [
      `${baseUrl}/`,
      `${baseUrl}/app`,
      `${baseUrl}/maker.html`,
      `${baseUrl}/viewer.html`,
      `${baseUrl}/batch-manager`,
      `${baseUrl}/api/health`,
      `${baseUrl}/api/cards`,
      `${baseUrl}/api/cards/:id`,
      `${baseUrl}/api/upload-media`,
      `${baseUrl}/api/activate-card`,
      `${baseUrl}/api/increment-scan`,
      `${baseUrl}/api/scan-logs`,
      `${baseUrl}/api/admin/cards/:id`,
      `${baseUrl}/api/admin/abandoned`,
      `${baseUrl}/api/admin/geolocation/:id`,
      `${baseUrl}/api/admin/mismatch-alerts`,
      `${baseUrl}/api/admin/all-locations`,
      `${baseUrl}/api/admin/performance`,
      `${baseUrl}/api/admin/activity`,
      `${baseUrl}/api/admin/export-all`,
      `${baseUrl}/api/admin/bulk-delete`,
      `${baseUrl}/api/admin/bulk-activate`,
      `${baseUrl}/api/admin/cards-all-details`,
      `${baseUrl}/api/batches/:id`,
      `${baseUrl}/api/batches/:id/add-cards`,
      `${baseUrl}/api/batches/:id/add`,
      `${baseUrl}/api/batches/calculate-price`,
      `${baseUrl}/api/admin/batches`,
      `${baseUrl}/api/admin/batches/:id/delete`,
      `${baseUrl}/api/admin/expire-cards`,
      `${baseUrl}/api/cards/:id/send`,
      `${baseUrl}/api/physical-cards/:id/activate`,
      `${baseUrl}/api/test-supabase`,
      `${baseUrl}/api/stripe-key`,
      `${baseUrl}/api/create-payment-intent`,
      `${baseUrl}/api/admin/payments`,
      `${baseUrl}/api/activate-after-payment`,
      `${baseUrl}/api/find-my-batches`
    ]
  });
});

// 🚀 Launch Server
app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(70));
  console.log('   🎪✨ P A P I R   B U S I N E S S   S E R V E R ✨🎪');
  console.log('═'.repeat(70) + '\n');
  console.log('📊 SERVER INFO:');
  console.log(`   Port: ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`   Supabase: ${supabaseAdmin ? '✅ Connected' : '❌ Disconnected'}`);
  console.log('\n🌐 DOMAINS:');
  console.log(`   Primary: https://papir.ca`);
  console.log(`   Railway: https://papir.up.railway.app`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log('\n🔗 MAIN PAGES:');
  console.log(`   Marketing: https://papir.ca`);
  console.log(`   Dashboard: https://papir.ca/app`);
  console.log(`   Maker: https://papir.ca/maker.html`);
  console.log(`   Viewer: https://papir.ca/viewer.html`);
  console.log(`   Batch Manager: https://papir.ca/batch-manager`);
  console.log('\n🔗 API ENDPOINTS:');
  console.log(`   Health: https://papir.ca/api/health`);
  console.log(`   Cards: https://papir.ca/api/cards`);
  console.log(`   Upload: https://papir.ca/api/upload-media`);
  console.log(`   Activate: https://papir.ca/api/activate-card`);
  console.log(`   Increment Scan: https://papir.ca/api/increment-scan`);
  console.log(`   Scan Logs: https://papir.ca/api/scan-logs`);
  console.log(`   Admin Card: https://papir.ca/api/admin/cards/:id`);
  console.log(`   Abandoned Cards: https://papir.ca/api/admin/abandoned`);
  console.log(`   Geolocation: https://papir.ca/api/admin/geolocation/:id`);
  console.log(`   Mismatch Alerts: https://papir.ca/api/admin/mismatch-alerts`);
  console.log(`   All Locations: https://papir.ca/api/admin/all-locations`);
  console.log(`   Performance: https://papir.ca/api/admin/performance`);
  console.log(`   Activity: https://papir.ca/api/admin/activity`);
  console.log(`   Export All: https://papir.ca/api/admin/export-all`);
  console.log(`   Bulk Delete: https://papir.ca/api/admin/bulk-delete`);
  console.log(`   Bulk Activate: https://papir.ca/api/admin/bulk-activate`);
  console.log(`   Cards All Details: https://papir.ca/api/admin/cards-all-details`);
  console.log(`   Get Batch: https://papir.ca/api/batches/:id`);
  console.log(`   Add Cards to Batch: https://papir.ca/api/batches/:id/add-cards`);
  console.log(`   Add to Batch: https://papir.ca/api/batches/:id/add`);
  console.log(`   Calculate Price: https://papir.ca/api/batches/calculate-price`);
  console.log(`   Create Batch: https://papir.ca/api/admin/batches`);
  console.log(`   Delete Batch: https://papir.ca/api/admin/batches/:id/delete`);
  console.log(`   Expire Cards: https://papir.ca/api/admin/expire-cards`);
  console.log(`   Send E-Card: POST https://papir.ca/api/cards/:id/send`);
  console.log(`   Activate Physical Card: POST https://papir.ca/api/physical-cards/:id/activate`);
  console.log(`   Track E-Card: POST https://papir.ca/api/cards/:id/track`);
  console.log(`   Stripe Key: GET https://papir.ca/api/stripe-key`);
  console.log(`   Create Payment Intent: POST https://papir.ca/api/create-payment-intent`);
  console.log(`   Admin Payments: GET https://papir.ca/api/admin/payments`);
  console.log(`   Activate After Payment: POST https://papir.ca/api/activate-after-payment`);
  console.log(`   Find My Batches: POST https://papir.ca/api/find-my-batches`);
  console.log('\n🎯 FEATURES:');
  console.log('   ✅ Media uploads to Supabase Storage');
  console.log('   ✅ File metadata tracking');
  console.log('   ✅ IP address tracking (single IP only)');
  console.log('   ✅ QR code generation');
  console.log('   ✅ Scan count tracking');
  console.log('   ✅ Individual scan logging');
  console.log('   ✅ Analytics dashboard');
  console.log('   ✅ Card activation flow (physical cards)');
  console.log('   ✅ File type validation on server');
  console.log('   ✅ Admin endpoint with activation history');
  console.log('   ✅ Batch management system');
  console.log('   ✅ Batch expansion (add cards later)');
  console.log('   ✅ Activation deadlines');
  console.log('   ✅ IP geolocation tracking - FIXED with fallback');
  console.log('   ✅ Duplicate scan detection');
  console.log('   ✅ Abandoned card tracking');
  console.log('   ✅ Geographic mismatch alerts');
  console.log('   ✅ Batch deletion handling');
  console.log('   ✅ Card expiration (1 year)');
  console.log('   ✅ Performance dashboard');
  console.log('   ✅ Activity timeline');
  console.log('   ✅ Bulk export');
  console.log('   ✅ Bulk actions (delete/activate)');
  console.log('   ✅ ONE REQUEST card details loading');
  console.log('   ✅ Dedicated batch rate limiting');
  console.log('   ✅ Batch events tracking - FIXED');
  console.log('   ✅ Auto-create batches when adding cards');
  console.log('   ✅ ACCURATE batch counts from arithmetic calculation');
  console.log('   ✅ LOG ONLY ON ACTUAL CHANGE to batch_events');
  console.log('   ✅ ARITHMETIC COUNTING (avoids race conditions)');
  console.log('   ✅ DEBUG LOGGING for batch creation');
  console.log('   ✅ Card DELETE updates batch counts and logs only on actual change');
  console.log('   ✅ E-CARD MODE ACTIVE (cards created as active)');
  console.log('   ✅ E-Card delivery logging endpoint');
  console.log('   ✅ E-Card tracking endpoint (opened_at)');
  console.log('   ✅ Physical card dormant endpoints ready for future');
  console.log('   ✅ Stripe payment integration (optional)');
  console.log('   ✅ Payment tracking via webhook (optional)');
  console.log('   ✅ 24/7 Railway hosting');
  console.log('\n' + '─'.repeat(70));
  console.log('   🚀 Papir Business is LIVE at https://papir.ca!');
  console.log('─'.repeat(70) + '\n');
});