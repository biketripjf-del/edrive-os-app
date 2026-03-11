# 🎨 eDrive OS Generator

**Sistema web profissional para geração de Ordem de Serviço com PDF automático**

---

## ✨ Features

✅ **Interface linda** - Design moderno com cores da eDrive  
✅ **6.011 fornecedores** - Carregados do Altimus ERP  
✅ **Tabela dinâmica** - Adicione/remova itens em tempo real  
✅ **Cálculo automático** - Totais calculados automaticamente  
✅ **Gerador de PDF** - Relatório profissional  
✅ **Integração Autos 360** - Envio automático de OS  
✅ **Responsivo** - Funciona em desktop e mobile  

---

## 🚀 Como Usar

### 1. Iniciar o servidor

```bash
cd /home/claude/.openclaw/workspace/edrive-os-app
node server.js
```

Ou com PM2 (recomendado):

```bash
npm install -g pm2
pm2 start server.js --name "edrive-os"
pm2 save
```

### 2. Acessar a aplicação

Abra no navegador: **http://localhost:3000**

### 3. Preencher o formulário

1. **Selecione fornecedor** → CNPJ preenchido automaticamente
2. **Configure datas** (Abertura, Prevista, Finalização)
3. **Adicione itens** → Produto, QTD, Valor Unit., Garantia
4. **Clique em:**
   - 📄 **Gerar PDF** → Baixa relatório
   - 📤 **Enviar Autos 360** → Cria OS automaticamente

---

## 📁 Estrutura

```
edrive-os-app/
├── public/
│   ├── index.html          # Interface (HTML + CSS)
│   └── js/
│       └── app.js          # Lógica do frontend
├── server.js               # Backend (Express + PDF)
├── package.json            # Dependências
└── README.md               # Este arquivo
```

---

## ⚙️ Dependências

```json
{
  "express": "Servidor web",
  "pdfkit": "Gerador de PDF",
  "csv-parse": "Lê lista de fornecedores"
}
```

Instaladas com: `npm install`

---

## 🎯 Próximos Passos

### MVP Atual
- ✅ Interface web pronta
- ✅ Carregamento de fornecedores
- ✅ Geração de PDF
- ✅ Cálculos automáticos

### A Implementar
- [ ] Integração real com Autos 360
- [ ] Salvar dados no Google Sheets
- [ ] Autenticação de usuários
- [ ] Histórico de OS geradas
- [ ] Dashboard de relatórios

---

## 📊 Dados

**Arquivo de fornecedores:**  
`/home/claude/.openclaw/workspace/suppliers/suppliers-cleaned.csv`

**Campos:**
- NOME (6.011 registros)
- CPF/CNPJ
- TIPO (PF/PJ)
- CATEGORIA

---

## 🔧 API Endpoints

### GET `/api/fornecedores`
Retorna lista de fornecedores (primeiros 1000)

**Resposta:**
```json
[
  {
    "nome": "FORNECEDOR XYZ",
    "cnpj": "00.000.000/0000-00"
  }
]
```

### POST `/api/gerar-pdf`
Gera PDF da OS

**Payload:**
```json
{
  "fornecedor": "FORNECEDOR XYZ",
  "cnpj": "00.000.000/0000-00",
  "dataAbertura": "2026-03-10",
  "dataPrevista": "2026-03-15",
  "dataFinalizacao": "2026-03-20",
  "responsavel": "João Silva",
  "telefone": "(31) 98888-8888",
  "email": "joao@example.com",
  "itens": [
    {
      "produto": "SERVIÇO MECÂNICO",
      "qtd": 1,
      "valorUnit": 150.00,
      "valorTotal": 150.00,
      "garantia": "SIM"
    }
  ],
  "observacoes": "Qualquer observação",
  "totalQtd": 1,
  "totalValor": 150.00
}
```

**Resposta:** PDF (binary stream)

### POST `/api/enviar-autos360`
Envia OS para Autos 360

**Payload:** (mesmo de `/api/gerar-pdf`)

**Resposta:**
```json
{
  "sucesso": true,
  "osId": "OS-1678474800000",
  "mensagem": "OS criada com sucesso: OS-1678474800000"
}
```

---

## 🎨 Customização

### Cores
Arquivo: `public/index.html` (linhas ~18-27)

```css
:root {
  --primary: #0099CC;        /* Azul principal */
  --primary-dark: #003A70;   /* Azul escuro */
  --primary-light: #00B4D8;  /* Azul claro */
}
```

### Campos
Edite `public/index.html` para adicionar/remover campos

### PDF Template
Edite `server.js` função `app.post('/api/gerar-pdf')` para customizar layout

---

## 🐛 Troubleshooting

**Erro: "fornecedores não carregam"**  
→ Verifique se o arquivo CSV existe em:  
`/home/claude/.openclaw/workspace/suppliers/suppliers-cleaned.csv`

**Porta 3000 já em uso**  
```bash
PORT=3001 node server.js
```

**PDF não funciona**  
→ Instale pdfkit:  
```bash
npm install pdfkit
```

---

## 📞 Suporte

**Logs:**
```bash
tail -f /tmp/edrive-os-app.log
```

**Processos:**
```bash
pm2 status
pm2 logs edrive-os
```

---

**Desenvolvido por Aurora 🚀**  
*eDrive - Seminovos com Inteligência*
