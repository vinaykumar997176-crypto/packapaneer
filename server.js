const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const supabase = require('./supabaseClient');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API Endpoints ---

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .single();

        if (error || !data) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        res.json({ success: true, user: { id: data.id, role: data.role, email: data.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Stock
app.get('/api/stock', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('stock')
            .select('*')
            .limit(1)
            .single();

        if (error) throw error;
        // Handle case where stock might not be initialized
        if (!data) return res.json({ current_stock: 0, selling_price_per_kg: 0, purchase_price_per_kg: 0 });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Night Batch Receiving
app.post('/api/batch', async (req, res) => {
    const { quantity, purchase_price, timestamp } = req.body;
    const batchTime = timestamp || new Date().toISOString();

    try {
        // 1. Get current stock
        const { data: stockData, error: stockError } = await supabase
            .from('stock')
            .select('*')
            .limit(1)
            .single();

        if (stockError) throw stockError;

        const currentStock = stockData ? stockData.current_stock : 0;
        const updatedStock = currentStock + parseFloat(quantity);

        // 2. Update Stock
        const { error: updateError } = await supabase
            .from('stock')
            .update({
                current_stock: updatedStock,
                purchase_price_per_kg: purchase_price
            })
            .eq('id', stockData.id);

        if (updateError) throw updateError;

        // 3. Insert Batch
        const { error: batchError } = await supabase
            .from('batches')
            .insert([{
                quantity,
                purchase_price,
                previous_stock: currentStock,
                updated_stock: updatedStock,
                timestamp: batchTime
            }]);

        if (batchError) throw batchError;

        res.json({ success: true, message: "Batch received successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Order
app.post('/api/orders', async (req, res) => {
    const { customer_name, shop_name, type, quantity, selling_price, delivery_time } = req.body;

    try {
        // 1. Get Pricing Info
        const { data: stockData, error: stockError } = await supabase
            .from('stock')
            .select('selling_price_per_kg, purchase_price_per_kg')
            .limit(1)
            .single();

        if (stockError) throw stockError;

        const price = selling_price || stockData.selling_price_per_kg;
        const purchaseCost = stockData.purchase_price_per_kg;
        const totalAmount = quantity * price;

        // 2. Insert Order
        const { error: insertError } = await supabase
            .from('orders')
            .insert([{
                customer_name,
                shop_name,
                type,
                quantity,
                selling_price: price,
                purchase_price: purchaseCost,
                total_amount: totalAmount,
                delivery_time,
                status: 'Pending'
            }]);

        if (insertError) throw insertError;

        res.json({ success: true, message: "Order created successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Orders
app.get('/api/orders', async (req, res) => {
    const { status } = req.query;
    try {
        let query = supabase.from('orders').select('*').order('delivery_time', { ascending: true });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Deliver Order
app.post('/api/deliver', async (req, res) => {
    const { orderId, paymentMode } = req.body;

    try {
        // 1. Get Order
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderError || !order) return res.status(404).json({ error: "Order not found" });
        if (order.status === 'Delivered') return res.status(400).json({ error: "Order already delivered" });

        // 2. Get Stock
        const { data: stockData, error: stockError } = await supabase
            .from('stock')
            .select('*')
            .limit(1)
            .single();

        if (stockError) throw stockError;

        if (stockData.current_stock < order.quantity) {
            return res.status(400).json({ error: "Insufficient stock! Cannot deliver." });
        }

        const newStock = stockData.current_stock - order.quantity;

        // 3. Update Stock
        const { error: updateStockError } = await supabase
            .from('stock')
            .update({ current_stock: newStock })
            .eq('id', stockData.id);

        if (updateStockError) throw updateStockError;

        // 4. Update Order Status
        const { error: updateOrderError } = await supabase
            .from('orders')
            .update({ status: 'Delivered' })
            .eq('id', orderId);

        if (updateOrderError) throw updateOrderError;

        // 5. Create Transaction
        const { error: transError } = await supabase
            .from('transactions')
            .insert([{
                order_id: orderId,
                amount: order.total_amount,
                payment_mode: paymentMode
            }]);

        if (transError) throw transError;

        res.json({ success: true, message: "Order delivered successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reports & Dashboard Stats
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const stats = {};

        // 1. Orders
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('status, quantity, total_amount, purchase_price, selling_price, delivery_time');

        if (ordersError) throw ordersError;

        const total_orders = orders.length;
        const completed_orders = orders.filter(o => o.status === 'Delivered').length;
        const pending_orders = orders.filter(o => o.status === 'Pending').length;
        const total_sold_qty = orders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + o.quantity, 0);

        stats.orders = { total_orders, completed_orders, pending_orders, total_sold_qty };

        // 2. Stock
        const { data: stockData } = await supabase.from('stock').select('*').limit(1).single();
        stats.stock = stockData;

        // 3. Daily Stats (Manual Aggregation)
        // Note: Supabase free tier doesn't support easy 'today' filter without proper timezone. 
        // We will fetch all delivered orders for simplicity in this demo, or filter in JS.
        // A better way is using `gte` with today's date string.

        const todayStr = new Date().toISOString().split('T')[0];

        // Filter orders for today (local match approximation)
        const todayOrders = orders.filter(o =>
            o.status === 'Delivered' &&
            o.delivery_time &&
            o.delivery_time.startsWith(todayStr)
        );

        let dailyRevenue = 0;
        let dailyCost = 0;

        todayOrders.forEach(o => {
            dailyRevenue += o.total_amount;
            const costPerKg = o.purchase_price || stockData.purchase_price_per_kg;
            dailyCost += (o.quantity * costPerKg);
        });

        stats.financials = {
            daily_revenue: dailyRevenue,
            daily_cost: dailyCost,
            daily_profit: dailyRevenue - dailyCost
        };

        // Stock Arrival Today
        const { data: batches } = await supabase
            .from('batches')
            .select('quantity, timestamp');

        const todayArrival = batches
            ? batches.filter(b => b.timestamp && b.timestamp.startsWith(todayStr))
                .reduce((sum, b) => sum + b.quantity, 0)
            : 0;

        stats.stock.today_arrival = todayArrival;

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/daily', async (req, res) => {
    try {
        // Fetch delivered orders
        // Use client-side aggregation for last 7 days to avoid complex SQL via RPC
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'Delivered')
            .order('delivery_time', { ascending: false });

        if (error) throw error;

        const dailyMap = {};

        orders.forEach(o => {
            const date = o.delivery_time.split('T')[0];
            if (!dailyMap[date]) {
                dailyMap[date] = { revenue: 0, cost: 0 };
            }

            // revenue
            dailyMap[date].revenue += o.total_amount;

            // cost
            const cost = o.quantity * (o.purchase_price || 0); // Need fallback if purchase_price null?
            dailyMap[date].cost += cost;
        });

        // Convert to array
        const report = Object.keys(dailyMap).map(date => ({
            date,
            revenue: dailyMap[date].revenue,
            cost: dailyMap[date].cost,
            profit: dailyMap[date].revenue - dailyMap[date].cost
        })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

        res.json(report);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fallback Pages
app.get('/admin-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html')));
app.get('/delivery.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery.html')));
app.get('/batch.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'batch.html')));
app.get('/orders.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'orders.html')));
app.get('/stock-financials.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stock-financials.html')));
app.get('/report.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'report.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
