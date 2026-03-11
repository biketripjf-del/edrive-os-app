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
    max: 5,
    message: { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

// Rate limiting PDF
const pdfLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { erro: 'Limite de geracao de PDF atingido. Tente novamente em 1 hora.' }
});

// Upload config
const uploadsDir = path.join(__dirname, 'data', 'uploads');
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
    const token = req.cookies.auth_token;
    if (!token) {
        return res.redirect('/login.html');
    }
    try {
        jwt.verify(token, JWT_SECRET);
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } catch (e) {
        res.redirect('/login.html');
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/solicitar-codigo', loginLimiter, (req, res) => {
    const { cpf_cnpj } = req.body;
    if (!cpf_cnpj) {
        return res.status(400).json({ erro: 'CPF/CNPJ obrigatorio' });
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const expira = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Upsert usuario
    const existing = get('SELECT id FROM usuarios WHERE cpf_cnpj = ?', [cpf_cnpj]);
    if (existing) {
        run('UPDATE usuarios SET codigo_verificacao = ?, codigo_expira = ? WHERE cpf_cnpj = ?',
            [codigo, expira, cpf_cnpj]);
    } else {
        run('INSERT INTO usuarios (cpf_cnpj, codigo_verificacao, codigo_expira) VALUES (?, ?, ?)',
            [cpf_cnpj, codigo, expira]);
    }

    // POR ENQUANTO: retorna codigo para testes
    res.json({
        sucesso: true,
        mensagem: 'Codigo enviado',
        codigo_teste: codigo
    });
});

app.post('/api/auth/verificar-codigo', loginLimiter, (req, res) => {
    const { cpf_cnpj, codigo } = req.body;
    if (!cpf_cnpj || !codigo) {
        return res.status(400).json({ erro: 'CPF/CNPJ e codigo obrigatorios' });
    }

    const user = get('SELECT * FROM usuarios WHERE cpf_cnpj = ?', [cpf_cnpj]);
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
    run('UPDATE usuarios SET codigo_verificacao = NULL, codigo_expira = NULL, token_sessao = ? WHERE id = ?',
        [token, user.id]);

    res.cookie('auth_token', token, {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    });

    res.json({ sucesso: true, cpf_cnpj: user.cpf_cnpj });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    const user = get('SELECT id, cpf_cnpj, nome, telefone, email FROM usuarios WHERE id = ?', [req.user.id]);
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
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/login', loginLimiter, (req, res) => {
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

app.get('/api/admin/dashboard', adminMiddleware, (req, res) => {
    const total = get('SELECT COUNT(*) as c FROM ordens_servico')?.c || 0;
    const pendentes = get("SELECT COUNT(*) as c FROM ordens_servico WHERE status = 'Enviada'")?.c || 0;
    const aprovadas = get("SELECT COUNT(*) as c FROM ordens_servico WHERE status = 'Aprovada'")?.c || 0;
    const rejeitadas = get("SELECT COUNT(*) as c FROM ordens_servico WHERE status = 'Rejeitada'")?.c || 0;

    res.json({ total, pendentes, aprovadas, rejeitadas });
});

app.get('/api/admin/ordens', adminMiddleware, (req, res) => {
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

    const ordens = all(sql, params);
    res.json(ordens);
});

app.get('/api/admin/os/:id', adminMiddleware, (req, res) => {
    const os = get('SELECT * FROM ordens_servico WHERE id = ?', [Number(req.params.id)]);
    if (!os) {
        return res.status(404).json({ erro: 'OS nao encontrada' });
    }

    // Buscar uploads
    const uploads = all('SELECT * FROM uploads WHERE os_id = ?', [os.id]);
    os.uploads = uploads;

    res.json(os);
});

app.post('/api/admin/aprovar/:id', adminMiddleware, (req, res) => {
    const os = get('SELECT * FROM ordens_servico WHERE id = ?', [Number(req.params.id)]);
    if (!os) {
        return res.status(404).json({ erro: 'OS nao encontrada' });
    }
    if (os.status !== 'Enviada') {
        return res.status(400).json({ erro: 'OS ja foi processada' });
    }

    run("UPDATE ordens_servico SET status = 'Aprovada', aprovado_por = 'Admin', aprovado_em = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [os.id]);

    res.json({ sucesso: true });
});

app.post('/api/admin/rejeitar/:id', adminMiddleware, (req, res) => {
    const os = get('SELECT * FROM ordens_servico WHERE id = ?', [Number(req.params.id)]);
    if (!os) {
        return res.status(404).json({ erro: 'OS nao encontrada' });
    }
    if (os.status !== 'Enviada') {
        return res.status(400).json({ erro: 'OS ja foi processada' });
    }

    const { motivo } = req.body;
    if (!motivo) {
        return res.status(400).json({ erro: 'Motivo da rejeicao obrigatorio' });
    }

    run("UPDATE ordens_servico SET status = 'Rejeitada', motivo_rejeicao = ?, aprovado_por = 'Admin', aprovado_em = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [motivo, os.id]);

    res.json({ sucesso: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/upload', authMiddleware, upload.array('files', 8), (req, res) => {
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

app.get('/api/minhas-os', authMiddleware, (req, res) => {
    const { status } = req.query;
    let sql = 'SELECT * FROM ordens_servico WHERE usuario_cpf_cnpj = ?';
    const params = [req.user.cpf_cnpj];

    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }

    sql += ' ORDER BY id DESC';
    const ordens = all(sql, params);
    res.json(ordens);
});

app.get('/api/minhas-os/:id', authMiddleware, (req, res) => {
    const os = get('SELECT * FROM ordens_servico WHERE id = ? AND usuario_cpf_cnpj = ?',
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
function proximoNumeroOS() {
    const filePath = path.join(__dirname, 'data', 'os-counter.json');
    let counter = { ultimo: 0 };
    if (fs.existsSync(filePath)) {
        counter = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    counter.ultimo += 1;
    fs.writeFileSync(filePath, JSON.stringify(counter, null, 2), 'utf-8');
    return counter.ultimo;
}

// API: Gerar PDF (agora tambem salva no banco)
app.post('/api/gerar-pdf', authMiddleware, pdfLimiter, (req, res) => {
    try {
        const dados = req.body;

        // Validar
        if (!dados.fornecedor) {
            return res.status(400).json({ erro: 'Fornecedor nao informado' });
        }

        // Gerar numero de OS
        const osNumero = proximoNumeroOS();
        const osLabel = `OS-${String(osNumero).padStart(4, '0')}`;

        // Salvar no banco
        run(`INSERT INTO ordens_servico (
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
        const osRow = get('SELECT id FROM ordens_servico WHERE numero_os = ?', [osNumero]);
        const osId = osRow ? osRow.id : null;

        // Salvar uploads vinculados
        if (dados.uploadedFiles && dados.uploadedFiles.length > 0 && osId) {
            dados.uploadedFiles.forEach(f => {
                run('INSERT INTO uploads (os_id, tipo, filename, original_name, mimetype, size) VALUES (?, ?, ?, ?, ?, ?)',
                    [osId, f.tipo, f.filename, f.original_name, f.mimetype, f.size]);
            });
        }

        // Criar PDF
        const doc = new PDFDocument({
            size: 'A4',
            margin: 40
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'application/json');
            res.json({
                osNumero: osNumero,
                osLabel: osLabel,
                pdf: pdfBuffer.toString('base64')
            });
        });

        // ── Header ──
        doc.fontSize(26)
            .font('Helvetica-Bold')
            .text('eDrive', { align: 'center' });
        doc.fontSize(14)
            .font('Helvetica')
            .text('ORDEM DE SERVICO', { align: 'center' });
        doc.fontSize(16)
            .font('Helvetica-Bold')
            .fillColor('#0099CC')
            .text(`N. ${osLabel}`, { align: 'center' });
        doc.fillColor('#333')
            .moveDown(0.5);

        // Linha separadora
        doc.moveTo(40, doc.y)
            .lineTo(555, doc.y)
            .stroke('#0099CC')
            .moveDown(1);

        // ── Dados do Fornecedor ──
        doc.fontSize(11).font('Helvetica-Bold').text('DADOS DO FORNECEDOR:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Fornecedor / Razao Social: ${dados.fornecedor}`);
        doc.text(`CPF/CNPJ: ${dados.cnpj || 'N/A'}`);
        doc.text(`Placa do Veiculo: ${dados.placa || 'N/A'}`);
        doc.text(`Marca/Modelo/Ano: ${dados.marcaModeloAno || 'N/A'}`);
        doc.moveDown(0.5);

        // ── Contato ──
        doc.fontSize(11).font('Helvetica-Bold').text('CONTATO:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Responsavel: ${dados.responsavel || 'N/A'}`);
        doc.text(`Telefone: ${dados.telefone || 'N/A'}`);
        doc.text(`Email: ${dados.email || 'N/A'}`);
        doc.moveDown(0.5);

        // ── Cronograma ──
        doc.fontSize(11).font('Helvetica-Bold').text('CRONOGRAMA:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Data de Abertura: ${formatarData(dados.dataAbertura)}`);
        doc.text(`Data Prevista: ${formatarData(dados.dataPrevista)}`);
        doc.text(`Data de Finalizacao: ${dados.dataFinalizacao ? formatarData(dados.dataFinalizacao) : 'A definir'}`);
        doc.moveDown(0.5);

        // ── Pagamento ──
        doc.fontSize(11).font('Helvetica-Bold').text('PAGAMENTO:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Chave PIX: ${dados.chavePix || 'N/A'}`);
        doc.text(`Tipo PIX: ${dados.tipoPix || 'N/A'}`);
        doc.moveDown(0.5);

        // ── Autorizacao ──
        doc.fontSize(11).font('Helvetica-Bold').text('AUTORIZACAO:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Autorizado por: ${dados.autorizadoPor || 'N/A'}`);
        doc.moveDown(1);

        // ── Tabela de itens ──
        doc.fontSize(11).font('Helvetica-Bold').text('ITENS/SERVICOS:', { underline: true });
        doc.moveDown(0.3);

        // Cabecalho da tabela
        const tableTop = doc.y;
        const col1 = 45, col2 = 280, col3 = 325, col4 = 390, col5 = 460, col6 = 520;

        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Produto/Servico', col1, tableTop, { width: 230 });
        doc.text('Garantia', col2, tableTop);
        doc.text('QTD', col3, tableTop);
        doc.text('Valor Unit.', col4, tableTop);
        doc.text('Valor Total', col5, tableTop);

        // Linha separadora
        doc.moveTo(col1 - 5, tableTop + 15)
            .lineTo(555, tableTop + 15)
            .stroke('#DDD')
            .fontSize(8)
            .font('Helvetica');

        let y = tableTop + 25;

        // Itens
        if (dados.itens && dados.itens.length > 0) {
            dados.itens.forEach(item => {
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }
                doc.text(item.produto || '', col1, y, { width: 230 });
                doc.text(item.garantia || 'Nao', col2, y);
                doc.text(String(parseFloat(item.qtd || 0).toFixed(2)), col3, y);
                doc.text(`R$ ${parseFloat(item.valorUnit || 0).toFixed(2)}`, col4, y);
                doc.text(`R$ ${parseFloat(item.valorTotal || 0).toFixed(2)}`, col5, y);
                y += 25;
            });
        }

        // Linha final
        doc.moveTo(col1 - 5, y)
            .lineTo(555, y)
            .stroke('#0099CC');
        y += 15;

        // ── Totais ──
        doc.fontSize(10).font('Helvetica');
        doc.text(`Quantidade Total: ${parseFloat(dados.totalQtd || 0).toFixed(2)} unid.`, col1, y);
        y += 20;
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#0099CC');
        doc.text(`VALOR TOTAL: R$ ${parseFloat(dados.totalValor || 0).toFixed(2)}`, col1, y);
        doc.fillColor('#333');

        // ── Observacoes ──
        if (dados.observacoes) {
            doc.moveDown(1);
            doc.fontSize(11).font('Helvetica-Bold').text('OBSERVACOES:', { underline: true });
            doc.fontSize(10).font('Helvetica').text(dados.observacoes, { align: 'left' });
        }

        // ── Rodape ──
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica').fillColor('#999');
        doc.text(`Gerado por eDrive OS Generator | ${osLabel}`, { align: 'center' });
        doc.text(`Data/Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, { align: 'center' });
        doc.fillColor('#333');

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
