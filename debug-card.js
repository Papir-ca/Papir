const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TEST_CARD_ID = 'CARD_TEST_1771375230761';

async function debugCard() {
  console.log('🔍 Checking database...');
  
  // 1. Check if card exists
  const { data: card, error: fetchError } = await supabase
    .from('cards')
    .select('*')
    .eq('card_id', TEST_CARD_ID);
  
  console.log('\n📊 Card query result:', card);
  console.log('❌ Fetch error:', fetchError);
  
  // 2. Try to insert the card
  console.log('\n📝 Attempting to insert card...');
  const { data: insertData, error: insertError } = await supabase
    .from('cards')
    .insert([{
      card_id: TEST_CARD_ID,
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
    }])
    .select();
  
  console.log('Insert result:', insertData);
  console.log('Insert error:', insertError);
  
  // 3. List recent test cards
  const { data: recentTests } = await supabase
    .from('cards')
    .select('card_id, created_at')
    .like('card_id', 'CARD_TEST_%')
    .order('created_at', { ascending: false })
    .limit(5);
  
  console.log('\n📋 Recent test cards in DB:');
  console.log(recentTests);
}

debugCard();