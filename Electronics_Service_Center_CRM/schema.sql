-- Electronics Service Center CRM — MySQL schema for a fresh installation
-- This file is authoritative for a new database. Historical migrations are kept only for upgrades.

CREATE DATABASE IF NOT EXISTS electronics_service_crm
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE electronics_service_crm;

-- ---------------------------------------------------------------------
-- Users & auth — passwords are ALWAYS bcrypt hashes, never plaintext.
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(128) NOT NULL,
  role          ENUM('Admin','Staff') NOT NULL DEFAULT 'Staff',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Sequence counters (replaces DB.seq.*)
-- ---------------------------------------------------------------------
CREATE TABLE sequences (
  kind  VARCHAR(32) PRIMARY KEY,
  value INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;
INSERT INTO sequences (kind, value) VALUES
  ('call',0), ('purchase',0), ('inventory',0), ('cash_receipt',0), ('cash_payment',0);

-- ---------------------------------------------------------------------
-- Dropdown / validation lists — each list is its own properly-named
-- table (not one shared generic table), with its own created_at.
-- ---------------------------------------------------------------------
CREATE TABLE parts (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(191) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE brands (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(191) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Product type (TV / AC / Fridge / Washing Machine / Cooler / ...), separate
-- from Brand — editable from Settings just like the other dropdown lists.
CREATE TABLE products (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(191) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE brackets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(191) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE technicians (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(191) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE call_statuses (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(191) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Settings — key/value, covers slaTargetDays, openingCashBalance, etc.
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  setting_key   VARCHAR(64) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB;
INSERT INTO settings (setting_key, setting_value) VALUES
  ('slaTargetDays', '3'),
  ('openingCashBalance', '0');

-- ---------------------------------------------------------------------
-- Service calls / tickets (CALL_FIELDS)
-- ---------------------------------------------------------------------
CREATE TABLE calls (
  id                         VARCHAR(32) PRIMARY KEY,
  sr_no                      INT NOT NULL,
  log_no                     VARCHAR(16),
  entry_date                 DATE NOT NULL,
  ticket_number              VARCHAR(64),
  customer_name              VARCHAR(191) NOT NULL,
  mobile                     VARCHAR(32),
  address                    VARCHAR(255),
  product                    VARCHAR(128),        -- Product type: TV / AC / Fridge / Washing Machine / Cooler / ...
  brand                      VARCHAR(128),
  model_number               VARCHAR(128),
  serial_number              VARCHAR(128),
  size                       VARCHAR(64),
  date_of_purchase           DATE,
  actual_issue               TEXT,
  work_done                  TEXT,
  warranty                   VARCHAR(64),        -- 'Yes' = brand/warranty ticket, else direct customer
  status                     VARCHAR(64),
  technician                 VARCHAR(128),
  tech_type                  VARCHAR(64),
  bracket_used               VARCHAR(128),
  bracket_charges            DECIMAL(10,2) DEFAULT 0,
  call_charges               DECIMAL(10,2) DEFAULT 0,
  defective_part_returned    VARCHAR(191),
  service_center_bill_amount DECIMAL(10,2) DEFAULT 0,
  dependency                 VARCHAR(191),
  completed_date             DATE,
  material_cost              DECIMAL(10,2),  -- Admin-only profit tracking, direct-customer (Warranty=No) tickets only

  -- Ticket images are optional while work is open and required by
  -- application rules before closing a ticket. Values are S3/public URLs.
  before_image_url           VARCHAR(500),
  after_image_url            VARCHAR(500),
  settlement_status          ENUM('Unsettled','Settled','Rejected') NOT NULL DEFAULT 'Unsettled',
  settlement_voucher_no      VARCHAR(32),
  settlement_voucher_date    DATE,
  settlement_comment         VARCHAR(50),
  approval_status            ENUM('Pending','Approved') NOT NULL DEFAULT 'Pending',
  approved_by                INT,               -- FK -> users.id
  approved_at                DATETIME,
  created_by                 INT,               -- FK -> users.id, for auditing who entered it
  created_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_calls_date (entry_date),
  INDEX idx_calls_technician (technician),
  INDEX idx_calls_status (status),
  INDEX idx_calls_warranty (warranty),
  INDEX idx_calls_approval (approval_status),
  INDEX idx_calls_settlement (settlement_status),
  CONSTRAINT fk_calls_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_calls_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Purchases / supplier ledger (PURCHASE_FIELDS)
-- ---------------------------------------------------------------------
CREATE TABLE purchases (
  id             VARCHAR(32) PRIMARY KEY,
  sr_no          INT NOT NULL,
  log_no         VARCHAR(16),
  entry_date     DATE NOT NULL,
  supplier_brand VARCHAR(128),
  invoice_no     VARCHAR(64),
  material       VARCHAR(191) NOT NULL,
  part_code      VARCHAR(128),
  serial_number  VARCHAR(128),
  size           VARCHAR(64),
  qty            INT NOT NULL DEFAULT 0,
  rate           DECIMAL(10,2) DEFAULT 0,
  type           ENUM('Purchase','Return') NOT NULL DEFAULT 'Purchase',
  sales_price    DECIMAL(10,2) DEFAULT 0,
  comments       VARCHAR(255),
  approval_status ENUM('Pending','Approved') NOT NULL DEFAULT 'Pending',
  approved_by    INT,
  approved_at    DATETIME,
  created_by     INT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_purchases_material (material),
  INDEX idx_purchases_date (entry_date),
  INDEX idx_purchases_approval (approval_status),
  CONSTRAINT fk_purchases_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchases_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Inventory / consumption ledger (INVENTORY_FIELDS)
-- ---------------------------------------------------------------------
CREATE TABLE inventory (
  id             VARCHAR(32) PRIMARY KEY,
  sr_no          INT NOT NULL,
  log_no         VARCHAR(16),
  entry_date     DATE NOT NULL,
  client_brand   VARCHAR(128),
  issued_to      VARCHAR(128),
  invoice_no     VARCHAR(64),
  material       VARCHAR(191) NOT NULL,
  part_code      VARCHAR(128),
  serial_number  VARCHAR(128),
  size           VARCHAR(64),
  qty            INT NOT NULL DEFAULT 0,
  rate           DECIMAL(10,2) DEFAULT 0,
  type           ENUM('Debit','Credit') NOT NULL,
  discount       DECIMAL(10,2) DEFAULT 0,
  amount         DECIMAL(10,2) DEFAULT 0,
  linked_ticket  VARCHAR(64),
  comments       VARCHAR(255),
  approval_status ENUM('Pending','Approved') NOT NULL DEFAULT 'Pending',
  approved_by    INT,
  approved_at    DATETIME,
  created_by     INT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventory_material (material),
  INDEX idx_inventory_issued_to (issued_to),
  INDEX idx_inventory_linked_ticket (linked_ticket),
  INDEX idx_inventory_approval (approval_status),
  CONSTRAINT fk_inventory_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_inventory_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Daily Cash Book — income & expenditure
-- ---------------------------------------------------------------------
CREATE TABLE cashbook (
  id            VARCHAR(32) PRIMARY KEY,
  sr_no         INT NOT NULL,
  voucher_no    VARCHAR(32),
  entry_date    DATE NOT NULL,
  tran_type     ENUM('Receipt','Payment') NOT NULL,
  category      VARCHAR(128) NOT NULL,
  cash_group    VARCHAR(191),        -- 'group' is a MySQL reserved word, avoid it
  particulars   VARCHAR(255),
  stakeholder   VARCHAR(191),
  mode          VARCHAR(32) DEFAULT 'Cash',
  amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  comments      VARCHAR(255),
  approval_status ENUM('Pending','Approved') NOT NULL DEFAULT 'Pending',
  approved_by   INT,
  approved_at   DATETIME,
  created_by    INT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cashbook_date (entry_date),
  INDEX idx_cashbook_type (tran_type),
  INDEX idx_cashbook_approval (approval_status),
  CONSTRAINT fk_cashbook_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cashbook_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE cash_categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tran_type   ENUM('Receipt','Payment') NOT NULL,
  cash_group  VARCHAR(191) NOT NULL,
  category    VARCHAR(128) NOT NULL,
  description VARCHAR(255),
  UNIQUE KEY uq_cash_category (tran_type, category)
) ENGINE=InnoDB;

-- Default categories are loaded by seed_cash_categories.py.

-- ---------------------------------------------------------------------
-- Audit log — records every create/update/delete across Calls, Purchases,
-- Inventory, and Cash Book: who did it, when, and (for edits) exactly
-- what changed. Admin-only to view (Reports > Change Log).
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  table_name  VARCHAR(32) NOT NULL,   -- 'calls' | 'purchases' | 'inventory' | 'cashbook'
  record_id   VARCHAR(32) NOT NULL,
  action      ENUM('create','update','delete','approve') NOT NULL,
  user_id     INT,
  username    VARCHAR(64),            -- captured at the time, survives a later user deletion
  changed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  old_values  JSON,                   -- NULL for 'create'
  new_values  JSON,                   -- NULL for 'delete'
  INDEX idx_audit_table_record (table_name, record_id),
  INDEX idx_audit_changed_at (changed_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
