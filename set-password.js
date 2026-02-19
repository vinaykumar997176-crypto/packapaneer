require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- CONFIGURATION ---
const EMAIL = 'admin@paneer.com';
const NEW_PASSWORD = 'prashant@123';
// ---------------------

async function updatePassword() {
    console.log(`Updating password for ${EMAIL}...`);

    if (NEW_PASSWORD === 'prashant@123') {
        console.error("❌ Please edit this file and replace 'ENTER_YOUR_NEW_PASSWORD_HERE' with your desired password.");
        return;
    }

    const { data, error } = await supabase
        .from('users')
        .update({ password: NEW_PASSWORD })
        .eq('email', EMAIL)
        .select();

    if (error) {
        console.error("❌ Error updating password:", error.message);
    } else if (data.length === 0) {
        console.error("❌ User not found! Make sure 'admin@paneer.com' exists.");
    } else {
        console.log("✅ Password updated successfully!");
        console.log("New User Data:", data);
    }
}

updatePassword();
