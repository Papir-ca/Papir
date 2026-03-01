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
        "'unsafe-inline'",
        "'unsafe-eval'"
      ],
      styleSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com",
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
        "https://api.qrserver.com"
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

// 🛡️ Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes.'
});
app.use('/api/', limiter);

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
      incrementScan: `POST ${baseUrl}/api/increment-scan`
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

// 🎨 Save a Magic Card
app.post('/api/cards', async (req, res) => {
  try {
    const { card_id, message_type, message_text, media_url, file_name, file_size, file_type } = req.body;
    
    console.log(`📨 Saving card: ${card_id}, Type: ${message_type}`);
    
    // Get client IP address
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
    if (clientIp.includes(',')) {
        clientIp = clientIp.split(',')[0].trim(); // Take only the first IP
     } 
    
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
      // 🔴 YOU'RE MISSING THIS ENTIRE SECTION 🔴
      // UPDATE existing card (this happens after activation)
      console.log(`🔄 Updating existing card: ${card_id}`);
      
      const { data, error } = await supabaseAdmin
        .from('cards')
        .update({
          message_type: message_type.trim(),
          message_text: message_text ? message_text.trim() : null,
          media_url: media_url || null,
          file_name: file_name || null,
          file_size: file_size || null,
          file_type: file_type || null,
          updated_by_ip: clientIp,
          updated_at: new Date().toISOString()
        })
        .eq('card_id', card_id)
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    
    } else {
      // INSERT new card (this happens when card is first created)
      console.log(`🆕 Creating new card: ${card_id}`);
      
      const cardRecord = {
        card_id: card_id.trim(),
        message_type: message_type.trim(),
        message_text: message_text ? message_text.trim() : null,
        media_url: media_url || null,
        file_name: file_name || null,
        file_size: file_size || null,
        file_type: file_type || null,
        scan_count: 0,
        status: 'pending', // Physical cards start as pending
        created_by_ip: clientIp,
        updated_by_ip: clientIp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
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

// 🖼️ Upload Media Files to Supabase Storage
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
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false,
          error: 'Card not found',
          message: `No card found with ID: ${card_id}`
        });
      }
      
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

// 🎟️ Activate Card (for physical cards)
app.post('/api/activate-card', async (req, res) => {
  try {
    const { card_id } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Check if card exists and is pending
    const { data: card, error: fetchError } = await supabaseAdmin
      .from('cards')
      .select('status')
      .eq('card_id', card_id)
      .single();
    
    if (fetchError || !card) {
      return res.json({ success: false, error: 'Card not found' });
    }
    
    if (card.status !== 'pending') {
      return res.json({ success: false, error: 'Card already activated' });
    }
    
    // Activate the card
    const { error } = await supabaseAdmin
      .from('cards')
      .update({
        status: 'active',
        activated_at: new Date().toISOString(),
        activated_by_ip: clientIp,
        terms_accepted_at: new Date().toISOString(),
        terms_accepted_ip: clientIp
      })
      .eq('card_id', card_id);
    
    if (error) throw error;
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Activation error:', error);
    res.json({ success: false, error: 'Server error' });
  }
});

// 🔢 Increment scan count
app.post('/api/increment-scan', async (req, res) => {
  try {
    const { card_id } = req.body;
    
    console.log(`📊 Incrementing scan count for: ${card_id}`);
    
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        success: false,
        error: 'Database service temporarily unavailable'
      });
    }
    
    // Get current count
    const { data: card, error: fetchError } = await supabaseAdmin
      .from('cards')
      .select('scan_count')
      .eq('card_id', card_id)
      .single();
    
    if (fetchError) {
      console.error('❌ Fetch error:', fetchError);
      return res.json({ success: false, error: fetchError.message });
    }
    
    // Increment by 1
    const currentCount = card?.scan_count || 0;
    const { error } = await supabaseAdmin
      .from('cards')
      .update({ scan_count: currentCount + 1 })
      .eq('card_id', card_id);
    
    if (error) {
      console.error('❌ Update error:', error);
      return res.json({ success: false, error: error.message });
    }
    
    console.log(`✅ Scan count updated: ${card_id} now has ${currentCount + 1} scans`);
    res.json({ success: true, count: currentCount + 1 });
    
  } catch (error) {
    console.error('💥 Increment error:', error);
    res.json({ success: false, error: error.message });
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
  
  console.log('\n🎯 FEATURES:');
  console.log('   ✅ Media uploads to Supabase Storage');
  console.log('   ✅ File metadata tracking');
  console.log('   ✅ IP address tracking');
  console.log('   ✅ QR code generation');
  console.log('   ✅ Scan count tracking');
  console.log('   ✅ Card activation flow (physical cards)');
  console.log('   ✅ 24/7 Railway hosting');
  
  console.log('\n' + '─'.repeat(70));
  console.log('   🚀 Papir Business is LIVE at https://papir.ca!');
  console.log('─'.repeat(70) + '\n');
});
