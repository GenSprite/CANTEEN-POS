// server.js - Updated with Manager Sales Permission
process.on('uncaughtException', (error) => {
    console.error('❌ UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ UNHANDLED REJECTION:', error);
});

console.log('📝 Server script is starting...');

console.log('📦 Loading express...');
const express = require('express');
console.log('✅ Express loaded');

console.log('📦 Loading mysql2...');
const mysql = require('mysql2/promise');
console.log('✅ MySQL2 loaded');

console.log('📦 Loading cors...');
const cors = require('cors');
console.log('✅ CORS loaded');

console.log('📦 Loading path...');
const path = require('path');
console.log('✅ Path loaded');

console.log('📦 Loading child_process...');
const { exec } = require('child_process');
console.log('✅ Child process loaded');

console.log('🚀 Creating express app...');
const app = express();
const PORT = 3000;
console.log('✅ App created');

console.log('⚙️ Setting up middleware...');
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
console.log('✅ Middleware configured');

console.log('🔌 Creating database pool...');
const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'canteen_pos',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
console.log('✅ Database pool created');

// Test database connection
console.log('🧪 Testing database connection...');
pool.getConnection()
    .then(connection => {
        console.log('✅ Database connected successfully');
        connection.release();
    })
    .catch(err => {
        console.error('⚠️ Database connection warning:', err.message);
        console.error('This is normal if setup hasn\'t been run yet.');
    });

console.log('🔧 Setting up routes...');

// Auto-migration: Add missing columns and fix schema
pool.getConnection()
    .then(connection => {
        console.log('✅ Database connected successfully');
        
        // Fix stock_batches table schema
        connection.query(`
            SELECT COLUMN_NAME 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = 'canteen_pos' 
            AND TABLE_NAME = 'stock_batches'
        `).then(([columns]) => {
            const columnNames = columns.map(c => c.COLUMN_NAME);
            const updates = [];
            
            // Add notes column if missing
            if (!columnNames.includes('notes')) {
                console.log('🔧 Adding "notes" column to stock_batches...');
                updates.push(connection.query(`
                    ALTER TABLE stock_batches 
                    ADD COLUMN notes TEXT NULL
                `));
            }
            
            // Make batch_code nullable or add default value
            if (columnNames.includes('batch_code')) {
                console.log('🔧 Making batch_code nullable...');
                updates.push(connection.query(`
                    ALTER TABLE stock_batches 
                    MODIFY COLUMN batch_code VARCHAR(50) NULL
                `));
            }
            
            return Promise.all(updates);
        }).then(() => {
            console.log('✅ Database schema is up to date');
        }).catch(err => {
            console.log('ℹ️ Schema check skipped (normal if database not set up yet)');
        }).finally(() => {
            connection.release();
        });
    })
    .catch(err => {
        console.error('⚠️ Database connection warning:', err.message);
        console.error('This is normal if setup hasn\'t been run yet.');
    });

// Helper function to log activity
async function logActivity(user_id, action, details = null) {
    try {
        await pool.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
            [user_id, action, details]
        );
    } catch (error) {
        console.error('Activity log error:', error);
    }
}

// ==================== AUTHENTICATION ====================

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [users] = await pool.query(
            'SELECT id, username, full_name, role FROM users WHERE username = ? AND password = ? AND is_active = TRUE',
            [username, password]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        // Log successful login
        await logActivity(users[0].id, 'login', `User ${username} logged in`);
        
        res.json({ success: true, user: users[0] });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== USER REGISTRATION ====================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, full_name, role } = req.body;
        
        // Validate required fields
        if (!username || !password || !full_name || !role) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }
        
        // Validate username length
        if (username.length < 4 || username.length > 50) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username must be between 4 and 50 characters' 
            });
        }
        
        // Validate password length
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters long' 
            });
        }
        
        // Validate role
        const validRoles = ['owner', 'manager', 'cashier'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid role specified' 
            });
        }
        
        // Check if username already exists
        const [existingUsers] = await pool.query(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );
        
        if (existingUsers.length > 0) {
            return res.status(409).json({ 
                success: false, 
                message: 'Username already exists. Please choose a different username.' 
            });
        }
        
        // Insert new user
        const [result] = await pool.query(
            'INSERT INTO users (username, password, full_name, role, is_active) VALUES (?, ?, ?, ?, TRUE)',
            [username, password, full_name, role]
        );
        
        // Log the registration
        await logActivity(result.insertId, 'register', `New ${role} account created: ${username}`);
        
        res.json({ 
            success: true, 
            message: 'Registration successful',
            user_id: result.insertId 
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during registration. Please try again.' 
        });
    }
});

// ==================== ACTIVITY LOGS ====================

app.get('/api/activity-logs', async (req, res) => {
    try {
        const [logs] = await pool.query(`
            SELECT al.*, u.full_name as user_name, u.role
            FROM activity_logs al
            JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT 500
        `);
        res.json({ success: true, logs });
    } catch (error) {
        console.error('Activity logs error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== PRODUCTS ====================

app.get('/api/products', async (req, res) => {
    try {
        const [products] = await pool.query(
            'SELECT * FROM products WHERE is_active = TRUE ORDER BY category, name'
        );
        res.json({ success: true, products });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const [products] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        res.json({ success: true, product: products[0] });
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, category, price, cost, stock_quantity, reorder_level, expiry_date, user_id } = req.body;
        const [result] = await pool.query(
            'INSERT INTO products (name, category, price, cost, stock_quantity, reorder_level, expiry_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, category, price, cost, stock_quantity, reorder_level, expiry_date]
        );
        
        // Log activity
        if (user_id) {
            await logActivity(user_id, 'add_product', `Added product: ${name}`);
        }
        
        res.json({ success: true, productId: result.insertId });
    } catch (error) {
        console.error('Add product error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { name, category, price, cost, stock_quantity, reorder_level, expiry_date, user_id } = req.body;
        await pool.query(
            'UPDATE products SET name=?, category=?, price=?, cost=?, stock_quantity=?, reorder_level=?, expiry_date=? WHERE id=?',
            [name, category, price, cost, stock_quantity, reorder_level, expiry_date, req.params.id]
        );
        
        // Log activity
        if (user_id) {
            await logActivity(user_id, 'update_product', `Updated product: ${name}`);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const { user_id } = req.body;
        
        // Get product name before deleting
        const [products] = await pool.query('SELECT name FROM products WHERE id = ?', [req.params.id]);
        
        await pool.query('UPDATE products SET is_active = FALSE WHERE id = ?', [req.params.id]);
        
        // Log activity
        if (user_id && products.length > 0) {
            await logActivity(user_id, 'delete_product', `Deleted product: ${products[0].name}`);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== SALES ====================

app.get('/api/sales', async (req, res) => {
    try {
        const [sales] = await pool.query(`
            SELECT 
                s.id,
                s.total_amount,
                s.payment_method,
                s.amount_paid,
                s.change_amount,
                s.transaction_date,
                u.full_name as cashier_name
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.transaction_date DESC
            LIMIT 100
        `);
        res.json({ success: true, sales });
    } catch (error) {
        console.error('Get sales error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== GET SINGLE SALE DETAILS ====================

app.get('/api/sales/:id', async (req, res) => {
    try {
        // Get sale information
        const [sales] = await pool.query(`
            SELECT 
                s.*,
                u.full_name as cashier_name
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.id = ?
        `, [req.params.id]);
        
        if (sales.length === 0) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }
        
        // Get sale items
        const [items] = await pool.query(`
            SELECT * FROM sale_items
            WHERE sale_id = ?
        `, [req.params.id]);
        
        res.json({ 
            success: true, 
            sale: sales[0],
            items: items
        });
    } catch (error) {
        console.error('Get sale details error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/sales', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { user_id, items, payment_method, amount_paid, manual_order_count } = req.body;

        // Check stock availability
        for (const item of items) {
            const [products] = await connection.query('SELECT stock_quantity FROM products WHERE id = ?', [item.product_id]);
            const availableStock = products[0].stock_quantity;
            if (item.quantity > availableStock) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for ${item.product_name}. Available: ${availableStock}`
                });
            }
        }

        const total_amount = items.reduce((sum, item) => sum + item.subtotal, 0);
        const change_amount = amount_paid - total_amount;

        const [saleResult] = await connection.query(
            'INSERT INTO sales (user_id, total_amount, payment_method, amount_paid, change_amount) VALUES (?, ?, ?, ?, ?)',
            [user_id, total_amount, payment_method, amount_paid, change_amount]
        );

        const sale_id = saleResult.insertId;

        for (const item of items) {
            await connection.query(
                'INSERT INTO sale_items (sale_id, product_id, product_name, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
                [sale_id, item.product_id, item.product_name, item.quantity, item.price, item.subtotal]
            );

            const [products] = await connection.query('SELECT stock_quantity FROM products WHERE id = ?', [item.product_id]);
            const quantity_before = products[0].stock_quantity;
            const quantity_after = quantity_before - item.quantity;

            await connection.query(
                'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
                [item.quantity, item.product_id]
            );

            await connection.query(
                'INSERT INTO inventory_logs (product_id, action_type, quantity_changed, quantity_before, quantity_after, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [item.product_id, 'sale', -item.quantity, quantity_before, quantity_after, user_id, `Sale #${sale_id}`]
            );
        }

        let activityDetails = `Created sale #${sale_id}, Total: ₱${total_amount.toFixed(2)}`;
        if (manual_order_count) activityDetails += `, Manual Order Count: ${manual_order_count}`;
        await logActivity(user_id, 'create_sale', activityDetails);

        await connection.commit();
        res.json({ success: true, sale_id, change_amount });

    } catch (error) {
        await connection.rollback();
        console.error('Create sale error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});


// ==================== DASHBOARD ====================

app.get('/api/dashboard', async (req, res) => {
    try {
        const [todaySales] = await pool.query(
            'SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE DATE(transaction_date) = CURDATE()'
        );
        
        const [todayTransactions] = await pool.query(
            'SELECT COUNT(*) as count FROM sales WHERE DATE(transaction_date) = CURDATE()'
        );
        
        const [lowStock] = await pool.query(
            'SELECT * FROM products WHERE stock_quantity <= reorder_level AND is_active = TRUE'
        );
        
        const [expiringSoon] = await pool.query(
            'SELECT * FROM products WHERE expiry_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND expiry_date >= CURDATE() AND is_active = TRUE'
        );
        
        const [expired] = await pool.query(
            'SELECT * FROM products WHERE expiry_date < CURDATE() AND is_active = TRUE'
        );
        
        const [bestSelling] = await pool.query(`
            SELECT si.product_name, SUM(si.quantity) as total_sold, SUM(si.subtotal) as total_revenue
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY si.product_id, si.product_name
            ORDER BY total_sold DESC
            LIMIT 5
        `);
        
        res.json({
            success: true,
            todaySales: todaySales[0].total,
            todayTransactions: todayTransactions[0].count,
            lowStock,
            expiringSoon,
            expired,
            bestSelling
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== REPORTS ====================

app.get('/api/reports/sales', async (req, res) => {
    try {
        const { start_date, end_date, group_by } = req.query;
        
        let dateGroup = 'DATE(transaction_date)';
        if (group_by === 'week') dateGroup = 'YEARWEEK(transaction_date)';
        if (group_by === 'month') dateGroup = 'DATE_FORMAT(transaction_date, "%Y-%m")';
        
        const [report] = await pool.query(`
            SELECT 
                ${dateGroup} as period,
                COUNT(*) as total_transactions,
                SUM(total_amount) as total_sales,
                AVG(total_amount) as avg_sale
            FROM sales
            WHERE DATE(transaction_date) BETWEEN ? AND ?
            GROUP BY period
            ORDER BY period
        `, [start_date, end_date]);
        
        res.json({ success: true, report });
    } catch (error) {
        console.error('Reports error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== INVENTORY ====================

app.post('/api/inventory/adjust', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { product_id, quantity_change, user_id, notes } = req.body;
        
        const [products] = await connection.query('SELECT stock_quantity, name FROM products WHERE id = ?', [product_id]);
        const quantity_before = products[0].stock_quantity;
        const quantity_after = quantity_before + quantity_change;
        
        await connection.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [quantity_after, product_id]);
        
        await connection.query(
            'INSERT INTO inventory_logs (product_id, action_type, quantity_changed, quantity_before, quantity_after, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [product_id, 'adjustment', quantity_change, quantity_before, quantity_after, user_id, notes]
        );
        
        // Log activity
        await logActivity(user_id, 'inventory_adjustment', `Adjusted ${products[0].name}: ${quantity_change > 0 ? '+' : ''}${quantity_change} units`);
        
        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error('Inventory adjust error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

app.get('/api/inventory/logs', async (req, res) => {
    try {
        const [logs] = await pool.query(`
            SELECT il.*, p.name as product_name, u.full_name as user_name
            FROM inventory_logs il
            JOIN products p ON il.product_id = p.id
            JOIN users u ON il.user_id = u.id
            ORDER BY il.created_at DESC
            LIMIT 100
        `);
        res.json({ success: true, logs });
    } catch (error) {
        console.error('Inventory logs error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});



// ==================== STOCK BATCHES ====================

app.get('/api/inventory/batches', async (req, res) => {
    try {
        const [batches] = await pool.query(`
            SELECT sb.*, p.name as product_name
            FROM stock_batches sb
            JOIN products p ON sb.product_id = p.id
            WHERE sb.quantity > 0
            ORDER BY sb.expiry_date ASC
        `);
        res.json({ success: true, batches });
    } catch (error) {
        console.error('Get batches error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get stock batches for a specific product
app.get('/api/inventory/batches/:productId', async (req, res) => {
    try {
        const [batches] = await pool.query(`
            SELECT * FROM stock_batches
            WHERE product_id = ? AND quantity > 0
            ORDER BY expiry_date ASC
        `, [req.params.productId]);
        res.json({ success: true, batches });
    } catch (error) {
        console.error('Get product batches error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add stock with batch tracking
app.post('/api/inventory/add-stock', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { product_id, quantity, expiry_date, user_id, notes } = req.body;
        
        // Get current product info
        const [products] = await connection.query(
            'SELECT stock_quantity, name FROM products WHERE id = ?', 
            [product_id]
        );
        
        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        const quantity_before = products[0].stock_quantity;
        const quantity_after = quantity_before + quantity;
        
        // Update product stock
        await connection.query(
            'UPDATE products SET stock_quantity = ? WHERE id = ?',
            [quantity_after, product_id]
        );
        
        // Create stock batch record
        await connection.query(
            'INSERT INTO stock_batches (product_id, quantity, expiry_date, notes) VALUES (?, ?, ?, ?)',
            [product_id, quantity, expiry_date, notes]
        );
        
        // Log inventory action
        await connection.query(
            'INSERT INTO inventory_logs (product_id, action_type, quantity_changed, quantity_before, quantity_after, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [product_id, 'restock', quantity, quantity_before, quantity_after, user_id, `Added stock batch - Expiry: ${expiry_date}${notes ? ', ' + notes : ''}`]
        );
        
        // Log activity
        await logActivity(user_id, 'add_stock', `Added ${quantity} units to ${products[0].name} (Expiry: ${expiry_date})`);
        
        await connection.commit();
        res.json({ success: true, message: 'Stock added successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Add stock error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// Add this endpoint to your server.js in the INVENTORY section

// ==================== DELETE STOCK BATCH ====================

app.delete('/api/inventory/batch/:batchId', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { batchId } = req.params;
        const { user_id } = req.body;
        
        // Get batch info before deleting
        const [batches] = await connection.query(
            'SELECT sb.*, p.name as product_name FROM stock_batches sb JOIN products p ON sb.product_id = p.id WHERE sb.id = ?',
            [batchId]
        );
        
        if (batches.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }
        
        const batch = batches[0];
        
        // Get current product stock
        const [products] = await connection.query(
            'SELECT stock_quantity FROM products WHERE id = ?',
            [batch.product_id]
        );
        
        const quantity_before = products[0].stock_quantity;
        const quantity_after = quantity_before - batch.quantity;
        
        // Make sure we don't go negative
        if (quantity_after < 0) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete batch: would result in negative stock' 
            });
        }
        
        // Update product stock
        await connection.query(
            'UPDATE products SET stock_quantity = ? WHERE id = ?',
            [quantity_after, batch.product_id]
        );
        
        // Delete the batch
        await connection.query('DELETE FROM stock_batches WHERE id = ?', [batchId]);
        
        // Log the inventory change
        await connection.query(
            'INSERT INTO inventory_logs (product_id, action_type, quantity_changed, quantity_before, quantity_after, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                batch.product_id, 
                'adjustment', 
                -batch.quantity, 
                quantity_before, 
                quantity_after, 
                user_id, 
                `Deleted batch #${batchId} (Expiry: ${batch.expiry_date})`
            ]
        );
        
        // Log activity
        await logActivity(
            user_id, 
            'delete_batch', 
            `Deleted batch #${batchId} for ${batch.product_name} (${batch.quantity} units, Expiry: ${batch.expiry_date})`
        );
        
        await connection.commit();
        res.json({ success: true, message: 'Batch deleted successfully' });
        
    } catch (error) {
        await connection.rollback();
        console.error('Delete batch error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// ==================== SETUP WIZARD APIs ====================

app.get('/api/setup/check-needed', async (req, res) => {
    try {
        const tempPool = mysql.createPool({
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: '',
            waitForConnections: true,
            connectionLimit: 1
        });

        const [databases] = await tempPool.query("SHOW DATABASES LIKE 'canteen_pos'");
        
        if (databases.length === 0) {
            await tempPool.end();
            return res.json({ success: true, setupNeeded: true });
        }

        await tempPool.query("USE canteen_pos");
        const [tables] = await tempPool.query("SHOW TABLES LIKE 'users'");
        await tempPool.end();
        
        const setupNeeded = tables.length === 0;
        res.json({ success: true, setupNeeded });
    } catch (error) {
        console.error('Check needed error:', error);
        res.json({ success: true, setupNeeded: true });
    }
});

app.get('/api/setup/check-node', (req, res) => {
    exec('node --version', (error, stdout) => {
        if (error) {
            return res.json({ success: false, message: 'Node.js not found' });
        }
        res.json({ success: true, version: stdout.trim() });
    });
});

app.get('/api/setup/check-mysql', async (req, res) => {
    try {
        const tempPool = mysql.createPool({
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: '',
            waitForConnections: true,
            connectionLimit: 1
        });
        
        await tempPool.query('SELECT 1');
        await tempPool.end();
        res.json({ success: true, message: 'MySQL is running' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/setup/check-packages', (req, res) => {
    const packagesNeeded = ['express', 'mysql2', 'cors'];
    const allInstalled = packagesNeeded.every(pkg => {
        try {
            require.resolve(pkg);
            return true;
        } catch {
            return false;
        }
    });
    
    if (allInstalled) {
        res.json({ success: true, message: 'All packages installed' });
    } else {
        res.json({ success: false, message: 'Some packages are missing' });
    }
});

app.post('/api/setup/create-database', async (req, res) => {
    try {
        const tempPool = mysql.createPool({
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: '',
            waitForConnections: true,
            connectionLimit: 1
        });
        
        await tempPool.query('CREATE DATABASE IF NOT EXISTS canteen_pos');
        await tempPool.end();
        
        res.json({ success: true, message: 'Database created' });
    } catch (error) {
        console.error('Create database error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/setup/create-tables', async (req, res) => {
    let connection;
    try {
        const tempPool = mysql.createPool({
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: '',
            database: 'canteen_pos',
            waitForConnections: true,
            connectionLimit: 1
        });
        
        connection = await tempPool.getConnection();
        await connection.beginTransaction();

        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                role ENUM('owner', 'manager', 'cashier') NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                cost DECIMAL(10,2) DEFAULT 0,
                stock_quantity INT DEFAULT 0,
                reorder_level INT DEFAULT 10,
                expiry_date DATE NULL,
                image_url VARCHAR(255) NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS sales (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                payment_method ENUM('cash', 'card') DEFAULT 'cash',
                amount_paid DECIMAL(10,2) NOT NULL,
                change_amount DECIMAL(10,2) DEFAULT 0,
                transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS sale_items (
                id INT PRIMARY KEY AUTO_INCREMENT,
                sale_id INT NOT NULL,
                product_id INT NOT NULL,
                product_name VARCHAR(100) NOT NULL,
                quantity INT NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                subtotal DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id)
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS inventory_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                product_id INT NOT NULL,
                action_type ENUM('sale', 'restock', 'adjustment', 'expired') NOT NULL,
                quantity_changed INT NOT NULL,
                quantity_before INT NOT NULL,
                quantity_after INT NOT NULL,
                user_id INT NOT NULL,
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                action VARCHAR(100) NOT NULL,
                details TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

         await connection.query(`
           CREATE TABLE IF NOT EXISTS stock_batches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    batch_code VARCHAR(50) NULL DEFAULT NULL,
    quantity INT NOT NULL,
    received_date DATE DEFAULT (CURRENT_DATE),
    expiry_date DATE NULL,
    supplier VARCHAR(100) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
)
        `);

        await connection.commit();
        connection.release();
        await tempPool.end();
        
        res.json({ success: true, message: 'Tables created successfully' });
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Create tables error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/setup/import-data', async (req, res) => {
    let connection;
    try {
        const tempPool = mysql.createPool({
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: '',
            database: 'canteen_pos',
            waitForConnections: true,
            connectionLimit: 1
        });
        
        connection = await tempPool.getConnection();
        await connection.beginTransaction();

        const [existingUsers] = await connection.query('SELECT COUNT(*) as count FROM users');
        
        if (existingUsers[0].count === 0) {
            await connection.query(`
                INSERT INTO users (username, password, full_name, role) VALUES
                ('owner', 'password123', 'System Owner', 'owner'),
                ('manager', 'password123', 'Store Manager', 'manager'),
                ('cashier1', 'password123', 'Cashier One', 'cashier')
            `);
        }

        const [existingProducts] = await connection.query('SELECT COUNT(*) as count FROM products');

if (existingProducts[0].count === 0) {
    // Insert sample products
    await connection.query(`
        INSERT INTO products (name, category, price, cost, stock_quantity, reorder_level, expiry_date) VALUES
        ('Fried Chicken', 'Main Course', 85.00, 45.00, 50, 10, DATE_ADD(CURDATE(), INTERVAL 7 DAY)),
        ('Pork Adobo', 'Main Course', 75.00, 40.00, 40, 10, DATE_ADD(CURDATE(), INTERVAL 5 DAY)),
        ('Beef Tapa', 'Main Course', 95.00, 55.00, 30, 10, DATE_ADD(CURDATE(), INTERVAL 6 DAY)),
        ('Pancit Canton', 'Main Course', 60.00, 30.00, 45, 10, DATE_ADD(CURDATE(), INTERVAL 4 DAY)),
        ('Steamed Rice', 'Side Dish', 15.00, 5.00, 200, 50, DATE_ADD(CURDATE(), INTERVAL 3 DAY)),
        ('Bottled Water', 'Beverages', 20.00, 10.00, 100, 20, DATE_ADD(CURDATE(), INTERVAL 30 DAY)),
        ('Soft Drinks', 'Beverages', 30.00, 15.00, 80, 20, DATE_ADD(CURDATE(), INTERVAL 60 DAY)),
        ('Iced Tea', 'Beverages', 25.00, 12.00, 60, 15, DATE_ADD(CURDATE(), INTERVAL 14 DAY)),
        ('Banana Cake', 'Desserts', 35.00, 18.00, 25, 10, DATE_ADD(CURDATE(), INTERVAL 2 DAY)),
        ('Leche Flan', 'Desserts', 40.00, 20.00, 20, 10, DATE_ADD(CURDATE(), INTERVAL 3 DAY))
    `);
    
    // Create initial stock batches for all sample products
    await connection.query(`
        INSERT INTO stock_batches (product_id, batch_code, quantity, expiry_date, notes)
        SELECT 
            id,
            CONCAT('BATCH-', LPAD(id, 4, '0')),
            stock_quantity,
            expiry_date,
            'Initial sample stock batch'
        FROM products
        WHERE id >= 1 AND id <= 10
    `);
}

        await connection.commit();
        connection.release();
        await tempPool.end();
        
        res.json({ success: true, message: 'Sample data imported successfully' });
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Import data error:', error);
        res.json({ success: false, message: error.message });
    }
});

// ==================== SERVE FRONTEND ====================

// Serve specific HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Catch-all for other routes - redirect to login
app.get('*', (req, res) => {
    res.redirect('/login.html');
});
console.log('✅ All routes configured');

// Start server
console.log('🚀 Starting server on port', PORT, '...');
app.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('✅ Canteen POS Server Started Successfully!');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`🏠 Local Access:     http://localhost:${PORT}`);
    console.log(`📡 Network Access:   http://[YOUR_IP]:${PORT}`);
    console.log('');
    console.log('👤 Default Login Credentials:');
    console.log('   Owner:    username="owner"    password="password123"');
    console.log('   Manager:  username="manager"  password="password123"');
    console.log('   Cashier:  username="cashier1" password="password123"');
    console.log('╚════════════════════════════════════════════════╝');
});