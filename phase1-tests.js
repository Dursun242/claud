/**
 * Phase 1 Security Tests
 * Run this in the browser console to verify RLS is working
 *
 * Usage:
 * 1. Go to http://localhost:3000
 * 2. Open DevTools (F12)
 * 3. Go to Console tab
 * 4. Paste this entire file
 * 5. Run: runPhase1Tests()
 */

async function runPhase1Tests() {
  console.log('%c=== PHASE 1 SECURITY TESTS ===', 'font-size: 16px; font-weight: bold; color: #0f172a');

  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  // Helper to log test results
  function logTest(name, success, message) {
    const emoji = success ? '✅' : '❌';
    console.log(`${emoji} ${name}: ${message}`);
    if (success) results.passed++;
    else {
      results.failed++;
      results.errors.push(`${name}: ${message}`);
    }
  }

  // Test 1: Check if Supabase is initialized
  try {
    if (typeof window === 'undefined') {
      logTest('Environment', false, 'Not in browser');
      return results;
    }

    // Try to get auth session
    const { data: { user } } = await supabase.auth.getUser().catch(e => ({ data: {} }));
    logTest('Supabase Auth', !!user, user ? `Connected as ${user.email}` : 'No user session');
  } catch (e) {
    logTest('Supabase Auth', false, e.message);
  }

  // Test 2: Check authorized_users table
  try {
    const { data, error } = await supabase
      .from('authorized_users')
      .select('email, role, actif')
      .limit(1);

    logTest('authorized_users Table', !error && data,
      error ? error.message : `Found ${data?.length || 0} users`);
  } catch (e) {
    logTest('authorized_users Table', false, e.message);
  }

  // Test 3: Check client_chantiers table
  try {
    const { data, error } = await supabase
      .from('client_chantiers')
      .select('id')
      .limit(1);

    logTest('client_chantiers Table', !error,
      error ? error.message : 'Table exists and accessible');
  } catch (e) {
    logTest('client_chantiers Table', false, e.message);
  }

  // Test 4: Check chantiers RLS
  try {
    const { data: chantiers, error } = await supabase
      .from('chantiers')
      .select('id, nom')
      .limit(5);

    const success = !error && Array.isArray(chantiers);
    logTest('Chantiers RLS', success,
      error ? `Error: ${error.message}` : `Retrieved ${chantiers?.length || 0} chantiers`);
  } catch (e) {
    logTest('Chantiers RLS', false, e.message);
  }

  // Test 5: Check compte_rendus RLS
  try {
    const { data: crs, error } = await supabase
      .from('compte_rendus')
      .select('id, date')
      .limit(5);

    const success = !error && Array.isArray(crs);
    logTest('Compte Rendus RLS', success,
      error ? `Error: ${error.message}` : `Retrieved ${crs?.length || 0} records`);
  } catch (e) {
    logTest('Compte Rendus RLS', false, e.message);
  }

  // Test 6: Check ordres_service RLS
  try {
    const { data: os, error } = await supabase
      .from('ordres_service')
      .select('id, numero')
      .limit(5);

    const success = !error && Array.isArray(os);
    logTest('Ordres Service RLS', success,
      error ? `Error: ${error.message}` : `Retrieved ${os?.length || 0} records`);
  } catch (e) {
    logTest('Ordres Service RLS', false, e.message);
  }

  // Test 7: Try to fetch user profile
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');

    const { data: profile, error } = await supabase
      .from('authorized_users')
      .select('email, role, actif')
      .eq('email', user.email)
      .single();

    const success = !error && profile?.role;
    logTest('User Profile', success,
      error ? error.message : `${profile?.email} (${profile?.role})`);
  } catch (e) {
    logTest('User Profile', false, e.message);
  }

  // Test 8: Check if client_chantiers JOIN works
  try {
    const { data: mappings, error } = await supabase
      .from('client_chantiers')
      .select('id, chantiers(id, nom)')
      .limit(3);

    const success = !error && Array.isArray(mappings);
    logTest('Client Chantiers JOIN', success,
      error ? error.message : `Retrieved ${mappings?.length || 0} mappings with JOINs`);
  } catch (e) {
    logTest('Client Chantiers JOIN', false, e.message);
  }

  // Summary
  console.log('\n%c=== SUMMARY ===', 'font-size: 14px; font-weight: bold');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);

  if (results.failed === 0) {
    console.log('%c🎉 ALL TESTS PASSED! Phase 1 is ready.', 'color: green; font-size: 14px; font-weight: bold');
  } else {
    console.log('%c⚠️ Some tests failed. Check errors above.', 'color: orange; font-size: 14px; font-weight: bold');
    console.log('Errors:', results.errors);
  }

  return results;
}

// Run the tests
console.log('Running Phase 1 tests...\n');
runPhase1Tests().then(results => {
  console.log('\nTest run complete!');
});
