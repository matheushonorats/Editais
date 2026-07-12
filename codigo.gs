/**
 * Portal de Editais - Secretaria Municipal de Turismo
 * Google Apps Script Backend (codigo.gs)
 * 
 * Este arquivo gerencia as consultas e gravações de dados no Google Sheets,
 * o controle de sessões administrativas, prazos e a proteção de múltiplos usuários.
 */

// Nome das abas da planilha
const SHEETS = {
  EDITAIS: 'Editais',
  CONFIG: 'Config',
  USUARIOS: 'Usuarios'
};

/**
 * Serve a interface HTML com autorizações para iframe
 */
function doGet(e) {
  var titulo = "Inscrições, Chamamentos e Editais - Secretaria Municipal de Turismo";
  try {
    var config = obterConfiguracoes();
    if (config && config.TITULO_PORTAL) {
      titulo = config.TITULO_PORTAL;
    }
  } catch (err) {
    // Config ainda não configurado
  }

  var template = HtmlService.createTemplateFromFile('index');
  
  return template.evaluate()
    .setTitle(titulo)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL) // Permite inclusão via iframe sem erros de domínio
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Função utilitária de setup do sistema.
 * Cria e formata automaticamente todas as abas, configurando a Secretaria de Turismo,
 * o usuário mestre "matheus" com nível ADMIN, um usuário EDITOR de testes, dados de demonstração
 * e o controle dinâmico de datas limites (prazos).
 */
function setupSystem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Configurar aba 'Config'
  var sheetConfig = ss.getSheetByName(SHEETS.CONFIG);
  if (!sheetConfig) {
    sheetConfig = ss.insertSheet(SHEETS.CONFIG);
  } else {
    sheetConfig.clear();
  }
  sheetConfig.getRange(1, 1, 1, 3).setValues([["Configuração", "Valor", "Descrição"]]);
  sheetConfig.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#1a365d").setFontColor("#ffffff");
  
  var defaultConfigs = [
    ["NOME_SECRETARIA", "Secretaria Municipal de Turismo", "Nome oficial exibido no cabeçalho"],
    ["TITULO_PORTAL", "Inscrições, Chamamentos e Editais", "Título principal do portal"],
    ["LOGO_URL", "https://www.saosebastiao.sp.gov.br/images/header-logo3c.png", "Link da imagem de logo da prefeitura/secretaria"]
  ];
  sheetConfig.getRange(2, 1, defaultConfigs.length, 3).setValues(defaultConfigs);
  sheetConfig.autoResizeColumns(1, 3);

  // 2. Configurar aba 'Usuarios'
  var sheetUsers = ss.getSheetByName(SHEETS.USUARIOS);
  if (!sheetUsers) {
    sheetUsers = ss.insertSheet(SHEETS.USUARIOS);
  } else {
    sheetUsers.clear();
  }
  sheetUsers.getRange(1, 1, 1, 4).setValues([["Usuario", "SenhaHash", "Nivel", "Status"]]);
  sheetUsers.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#1a365d").setFontColor("#ffffff");
  
  var defaultUsers = [
    ["matheus", gerarHashSHA256("turismo2026"), "ADMIN", "ATIVO"],
    ["editor", gerarHashSHA256("turismo123"), "EDITOR", "PENDENTE"]
  ];
  sheetUsers.getRange(2, 1, defaultUsers.length, 4).setValues(defaultUsers);
  sheetUsers.autoResizeColumns(1, 4);

  // 2.5 Configurar aba 'Logs'
  registrarLog("SISTEMA", "SETUP", "Sistema inicializado com sucesso e aba Logs de Auditoria criada.");

  // 3. Configurar aba 'Editais'
  var sheetEditais = ss.getSheetByName(SHEETS.EDITAIS);
  if (!sheetEditais) {
    sheetEditais = ss.insertSheet(SHEETS.EDITAIS);
  } else {
    sheetEditais.clear();
  }
  
  // Coluna 12: Prazo Final | Coluna 13: Nome do Evento
  var headersEditais = [
    "ID", "Ano", "Tema/Categoria", "Evento/Chamamento", 
    "Descrição do Evento", "Status do Evento", "Título do Documento", 
    "Link do Documento", "Data de Publicação", "Destaque", "Ordem", "Prazo Final",
    "Nome do Evento"
  ];
  sheetEditais.getRange(1, 1, 1, headersEditais.length).setValues([headersEditais]);
  sheetEditais.getRange(1, 1, 1, headersEditais.length).setFontWeight("bold").setBackground("#1a365d").setFontColor("#ffffff");
  
  var dataPublicacaoExemplo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  
  // Amostras de dados contendo Prazos Ativos, Expirados e Sem Prazo
  var mockData = [
    [
      "ED-001", "2026", "Eventos", "Chamamento Público nº 01/2026 - Feira de Artesanato e Gastronomia", 
      "Credenciamento de expositores locais e food trucks para o Festival Gastronômico de Inverno.", 
      "Aberto", "Edital de Abertura Oficial (PDF)", 
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", 
      dataPublicacaoExemplo, "SIM", "1", "28/05/2026 18:00",
      "Feira de Artesanato e Gastronomia" // Nome do Evento (Ativo)
    ],
    [
      "ED-002", "2026", "Eventos", "Chamamento Público nº 01/2026 - Feira de Artesanato e Gastronomia", 
      "Credenciamento de expositores locais e food trucks para o Festival Gastronômico de Inverno.", 
      "Aberto", "Ficha de Inscrição para download (Word)", 
      "https://example.com/arquivos/ficha_inscricao.docx", 
      dataPublicacaoExemplo, "NÃO", "2", "28/05/2026 18:00",
      "Feira de Artesanato e Gastronomia"
    ],
    [
      "ED-003", "2026", "Eventos", "Chamamento Público nº 01/2026 - Feira de Artesanato e Gastronomia", 
      "Credenciamento de expositores locais e food trucks para o Festival Gastronômico de Inverno.", 
      "Aberto", "Tabela de Tarifas de Ocupação de Espaço (Excel)", 
      "https://example.com/arquivos/tarifas_expositores.xlsx", 
      dataPublicacaoExemplo, "NÃO", "3", "28/05/2026 18:00",
      "Feira de Artesanato e Gastronomia"
    ],
    [
      "ED-004", "2026", "Eventos", "Chamamento Público nº 01/2026 - Feira de Artesanato e Gastronomia", 
      "Credenciamento de expositores locais e food trucks para o Festival Gastronômico de Inverno.", 
      "Aberto", "Link para Formulário de Inscrição Online (Web)", 
      "https://forms.google.com/exemplo", 
      dataPublicacaoExemplo, "SIM", "4", "19/05/2026 23:59",
      "Feira de Artesanato e Gastronomia"
    ],
    [
      "ED-005", "2025", "Turismo", "Credenciamento de Guias de Turismo Locais", 
      "Chamada pública para guias de turismo cadastrados atuarem nos roteiros históricos oficiais do município.", 
      "Concluído", "Lista de Guias Credenciados e Homologados", 
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", 
      "20/12/2025", "NÃO", "1", "",
      "Credenciamento de Guias de Turismo Locais"
    ]
  ];
  sheetEditais.getRange(2, 1, mockData.length, headersEditais.length).setValues(mockData);
  sheetEditais.autoResizeColumns(1, headersEditais.length);

  return "Portal de Turismo configurado com sucesso! Abas criadas com 'matheus' como ADMIN.";
}

/**
 * Retorna as configurações armazenadas na planilha
 */
function obterConfiguracoes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.CONFIG);
  if (!sheet) return {};
  
  var values = sheet.getDataRange().getValues();
  var configs = {};
  for (var i = 1; i < values.length; i++) {
    var chave = values[i][0];
    var valor = values[i][1];
    if (chave) {
      // Auto-migração transparente para o novo título preferido do usuário
      if (chave === "TITULO_PORTAL" && (valor === "Portal de Editais e Chamamentos" || valor === "Editais e Chamamentos Públicos")) {
        valor = "Inscrições, Chamamentos e Editais";
        try {
          sheet.getRange(i + 1, 2).setValue(valor);
        } catch(e) {
          Logger.log("Erro ao atualizar TITULO_PORTAL na planilha: " + e.toString());
        }
      }
      configs[chave] = valor;
    }
  }
  return configs;
}

/**
 * Valida o login na aba de usuários.
 * Retorna { sucesso: true, usuario: string, nivel: string } se for válido.
 */
function validarLogin(usuario, senha) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.USUARIOS);
  if (!sheet) return { sucesso: false, mensagem: "Tabela de usuários não inicializada!" };
  
  var values = sheet.getDataRange().getValues();
  var userClean = String(usuario).trim().toLowerCase();
  var hashInput = gerarHashSHA256(senha);
  
  for (var i = 1; i < values.length; i++) {
    var sheetUser = String(values[i][0]).trim().toLowerCase();
    var sheetPass = String(values[i][1]).trim();
    var sheetRole = String(values[i][2]).trim().toUpperCase();
    var sheetStatus = values[i][3] !== undefined ? String(values[i][3]).trim().toUpperCase() : "ATIVO";
    
    if (sheetUser === userClean && sheetPass === hashInput) {
      registrarLog(values[i][0], "LOGIN_SUCESSO", "Login realizado com sucesso. Nivel: " + sheetRole + " | Status: " + sheetStatus);
      return {
        sucesso: true,
        usuario: values[i][0],
        nivel: sheetRole,
        status: sheetStatus
      };
    }
  }
  
  registrarLog(userClean, "LOGIN_FALHA", "Tentativa de login malsucedida (dados incorretos).");
  return { sucesso: false, mensagem: "Usuário ou senha incorretos!" };
}

/**
 * Helper para validar se o usuário é um operador ativo e válido no banco de dados.
 */
function autenticarUsuario(usuario, senha) {
  var loginStatus = validarLogin(usuario, senha);
  return loginStatus.sucesso ? loginStatus : null;
}

/**
 * Obtém todos os dados do banco de dados (configs + editais).
 * Função pública consumida no carregamento da página.
 */
function obterDadosCompletos() {
  try {
    var configs = obterConfiguracoes();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetEditais = ss.getSheetByName(SHEETS.EDITAIS);
    var editais = [];
    
    if (sheetEditais) {
      var values = sheetEditais.getDataRange().getValues();
      
      for (var i = 1; i < values.length; i++) {
        var row = values[i];
        if (!row[0]) continue;
        
        var dataPub = row[8];
        if (dataPub instanceof Date) {
          dataPub = Utilities.formatDate(dataPub, Session.getScriptTimeZone(), "dd/MM/yyyy");
        } else {
          dataPub = String(dataPub);
        }
        
        // Pega valor da 12ª coluna (Prazo Final, se existir)
        var rawPrazo = row[11];
        var prazoVal = "";
        if (rawPrazo instanceof Date) {
          prazoVal = Utilities.formatDate(rawPrazo, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
        } else if (rawPrazo !== undefined && rawPrazo !== null) {
          prazoVal = String(rawPrazo);
        }
        
        // Pega valor da 13ª coluna (Nome do Evento, se existir)
        var nomeEventoVal = "";
        if (row.length > 12 && row[12] !== undefined && row[12] !== null) {
          nomeEventoVal = String(row[12]);
        }
        
        // Pega valor da 14ª coluna (Vigência, se existir)
        var vigenciaVal = "";
        if (row.length > 13 && row[13] !== undefined && row[13] !== null) {
          var rawVigencia = row[13];
          if (rawVigencia instanceof Date) {
            vigenciaVal = Utilities.formatDate(rawVigencia, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
          } else {
            vigenciaVal = String(rawVigencia);
          }
        }
        
        editais.push({
          id: String(row[0]),
          ano: String(row[1]),
          categoria: String(row[2]),
          evento: String(row[3]),
          descricaoEvento: String(row[4]),
          statusEvento: String(row[5]),
          tituloDocumento: String(row[6]),
          linkDocumento: String(row[7]),
          dataPublicacao: dataPub,
          destaque: String(row[9]),
          ordem: String(row[10]),
          prazoFinal: prazoVal,
          nomeEvento: nomeEventoVal,
          vigencia: vigenciaVal
        });
      }
    }
    
    return {
      sucesso: true,
      configs: configs,
      editais: editais
    };
  } catch (error) {
    return {
      sucesso: false,
      mensagem: "Erro ao buscar dados: " + error.toString()
    };
  }
}

/**
 * CRUD de Editais/Documentos: Salva ou Edita.
 * Exige autenticação de credenciais a cada requisição.
 */
function salvarRegistro(dados, usuario, senha) {
  var auth = autenticarUsuario(usuario, senha);
  if (!auth) {
    return { sucesso: false, mensagem: "Erro de autenticação! Acesso negado." };
  }
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.EDITAIS);
    if (!sheet) {
      return { sucesso: false, mensagem: "Tabela 'Editais' não encontrada!" };
    }
    
    var values = sheet.getDataRange().getValues();
    var encontradoIndex = -1;
    
    if (dados.id) {
      for (var i = 1; i < values.length; i++) {
        if (String(values[i][0]) === String(dados.id)) {
          encontradoIndex = i + 1;
          break;
        }
      }
    }
    
    var novoId = dados.id || "ED-" + new Date().getTime();
    
    var linha = [
      novoId,
      String(dados.ano || new Date().getFullYear()),
      String(dados.categoria || "Geral"),
      String(dados.evento || ""),
      String(dados.descricaoEvento || ""),
      String(dados.statusEvento || "Aberto"),
      String(dados.tituloDocumento || ""),
      String(dados.linkDocumento || ""),
      String(dados.dataPublicacao || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy")),
      String(dados.destaque || "NÃO"),
      String(dados.ordem || "1"),
      String(dados.prazoFinal || ""), // 12ª Coluna (L)
      String(dados.nomeEvento || ""),   // 13ª Coluna (M)
      String(dados.vigencia || "")      // 14ª Coluna (N)
    ];
    
    if (encontradoIndex !== -1) {
      sheet.getRange(encontradoIndex, 1, 1, linha.length).setValues([linha]);
      registrarLog(usuario, "EDITAR_EDITAL", "Documento ID '" + novoId + "' editado. Evento: " + dados.evento);
    } else {
      sheet.appendRow(linha);
      registrarLog(usuario, "CRIAR_EDITAL", "Novo Documento ID '" + novoId + "' criado. Evento: " + dados.evento);
    }
    
    // PROPAGAÇÃO GLOBAL DE ATRIBUTOS DO EVENTO (Status, Inscrições, Vigência):
    // Como estes atributos dizem respeito ao evento como um todo, atualizamos todas as outras
    // linhas do mesmo evento na planilha para manter consistência global absoluta.
    if (dados.evento) {
      var eventoAlvo = String(dados.evento).trim().toLowerCase();
      var novoStatus = dados.statusEvento ? String(dados.statusEvento).trim() : null;
      var novoPrazo = dados.prazoFinal !== undefined ? String(dados.prazoFinal).trim() : null;
      var novaVigencia = dados.vigencia !== undefined ? String(dados.vigencia).trim() : null;
      
      var range = sheet.getDataRange();
      var updatedValues = range.getValues();
      
      for (var r = 1; r < updatedValues.length; r++) {
        if (String(updatedValues[r][3]).trim().toLowerCase() === eventoAlvo) {
          // 1. Propaga Status se fornecido
          if (novoStatus !== null && String(updatedValues[r][5]).trim() !== novoStatus) {
            sheet.getRange(r + 1, 6).setValue(novoStatus); // Coluna F
          }
          // 2. Propaga Prazo Final Inscrições se fornecido
          if (novoPrazo !== null && String(updatedValues[r][11]).trim() !== novoPrazo) {
            sheet.getRange(r + 1, 12).setValue(novoPrazo); // Coluna L
          }
          // 3. Propaga Prazo Final Vigência se fornecido
          if (novaVigencia !== null && (updatedValues[r].length <= 13 || String(updatedValues[r][13]).trim() !== novaVigencia)) {
            sheet.getRange(r + 1, 14).setValue(novaVigencia); // Coluna N
          }
        }
      }
    }
    
    return { sucesso: true, mensagem: "Registro gravado com sucesso!", id: novoId };
  } catch (error) {
    return { sucesso: false, mensagem: "Erro ao salvar registro: " + error.toString() };
  }
}

/**
 * CRUD de Editais/Documentos: Exclui.
 * Exige autenticação de credenciais.
 */
function excluirRegistro(id, usuario, senha) {
  var auth = autenticarUsuario(usuario, senha);
  if (!auth) {
    return { sucesso: false, mensagem: "Erro de autenticação! Acesso negado." };
  }
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.EDITAIS);
    if (!sheet) return { sucesso: false, mensagem: "Planilha 'Editais' não encontrada!" };
    
    var values = sheet.getDataRange().getValues();
    var indexParaExcluir = -1;
    var eventoNome = "";
    
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === String(id)) {
        indexParaExcluir = i + 1;
        eventoNome = String(values[i][3]);
        break;
      }
    }
    
    if (indexParaExcluir !== -1) {
      sheet.deleteRow(indexParaExcluir);
      registrarLog(usuario, "EXCLUIR_EDITAL", "Documento ID '" + id + "' excluido. Evento: " + eventoNome);
      return { sucesso: true, mensagem: "Documento excluído com sucesso!" };
    } else {
      return { sucesso: false, mensagem: "Documento com ID '" + id + "' não encontrado!" };
    }
  } catch (error) {
    return { sucesso: false, mensagem: "Erro ao excluir documento: " + error.toString() };
  }
}


// =========================================================================
// FUNÇÕES DE GERENCIAMENTO DE USUÁRIOS (EXCLUSIVAS DE ADMIN: MATHEUS)
// =========================================================================

/**
 * Retorna todos os usuários cadastrados.
 * Exige estritamente nível ADMIN.
 */
function obterUsuarios(usuario, senha) {
  var auth = autenticarUsuario(usuario, senha);
  if (!auth || auth.nivel !== 'ADMIN') {
    throw new Error("Erro de privilégio! Apenas administradores do sistema podem acessar o controle de usuários.");
  }
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.USUARIOS);
    var usuarios = [];
    
    if (sheet) {
      var values = sheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if (values[i][0]) {
          usuarios.push({
            usuario: String(values[i][0]),
            senha: "********", // Senha real protegida por máscara na listagem admin
            nivel: String(values[i][2]),
            status: values[i][3] !== undefined ? String(values[i][3]) : "ATIVO"
          });
        }
      }
    }
    return { sucesso: true, usuarios: usuarios };
  } catch (error) {
    return { sucesso: false, mensagem: "Erro ao buscar usuários: " + error.toString() };
  }
}

/**
 * Cria ou edita um usuário na aba Usuarios.
 * Exige estritamente nível ADMIN.
 */
function salvarUsuario(dadosUsuario, usuario, senha) {
  var auth = autenticarUsuario(usuario, senha);
  if (!auth || auth.nivel !== 'ADMIN') {
    return { sucesso: false, mensagem: "Acesso negado! Operação exclusiva do administrador master." };
  }
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.USUARIOS);
    if (!sheet) return { sucesso: false, mensagem: "Tabela de usuários não encontrada!" };
    
    var values = sheet.getDataRange().getValues();
    var encontradoIndex = -1;
    var userClean = String(dadosUsuario.usuario).trim().toLowerCase();
    
    var senhaHash = "";
    var statusUser = "PENDENTE"; // Força configuração de senha no primeiro acesso
    
    // Procura o usuário para saber se edita ou insere
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === userClean) {
        encontradoIndex = i + 1;
        senhaHash = String(values[i][1]); // Salva o hash antigo por segurança
        statusUser = values[i][3] !== undefined ? String(values[i][3]) : "ATIVO";
        break;
      }
    }
    
    var novaSenhaDigitada = String(dadosUsuario.senha || "").trim();
    
    // Se for um novo usuário
    if (encontradoIndex === -1) {
      if (!novaSenhaDigitada || novaSenhaDigitada === "********") {
        return { sucesso: false, mensagem: "Você deve fornecer uma senha provisória inicial para o novo usuário!" };
      }
      senhaHash = gerarHashSHA256(novaSenhaDigitada);
      statusUser = "PENDENTE"; // Força o primeiro acesso a reconfigurar
    } else {
      // Se for edição de usuário existente
      if (novaSenhaDigitada !== "" && novaSenhaDigitada !== "********") {
        senhaHash = gerarHashSHA256(novaSenhaDigitada);
        statusUser = "PENDENTE"; // Se o ADMIN alterou a senha, força reconfiguração no próximo acesso!
      }
    }
    
    var linha = [
      String(dadosUsuario.usuario).trim(),
      senhaHash,
      String(dadosUsuario.nivel || 'EDITOR').toUpperCase(),
      statusUser.toUpperCase()
    ];
    
    if (encontradoIndex !== -1) {
      sheet.getRange(encontradoIndex, 1, 1, linha.length).setValues([linha]);
      registrarLog(usuario, "EDITAR_USUARIO", "Usuario '" + dadosUsuario.usuario + "' atualizado. Nivel: " + dadosUsuario.nivel + " | Status: " + statusUser);
      return { sucesso: true, mensagem: "Usuário atualizado com sucesso!" };
    } else {
      sheet.appendRow(linha);
      registrarLog(usuario, "CRIAR_USUARIO", "Novo usuario '" + dadosUsuario.usuario + "' registrado. Nivel: " + dadosUsuario.nivel + " | Status: PENDENTE");
      return { sucesso: true, mensagem: "Novo usuário criado com sucesso!" };
    }
  } catch (error) {
    return { sucesso: false, mensagem: "Erro ao gravar usuário: " + error.toString() };
  }
}

/**
 * Remove um usuário da tabela.
 * Exige estritamente nível ADMIN e impede que o ADMIN se auto-exclua.
 */
function excluirUsuario(usernameParaExcluir, usuario, senha) {
  var auth = autenticarUsuario(usuario, senha);
  if (!auth || auth.nivel !== 'ADMIN') {
    return { sucesso: false, mensagem: "Acesso negado! Operação exclusiva do administrador master." };
  }
  
  var autoExclusaoCheck = String(usernameParaExcluir).trim().toLowerCase();
  if (autoExclusaoCheck === String(usuario).trim().toLowerCase()) {
    return { sucesso: false, mensagem: "Operação bloqueada! Você não pode excluir a sua própria conta de administrador master." };
  }
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.USUARIOS);
    if (!sheet) return { sucesso: false, mensagem: "Tabela de usuários não encontrada!" };
    
    var values = sheet.getDataRange().getValues();
    var indexParaExcluir = -1;
    
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === autoExclusaoCheck) {
        indexParaExcluir = i + 1;
        break;
      }
    }
    
    if (indexParaExcluir !== -1) {
      sheet.deleteRow(indexParaExcluir);
      registrarLog(usuario, "EXCLUIR_USUARIO", "Usuario '" + usernameParaExcluir + "' excluido do sistema.");
      return { sucesso: true, mensagem: "Usuário excluído com sucesso do sistema!" };
    } else {
      return { sucesso: false, mensagem: "Usuário não encontrado na base de dados." };
    }
  } catch (error) {
    return { sucesso: false, mensagem: "Erro ao remover usuário: " + error.toString() };
  }
}

/**
 * Gera Hash SHA-256 de uma string para armazenamento seguro (Sem senhas expostas!)
 */
function gerarHashSHA256(senha) {
  if (!senha) return "";
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(senha).trim(), Utilities.Charset.UTF_8);
  var hexString = "";
  for (var i = 0; i < digest.length; i++) {
    var byteValue = digest[i];
    if (byteValue < 0) byteValue += 256;
    var byteString = byteValue.toString(16);
    if (byteString.length == 1) byteString = "0" + byteString;
    hexString += byteString;
  }
  return hexString;
}

/**
 * Registra um log de auditoria na aba 'Logs'
 */
function registrarLog(usuario, acao, detalhes) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Logs');
    if (!sheet) {
      sheet = ss.insertSheet('Logs');
      sheet.getRange(1, 1, 1, 4).setValues([["Data/Hora", "Usuario", "Acao", "Detalhes"]]);
      sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#1a365d").setFontColor("#ffffff");
    }
    
    var dataHora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    sheet.appendRow([dataHora, usuario || "SISTEMA/PUBLICO", acao, detalhes || ""]);
  } catch (err) {
    console.error("Erro ao registrar log: " + err.toString());
  }
}

/**
 * Altera a senha provisória de um usuário em seu primeiro acesso.
 * Recebe o usuário, a senha antiga (provisória) e a nova senha desejada.
 * A nova senha é convertida em hash e salva, e o status é definido como 'ATIVO'.
 */
function definirNovaSenha(usuario, senhaProvisoria, novaSenha) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.USUARIOS);
    if (!sheet) return { sucesso: false, mensagem: "Tabela de usuários não encontrada!" };
    
    var values = sheet.getDataRange().getValues();
    var userClean = String(usuario).trim().toLowerCase();
    var hashProvisoria = gerarHashSHA256(senhaProvisoria);
    
    var indexEncontrado = -1;
    var nivelUser = "";
    
    for (var i = 1; i < values.length; i++) {
      var sheetUser = String(values[i][0]).trim().toLowerCase();
      var sheetPass = String(values[i][1]).trim();
      var sheetStatus = values[i][3] !== undefined ? String(values[i][3]).trim().toUpperCase() : "";
      
      if (sheetUser === userClean && sheetPass === hashProvisoria) {
        if (sheetStatus !== 'PENDENTE') {
          return { sucesso: false, mensagem: "Esta conta já foi ativada. Altere a senha pelo painel caso necessário." };
        }
        indexEncontrado = i + 1;
        nivelUser = String(values[i][2]).trim().toUpperCase();
        break;
      }
    }
    
    if (indexEncontrado === -1) {
      registrarLog(usuario, "ALTERACAO_SENHA_FALHA", "Tentativa invalida de primeiro acesso (usuario ou senha provisoria incorretos).");
      return { sucesso: false, mensagem: "Usuário ou senha provisória inválidos!" };
    }
    
    var novaSenhaClean = String(novaSenha).trim();
    if (novaSenhaClean.length < 4) {
      return { sucesso: false, mensagem: "A nova senha deve ter pelo menos 4 caracteres!" };
    }
    
    var novoHash = gerarHashSHA256(novaSenhaClean);
    
    // Atualiza apenas a Senha (coluna B/2) e o Status (coluna D/4)
    sheet.getRange(indexEncontrado, 2).setValue(novoHash);
    sheet.getRange(indexEncontrado, 4).setValue("ATIVO");
    
    registrarLog(usuario, "ALTERACAO_SENHA_SUCESSO", "Senha provisoria alterada com sucesso. Conta ativada.");
    
    return {
      sucesso: true,
      mensagem: "Sua senha foi configurada com sucesso! Você já pode entrar no painel.",
      usuario: usuario,
      nivel: nivelUser
    };
  } catch (error) {
    return { sucesso: false, mensagem: "Erro ao configurar nova senha: " + error.toString() };
  }
}
