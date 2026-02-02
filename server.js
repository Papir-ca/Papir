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

// Multer for file uploads (temporary storage before Supabase)
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.existsSync('uploads');
}

// Health check endpoint
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
        console.log('Fetching all cards from Supabase...');
        
        const { data, error } = await supabase
            .from('cards')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
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
        console.log(`Fetching card: ${cardId}`);
        
        const { data, error } = await supabase
            .from('cards')
            .select('*')
            .eq('card_id', cardId.toUpperCase())
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') { // No rows returned
                return res.status(404).json({
                    success: false,
                    error: `Card ${cardId} not found`
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

// Get media files for a card
app.get('/api/cards/:cardId/media', async (req, res) => {
    try {
        const { cardId } = req.params;
        console.log(`Fetching media for card: ${cardId}`);
        
        // List files from Supabase Storage bucket
        const { data: files, error } = await supabase.storage
            .from('card-media')
            .list(cardId);
        
        if (error) {
            console.error('Error listing media files:', error);
            // Return empty array if bucket doesn't exist
            return res.json({
                success: true,
                files: []
            });
        }
        
        // Generate public URLs for each file
        const filesWithUrls = files.map(file => {
            const { data } = supabase.storage
                .from('card-media')
                .getPublicUrl(`${cardId}/${file.name}`);
            
            return {
                name: file.name,
                url: data.publicUrl,
                type: file.metadata?.mimetype || 'application/octet-stream'
            };
        });
        
        res.json({
            success: true,
            files: filesWithUrls
        });
        
    } catch (error) {
        console.error('Error fetching media:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Upload media file to Supabase
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
        
        // Read the file
        const fileBuffer = fs.readFileSync(file.path);
        
        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('card-media')
            .upload(`${cardId}/${fileName}`, fileBuffer, {
                contentType: fileType,
                upsert: true
            });
        
        // Clean up temporary file
        fs.unlinkSync(file.path);
        
        if (error) {
            console.error('Supabase upload error:', error);
            throw error;
        }
        
        // Get public URL
        const { data: urlData } = supabase.storage
            .from('card-media')
            .getPublicUrl(`${cardId}/${fileName}`);
        
        res.json({
            success: true,
            message: 'File uploaded successfully',
            url: urlData.publicUrl,
            fileName: fileName
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create or update a card
app.post('/api/cards', async (req, res) => {
    try {
        const { card_id, message_type, message_text, media_url, status } = req.body;
        
        console.log(`Saving card: ${card_id}, Type: ${message_type}`);
        
        // Check if card already exists
        const { data: existingCard } = await supabase
            .from('cards')
            .select('*')
            .eq('card_id', card_id)
            .single();
        
        let result;
        
        if (existingCard) {
            // Update existing card
            const { data, error } = await supabase
                .from('cards')
                .update({
                    message_type,
                    message_text,
                    media_url,
                    status,
                    updated_at: new Date().toISOString()
                })
                .eq('card_id', card_id)
                .select()
                .single();
            
            if (error) throw error;
            result = data;
            
        } else {
            // Create new card
            const { data, error } = await supabase
                .from('cards')
                .insert({
                    card_id,
                    message_type,
                    message_text,
                    media_url,
                    status,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
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

// Delete a card
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
        
        // Try to delete media files from storage
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
            // Continue even if media deletion fails
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

// Start server
app.listen(PORT, () => {
    console.log(`Papir Backend running on port ${PORT}`);
    console.log(`Supabase connected: ${supabaseUrl ? 'Yes' : 'No'}`);
});
