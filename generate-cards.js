const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Your existing card ID generator
function generateCardId() {
  return 'CARD_' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

// How many cards to generate
const BATCH_SIZE = 100; // Change to however many you need
const cards = [];
const csvRows = ['Card ID,QR URL'];
const existingIds = new Set(); // Store IDs we've already generated in this batch

async function generateBatch() {
  console.log('🎴 ' + '='.repeat(50));
  console.log(`🎴 Generating ${BATCH_SIZE} cards...`);
  console.log('🎴 ' + '='.repeat(50));
  
  // First, fetch all existing card IDs from database
  console.log('📡 Fetching existing cards from database...');
  const { data: existingCards, error: fetchError } = await supabase
    .from('cards')
    .select('card_id');
  
  if (fetchError) {
    console.error('❌ Failed to fetch existing cards:', fetchError);
    return;
  }
  
  // Create a Set of existing IDs for quick lookup
  const existingDbIds = new Set(existingCards.map(c => c.card_id));
  console.log(`📊 Found ${existingDbIds.size} existing cards in database`);
  console.log('');
  
  let generated = 0;
  let attempts = 0;
  const maxAttempts = BATCH_SIZE * 10; // Safety limit to prevent infinite loop
  
  while (generated < BATCH_SIZE && attempts < maxAttempts) {
    attempts++;
    
    // Generate a new ID
    const cardId = generateCardId();
    
    // Check if it's already in database OR already generated in this batch
    if (!existingDbIds.has(cardId) && !existingIds.has(cardId)) {
      // It's unique!
      existingIds.add(cardId);
      
      const viewerUrl = `https://papir.ca/viewer.html?card=${cardId}`;
      
      cards.push({
        card_id: cardId,
        status: 'pending',
        created_at: new Date().toISOString()
      });
      
      csvRows.push(`${cardId},${viewerUrl}`);
      
      generated++;
      
      // Progress indicator
      if (generated % 10 === 0 || generated === BATCH_SIZE) {
        console.log(`✅ Generated ${generated}/${BATCH_SIZE} (after ${attempts} attempts)`);
      }
    } else {
      // Duplicate found - silently skip and try again
      if (attempts % 100 === 0) {
        console.log(`🔄 Found ${attempts - generated} duplicates so far...`);
      }
    }
  }
  
  if (attempts >= maxAttempts) {
    console.error('❌ Reached maximum attempts without generating enough unique IDs');
    return;
  }
  
  console.log('');
  console.log('📦 Inserting cards into Supabase...');
  
  // Insert into Supabase
  const { error } = await supabase
    .from('cards')
    .insert(cards);
  
  if (error) {
    console.error('❌ Supabase insert error:', error);
    
    // Check if it's a duplicate key error
    if (error.code === '23505') {
      console.error('⚠️  Duplicate card ID detected in database. This should not happen with our checks!');
    }
    return;
  }
  
  // Save CSV for manufacturer
  fs.writeFileSync('cards_for_manufacturer.csv', csvRows.join('\n'));
  
  console.log('');
  console.log('✅ ' + '='.repeat(50));
  console.log(`✅ SUCCESS: Generated ${BATCH_SIZE} unique cards`);
  console.log(`📁 CSV saved: cards_for_manufacturer.csv`);
  console.log(`📊 Cards inserted into Supabase with status 'pending'`);
  console.log(`🔄 Generation efficiency: ${Math.round((generated/attempts)*100)}% (${attempts} attempts)`);
  console.log('✅ ' + '='.repeat(50));
}

// Run the script
generateBatch().catch(console.error);