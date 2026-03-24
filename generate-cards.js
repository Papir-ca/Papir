const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Card ID generator - NO PREFIX (matches your maker.html)
function generateCardId() {
  return 'CARD' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

// Configuration
const BATCH_SIZE = 5; // Change this to however many cards you need
const OUTPUT_FILE = 'cards_for_manufacturer.csv';

async function generateCards() {
  console.log('\n🎴 ' + '='.repeat(50));
  console.log('🎴 GENERATING CARDS FOR MANUFACTURER');
  console.log('🎴 ' + '='.repeat(50) + '\n');

  // Step 1: Get all existing card IDs from database
  console.log('📡 Fetching existing cards from database...');
  const { data: existingCards, error: fetchError } = await supabase
    .from('cards')
    .select('card_id');

  if (fetchError) {
    console.error('❌ Failed to fetch existing cards:', fetchError);
    return;
  }

  // Create Set for quick lookup
  const existingIds = new Set(existingCards.map(c => c.card_id));
  console.log(`📊 Found ${existingIds.size} existing cards in database\n`);

  // Step 2: Generate new unique cards
  const newCards = [];
  const csvRows = ['Card ID,QR URL (for manufacturer)'];
  
  let generated = 0;
  let attempts = 0;
  const maxAttempts = BATCH_SIZE * 10;

  console.log(`🎲 Generating ${BATCH_SIZE} unique card IDs...`);

  while (generated < BATCH_SIZE && attempts < maxAttempts) {
    attempts++;
    
    // Generate a new ID (NO PREFIX)
    const cardId = generateCardId();
    
    // Check if it's unique
    if (!existingIds.has(cardId)) {
      // Add to Set to prevent duplicates in this batch
      existingIds.add(cardId);
      
      // Create QR URL for manufacturer - uses the plain ID
      const qrUrl = `https://papir.ca/viewer.html?card=${cardId}`;
      
      // Add to database insert list
      newCards.push({
        card_id: cardId,  // No prefix, just the random string
        message_type: 'pending',
        message_text: null,
        media_url: null,
        file_name: null,
        file_size: null,
        file_type: null,
        status: 'pending',
        scan_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      // Add to CSV for manufacturer
      csvRows.push(`${cardId},${qrUrl}`);
      
      generated++;
      
      // Show progress
      if (generated % 10 === 0) {
        console.log(`   Generated ${generated}/${BATCH_SIZE} (${attempts} attempts)`);
      }
    }
  }

  if (attempts >= maxAttempts) {
    console.error('❌ Failed to generate enough unique IDs');
    return;
  }

  console.log(`\n✅ Generated ${generated} unique card IDs`);
  console.log(`📁 CSV saved: ${OUTPUT_FILE}`);
  console.log(`📊 Inserting ${newCards.length} cards into database...`);

  // Insert into Supabase
  const { error: insertError } = await supabase
    .from('cards')
    .insert(newCards);

  if (insertError) {
    console.error('❌ Failed to insert cards:', insertError);
    return;
  }

  // Save CSV file
  fs.writeFileSync(OUTPUT_FILE, csvRows.join('\n'));

  console.log('✅ Cards successfully inserted into database');
  console.log('\n📋 Sample of generated cards:');
  newCards.slice(0, 5).forEach(card => {
    console.log(`   ${card.card_id} → https://papir.ca/viewer.html?card=${card.card_id}`);
  });
  
  console.log('\n🎉 ' + '='.repeat(50));
  console.log('🎉 DONE! Send the CSV file to your manufacturer');
  console.log('🎉 ' + '='.repeat(50) + '\n');
}

// Run the generator
generateCards();
