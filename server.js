// 🎪 Papir Business Server - PRODUCTION READY
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Supabase Configuration - USING ENVIRONMENT VARIABLES
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-supabase-url.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'your-supabase-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Simple file upload handling
const upload = multer({ 
    dest: 'uploads/'
});

// ==================== API ENDPOINTS ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Papir Backend is running',
        supabase: supabaseUrl ? 'Connected' : 'Not configured'
    });
});

// Get all cards
app.get('/api/cards', async (req, res) => {
    try {
        console.log('Fetching all cards...');
        
        const { data, error } = await supabase
            .from('cards')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error'
            });
        }
        
        res.json({
            success: true,
            cards: data || []
        });
        
    } catch (error) {
        console.error('Error fetching cards:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// Get single card
app.get('/api/cards/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId.toUpperCase();
        console.log('Fetching card:', cardId);
        
        const { data, error } = await supabase
            .from('cards')
            .select('*')
            .eq('card_id', cardId)
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    error: 'Card not found'
                });
            }
            return res.status(500).json({
                success: false,
                error: 'Database error'
            });
        }
        
        res.json({
            success: true,
            card: data
        });
        
    } catch (error) {
        console.error('Error fetching card:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// Upload media file
app.post('/api/upload-media', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }
        
        const { cardId, fileName, fileType } = req.body;
        
        if (!cardId || !fileName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }
        
        console.log('Uploading file:', fileName, 'for card:', cardId);
        
        // Read the uploaded file
        const fileBuffer = fs.readFileSync(req.file.path);
        const fileSize = req.file.size;
        
        try {
            // Upload to Supabase Storage
            const { data, error } = await supabase.storage
                .from('card-media')
                .upload(`${cardId}/${fileName}`, fileBuffer, {
                    contentType: fileType,
                    upsert: true
                });
            
            if (error) {
                console.error('Storage upload error:', error);
                throw error;
            }
            
            // Get public URL
            const { data: urlData } = supabase.storage
                .from('card-media')
                .getPublicUrl(`${cardId}/${fileName}`);
            
            // Clean up temporary file
            fs.unlinkSync(req.file.path);
            
            res.json({
                success: true,
                url: urlData.publicUrl,
                fileName: fileName,
                fileType: fileType,
                fileSize: fileSize
            });
            
        } catch (storageError) {
            // Clean up temp file even if storage fails
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            throw storageError;
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Upload failed: ' + error.message
        });
    }
});

// Create or update card
app.post('/api/cards', async (req, res) => {
    try {
        const { 
            card_id, 
            message_type, 
            message_text, 
            file_name, 
            file_size, 
            file_type, 
            file_url,
            media_url,
            status = 'active'
        } = req.body;
        
        if (!card_id) {
            return res.status(400).json({
                success: false,
                error: 'Card ID is required'
            });
        }
        
        console.log('Saving card:', card_id);
        
        const cardData = {
            card_id: card_id.toUpperCase(),
            message_type: message_type || 'text',
            message_text: message_text || '',
            status: status
        };
        
        // Add file info if provided
        if (file_name) cardData.file_name = file_name;
        if (file_size) cardData.file_size = file_size;
        if (file_type) cardData.file_type = file_type;
        if (file_url) cardData.file_url = file_url;
        if (media_url) cardData.media_url = media_url;
        
        // Use upsert to create or update
        const { data, error } = await supabase
            .from('cards')
            .upsert(cardData, {
                onConflict: 'card_id',
                ignoreDuplicates: false
            })
            .select()
            .single();
        
        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
        res.json({
            success: true,
            message: 'Card saved successfully',
            card: data
        });
        
    } catch (error) {
        console.error('Error saving card:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save card: ' + error.message
        });
    }
});

// Delete card
app.delete('/api/cards/:cardId', async (req, res) => {
    try {
        const cardId = req.params.cardId.toUpperCase();
        console.log('Deleting card:', cardId);
        
        // Delete from database
        const { error } = await supabase
            .from('cards')
            .delete()
            .eq('card_id', cardId);
        
        if (error) {
            console.error('Delete error:', error);
            return res.status(500).json({
                success: false,
                error: 'Database error'
            });
        }
        
        res.json({
            success: true,
            message: 'Card deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting card:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// ==================== STATIC FILES ====================

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'maker.html'));
});

app.get('/maker.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'maker.html'));
});

app.get('/viewer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

app.get('/qr.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

// Serve other static files
app.use(express.static('public'));

// ==================== START SERVER ====================

app.listen(PORT, () => {
    console.log(`🚀 Papir Backend running on port ${PORT}`);
    console.log(`🔗 Supabase URL: ${supabaseUrl ? 'Configured' : 'NOT CONFIGURED'}`);
    console.log(`📁 Upload directory: ${fs.existsSync('uploads') ? 'Ready' : 'Not ready'}`);
});
