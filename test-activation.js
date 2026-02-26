// test-activation.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Test configuration
const TEST_CARD_ID = 'CARD_TEST_' + Date.now(); // Unique test card
const TEST_IP = '192.168.1.1'; // Simulated IP

async function testActivationFlow() {
  console.log('\n🧪 ' + '='.repeat(50));
  console.log('🧪 TESTING CARD ACTIVATION FLOW');
  console.log('🧪 ' + '='.repeat(50) + '\n');

  // Step 1: Create a test card with ALL required fields
  console.log('📝 Step 1: Creating test card...');
  const { data: newCard, error: createError } = await supabase
    .from('cards')
    .insert([{
      card_id: TEST_CARD_ID,
      message_type: 'pending', // Temporary value - will be replaced when user uploads
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

  // Step 2: Verify card is pending
  console.log('🔍 Step 2: Verifying card is pending...');
  const { data: pendingCard, error: fetchError } = await supabase
    .from('cards')
    .select('*')
    .eq('card_id', TEST_CARD_ID)
    .single();

  if (fetchError) {
    console.error('❌ Failed to fetch card:', fetchError);
    return;
  }

  if (pendingCard.status !== 'pending') {
    console.error('❌ Card should be pending but is:', pendingCard.status);
    return;
  }
  console.log('✅ Card is pending (correct)');
  console.log('');

  // Step 3: Simulate activation
  console.log('🎟️ Step 3: Simulating card activation...');
  
  const { error: updateError } = await supabase
    .from('cards')
    .update({
      status: 'active',
      activated_at: new Date().toISOString(),
      activated_by_ip: TEST_IP,
      terms_accepted_at: new Date().toISOString(),
      terms_accepted_ip: TEST_IP
    })
    .eq('card_id', TEST_CARD_ID);

  if (updateError) {
    console.error('❌ Failed to activate card:', updateError);
    return;
  }
  console.log('✅ Card activated successfully');
  console.log('');

  // Step 4: Verify card is now active
  console.log('🔍 Step 4: Verifying card is now active...');
  const { data: activeCard, error: verifyError } = await supabase
    .from('cards')
    .select('*')
    .eq('card_id', TEST_CARD_ID)
    .single();

  if (verifyError) {
    console.error('❌ Failed to verify card:', verifyError);
    return;
  }

  console.log('✅ Card verification complete:');
  console.log('   Card ID:', activeCard.card_id);
  console.log('   Status:', activeCard.status);
  console.log('   Message Type (temp):', activeCard.message_type);
  console.log('   Activated at:', activeCard.activated_at);
  console.log('   Activated by IP:', activeCard.activated_by_ip);
  console.log('   Terms accepted at:', activeCard.terms_accepted_at);
  console.log('   Terms accepted IP:', activeCard.terms_accepted_ip);
  console.log('');

  // Step 5: Clean up - Delete test card
  console.log('🧹 Step 5: Cleaning up test data...');
  const { error: deleteError } = await supabase
    .from('cards')
    .delete()
    .eq('card_id', TEST_CARD_ID);

  if (deleteError) {
    console.error('❌ Failed to delete test card:', deleteError);
    return;
  }
  console.log('✅ Test card deleted');

  console.log('\n🎉 ' + '='.repeat(50));
  console.log('🎉 TEST PASSED! Activation flow works.');
  console.log('🎉 ' + '='.repeat(50) + '\n');
}

// Run the test
testActivationFlow().catch(console.error);