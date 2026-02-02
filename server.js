// 🎪 Papir Business Server - PRODUCTION READY
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
        "https://papir.ca",           // ADDED - Your new domain
        "https://papir.up.railway.app", // ADDED - Railway URL
        "https://sharyl-nontheosophical-religiously.ngrok-free.app",
        "https://sharyl-nontheosophical-religiously.ngrok-free.dev",
        "https://sharyl-nontheosophical-religiously.ngrok-free.com",
        "https://*.ngrok-free.app",
        "https://*.ngrok-free.dev",
        "https://*.ngrok-free.com",
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
      mediaSrc: ["'self'", "blob:"],
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🛡️ Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes.'
});
app.use('/api/', limiter);

// 📁 Serve static files
app.use(express.static('public'));

// 🏠 Welcome page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
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
      maker: `${baseUrl}/maker.html`,
      viewer: `${baseUrl}/viewer.html`,
      saveCard: `POST ${baseUrl}/api/cards`,
      getCard: `GET ${baseUrl}/api/cards/:id`
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

// 🎨 Save a Magic Card - Updated for papir.ca domain
app.post('/api/cards', async (req, res) => {
  try {
    const { card_id, message_type, message_text } = req.body;
    
    console.log(`📨 Saving card: ${card_id}, Type: ${message_type}`);
    
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
    
    // Save to database
    const { data, error } = await supabaseAdmin
      .from('cards')
      .insert([{
        card_id: card_id.trim(),
        message_type: message_type.trim(),
        message_text: message_text ? message_text.trim() : null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) {
      console.error('❌ Database error:', error);
      
      if (error.code === '23505') {
        return res.status(409).json({ 
          success: false,
          error: 'Duplicate card ID',
          message: `Card "${card_id}" already exists. Please use a different ID.`
        });
      }
      
      return res.status(500).json({ 
        success: false,
        error: 'Database operation failed',
        details: error.message
      });
    }
    
    console.log(`✅ Card saved: ${card_id}`);
    
    // 🚀 SMART URL GENERATION - Uses current domain
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    const viewerUrl = `${baseUrl}/viewer.html?card=${card_id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(viewerUrl)}&format=png&margin=10`;
    
    res.status(201).json({ 
      success: true, 
      message: 'Card saved successfully!',
      card: data,
      urls: {
        share: `/viewer.html?card=${card_id}`,
        viewer: viewerUrl,
        qrCode: qrCodeUrl,
        domain: host
      },
      instructions: {
        scan: 'Scan the QR code with your phone camera',
        share: 'Share the viewer URL with anyone',
        domain: `Your card is available at: ${viewerUrl}`
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
      .eq('status', 'active')
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
    
    // Include current domain in response
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    res.json({ 
      success: true, 
      card: data,
      viewerUrl: `${baseUrl}/viewer.html?card=${card_id}`
    });
    
  } catch (error) {
    console.error('💥 Error retrieving card:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error'
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
      .select('card_id, message_type, created_at', { count: 'exact' })
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

// 🛠️ Domain Info Endpoint
app.get('/api/domain-info', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;
  
  res.json({
    domain: host,
    fullUrl: baseUrl,
    isHttps: req.secure,
    headers: {
      host: req.get('host'),
      'x-forwarded-host': req.get('x-forwarded-host'),
      'x-forwarded-proto': req.get('x-forwarded-proto')
    },
    qrCodeExample: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(`${baseUrl}/viewer.html?card=SAMPLE123`)}`
  });
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
      `${baseUrl}/maker.html`,
      `${baseUrl}/viewer.html`,
      `${baseUrl}/api/health`,
      `${baseUrl}/api/cards/:id`,
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
  
  console.log('\n🔗 TEST URLS:');
  console.log(`   Health: https://papir.ca/api/health`);
  console.log(`   Maker: https://papir.ca/maker.html`);
  console.log(`   Viewer: https://papir.ca/viewer.html`);
  console.log(`   Supabase: https://papir.ca/api/test-supabase`);
  
  console.log('\n🎯 FEATURES:');
  console.log('   ✅ Dynamic domain detection');
  console.log('   ✅ Phone-scannable QR codes');
  console.log('   ✅ 24/7 Railway hosting');
  console.log('   ✅ Professional .ca domain');
  
  console.log('\n' + '─'.repeat(70));
  console.log('   🚀 Papir Business is LIVE at https://papir.ca!');
  console.log('─'.repeat(70) + '\n');
});
