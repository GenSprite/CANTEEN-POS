-- Create fresh database
CREATE DATABASE canteen_pos;
USE canteen_pos;

-- Create users table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role ENUM('owner', 'manager', 'cashier') NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_batches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    expiry_date DATE NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Create products table
CREATE TABLE products (
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
);

-- Create sales table
CREATE TABLE sales (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method ENUM('cash', 'card') DEFAULT 'cash',
    amount_paid DECIMAL(10,2) NOT NULL,
    change_amount DECIMAL(10,2) DEFAULT 0,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create sale_items table
CREATE TABLE sale_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Create inventory_logs table
CREATE TABLE inventory_logs (
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
);

-- Create activity_logs table
CREATE TABLE activity_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes
CREATE INDEX idx_sales_date ON sales(transaction_date);
CREATE INDEX idx_products_expiry ON products(expiry_date);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_inventory_logs_date ON inventory_logs(created_at);
CREATE INDEX idx_activity_logs_date ON activity_logs(created_at);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);

-- Insert default users
INSERT INTO users (username, password, full_name, role) VALUES
('owner', 'password123', 'System Owner', 'owner'),
('manager', 'password123', 'Store Manager', 'manager'),
('cashier1', 'password123', 'Cashier One', 'cashier');


-- Insert sample products
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
('Leche Flan', 'Desserts', 40.00, 20.00, 20, 10, DATE_ADD(CURDATE(), INTERVAL 3 DAY));

-- Verify
SELECT 'Setup complete!' as Status;
SELECT COUNT(*) as Users FROM users;
SELECT COUNT(*) as Products FROM products;