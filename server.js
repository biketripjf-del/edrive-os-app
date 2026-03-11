/**
 * eDrive OS App - Backend Server
 * Servidor Node.js + Express para geração de OS
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════════════════
// ROTAS
// ═══════════════════════════════════════════════════════════════════════════

// Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Listar produtos do catálogo Altimus
app.get('/api/produtos', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'data', 'produtos-altimus.json');
        const data = fs.readFileSync(filePath, 'utf-8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        res.status(500).json({ erro: 'Erro ao carregar catálogo de produtos' });
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

        res.json({ sucesso: true, mensagem: 'Solicitação registrada com sucesso' });
    } catch (error) {
        console.error('Erro ao registrar solicitação:', error);
        res.status(500).json({ erro: 'Erro ao registrar solicitação' });
    }
});

// Helper: próximo número de OS
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

// API: Gerar PDF
app.post('/api/gerar-pdf', (req, res) => {
    try {
        const dados = req.body;

        // Validar
        if (!dados.fornecedor) {
            return res.status(400).json({ erro: 'Fornecedor não informado' });
        }

        // Gerar número de OS
        const osNumero = proximoNumeroOS();
        const osLabel = `OS-${String(osNumero).padStart(4, '0')}`;

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
            .text('ORDEM DE SERVIÇO', { align: 'center' });
        doc.fontSize(16)
            .font('Helvetica-Bold')
            .fillColor('#0099CC')
            .text(`Nº ${osLabel}`, { align: 'center' });
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
        doc.text(`Fornecedor / Razão Social: ${dados.fornecedor}`);
        doc.text(`CPF/CNPJ: ${dados.cnpj || 'N/A'}`);
        doc.text(`Placa do Veículo: ${dados.placa || 'N/A'}`);
        doc.text(`Marca/Modelo/Ano: ${dados.marcaModeloAno || 'N/A'}`);
        doc.moveDown(0.5);

        // ── Contato ──
        doc.fontSize(11).font('Helvetica-Bold').text('CONTATO:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Responsável: ${dados.responsavel || 'N/A'}`);
        doc.text(`Telefone: ${dados.telefone || 'N/A'}`);
        doc.text(`Email: ${dados.email || 'N/A'}`);
        doc.moveDown(0.5);

        // ── Cronograma ──
        doc.fontSize(11).font('Helvetica-Bold').text('CRONOGRAMA:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Data de Abertura: ${formatarData(dados.dataAbertura)}`);
        doc.text(`Data Prevista: ${formatarData(dados.dataPrevista)}`);
        doc.text(`Data de Finalização: ${dados.dataFinalizacao ? formatarData(dados.dataFinalizacao) : 'A definir'}`);
        doc.moveDown(0.5);

        // ── Pagamento ──
        doc.fontSize(11).font('Helvetica-Bold').text('PAGAMENTO:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Chave PIX: ${dados.chavePix || 'N/A'}`);
        doc.text(`Tipo PIX: ${dados.tipoPix || 'N/A'}`);
        doc.moveDown(0.5);

        // ── Autorização ──
        doc.fontSize(11).font('Helvetica-Bold').text('AUTORIZAÇÃO:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Autorizado por: ${dados.autorizadoPor || 'N/A'}`);
        doc.moveDown(1);

        // ── Tabela de itens ──
        doc.fontSize(11).font('Helvetica-Bold').text('ITENS/SERVIÇOS:', { underline: true });
        doc.moveDown(0.3);

        // Cabeçalho da tabela
        const tableTop = doc.y;
        const col1 = 45, col2 = 280, col3 = 325, col4 = 390, col5 = 460, col6 = 520;

        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Produto/Serviço', col1, tableTop, { width: 230 });
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
                doc.text(item.garantia || 'Não', col2, y);
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

        // ── Observações ──
        if (dados.observacoes) {
            doc.moveDown(1);
            doc.fontSize(11).font('Helvetica-Bold').text('OBSERVAÇÕES:', { underline: true });
            doc.fontSize(10).font('Helvetica').text(dados.observacoes, { align: 'left' });
        }

        // ── Rodapé ──
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
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(70));
    console.log('              eDrive OS App INICIADO');
    console.log('='.repeat(70));
    console.log(`\nServidor rodando em: http://localhost:${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}`);
    console.log('\n' + '='.repeat(70) + '\n');
});

// Tratar erros
process.on('unhandledRejection', (error) => {
    console.error('Erro não tratado:', error);
});
