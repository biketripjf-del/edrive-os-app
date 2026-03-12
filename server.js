/**
 * eDrive OS App - Backend Server (Fase 2)
 * Sistema completo de OS com autenticacao, aprovacao e historico
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { initDatabase, run, get, all, saveDatabase } = require('./data/database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'edrive-jwt-secret-2026';
const ADMIN_PASSWORD = 'edrive2026';

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

app.use(express.json());
app.use(cookieParser());

// Rate limiting global
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000,  // Aumentado de 100 para 10000 (suporta health checks)
    message: { erro: 'Muitas requisicoes. Tente novamente em alguns minutos.' }
});
app.use('/api/', globalLimiter);

// Rate limiting login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

// Rate limiting PDF
const pdfLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { erro: 'Limite de geracao de PDF atingido. Tente novamente em 1 hora.' }
});

// Upload config
const volumeDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const uploadsDir = path.join(volumeDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${timestamp}_${safeName}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo nao permitido'));
        }
    }
});

// Servir uploads como estaticos
app.use('/data/uploads', express.static(uploadsDir));

// Servir arquivos estaticos
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

function authMiddleware(req, res, next) {
    const token = req.cookies.auth_token;
    if (!token) {
        return res.status(401).json({ erro: 'Nao autenticado' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ erro: 'Sessao expirada' });
    }
}

// Aceita user OU admin token
function authOrAdminMiddleware(req, res, next) {
    // Tentar user token primeiro
    const userToken = req.cookies.auth_token;
    if (userToken) {
        try {
            const decoded = jwt.verify(userToken, JWT_SECRET);
            req.user = decoded;
            return next();
        } catch (e) { /* token inválido, tentar admin */ }
    }
    // Tentar admin token
    const adminToken = req.cookies.admin_token;
    if (adminToken) {
        try {
            const decoded = jwt.verify(adminToken, JWT_SECRET);
            if (decoded.admin) {
                req.user = { id: 0, cpf_cnpj: 'ADMIN' };
                req.admin = decoded;
                return next();
            }
        } catch (e) { /* token inválido */ }
    }
    return res.status(401).json({ erro: 'Nao autenticado' });
}

function adminMiddleware(req, res, next) {
    const token = req.cookies.admin_token;
    if (!token) {
        return res.status(401).json({ erro: 'Nao autenticado como admin' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.admin) {
            return res.status(403).json({ erro: 'Sem permissao' });
        }
        req.admin = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ erro: 'Sessao admin expirada' });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROTAS DE PAGINA (redirect se nao logado)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
    // Aceitar user OU admin token
    const userToken = req.cookies.auth_token;
    const adminToken = req.cookies.admin_token;
    
    let authenticated = false;
    if (userToken) {
        try { jwt.verify(userToken, JWT_SECRET); authenticated = true; } catch(e) {}
    }
    if (!authenticated && adminToken) {
        try { 
            const d = jwt.verify(adminToken, JWT_SECRET); 
            if (d.admin) authenticated = true; 
        } catch(e) {}
    }
    
    if (!authenticated) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/solicitar-codigo', loginLimiter, async (req, res) => {
    const { cpf_cnpj, whatsapp } = req.body;
    if (!cpf_cnpj) {
        return res.status(400).json({ erro: 'CPF/CNPJ obrigatorio' });
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const expira = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const whatsappClean = whatsapp ? whatsapp.replace(/\D/g, '') : '';

    // Upsert usuario
    const existing = await get('SELECT id FROM usuarios WHERE cpf_cnpj = ?', [cpf_cnpj]);
    if (existing) {
        await run('UPDATE usuarios SET codigo_verificacao = ?, codigo_expira = ?, telefone = ?, codigo_status = ? WHERE cpf_cnpj = ?',
            [codigo, expira, whatsappClean, 'pending', cpf_cnpj]);
    } else {
        await run('INSERT INTO usuarios (cpf_cnpj, codigo_verificacao, codigo_expira, telefone, codigo_status) VALUES (?, ?, ?, ?, ?)',
            [cpf_cnpj, codigo, expira, whatsappClean, 'pending']);
    }

    // Se não tem WhatsApp, retorna código de teste (fallback)
    if (!whatsappClean || whatsappClean.length < 11) {
        res.json({
            sucesso: true,
            mensagem: 'Codigo gerado (sem WhatsApp)',
            codigo_teste: codigo
        });
    } else {
        // WhatsApp informado → bot vai buscar e enviar
        res.json({
            sucesso: true,
            mensagem: 'Codigo enviado para seu WhatsApp'
        });
    }
});

app.post('/api/auth/verificar-codigo', loginLimiter, async (req, res) => {
    const { cpf_cnpj, codigo } = req.body;
    if (!cpf_cnpj || !codigo) {
        return res.status(400).json({ erro: 'CPF/CNPJ e codigo obrigatorios' });
    }

    const user = await get('SELECT * FROM usuarios WHERE cpf_cnpj = ?', [cpf_cnpj]);
    if (!user) {
        return res.status(400).json({ erro: 'Usuario nao encontrado' });
    }

    if (user.codigo_verificacao !== codigo) {
        return res.status(400).json({ erro: 'Codigo invalido' });
    }

    if (new Date(user.codigo_expira) < new Date()) {
        return res.status(400).json({ erro: 'Codigo expirado. Solicite um novo.' });
    }

    // Gerar JWT
    const token = jwt.sign(
        { id: user.id, cpf_cnpj: user.cpf_cnpj },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    // Limpar codigo
    await run('UPDATE usuarios SET codigo_verificacao = NULL, codigo_expira = NULL, token_sessao = ? WHERE id = ?',
        [token, user.id]);

    res.cookie('auth_token', token, {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    });

    res.json({ sucesso: true, cpf_cnpj: user.cpf_cnpj });
});

app.get('/api/auth/me', authOrAdminMiddleware, async (req, res) => {
    if (req.admin) {
        return res.json({ id: 0, cpf_cnpj: 'ADMIN', nome: 'Administrador', telefone: '', email: '' });
    }
    const user = await get('SELECT id, cpf_cnpj, nome, telefone, email FROM usuarios WHERE id = ?', [req.user.id]);
    if (!user) {
        return res.status(404).json({ erro: 'Usuario nao encontrado' });
    }
    res.json(user);
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ sucesso: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// BOT POLLING ROUTES (VPS → Railway)
// ═══════════════════════════════════════════════════════════════════════════

const BOT_TOKEN = process.env.BOT_POLLING_TOKEN || '2471091ceb20b799a1ce6beef07c7dbbdd8120098baebed928014a4510126545';

function botAuthMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${BOT_TOKEN}`) {
        return res.status(401).json({ erro: 'Token invalido' });
    }
    next();
}

// Bot busca códigos pendentes
app.get('/api/bot/pending-codes', botAuthMiddleware, async (req, res) => {
    const pendentes = await all(
        `SELECT cpf_cnpj, telefone, codigo_verificacao, codigo_expira 
         FROM usuarios 
         WHERE codigo_status = 'pending' 
         AND telefone IS NOT NULL 
         AND telefone != ''
         AND codigo_expira > datetime('now')`
    );
    res.json({ pendentes });
});

// Bot confirma que enviou o código
app.post('/api/bot/code-sent', botAuthMiddleware, async (req, res) => {
    const { cpf_cnpj } = req.body;
    if (!cpf_cnpj) {
        return res.status(400).json({ erro: 'cpf_cnpj obrigatorio' });
    }
    await run('UPDATE usuarios SET codigo_status = ? WHERE cpf_cnpj = ?', ['sent', cpf_cnpj]);
    res.json({ sucesso: true });
});

// Bot busca OS aprovadas pendentes de cadastro no Autos 360
app.get('/api/bot/approved-orders', botAuthMiddleware, async (req, res) => {
    const aprovadas = await all(
        `SELECT id, numero_os, fornecedor, cpf_cnpj, placa, marca_modelo_ano,
                data_abertura, data_prevista, data_finalizacao, autorizado_por,
                responsavel, telefone, email, chave_pix, tipo_pix,
                observacoes, itens_json, valor_total
         FROM ordens_servico 
         WHERE status = 'Aprovada'`
    );
    res.json({ aprovadas });
});

// Bot confirma que OS foi cadastrada no Autos 360
app.post('/api/bot/order-processed', botAuthMiddleware, async (req, res) => {
    const { id, os_altimus } = req.body;
    if (!id) {
        return res.status(400).json({ erro: 'id obrigatorio' });
    }
    await run(`UPDATE ordens_servico SET status = 'Cadastrada', 
         observacoes = COALESCE(observacoes, '') || ? ,
         updated_at = datetime('now') 
         WHERE id = ?`, 
        [os_altimus ? ` [Altimus OS#${os_altimus}]` : ' [Cadastrada no Altimus]', id]);
    res.json({ sucesso: true });
});

// Bot reporta erro no cadastro
app.post('/api/bot/order-error', botAuthMiddleware, async (req, res) => {
    const { id, erro } = req.body;
    if (!id) {
        return res.status(400).json({ erro: 'id obrigatorio' });
    }
    await run(`UPDATE ordens_servico SET status = 'Erro', 
         motivo_rejeicao = ?,
         updated_at = datetime('now') 
         WHERE id = ?`, 
        [erro || 'Erro no cadastro Altimus', id]);
    res.json({ sucesso: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const { senha } = req.body;
    if (senha !== ADMIN_PASSWORD) {
        return res.status(401).json({ erro: 'Senha incorreta' });
    }

    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });

    res.cookie('admin_token', token, {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    });

    res.json({ sucesso: true });
});

app.post('/api/admin/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ sucesso: true });
});

app.get('/api/admin/dashboard', adminMiddleware, async (req, res) => {
    const totalRow = await get('SELECT COUNT(*) as c FROM ordens_servico');
    const pendentesRow = await get("SELECT COUNT(*) as c FROM ordens_servico WHERE status = 'Enviada'");
    const aprovadasRow = await get("SELECT COUNT(*) as c FROM ordens_servico WHERE status = 'Aprovada'");
    const rejeitadasRow = await get("SELECT COUNT(*) as c FROM ordens_servico WHERE status = 'Rejeitada'");
    
    const errosRow = await get("SELECT COUNT(*) as c FROM ordens_servico WHERE status = 'Erro'");
    
    const total = totalRow?.c || 0;
    const pendentes = pendentesRow?.c || 0;
    const aprovadas = aprovadasRow?.c || 0;
    const rejeitadas = rejeitadasRow?.c || 0;
    const erros = errosRow?.c || 0;

    res.json({ total, pendentes, aprovadas, rejeitadas, erros });
});

app.get('/api/admin/ordens', adminMiddleware, async (req, res) => {
    const { status, busca } = req.query;
    let sql = 'SELECT * FROM ordens_servico WHERE 1=1';
    const params = [];

    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }

    if (busca) {
        sql += " AND (fornecedor LIKE ? OR placa LIKE ? OR CAST(numero_os AS TEXT) LIKE ?)";
        const term = `%${busca}%`;
        params.push(term, term, term);
    }

    sql += ' ORDER BY id DESC';

    const ordens = await all(sql, params);
    res.json(ordens);
});

app.get('/api/admin/os/:id', adminMiddleware, async (req, res) => {
    const os = await get('SELECT * FROM ordens_servico WHERE id = ?', [Number(req.params.id)]);
    if (!os) {
        return res.status(404).json({ erro: 'OS nao encontrada' });
    }

    // Buscar uploads
    const uploads = await all('SELECT * FROM uploads WHERE os_id = ?', [os.id]);
    os.uploads = uploads;

    res.json(os);
});

app.post('/api/admin/aprovar/:id', adminMiddleware, async (req, res) => {
    const os = await get('SELECT * FROM ordens_servico WHERE id = ?', [Number(req.params.id)]);
    if (!os) {
        return res.status(404).json({ erro: 'OS nao encontrada' });
    }
    if (os.status !== 'Enviada') {
        return res.status(400).json({ erro: 'OS ja foi processada' });
    }

    await run("UPDATE ordens_servico SET status = 'Aprovada', aprovado_por = 'Admin', aprovado_em = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [os.id]);

    res.json({ sucesso: true });
});

// Listar solicitações de novos itens
app.get('/api/admin/solicitacoes', adminMiddleware, async (req, res) => {
    const solicitacoes = await all('SELECT * FROM solicitacoes_itens ORDER BY id DESC');
    res.json(solicitacoes);
});

// Marcar solicitação como atendida
app.post('/api/admin/solicitacoes/:id/atender', adminMiddleware, async (req, res) => {
    await run("UPDATE solicitacoes_itens SET status = 'Atendida' WHERE id = ?", [Number(req.params.id)]);
    res.json({ sucesso: true });
});

app.post('/api/admin/retentar/:id', adminMiddleware, async (req, res) => {
    const os = await get('SELECT * FROM ordens_servico WHERE id = ?', [Number(req.params.id)]);
    if (!os) {
        return res.status(404).json({ erro: 'OS nao encontrada' });
    }
    if (os.status !== 'Erro') {
        return res.status(400).json({ erro: 'Apenas OS com erro podem ser retentadas' });
    }
    await run("UPDATE ordens_servico SET status = 'Aprovada', motivo_rejeicao = NULL, updated_at = datetime('now') WHERE id = ?", [os.id]);
    res.json({ sucesso: true });
});

app.post('/api/admin/rejeitar/:id', adminMiddleware, async (req, res) => {
    const os = await get('SELECT * FROM ordens_servico WHERE id = ?', [Number(req.params.id)]);
    if (!os) {
        return res.status(404).json({ erro: 'OS nao encontrada' });
    }
    if (os.status !== 'Enviada' && os.status !== 'Erro') {
        return res.status(400).json({ erro: 'OS ja foi processada' });
    }

    const { motivo } = req.body;
    if (!motivo) {
        return res.status(400).json({ erro: 'Motivo da rejeicao obrigatorio' });
    }

    await run("UPDATE ordens_servico SET status = 'Rejeitada', motivo_rejeicao = ?, aprovado_por = 'Admin', aprovado_em = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [motivo, os.id]);

    res.json({ sucesso: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/upload', authOrAdminMiddleware, upload.array('files', 8), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
    }

    const tipo = req.body.tipo || 'geral';
    const uploadedFiles = req.files.map(f => ({
        filename: f.filename,
        original_name: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        tipo: tipo
    }));

    res.json({ sucesso: true, files: uploadedFiles });
});

// ═══════════════════════════════════════════════════════════════════════════
// HISTORICO (Minhas OS)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/minhas-os', authMiddleware, async (req, res) => {
    const { status } = req.query;
    let sql = 'SELECT * FROM ordens_servico WHERE usuario_cpf_cnpj = ?';
    const params = [req.user.cpf_cnpj];

    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }

    sql += ' ORDER BY id DESC';
    const ordens = await all(sql, params);
    res.json(ordens);
});

app.get('/api/minhas-os/:id', authMiddleware, async (req, res) => {
    const os = await get('SELECT * FROM ordens_servico WHERE id = ? AND usuario_cpf_cnpj = ?',
        [Number(req.params.id), req.user.cpf_cnpj]);
    if (!os) {
        return res.status(404).json({ erro: 'OS nao encontrada' });
    }
    res.json(os);
});

// ═══════════════════════════════════════════════════════════════════════════
// ROTAS EXISTENTES (mantidas)
// ═══════════════════════════════════════════════════════════════════════════

// API: Listar produtos do catalogo Altimus (publica)
app.get('/api/produtos', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'data', 'produtos-altimus.json');
        const data = fs.readFileSync(filePath, 'utf-8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        res.status(500).json({ erro: 'Erro ao carregar catalogo de produtos' });
    }
});

// API: Solicitar cadastro de novo item
app.post('/api/solicitar-item', (req, res) => {
    try {
        const solicitacao = {
            ...req.body,
            dataSolicitacao: new Date().toISOString()
        };

        const filePath = path.join(__dirname, 'data', 'solicitacoes-itens.json');
        let solicitacoes = [];
        if (fs.existsSync(filePath)) {
            solicitacoes = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        solicitacoes.push(solicitacao);
        fs.writeFileSync(filePath, JSON.stringify(solicitacoes, null, 2), 'utf-8');

        res.json({ sucesso: true, mensagem: 'Solicitacao registrada com sucesso' });
    } catch (error) {
        console.error('Erro ao registrar solicitacao:', error);
        res.status(500).json({ erro: 'Erro ao registrar solicitacao' });
    }
});

// Helper: proximo numero de OS
async function proximoNumeroOS() {
    const row = await get('SELECT MAX(numero_os) as max_os FROM ordens_servico');
    const ultimo = row?.max_os || 0;
    return ultimo + 1;
}

// Auto-fix: renumerar OS duplicadas no startup
async function fixDuplicateNumbers() {
    const dupes = await all("SELECT numero_os, COUNT(*) as cnt FROM ordens_servico GROUP BY numero_os HAVING COUNT(*) > 1");
    if (dupes.length === 0) return;
    console.log(`[FIX] Encontradas ${dupes.length} numeracoes duplicadas, corrigindo...`);
    for (const d of dupes) {
        const rows = await all("SELECT id FROM ordens_servico WHERE numero_os = ? ORDER BY id ASC", [d.numero_os]);
        // Manter a primeira, renumerar as demais
        for (let i = 1; i < rows.length; i++) {
            const novoNum = await proximoNumeroOS();
            await run("UPDATE ordens_servico SET numero_os = ? WHERE id = ?", [novoNum, rows[i].id]);
            console.log(`[FIX] OS id=${rows[i].id}: ${d.numero_os} -> ${novoNum}`);
        }
    }
}

// API: Gerar PDF (agora tambem salva no banco)
app.post('/api/gerar-pdf', authOrAdminMiddleware, pdfLimiter, async (req, res) => {
    try {
        const dados = req.body;

        // Validar
        if (!dados.fornecedor) {
            return res.status(400).json({ erro: 'Fornecedor nao informado' });
        }

        // Gerar numero de OS
        const osNumero = await proximoNumeroOS();
        const osLabel = `OS-${String(osNumero).padStart(4, '0')}`;

        // Salvar no banco
        await run(`INSERT INTO ordens_servico (
            numero_os, usuario_cpf_cnpj, fornecedor, cpf_cnpj, placa, marca_modelo_ano,
            data_abertura, data_prevista, data_finalizacao, autorizado_por,
            responsavel, telefone, email, chave_pix, tipo_pix,
            observacoes, itens_json, valor_total, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Enviada')`, [
            osNumero,
            req.user.cpf_cnpj,
            dados.fornecedor,
            dados.cnpj || '',
            dados.placa || '',
            dados.marcaModeloAno || '',
            dados.dataAbertura || '',
            dados.dataPrevista || '',
            dados.dataFinalizacao || '',
            dados.autorizadoPor || '',
            dados.responsavel || '',
            dados.telefone || '',
            dados.email || '',
            dados.chavePix || '',
            dados.tipoPix || '',
            dados.observacoes || '',
            JSON.stringify(dados.itens || []),
            parseFloat(dados.totalValor || 0)
        ]);

        // Pegar ID da OS inserida
        const osRow = await get('SELECT id FROM ordens_servico WHERE numero_os = ?', [osNumero]);
        const osId = osRow ? osRow.id : null;

        // Salvar uploads vinculados
        if (dados.uploadedFiles && dados.uploadedFiles.length > 0 && osId) {
            for (const f of dados.uploadedFiles) {
                await run('INSERT INTO uploads (os_id, tipo, filename, original_name, mimetype, size) VALUES (?, ?, ?, ?, ?, ?)',
                    [osId, f.tipo, f.filename, f.original_name, f.mimetype, f.size]);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // PDF DESIGN — MODERNO, SÓBRIO, ELEGANTE
        // ═══════════════════════════════════════════════════════════
        
        const doc = new PDFDocument({ size: 'A4', margin: 0 });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'application/json');
            res.json({ osNumero, osLabel, pdf: pdfBuffer.toString('base64') });
        });

        const W = 595.28; // A4 width
        const H = 841.89; // A4 height
        const ML = 50;    // margin left
        const MR = 545;   // margin right
        const DARK = '#1A2332';
        const PRIMARY = '#0099CC';
        const LIGHT_BG = '#F8FAFB';
        const GRAY = '#6B7280';
        const BORDER = '#E5E7EB';

        function fmtMoeda(v) {
            const num = parseFloat(v) || 0;
            return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        function fmtQtd(v) {
            const num = parseFloat(v) || 0;
            return num % 1 === 0 ? num.toString() : num.toFixed(2).replace('.', ',');
        }

        // ── HEADER BAR ──
        doc.rect(0, 0, W, 100).fill(DARK);
        doc.rect(0, 100, W, 4).fill(PRIMARY);
        
        // Logo circle
        doc.circle(80, 50, 22).fill('white');
        doc.fontSize(14).font('Helvetica-Bold').fillColor(PRIMARY).text('eD', 68, 42);
        
        // Company name
        doc.fontSize(22).font('Helvetica-Bold').fillColor('white').text('eDrive', 115, 32);
        doc.fontSize(9).font('Helvetica').fillColor('#94A3B8').text('SEMINOVOS', 117, 57);
        
        // OS Number (right side)
        doc.fontSize(9).font('Helvetica').fillColor('#94A3B8').text('ORDEM DE SERVIÇO', MR - 150, 28, { width: 150, align: 'right' });
        doc.fontSize(20).font('Helvetica-Bold').fillColor('white').text(osLabel, MR - 150, 44, { width: 150, align: 'right' });
        doc.fontSize(8).font('Helvetica').fillColor('#94A3B8')
            .text(new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }), MR - 150, 70, { width: 150, align: 'right' });

        // ── BODY ──
        let y = 124;

        // Helper: Section title
        function sectionTitle(title, yPos) {
            doc.fontSize(8).font('Helvetica-Bold').fillColor(PRIMARY).text(title.toUpperCase(), ML, yPos);
            doc.moveTo(ML, yPos + 13).lineTo(MR, yPos + 13).lineWidth(0.5).stroke(BORDER);
            return yPos + 20;
        }

        // Helper: Info row (label + value)
        function infoRow(label, value, x, yPos, width) {
            doc.fontSize(7).font('Helvetica').fillColor(GRAY).text(label, x, yPos);
            doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK).text(value || '—', x, yPos + 10, { width: width || 200 });
            return yPos;
        }

        // ── FORNECEDOR ──
        y = sectionTitle('Fornecedor', y);
        infoRow('Razão Social', dados.fornecedor, ML, y, 240);
        infoRow('CPF/CNPJ', dados.cnpj, 300, y, 120);
        infoRow('Placa', dados.placa, 430, y, 120);
        y += 30;
        infoRow('Veículo', dados.marcaModeloAno, ML, y, 240);
        infoRow('Responsável', dados.responsavel, 300, y, 120);
        infoRow('Telefone', dados.telefone, 430, y, 120);
        y += 40;

        // ── CRONOGRAMA + PAGAMENTO (side by side) ──
        y = sectionTitle('Cronograma & Pagamento', y);
        infoRow('Abertura', formatarData(dados.dataAbertura), ML, y, 100);
        infoRow('Prevista', formatarData(dados.dataPrevista), 160, y, 100);
        infoRow('Finalização', dados.dataFinalizacao ? formatarData(dados.dataFinalizacao) : 'A definir', 270, y, 100);
        infoRow('Chave PIX', dados.chavePix || '—', 380, y, 100);
        infoRow('Tipo', dados.tipoPix || '—', 490, y, 60);
        y += 38;

        // ── AUTORIZAÇÃO ──
        if (dados.autorizadoPor) {
            infoRow('Autorizado por', dados.autorizadoPor, ML, y, 200);
            y += 30;
        }

        // ── TABELA DE ITENS ──
        y = sectionTitle('Itens / Serviços', y);
        
        // Table header
        const TH = y;
        doc.rect(ML, TH, MR - ML, 22).fill(DARK);
        doc.fontSize(7).font('Helvetica-Bold').fillColor('white');
        doc.text('#', ML + 8, TH + 7, { width: 20 });
        doc.text('PRODUTO / SERVIÇO', ML + 30, TH + 7, { width: 220 });
        doc.text('GARANTIA', 280, TH + 7, { width: 60 });
        doc.text('QTD', 340, TH + 7, { width: 50, align: 'center' });
        doc.text('VALOR UNIT.', 395, TH + 7, { width: 70, align: 'right' });
        doc.text('VALOR TOTAL', 470, TH + 7, { width: 75, align: 'right' });
        
        y = TH + 22;

        // Table rows
        if (dados.itens && dados.itens.length > 0) {
            dados.itens.forEach((item, i) => {
                if (y > 720) { doc.addPage(); y = 50; }
                
                // Alternating row bg
                if (i % 2 === 0) {
                    doc.rect(ML, y, MR - ML, 24).fill(LIGHT_BG);
                }
                
                const valorUnit = parseFloat(item.valorUnit || item.valorUnitario || 0);
                const qtd = parseFloat(item.qtd || item.quantidade || 0);
                const valorTotal = parseFloat(item.valorTotal || (qtd * valorUnit) || 0);
                
                doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(String(i + 1), ML + 8, y + 7, { width: 20 });
                doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK).text(item.produto || '', ML + 30, y + 7, { width: 220 });
                doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(item.garantia || 'Não', 280, y + 7, { width: 60 });
                doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK).text(fmtQtd(qtd), 340, y + 7, { width: 50, align: 'center' });
                doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(fmtMoeda(valorUnit), 395, y + 7, { width: 70, align: 'right' });
                doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK).text(fmtMoeda(valorTotal), 470, y + 7, { width: 75, align: 'right' });
                
                y += 24;
            });
        }

        // Bottom border
        doc.moveTo(ML, y).lineTo(MR, y).lineWidth(1).stroke(DARK);
        y += 8;

        // ── TOTAIS ──
        // Quantidade
        doc.fontSize(8).font('Helvetica').fillColor(GRAY)
            .text(`${dados.itens ? dados.itens.length : 0} ite${dados.itens && dados.itens.length !== 1 ? 'ns' : 'm'}`, ML, y + 2);
        
        // Total box
        const totalBoxW = 200;
        const totalBoxX = MR - totalBoxW;
        doc.rect(totalBoxX, y, totalBoxW, 36).fill(DARK);
        doc.fontSize(8).font('Helvetica').fillColor('#94A3B8').text('VALOR TOTAL', totalBoxX + 15, y + 6);
        doc.fontSize(16).font('Helvetica-Bold').fillColor('white').text(fmtMoeda(dados.totalValor), totalBoxX + 15, y + 17, { width: totalBoxW - 30, align: 'right' });
        y += 50;

        // ── OBSERVAÇÕES ──
        if (dados.observacoes) {
            y = sectionTitle('Observações', y);
            doc.fontSize(9).font('Helvetica').fillColor(DARK).text(dados.observacoes, ML, y, { width: MR - ML });
            y = doc.y + 20;
        }

        // ── ASSINATURAS ──
        if (y < 680) {
            y = Math.max(y + 40, 680);
            const sigW = 200;
            // Fornecedor
            doc.moveTo(ML, y).lineTo(ML + sigW, y).lineWidth(0.5).stroke(BORDER);
            doc.fontSize(7).font('Helvetica').fillColor(GRAY).text('Fornecedor', ML, y + 4, { width: sigW, align: 'center' });
            // eDrive
            doc.moveTo(MR - sigW, y).lineTo(MR, y).lineWidth(0.5).stroke(BORDER);
            doc.fontSize(7).font('Helvetica').fillColor(GRAY).text('eDrive Seminovos', MR - sigW, y + 4, { width: sigW, align: 'center' });
        }

        // ── FOOTER ──
        doc.rect(0, H - 30, W, 30).fill(LIGHT_BG);
        doc.fontSize(7).font('Helvetica').fillColor(GRAY)
            .text(`${osLabel} • Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} • eDrive Seminovos`, ML, H - 20, { width: MR - ML, align: 'center' });

        doc.end();

    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        res.status(500).json({ erro: 'Erro ao gerar PDF' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatarData(data) {
    if (!data) return 'N/A';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ERRO HANDLER MULTER
// ═══════════════════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ erro: 'Arquivo muito grande. Limite: 5MB' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ erro: 'Maximo de 8 arquivos por upload' });
        }
        return res.status(400).json({ erro: err.message });
    }
    if (err) {
        return res.status(400).json({ erro: err.message });
    }
    next();
});

// ═══════════════════════════════════════════════════════════════════════════
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════

async function startServer() {
    try {
        await initDatabase();
        await fixDuplicateNumbers();
        
        // Limpar flag de reset se existir
        await run("DELETE FROM ordens_servico WHERE numero_os = -999").catch(() => {});

        app.listen(PORT, () => {
            console.log('\n' + '='.repeat(70));
            console.log('              eDrive OS App INICIADO (Fase 2)');
            console.log('='.repeat(70));
            console.log(`\nServidor rodando em: http://localhost:${PORT}`);
            console.log(`Acesse: http://localhost:${PORT}`);
            console.log('\n' + '='.repeat(70) + '\n');
        });
    } catch (error) {
        console.error('Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();

// Tratar erros
process.on('unhandledRejection', (error) => {
    console.error('Erro nao tratado:', error);
});

// TEMP: Reset endpoint (remover depois)
app.post('/api/admin/reset-all-os', adminMiddleware, async (req, res) => {
    try {
        await run("DELETE FROM itens_os");
        await run("DELETE FROM ordens_servico");
        res.json({ sucesso: true, msg: "Todas OS deletadas" });
    } catch(e) {
        res.status(500).json({ erro: e.message });
    }
});
