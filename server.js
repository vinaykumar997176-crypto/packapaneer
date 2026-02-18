const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT
    )`);

    // Stock Table (Single Row)
    db.run(`CREATE TABLE IF NOT EXISTS stock (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_stock REAL DEFAULT 0,
        selling_price_per_kg REAL DEFAULT 0,
        purchase_price_per_kg REAL DEFAULT 0
    )`);

    // Initialize Stock if not exists
    db.run(`INSERT OR IGNORE INTO stock (id, current_stock, selling_price_per_kg, purchase_price_per_kg) VALUES (1, 0, 400, 350)`);

    // Batches Table
    db.run(`CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quantity REAL,
        purchase_price REAL,
        previous_stock REAL,
        updated_stock REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Orders Table
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT,
        shop_name TEXT,
        type TEXT,
        quantity REAL,
        selling_price REAL,
        purchase_price REAL, -- Added to track cost at time of order
        total_amount REAL,
        delivery_time DATETIME,
        status TEXT DEFAULT 'Pending'
    )`, (err) => {
        if (!err) {
            // Migration: Add purchase_price column if it doesn't exist (for existing tables)
            db.run("ALTER TABLE orders ADD COLUMN purchase_price REAL", (err) => {
                // Ignore error if column already exists
            });
        }
    });

    // Transactions Table
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        amount REAL,
        payment_mode TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(order_id) REFERENCES orders(id)
    )`);

    // Seed Users (if empty)
    db.get("SELECT count(*) as count FROM users", (err, row) => {
        if (row.count === 0) {
            const adminPass = 'admin123';
            const deliveryPass = 'delivery123';
            db.run(`INSERT INTO users (email, password, role) VALUES ('admin@paneer.com', ?, 'admin')`, [adminPass]);
            db.run(`INSERT INTO users (email, password, role) VALUES ('delivery@paneer.com', ?, 'delivery')`, [deliveryPass]);
            console.log("Seeded default users.");
        }
    });
});

// --- API Endpoints ---

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ? AND password = ?", [email, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            res.json({ success: true, user: { id: row.id, role: row.role, email: row.email } });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials" });
        }
    });
});

// Get Stock
app.get('/api/stock', (req, res) => {
    db.get("SELECT * FROM stock WHERE id = 1", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

// Night Batch Receiving
app.post('/api/batch', (req, res) => {
    const { quantity, purchase_price, timestamp } = req.body;
    // Use provided timestamp or current time
    const batchTime = timestamp || new Date().toISOString();

    db.get("SELECT current_stock FROM stock WHERE id = 1", (err, stockRow) => {
        if (err) return res.status(500).json({ error: err.message });

        const currentStock = stockRow.current_stock;
        const updatedStock = currentStock + parseFloat(quantity);

        db.serialize(() => {
            db.run(`UPDATE stock SET current_stock = ?, purchase_price_per_kg = ? WHERE id = 1`, [updatedStock, purchase_price]);

            db.run(`INSERT INTO batches (quantity, purchase_price, previous_stock, updated_stock, timestamp) VALUES (?, ?, ?, ?, ?)`,
                [quantity, purchase_price, currentStock, updatedStock, batchTime],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, message: "Batch received successfully", batchId: this.lastID });
                }
            );
        });
    });
});

// Create Order
app.post('/api/orders', (req, res) => {
    const { customer_name, shop_name, type, quantity, selling_price, delivery_time } = req.body;

    // Fetch current stock details to get purchase price and selling price
    db.get("SELECT selling_price_per_kg, purchase_price_per_kg FROM stock WHERE id = 1", (err, stockRow) => {
        if (err) return res.status(500).json({ error: err.message });

        // Use provided selling price or default from stock
        const price = selling_price || stockRow.selling_price_per_kg;
        const purchaseCost = stockRow.purchase_price_per_kg; // Capture current purchase cost
        const totalAmount = quantity * price;

        db.run(`INSERT INTO orders (customer_name, shop_name, type, quantity, selling_price, purchase_price, total_amount, delivery_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [customer_name, shop_name, type, quantity, price, purchaseCost, totalAmount, delivery_time],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: "Order created successfully", orderId: this.lastID });
            }
        );
    });
});

// Get Orders
app.get('/api/orders', (req, res) => {
    const { status } = req.query;
    let query = "SELECT * FROM orders";
    const params = [];
    if (status) {
        query += " WHERE status = ?";
        params.push(status);
    }
    query += " ORDER BY delivery_time ASC";

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Deliver Order
app.post('/api/deliver', (req, res) => {
    const { orderId, paymentMode } = req.body;

    db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: "Order not found" });
        if (order.status === 'Delivered') return res.status(400).json({ error: "Order already delivered" });

        db.get("SELECT current_stock FROM stock WHERE id = 1", (err, stockRow) => {
            if (err) return res.status(500).json({ error: err.message });

            // Allow delivery even if stock low? Requirement says: "prevent delivery if stock is insufficient"
            if (stockRow.current_stock < order.quantity) {
                return res.status(400).json({ error: "Insufficient stock! Cannot deliver." });
            }

            const newStock = stockRow.current_stock - order.quantity;

            db.serialize(() => {
                db.run("UPDATE stock SET current_stock = ? WHERE id = 1", [newStock]);
                db.run("UPDATE orders SET status = 'Delivered' WHERE id = ?", [orderId]);
                db.run("INSERT INTO transactions (order_id, amount, payment_mode) VALUES (?, ?, ?)",
                    [orderId, order.total_amount, paymentMode]);

                res.json({ success: true, message: "Order delivered successfully" });
            });
        });
    });
});

// Reports & Dashboard Stats
app.get('/api/dashboard/stats', (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    db.serialize(() => {
        const stats = {};

        // 1. Order Counts
        db.get(`SELECT 
            COUNT(*) as total_orders,
            SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) as completed_orders,
            SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending_orders,
            SUM(CASE WHEN status = 'Delivered' THEN quantity ELSE 0 END) as total_sold_qty
            FROM orders`, (err, row) => {
            if (err) return res.status(500).json({ error: err.message });

            stats.orders = row;

            // 2. Stock Info
            db.get("SELECT current_stock, purchase_price_per_kg, selling_price_per_kg FROM stock WHERE id = 1", (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                stats.stock = row;

                // 3. Today's Financials (Profit/Loss)
                // Profit = (Selling Price - Purchase Price) * Quantity for delivered orders
                // We use the recorded purchase_price in orders table if available, else fall back to current stock price (legacy support)
                db.all(`SELECT quantity, selling_price, purchase_price, total_amount FROM orders WHERE status = 'Delivered' AND date(delivery_time) = date('now')`, (err, rows) => {
                    if (err) return res.status(500).json({ error: err.message });

                    let dailyRevenue = 0;
                    let dailyCost = 0;

                    rows.forEach(order => {
                        dailyRevenue += order.total_amount; // already qty * selling_price
                        // if purchase_price is null (old orders), use current stock price as an estimate, 
                        // or better, 0/ignore to avoid wrong data. Let's use current stock price as fallback? 
                        // No, let's look at what we have. If purchase_price is missing, we can't calculate exact profit. 
                        // But for "Daily Profit", visual consistency is key. Let's estimate with current purchase price if missing.
                        const costPerKg = order.purchase_price || stats.stock.purchase_price_per_kg;
                        dailyCost += (order.quantity * costPerKg);
                    });

                    stats.financials = {
                        daily_revenue: dailyRevenue,
                        daily_cost: dailyCost,
                        daily_profit: dailyRevenue - dailyCost
                    };

                    // Daily Stock Arrival
                    db.get(`SELECT SUM(quantity) as today_arrival FROM batches WHERE date(timestamp) = date('now')`, (err, row) => {
                        if (err) return res.status(500).json({ error: err.message });
                        stats.stock.today_arrival = row?.today_arrival || 0;

                        res.json(stats);
                    });
                });
            });
        });
    });
});

app.get('/api/reports/daily', (req, res) => {
    // Returns last 7 days P&L
    db.all(`SELECT 
        date(delivery_time) as date,
        SUM(total_amount) as revenue,
        SUM(quantity * COALESCE(purchase_price, (SELECT purchase_price_per_kg FROM stock WHERE id=1))) as cost
        FROM orders 
        WHERE status = 'Delivered'
        GROUP BY date(delivery_time)
        ORDER BY date(delivery_time) DESC
        LIMIT 7`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const report = rows.map(r => ({
            date: r.date,
            revenue: r.revenue,
            cost: r.cost,
            profit: r.revenue - r.cost
        }));

        res.json(report);
    });
});

// Fallback for SPA (though this is multi-page, good practice)
// Explicitly serve HTML pages to avoid static serving issues
app.get('/admin-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('/delivery.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'delivery.html'));
});

app.get('/batch.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'batch.html'));
});

app.get('/orders.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});

app.get('/report.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'report.html'));
});

// Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
