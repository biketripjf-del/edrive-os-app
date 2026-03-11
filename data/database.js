/**
 * eDrive OS App - Database Module (sql.js)
 * SQLite em WebAssembly - sem dependências nativas
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'edrive.db');

let db = null;

async function initDatabase() {
    const SQL = await initSqlJs();

    // Carregar banco existente ou criar novo
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Criar tabelas
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cpf_cnpj TEXT UNIQUE NOT NULL,
            nome TEXT,
            telefone TEXT,
            email TEXT,
            codigo_verificacao TEXT,
            codigo_expira TEXT,
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

    saveDatabase();
    console.log('[DB] Banco de dados inicializado com sucesso');
    return db;
}

function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

function getDb() {
    return db;
}

// Helpers para queries
function run(sql, params = []) {
    db.run(sql, params);
    saveDatabase();
}

function get(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

function all(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

module.exports = { initDatabase, getDb, saveDatabase, run, get, all };
