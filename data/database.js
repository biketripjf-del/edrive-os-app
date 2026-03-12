/**
 * eDrive OS App - Database Module
 * PostgreSQL (Railway) com fallback SQLite (dev)
 */

const DATABASE_URL = process.env.DATABASE_URL;
let mode = DATABASE_URL ? 'postgres' : 'sqlite';

// ═══════════════════════════════════════
// PostgreSQL (produção)
// ═══════════════════════════════════════

let pool = null;

async function initPostgres() {
    const { Pool } = require('pg');
    pool = new Pool({ 
        connectionString: DATABASE_URL,
        ssl: false // Railway internal = sem SSL
    });

    // Criar tabelas
    await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            cpf_cnpj TEXT UNIQUE NOT NULL,
            nome TEXT,
            telefone TEXT,
            email TEXT,
            codigo_verificacao TEXT,
            codigo_expira TEXT,
            codigo_status TEXT DEFAULT 'none',
            token_sessao TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ordens_servico (
            id SERIAL PRIMARY KEY,
            numero_os INTEGER NOT NULL,
            usuario_cpf_cnpj TEXT,
            fornecedor TEXT NOT NULL,
            cpf_cnpj TEXT,
            placa TEXT,
            marca_modelo_ano TEXT,
            data_abertura TEXT,
            data_prevista TEXT,
            data_finalizacao TEXT,
            autorizado_por TEXT,
            responsavel TEXT,
            telefone TEXT,
            email TEXT,
            chave_pix TEXT,
            tipo_pix TEXT,
            observacoes TEXT,
            itens_json TEXT,
            valor_total REAL DEFAULT 0,
            status TEXT DEFAULT 'Enviada',
            motivo_rejeicao TEXT,
            aprovado_por TEXT,
            aprovado_em TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS uploads (
            id SERIAL PRIMARY KEY,
            os_id INTEGER,
            tipo TEXT,
            filename TEXT,
            original_name TEXT,
            mimetype TEXT,
            size INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            FOREIGN KEY (os_id) REFERENCES ordens_servico(id)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS solicitacoes_itens (
            id SERIAL PRIMARY KEY,
            cpf_cnpj_solicitante TEXT,
            descricao TEXT,
            status TEXT DEFAULT 'Pendente',
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    console.log('[DB] PostgreSQL conectado e tabelas criadas');
    return pool;
}

// ═══════════════════════════════════════
// SQLite (dev/fallback)
// ═══════════════════════════════════════

const path = require('path');
const fs = require('fs');
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const DB_PATH = path.join(DB_DIR, 'edrive.db');

let db = null;

async function initSQLite() {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cpf_cnpj TEXT UNIQUE NOT NULL,
            nome TEXT,
            telefone TEXT,
            email TEXT,
            codigo_verificacao TEXT,
            codigo_expira TEXT,
            codigo_status TEXT DEFAULT 'none',
            token_sessao TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS ordens_servico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_os INTEGER NOT NULL,
            usuario_cpf_cnpj TEXT,
            fornecedor TEXT NOT NULL,
            cpf_cnpj TEXT,
            placa TEXT,
            marca_modelo_ano TEXT,
            data_abertura TEXT,
            data_prevista TEXT,
            data_finalizacao TEXT,
            autorizado_por TEXT,
            responsavel TEXT,
            telefone TEXT,
            email TEXT,
            chave_pix TEXT,
            tipo_pix TEXT,
            observacoes TEXT,
            itens_json TEXT,
            valor_total REAL DEFAULT 0,
            status TEXT DEFAULT 'Enviada',
            motivo_rejeicao TEXT,
            aprovado_por TEXT,
            aprovado_em TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            os_id INTEGER,
            tipo TEXT,
            filename TEXT,
            original_name TEXT,
            mimetype TEXT,
            size INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (os_id) REFERENCES ordens_servico(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS solicitacoes_itens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cpf_cnpj_solicitante TEXT,
            descricao TEXT,
            status TEXT DEFAULT 'Pendente',
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    console.log('[DB] SQLite inicializado (dev mode)');
    return db;
}

function saveSQLite() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

// ═══════════════════════════════════════
// Interface unificada
// ═══════════════════════════════════════

async function initDatabase() {
    if (mode === 'postgres') {
        try {
            await initPostgres();
            console.log('[DB] Modo: PostgreSQL (produção)');
        } catch (e) {
            console.error('[DB] PostgreSQL falhou, usando SQLite fallback:', e.message);
            mode = 'sqlite';
            await initSQLite();
        }
    } else {
        await initSQLite();
        console.log('[DB] Modo: SQLite (desenvolvimento)');
    }
}

async function run(sql, params = []) {
    if (mode === 'postgres') {
        // Converter ? para $1, $2, $3...
        let i = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++i}`);
        // Converter datetime('now') para NOW()
        const pgSqlFixed = pgSql.replace(/datetime\('now'\)/gi, 'NOW()');
        await pool.query(pgSqlFixed, params);
    } else {
        db.run(sql, params);
        saveSQLite();
    }
}

async function get(sql, params = []) {
    if (mode === 'postgres') {
        let i = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++i}`);
        const pgSqlFixed = pgSql.replace(/datetime\('now'\)/gi, 'NOW()');
        const result = await pool.query(pgSqlFixed, params);
        return result.rows[0] || null;
    } else {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        let result = null;
        if (stmt.step()) {
            result = stmt.getAsObject();
        }
        stmt.free();
        return result;
    }
}

async function all(sql, params = []) {
    if (mode === 'postgres') {
        let i = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++i}`);
        const pgSqlFixed = pgSql.replace(/datetime\('now'\)/gi, 'NOW()');
        const result = await pool.query(pgSqlFixed, params);
        return result.rows;
    } else {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }
}

function getDb() {
    return mode === 'postgres' ? pool : db;
}

function saveDatabase() {
    if (mode === 'sqlite') saveSQLite();
}

module.exports = { initDatabase, getDb, saveDatabase, run, get, all };
