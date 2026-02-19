require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log("--- Environment Variable Check ---");
console.log(`SUPABASE_URL detected: ${supabaseUrl ? 'YES' : 'NO'}`);
if (supabaseUrl) console.log(`SUPABASE_URL starts with: ${supabaseUrl.substring(0, 15)}...`);

console.log(`SUPABASE_KEY detected: ${supabaseKey ? 'YES' : 'NO'}`);
if (supabaseKey) console.log(`SUPABASE_KEY length: ${supabaseKey.length}`);

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing environment variables. Check your .env file.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log("\n--- Testing Supabase Connection ---");
    try {
        // Try to fetch a single user (or just check connection)
        const { data, error } = await supabase.from('users').select('*').limit(1);

        if (error) {
            console.error("❌ Connection Failed:", error.message);
            console.error("Error details:", error);
        } else {
            console.log("✅ Connection Successful!");
            console.log("Data received:", data);
        }
    } catch (err) {
        console.error("❌ Unexpected Error:", err.message);
    }
}

testConnection();
