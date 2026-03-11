// 🎪 Papir Business Server - PRODUCTION READY
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

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
        "https://api.ipify.org"
      ],
      fontSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com",
        "data:"
      ],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:", "https://elmhkhvryjzljxskbfps.supabase.co"],
      frameSrc: ["'none'"],
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

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// 🛡️ Rate Limiting - Simple and working
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes
  message: 'Too many requests from this IP, please try again after 15 minutes.'
});

// Apply the main limiter to all API routes
app.use('/api/', limiter);

// Higher limit for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  message: 'Admin rate limit reached, please slow down.'
});
app.use('/api/admin/', adminLimiter);

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
      saveCard: `POST ${baseUrl}/api/cards`,
      getCard: `GET ${baseUrl}/api/cards/:id`,
      uploadMedia: `POST ${baseUrl}/api/upload-media`,
      incrementScan: `POST ${baseUrl}/api/increment-scan`,
      scanLogs: `GET ${baseUrl}/api/scan-logs`,
      adminCard: `GET ${baseUrl}/api/admin/cards/:id`,
      abandonedCards: `GET ${baseUrl}/api/admin/abandoned`,
      geolocation: `GET ${baseUrl}/api/admin/geolocation/:card_id`,
      mismatchAlerts: `GET ${baseUrl}/api/admin/mismatch-alerts`,
      batches: `POST ${baseUrl}/api/admin/batches`,
      deleteBatch: `POST ${baseUrl}/api/admin/batches/:batch_id/delete`,
      expireCards: `POST ${baseUrl}/api/admin/expire-cards`
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

// Helper function to get geolocation from IP
async function getGeolocationFromIp(ip) {
  try {
    // Skip private IPs
    if (ip === 'unknown' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '127.0.0.1') {
      return null;
    }
    
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    const data = await response.json();
    
    if (data.error) {
      return null;
    }
    
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
  } catch (error) {
    console.error('Geolocation error:', error.message);
    return null;
  }
}

// 🎨 Save a Magic Card - UPDATED with batch fields and activation deadline
app.post('/api/cards', async (req, res) => {
  try {
    const { card_id, message_type, message_text, media_url, file_name, file_size, file_type, batch_id, batch_order } = req.body;
    
    console.log(`📨 Saving card: ${card_id}, Type: ${message_type}`);
    
    // Get client IP address
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
    
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
      .select('card_id')
      .eq('card_id', card_id)
      .maybeSingle();
    
    let result;
    
    if (existingCard) {
      // UPDATE existing card
      console.log(`🔄 Updating existing card: ${card_id}`);
      
      const { data: cardCheck } = await supabaseAdmin
        .from('cards')
        .select('created_by_ip')
        .eq('card_id', card_id)
        .single();
      
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
      
      // If card is pending and has no deadline, set one
      const { data: currentCard } = await supabaseAdmin
        .from('cards')
        .select('status, activation_deadline')
        .eq('card_id', card_id)
        .single();
      
      if (currentCard && currentCard.status === 'pending' && !currentCard.activation_deadline) {
        const deadline = new Date();
        deadline.setFullYear(deadline.getFullYear() + 1);
        updateData.activation_deadline = deadline.toISOString();
        console.log(`📅 Setting missing deadline for pending card ${card_id}`);
      }
      
      if (!cardCheck?.created_by_ip) {
        console.log(`📝 Setting created_by_ip for first time: ${clientIp}`);
        updateData.created_by_ip = clientIp;
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
      console.log(`🆕 Creating new card: ${card_id}`);
      
      // Set activation deadline (1 year from now)
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
        status: 'pending',
        created_by_ip: clientIp,
        updated_by_ip: clientIp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activation_deadline: deadline.toISOString()
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
    
    console.log(`✅ Card saved: ${card_id}`);
    
    const viewerUrl = `${req.protocol}://${req.get('host')}/viewer.html?card=${card_id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(viewerUrl)}&format=png&margin=10`;
    
    res.status(201).json({ 
      success: true, 
      message: 'Card saved successfully!',
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

// 🗑️ Delete Card
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
    
    // Get client IP for update
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
    
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
    
    res.json({ 
      success: true, 
      message: `Card ${card_id} deleted successfully`
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
    
    // Fix IP handling
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
    if (clientIp.includes(',')) {
        clientIp = clientIp.split(',')[0].trim();
    }
    
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
    
    if (card.status !== 'pending') {
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

// 🔢 STEP 2: Increment scan count AND log individual scan (UPDATED)
app.post('/api/increment-scan', async (req, res) => {
  try {
    const { card_id } = req.body;
    
    // Get client IP
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
    
    console.log(`📊 Processing scan for: ${card_id} from IP: ${clientIp}`);
    
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        success: false,
        error: 'Database service temporarily unavailable'
      });
    }
    
    // 1. Log the individual scan
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

// 📊 Create a new batch
app.post('/api/admin/batches', async (req, res) => {
  try {
    const { batch_id, shipping_address, shipping_country, shipping_city } = req.body;
    
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
    
    const { data, error } = await supabaseAdmin
      .from('batches')
      .insert({
        batch_id,
        shipping_address,
        shipping_country,
        shipping_city,
        created_at: new Date().toISOString(),
        created_by_ip: clientIp
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

// 📊 Delete batch (soft delete cards)
app.post('/api/admin/batches/:batch_id/delete', async (req, res) => {
  try {
    const { batch_id } = req.params;
    const { confirm } = req.body;
    
    if (!confirm) {
      return res.status(400).json({ success: false, error: 'Confirmation required' });
    }
    
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
    
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
    
    res.json({ success: true, message: `Batch ${batch_id} deleted` });
    
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
      `${baseUrl}/api/admin/batches`,
      `${baseUrl}/api/admin/batches/:id/delete`,
      `${baseUrl}/api/admin/expire-cards`,
      `${baseUrl}/api/test-supabase`
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
  console.log(`   Batches: https://papir.ca/api/admin/batches`);
  console.log(`   Batch Delete: https://papir.ca/api/admin/batches/:id/delete`);
  console.log(`   Expire Cards: https://papir.ca/api/admin/expire-cards`);
  
  console.log('\n🎯 FEATURES:');
  console.log('   ✅ Media uploads to Supabase Storage');
  console.log('   ✅ File metadata tracking');
  console.log('   ✅ IP address tracking');
  console.log('   ✅ QR code generation');
  console.log('   ✅ Scan count tracking');
  console.log('   ✅ Individual scan logging');
  console.log('   ✅ Analytics dashboard');
  console.log('   ✅ Card activation flow (physical cards)');
  console.log('   ✅ File type validation on server');
  console.log('   ✅ Admin endpoint with activation history');
  console.log('   ✅ Batch management system');
  console.log('   ✅ Activation deadlines');
  console.log('   ✅ IP geolocation tracking');
  console.log('   ✅ Duplicate scan detection');
  console.log('   ✅ Abandoned card tracking');
  console.log('   ✅ Geographic mismatch alerts');
  console.log('   ✅ Batch deletion handling');
  console.log('   ✅ Card expiration (1 year)');
  console.log('   ✅ 24/7 Railway hosting');
  
  console.log('\n' + '─'.repeat(70));
  console.log('   🚀 Papir Business is LIVE at https://papir.ca!');
  console.log('─'.repeat(70) + '\n');
});
