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
        total_amount REAL,
        delivery_time DATETIME,
        status TEXT DEFAULT 'Pending'
    )`);

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

    // Use provided selling price or fetch default if not provided (though frontend should provide it)
    if (selling_price) {
        const totalAmount = quantity * selling_price;
        insertOrder(selling_price, totalAmount);
    } else {
        db.get("SELECT selling_price_per_kg FROM stock WHERE id = 1", (err, stockRow) => {
            if (err) return res.status(500).json({ error: err.message });
            const price = stockRow.selling_price_per_kg;
            const total = quantity * price;
            insertOrder(price, total);
        });
    }

    function insertOrder(price, total) {
        db.run(`INSERT INTO orders (customer_name, shop_name, type, quantity, selling_price, total_amount, delivery_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [customer_name, shop_name, type, quantity, price, total, delivery_time],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: "Order created successfully", orderId: this.lastID });
            }
        );
    }
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

// Reports
app.get('/api/report', (req, res) => {
    db.serialize(() => {
        const report = {};

        // Total Sold & Revenue
        db.get("SELECT SUM(quantity) as total_sold, SUM(total_amount) as total_revenue FROM orders WHERE status = 'Delivered'", (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            report.total_sold = row?.total_sold || 0;
            report.total_revenue = row?.total_revenue || 0;

            // Batches Count
            db.get("SELECT COUNT(*) as batches_count FROM batches", (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                report.batches_count = row?.batches_count || 0;

                // Pending Amount
                db.get("SELECT SUM(total_amount) as pending_amount FROM orders WHERE status = 'Pending'", (err, row) => {
                    if (err) return res.status(500).json({ error: err.message });
                    report.pending_amount = row?.pending_amount || 0;

                    // Stock
                    db.get("SELECT current_stock FROM stock WHERE id = 1", (err, row) => {
                        if (err) return res.status(500).json({ error: err.message });
                        report.current_stock = row?.current_stock || 0;
                        res.json(report);
                    });
                });
            });
        });
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
