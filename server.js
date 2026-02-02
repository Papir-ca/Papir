const express = require('express');
const cors = require('cors');
require('dotenv').config();
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

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.existsSync('uploads');
}

// =============== API ENDPOINTS ===============

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Papir Backend is running',
        timestamp: new Date().toISOString()
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
        
        if (error) throw error;
        
        res.json({
            success: true,
            cards: data || []
        });
        
    } catch (error) {
        console.error('Error fetching cards:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get single card
app.get('/api/cards/:cardId', async (req, res) => {
    try {
        const { cardId } = req.params;
        const formattedCardId = cardId.toUpperCase();
        console.log(`Fetching card: ${formattedCardId}`);
        
        const { data, error } = await supabase
            .from('cards')
            .select('*')
            .eq('card_id', formattedCardId)
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    error: `Card ${formattedCardId} not found`
                });
            }
            throw error;
        }
        
        res.json({
            success: true,
            card: data
        });
        
    } catch (error) {
        console.error('Error fetching card:', error);
        res.status(500).json({
            success: false,
            error: error.message
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
        const file = req.file;
        
        console.log(`Uploading media for card ${cardId}: ${fileName}`);
        
        // Read file
        const fileBuffer = fs.readFileSync(file.path);
        const fileSize = file.size;
        
        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('card-media')
            .upload(`${cardId}/${fileName}`, fileBuffer, {
                contentType: fileType,
                upsert: true
            });
        
        // Clean up temp file
        fs.unlinkSync(file.path);
        
        if (error) throw error;
        
        // Get public URL
        const { data: urlData } = supabase.storage
            .from('card-media')
            .getPublicUrl(`${cardId}/${fileName}`);
        
        res.json({
            success: true,
            message: 'File uploaded successfully',
            url: urlData.publicUrl,
            fileName: fileName,
            fileType: fileType,
            fileSize: fileSize
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message
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
            media_url,  // Added media_url field
            status 
        } = req.body;
        
        console.log(`Saving card: ${card_id}, Type: ${message_type}`);
        
        // Check if card exists
        const { data: existingCard } = await supabase
            .from('cards')
            .select('*')
            .eq('card_id', card_id)
            .single();
        
        let result;
        const now = new Date().toISOString();
        
        if (existingCard) {
            // Update existing card
            const updateData = {
                message_type,
                message_text,
                status: status || 'active',
                updated_at: now
            };
            
            // Add file fields if provided
            if (file_name) updateData.file_name = file_name;
            if (file_size) updateData.file_size = file_size;
            if (file_type) updateData.file_type = file_type;
            if (file_url) updateData.file_url = file_url;
            if (media_url) updateData.media_url = media_url;
            
            const { data, error } = await supabase
                .from('cards')
                .update(updateData)
                .eq('card_id', card_id)
                .select()
                .single();
            
            if (error) throw error;
            result = data;
            
        } else {
            // Create new card
            const insertData = {
                card_id,
                message_type,
                message_text,
                status: status || 'active',
                created_at: now,
                updated_at: now
            };
            
            // Add file fields if provided
            if (file_name) insertData.file_name = file_name;
            if (file_size) insertData.file_size = file_size;
            if (file_type) insertData.file_type = file_type;
            if (file_url) insertData.file_url = file_url;
            if (media_url) insertData.media_url = media_url;
            
            const { data, error } = await supabase
                .from('cards')
                .insert(insertData)
                .select()
                .single();
            
            if (error) throw error;
            result = data;
        }
        
        res.json({
            success: true,
            message: `Card ${card_id} saved successfully`,
            card: result
        });
        
    } catch (error) {
        console.error('Error saving card:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete card
app.delete('/api/cards/:cardId', async (req, res) => {
    try {
        const { cardId } = req.params;
        console.log(`Deleting card: ${cardId}`);
        
        // Delete from cards table
        const { error: deleteError } = await supabase
            .from('cards')
            .delete()
            .eq('card_id', cardId);
        
        if (deleteError) throw deleteError;
        
        // Try to delete media files
        try {
            const { data: files } = await supabase.storage
                .from('card-media')
                .list(cardId);
            
            if (files && files.length > 0) {
                const filePaths = files.map(file => `${cardId}/${file.name}`);
                await supabase.storage
                    .from('card-media')
                    .remove(filePaths);
            }
        } catch (storageError) {
            console.log('Note: Could not delete media files:', storageError.message);
        }
        
        res.json({
            success: true,
            message: `Card ${cardId} deleted successfully`
        });
        
    } catch (error) {
        console.error('Error deleting card:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =============== STATIC FILES ===============

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

// Start server
app.listen(PORT, () => {
    console.log(`✅ Papir Backend running on port ${PORT}`);
    console.log(`✅ Supabase connected: ${supabaseUrl ? 'Yes' : 'No'}`);
    console.log(`✅ Storage bucket: card-media`);
});
