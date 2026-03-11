/**
 * eDrive OS App - Backend Server
 * Servidor Node.js + Express para geração de OS
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const csv = require('csv-parse/sync');

const app = express();
const PORT = process.env.PORT || process.argv[2] || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════════════════
// DADOS - Carregar fornecedores
// ═══════════════════════════════════════════════════════════════════════════

let fornecedores = [];

function carregarFornecedores() {
    try {
        const csvPath = '/home/claude/.openclaw/workspace/suppliers/suppliers-cleaned.csv';
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const records = csv.parse(csvData, {
            columns: false,
            skip_empty_lines: true,
            delimiter: ';'
        });

        fornecedores = records.map(row => ({
            nome: row[0] ? row[0].trim() : '',
            cnpj: row[1] ? row[1].trim() : ''
        })).filter(f => f.nome && f.cnpj);

        console.log(`✅ ${fornecedores.length} fornecedores carregados`);
    } catch (error) {
        console.error('❌ Erro ao carregar fornecedores:', error.message);
        fornecedores = [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROTAS
// ═══════════════════════════════════════════════════════════════════════════

// Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Listar fornecedores
app.get('/api/fornecedores', (req, res) => {
    res.json(fornecedores.slice(0, 1000)); // Limitar para performance
});

// API: Gerar PDF
app.post('/api/gerar-pdf', (req, res) => {
    try {
        const dados = req.body;
        
        // Validar
        if (!dados.fornecedor) {
            return res.status(400).json({ erro: 'Fornecedor não informado' });
        }

        // Criar PDF
        const doc = new PDFDocument({
            size: 'A4',
            margin: 40
        });

        // Header
        doc.fontSize(24)
            .font('Helvetica-Bold')
            .text('eDrive', { align: 'center' })
            .fontSize(12)
            .font('Helvetica')
            .text('ORDEM DE SERVIÇO', { align: 'center' })
            .moveDown(0.5);

        // Linha separadora
        doc.moveTo(40, doc.y)
            .lineTo(555, doc.y)
            .stroke('#0099CC')
            .moveDown(1);

        // Dados gerais
        doc.fontSize(11).font('Helvetica-Bold').text('DADOS GERAIS:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Fornecedor: ${dados.fornecedor}`);
        doc.text(`CNPJ/CPF: ${dados.cnpj}`);
        doc.text(`Responsável: ${dados.responsavel || 'N/A'}`);
        doc.text(`Telefone: ${dados.telefone || 'N/A'}`);
        doc.text(`Email: ${dados.email || 'N/A'}`);
        doc.moveDown(0.5);

        // Cronograma
        doc.fontSize(11).font('Helvetica-Bold').text('CRONOGRAMA:', { underline: true });
        doc.fontSize(10).font('Helvetica');
        doc.text(`Data de Abertura: ${formatarData(dados.dataAbertura)}`);
        doc.text(`Data Prevista: ${formatarData(dados.dataPrevista)}`);
        doc.text(`Data de Finalização: ${dados.dataFinalizacao ? formatarData(dados.dataFinalizacao) : 'A definir'}`);
        doc.moveDown(1);

        // Tabela de itens
        doc.fontSize(11).font('Helvetica-Bold').text('ITENS/SERVIÇOS:', { underline: true });
        doc.moveDown(0.3);

        // Cabeçalho da tabela
        const tableTop = doc.y;
        const col1 = 50, col2 = 380, col3 = 440, col4 = 500;

        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Produto/Serviço', col1, tableTop);
        doc.text('QTD', col2, tableTop);
        doc.text('Valor Unit.', col3, tableTop);
        doc.text('Valor Total', col4, tableTop);

        // Linha separadora
        doc.moveTo(col1 - 10, tableTop + 15)
            .lineTo(555, tableTop + 15)
            .stroke('#DDD')
            .fontSize(9)
            .font('Helvetica');

        let y = tableTop + 25;

        // Itens
        dados.itens.forEach(item => {
            doc.text(item.produto, col1, y, { width: 320, height: 20 });
            doc.text(item.qtd.toFixed(2), col2, y);
            doc.text(`R$ ${item.valorUnit.toFixed(2)}`, col3, y);
            doc.text(`R$ ${item.valorTotal.toFixed(2)}`, col4, y);
            y += 25;

            if (y > 700) {
                doc.addPage();
                y = 50;
            }
        });

        // Linha final
        doc.moveTo(col1 - 10, y)
            .lineTo(555, y)
            .stroke('#0099CC')
            .moveDown(1);

        // Totais
        y = doc.y;
        doc.fontSize(10).font('Helvetica');
        doc.text(`Quantidade Total: ${dados.totalQtd.toFixed(2)} unid.`, col1, y);
        y += 20;
        doc.text(`VALOR TOTAL: R$ ${dados.totalValor.toFixed(2)}`, col1, y, { 
            bold: true, 
            fontSize: 12,
            color: '#0099CC'
        });

        // Observações
        if (dados.observacoes) {
            doc.moveDown(1);
            doc.fontSize(11).font('Helvetica-Bold').text('OBSERVAÇÕES:', { underline: true });
            doc.fontSize(10).font('Helvetica').text(dados.observacoes, { align: 'left' });
        }

        // Rodapé
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica').text('Gerado por eDrive OS Generator', { align: 'center', color: '#999' });
        doc.text(`Data: ${new Date().toLocaleString('pt-BR')}`, { align: 'center', color: '#999' });

        // Enviar PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=OS_${Date.now()}.pdf`);
        doc.pipe(res);
        doc.end();

    } catch (error) {
        console.error('❌ Erro ao gerar PDF:', error);
        res.status(500).json({ erro: 'Erro ao gerar PDF' });
    }
});

// API: Enviar para Autos 360
app.post('/api/enviar-autos360', async (req, res) => {
    try {
        const dados = req.body;

        // Aqui você integraria com Autos 360
        // Por enquanto, apenas simular sucesso

        console.log(`📤 Enviando OS para Autos 360: ${dados.fornecedor}`);

        // Simular criação de OS
        const osId = `OS-${Date.now()}`;

        res.json({
            sucesso: true,
            osId: osId,
            mensagem: `OS criada com sucesso: ${osId}`
        });

    } catch (error) {
        console.error('❌ Erro ao enviar:', error);
        res.status(500).json({ erro: 'Erro ao enviar para Autos 360' });
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
    console.log('              ✅ eDrive OS App INICIADO');
    console.log('='.repeat(70));
    console.log(`\n🌐 Servidor rodando em: http://localhost:${PORT}`);
    console.log(`📍 Acesse: http://localhost:${PORT}`);
    
    // Carregar fornecedores
    carregarFornecedores();
    
    console.log('\n' + '='.repeat(70) + '\n');
});

// Tratar erros
process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado:', error);
});
