// eDrive OS App - Frontend Logic
// Carrega lista de fornecedores e gerencia formulário

let itemCount = 0;
const suppliers = [];

// Carregar fornecedores ao iniciar
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📱 Iniciando eDrive OS App...');
    
    // Definir data de hoje
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dataAbertura').value = today;
    document.getElementById('dataPrevista').value = today;

    // Fornecedor: campo livre (sem lista pré-carregada)

    // Adicionar primeiro item vazio
    adicionarItem();

});

// Fornecedor: campo livre (sem lista pré-carregada por segurança LGPD)

// Adicionar nova linha de item
function adicionarItem() {
    itemCount++;
    const tbody = document.getElementById('itemsBody');
    
    const tr = document.createElement('tr');
    tr.id = `item-${itemCount}`;
    tr.innerHTML = `
        <td>
            <input type="text" class="produto" placeholder="Nome do produto/serviço" required>
        </td>
        <td>
            <input type="number" class="qtd" min="1" value="1" step="0.01" required onchange="calcularTotais()">
        </td>
        <td>
            <input type="number" class="valor-unit" min="0" value="0.00" step="0.01" required onchange="calcularTotais()" placeholder="0.00">
        </td>
        <td>
            <input type="number" class="valor-total" readonly style="background: #f5f5f5; font-weight: bold;">
        </td>
        <td>
            <select class="garantia">
                <option value="SIM">SIM</option>
                <option value="NÃO">NÃO</option>
            </select>
        </td>
        <td>
            <button type="button" class="btn-remove" onclick="removerItem(${itemCount})">Remover</button>
        </td>
    `;
    
    tbody.appendChild(tr);
    calcularTotais();
}

// Remover linha de item
function removerItem(id) {
    const item = document.getElementById(`item-${id}`);
    if (item && document.querySelectorAll('#itemsBody tr').length > 1) {
        item.remove();
        calcularTotais();
    } else {
        mostrarErro('Você precisa de pelo menos 1 item');
    }
}

// Calcular totais
function calcularTotais() {
    let totalQtd = 0;
    let totalGeral = 0;

    document.querySelectorAll('#itemsBody tr').forEach(tr => {
        const qtd = parseFloat(tr.querySelector('.qtd').value) || 0;
        const valorUnit = parseFloat(tr.querySelector('.valor-unit').value) || 0;
        const valorTotal = qtd * valorUnit;

        tr.querySelector('.valor-total').value = valorTotal.toFixed(2);

        totalQtd += qtd;
        totalGeral += valorTotal;
    });

    document.getElementById('totalQtd').textContent = totalQtd.toFixed(2);
    document.getElementById('subtotal').textContent = formatarMoeda(totalGeral);
    document.getElementById('total').textContent = formatarMoeda(totalGeral);
}

// Formatar moeda
function formatarMoeda(valor) {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Limpar formulário
function limparForm() {
    if (confirm('Deseja realmente limpar o formulário?')) {
        document.getElementById('osForm').reset();
        document.getElementById('itemsBody').innerHTML = '';
        itemCount = 0;
        adicionarItem();
        
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('dataAbertura').value = today;
        document.getElementById('dataPrevista').value = today;
    }
}

// Gerar PDF
async function gerarPDF() {
    if (!validarFormulario()) return;

    mostrarLoading(true);

    try {
        const dados = coletarDados();
        
        const response = await fetch('/api/gerar-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });

        if (!response.ok) throw new Error('Erro ao gerar PDF');

        // Baixar PDF
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `OS_${dados.fornecedor}_${Date.now()}.pdf`;
        a.click();

        mostrarSucesso('PDF gerado com sucesso!');
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarErro('Erro ao gerar PDF');
    } finally {
        mostrarLoading(false);
    }
}

// Enviar para Autos 360
async function enviarParaAutos360() {
    if (!validarFormulario()) return;

    mostrarLoading(true);

    try {
        const dados = coletarDados();
        
        const response = await fetch('/api/enviar-autos360', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });

        if (!response.ok) throw new Error('Erro ao enviar');

        const resultado = await response.json();
        
        mostrarSucesso(`✅ OS criada com sucesso! ID: ${resultado.osId}`);
        
        // Limpar após sucesso
        setTimeout(() => {
            limparForm();
        }, 2000);

    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarErro('Erro ao enviar para Autos 360');
    } finally {
        mostrarLoading(false);
    }
}

// Coletar dados do formulário
function coletarDados() {
    const itens = [];

    document.querySelectorAll('#itemsBody tr').forEach(tr => {
        itens.push({
            produto: tr.querySelector('.produto').value,
            qtd: parseFloat(tr.querySelector('.qtd').value),
            valorUnit: parseFloat(tr.querySelector('.valor-unit').value),
            valorTotal: parseFloat(tr.querySelector('.valor-total').value),
            garantia: tr.querySelector('.garantia').value
        });
    });

    return {
        fornecedor: document.getElementById('fornecedor').value,
        cnpj: document.getElementById('cnpj').value,
        dataAbertura: document.getElementById('dataAbertura').value,
        dataPrevista: document.getElementById('dataPrevista').value,
        dataFinalizacao: document.getElementById('dataFinalizacao').value,
        responsavel: document.getElementById('responsavel').value,
        telefone: document.getElementById('telefone').value,
        email: document.getElementById('email').value,
        itens: itens,
        observacoes: document.getElementById('observacoes').value,
        totalQtd: parseFloat(document.getElementById('totalQtd').textContent),
        totalValor: parseFloat(document.getElementById('total').textContent.replace('R$ ', '').replace(',', '.'))
    };
}

// Validar formulário
function validarFormulario() {
    if (!document.getElementById('fornecedor').value) {
        mostrarErro('Selecione um fornecedor');
        return false;
    }

    if (!document.getElementById('dataAbertura').value) {
        mostrarErro('Informe a data de abertura');
        return false;
    }

    const itens = document.querySelectorAll('#itemsBody tr');
    if (itens.length === 0) {
        mostrarErro('Adicione pelo menos 1 item');
        return false;
    }

    let temItemValido = false;
    itens.forEach(tr => {
        const produto = tr.querySelector('.produto').value;
        const qtd = parseFloat(tr.querySelector('.qtd').value);
        const valor = parseFloat(tr.querySelector('.valor-unit').value);

        if (produto && qtd > 0 && valor > 0) {
            temItemValido = true;
        }
    });

    if (!temItemValido) {
        mostrarErro('Todos os itens precisam ter produto, quantidade e valor');
        return false;
    }

    return true;
}

// UI Helpers
function mostrarLoading(show) {
    document.getElementById('loading').classList.toggle('active', show);
}

function mostrarSucesso(msg) {
    alert('✅ ' + msg);
}

function mostrarErro(msg) {
    alert('❌ ' + msg);
}
