require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const email = 'admin@paneer.com';
const password = 'prashant@123';

async function testLogin() {
    console.log(`Testing login for ${email} with password: ${password}`);

    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('password', password) // Validating against stored plain text password per current implementation
            .single();

        if (error || !data) {
            console.error("❌ Login Failed: Invalid credentials or user not found.");
            if (error) console.error("Error details:", error);
        } else {
            console.log("✅ Login Successful!");
            console.log("User:", { id: data.id, role: data.role, email: data.email });
        }
    } catch (err) {
        console.error("❌ Unexpected Error:", err.message);
    }
}

testLogin();
