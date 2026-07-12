# Portal de Editais e Chamamentos - Secretaria Municipal de Turismo

Portal web dinâmico para divulgação de inscrições, chamamentos públicos e editais da Secretaria Municipal de Turismo, composto por uma interface interativa no frontend e integração de banco de dados por meio do Google Sheets e Google Apps Script.

---

## 🛠️ Especificações Técnicas

O projeto foi construído utilizando a seguinte arquitetura:

- **Frontend (`index.html`)**:
  - Estrutura semântica em HTML5.
  - Estilização moderna e responsiva utilizando **Vanilla CSS** com sistema de cores personalizado, cards com efeito *glassmorphism*, bordas dinâmicas, tipografia do Google Fonts (Inter) e design preparado para acessibilidade.
  - Lógica interativa em **JavaScript (ES6)** nativo, incluindo gerenciamento de estado local, navegação de carrossel de destaques ("Últimas Atualizações"), acordeões de editais e busca/filtragem de registros.
- **Backend / Banco de Dados (`codigo.gs`)**:
  - **Google Apps Script (GAS)** atuando como a API do sistema.
  - Comunicação bidirecional via `google.script.run` entre frontend e backend.
  - Armazenamento em planilha Google Sheets contendo as seguintes abas:
    - `Editais`: Contém as linhas de documentos de editais.
    - `Config`: Parâmetros de layout e informações da prefeitura.
    - `Usuarios`: Lista de operadores autorizados com senhas em hash SHA-256.
    - `Logs`: Histórico e logs de auditoria de acessos e modificações.

---

## 📋 Regras de Negócio

### 1. Transição Automática de Status
Os status dos editais mudam automaticamente com base em duas datas fundamentais:
- **Prazo Final de Inscrições (`prazoFinal`)**: O limite máximo para que as pessoas se inscrevam.
- **Vigência do Edital (`vigencia`)**: A duração total do edital, desde a abertura até o encerramento das suas atividades/etapas de seleção.

**Lógica de transição automática:**
1. **Manual Override**: Se o status estiver configurado manualmente como **"Suspenso"** ou **"Concluído"**, essa seleção manual tem prioridade máxima.
2. **Concluído**: Se a data atual for **posterior** à data/hora de **Vigência do Edital**, o status do edital é alterado automaticamente para **"Concluído"**.
3. **Em Andamento**: Se a data atual for **posterior** à data/hora de **Prazo Final de Inscrições** (mas anterior à Vigência), o status do edital passa automaticamente de **"Aberto"** para **"Em Andamento"** (Fase de Seleção).
4. **Aberto**: Caso nenhuma das datas tenha expirado, o edital permanece com seu status original (normalmente **"Aberto"**).

### 2. Propagação de Atributos do Evento
Como um único evento (ex: "Festival do Camarão") pode conter múltiplos documentos anexados (ex: Edital, Ficha de Inscrição, Retificação, etc.), as propriedades globais do evento devem ser idênticas para todos os seus documentos.
- Ao atualizar o **Status**, **Prazo Final de Inscrições** ou **Vigência** em qualquer documento de um evento, essa modificação é automaticamente propagada a todas as outras linhas correspondentes ao mesmo evento na planilha, mantendo a integridade dos dados.

### 3. Exibição de Destaques / Últimas Atualizações
O portal possui um carrossel de "Últimas Atualizações" no topo. Um edital entra nessa seção se:
1. Estiver configurado como destaque (`destaque = "SIM"`).
2. Estiver dentro da janela ativa de **30 dias**:
   - Caso possua **Prazo Final de Inscrições**, o destaque expira exatamente **30 dias após esse prazo**.
   - Caso não possua prazo de inscrições, o destaque expira **30 dias após a data de publicação**.

### 4. Controle de Acesso e Segurança
- O usuário master inicial é **`matheus`** com a senha padrão provisória **`turismo2026`** (com privilégios de `ADMIN`).
- O sistema obriga a troca de senha no primeiro login de qualquer usuário com status `PENDENTE`.
- Senhas são convertidas em hash SHA-256 no cliente/servidor antes de serem armazenadas para garantir que nenhuma senha trafegue ou seja gravada em texto puro.
- Todas as operações administrativas relevantes (Criação, Edição, Exclusão de Editais ou Usuários, Login) geram logs automáticos com timestamp e identificação do usuário na aba `Logs` de auditoria.

---

## 💾 Estrutura do Banco de Dados (Google Sheets)

### Aba: `Editais`
| Coluna | Nome | Descrição |
| :---: | :--- | :--- |
| **A** | ID | Identificador único (`ED-` + timestamp) |
| **B** | Ano | Ano de vigência |
| **C** | Tema/Categoria | Categoria (ex: Turismo, Eventos, Licitações) |
| **D** | Evento/Chamamento | Nome completo do chamamento público |
| **E** | Descrição do Evento | Detalhamento sobre o objetivo do edital |
| **F** | Status do Evento | Status atual (Aberto, Em Andamento, Concluído, Suspenso) |
| **G** | Título do Documento | Título do documento específico (ex: Retificação 01) |
| **H** | Link do Documento | URL do arquivo ou formulário |
| **I** | Data de Publicação | Data de criação do registro (`dd/MM/yyyy`) |
| **J** | Destaque | Indicador se vai para o carrossel (`SIM` ou `NÃO`) |
| **K** | Ordem | Ordem de exibição dos documentos dentro do mesmo evento |
| **L** | Prazo Final | Data limite de inscrições (`dd/MM/yyyy HH:mm`) |
| **M** | Nome do Evento | Nome amigável de exibição (ex: Festival do Camarão) |
| **N** | Vigência | Data final de vigência do edital (`dd/MM/yyyy HH:mm`) |

### Aba: `Usuarios`
- **Usuario**: Nome do login (ex: `matheus`).
- **SenhaHash**: Assinatura SHA-256 da senha.
- **Nivel**: Nível de privilégio (`ADMIN` ou `EDITOR`).
- **Status**: Status da conta (`ATIVO` ou `PENDENTE`).

### Aba: `Config`
- **NOME_SECRETARIA**: Nome exibido no topo.
- **TITULO_PORTAL**: Título do portal web.
- **LOGO_URL**: Link da logomarca oficial.

---

## 🚀 Como Executar Localmente ou Implantar

1. **Planilha no Google Drive**:
   - Crie uma planilha no Google Sheets.
   - Abra o menu **Extensões** > **Apps Script**.
   - Substitua o código existente pelo conteúdo de [codigo.gs](file:///C:/Users/mathe/Desktop/Projetos%20Antigravity/Editais/codigo.gs).
   - Salve o projeto.
2. **Frontend**:
   - Salve o arquivo [index.html](file:///C:/Users/mathe/Desktop/Projetos%20Antigravity/Editais/index.html) na mesma interface do Apps Script (como um arquivo HTML com o nome `index`).
3. **Setup Inicial**:
   - No menu do Apps Script, selecione e execute a função `setupSystem()`. Isso criará todas as abas e configurará os dados padrão de teste automaticamente.
4. **Implantação**:
   - Clique em **Implantar** > **Nova implantação**.
   - Selecione o tipo **Aplicativo da Web**.
   - Defina para executar como "Você (sua conta)" e dê acesso para "Qualquer pessoa".
   - Copie o link gerado para acessar o portal.
