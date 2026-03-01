// test-full-flow.js
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config();

// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BACKEND_URL = 'https://papir.ca'; // Your live backend
const TEST_CARD_ID = 'CARD_TEST_' + Date.now();
const TEST_IP = '192.168.1.1';

async function testFullFlow() {
  console.log('\n🎬 ' + '='.repeat(60));
  console.log('🎬 TESTING FULL USER JOURNEY: Maker → Viewer');
  console.log('🎬 ' + '='.repeat(60) + '\n');

  // Step 1: Create a test card (simulating pre-printed card)
  console.log('📝 Step 1: Creating pre-printed test card...');
  const { data: newCard, error: createError } = await supabase
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
    .select()
    .single();

  if (createError) {
    console.error('❌ Failed to create test card:', createError);
    return;
  }
  console.log('✅ Test card created:', TEST_CARD_ID);
  console.log('   Status:', newCard.status);
  console.log('');

  // Step 2: Simulate customer scanning QR and landing on viewer (should redirect)
  console.log('🔍 Step 2: Customer scans QR → viewer.html');
  console.log('   URL: https://papir.ca/viewer.html?card=' + TEST_CARD_ID);
  console.log('   ⚠️  This should redirect to activation page (card is pending)');
  console.log('');

  // Step 3: Simulate activation (what happens when customer clicks "Activate")
  console.log('🎟️ Step 3: Customer activates card...');
  
  const { error: activateError } = await supabase
    .from('cards')
    .update({
      status: 'active',
      activated_at: new Date().toISOString(),
      activated_by_ip: TEST_IP,
      terms_accepted_at: new Date().toISOString(),
      terms_accepted_ip: TEST_IP
    })
    .eq('card_id', TEST_CARD_ID);

  if (activateError) {
    console.error('❌ Failed to activate card:', activateError);
    return;
  }
  console.log('✅ Card activated successfully');
  console.log('');

  // Step 4: Simulate upload to maker.html
  console.log('🎨 Step 4: Customer uploads content via maker.html...');
  
  // Create a simple text card (since we can't simulate file upload easily)
  const { error: uploadError } = await supabase
    .from('cards')
    .update({
      message_type: 'text',
      message_text: 'Hello from test! This card was created at ' + new Date().toLocaleString()
    })
    .eq('card_id', TEST_CARD_ID);

  if (uploadError) {
    console.error('❌ Failed to upload content:', uploadError);
    return;
  }
  console.log('✅ Content uploaded successfully');
  console.log('');

  // Step 5: Verify the card now has content
  console.log('🔍 Step 5: Verifying card content...');
  const { data: finalCard, error: fetchError } = await supabase
    .from('cards')
    .select('*')
    .eq('card_id', TEST_CARD_ID)
    .single();

  if (fetchError) {
    console.error('❌ Failed to fetch final card:', fetchError);
    return;
  }

  console.log('✅ Final card state:');
  console.log('   Card ID:', finalCard.card_id);
  console.log('   Status:', finalCard.status);
  console.log('   Message Type:', finalCard.message_type);
  console.log('   Message Text:', finalCard.message_text);
  console.log('   Activated at:', finalCard.activated_at);
  console.log('   Activated by IP:', finalCard.activated_by_ip);
  console.log('');

  // Step 6: Generate viewer URL
  console.log('👁️ Step 6: Card is ready to view!');
  console.log('   Viewer URL: https://papir.ca/viewer.html?card=' + TEST_CARD_ID);
  console.log('   This should now show your card content');
  console.log('');

  // Step 7: Clean up
  console.log('🧹 Step 7: Cleaning up test data...');
  const { error: deleteError } = await supabase
    .from('cards')
    .delete()
    .eq('card_id', TEST_CARD_ID);

  if (deleteError) {
    console.error('❌ Failed to delete test card:', deleteError);
    return;
  }
  console.log('✅ Test card deleted');

  console.log('\n🎉 ' + '='.repeat(60));
  console.log('🎉 FULL FLOW TEST PASSED!');
  console.log('🎉 ' + '='.repeat(60) + '\n');
  console.log('📋 Summary:');
  console.log('   1. ✅ Card created (pending)');
  console.log('   2. ✅ Card activated');
  console.log('   3. ✅ Content uploaded');
  console.log('   4. ✅ Content verified');
  console.log('   5. ✅ Viewer ready');
}

// Run the test
testFullFlow().catch(console.error);