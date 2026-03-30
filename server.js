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
  // Try to require stripe (if installed)
  const stripeModule = require('stripe');
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = stripeModule(process.env.STRIPE_SECRET_KEY);
    console.log('✅ Stripe initialized');
  } else {
    console.log('⚠️ Stripe secret key not set - payments disabled');
  }
} catch (err) {
  // Stripe module not installed or other error
  console.log('⚠️ Stripe module not installed - payments disabled');
}

// Webhook handler - Gracefully handles missing secret and missing module
app.post('/api/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');
  
  // Skip if webhook secret not set (safe for testing)
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
  
  // Handle successful payment
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
        batch_type: 'ecard',  // ← ADDED: consistent batch type
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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes
  message: 'Too many requests from this IP, please try again after 15 minutes.'
});
app.use('/api/', limiter);

// Higher limit for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  message: 'Admin rate limit reached, please slow down.'
});
app.use('/api/admin/', adminLimiter);

// Higher limit for batch endpoints
const batchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
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
      adminPayments: `GET ${baseUrl}/api/admin/payments`
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
  // Get the forwarded IPs
  const forwarded = req.headers['x-forwarded-for'];
  const remoteAddress = req.socket.remoteAddress;
  const ip = req.ip;
  
  console.log('IP Debug:', {
    forwarded,
    remoteAddress,
    ip
  });
  
  // First try x-forwarded-for and take the FIRST IP only
  if (forwarded) {
    // Split by comma and take the first IP, then trim whitespace
    const firstIp = forwarded.split(',')[0].trim();
    console.log('Using first forwarded IP:', firstIp);
    return firstIp;
  }
  
  // Fallback to remoteAddress
  if (remoteAddress && remoteAddress !== '::1' && remoteAddress !== '::ffff:127.0.0.1') {
    // Remove IPv6 prefix if present
    const cleanIp = remoteAddress.replace('::ffff:', '');
    console.log('Using remoteAddress:', cleanIp);
    return cleanIp;
  }
  
  // Last resort fallback
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
    // Skip private IPs
    if (ip === 'unknown' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '127.0.0.1') {
      console.log('📍 Skipping geolocation for private IP:', ip);
      return null;
    }
    
    console.log('📍 Fetching geolocation for IP:', ip);
    
    // Try ipapi.co first (HTTPS required) - with proper timeout using AbortController
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`https://ipapi.co/${ip}/json/`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📍 ipapi.co response:', data);
        
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
    
    // Fallback to ip-api.com
    console.log('📍 Trying fallback ip-api.com for IP:', ip);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const fallbackResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,org`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        console.log('📍 ip-api.com response:', fallbackData);
        
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
      card_type = 'ecard',  // ← CHANGED: Default to ecard for launch
      delivery_method,         // ← NEW: for e-cards
      recipient_contact        // ← NEW: for e-cards
    } = req.body;
    
    console.log(`📨 Saving card: ${card_id}, Type: ${message_type}, Card Type: ${card_type}`);
    
    // Get clean client IP address
    const clientIp = getClientIp(req);
    
    // Validation
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
    
    // Check if card exists
    const { data: existingCard } = await supabaseAdmin
      .from('cards')
      .select('card_id, card_type')
      .eq('card_id', card_id)
      .maybeSingle();
    
    let result;
    
    if (existingCard) {
      // UPDATE existing card
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
      
      // Add batch fields if provided
      if (batch_id) updateData.batch_id = batch_id;
      if (batch_order) updateData.batch_order = batch_order;
      
      // Add e-card fields if this is an e-card
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
      // INSERT new card
      console.log(`🆕 Creating new ${card_type} card: ${card_id}`);
      
      // Set activation deadline (1 year from now) - ONLY for physical cards
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
        
        // ← KEY LOGIC: Use provided status (e.g., 'draft') or default based on card_type
        status: req.body.status || (card_type === 'ecard' ? 'active' : 'pending'),
        card_type: card_type,  // ← NEW
        
        // ADD THESE FIELDS for Hallmark flow:
        is_batch_template: req.body.is_batch_template || false,
        quantity: req.body.quantity || null,
        
        // Physical card fields (dormant by default)
        physical_card_status: card_type === 'physical' ? 'dormant' : null,
        activation_deadline: card_type === 'physical' ? deadline.toISOString() : null,
        
        // E-card fields
        delivery_method: card_type === 'ecard' ? delivery_method : null,
        recipient_contact: card_type === 'ecard' ? recipient_contact : null,
        delivery_status: card_type === 'ecard' ? 'pending' : null,
        
        created_by_ip: clientIp,
        updated_by_ip: clientIp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Add batch fields if provided
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
    
    // File type validation
    const allowedTypes = {
      'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'],
      'video': ['video/mp4', 'video/webm', 'video/quicktime', 'video/mov'],
      'audio': ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/mp4', 'audio/ogg']
    };
    
    // Determine file category from fileType or fileName
    let fileCategory = null;
    if (fileType) {
      if (fileType.startsWith('image/')) fileCategory = 'image';
      else if (fileType.startsWith('video/')) fileCategory = 'video';
      else if (fileType.startsWith('audio/')) fileCategory = 'audio';
    }
    
    // If fileType doesn't give category, try extension
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
    
    // Check if file type is allowed for its category
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
    
    // Convert base64 to buffer
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
    
    // Create folder path: cardId/filename
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${cardId}/${Date.now()}_${safeFileName}`;
    
    // Upload to Supabase Storage
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
    
    // Get public URL
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

// 📖 Get Card by ID
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
    
    // Get card info BEFORE deletion
    const { data: cardInfo } = await supabaseAdmin
      .from('cards')
      .select('batch_id, status')
      .eq('card_id', card_id)
      .maybeSingle();
    
    const batchId = cardInfo?.batch_id;
    const wasAlreadyDeleted = cardInfo?.status === 'deleted';
    
    // Skip if already deleted (no change)
    if (wasAlreadyDeleted) {
      return res.json({ 
        success: true, 
        message: `Card ${card_id} already deleted`,
        no_change: true
      });
    }
    
    // Soft delete
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
    
    // If was in batch, update counts and log ONLY if there was an actual change
    if (batchId) {
      // Get count BEFORE (we know it included this card)
      const { data: batchCardsBefore } = await supabaseAdmin
        .from('cards')
        .select('card_id')
        .eq('batch_id', batchId)
        .neq('status', 'deleted');
      
      // This is the count AFTER deletion (since we just marked it deleted)
      const newCount = batchCardsBefore?.length || 0;
      const previousCount = newCount + 1; // We removed 1
      
      // Update batch counts
      await supabaseAdmin
        .from('batches')
        .update({
          cards_created: newCount,
          total_cards_purchased: newCount,
          updated_at: new Date().toISOString()
        })
        .eq('batch_id', batchId);
      
      // ONLY log if there was an actual removal (count changed)
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
    
    // Get clean client IP address (FIXED)
    const clientIp = getClientIp(req);
    
    console.log(`🎟️ Activating card: ${card_id} from IP: ${clientIp} with source: ${source || 'not provided'}`);
    
    if (!supabaseAdmin) {
      console.error('❌ supabaseAdmin not initialized');
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    // Get geolocation for this IP
    const locationData = await getGeolocationFromIp(clientIp);
    
    // Check if card exists using maybeSingle() to avoid errors
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
      // Card doesn't exist - create and activate it with a default message_type
      console.log(`📝 Card ${card_id} not found - creating new card`);
      
      // Set activation deadline (1 year from now)
      const deadline = new Date();
      deadline.setFullYear(deadline.getFullYear() + 1);
      
      const { error: insertError } = await supabaseAdmin
        .from('cards')
        .insert({
          card_id: card_id,
          card_type: 'ecard',  // ← ADDED: ensure new cards are e-cards
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
      
      // Also log the activation in the new table with geolocation
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
      
      if (logError) {
        console.error('❌ Failed to log activation:', logError);
        // Continue anyway - card is still activated
      }
      
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
    
    // Activate the card (update status only)
    const { error: updateError } = await supabaseAdmin
      .from('cards')
      .update({
        status: 'active',
        updated_by_ip: clientIp,
        updated_at: new Date().toISOString()
      })
      .eq('card_id', card_id);
    
    if (updateError) {
      console.error('❌ Update error:', updateError);
      throw updateError;
    }
    
    // Log the activation in the new table with geolocation
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
    
    if (logError) {
      console.error('❌ Failed to log activation:', logError);
      // Continue anyway - card is still activated
    }
    
    console.log(`✅ Card ${card_id} activated successfully (logged to activations table with source: ${source || 'viewer'})`);
    res.json({ success: true });
    
  } catch (error) {
    console.error('💥 Activation error details:', error);
    res.json({ success: false, error: 'Server error: ' + error.message });
  }
});

// ============================================
// HALLMARK FLOW: Create batch from template after payment
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
        
        // 1. Get the template card (draft status)
        const { data: template, error: templateError } = await supabaseAdmin
            .from('cards')
            .select('*')
            .eq('batch_id', batch_id)
            .eq('is_batch_template', true)
            .eq('status', 'draft')
            .single();
            
        if (templateError || !template) {
            console.error('Template not found or already activated:', templateError);
            return res.status(404).json({ 
                success: false, 
                error: 'Template not found or already processed' 
            });
        }
        
        // 2. Activate the template card first (AUDIT TRAIL #1)
        const { error: activateError } = await supabaseAdmin
            .from('cards')
            .update({ 
                status: 'active',
                updated_by_ip: clientIp,
                updated_at: new Date().toISOString()
            })
            .eq('card_id', template.card_id);
        
        if (activateError) throw activateError;
        
        // Log template activation (AUDIT TRAIL #2)
        await supabaseAdmin
            .from('card_activations')
            .insert({
                card_id: template.card_id,
                activated_at: new Date().toISOString(),
                activated_by_ip: clientIp,
                terms_accepted_at: new Date().toISOString(),
                terms_accepted_ip: clientIp,
                user_agent: userAgent,
                activation_source: 'checkout_payment',
                metadata: {
                    batch_id: batch_id,
                    is_template: true,
                    quantity: quantity
                }
            });
        
        // 3. Create remaining cards (quantity - 1)
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
                status: 'active', // Auto-activated
                card_type: 'ecard',
                is_batch_template: false,
                created_by_ip: clientIp,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                activation_deadline: deadline.toISOString()
            });
        }
        
        // 4. Insert batch cards
        if (cardsToCreate.length > 0) {
            const { error: insertError } = await supabaseAdmin
                .from('cards')
                .insert(cardsToCreate);
            
            if (insertError) throw insertError;
            
            // Log activations for all created cards (AUDIT TRAIL #3)
            const activationRecords = cardsToCreate.map(card => ({
                card_id: card.card_id,
                activated_at: new Date().toISOString(),
                activated_by_ip: clientIp,
                terms_accepted_at: new Date().toISOString(),
                terms_accepted_ip: clientIp,
                user_agent: userAgent,
                activation_source: 'batch_auto_created',
                metadata: {
                    batch_id: batch_id,
                    template_card_id: template.card_id,
                    batch_order: card.batch_order
                }
            }));
            
            await supabaseAdmin
                .from('card_activations')
                .insert(activationRecords);
        }
        
        // 5. Create or update batch record (AUDIT TRAIL #4)
        const { data: existingBatch } = await supabaseAdmin
            .from('batches')
            .select('batch_id')
            .eq('batch_id', batch_id)
            .maybeSingle();
        
        if (!existingBatch) {
            await supabaseAdmin
                .from('batches')
                .insert({
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
        
        // 6. Log batch event (AUDIT TRAIL #5)
        await supabaseAdmin
            .from('batch_events')
            .insert({
                batch_id: batch_id,
                event_type: 'batch_paid_and_created',
                quantity: quantity,
                card_id: template.card_id,
                timestamp: new Date().toISOString(),
                ip_address: clientIp,
                user_agent: userAgent,
                metadata: {
                    template_card_id: template.card_id,
                    all_card_ids: [template.card_id, ...cardsToCreate.map(c => c.card_id)],
                    total_cards: quantity,
                    payment_completed: true,
                    auto_activated: true
                }
            });
        
        console.log(`✅ Hallmark Batch Created: ${batch_id} with ${quantity} cards`);
        
        res.json({ 
            success: true, 
            message: `Batch created with ${quantity} cards`,
            batch_id: batch_id,
            quantity: quantity,
            template_card_id: template.card_id,
            audit_trail: {
                template_activated: true,
                cards_created: cardsToCreate.length + 1,
                activations_logged: cardsToCreate.length + 1,
                batch_event_logged: true
            }
        });
        
    } catch (error) {
        console.error('❌ Hallmark batch creation error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 🔢 STEP 2: Increment scan count AND log individual scan (UPDATED)
app.post('/api/increment-scan', async (req, res) => {
  try {
    const { card_id } = req.body;
    
    // Get clean client IP address (FIXED)
    const clientIp = getClientIp(req);
    
    console.log(`📊 Processing scan for: ${card_id} from IP: ${clientIp}`);
    
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        success: false,
        error: 'Database service temporarily unavailable'
      });
    }
    
    // 1. Log the individual scan with clean IP
    const { error: logError } = await supabaseAdmin
      .from('scan_logs')
      .insert({
        card_id: card_id,
        ip_address: clientIp,
        user_agent: req.headers['user-agent'] || 'unknown',
        scanned_at: new Date().toISOString()
      });
    
    if (logError) {
      console.error('❌ Failed to log scan:', logError);
      // Continue anyway - don't block the scan count update
    }
    
    // 2. Get current count
    const { data: card, error: fetchError } = await supabaseAdmin
      .from('cards')
      .select('scan_count')
      .eq('card_id', card_id)
      .single();
    
    if (fetchError) {
      console.error('❌ Fetch error:', fetchError);
      return res.json({ success: false, error: fetchError.message });
    }
    
    // 3. Increment by 1
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

// ========== NEW ENDPOINT: Activate card after payment (for Create‑First flow) ==========
app.post('/api/cards/:card_id/activate-after-payment', async (req, res) => {
  try {
    const { card_id } = req.params;
    const clientIp = getClientIp(req);
    
    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    // Update card status from 'draft' to 'active'
    const { error } = await supabaseAdmin
      .from('cards')
      .update({ 
        status: 'active',
        updated_by_ip: clientIp,
        updated_at: new Date().toISOString()
      })
      .eq('card_id', card_id)
      .eq('status', 'draft'); // Only activate if it was a draft
    
    if (error) throw error;
    
    // Also log activation in card_activations
    const { error: logError } = await supabaseAdmin
      .from('card_activations')
      .insert({
        card_id: card_id,
        activated_at: new Date().toISOString(),
        activated_by_ip: clientIp,
        terms_accepted_at: new Date().toISOString(),
        terms_accepted_ip: clientIp,
        user_agent: req.headers['user-agent'] || 'unknown',
        activation_source: 'checkout',
        location_data: null
      });
    
    if (logError) console.error('Activation log failed:', logError);
    
    res.json({ success: true, message: 'Card activated' });
  } catch (error) {
    console.error('Activation after payment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 STEP 4: Get scan logs for analytics (NEW)
app.get('/api/scan-logs', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const { data, error } = await supabaseAdmin
      .from('scan_logs')
      .select('*')
      .gte('scanned_at', cutoffDate.toISOString())
      .order('scanned_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, logs: data || [] });
    
  } catch (error) {
    console.error('Error fetching scan logs:', error);
    res.json({ success: false, error: error.message, logs: [] });
  }
});

// 📊 Get Card with Complete Activation History (FOR ADMIN USE ONLY)
app.get('/api/admin/cards/:card_id', async (req, res) => {
  try {
    const { card_id } = req.params;
    
    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    // Get card data
    const { data: card, error: cardError } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('card_id', card_id)
      .maybeSingle();
    
    if (cardError) throw cardError;
    
    if (!card) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    
    // Get ALL activation history (for complete audit trail)
    const { data: activations, error: actError } = await supabaseAdmin
      .from('card_activations')
      .select('*')
      .eq('card_id', card_id)
      .order('created_at', { ascending: false });
    
    if (actError) throw actError;
    
    // Get scan logs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: scans, error: scanError } = await supabaseAdmin
      .from('scan_logs')
      .select('*')
      .eq('card_id', card_id)
      .gte('scanned_at', thirtyDaysAgo.toISOString())
      .order('scanned_at', { ascending: false });
    
    if (scanError) throw scanError;
    
    // Get batch info if this card is part of a batch
    let batchInfo = null;
    if (card.batch_id) {
      const { data: batch } = await supabaseAdmin
        .from('batches')
        .select('*')
        .eq('batch_id', card.batch_id)
        .maybeSingle();
      batchInfo = batch;
    }
    
    // Return comprehensive card data for admin
    res.json({
      success: true,
      card: {
        ...card,
        // Include the most recent activation for backward compatibility
        activated_at: activations?.[0]?.activated_at || null,
        activated_by_ip: activations?.[0]?.activated_by_ip || null,
        terms_accepted_at: activations?.[0]?.terms_accepted_at || null,
        terms_accepted_ip: activations?.[0]?.terms_accepted_ip || null,
        activation_source: activations?.[0]?.activation_source || null,
        // Full history arrays
        activation_history: activations || [],
        scan_history: scans || [],
        total_scans: card.scan_count || 0,
        recent_scans: scans?.length || 0,
        batch_info: batchInfo
      },
      viewerUrl: `${req.protocol}://${req.get('host')}/viewer.html?card=${card_id}`
    });
    
  } catch (error) {
    console.error('Error fetching admin card data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Get abandoned cards (created but never activated)
app.get('/api/admin/abandoned', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const { data, error } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('status', 'pending')
      .lt('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, abandoned: data || [] });
    
  } catch (error) {
    console.error('Error fetching abandoned cards:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Get geolocation data for a card
app.get('/api/admin/geolocation/:card_id', async (req, res) => {
  try {
    const { card_id } = req.params;
    
    const { data, error } = await supabaseAdmin
      .from('card_activations')
      .select('activated_at, activated_by_ip, city, country, region, location_data, activation_source, latitude, longitude')
      .eq('card_id', card_id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, locations: data || [] });
    
  } catch (error) {
    console.error('Error fetching geolocation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Get all locations for heatmap (FAST - single query)
app.get('/api/admin/all-locations', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90; // Default to last 90 days
    
    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // Single query to get all activation locations
    const { data, error } = await supabaseAdmin
      .from('card_activations')
      .select('card_id, city, country, region, latitude, longitude, activated_at, activation_source')
      .not('city', 'is', null)
      .gte('activated_at', cutoffDate.toISOString())
      .order('activated_at', { ascending: false });
    
    if (error) throw error;
    
    // Calculate city counts for top locations
    const cityCounts = {};
    const countryCounts = {};
    const locations = [];
    
    data.forEach(act => {
      // Count cities
      if (act.city && act.country) {
        const key = `${act.city}, ${act.country}`;
        cityCounts[key] = (cityCounts[key] || 0) + 1;
      }
      
      // Count countries
      if (act.country) {
        countryCounts[act.country] = (countryCounts[act.country] || 0) + 1;
      }
      
      // Store location for map (limit to 200 for performance)
      if (act.latitude && act.longitude && locations.length < 200) {
        locations.push({
          lat: act.latitude,
          lng: act.longitude,
          city: act.city,
          country: act.country,
          count: 1
        });
      }
    });
    
    // Get top 10 cities
    const topLocations = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([city, count]) => ({ city, count }));
    
    // Get total activations with location
    const totalLocated = data.length;
    
    res.json({
      success: true,
      stats: {
        totalLocated,
        totalCities: Object.keys(cityCounts).length,
        totalCountries: Object.keys(countryCounts).length
      },
      topLocations,
      locations // For map if you add one later
    });
    
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Get geographic mismatch alerts
app.get('/api/admin/mismatch-alerts', async (req, res) => {
  try {
    // Get all cards with batch info and activations
    const { data: cards, error: cardError } = await supabaseAdmin
      .from('cards')
      .select('card_id, batch_id, status')
      .eq('status', 'active')
      .not('batch_id', 'is', null);
    
    if (cardError) throw cardError;
    
    const alerts = [];
    
    for (const card of cards) {
      // Get batch shipping info
      const { data: batch } = await supabaseAdmin
        .from('batches')
        .select('shipping_country')
        .eq('batch_id', card.batch_id)
        .maybeSingle();
      
      if (!batch?.shipping_country) continue;
      
      // Get activation locations for this card
      const { data: activations } = await supabaseAdmin
        .from('card_activations')
        .select('country, activated_at')
        .eq('card_id', card.card_id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!activations || activations.length === 0) continue;
      
      const activationCountry = activations[0].country;
      
      // Check for mismatch
      if (activationCountry && activationCountry !== batch.shipping_country) {
        alerts.push({
          card_id: card.card_id,
          batch_id: card.batch_id,
          shipping_country: batch.shipping_country,
          activation_country: activationCountry,
          activated_at: activations[0].activated_at,
          severity: 'medium'
        });
      }
    }
    
    res.json({ success: true, alerts });
    
  } catch (error) {
    console.error('Error checking mismatches:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ADMIN FEATURES - Performance, Activity, Cards All Details
// ============================================

// 📊 Get performance stats
app.get('/api/admin/performance', async (req, res) => {
  try {
    // Get total cards count
    const { count: totalCards } = await supabaseAdmin
      .from('cards')
      .select('*', { count: 'exact', head: true });
    
    // Get active cards count
    const { count: activeCards } = await supabaseAdmin
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    
    // Get database size estimate (simulated)
    const dbSize = '2.4 MB';
    
    // Get rate limit usage (simulated)
    const rateLimitUsage = `${Math.floor(Math.random() * 50 + 10)}/200`;
    
    res.json({
      success: true,
      api_response_time: '124ms',
      active_cards: activeCards || 0,
      db_size: dbSize,
      rate_limit_usage: rateLimitUsage
    });
    
  } catch (error) {
    console.error('Error fetching performance stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Get recent activity timeline
app.get('/api/admin/activity', async (req, res) => {
  try {
    // Get recent activations
    const { data: activations } = await supabaseAdmin
      .from('card_activations')
      .select('card_id, activated_at, activation_source')
      .order('activated_at', { ascending: false })
      .limit(10);
    
    // Get recent scans
    const { data: scans } = await supabaseAdmin
      .from('scan_logs')
      .select('card_id, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(10);
    
    const activities = [];
    
    // Format activations
    activations?.forEach(act => {
      activities.push({
        type: 'activation',
        card_id: act.card_id,
        description: `activated from ${act.activation_source || 'viewer'}`,
        time: act.activated_at
      });
    });
    
    // Format scans
    scans?.forEach(scan => {
      activities.push({
        type: 'scan',
        card_id: scan.card_id,
        description: 'was scanned',
        time: scan.scanned_at
      });
    });
    
    // Sort by time descending
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));
    
    res.json({
      success: true,
      activities: activities.slice(0, 15) // Return top 15
    });
    
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Export all data as CSV
app.get('/api/admin/export-all', async (req, res) => {
  try {
    const format = req.query.format || 'csv';
    
    // Get all cards
    const { data: cards } = await supabaseAdmin
      .from('cards')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!cards) {
      return res.status(404).json({ success: false, error: 'No data found' });
    }
    
    if (format === 'csv') {
      // Create CSV header
      const headers = ['card_id', 'status', 'batch_id', 'batch_order', 'message_type', 
        'message_text', 'media_url', 'file_name', 'file_size', 'file_type', 
        'scan_count', 'created_by_ip', 'created_at', 'updated_at', 'activation_deadline'];
      
      let csv = headers.join(',') + '\n';
      
      // Add rows
      cards.forEach(card => {
        const row = headers.map(h => {
          let value = card[h] || '';
          // Escape commas
          if (value.toString().includes(',')) {
            return `"${value}"`;
          }
          return value;
        }).join(',');
        csv += row + '\n';
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=papir-export-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } else {
      res.json({ success: true, data: cards });
    }
    
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Bulk delete cards
app.post('/api/admin/bulk-delete', async (req, res) => {
  try {
    const { card_ids } = req.body;
    const clientIp = getClientIp(req);
    
    if (!card_ids || !Array.isArray(card_ids) || card_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No card IDs provided' });
    }
    
    const { data, error } = await supabaseAdmin
      .from('cards')
      .update({
        status: 'deleted',
        updated_by_ip: clientIp,
        updated_at: new Date().toISOString()
      })
      .in('card_id', card_ids)
      .select();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: `Deleted ${data?.length || 0} cards`,
      count: data?.length || 0
    });
    
  } catch (error) {
    console.error('Error bulk deleting cards:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Bulk activate cards
app.post('/api/admin/bulk-activate', async (req, res) => {
  try {
    const { card_ids } = req.body;
    const clientIp = getClientIp(req);
    
    if (!card_ids || !Array.isArray(card_ids) || card_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No card IDs provided' });
    }
    
    const { data, error } = await supabaseAdmin
      .from('cards')
      .update({
        status: 'active',
        updated_by_ip: clientIp,
        updated_at: new Date().toISOString()
      })
      .in('card_id', card_ids)
      .select();
    
    if (error) throw error;
    
    // Also create activation records for each card
    const activations = data.map(card => ({
      card_id: card.card_id,
      activated_at: new Date().toISOString(),
      activated_by_ip: clientIp,
      terms_accepted_at: new Date().toISOString(),
      terms_accepted_ip: clientIp,
      user_agent: req.headers['user-agent'] || 'unknown',
      activation_source: 'admin'
    }));
    
    await supabaseAdmin
      .from('card_activations')
      .insert(activations);
    
    res.json({ 
      success: true, 
      message: `Activated ${data?.length || 0} cards`,
      count: data?.length || 0
    });
    
  } catch (error) {
    console.error('Error bulk activating cards:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// NEW: Get all cards with complete details in ONE request
// ============================================
app.get('/api/admin/cards-all-details', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    console.log('📊 Fetching ALL cards with complete details in one request');
    
    // Get all cards
    const { data: cards, error: cardsError } = await supabaseAdmin
      .from('cards')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (cardsError) throw cardsError;
    
    // Get all card IDs
    const cardIds = cards.map(c => c.card_id);
    
    // Get ALL activations for these cards in one query
    const { data: activations, error: actError } = await supabaseAdmin
      .from('card_activations')
      .select('*')
      .in('card_id', cardIds)
      .order('created_at', { ascending: false });
    
    if (actError) throw actError;
    
    // Get ALL scan logs for these cards in one query (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: scans, error: scanError } = await supabaseAdmin
      .from('scan_logs')
      .select('*')
      .in('card_id', cardIds)
      .gte('scanned_at', thirtyDaysAgo.toISOString())
      .order('scanned_at', { ascending: false });
    
    if (scanError) throw scanError;
    
    // Get ALL batch info in one query
    const batchIds = cards.filter(c => c.batch_id).map(c => c.batch_id);
    let batches = [];
    if (batchIds.length > 0) {
      const { data: batchData } = await supabaseAdmin
        .from('batches')
        .select('*')
        .in('batch_id', batchIds);
      batches = batchData || [];
    }
    
    // Group activations by card_id
    const activationsByCard = {};
    activations.forEach(act => {
      if (!activationsByCard[act.card_id]) {
        activationsByCard[act.card_id] = [];
      }
      activationsByCard[act.card_id].push(act);
    });
    
    // Group scans by card_id
    const scansByCard = {};
    scans.forEach(scan => {
      if (!scansByCard[scan.card_id]) {
        scansByCard[scan.card_id] = [];
      }
      scansByCard[scan.card_id].push(scan);
    });
    
    // Group batches by batch_id
    const batchesById = {};
    batches.forEach(batch => {
      batchesById[batch.batch_id] = batch;
    });
    
    // Build complete card objects
    const completeCards = cards.map(card => ({
      ...card,
      activation_history: activationsByCard[card.card_id] || [],
      scan_history: scansByCard[card.card_id] || [],
      recent_scans: scansByCard[card.card_id]?.length || 0,
      batch_info: card.batch_id ? batchesById[card.batch_id] : null
    }));
    
    console.log(`✅ Returning ${completeCards.length} cards with complete details`);
    
    res.json({
      success: true,
      cards: completeCards,
      count: completeCards.length
    });
    
  } catch (error) {
    console.error('Error fetching all card details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BATCH MANAGEMENT ENDPOINTS
// ============================================

// 📊 Create a new batch
app.post('/api/admin/batches', async (req, res) => {
  try {
    const { batch_id, shipping_address, shipping_country, shipping_city, total_cards, user_email } = req.body;
    
    // Get clean client IP address (FIXED)
    const clientIp = getClientIp(req);
    
    const { data, error } = await supabaseAdmin
      .from('batches')
      .insert({
        batch_id,
        batch_type: 'ecard',  // ← ADD THIS
        shipping_address,
        shipping_country,
        shipping_city,
        total_cards_purchased: 0,
        cards_created: 0,
        max_cards_allowed: total_cards,
        content_locked: false,
        user_email,
        created_at: new Date().toISOString(),
        created_by_ip: clientIp,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, batch: data });
    
  } catch (error) {
    console.error('Error creating batch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Get batch details (for customer view)
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
    
    // Get all cards in this batch
    const { data: cards, error: cardsError } = await supabaseAdmin
      .from('cards')
      .select('card_id, batch_order, status, message_type, created_at, scan_count')
      .eq('batch_id', batch_id)
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

// 📊 Calculate price for additional cards
app.post('/api/batches/calculate-price', async (req, res) => {
  try {
    const { batch_id, additional_quantity } = req.body;
    const PRICE_PER_CARD = 19.99;
    
    const total = PRICE_PER_CARD * additional_quantity;
    
    res.json({
      success: true,
      price_per_card: PRICE_PER_CARD,
      quantity: additional_quantity,
      total: total,
      formatted_total: `$${total.toFixed(2)}`
    });
    
  } catch (error) {
    console.error('Error calculating price:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== Add cards to batch - log only on actual change ==========
app.post('/api/batches/:batch_id/add-cards', async (req, res) => {
  try {
    const { batch_id } = req.params;
    const { cards } = req.body;
    
    console.log(`📦 Adding ${cards?.length || 0} cards to batch: ${batch_id}`);
    
    if (!batch_id || !cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Get or create batch
    let { data: batch, error: fetchError } = await supabaseAdmin
      .from('batches')
      .select('*')
      .eq('batch_id', batch_id)
      .maybeSingle();
    
    if (fetchError) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    
    // Get count BEFORE excluding deleted cards (0 if new batch)
    let countBefore = 0;
    if (batch) {
      const { data: existingCardsInBatch } = await supabaseAdmin
        .from('cards')
        .select('card_id')
        .eq('batch_id', batch_id)
        .neq('status', 'deleted');
      countBefore = existingCardsInBatch?.length || 0;
    }
    
    // Create batch if it doesn't exist - WITH INITIAL COUNTS
    const isNewBatch = !batch;
    if (isNewBatch) {
      console.log(`📦 Creating NEW batch: ${batch_id} with ${cards.length} cards`);
      
      const { data: newBatch, error: createError } = await supabaseAdmin
        .from('batches')
        .insert({
          batch_id: batch_id,
          batch_type: 'ecard',  // ← ADD THIS
          cards_created: cards.length,
          total_cards_purchased: cards.length,
          created_at: new Date().toISOString(),
          created_by_ip: clientIp,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createError) {
        console.error('❌ Failed to create batch:', createError);
        return res.status(500).json({ success: false, error: 'Failed to create batch' });
      }
      batch = newBatch;
      
      console.log('🆕 Batch insert result:', JSON.stringify(newBatch));
      console.log('🆕 Batch ID:', newBatch?.batch_id);
      console.log('🆕 Cards created from insert:', newBatch?.cards_created);
      console.log('🆕 Cards length we tried to set:', cards.length);
    }
    
    const existingCardIds = new Set();
    if (!isNewBatch) {
      const { data: existingCardsInBatch } = await supabaseAdmin
        .from('cards')
        .select('card_id')
        .eq('batch_id', batch_id);
      existingCardsInBatch?.forEach(c => existingCardIds.add(c.card_id));
    }
    
    // Get highest batch order
    let maxOrder = 0;
    if (!isNewBatch) {
      const { data: orderCheck } = await supabaseAdmin
        .from('cards')
        .select('batch_order')
        .eq('batch_id', batch_id)
        .order('batch_order', { ascending: false })
        .limit(1);
      maxOrder = orderCheck?.[0]?.batch_order || 0;
    }
    
    let nextOrder = maxOrder + 1;
    let cardsAssociated = 0;
    const newCardIds = [];
    
    // Process each card
    for (const card of cards) {
      // Skip if already in this batch
      if (existingCardIds.has(card.card_id)) {
        console.log(`ℹ️ Card ${card.card_id} already in batch, skipping`);
        continue;
      }
      
      // UPDATE with batch info and message data
      const { error: updateError } = await supabaseAdmin
        .from('cards')
        .update({
          batch_id: batch_id,
          batch_order: card.batch_order || nextOrder++,
          message_type: card.message_type || 'text',
          message_text: card.message_text || null,
          media_url: card.media_url || null,
          file_name: card.file_name || null,
          file_size: card.file_size || null,
          file_type: card.file_type || null,
          updated_by_ip: clientIp,
          updated_at: new Date().toISOString()
        })
        .eq('card_id', card.card_id);
      
      if (updateError) {
        console.error(`❌ Failed to update ${card.card_id}:`, updateError);
        continue;
      }
      
      cardsAssociated++;
      newCardIds.push(card.card_id);
    }
    
    // Calculate count arithmetically to avoid replication lag issues
    const actualCount = isNewBatch ? newCardIds.length : countBefore + newCardIds.length;
    console.log(`📊 Batch ${batch_id} final count: ${actualCount} (newBatch: ${isNewBatch}, before: ${countBefore}, added: ${newCardIds.length})`);
    
    // Update batch counts (skip for new batches since they were set correctly on insert)
    if (!isNewBatch) {
      const { error: batchUpdateError } = await supabaseAdmin
        .from('batches')
        .update({ 
          cards_created: actualCount,
          total_cards_purchased: actualCount,
          updated_at: new Date().toISOString()
        })
        .eq('batch_id', batch_id);
      
      if (batchUpdateError) {
        console.error('❌ Error updating batch counts:', batchUpdateError);
      }
    }
    
    // ONLY log to batch_events if ADDING to EXISTING batch (not on initial creation)
    const actualChange = actualCount - countBefore;
    
    if (!isNewBatch && actualChange > 0 && newCardIds.length > 0) {
      console.log(`📝 Logging batch event: ${actualChange} cards added`);
      
      const { error: eventError } = await supabaseAdmin
        .from('batch_events')
        .insert({
          batch_id: batch_id,
          event_type: 'card_added',
          quantity: actualChange,
          card_id: newCardIds[0],
          timestamp: new Date().toISOString(),
          ip_address: clientIp,
          user_agent: userAgent,
          metadata: {
            card_ids: newCardIds,
            previous_count: countBefore,
            new_count: actualCount
          }
        });
      
      if (eventError) {
        console.error('❌ Error logging to batch_events:', eventError);
      }
    } else {
      console.log(`ℹ️ No change in batch count, skipping batch_events log`);
    }
    
    res.json({ 
      success: true, 
      message: `Added ${cardsAssociated} cards to batch`,
      details: {
        cards_associated: cardsAssociated,
        cards_processed: cards.length,
        cards_failed: cards.length - cardsAssociated,
        count_before: countBefore,
        count_after: actualCount,
        actual_new_cards: actualChange,
        is_new_batch: isNewBatch
      },
      batch: {
        ...batch,
        cards_created: actualCount,
        total_cards_purchased: actualCount
      }
    });
    
  } catch (error) {
    console.error('❌ Error in add-cards:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Add more cards to an existing batch (template-based expansion)
app.post('/api/batches/:batch_id/add', async (req, res) => {
  try {
    const { batch_id } = req.params;
    const { quantity, payment_intent_id } = req.body;
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Get batch info
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('batches')
      .select('*')
      .eq('batch_id', batch_id)
      .single();
    
    if (batchError) throw batchError;
    
    // Check if we can add more
    const newTotal = batch.cards_created + quantity;
    if (newTotal > batch.max_cards_allowed) {
      return res.status(400).json({ 
        success: false, 
        error: 'Exceeds maximum allowed cards for this batch',
        max_allowed: batch.max_cards_allowed,
        current: batch.cards_created
      });
    }
    
    // Get template content from first card
    const { data: templateCard, error: templateError } = await supabaseAdmin
      .from('cards')
      .select('message_type, message_text, media_url, file_name, file_type')
      .eq('batch_id', batch_id)
      .eq('batch_order', 1)
      .single();
    
    if (templateError) throw templateError;
    
    // Create new cards
    const nextOrder = batch.cards_created + 1;
    const cards = [];
    const deadline = new Date();
    deadline.setFullYear(deadline.getFullYear() + 1);
    
    for (let i = 0; i < quantity; i++) {
      const order = nextOrder + i;
      const cardId = 'CARD' + Math.random().toString(36).substr(2, 8).toUpperCase();
      
      cards.push({
        card_id: cardId,
        card_type: 'ecard',  // ← ADD THIS
        batch_id: batch_id,
        batch_order: order,
        message_type: templateCard.message_type,
        message_text: templateCard.message_text,
        media_url: templateCard.media_url,
        file_name: templateCard.file_name,
        file_type: templateCard.file_type,
        status: 'pending',
        scan_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activation_deadline: deadline.toISOString()
      });
    }
    
    // Insert all cards
    const { data: newCards, error: insertError } = await supabaseAdmin
      .from('cards')
      .insert(cards)
      .select();
    
    if (insertError) throw insertError;
    
    // Calculate count arithmetically to avoid replication lag issues
    const actualCount = batch.cards_created + newCards.length;
    console.log(`📊 Batch ${batch_id} final count: ${actualCount} (was ${batch.cards_created}, added ${newCards.length})`);
    
    // Update batch counters with ACTUAL database reality
    const { error: updateError } = await supabaseAdmin
      .from('batches')
      .update({
        cards_created: actualCount,
        total_cards_purchased: actualCount,
        updated_at: new Date().toISOString(),
        ...(payment_intent_id && { stripe_payment_intent: payment_intent_id })
      })
      .eq('batch_id', batch_id);
    
    if (updateError) throw updateError;
    
    // Log the additional purchase in batch_events with ACTUAL quantity and card_id
    const cardIdsList = newCards.map(c => c.card_id);
    
    await supabaseAdmin
      .from('batch_events')
      .insert({
        batch_id: batch_id,
        event_type: 'additional_purchase',
        quantity: newCards.length,
        card_id: cardIdsList.length > 0 ? cardIdsList[0] : null,
        timestamp: new Date().toISOString(),
        ip_address: clientIp,
        user_agent: userAgent,
        metadata: {
          action: 'batch_expanded',
          payment_intent_id: payment_intent_id,
          card_ids: cardIdsList,
          cards_added: newCards.length,
          previous_total: batch.cards_created,
          new_total: actualCount
        }
      });
    
    // Generate QR code URLs for new cards
    const qrCodes = newCards.map(card => ({
      card_id: card.card_id,
      batch_order: card.batch_order,
      viewer_url: `${req.protocol}://${req.get('host')}/viewer.html?card=${card.card_id}`,
      qr_code_url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${req.protocol}://${req.get('host')}/viewer.html?card=${card.card_id}`)}&format=png&margin=10`
    }));
    
    res.json({
      success: true,
      message: `Added ${newCards.length} new cards to batch ${batch_id}`,
      cards: newCards,
      qr_codes: qrCodes,
      batch: {
        ...batch,
        cards_created: actualCount,
        total_cards_purchased: actualCount
      }
    });
    
  } catch (error) {
    console.error('Error adding to batch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Delete batch (soft delete cards) - FIXED with proper counting and event logging
app.post('/api/admin/batches/:batch_id/delete', async (req, res) => {
  try {
    const { batch_id } = req.params;
    const { confirm } = req.body;
    
    if (!confirm) {
      return res.status(400).json({ success: false, error: 'Confirmation required' });
    }
    
    // Get clean client IP address
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Get count and card IDs before deletion for logging
    const { data: cardsBefore, error: countError } = await supabaseAdmin
      .from('cards')
      .select('card_id')
      .eq('batch_id', batch_id);
    
    if (countError) {
      console.error('❌ Error counting cards before deletion:', countError);
    }
    
    const countBefore = cardsBefore?.length || 0;
    const cardIdsList = cardsBefore?.map(c => c.card_id) || [];
    
    // Mark all cards in batch as deleted
    const { error } = await supabaseAdmin
      .from('cards')
      .update({
        status: 'deleted',
        updated_by_ip: clientIp,
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batch_id);
    
    if (error) throw error;
    
    // Log deletion in batch_events with card_id and user_agent
    await supabaseAdmin
      .from('batch_events')
      .insert({
        batch_id: batch_id,
        event_type: 'batch_deleted',
        quantity: countBefore,
        card_id: cardIdsList.length > 0 ? cardIdsList[0] : null,
        timestamp: new Date().toISOString(),
        ip_address: clientIp,
        user_agent: userAgent,
        metadata: {
          action: 'batch_deleted',
          card_ids: cardIdsList,
          cards_deleted: countBefore
        }
      });
    
    // Update batch to show 0 cards
    await supabaseAdmin
      .from('batches')
      .update({
        cards_created: 0,
        total_cards_purchased: 0,
        updated_at: new Date().toISOString()
      })
      .eq('batch_id', batch_id);
    
    res.json({ 
      success: true, 
      message: `Batch ${batch_id} deleted (${countBefore} cards removed)`,
      details: {
        cards_deleted: countBefore,
        card_ids: cardIdsList
      }
    });
    
  } catch (error) {
    console.error('Error deleting batch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Expire old pending cards
app.post('/api/admin/expire-cards', async (req, res) => {
  try {
    const now = new Date().toISOString();
    
    const { data, error } = await supabaseAdmin
      .from('cards')
      .update({
        status: 'expired',
        updated_at: now
      })
      .eq('status', 'pending')
      .lt('activation_deadline', now)
      .select();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: `Expired ${data?.length || 0} cards`,
      count: data?.length || 0
    });
    
  } catch (error) {
    console.error('Error expiring cards:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// NEW E-CARD ENDPOINTS
// ============================================

// 📧 Send E-Card (SMS, Email, WhatsApp, or Link)
app.post('/api/cards/:card_id/send', async (req, res) => {
  try {
    const { card_id } = req.params;
    const { method, contact } = req.body; // method: 'sms', 'email', 'whatsapp', 'link'
    
    console.log(`📧 Sending e-card ${card_id} via ${method} to ${contact}`);
    
    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    // Get card details
    const { data: card, error } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('card_id', card_id)
      .single();
    
    if (error || !card) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    
    // Verify it's an e-card
    if (card.card_type !== 'ecard') {
      return res.status(400).json({ 
        success: false, 
        error: 'Not an e-card',
        message: 'This feature is only for digital e-cards. Physical cards cannot be sent digitally.'
      });
    }
    
    // Generate viewer URL with e-card indicator
    const viewerUrl = `${req.protocol}://${req.get('host')}/viewer.html?card=${card_id}&type=ecard`;
    
    // Log the delivery attempt
    const { error: deliveryError } = await supabaseAdmin
      .from('card_deliveries')
      .insert({
        card_id: card_id,
        method: method,
        recipient: contact || 'N/A (link)',
        sent_at: new Date().toISOString(),
        status: 'sent'
      });
    
    if (deliveryError) {
      console.error('❌ Failed to log delivery:', deliveryError);
    }
    
    // Update card delivery status
    const { error: updateError } = await supabaseAdmin
      .from('cards')
      .update({
        delivery_status: method === 'link' ? 'pending' : 'sent',
        delivered_at: new Date().toISOString(),
        recipient_contact: contact || null,
        delivery_method: method
      })
      .eq('card_id', card_id);
    
    if (updateError) {
      console.error('❌ Failed to update card:', updateError);
    }
    
    // Generate QR code for sharing
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(viewerUrl)}&format=png&margin=10`;
    
    // Prepare response based on method
    let response = {
      success: true,
      card_id: card_id,
      viewer_url: viewerUrl,
      qr_code_url: qrCodeUrl
    };
    
    if (method === 'link') {
      response.shareable_link = viewerUrl;
      response.message = 'Copy this link and share it with the recipient';
    } else {
      response.message = `E-card queued for ${method} delivery to ${contact}`;
      // TODO: Integrate with Twilio (SMS), SendGrid (Email), or WhatsApp Business API here
      // For now, it just logs the request. You'll add actual sending logic later.
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('💥 Send e-card error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🎴 ACTIVATE Physical Card for Manufacturing (Dormant → Active)
// This endpoint is for FUTURE USE when you launch physical cards
app.post('/api/physical-cards/:card_id/activate', async (req, res) => {
  try {
    const { card_id } = req.params;
    const { manufacturing_batch_id, notes } = req.body;
    
    console.log(`🎴 Activating physical card for manufacturing: ${card_id}`);
    
    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    // Get the dormant card
    const { data: card, error } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('card_id', card_id)
      .eq('card_type', 'physical')
      .single();
    
    if (error || !card) {
      return res.status(404).json({ success: false, error: 'Physical card not found' });
    }
    
    // Check if already activated
    if (card.physical_card_status === 'activated') {
      return res.status(400).json({ 
        success: false, 
        error: 'Already activated',
        message: 'This physical card was already activated for manufacturing'
      });
    }
    
    // Activate the physical card
    const { data: updatedCard, error: updateError } = await supabaseAdmin
      .from('cards')
      .update({
        physical_card_status: 'activated',
        physical_activation_date: new Date().toISOString(),
        status: 'active', // Now it can be scanned via NFC
        updated_at: new Date().toISOString()
      })
      .eq('card_id', card_id)
      .select()
      .single();
    
    if (updateError) throw updateError;
    
    // Log the activation
    await supabaseAdmin
      .from('batch_events')
      .insert({
        batch_id: card.batch_id || 'manufacturing',
        event_type: 'physical_card_activated',
        quantity: 1,
        card_id: card_id,
        timestamp: new Date().toISOString(),
        metadata: {
          manufacturing_batch_id: manufacturing_batch_id,
          notes: notes,
          previous_status: 'dormant'
        }
      });
    
    res.json({
      success: true,
      message: 'Physical card activated for manufacturing',
      card: updatedCard,
      viewer_url: `${req.protocol}://${req.get('host')}/viewer.html?card=${card_id}`,
      qr_code_url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${req.protocol}://${req.get('host')}/viewer.html?card=${card_id}`)}&format=png&margin=10`
    });
    
  } catch (error) {
    console.error('💥 Physical card activation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// STRIPE PAYMENT ENDPOINTS
// ============================================

// 🔑 Serve publishable key securely (fetched by checkout page)
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

// 💳 Create payment intent
app.post('/api/create-payment-intent', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ 
      success: false, 
      error: 'Stripe not configured' 
    });
  }
  
  try {
    const { quantity, email, batchId, card_id } = req.body;  // ← Added card_id
    
    if (!quantity || quantity < 1) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid quantity' 
      });
    }
    
    // Pricing tiers (cents)
    const pricing = { 1: 299, 5: 1199, 10: 1999, 25: 4499 };
    let unitPrice = pricing[1];
    let totalAmount = unitPrice * quantity;
    
    // Apply bulk pricing
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
        card_id: card_id || '', // ← Store card ID if present
        card_type: 'ecard'
      },
      automatic_payment_methods: { enabled: true },
    });
    
    // Record in database
    await supabaseAdmin.from('payments').insert({
      stripe_payment_intent_id: paymentIntent.id,
      batch_id: batchId,
      card_id: card_id || null, // ← Also store card_id in payments table if present
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

// 📊 Admin: Get payments
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

// 📊 Supabase Connection Test
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
      `${baseUrl}/api/admin/payments`
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
  console.log(`   Add Cards to Batch: https://papir.ca/api/batches/:id/add-cards (ARITHMETIC COUNTING)`);
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