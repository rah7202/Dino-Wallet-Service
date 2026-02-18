# 🦕 Dino Ventures — Internal Wallet Service

A production-grade, closed-loop virtual wallet service built with **double-entry ledger** architecture, designed for high-traffic applications like gaming platforms and loyalty reward systems.

[![Deploy Status](https://img.shields.io/badge/deploy-success-brightgreen)](https://dino-wallet-api.onrender.com)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/postgresql-16-blue)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://www.docker.com)

**🌐 Live API:** https://dino-wallet-api.onrender.com

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [API Documentation](#-api-documentation)
- [Database Schema](#-database-schema)
- [Concurrency Strategy](#-concurrency-strategy)
- [Idempotency](#-idempotency)
- [Deployment](#-deployment)
- [Testing](#-testing)

---

## ✨ Features

### Core Features 

| Requirement | Implementation | Status |
|------------|----------------|--------|
| **Data Seeding** | Automated `npm run seed` with assets, wallets, balances |
| **RESTful API** | 8 endpoints with proper HTTP methods | 
| **Three Flows** | Top-up, Bonus, Spend with full validation |
| **ACID Transactions** | PostgreSQL with row-level locking | 
| **Concurrency Control** | Deadlock-safe canonical lock ordering | 
| **Idempotency** | SHA-256 request hashing + 24h cache | 

### Extra Features 

| Feature | Implementation | Status |
|---------|----------------|--------|
| **Deadlock Avoidance** | Wallet locks acquired in sorted UUID order | 
| **Double-Entry Ledger** | Balance computed from ledger entries | 
| **Containerization** | Multi-stage Dockerfile + docker-compose | 
| **Cloud Deployment** | Live on Render with PostgreSQL | 

---

## 🏗 Architecture

### System Overview
```mermaid
graph TB
    subgraph "Client Layer"
        API[REST API Client]
    end
    
    subgraph "Application Layer"
        Express[Express.js Server]
        WalletService[Wallet Service]
        Repos[Repositories]
    end
    
    subgraph "Data Layer"
        PG[(PostgreSQL 16)]
        Ledger[Ledger Entries]
        Wallets[Wallets]
        Transactions[Transactions]
        IdemKeys[Idempotency Keys]
    end
    
    API -->|HTTP Requests| Express
    Express -->|Business Logic| WalletService
    WalletService -->|Data Access| Repos
    Repos -->|SQL Queries| PG
    PG --> Ledger
    PG --> Wallets
    PG --> Transactions
    PG --> IdemKeys
    
    style WalletService fill:#4CAF50
    style PG fill:#336791
    style Ledger fill:#FFC107
```

### Transaction Flow (Double-Entry Ledger)
```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Service
    participant IdemCache as Idempotency Cache
    participant DB as PostgreSQL
    
    Client->>API: POST /wallets/{id}/topup
    Note over Client,API: Idempotency-Key: abc-123
    
    API->>Service: topUp(walletId, amount)
    Service->>IdemCache: Check if key exists
    
    alt Key exists (duplicate request)
        IdemCache-->>Service: Return cached response
        Service-->>Client: 200 OK (from_cache: true)
    else Key not found (new request)
        Service->>DB: BEGIN TRANSACTION
        
        Service->>DB: Lock wallets (Treasury, User)
        Note over Service,DB: SELECT FOR UPDATE<br/>in sorted UUID order
        
        Service->>DB: Validate sufficient balance
        
        Service->>DB: Create transaction record
        Service->>DB: INSERT debit entry (Treasury)
        Service->>DB: INSERT credit entry (User)
        
        Service->>DB: Store idempotency key + response
        Service->>DB: COMMIT
        
        Service-->>Client: 201 Created (from_cache: false)
    end
```

### Three Transaction Flows
```mermaid
graph LR
    subgraph "Flow 1: Top-up (Purchase)"
        U1[User Wallet]
        T1[Treasury]
        T1 -->|Credit| U1
        U1 -.->|Debit| T1
        style T1 fill:#FF9800
        style U1 fill:#4CAF50
    end
    
    subgraph "Flow 2: Bonus (Incentive)"
        U2[User Wallet]
        BP[Bonus Pool]
        BP -->|Credit| U2
        U2 -.->|Debit| BP
        style BP fill:#9C27B0
        style U2 fill:#4CAF50
    end
    
    subgraph "Flow 3: Spend (Purchase)"
        U3[User Wallet]
        R[Revenue]
        U3 -->|Credit| R
        R -.->|Debit| U3
        style U3 fill:#4CAF50
        style R fill:#2196F3
    end
```

### Deadlock Prevention Strategy
```mermaid
flowchart TD
    Start([Transaction Starts]) --> GetWallets[Get Wallet IDs:<br/>A, B]
    GetWallets --> Sort[Sort in Ascending Order]
    Sort --> Lock1[Lock Wallet A<br/>SELECT FOR UPDATE]
    Lock1 --> Lock2[Lock Wallet B<br/>SELECT FOR UPDATE]
    Lock2 --> Validate{Validate<br/>Balance}
    
    Validate -->|Insufficient| Rollback[ROLLBACK]
    Validate -->|OK| CreateTx[Create Transaction]
    CreateTx --> Debit[INSERT Debit Entry]
    Debit --> Credit[INSERT Credit Entry]
    Credit --> SaveIdem[Save Idempotency Key]
    SaveIdem --> Commit[COMMIT]
    
    Rollback --> End([End])
    Commit --> End
    
    style Sort fill:#FFC107
    style Lock1 fill:#FF5722
    style Lock2 fill:#FF5722
    style Commit fill:#4CAF50
    style Rollback fill:#F44336
```

**Why This Works:**
- **Two concurrent transactions** touching wallets `A` and `B`
- **Both** will lock `A` first, then `B` (sorted order)
- **No circular wait** → No deadlock possible
- **Mathematically guaranteed** to avoid deadlocks

---

## 🛠 Tech Stack

### Backend
- **Node.js 20** - JavaScript runtime
- **Express 4.x** - Web framework
- **PostgreSQL 16** - Relational database

### Key Libraries
```json
{
  "pg": "^8.12.0",           // PostgreSQL client
  "decimal.js": "^10.4.3",   // Precise decimal math
  "uuid": "^10.0.0",         // UUID generation
  "dotenv": "^16.4.5"        // Environment config
}
```

### Why These Choices?

#### Node.js + Express
✅ JavaScript everywhere (full-stack compatibility)  
✅ Excellent `async/await` support for database operations  
✅ Rich ecosystem for PostgreSQL tooling  
✅ Easy containerization and cloud deployment  

#### PostgreSQL
✅ `SELECT FOR UPDATE` for precise row-level locking  
✅ `NUMERIC(28,8)` columns eliminate floating-point errors  
✅ ACID transactions with automatic rollback  
✅ `JSONB` for flexible metadata storage  
✅ Excellent performance for high-concurrency workloads  

#### Raw SQL (No ORM)
✅ Direct control over queries (no hidden N+1 problems)  
✅ Explicit transaction management  
✅ Access to PostgreSQL-specific features (FOR UPDATE, SKIP LOCKED)  
✅ Easier to debug and optimize  

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org))
- **PostgreSQL** 16+ (or use [Neon](https://neon.tech) / [Render](https://render.com))
- **Git**

### Local Development Setup
```bash
# 1. Clone repository
git clone https://github.com/rah7202/Dino-Wallet-Service.git
cd Dino-Wallet-Service

# 2. Install dependencies 
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and add your DATABASE_URL

# 4. Run migrations and seed
npm run setup

# 5. Start development server
npm run dev
```

**Server runs at:** `http://localhost:3000`

### Using Docker Compose (Optional)

Docker Desktop must be running.
```bash
# Start PostgreSQL + API in containers
docker-compose up --build

# Server runs at: http://localhost:3000

# Stop containers
docker-compose down
```

**Note:** Docker is already proven working in production on Render. Local Docker is optional for development.

---

## 📡 API Documentation

### Base URL

**Local:** `http://localhost:3000`  
**Production:** `https://dino-wallet-api.onrender.com`

### Authentication

No authentication required for this demo. In production, use JWT or API keys.

### Endpoints

#### 🟢 Read Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (API + DB status) |
| GET | `/api/v1/assets` | List all asset types |
| GET | `/api/v1/wallets` | List all wallets |
| GET | `/api/v1/wallets/:walletId/balance` | Get wallet balance |
| GET | `/api/v1/wallets/:walletId/transactions` | Get transaction history (paginated) |

#### 🔵 Write Operations (Require `Idempotency-Key` header)

| Method | Endpoint | Description | Flow |
|--------|----------|-------------|------|
| POST | `/api/v1/wallets/:walletId/topup` | User purchases credits | Treasury → User |
| POST | `/api/v1/wallets/:walletId/bonus` | System grants free credits | Bonus Pool → User |
| POST | `/api/v1/wallets/:walletId/spend` | User spends credits | User → Revenue |

### Request Examples

#### Health Check
```bash
curl https://dino-wallet-api.onrender.com/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-18T10:30:00.000Z",
  "checks": {
    "api": { "status": "ok" },
    "database": {
      "status": "ok",
      "latency_ms": 12
    }
  }
}
```

#### Check Balance
```bash
curl https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000001/balance
```

**Response:**
```json
{
  "wallet_id": "33333333-0000-0000-0000-000000000001",
  "label": "alice@dino.gg",
  "balances": [
    {
      "asset_type_id": "11111111-0000-0000-0000-000000000002",
      "asset_name": "Diamonds",
      "symbol": "DIA",
      "balance": "50"
    },
    {
      "asset_type_id": "11111111-0000-0000-0000-000000000001",
      "asset_name": "Gold Coins",
      "symbol": "GLD",
      "balance": "1000"
    }
  ]
}
```

#### Top-up Transaction
```bash
curl -X POST https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000001/topup \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: topup-demo-$(date +%s)" \
  -d '{
    "asset_type_id": "11111111-0000-0000-0000-000000000001",
    "amount": 500,
    "reference": "PAY-STRIPE-12345",
    "initiated_by": "user:alice",
    "metadata": {
      "payment_method": "stripe",
      "order_id": "ORD-001"
    }
  }'
```

**Response (201 Created):**
```json
{
  "data": {
    "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
    "transaction_type": "topup",
    "reference": "PAY-STRIPE-12345",
    "asset_type_id": "11111111-0000-0000-0000-000000000001",
    "asset_symbol": "GLD",
    "amount": 500,
    "from_wallet_id": "22222222-0000-0000-0000-000000000001",
    "to_wallet_id": "33333333-0000-0000-0000-000000000001",
    "created_at": "2025-01-18T10:30:15.123Z"
  },
  "from_cache": false
}
```

#### Bonus Transaction
```bash
curl -X POST https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000002/bonus \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: bonus-demo-$(date +%s)" \
  -d '{
    "asset_type_id": "11111111-0000-0000-0000-000000000003",
    "amount": 100,
    "reference": "REFERRAL-BOB-001",
    "metadata": { "reason": "referred 5 friends" }
  }'
```

#### Spend Transaction
```bash
curl -X POST https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000001/spend \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: spend-demo-$(date +%s)" \
  -d '{
    "asset_type_id": "11111111-0000-0000-0000-000000000001",
    "amount": 100,
    "reference": "ITEM-SWORD-LEGENDARY",
    "metadata": { "item_id": "sword_001", "item_name": "Dragon Slayer" }
  }'
```

#### Transaction History
```bash
curl "https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000001/transactions?limit=10&offset=0"
```

### Error Responses

#### 400 Bad Request
```json
{
  "error": "amount must be a positive number",
  "statusCode": 400
}
```

#### 404 Not Found
```json
{
  "error": "Wallet not found",
  "statusCode": 404
}
```

#### 409 Conflict (Idempotency key reused with different body)
```json
{
  "error": "Idempotency-Key already used with a different request body",
  "statusCode": 409
}
```

#### 422 Unprocessable Entity (Insufficient balance)
```json
{
  "error": "Insufficient balance: have 100, need 500",
  "statusCode": 422
}
```

---

## 🗄 Database Schema
```mermaid
erDiagram
    ASSET_TYPES ||--o{ LEDGER_ENTRIES : "has"
    WALLETS ||--o{ LEDGER_ENTRIES : "owns"
    TRANSACTIONS ||--o{ LEDGER_ENTRIES : "contains"
    TRANSACTIONS ||--o| IDEMPOTENCY_KEYS : "tracked by"
    
    ASSET_TYPES {
        uuid id PK
        text name UK
        varchar symbol UK
        text description
        boolean is_active
        timestamptz created_at
    }
    
    WALLETS {
        uuid id PK
        text owner_ref
        text owner_type
        text label
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
    
    TRANSACTIONS {
        uuid id PK
        text transaction_type
        text reference
        text initiated_by
        jsonb metadata
        timestamptz created_at
    }
    
    LEDGER_ENTRIES {
        uuid id PK
        uuid transaction_id FK
        uuid wallet_id FK
        uuid asset_type_id FK
        text direction
        numeric amount
        timestamptz created_at
    }
    
    IDEMPOTENCY_KEYS {
        uuid id PK
        text idem_key UK
        text endpoint
        text request_hash
        integer response_status
        jsonb response_body
        uuid transaction_id FK
        timestamptz expires_at
        timestamptz created_at
    }
```

### Key Tables

#### `asset_types`
Defines virtual currencies (Gold Coins, Diamonds, Loyalty Points).

#### `wallets`
Each user and system account has a wallet. System wallets:
- **Treasury** - Source for top-ups (backed by real money purchases)
- **Bonus Pool** - Source for free credits
- **Revenue** - Receives all spent credits

#### `transactions`
Top-level business event record (topup / bonus / spend).

#### `ledger_entries` ⭐ **Core Table**
Every transaction creates **exactly 2 entries**:
- One **DEBIT** (decreases balance)
- One **CREDIT** (increases balance)

**Balance is computed**, never stored:
```sql
SELECT SUM(
  CASE WHEN direction = 'credit' THEN amount
       ELSE -amount END
) AS balance
FROM ledger_entries
WHERE wallet_id = $1 AND asset_type_id = $2
```

#### `idempotency_keys`
Stores request hash + response for 24 hours. Prevents duplicate transactions on network retries.

---

## 🔒 Concurrency Strategy

### The Problem

Without proper locking, concurrent transactions can deadlock:
```
Transaction 1: Transfer A → B
  1. Lock wallet A
  2. Wait for wallet B...

Transaction 2: Transfer B → A
  1. Lock wallet B
  2. Wait for wallet A...

Result: DEADLOCK 💥
```

### Our Solution: Canonical Lock Ordering

**Always lock wallets in ascending UUID order:**
```javascript
// WalletRepository.lockWallets()
async lockWallets(client, ...walletIds) {
  // 1. Remove duplicates and SORT ascending
  const sortedIds = [...new Set(walletIds)].sort();
  
  // 2. Lock in sorted order
  for (const id of sortedIds) {
    await client.query(
      'SELECT * FROM wallets WHERE id = $1 FOR UPDATE',
      [id]
    );
  }
}
```

**Example:**
```
Transaction 1: A → B
  Sorts: [A, B]
  Locks: A, then B ✅

Transaction 2: B → A
  Sorts: [A, B] (same order!)
  Locks: A (waits), then B ✅

Result: NO DEADLOCK 🎉
```

### Additional Safeguards

| Mechanism | Implementation | Purpose |
|-----------|----------------|---------|
| **Statement Timeout** | 10 seconds | Prevents long-running queries from holding locks |
| **Connection Pool** | Max 10 connections | Prevents thundering herd |
| **Transaction Retry** | Auto-retry on `40001`/`40P01` | Handles serialization failures |
| **Read Committed** | PostgreSQL default | Balance between consistency and performance |

---

## 🔑 Idempotency

All write operations require an `Idempotency-Key` header to prevent duplicate transactions.

### How It Works
```mermaid
sequenceDiagram
    participant Client
    participant Service
    participant Cache
    participant DB
    
    Client->>Service: POST with Idempotency-Key: abc-123
    Service->>Service: Hash request body (SHA-256)
    Service->>Cache: Check if key exists
    
    alt Key exists
        Cache->>Service: Found! Hash matches?
        alt Hash matches
            Service-->>Client: Return cached response (200 OK)
        else Hash different
            Service-->>Client: 409 Conflict Error
        end
    else Key not found
        Service->>DB: Execute transaction
        Service->>Cache: Store key + hash + response
        Service-->>Client: Return new response (201 Created)
    end
```

### Implementation

**Request Hashing:**
```javascript
const crypto = require('crypto');

function hashRequest(body) {
  const normalized = JSON.stringify(body, Object.keys(body).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

**Cache Check:**
```javascript
const existing = await idempotencyRepo.get(idemKey);

if (existing) {
  if (existing.request_hash !== requestHash) {
    throw new ConflictError('Idempotency-Key already used with different body');
  }
  return { data: existing.response_body, fromCache: true };
}
```

**Atomic Storage:**
```javascript
await withTransaction(async (client) => {
  // ... execute transaction ...
  
  // Store idempotency record in SAME transaction
  await idempotencyRepo.store(client, {
    idemKey,
    requestHash,
    responseBody: result,
    transactionId: txId
  });
});
```

### Benefits

✅ **Network retries safe** - Same request returns same response  
✅ **No double-charges** - Second request uses cached result  
✅ **Race condition proof** - Stored atomically with transaction  
✅ **24-hour window** - Keys expire after 1 day  

---

## 🚢 Deployment

### Render (Production)

**Live URL:** https://dino-wallet-api.onrender.com

#### Services

| Service | Type | Plan | Region |
|---------|------|------|--------|
| **dino-wallet-api** | Web Service (Docker) | Free | Oregon (US West) |
| **dino-wallet-db** | PostgreSQL 16 | Free | Oregon (US West) |

#### Deployment Steps

**1. Create PostgreSQL Database**
```bash
# On Render Dashboard:
# - Click "New +" → "PostgreSQL"
# - Name: dino-wallet-db
# - Database: wallet_db
# - User: wallet_user
# - Plan: Free
# - Click "Create Database"
```

**2. Run Migrations Locally**
```bash
# Copy Internal Database URL from Render
export DATABASE_URL="postgresql://user:pass@host/db"

# Run migrations and seed
npm run setup
```

**3. Deploy Web Service** 
```bash
# On Render Dashboard:
# - Click "New +" → "Web Service"
# - Connect GitHub repo: dino-wallet
# - Runtime: Docker
# - Add environment variables:
#   - DATABASE_URL (from step 1)
#   - NODE_ENV=production
#   - PORT=3000
# - Click "Create Web Service"
```

**4. Auto-Deploy on Push**
```bash
# Any push to main branch triggers automatic deployment
git push origin main
# → Render rebuilds and redeploys automatically
```

#### Environment Variables (Render)
```bash
DATABASE_URL=postgresql://wallet_user:xxx@dpg-xxx.oregon-postgres.render.com/wallet_db
NODE_ENV=production
PORT=3000
DB_POOL_MAX=10
DB_STATEMENT_TIMEOUT_MS=10000
```

#### Monitoring

- **Logs:** https://dashboard.render.com/web/[service-id]/logs
- **Metrics:** Built-in CPU/Memory graphs
- **Health Check:** Automatic `/health` endpoint monitoring

#### Free Tier Limitations

⚠️ **Important Notes:**
- **Web Service:** Spins down after 15 minutes of inactivity
  - First request after spin-down: ~30 seconds (cold start)
  - Subsequent requests: <100ms
- **PostgreSQL:** 
  - 500 MB storage limit
  - Expires after 90 days
  - Good for demos/testing

💡 **For Production:**
- Upgrade to paid plans ($7/month per service)
- Persistent database (no expiration)
- No cold starts

---

### Docker Deployment

#### Build Image
```bash
# Build Docker image
docker build -t dino-wallet .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e NODE_ENV=production \
  dino-wallet
```

#### Docker Compose (Full Stack)
```bash
# Start PostgreSQL + API
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**docker-compose.yml includes:**
- PostgreSQL 16 container
- API container with health checks
- Persistent volume for database
- Automatic network configuration

#### Multi-Stage Build Benefits
```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN npm ci --only=production

# Stage 2: Runtime (only 40MB!)
FROM node:20-alpine
COPY --from=deps /app/node_modules ./node_modules
```

✅ **Final image size:** ~40 MB (vs 200+ MB without multi-stage)  
✅ **Security:** Runs as non-root user  
✅ **Health check:** Built-in container health monitoring  

---

## 🧪 Testing

### Seed Data Reference

| Entity | ID | Initial Balance |
|--------|----|-----------------|
| **Alice (User)** | `33333333-0000-0000-0000-000000000001` | 1,000 GLD, 50 DIA |
| **Bob (User)** | `33333333-0000-0000-0000-000000000002` | 500 GLD, 200 LPT |
| **Gold Coins** | `11111111-0000-0000-0000-000000000001` | Primary currency |
| **Diamonds** | `11111111-0000-0000-0000-000000000002` | Premium currency |
| **Loyalty Points** | `11111111-0000-0000-0000-000000000003` | Earned rewards |

### Test Scenarios

#### 1. Health Check
```bash
curl https://dino-wallet-api.onrender.com/health
# Expected: 200 OK with database latency
```

#### 2. Check Initial Balance
```bash
curl https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000001/balance
# Expected: Alice has 1000 GLD, 50 DIA
```

#### 3. Top-up (Purchase Credits)
```bash
curl -X POST https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000001/topup \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-topup-001" \
  -d '{"asset_type_id":"11111111-0000-0000-0000-000000000001","amount":500,"reference":"TEST-TOPUP"}'
# Expected: 201 Created, balance increases to 1500 GLD
```

#### 4. Test Idempotency (Duplicate Request)
```bash
# Run the EXACT same request again
curl -X POST https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000001/topup \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-topup-001" \
  -d '{"asset_type_id":"11111111-0000-0000-0000-000000000001","amount":500,"reference":"TEST-TOPUP"}'
# Expected: 200 OK, from_cache: true, same transaction ID
```

#### 5. Bonus (Free Credits)
```bash
curl -X POST https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000002/bonus \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-bonus-001" \
  -d '{"asset_type_id":"11111111-0000-0000-0000-000000000003","amount":100,"reference":"TEST-BONUS"}'
# Expected: 201 Created, Bob gets 100 LPT (total: 300)
```

#### 6. Spend (Buy Item)
```bash
curl -X POST https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000001/spend \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-spend-001" \
  -d '{"asset_type_id":"11111111-0000-0000-0000-000000000001","amount":100,"reference":"TEST-SPEND"}'
# Expected: 201 Created, Alice spends 100 GLD (balance: 1400)
```

#### 7. Insufficient Balance (Should Fail)
```bash
curl -X POST https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000001/spend \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-insufficient-001" \
  -d '{"asset_type_id":"11111111-0000-0000-0000-000000000001","amount":999999,"reference":"TOO-MUCH"}'
# Expected: 422 Unprocessable Entity, "Insufficient balance"
```

#### 8. Transaction History
```bash
curl "https://dino-wallet-api.onrender.com/api/v1/wallets/33333333-0000-0000-0000-000000000001/transactions?limit=10"
# Expected: List of all Alice's transactions
```

### Expected Test Results

| Test | Expected Status | Expected Result |
|------|----------------|-----------------|
| Health check | 200 OK | Database connected |
| Initial balance | 200 OK | Alice: 1000 GLD, 50 DIA |
| Top-up | 201 Created | Balance increases |
| Duplicate top-up | 200 OK | `from_cache: true` |
| Bonus | 201 Created | Free credits added |
| Spend | 201 Created | Balance decreases |
| Overspend | 422 Error | Transaction rejected |
| History | 200 OK | All entries listed |

---

## 📁 Project Structure
```
dino-wallet/
├── src/
│   ├── app.js                          # Express entry point + graceful shutdown
│   ├── config/
│   │   └── index.js                    # Environment configuration
│   ├── db/
│   │   ├── pool.js                     # PostgreSQL connection pool
│   │   ├── migrate.js                  # Schema creation script
│   │   └── seed.js                     # Initial data seeding
│   ├── errors/
│   │   └── ApiError.js                 # Custom error classes
│   ├── repositories/                   # Database query layer
│   │   ├── WalletRepository.js         # Wallet CRUD + locking
│   │   ├── LedgerRepository.js         # Balance computation + history
│   │   ├── TransactionRepository.js    # Transaction records
│   │   ├── AssetRepository.js          # Asset type queries
│   │   └── IdempotencyRepository.js    # Idempotency cache
│   ├── services/
│   │   └── WalletService.js            # Core business logic (3 flows)
│   ├── handlers/
│   │   ├── walletRoutes.js             # REST API endpoints
│   │   └── healthRoutes.js             # Health check endpoint
│   └── middleware/
│       ├── errorHandler.js             # Global error → JSON converter
│       └── requestLogger.js            # HTTP request logger
├── scripts/
│   └── setup-db.js                     # One-command migration + seed
├── Dockerfile                          # Multi-stage container build
├── docker-compose.yml                  # Local dev environment
├── package.json                        # Dependencies + scripts
├── .env.example                        # Environment template
├── .gitignore                          # Git exclusions
└── README.md                           # This file
```

---


### Core Features

- [x] **Data Seeding:** `npm run seed` creates assets, wallets, balances
- [x] **RESTful API:** 8 endpoints with proper HTTP verbs
- [x] **Three Flows:** Top-up, Bonus, Spend fully implemented
- [x] **Concurrency Control:** Row-level locking with deadlock prevention
- [x] **Idempotency:** SHA-256 hashing + 24h cache
- [x] **README:** Complete documentation with setup instructions

### Extra Features

- [x] **Deadlock Avoidance:** Canonical lock ordering (sorted UUIDs)
- [x] **Double-Entry Ledger:** Balance computed from entries
- [x] **Containerization:** Multi-stage Dockerfile + docker-compose
- [x] **Cloud Hosting:** Live on Render with PostgreSQL

---

## 🎯 Key Highlights

### What Makes This Production-Ready?

1. **Zero Balance Drift**
   - Balance never stored as a column
   - Always computed from immutable ledger entries
   - Global invariant: `SUM(all entries) = 0`

2. **Bulletproof Concurrency**
   - Canonical lock ordering eliminates deadlocks
   - Automatic retry on serialization failures
   - Statement timeouts prevent lock starvation

3. **Complete Audit Trail**
   - Every credit/debit permanently recorded
   - Transaction metadata stored as JSONB
   - Full history queryable with pagination

4. **Network Resilience**
   - Idempotency prevents duplicate charges
   - Request hashing detects payload changes
   - 24-hour cache window

5. **High Performance**
   - Connection pooling (max 10)
   - Partial indexes on hot paths
   - Efficient balance computation (single query)

---

## 👨‍💻 Author

**RAHUL PIDIYAR**  
GitHub: [https://github.com/rah7202]  
Email: [rpidiyar249@gmail.com]
Linkedin: [https://www.linkedin.com/in/rahul-pidiyar-101115284/]

**Live Demo:** https://dino-wallet-api.onrender.com

---

## 📄 License

MIT License - See LICENSE file for details

---
