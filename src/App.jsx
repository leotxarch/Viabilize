import React, { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, ChevronRight, Gauge, AlertTriangle } from "lucide-react";

// Chave do autosave no localStorage — muda o número da versão se o formato salvo mudar de forma
// incompatível no futuro (evita tentar restaurar dados salvos com um formato antigo/quebrado).
const AUTOSAVE_KEY = "viabilize_autosave_v1";

// Metragens mínimas normativas por unidade HIS/HMP (habitabilidade/conformidade legal para
// programas habitacionais em São Paulo). Área privativa mínima = computável + terraço social —
// o terraço técnico (equipamentos de ar-condicionado/instalações) fica de fora dessa conta de
// propósito, por ser acessório e não compor a área útil de moradia principal. Usado só como
// auditoria visual (soft warning) na aba Resumo das Unidades — nunca bloqueia o preenchimento.
const HIS_HMP_COMPUTAVEL_MINIMO = 21.8;
const HIS_HMP_PRIVATIVA_MINIMA = 24.0;

// Formata número no padrão pt-BR com N casas decimais (ex: 1,45)
function formatNumeroBR(valor, casas = 2) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

// Converte um texto de input (aceita vírgula ou ponto) em número. Vazio/inválido -> 0
function paraNumero(texto) {
  if (typeof texto !== "string" || texto.trim() === "") return 0;
  const limpo = texto.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? 0 : n;
}

// Navegação por setas do teclado entre campos (como em uma planilha). Funciona em qualquer
// grade/tabela porque encontra o campo vizinho pela posição na tela, não por índice fixo.
function navegarComSetas(e) {
  const { key } = e;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;
  const atual = e.currentTarget;

  // Para a esquerda/direita, só navega quando o cursor já está na ponta do texto,
  // pra não atrapalhar quem está editando o meio do valor.
  if (key === "ArrowLeft" && atual.selectionStart !== 0) return;
  if (key === "ArrowRight" && atual.selectionEnd !== atual.value.length) return;

  const rect = atual.getBoundingClientRect();
  const candidatos = Array.from(document.querySelectorAll('[data-nav-input="true"]')).filter(
    (el) => el !== atual && !el.disabled
  );

  let melhor = null;
  let melhorDist = Infinity;
  candidatos.forEach((el) => {
    const r = el.getBoundingClientRect();
    let valido = false;
    let dist = 0;
    const mesmaColuna = Math.abs(r.left - rect.left) < 24;
    const mesmaLinha = Math.abs(r.top - rect.top) < 10;
    if (key === "ArrowDown" && r.top > rect.top + 2 && mesmaColuna) {
      valido = true;
      dist = r.top - rect.top;
    } else if (key === "ArrowUp" && r.top < rect.top - 2 && mesmaColuna) {
      valido = true;
      dist = rect.top - r.top;
    } else if (key === "ArrowRight" && r.left > rect.left + 2 && mesmaLinha) {
      valido = true;
      dist = r.left - rect.left;
    } else if (key === "ArrowLeft" && r.left < rect.left - 2 && mesmaLinha) {
      valido = true;
      dist = rect.left - r.left;
    }
    if (valido && dist < melhorDist) {
      melhorDist = dist;
      melhor = el;
    }
  });

  if (melhor) {
    e.preventDefault();
    melhor.focus();
    if (typeof melhor.select === "function") melhor.select();
  }
}

// ------------------------------------------------------------------
// Estrutura do formulário + agregados automáticos
// Abas: Terreno e Zoneamento | Empreendimento | Resumo das Unidades | Indicadores
// ------------------------------------------------------------------

const TABS = [
  { id: "terreno", label: "Terreno e Zoneamento" },
  { id: "beneficios", label: "Benefícios" },
  { id: "areas", label: "Resumo das Unidades" },
  { id: "empreendimento", label: "Dados do Empreendimento" },
  { id: "indicadores", label: "Indicadores Gerais" },
];

const ZONAS_SP = [
  "ZEU",
  "ZEUa",
  "ZEUP",
  "ZEUPa",
  "ZEM",
  "ZEMP",
  "ZC",
  "ZCa",
  "ZC-ZEIS",
  "ZCOR-1",
  "ZCOR-2",
  "ZCOR-3",
  "ZCORa",
  "ZM",
  "ZMa",
  "ZMIS",
  "ZMISa",
  "ZEIS-1",
  "ZEIS-2",
  "ZEIS-3",
  "ZEIS-4",
  "ZEIS-5",
  "ZDE-1",
  "ZDE-2",
  "ZPI-1",
  "ZPI-2",
  "ZPR",
  "ZER-1",
  "ZER-2",
  "ZERa",
  "ZPDS",
  "ZPDSr",
  "ZEPAM",
  "AVP-1",
  "AVP-2",
  "AI",
  "AIa",
  "AC-1",
  "AC-2",
  "ZEP",
  "ZEPEC",
  "ZOE",
];

// Notas do Quadro 3 (Anexo integrante da Lei nº 16.402, de 22 de março de 2016)
const NOTAS_QUADRO_3 = {
  b: "Atendidos os requisitos do art. 83 da Lei nº 16.050/2014 (PDE), a zona ZEUP passa a recepcionar automaticamente os parâmetros da zona ZEU.",
  c: "Atendidos os requisitos do art. 83 da Lei nº 16.050/2014 (PDE), a zona ZEUPa passa a recepcionar automaticamente os parâmetros da zona ZEUa.",
  d: "O CA máx. será igual a 4 nos casos dispostos no §1º do art. 8º desta lei.",
  e: "O CA máx. será igual a 4 nos casos dispostos no §2º do art. 8º desta lei.",
  f: "O CA máx. será igual a 2 nos casos em que o lote for menor que 1.000 m².",
  g: "O CA máx. será igual a 2 nos casos em que o lote for menor que 500 m².",
  h: "O CA máx. será igual a 1 nos casos em que o lote for menor que 1.000 m².",
  j: "Os recuos laterais e de fundo para edificação com altura superior a 10m serão dispensados conforme os incisos II e III do art. 66 desta lei.",
  k: "Ver artigo 30 desta lei.",
};

// Quadro 3 - Parâmetros de ocupação, exceto Quota Ambiental (Lei nº 16.402/2016).
// TO: to500 = lotes até 500 m² · toMais500 = lotes iguais ou superiores a 500 m²
// recuoLatFundoAte10 / recuoLatFundoAcima10: recuos de fundos e laterais conforme altura da edificação
const QUADRO_3 = {
  // TRANSFORMAÇÃO
  ZEU: { tipo: "Transformação", caMinimo: 0.5, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.7, gabarito: null, recuoFrente: null, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: 20, notas: ["j"] },
  ZEUa: { tipo: "Transformação", caMinimo: null, caBasico: 1, caMaximo: 2, to500: 0.7, toMais500: 0.5, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: 40, notas: ["j"] },
  ZEUP: { tipo: "Transformação", caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["b", "j"] },
  ZEUPa: { tipo: "Transformação", caMinimo: null, caBasico: 1, caMaximo: 1, to500: 0.7, toMais500: 0.5, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["c", "j"] },
  ZEM: { tipo: "Transformação", caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: 20, notas: ["d", "j"] },
  ZEMP: { tipo: "Transformação", caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: 40, notas: ["e", "j"] },
  // QUALIFICAÇÃO
  ZC: { tipo: "Qualificação", caMinimo: 0.3, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 48, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZCa: { tipo: "Qualificação", caMinimo: null, caBasico: 1, caMaximo: 1, to500: 0.7, toMais500: 0.7, gabarito: 20, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZC-ZEIS": { tipo: "Qualificação", caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: null, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZCOR-1": { tipo: "Qualificação", caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZCOR-2": { tipo: "Qualificação", caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZCOR-3": { tipo: "Qualificação", caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZCORa: { tipo: "Qualificação", caMinimo: null, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZM: { tipo: "Qualificação", caMinimo: 0.3, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZMa: { tipo: "Qualificação", caMinimo: null, caBasico: 1, caMaximo: 1, to500: 0.7, toMais500: 0.5, gabarito: 15, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZMIS: { tipo: "Qualificação", caMinimo: 0.3, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZMISa: { tipo: "Qualificação", caMinimo: null, caBasico: 1, caMaximo: 1, to500: 0.7, toMais500: 0.5, gabarito: 15, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZEIS-1": { tipo: "Qualificação", caMinimo: 0.5, caBasico: 1, caMaximo: 2.5, to500: 0.85, toMais500: 0.7, gabarito: null, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["f", "j"] },
  "ZEIS-2": { tipo: "Qualificação", caMinimo: 0.5, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.7, gabarito: null, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["f", "j"] },
  "ZEIS-3": { tipo: "Qualificação", caMinimo: 0.5, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.7, gabarito: null, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["g", "j"] },
  "ZEIS-4": { tipo: "Qualificação", caMinimo: null, caBasico: 1, caMaximo: 2, to500: 0.7, toMais500: 0.5, gabarito: null, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["h", "j"] },
  "ZEIS-5": { tipo: "Qualificação", caMinimo: 0.5, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.7, gabarito: null, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["f", "j"] },
  "ZDE-1": { tipo: "Qualificação", caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.7, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZDE-2": { tipo: "Qualificação", caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.7, toMais500: 0.5, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  "ZPI-1": { tipo: "Qualificação", caMinimo: 0.5, caBasico: 1, caMaximo: 1.5, to500: 0.7, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  "ZPI-2": { tipo: "Qualificação", caMinimo: null, caBasico: 1, caMaximo: 1.5, to500: 0.5, toMais500: 0.3, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  // PRESERVAÇÃO
  ZPR: { tipo: "Preservação", caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  "ZER-1": { tipo: "Preservação", caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  "ZER-2": { tipo: "Preservação", caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  ZERa: { tipo: "Preservação", caMinimo: null, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  ZPDS: { tipo: "Preservação", caMinimo: null, caBasico: 1, caMaximo: 1, to500: 0.35, toMais500: 0.25, gabarito: 20, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  ZPDSr: { tipo: "Preservação", caMinimo: null, caBasico: 0.2, caMaximo: 0.2, to500: 0.2, toMais500: 0.15, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  ZEPAM: { tipo: "Preservação", caMinimo: null, caBasico: 0.1, caMaximo: 0.1, to500: 0.1, toMais500: 0.1, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  // ÁREAS PÚBLICAS E SAPAVEL
  "AVP-1": { tipo: "Áreas Públicas e Sapaval", caMinimo: null, caBasico: null, caMaximo: null, to500: null, toMais500: null, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["k", "j"] },
  "AVP-2": { tipo: "Áreas Públicas e Sapaval", caMinimo: null, caBasico: 1, caMaximo: 1, to500: 0.3, toMais500: 0.3, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  AI: { tipo: "Áreas Públicas e Sapaval", caMinimo: null, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  AIa: { tipo: "Áreas Públicas e Sapaval", caMinimo: null, caBasico: 1, caMaximo: 2, to500: 0.5, toMais500: 0.5, gabarito: 15, recuoFrente: null, recuoLatFundoAte10: null, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "AC-1": { tipo: "Áreas Públicas e Sapaval", caMinimo: null, caBasico: 0.6, caMaximo: 0.6, to500: 0.6, toMais500: 0.6, gabarito: 20, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  "AC-2": { tipo: "Áreas Públicas e Sapaval", caMinimo: null, caBasico: 0.4, caMaximo: 0.4, to500: 0.4, toMais500: 0.4, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
};

// Subprefeituras e respectivos subdistritos do Município de São Paulo
const SUBPREFEITURAS_SP = {
  "Aricanduva / Formosa / Carrão": ["Aricanduva", "Carrão", "Vila Formosa"],
  Butantã: ["Butantã", "Morumbi", "Raposo Tavares", "Rio Pequeno", "Vila Sônia"],
  "Campo Limpo": ["Campo Limpo", "Capão Redondo", "Vila Andrade"],
  "Capela do Socorro": ["Cidade Dutra", "Grajaú", "Socorro"],
  "Casa Verde / Cachoeirinha": ["Cachoeirinha", "Casa Verde", "Limão"],
  "Cidade Ademar": ["Cidade Ademar", "Pedreira"],
  "Cidade Tiradentes": ["Cidade Tiradentes"],
  "Ermelino Matarazzo": ["Ermelino Matarazzo", "Ponte Rasa"],
  "Freguesia / Brasilândia": ["Brasilândia", "Freguesia do Ó"],
  Guaianases: ["Guaianases", "Lajeado"],
  Ipiranga: ["Cursino", "Ipiranga", "Sacomã"],
  "Itaim Paulista": ["Itaim Paulista", "Vila Curuçá"],
  Itaquera: ["Cidade Líder", "Itaquera", "José Bonifácio", "Parque do Carmo"],
  Jabaquara: ["Jabaquara"],
  "Jaçanã / Tremembé": ["Jaçanã", "Tremembé"],
  Lapa: ["Barra Funda", "Jaguara", "Jaguaré", "Lapa", "Perdizes", "Vila Leopoldina"],
  "M'Boi Mirim": ["Jardim Ângela", "Jardim São Luís"],
  Mooca: ["Água Rasa", "Belém", "Brás", "Mooca", "Pari", "Tatuapé"],
  Parelheiros: ["Marsilac", "Parelheiros"],
  Penha: ["Artur Alvim", "Cangaíba", "Penha", "Vila Matilde"],
  "Perus / Anhanguera": ["Anhanguera", "Perus"],
  Pinheiros: ["Alto de Pinheiros", "Itaim Bibi", "Jardim Paulista", "Pinheiros"],
  "Pirituba / Jaraguá": ["Jaraguá", "Pirituba", "São Domingos"],
  "Santana / Tucuruvi": ["Mandaqui", "Santana", "Tucuruvi"],
  "Santo Amaro": ["Campo Belo", "Campo Grande", "Santo Amaro"],
  "São Mateus": ["Iguatemi", "São Mateus", "São Rafael"],
  "São Miguel Paulista": ["Jardim Helena", "São Miguel", "Vila Jacuí"],
  Sapopemba: ["Sapopemba"],
  Sé: ["Bela Vista", "Bom Retiro", "Cambuci", "Consolação", "Liberdade", "República", "Santa Cecília", "Sé"],
  "Vila Maria / Vila Guilherme": ["Vila Guilherme", "Vila Maria", "Vila Medeiros"],
  "Vila Mariana": ["Moema", "Saúde", "Vila Mariana"],
  "Vila Prudente": ["São Lucas", "Vila Prudente"],
};

function Field({
  label,
  unit,
  placeholder,
  type = "text",
  value,
  onChange,
  numerico,
  labelEditable,
  labelValue,
  onLabelChange,
  ...props
}) {
  const ehNumerico = unit === "m²" || unit === "%" || numerico;
  const handleBlur = () => {
    if (!ehNumerico || !onChange || typeof value !== "string" || value.trim() === "") return;
    const num = paraNumero(value);
    if (Number.isNaN(num)) return;
    const formatado = formatNumeroBR(num);
    if (formatado !== value) onChange({ target: { value: formatado } });
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
      return;
    }
    navegarComSetas(e);
  };
  // Quando labelEditable, o rótulo vira um campo de texto (rótulo padrão como placeholder) — usado
  // pelas seções "Outros"/"Outros não computável" do Pavimento, que podem ser renomeadas livremente.
  const Wrapper = labelEditable ? "div" : "label";
  return (
    <Wrapper className="flex flex-col gap-1.5">
      {labelEditable ? (
        <input
          type="text"
          value={labelValue}
          onChange={onLabelChange}
          placeholder={label}
          title="Clique para renomear"
          className="w-fit max-w-full rounded border border-transparent bg-transparent px-0.5 text-[13px] font-medium text-slate-500 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      ) : (
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
      )}
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          data-nav-input="true"
          className={`w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400 ${
            ehNumerico ? "font-mono" : ""
          }`}
          {...props}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
            {unit}
          </span>
        )}
      </div>
    </Wrapper>
  );
}

function SelectField({ label, options, ...props }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-slate-500">{label}</span>
      <select
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        {...props}
      >
        <option value="">Selecione...</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionCard({ title, subtitle, children, collapsible, defaultOpen = true }) {
  const [aberto, setAberto] = useState(defaultOpen);
  if (!collapsible) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {title && (
          <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
            <h3 className="text-[15px] font-semibold text-slate-800">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[13px] text-slate-400">{subtitle}</p>}
          </div>
        )}
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setAberto((v) => !v)}
        className={`flex w-full items-center gap-2 px-4 py-4 text-left sm:px-6 ${
          aberto ? "border-b border-slate-100" : ""
        }`}
      >
        <ChevronRight
          size={15}
          className={`shrink-0 text-slate-400 transition-transform ${aberto ? "rotate-90" : ""}`}
        />
        <div>
          <h3 className="text-[15px] font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-slate-400">{subtitle}</p>}
        </div>
      </button>
      {aberto && <div className="p-4 sm:p-6">{children}</div>}
    </div>
  );
}

// Cartão de indicador (KPI) para o painel de Resumo/Agregados
function MetricCard({ label, value, unit, highlight, reference }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className={`text-[12px] font-medium ${highlight ? "text-blue-600" : "text-slate-400"}`}>
        {label}
      </p>
      <p className={`mt-1 font-mono text-[22px] font-semibold ${highlight ? "text-blue-700" : "text-slate-800"}`}>
        {value}
        {unit && <span className="ml-1 font-sans text-[13px] font-medium text-slate-400">{unit}</span>}
      </p>
      {reference && <p className="mt-0.5 text-[12px] text-slate-400">{reference}</p>}
    </div>
  );
}

// Par rótulo/valor compacto (sem borda), usado nas tabelas de relatório de Indicadores Gerais.
function Kv({ label, value, tone, texto }) {
  const vazio = value === null || value === undefined || value === "";
  const cor = vazio
    ? "text-slate-300"
    : tone === "red"
    ? "text-red-600"
    : tone === "emerald"
    ? "text-emerald-600"
    : "text-slate-800";
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10.5px] text-slate-400">{label}</p>
      <p className={`text-[13px] font-semibold ${texto ? "" : "font-mono"} ${cor}`}>{vazio ? "—" : value}</p>
    </div>
  );
}

// Campo editável compacto da faixa de identificação do estudo (sem borda, rótulo accent).
function IdField({ label, value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-blue-600">{label}</span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="min-w-[120px] bg-transparent text-[14px] font-semibold text-slate-800 placeholder:text-slate-300 outline-none"
      />
    </div>
  );
}

// Input compacto de tabela, controlado, usado no Resumo das Unidades

function TableInput({ value, onChange, placeholder, width = "w-20", disabled, formatarM2, numerico }) {
  const ehNumerico = formatarM2 || numerico;
  const handleBlur = () => {
    if (!ehNumerico || !onChange || typeof value !== "string" || value.trim() === "") return;
    const num = paraNumero(value);
    if (Number.isNaN(num)) return;
    const formatado = formatNumeroBR(num);
    if (formatado !== value) onChange({ target: { value: formatado } });
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
      return;
    }
    navegarComSetas(e);
  };
  return (
    <input
      className={`${width} rounded-md border px-2 py-1.5 text-sm ${ehNumerico ? "font-mono" : ""} ${
        disabled ? "border-slate-100 bg-slate-50 text-slate-400" : "border-slate-200 text-slate-800"
      }`}
      value={value}
      onChange={onChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      data-nav-input="true"
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

// Opções padrão da coluna "Categoria" (sempre inclui uma opção digitável ao final)
const CATEGORIA_OPCOES_PADRAO = ["Residencial", "Não Residencial", "Comercial", "Corporativo", "Educacional"];

function TabelaUnidades({
  linhasGlobais,
  descricoesDuplicadas,
  categoria,
  expandido,
  onToggle,
  onAdd,
  onUpdate,
  onRemove,
  onRenameCategoria,
  onRemoveCategoria,
  onChangeTipo,
  onDragStartHandle,
  onDragOverCard,
  onDropCard,
  arrastando,
}) {
  const tabela = categoria.id;
  const categoriaFixa = categoria.categoriaFixa;
  const mostrarIncentivo = !categoria.naoComputavel;
  const mostrarIncentivoNaoComputavel = categoria.naoComputavel;
  const rotuloComputavel = "Computável (m²)";
  const subtitulo = categoria.naoComputavel
    ? "Tratada como incentivo não computável — conta apenas na privativa, não soma na área computável do projeto."
    : categoria.quinhao === "naoResidencial"
    ? "Área computável do quinhão não residencial (NR) do empreendimento."
    : "Área computável normal do empreendimento (quinhão residencial).";
  const tipoAtual = categoria.naoComputavel
    ? "naoComputavel"
    : categoria.quinhao === "naoResidencial"
    ? "naoResidencial"
    : "residencial";
  const linhas = linhasGlobais.filter((u) => u.tabela === tabela);
  return (
    <div
      className={`rounded-lg border bg-white p-4 transition-colors ${
        arrastando ? "border-blue-400 bg-blue-50/40" : "border-slate-200"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverCard && onDragOverCard();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropCard && onDropCard();
      }}
    >
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={onToggle}
          className="shrink-0"
          aria-label={expandido ? "Minimizar tabela" : "Expandir tabela"}
        >
          <ChevronRight size={15} className={`text-slate-400 transition-transform ${expandido ? "rotate-90" : ""}`} />
        </button>
        <div
          draggable
          onDragStart={onDragStartHandle}
          className="cursor-grab active:cursor-grabbing"
          title="Arraste para reordenar"
        >
          <AlcaArrastar />
        </div>
        <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
          {categoriaFixa ? (
            <h4 className="shrink-0 text-[14px] font-semibold text-slate-700">{categoria.nome}</h4>
          ) : (
            <input
              className="w-40 shrink-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-semibold text-slate-700 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              value={categoria.nome}
              onChange={(e) => onRenameCategoria(categoria.id, e.target.value)}
            />
          )}
          <p className="truncate text-[12px] text-slate-400">{subtitulo}</p>
        </div>
        {!categoria.padrao && onChangeTipo && (
          <select
            className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            value={tipoAtual}
            onChange={(e) => onChangeTipo(categoria.id, e.target.value)}
            title="Define se esta categoria conta como área computável e a qual quinhão do terreno ela pertence"
          >
            <option value="naoComputavel">Não computável (incentivo)</option>
            <option value="residencial">Computável — Residencial</option>
            <option value="naoResidencial">Computável — Não Residencial</option>
          </select>
        )}
        <span className="shrink-0 text-[11px] text-slate-400">{linhas.length} un.</span>
        {onRemoveCategoria && (
          <button
            onClick={() => onRemoveCategoria(categoria.id)}
            disabled={linhas.length > 0}
            className="shrink-0 text-slate-300 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
            title={linhas.length > 0 ? "Remova as unidades desta categoria antes de excluí-la" : "Remover categoria"}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {expandido && (
      <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[12px] text-slate-400">
              <th className="py-2 pr-3 font-medium">Descrição (tipologia)</th>
              <th className="py-2 pr-3 font-medium">Categoria</th>
              <th className="py-2 pr-3 font-medium">{rotuloComputavel}</th>
              {mostrarIncentivoNaoComputavel && (
                <th className="py-2 pr-3 font-medium">Incentivo não computável (m²)</th>
              )}
              <th className="py-2 pr-3 font-medium">Hall Privativo</th>
              {mostrarIncentivo && <th className="py-2 pr-3 font-medium">Incentivo</th>}
              <th className="py-2 pr-3 font-medium">Terraço</th>
              <th className="py-2 pr-3 font-medium">Á. técnica</th>
              <th className="py-2 pr-3 font-medium">Ornamento / Floreira</th>
              <th className="py-2 pr-3 font-medium">Descoberta</th>
              <th className="py-2 pr-3 font-medium">Depósito</th>
              <th className="py-2 pr-3 font-medium">Privativa</th>
              <th className="py-2 pr-3 font-medium">% Terraço/Privativa</th>
              <th className="py-2 pr-3 font-medium">Vagas</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-3">
                  <TableInput
                    width="w-40"
                    placeholder="Ex: 2 dorm"
                    value={u.descricao}
                    onChange={(e) => onUpdate(u.id, "descricao", e.target.value)}
                  />
                  {u.descricao.trim() && descricoesDuplicadas && descricoesDuplicadas.has(u.descricao.trim()) && (
                    <p
                      className="mt-1 text-[10px] font-medium text-amber-600"
                      title="Existe mais de uma unidade com esse nome. Isso é permitido, mas confira nos pavimentos qual das duas foi selecionada em cada alocação."
                    >
                      nome repetido no catálogo
                    </p>
                  )}
                  {(u.abaixoComputavelMinimoHISHMP || u.abaixoPrivativaMinimaHISHMP) && (
                    <p
                      className="mt-1 flex items-center gap-1 text-[10px] font-medium text-red-600"
                      title={`Unidade HIS/HMP abaixo do mínimo normativo: ${HIS_HMP_COMPUTAVEL_MINIMO.toLocaleString(
                        "pt-BR",
                        { minimumFractionDigits: 1 }
                      )} m² computáveis e ${HIS_HMP_PRIVATIVA_MINIMA.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                      })} m² privativos por unidade (Privativa = Computável + Terraço social; a área técnica/terraço técnico não conta para esse mínimo).`}
                    >
                      <AlertTriangle size={11} className="shrink-0" />
                      abaixo do mínimo HIS/HMP
                    </p>
                  )}
                </td>
                {categoriaFixa ? (
                  <td className="py-1.5 pr-3">
                    <span className="whitespace-nowrap rounded-full bg-slate-100 border border-slate-200 px-2 py-1 text-[12px] font-medium text-slate-500">
                      {categoriaFixa}
                    </span>
                  </td>
                ) : (
                  <td className="py-1.5 pr-3">
                    <div className="flex flex-col gap-1.5">
                      <select
                        className="w-36 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
                        value={u.categoria}
                        onChange={(e) => onUpdate(u.id, "categoria", e.target.value)}
                      >
                        {(categoria.opcoesCategoria || CATEGORIA_OPCOES_PADRAO).map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                        <option value="Outro">Outro</option>
                      </select>
                      {u.categoria === "Outro" && (
                        <input
                          className="w-36 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          placeholder="Digite a categoria..."
                          value={u.categoriaOutro}
                          onChange={(e) => onUpdate(u.id, "categoriaOutro", e.target.value)}
                        />
                      )}
                    </div>
                  </td>
                )}
                <td className="py-1.5 pr-3">
                  <TableInput
                    width="w-24"
                    placeholder="0,00"
                    formatarM2
                    value={u.computavel}
                    onChange={(e) => onUpdate(u.id, "computavel", e.target.value)}
                  />
                </td>
                {mostrarIncentivoNaoComputavel && (
                  <td className="py-1.5 pr-3">
                    <TableInput
                      placeholder="0,00"
                      formatarM2
                      value={u.incentivoNaoComputavel}
                      onChange={(e) => onUpdate(u.id, "incentivoNaoComputavel", e.target.value)}
                    />
                  </td>
                )}
                <td className="py-1.5 pr-3">
                  <TableInput
                    placeholder="0,00"
                    formatarM2
                    value={u.hallPrivativo}
                    onChange={(e) => onUpdate(u.id, "hallPrivativo", e.target.value)}
                  />
                </td>
                {mostrarIncentivo && (
                  <td className="py-1.5 pr-3">
                    <TableInput
                      placeholder="0,00"
                      formatarM2
                      value={u.incentivo}
                      onChange={(e) => onUpdate(u.id, "incentivo", e.target.value)}
                    />
                  </td>
                )}
                <td className="py-1.5 pr-3">
                  <TableInput
                    placeholder="0,00"
                    formatarM2
                    value={u.terraco}
                    onChange={(e) => onUpdate(u.id, "terraco", e.target.value)}
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <TableInput
                    placeholder="0,00"
                    formatarM2
                    value={u.areaTecnica}
                    onChange={(e) => onUpdate(u.id, "areaTecnica", e.target.value)}
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <TableInput
                    placeholder="0,00"
                    formatarM2
                    value={u.ornamento}
                    onChange={(e) => onUpdate(u.id, "ornamento", e.target.value)}
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <TableInput
                    placeholder="0,00"
                    formatarM2
                    value={u.descoberta}
                    onChange={(e) => onUpdate(u.id, "descoberta", e.target.value)}
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <TableInput
                    placeholder="0,00"
                    formatarM2
                    value={u.deposito}
                    onChange={(e) => onUpdate(u.id, "deposito", e.target.value)}
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <TableInput value={formatNumeroBR(u.privativaUnidade)} numerico disabled />
                </td>
                <td className="py-1.5 pr-3">
                  <TableInput
                    value={
                      u.percentualTerracoPrivativa !== null ? formatNumeroBR(u.percentualTerracoPrivativa) : "—"
                    }
                    numerico
                    disabled
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <TableInput
                    width="w-16"
                    placeholder="0"
                    value={u.vagas}
                    numerico
                    onChange={(e) => onUpdate(u.id, "vagas", e.target.value)}
                  />
                </td>
                <td className="py-1.5">
                  <button
                    onClick={() => onRemove(u.id)}
                    className="text-slate-300 hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td
                  colSpan={12 + (mostrarIncentivo ? 1 : 0) + (mostrarIncentivoNaoComputavel ? 1 : 0)}
                  className="py-3 text-center text-[12px] text-slate-400"
                >
                  Nenhuma unidade cadastrada nesta tabela ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => onAdd(tabela)}
        className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-[12px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600"
      >
        <Plus size={14} />
        Adicionar unidade
      </button>
      </>
      )}
    </div>
  );
}

// quinhao: a qual base de terreno esta categoria pertence, para o cálculo de potencial
// construtivo por uso (R2V/NR) — só é relevante para categorias computáveis.
const categoriaTabelaVazia = (naoComputavel = true, quinhao = null) => ({
  id: "cat-" + Date.now() + Math.random(),
  nome: "Nova categoria",
  categoriaFixa: null,
  naoComputavel,
  quinhao,
});

const CATEGORIAS_TABELAS_PADRAO = [
  { id: "incentivo", nome: "Incentivo", categoriaFixa: "Incentivo", naoComputavel: true, quinhao: null, padrao: true },
  { id: "hisHmp", nome: "HIS e HMP", categoriaFixa: null, naoComputavel: true, quinhao: null, padrao: true, opcoesCategoria: ["HIS", "HMP"] },
  { id: "fachadaAtiva", nome: "Fachada Ativa", categoriaFixa: "Fachada Ativa", naoComputavel: true, quinhao: null, padrao: true },
  { id: "residencial", nome: "Residencial", categoriaFixa: null, naoComputavel: false, quinhao: "residencial", padrao: true },
];

const blocoVazio = () => ({
  id: Date.now() + Math.random(),
  nome: "",
  uso: "",
  quantidadeBlocos: "",
  escadas: "",
  tipoEscada: "",
  elevadores: "",
  lajes: [],
});

// tabela: id de uma das categoriasTabelas do bloco (por padrão: "residencial" | "incentivo" | "fachadaAtiva" | "hisHmp")
function unidadeVaziaFactory(tabela = "residencial") {
  const categoriaPadrao =
    tabela === "incentivo"
      ? "Incentivo"
      : tabela === "fachadaAtiva"
      ? "Fachada Ativa"
      : tabela === "hisHmp"
      ? "HIS"
      : "Residencial";
  return {
    id: Date.now() + Math.random(),
    tabela,
    descricao: "",
    categoria: categoriaPadrao,
    categoriaOutro: "",
    computavel: "",
    incentivoNaoComputavel: "",
    incentivo: "",
    terraco: "",
    areaTecnica: "",
    ornamento: "",
    hallPrivativo: "",
    descoberta: "",
    deposito: "",
    vagas: "",
  };
}
const unidadeVazia = unidadeVaziaFactory;

// Cada "laje" representa um grupo de pavimentos do bloco (Térreo, Pavimento Tipo,
// Duplex/Penthouse, Cobertura...), com suas áreas de uso comum/não computáveis
// e as unidades computáveis (puxadas do Resumo das Unidades) alocadas naquele grupo.
function lajeVaziaFactory() {
  return {
    id: Date.now() + Math.random(),
    tipo: "padrao",
    nome: "",
    quantidadePavimentos: "",
    vazios: "",
    // Computáveis
    circulacaoTotal: "",
    lazerR2V: "",
    lazerHMP: "",
    lazerHIS: "",
    terraco: "",
    outros: "",
    outrosNome: "",
    // Não computáveis
    circulacaoR: "",
    hallR: "",
    lazerR: "",
    terracoCNr: "",
    escadaNR: "",
    areaTecnica: "",
    outrosNaoComputavel: "",
    outrosNaoComputavelNome: "",
    terracoCR: "",
    unidadesNoPavimento: [],
    // Campos específicos do tipo "atico"
    areasComunsComputaveis: "",
    barrilete: "",
    casaDeMaquinas: "",
    reservatorioSuperior: "",
    areaTecnicaAtico: "",
  };
}
const lajeVazia = lajeVaziaFactory;

function aticoVazioFactory() {
  return { ...lajeVaziaFactory(), tipo: "atico", nome: "ÁTICO" };
}

// Pavimento térreo: mesmos campos de um pavimento normal (computável/não computável/unidades — NÃO
// usa os campos exclusivos do Ático), só com tipo/nome fixos para o Quadro de Áreas de Prefeitura
// identificar o pavimento térreo de cada bloco com segurança (em vez de adivinhar pelo nome digitado).
function terreoVazioFactory() {
  return { ...lajeVaziaFactory(), tipo: "terreo", nome: "TÉRREO" };
}

// Move um item de uma posição para cima (-1) ou para baixo (+1) dentro de uma lista
function moverItemLista(lista, index, direcao) {
  const novoIndex = index + direcao;
  if (novoIndex < 0 || novoIndex >= lista.length) return lista;
  const nova = [...lista];
  [nova[index], nova[novoIndex]] = [nova[novoIndex], nova[index]];
  return nova;
}

// Reordena uma lista movendo o item "idOrigem" para a posição de "idDestino" (usado no arrastar-e-soltar)
function moverParaPosicao(lista, idOrigem, idDestino) {
  const idxOrigem = lista.findIndex((x) => x.id === idOrigem);
  const idxDestino = lista.findIndex((x) => x.id === idDestino);
  if (idxOrigem === -1 || idxDestino === -1 || idxOrigem === idxDestino) return lista;
  const nova = [...lista];
  const [item] = nova.splice(idxOrigem, 1);
  nova.splice(idxDestino, 0, item);
  return nova;
}

// Ícone de "alça" para arrastar (grip). Usado nos cabeçalhos que podem ser reordenados.
function AlcaArrastar({ className = "" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      className={`shrink-0 text-slate-300 ${className}`}
      fill="currentColor"
    >
      <circle cx="6" cy="4" r="1.4" />
      <circle cx="6" cy="10" r="1.4" />
      <circle cx="6" cy="16" r="1.4" />
      <circle cx="12" cy="4" r="1.4" />
      <circle cx="12" cy="10" r="1.4" />
      <circle cx="12" cy="16" r="1.4" />
    </svg>
  );
}

// unidadeId identifica de forma única a unidade do catálogo alocada aqui (não confiar em "descricao"
// para isso — duas unidades podem ter o mesmo nome). "descricao" fica só como cache de exibição.
const itemUnidadeVazio = () => ({ id: Date.now() + Math.random(), unidadeId: "", descricao: "", quantidade: "" });

// Cada "nível" representa um pavimento de garagem (Sobresolo, Térreo, Subsolo...)
const nivelEstacionamentoVazio = () => ({
  id: Date.now() + Math.random(),
  nome: "",
  garagem: "",
  outros: "",
  computavel: "",
  observacoes: "",
});

export default function EstudoViabilidadeApp() {
  const [activeTab, setActiveTab] = useState("terreno");

  // --- Identificação do estudo (sidebar) ---
  const [cliente, setCliente] = useState("");
  const [nomeProjeto, setNomeProjeto] = useState("");
  const [arquitetoResponsavel, setArquitetoResponsavel] = useState("");
  const [opcaoEstudo, setOpcaoEstudo] = useState("");
  const [revisaoEstudo, setRevisaoEstudo] = useState("");

  // --- Dados do Terreno ---
  const [localEndereco, setLocalEndereco] = useState("");
  const [municipio, setMunicipio] = useState("São Paulo");
  const [testadaTerreno, setTestadaTerreno] = useState("");
  const [areaTerreno, setAreaTerreno] = useState("");
  const [reservaCalcada, setReservaCalcada] = useState("");
  const [doacao, setDoacao] = useState("");
  const [quinhaoNaoResidencial, setQuinhaoNaoResidencial] = useState("");
  const [subprefeitura, setSubprefeitura] = useState("");
  const [cotaSolidariedade, setCotaSolidariedade] = useState("");
  const [modalidadeCotaSolidariedade, setModalidadeCotaSolidariedade] = useState("");
  const [valorReferenciaM2Fundurb, setValorReferenciaM2Fundurb] = useState("");
  // Padrão legal: para a área da Cota de Solidariedade ser não computável no próprio lote, os 10%
  // mínimos devem ser destinados exclusivamente a HIS — por isso o split começa 100% HIS / 0% HMP.
  // Continua editável: o usuário pode ajustar para simular cenários com HMP.
  const [splitHISPercentual, setSplitHISPercentual] = useState("100");
  const [areaMediaUnidadeHIS, setAreaMediaUnidadeHIS] = useState("40");
  const [areaMediaUnidadeHMP, setAreaMediaUnidadeHMP] = useState("50");
  const [subdistrito, setSubdistrito] = useState("");

  const handleSubprefeituraChange = (nova) => {
    setSubprefeitura(nova);
    setSubdistrito(""); // reinicia o subdistrito, já que as opções mudam conforme a subprefeitura
  };

  // --- Zoneamento (usados como referência nos indicadores) ---
  const [zona, setZona] = useState("");
  const [caMinimoZona, setCaMinimoZona] = useState("");
  const [caBasicoZona, setCaBasicoZona] = useState("");
  const [caMaximoZona, setCaMaximoZona] = useState("");
  const [majoracaoCA, setMajoracaoCA] = useState("");
  const [caMaximoComBeneficiosManual, setCaMaximoComBeneficiosManual] = useState("");
  const [majoracaoNR, setMajoracaoNR] = useState("");
  const [aplicarBonusHMP, setAplicarBonusHMP] = useState("");
  const [aplicarBonusHIS, setAplicarBonusHIS] = useState("");
  const [residencialSemVagas, setResidencialSemVagas] = useState("");
  const [tpNecessaria, setTpNecessaria] = useState("");
  const [tpProjeto, setTpProjeto] = useState("");
  const [cotaAmbiental, setCotaAmbiental] = useState("");
  const [numeroUnidadesProjeto, setNumeroUnidadesProjeto] = useState("");
  const [toMaximaZona, setToMaximaZona] = useState("");
  const [gabaritoMaximoZona, setGabaritoMaximoZona] = useState("");
  const [cotaParteMaxima, setCotaParteMaxima] = useState("");
  const [cotaParteMinima, setCotaParteMinima] = useState("");

  // Preenche automaticamente CA básico/máximo, TO, gabarito e cota-parte a partir do
  // Quadro 3 (Lei nº 16.402/2016) quando a zona é selecionada.
  const preencherDoQuadro3 = (zonaSelecionada, terrenoAtual) => {
    const dados = QUADRO_3[zonaSelecionada];
    if (!dados) return;
    const terrenoNum = paraNumero(terrenoAtual);
    const toEscolhido =
      terrenoNum > 0 && terrenoNum < 500 ? dados.to500 : dados.toMais500 ?? dados.to500;
    setCaMinimoZona(dados.caMinimo !== null ? formatNumeroBR(dados.caMinimo) : "");
    setCaBasicoZona(dados.caBasico !== null ? formatNumeroBR(dados.caBasico) : "");
    setCaMaximoZona(dados.caMaximo !== null ? formatNumeroBR(dados.caMaximo) : "");
    setToMaximaZona(
      toEscolhido !== null && toEscolhido !== undefined ? formatNumeroBR(toEscolhido * 100) : ""
    );
    setGabaritoMaximoZona(dados.gabarito !== null ? formatNumeroBR(dados.gabarito) : "");
    setCotaParteMaxima(dados.cotaParteMaxima !== null ? formatNumeroBR(dados.cotaParteMaxima) : "");
  };

  const handleZonaChange = (novaZona) => {
    setZona(novaZona);
    preencherDoQuadro3(novaZona, areaTerreno);
  };

  // --- Arrastar e soltar (reordenar blocos, pavimentos e categorias arrastando o cabeçalho) ---
  const [itemArrastado, setItemArrastado] = useState(null); // { tipo, id, blocoId? }
  const iniciarArrasto = (tipo, id, blocoId) => setItemArrastado({ tipo, id, blocoId });
  const soltarArrasto = (tipo, idDestino, blocoId) => {
    if (!itemArrastado || itemArrastado.tipo !== tipo) return;
    if (tipo === "bloco") moverBlocoParaPosicao(itemArrastado.id, idDestino);
    if (tipo === "categoria") moverCategoriaParaPosicao(itemArrastado.id, idDestino);
    if (tipo === "laje" && itemArrastado.blocoId === blocoId) {
      moverLajeParaPosicao(blocoId, itemArrastado.id, idDestino);
    }
    setItemArrastado(null);
  };

  // --- Dados do Empreendimento (usos/blocos) ---
  const [blocos, setBlocos] = useState([blocoVazio()]);
  const updateBloco = (id, campo, valor) =>
    setBlocos((lista) => lista.map((b) => (b.id === id ? { ...b, [campo]: valor } : b)));
  const addBloco = () => setBlocos((b) => [...b, blocoVazio()]);
  const removeBloco = (id) => setBlocos((b) => b.filter((x) => x.id !== id));
  const moverBlocoParaPosicao = (idOrigem, idDestino) =>
    setBlocos((lista) => moverParaPosicao(lista, idOrigem, idDestino));

  // --- Categorias de uso das unidades: catálogo ÚNICO do projeto (não se repete por bloco) ---
  const [categoriasTabelas, setCategoriasTabelas] = useState(CATEGORIAS_TABELAS_PADRAO);
  const addCategoriaTabela = () => {
    const nova = categoriaTabelaVazia();
    setCategoriasTabelas((lista) => [...lista, nova]);
    // Categoria recém-criada pelo usuário começa expandida — ele acabou de decidir usá-la.
    setTabelasExpandidas((atual) => new Set(atual).add(nova.id));
  };
  const renameCategoriaTabela = (catId, nome) =>
    setCategoriasTabelas((lista) => lista.map((c) => (c.id === catId ? { ...c, nome } : c)));
  // tipo: "naoComputavel" | "residencial" | "naoResidencial" — define se a categoria conta como
  // área computável e, se contar, a qual quinhão do terreno ela pertence (usado no cálculo de
  // potencial construtivo por uso).
  const updateCategoriaTabelaTipo = (catId, tipo) =>
    setCategoriasTabelas((lista) =>
      lista.map((c) =>
        c.id === catId
          ? tipo === "naoComputavel"
            ? { ...c, naoComputavel: true, quinhao: null }
            : { ...c, naoComputavel: false, quinhao: tipo }
          : c
      )
    );
  const removeCategoriaTabela = (catId) =>
    setCategoriasTabelas((lista) => lista.filter((c) => c.id !== catId));
  const moverCategoriaParaPosicao = (idOrigem, idDestino) =>
    setCategoriasTabelas((lista) => moverParaPosicao(lista, idOrigem, idDestino));

  // Blocos minimizados (apenas controle visual, não afeta os dados)
  const [blocosMinimizados, setBlocosMinimizados] = useState(() => new Set());
  // Estacionamento é consulta pontual — começa recolhido por padrão.
  const [estacionamentoMinimizado, setEstacionamentoMinimizado] = useState(true);
  // Uso Não Residencial (NR): módulo opcional, só existe em projetos de uso misto — começa desligado.
  const [usoNaoResidencialAtivo, setUsoNaoResidencialAtivo] = useState("");
  // Nome do uso NR real (ex: "Hotel", "Comercial") — apenas rotula a linha na tabela "Potencial
  // Construtivo por Uso" (vira "NR Computável (Hotel)"), não afeta nenhum cálculo.
  const [nomeUsoNR, setNomeUsoNR] = useState("");
  const toggleMinimizarBloco = (id) =>
    setBlocosMinimizados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  // --- Resumo das Unidades: catálogo ÚNICO do projeto inteiro (não duplica por bloco).
  // A "Descrição" digitada aqui vira automaticamente uma tipologia disponível para qualquer
  // Pavimento, de qualquer bloco, em Dados do Empreendimento. ---
  const [unidadesGlobais, setUnidadesGlobais] = useState([]);
  const addUnidade = (tabela = "residencial") =>
    setUnidadesGlobais((lista) => [...lista, unidadeVazia(tabela)]);
  const removeUnidade = (unidadeId) =>
    setUnidadesGlobais((lista) => lista.filter((u) => u.id !== unidadeId));
  const updateUnidade = (unidadeId, campo, valor) =>
    setUnidadesGlobais((lista) => lista.map((u) => (u.id === unidadeId ? { ...u, [campo]: valor } : u)));

  // --- Estacionamento: Subsolos e Sobresolos (níveis de garagem do empreendimento) ---
  const [niveisEstacionamento, setNiveisEstacionamento] = useState([]);

  // --- Total Vagas (linha de cima do quadro de Estacionamento) ---
  const [vagasBicicleta, setVagasBicicleta] = useState("");
  const [vagasDescobertas, setVagasDescobertas] = useState("");
  const [vagasUti, setVagasUti] = useState("");
  const [vagasCaminhao, setVagasCaminhao] = useState("");
  const [vagasVisitante, setVagasVisitante] = useState("");
  const [vagasCarWash, setVagasCarWash] = useState("");
  const [vagasEletrico, setVagasEletrico] = useState("");
  const [vagasExtras, setVagasExtras] = useState("");
  const [vagasPneManual, setVagasPneManual] = useState("");
  const [vagasMotoManual, setVagasMotoManual] = useState("");
  const [obrasComplementares, setObrasComplementares] = useState("");
  const addNivelEstacionamento = () =>
    setNiveisEstacionamento((lista) => [...lista, nivelEstacionamentoVazio()]);
  const removeNivelEstacionamento = (id) =>
    setNiveisEstacionamento((lista) => lista.filter((n) => n.id !== id));
  const updateNivelEstacionamento = (id, campo, valor) =>
    setNiveisEstacionamento((lista) => lista.map((n) => (n.id === id ? { ...n, [campo]: valor } : n)));

  // --- Pavimentos/lajes de cada bloco ---
  const addLaje = (blocoId) =>
    setBlocos((lista) =>
      lista.map((b) => (b.id === blocoId ? { ...b, lajes: [...b.lajes, lajeVazia()] } : b))
    );
  const addAtico = (blocoId) =>
    setBlocos((lista) =>
      lista.map((b) => (b.id === blocoId ? { ...b, lajes: [...b.lajes, aticoVazioFactory()] } : b))
    );
  const addTerreo = (blocoId) =>
    setBlocos((lista) =>
      lista.map((b) => (b.id === blocoId ? { ...b, lajes: [...b.lajes, terreoVazioFactory()] } : b))
    );
  const removeLaje = (blocoId, lajeId) =>
    setBlocos((lista) =>
      lista.map((b) => (b.id === blocoId ? { ...b, lajes: b.lajes.filter((l) => l.id !== lajeId) } : b))
    );
  const moverLajeParaPosicao = (blocoId, idOrigem, idDestino) =>
    setBlocos((lista) =>
      lista.map((b) => (b.id === blocoId ? { ...b, lajes: moverParaPosicao(b.lajes, idOrigem, idDestino) } : b))
    );
  const updateLaje = (blocoId, lajeId, campo, valor) =>
    setBlocos((lista) =>
      lista.map((b) =>
        b.id === blocoId
          ? { ...b, lajes: b.lajes.map((l) => (l.id === lajeId ? { ...l, [campo]: valor } : l)) }
          : b
      )
    );

  // Pavimentos minimizados (apenas controle visual)
  const [lajesMinimizadas, setLajesMinimizadas] = useState(() => new Set());
  const toggleMinimizarLaje = (id) =>
    setLajesMinimizadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  // Tabelas do Resumo das Unidades: as avançadas (Incentivo, HIS e HMP, Fachada Ativa) começam
  // recolhidas por padrão — só a Residencial (núcleo do estudo) começa expandida.
  const [tabelasExpandidas, setTabelasExpandidas] = useState(() => new Set(["residencial"]));
  const toggleTabelaExpandida = (chave) =>
    setTabelasExpandidas((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  // --- Autosave (localStorage) ---
  // Carrega uma vez ao montar: se houver um estudo salvo, restaura os campos preenchidos. Roda
  // depois de todos os useState acima já terem os valores padrão, então os setters aqui só
  // sobrescrevem o que existir salvo — sem dado salvo, o formulário permanece em branco.
  useEffect(() => {
    let dados;
    try {
      const bruto = localStorage.getItem(AUTOSAVE_KEY);
      if (!bruto) return;
      dados = JSON.parse(bruto);
    } catch {
      return; // dado corrompido — ignora e mantém os valores padrão
    }
    // "custos" foi removida do app — projetos salvos antes disso caem em "indicadores".
    if (dados.activeTab !== undefined)
      setActiveTab(dados.activeTab === "custos" ? "indicadores" : dados.activeTab);
    if (dados.cliente !== undefined) setCliente(dados.cliente);
    if (dados.nomeProjeto !== undefined) setNomeProjeto(dados.nomeProjeto);
    if (dados.arquitetoResponsavel !== undefined) setArquitetoResponsavel(dados.arquitetoResponsavel);
    if (dados.opcaoEstudo !== undefined) setOpcaoEstudo(dados.opcaoEstudo);
    if (dados.revisaoEstudo !== undefined) setRevisaoEstudo(dados.revisaoEstudo);
    if (dados.localEndereco !== undefined) setLocalEndereco(dados.localEndereco);
    if (dados.municipio !== undefined) setMunicipio(dados.municipio);
    if (dados.testadaTerreno !== undefined) setTestadaTerreno(dados.testadaTerreno);
    if (dados.areaTerreno !== undefined) setAreaTerreno(dados.areaTerreno);
    if (dados.reservaCalcada !== undefined) setReservaCalcada(dados.reservaCalcada);
    if (dados.doacao !== undefined) setDoacao(dados.doacao);
    if (dados.quinhaoNaoResidencial !== undefined) setQuinhaoNaoResidencial(dados.quinhaoNaoResidencial);
    if (dados.subprefeitura !== undefined) setSubprefeitura(dados.subprefeitura);
    if (dados.cotaSolidariedade !== undefined) setCotaSolidariedade(dados.cotaSolidariedade);
    if (dados.modalidadeCotaSolidariedade !== undefined)
      setModalidadeCotaSolidariedade(dados.modalidadeCotaSolidariedade);
    if (dados.valorReferenciaM2Fundurb !== undefined)
      setValorReferenciaM2Fundurb(dados.valorReferenciaM2Fundurb);
    if (dados.splitHISPercentual !== undefined) setSplitHISPercentual(dados.splitHISPercentual);
    if (dados.areaMediaUnidadeHIS !== undefined) setAreaMediaUnidadeHIS(dados.areaMediaUnidadeHIS);
    if (dados.areaMediaUnidadeHMP !== undefined) setAreaMediaUnidadeHMP(dados.areaMediaUnidadeHMP);
    if (dados.subdistrito !== undefined) setSubdistrito(dados.subdistrito);
    if (dados.zona !== undefined) setZona(dados.zona);
    if (dados.caMinimoZona !== undefined) setCaMinimoZona(dados.caMinimoZona);
    if (dados.caBasicoZona !== undefined) setCaBasicoZona(dados.caBasicoZona);
    if (dados.caMaximoZona !== undefined) setCaMaximoZona(dados.caMaximoZona);
    if (dados.majoracaoCA !== undefined) setMajoracaoCA(dados.majoracaoCA);
    if (dados.caMaximoComBeneficiosManual !== undefined)
      setCaMaximoComBeneficiosManual(dados.caMaximoComBeneficiosManual);
    if (dados.majoracaoNR !== undefined) setMajoracaoNR(dados.majoracaoNR);
    if (dados.aplicarBonusHMP !== undefined) setAplicarBonusHMP(dados.aplicarBonusHMP);
    if (dados.aplicarBonusHIS !== undefined) setAplicarBonusHIS(dados.aplicarBonusHIS);
    if (dados.residencialSemVagas !== undefined) setResidencialSemVagas(dados.residencialSemVagas);
    if (dados.tpNecessaria !== undefined) setTpNecessaria(dados.tpNecessaria);
    if (dados.tpProjeto !== undefined) setTpProjeto(dados.tpProjeto);
    if (dados.cotaAmbiental !== undefined) setCotaAmbiental(dados.cotaAmbiental);
    if (dados.numeroUnidadesProjeto !== undefined) setNumeroUnidadesProjeto(dados.numeroUnidadesProjeto);
    if (dados.toMaximaZona !== undefined) setToMaximaZona(dados.toMaximaZona);
    if (dados.gabaritoMaximoZona !== undefined) setGabaritoMaximoZona(dados.gabaritoMaximoZona);
    if (dados.cotaParteMaxima !== undefined) setCotaParteMaxima(dados.cotaParteMaxima);
    if (dados.cotaParteMinima !== undefined) setCotaParteMinima(dados.cotaParteMinima);
    if (dados.blocos !== undefined) setBlocos(dados.blocos);
    if (dados.categoriasTabelas !== undefined) setCategoriasTabelas(dados.categoriasTabelas);
    if (dados.usoNaoResidencialAtivo !== undefined) setUsoNaoResidencialAtivo(dados.usoNaoResidencialAtivo);
    if (dados.nomeUsoNR !== undefined) setNomeUsoNR(dados.nomeUsoNR);
    if (dados.unidadesGlobais !== undefined) setUnidadesGlobais(dados.unidadesGlobais);
    if (dados.niveisEstacionamento !== undefined) setNiveisEstacionamento(dados.niveisEstacionamento);
    if (dados.vagasBicicleta !== undefined) setVagasBicicleta(dados.vagasBicicleta);
    if (dados.vagasDescobertas !== undefined) setVagasDescobertas(dados.vagasDescobertas);
    if (dados.vagasUti !== undefined) setVagasUti(dados.vagasUti);
    if (dados.vagasCaminhao !== undefined) setVagasCaminhao(dados.vagasCaminhao);
    if (dados.vagasVisitante !== undefined) setVagasVisitante(dados.vagasVisitante);
    if (dados.vagasCarWash !== undefined) setVagasCarWash(dados.vagasCarWash);
    if (dados.vagasEletrico !== undefined) setVagasEletrico(dados.vagasEletrico);
    if (dados.vagasExtras !== undefined) setVagasExtras(dados.vagasExtras);
    if (dados.vagasPneManual !== undefined) setVagasPneManual(dados.vagasPneManual);
    if (dados.vagasMotoManual !== undefined) setVagasMotoManual(dados.vagasMotoManual);
    if (dados.obrasComplementares !== undefined) setObrasComplementares(dados.obrasComplementares);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Salva automaticamente (com pequeno debounce) sempre que algum campo preenchido pelo usuário
  // muda — sobrevive a travamentos, fechar a aba ou atualizar a página (F5).
  useEffect(() => {
    const dados = {
      activeTab,
      cliente,
      nomeProjeto,
      arquitetoResponsavel,
      opcaoEstudo,
      revisaoEstudo,
      localEndereco,
      municipio,
      testadaTerreno,
      areaTerreno,
      reservaCalcada,
      doacao,
      quinhaoNaoResidencial,
      subprefeitura,
      cotaSolidariedade,
      modalidadeCotaSolidariedade,
      valorReferenciaM2Fundurb,
      splitHISPercentual,
      areaMediaUnidadeHIS,
      areaMediaUnidadeHMP,
      subdistrito,
      zona,
      caMinimoZona,
      caBasicoZona,
      caMaximoZona,
      majoracaoCA,
      caMaximoComBeneficiosManual,
      majoracaoNR,
      aplicarBonusHMP,
      aplicarBonusHIS,
      residencialSemVagas,
      tpNecessaria,
      tpProjeto,
      cotaAmbiental,
      numeroUnidadesProjeto,
      toMaximaZona,
      gabaritoMaximoZona,
      cotaParteMaxima,
      cotaParteMinima,
      blocos,
      categoriasTabelas,
      usoNaoResidencialAtivo,
      nomeUsoNR,
      unidadesGlobais,
      niveisEstacionamento,
      vagasBicicleta,
      vagasDescobertas,
      vagasUti,
      vagasCaminhao,
      vagasVisitante,
      vagasCarWash,
      vagasEletrico,
      vagasExtras,
      vagasPneManual,
      vagasMotoManual,
      obrasComplementares,
    };
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(dados));
      } catch {
        // localStorage indisponível ou cheio — autosave falha silenciosamente, sem travar o app
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [
    activeTab,
    cliente,
    nomeProjeto,
    arquitetoResponsavel,
    opcaoEstudo,
    revisaoEstudo,
    localEndereco,
    municipio,
    testadaTerreno,
    areaTerreno,
    reservaCalcada,
    doacao,
    quinhaoNaoResidencial,
    subprefeitura,
    cotaSolidariedade,
    modalidadeCotaSolidariedade,
    valorReferenciaM2Fundurb,
    splitHISPercentual,
    areaMediaUnidadeHIS,
    areaMediaUnidadeHMP,
    subdistrito,
    zona,
    caMinimoZona,
    caBasicoZona,
    caMaximoZona,
    majoracaoCA,
    caMaximoComBeneficiosManual,
    majoracaoNR,
    aplicarBonusHMP,
    aplicarBonusHIS,
    residencialSemVagas,
    tpNecessaria,
    tpProjeto,
    cotaAmbiental,
    numeroUnidadesProjeto,
    toMaximaZona,
    gabaritoMaximoZona,
    cotaParteMaxima,
    cotaParteMinima,
    blocos,
    categoriasTabelas,
    usoNaoResidencialAtivo,
    nomeUsoNR,
    unidadesGlobais,
    niveisEstacionamento,
    vagasBicicleta,
    vagasDescobertas,
    vagasUti,
    vagasCaminhao,
    vagasVisitante,
    vagasCarWash,
    vagasEletrico,
    vagasExtras,
    vagasPneManual,
    vagasMotoManual,
    obrasComplementares,
  ]);

  // "Novo projeto": apaga o estudo salvo e recarrega a página em branco. Usa um modal próprio (em
  // vez de window.confirm) porque o preview embutido do navegador engole o diálogo nativo do
  // navegador sem mostrar nada — o clique parecia não fazer nada.
  const [confirmandoNovoProjeto, setConfirmandoNovoProjeto] = useState(false);
  const confirmarNovoProjeto = () => {
    localStorage.removeItem(AUTOSAVE_KEY);
    window.location.reload();
  };

  // --- Unidades computáveis alocadas dentro de um pavimento (laje) ---
  const addItemUnidade = (blocoId, lajeId) =>
    setBlocos((lista) =>
      lista.map((b) =>
        b.id === blocoId
          ? {
              ...b,
              lajes: b.lajes.map((l) =>
                l.id === lajeId
                  ? { ...l, unidadesNoPavimento: [...l.unidadesNoPavimento, itemUnidadeVazio()] }
                  : l
              ),
            }
          : b
      )
    );
  const removeItemUnidade = (blocoId, lajeId, itemId) =>
    setBlocos((lista) =>
      lista.map((b) =>
        b.id === blocoId
          ? {
              ...b,
              lajes: b.lajes.map((l) =>
                l.id === lajeId
                  ? { ...l, unidadesNoPavimento: l.unidadesNoPavimento.filter((it) => it.id !== itemId) }
                  : l
              ),
            }
          : b
      )
    );
  const updateItemUnidade = (blocoId, lajeId, itemId, campo, valor) =>
    setBlocos((lista) =>
      lista.map((b) =>
        b.id === blocoId
          ? {
              ...b,
              lajes: b.lajes.map((l) =>
                l.id === lajeId
                  ? {
                      ...l,
                      unidadesNoPavimento: l.unidadesNoPavimento.map((it) =>
                        it.id === itemId ? { ...it, [campo]: valor } : it
                      ),
                    }
                  : l
              ),
            }
          : b
      )
    );
  // Grava unidadeId (chave real de referência) e descricao (cache de exibição) juntos, num só
  // update — usado quando o usuário escolhe a unidade no seletor do pavimento.
  const selecionarUnidadeItemPavimento = (blocoId, lajeId, itemId, unidadeId, descricao) =>
    setBlocos((lista) =>
      lista.map((b) =>
        b.id === blocoId
          ? {
              ...b,
              lajes: b.lajes.map((l) =>
                l.id === lajeId
                  ? {
                      ...l,
                      unidadesNoPavimento: l.unidadesNoPavimento.map((it) =>
                        it.id === itemId ? { ...it, unidadeId, descricao } : it
                      ),
                    }
                  : l
              ),
            }
          : b
      )
    );

  // ------------------------------------------------------------------
  // AGREGADOS (calculados automaticamente — mesma lógica da planilha)
  // ------------------------------------------------------------------
  const agregados = useMemo(() => {
    const terreno = paraNumero(areaTerreno);
    const areaRemanescente = terreno > 0 ? terreno - paraNumero(doacao) : null;
    // Regra de negócio: o terraço de cada pavimento não pode ultrapassar 5% da área remanescente do terreno
    const limiteTerracoPorPavimento =
      areaRemanescente !== null && areaRemanescente > 0 ? areaRemanescente * 0.05 : null;

    // Verifica se a unidade está marcada como HIS ou HMP pelo campo "Categoria" (funciona não
    // importa em qual tabela/categoria de tabela ela foi cadastrada — Resumo das Unidades, HIS e
    // HMP, ou qualquer categoria personalizada — e também via "Outro" com o texto "HIS"/"HMP").
    const unidadeEhCategoria = (ref, alvo) => {
      if (!ref) return false;
      const normalizar = (v) => (v || "").toString().trim().toUpperCase();
      if (normalizar(ref.categoria) === alvo) return true;
      if (normalizar(ref.categoria) === "OUTRO" && normalizar(ref.categoriaOutro) === alvo) return true;
      return false;
    };

    // Cada linha do Resumo das Unidades define os dados POR UNIDADE (não multiplicados).
    // Privativa por unidade = Computável + Incentivo + Terraço + Á.Técnica + Ornamento + Descoberta + Depósito
    const calcularLinha = (u, categoriaInfo) => {
      const computavel = paraNumero(u.computavel);
      const incentivoNaoComputavel = paraNumero(u.incentivoNaoComputavel);
      const incentivo = paraNumero(u.incentivo);
      const terraco = paraNumero(u.terraco);
      const areaTecnica = paraNumero(u.areaTecnica);
      const ornamento = paraNumero(u.ornamento);
      const descoberta = paraNumero(u.descoberta);
      const deposito = paraNumero(u.deposito);
      const hallPrivativo = paraNumero(u.hallPrivativo);
      const vagas = paraNumero(u.vagas);
      const privativaUnidade =
        computavel +
        incentivoNaoComputavel +
        incentivo +
        terraco +
        areaTecnica +
        ornamento +
        descoberta +
        deposito +
        hallPrivativo;
      const percentualTerracoPrivativa = privativaUnidade > 0 ? (terraco / privativaUnidade) * 100 : null;
      // Auditoria de metragem mínima HIS/HMP (soft warning — nunca bloqueia o preenchimento).
      // Área privativa mínima aqui = computável + terraço social, propositalmente SEM a área
      // técnica (terraço técnico/equipamentos), que é acessória e não conta para o mínimo exigido.
      const ehHisOuHmp = unidadeEhCategoria(u, "HIS") || unidadeEhCategoria(u, "HMP");
      const areaPrivativaHabitacional = computavel + terraco;
      const abaixoComputavelMinimoHISHMP =
        ehHisOuHmp && computavel > 0 && computavel < HIS_HMP_COMPUTAVEL_MINIMO;
      const abaixoPrivativaMinimaHISHMP =
        ehHisOuHmp && areaPrivativaHabitacional > 0 && areaPrivativaHabitacional < HIS_HMP_PRIVATIVA_MINIMA;
      // A "computável" de uma unidade é sempre o valor cru digitado no campo "Computável (m²)",
      // não importa em qual tabela/categoria ela está cadastrada. A tabela (Incentivo, HIS e HMP
      // etc.) é só uma organização visual — não zera a computável automaticamente. Isso permite
      // unidades "híbridas" na planilha de referência (ex: "2D HIS (unidade híbrida)", cadastrada
      // na tabela HIS e HMP mas com uma parte computável e outra parte incentivo não computável na
      // MESMA linha) — zerar a computável por causa da tabela descartava essa parte legitimamente
      // computável e sub-contava a Área Computável Total do projeto.
      return {
        ...u,
        privativaUnidade,
        computavelUnidade: computavel,
        vagasUnidade: vagas,
        hallPrivativoUnidade: hallPrivativo,
        incentivoNaoComputavelUnidade: incentivoNaoComputavel,
        incentivoUnidade: incentivo,
        terracoUnidade: terraco,
        areaTecnicaUnidade: areaTecnica,
        ornamentoUnidade: ornamento,
        descobertaUnidade: descoberta,
        depositoUnidade: deposito,
        percentualTerracoPrivativa,
        ehHisOuHmp,
        abaixoComputavelMinimoHISHMP,
        abaixoPrivativaMinimaHISHMP,
      };
    };

    // Resolve a unidade de catálogo referenciada por um item alocado num pavimento. Prioriza o
    // "unidadeId" (identificador único, imune a nomes repetidos). Cai para busca por descrição só
    // como compatibilidade com alocações antigas feitas antes desse campo existir — nesse caso, se
    // houver duas unidades com o mesmo nome, o resultado é ambíguo (mesmo comportamento de antes);
    // reabrir o seletor da unidade no pavimento resolve, porque grava o unidadeId.
    const resolverUnidadeItem = (it, unidadesPorId, unidadesPorDescricaoGlobal) =>
      (it.unidadeId && unidadesPorId[it.unidadeId]) || unidadesPorDescricaoGlobal[it.descricao] || null;

    // As unidades computáveis alocadas no pavimento vêm do catálogo GLOBAL do Resumo das Unidades
    // (de qualquer bloco do projeto): privativa/computável/vagas são somados a partir da quantidade
    // preenchida aqui, multiplicados depois pela quantidade de pavimentos.
    const calcularLaje = (l, unidadesPorId, unidadesPorDescricaoGlobal) => {
      const itens = (l.unidadesNoPavimento || []).map((it) => {
        const ref = resolverUnidadeItem(it, unidadesPorId, unidadesPorDescricaoGlobal);
        const qtd = paraNumero(it.quantidade);
        const privativaUnit = ref ? ref.privativaUnidade : 0;
        const vagasUnit = ref ? ref.vagasUnidade : 0;
        const computavelUnit = ref ? ref.computavelUnidade : 0;
        const hallPrivativoUnit = ref ? ref.hallPrivativoUnidade : 0;
        const incentivoNaoComputavelUnit = ref ? ref.incentivoNaoComputavelUnidade : 0;
        const incentivoUnit = ref ? ref.incentivoUnidade : 0;
        const terracoUnit = ref ? ref.terracoUnidade : 0;
        const areaTecnicaUnit = ref ? ref.areaTecnicaUnidade : 0;
        const ornamentoUnit = ref ? ref.ornamentoUnidade : 0;
        const descobertaUnit = ref ? ref.descobertaUnidade : 0;
        const depositoUnit = ref ? ref.depositoUnidade : 0;
        return {
          ...it,
          qtd,
          privativaItem: privativaUnit * qtd,
          vagasItem: vagasUnit * qtd,
          computavelItem: computavelUnit * qtd,
          hallPrivativoItem: hallPrivativoUnit * qtd,
          incentivoNaoComputavelItem: incentivoNaoComputavelUnit * qtd,
          incentivoItem: incentivoUnit * qtd,
          terracoItem: terracoUnit * qtd,
          areaTecnicaItem: areaTecnicaUnit * qtd,
          ornamentoItem: ornamentoUnit * qtd,
          descobertaItem: descobertaUnit * qtd,
          depositoItem: depositoUnit * qtd,
        };
      });
      const privativaLaje = itens.reduce((acc, it) => acc + it.privativaItem, 0);
      const vagasLaje = itens.reduce((acc, it) => acc + it.vagasItem, 0);
      const computavelDasUnidadesLaje = itens.reduce((acc, it) => acc + it.computavelItem, 0);
      const hallPrivativoLaje = itens.reduce((acc, it) => acc + it.hallPrivativoItem, 0);
      const incentivoNaoComputavelDasUnidadesLaje = itens.reduce((acc, it) => acc + it.incentivoNaoComputavelItem, 0);
      const incentivoDasUnidadesLaje = itens.reduce((acc, it) => acc + it.incentivoItem, 0);
      const terracoDasUnidadesLaje = itens.reduce((acc, it) => acc + it.terracoItem, 0);
      const areaTecnicaDasUnidadesLaje = itens.reduce((acc, it) => acc + it.areaTecnicaItem, 0);
      const ornamentoDasUnidadesLaje = itens.reduce((acc, it) => acc + it.ornamentoItem, 0);
      const descobertaDasUnidadesLaje = itens.reduce((acc, it) => acc + it.descobertaItem, 0);
      const depositoDasUnidadesLaje = itens.reduce((acc, it) => acc + it.depositoItem, 0);
      const quantidadeUnidadesLaje = itens.reduce((acc, it) => acc + it.qtd, 0);

      // Áreas comuns computáveis = soma de Circulação Total + Lazer R2V + Lazer HMP + Lazer HIS + Terraço + Outros
      const circulacaoTotal = paraNumero(l.circulacaoTotal);
      const lazerR2V = paraNumero(l.lazerR2V);
      const lazerHMP = paraNumero(l.lazerHMP);
      const lazerHIS = paraNumero(l.lazerHIS);
      const terracoComum = paraNumero(l.terraco);
      const outros = paraNumero(l.outros);
      const areasComunsComputaveisPadrao = circulacaoTotal + lazerR2V + lazerHMP + lazerHIS + terracoComum + outros;

      // Áreas comuns não computáveis = soma de TODAS as células "não computável" do pavimento
      const circulacaoR = paraNumero(l.circulacaoR);
      const hallR = paraNumero(l.hallR);
      const areaTecnicaNaoComp = paraNumero(l.areaTecnica);
      const lazerR = paraNumero(l.lazerR);
      const outrosNaoComputavel = paraNumero(l.outrosNaoComputavel);
      const terracoCNr = paraNumero(l.terracoCNr);
      const escadaNR = paraNumero(l.escadaNR);
      const terracoCR = paraNumero(l.terracoCR);
      const areasComunsNaoComputaveis =
        circulacaoR + hallR + lazerR + terracoCNr + escadaNR + areaTecnicaNaoComp + outrosNaoComputavel + terracoCR;

      const quantidadePavimentos = paraNumero(l.quantidadePavimentos);
      const areasComunsNaoComputaveisPavimentos = areasComunsNaoComputaveis * quantidadePavimentos;

      // Não computável (coluna da tabela) = Áreas comuns não computáveis do pavimento + Hall Privativo,
      // Terraço, Floreira, Área técnica e Incentivo não computável vindos das unidades alocadas (a área
      // técnica do pavimento já está dentro de "Áreas comuns não computáveis", por isso aqui somamos só
      // a parte das unidades).
      const naoComputavelTabelaLaje =
        areasComunsNaoComputaveis +
        hallPrivativoLaje +
        terracoDasUnidadesLaje +
        ornamentoDasUnidadesLaje +
        areaTecnicaDasUnidadesLaje +
        incentivoNaoComputavelDasUnidadesLaje;
      const naoComputavelTabelaPavimentos = naoComputavelTabelaLaje * quantidadePavimentos;

      // Computável da laje = computável das unidades alocadas + áreas comuns computáveis
      const computavelLaje = computavelDasUnidadesLaje + areasComunsComputaveisPadrao;
      const computavelPavimentos = computavelLaje * quantidadePavimentos;

      // Totais da laje/dos pavimentos = Privativa (unidades) + Áreas comuns computáveis + Áreas comuns não computáveis
      const totalLaje = privativaLaje + areasComunsComputaveisPadrao + areasComunsNaoComputaveis;
      const totalPavimentos = totalLaje * quantidadePavimentos;
      const privativaPavimentos = privativaLaje * quantidadePavimentos;
      const vagasPavimentos = vagasLaje * quantidadePavimentos;
      const quantidadeUnidadesPavimentos = quantidadeUnidadesLaje * quantidadePavimentos;

      // Detalhamento das unidades alocadas (igual ao quadro "Totais na laje / Totais dos pavimentos" da planilha)
      const incentivoNaoComputavelPavimentos = incentivoNaoComputavelDasUnidadesLaje * quantidadePavimentos;
      const incentivoPavimentos = incentivoDasUnidadesLaje * quantidadePavimentos;
      const terracoUnidadesPavimentos = terracoDasUnidadesLaje * quantidadePavimentos;
      // Á. técnica exibida = área técnica das unidades alocadas + Área técnica não computável do próprio pavimento
      const areaTecnicaTotalLaje = areaTecnicaDasUnidadesLaje + areaTecnicaNaoComp;
      const areaTecnicaUnidadesPavimentos = areaTecnicaTotalLaje * quantidadePavimentos;
      const ornamentoPavimentos = ornamentoDasUnidadesLaje * quantidadePavimentos;
      const descobertaPavimentos = descobertaDasUnidadesLaje * quantidadePavimentos;
      const depositoPavimentos = depositoDasUnidadesLaje * quantidadePavimentos;

      const terracoUtilizado =
        terracoDasUnidadesLaje + paraNumero(l.terraco) + paraNumero(l.terracoCNr) + paraNumero(l.terracoCR);
      const terracoExcedido = limiteTerracoPorPavimento !== null && terracoUtilizado > limiteTerracoPorPavimento;
      const hallPrivativoPavimentos = hallPrivativoLaje * quantidadePavimentos;

      // Cálculos específicos do grupo "Ático" (estrutura simplificada, conforme planilha)
      const areasComunsComputaveisAtico = paraNumero(l.areasComunsComputaveis);
      const vazios = paraNumero(l.vazios);
      const barrilete = paraNumero(l.barrilete);
      const casaDeMaquinas = paraNumero(l.casaDeMaquinas);
      const reservatorioSuperior = paraNumero(l.reservatorioSuperior);
      const areaTecnicaAtico = paraNumero(l.areaTecnicaAtico);
      const areasComunsNaoComputaveisAtico = barrilete + casaDeMaquinas + reservatorioSuperior + areaTecnicaAtico;
      const pavimentoSemVazios = areasComunsComputaveisAtico + areasComunsNaoComputaveisAtico;
      const pavimentoComVazios = pavimentoSemVazios + vazios;
      const totalPavimentosAtico = pavimentoComVazios * quantidadePavimentos;

      return {
        ...l,
        itens,
        quantidadePavimentos,
        totalLaje,
        totalPavimentos,
        areasComunsComputaveisPadrao,
        areasComunsNaoComputaveis,
        areasComunsNaoComputaveisPavimentos,
        naoComputavelTabelaLaje,
        naoComputavelTabelaPavimentos,
        privativaLaje,
        privativaPavimentos,
        vagasLaje,
        vagasPavimentos,
        computavelLaje,
        computavelPavimentos,
        computavelDasUnidadesLaje,
        hallPrivativoLaje,
        hallPrivativoPavimentos,
        quantidadeUnidadesLaje,
        quantidadeUnidadesPavimentos,
        incentivoNaoComputavelDasUnidadesLaje,
        incentivoNaoComputavelPavimentos,
        incentivoDasUnidadesLaje,
        incentivoPavimentos,
        terracoDasUnidadesLaje,
        terracoUnidadesPavimentos,
        areaTecnicaDasUnidadesLaje,
        areaTecnicaTotalLaje,
        areaTecnicaUnidadesPavimentos,
        ornamentoDasUnidadesLaje,
        ornamentoPavimentos,
        descobertaDasUnidadesLaje,
        descobertaPavimentos,
        depositoDasUnidadesLaje,
        depositoPavimentos,
        terracoUtilizado,
        terracoExcedido,
        areasComunsNaoComputaveisAtico,
        pavimentoSemVazios,
        pavimentoComVazios,
        totalPavimentosAtico,
      };
    };

    // Catálogo ÚNICO de unidades do projeto (Resumo das Unidades não se repete por bloco).
    // Qualquer Pavimento, de qualquer bloco, pode alocar qualquer unidade cadastrada aqui.
    const categoriaPorId = Object.fromEntries(categoriasTabelas.map((c) => [c.id, c]));
    const linhasGlobais = unidadesGlobais.map((u) => calcularLinha(u, categoriaPorId[u.tabela]));
    const tipologiasGlobais = Array.from(
      new Set(linhasGlobais.map((l) => l.descricao.trim()).filter(Boolean))
    );
    // unidadesPorDescricaoGlobal só existe para resolver alocações antigas (sem unidadeId ainda
    // gravado) — quando duas unidades têm a mesma descrição, essa busca é ambígua por natureza
    // (a última entrada do catálogo "ganha"). unidadesPorId é a fonte de verdade a partir de agora.
    const unidadesPorDescricaoGlobal = Object.fromEntries(
      linhasGlobais.filter((l) => l.descricao.trim()).map((l) => [l.descricao, l])
    );
    const unidadesPorId = Object.fromEntries(linhasGlobais.map((l) => [String(l.id), l]));
    // Descrições repetidas no catálogo — usado só para avisar o usuário na interface (agora que a
    // alocação é por ID, nomes repetidos não corrompem mais os cálculos, mas ainda merecem aviso
    // porque dificultam saber qual unidade está selecionada em cada pavimento).
    const contagemDescricoes = {};
    linhasGlobais.forEach((l) => {
      const d = l.descricao.trim();
      if (!d) return;
      contagemDescricoes[d] = (contagemDescricoes[d] || 0) + 1;
    });
    const descricoesDuplicadas = new Set(
      Object.keys(contagemDescricoes).filter((d) => contagemDescricoes[d] > 1)
    );

    // Com o catálogo global pronto, calcula os pavimentos de cada bloco.
    const blocosComputados = blocos.map((bloco, i) => {
      const nomeExibicao = bloco.nome.trim() || bloco.uso || `Uso / Bloco ${i + 1}`;

      const lajesComputadas = bloco.lajes.map((l) => calcularLaje(l, unidadesPorId, unidadesPorDescricaoGlobal));
      const totalPavimentosBloco = lajesComputadas.reduce((acc, l) => acc + l.quantidadePavimentos, 0);
      const totalAreaComumBloco = lajesComputadas.reduce(
        (acc, l) =>
          acc +
          (l.tipo === "atico"
            ? l.areasComunsNaoComputaveisAtico * l.quantidadePavimentos
            : l.areasComunsNaoComputaveisPavimentos),
        0
      );
      const totalPrivativaLajesBloco = lajesComputadas.reduce((acc, l) => acc + l.privativaPavimentos, 0);
      const totalVagasLajesBloco = lajesComputadas.reduce((acc, l) => acc + l.vagasPavimentos, 0);
      const totalComputavelLajesBloco = lajesComputadas.reduce((acc, l) => acc + l.computavelPavimentos, 0);
      const totalUnidadesBloco = lajesComputadas.reduce((acc, l) => acc + l.quantidadeUnidadesPavimentos, 0);
      const totalPavimentosSemAticoBloco = lajesComputadas.reduce(
        (acc, l) => acc + (l.tipo === "atico" ? 0 : l.quantidadePavimentos),
        0
      );
      const totalIncentivoNaoComputavelBloco = lajesComputadas.reduce(
        (acc, l) => acc + l.incentivoNaoComputavelPavimentos,
        0
      );
      const totalTerracoUnidadesBloco = lajesComputadas.reduce((acc, l) => acc + l.terracoUnidadesPavimentos, 0);
      const totalAreaTecnicaUnidadesBloco = lajesComputadas.reduce(
        (acc, l) => acc + l.areaTecnicaUnidadesPavimentos,
        0
      );
      const totalOrnamentoBloco = lajesComputadas.reduce((acc, l) => acc + l.ornamentoPavimentos, 0);
      const totalDescobertaBloco = lajesComputadas.reduce((acc, l) => acc + l.descobertaPavimentos, 0);
      const totalDepositoBloco = lajesComputadas.reduce((acc, l) => acc + l.depositoPavimentos, 0);
      const totalNaoComputavelBloco =
        totalIncentivoNaoComputavelBloco +
        totalTerracoUnidadesBloco +
        totalAreaTecnicaUnidadesBloco +
        totalOrnamentoBloco;
      // "Não computável" no mesmo padrão da tabela do Pavimento: áreas comuns não computáveis do
      // pavimento + Hall Privativo/Terraço/Floreira/Área técnica vindos das unidades alocadas. O
      // Ático inteiro (barrilete/casa de máquinas/reservatório/área técnica) ENTRA aqui — confirmado
      // na fórmula oficial da planilha real: a "NÃO COMPUTÁVEL TOTAL" do bloco (RESIDENCIAL 1!H10)
      // soma o próprio bloco do Ático (H1467) junto com os demais pavimentos. Uma correção anterior
      // desta sessão excluía o Ático por engano, baseada numa leitura incompleta de uma linha de
      // referência diferente (Quadro de Áreas de Prefeitura); revertido depois de validar contra a
      // fórmula real de "Totais dos pavimentos" por grupo.
      const totalNaoComputavelTabelaBloco = lajesComputadas.reduce(
        (acc, l) => acc + (l.tipo === "atico" ? l.totalPavimentosAtico : l.naoComputavelTabelaPavimentos),
        0
      );

      // "Quantidade de blocos" = quantas torres idênticas a este bloco existem no empreendimento.
      // Tudo o que foi somado acima (para 1 torre) é multiplicado por esse valor.
      const quantidadeBlocosNum = paraNumero(bloco.quantidadeBlocos);
      const multiplicadorBlocos = quantidadeBlocosNum > 0 ? quantidadeBlocosNum : 1;

      return {
        ...bloco,
        nomeExibicao,
        lajesComputadas,
        multiplicadorBlocos,
        totalPavimentosBloco: totalPavimentosBloco * multiplicadorBlocos,
        totalPavimentosSemAticoBloco: totalPavimentosSemAticoBloco * multiplicadorBlocos,
        totalAreaComumBloco: totalAreaComumBloco * multiplicadorBlocos,
        totalPrivativaLajesBloco: totalPrivativaLajesBloco * multiplicadorBlocos,
        totalVagasLajesBloco: totalVagasLajesBloco * multiplicadorBlocos,
        totalComputavelLajesBloco: totalComputavelLajesBloco * multiplicadorBlocos,
        totalUnidadesBloco: totalUnidadesBloco * multiplicadorBlocos,
        totalIncentivoNaoComputavelBloco: totalIncentivoNaoComputavelBloco * multiplicadorBlocos,
        totalTerracoUnidadesBloco: totalTerracoUnidadesBloco * multiplicadorBlocos,
        totalAreaTecnicaUnidadesBloco: totalAreaTecnicaUnidadesBloco * multiplicadorBlocos,
        totalOrnamentoBloco: totalOrnamentoBloco * multiplicadorBlocos,
        totalDescobertaBloco: totalDescobertaBloco * multiplicadorBlocos,
        totalDepositoBloco: totalDepositoBloco * multiplicadorBlocos,
        totalNaoComputavelBloco: totalNaoComputavelBloco * multiplicadorBlocos,
        totalNaoComputavelTabelaBloco: totalNaoComputavelTabelaBloco * multiplicadorBlocos,
      };
    });

    // Estacionamento: Subsolos e Sobresolos — Total do pavimento = Garagem + Outros + Computável
    const niveisEstacionamentoComputados = niveisEstacionamento.map((n) => {
      const garagemNum = paraNumero(n.garagem);
      const outrosNum = paraNumero(n.outros);
      const computavelNum = paraNumero(n.computavel);
      const totalPavimento = garagemNum + outrosNum + computavelNum;
      return { ...n, garagemNum, outrosNum, computavelNum, totalPavimento };
    });
    const totalGaragemEstacionamento = niveisEstacionamentoComputados.reduce((acc, n) => acc + n.garagemNum, 0);
    const totalOutrosEstacionamento = niveisEstacionamentoComputados.reduce((acc, n) => acc + n.outrosNum, 0);
    const totalComputavelEstacionamento = niveisEstacionamentoComputados.reduce((acc, n) => acc + n.computavelNum, 0);
    const totalGeralEstacionamento = niveisEstacionamentoComputados.reduce((acc, n) => acc + n.totalPavimento, 0);

    const areaComputavelTotal =
      blocosComputados.reduce((acc, b) => acc + b.totalComputavelLajesBloco, 0) + totalComputavelEstacionamento;
    const areaPrivativaTotal = blocosComputados.reduce((acc, b) => acc + b.totalPrivativaLajesBloco, 0);
    const totalVagas = blocosComputados.reduce((acc, b) => acc + b.totalVagasLajesBloco, 0);
    const totalUnidades = blocosComputados.reduce((acc, b) => acc + b.totalUnidadesBloco, 0);
    const totalPavimentos = blocosComputados.reduce((acc, b) => acc + b.totalPavimentosBloco, 0);
    const totalBlocosGeral = blocosComputados.reduce((acc, b) => acc + b.multiplicadorBlocos, 0);

    // --- Quadro de Áreas de Prefeitura ---
    // Sobresolos/Subsolos vêm dos níveis cadastrados em Estacionamento (pelo nome do nível).
    const somaNiveisPorTipo = (palavraChave) =>
      niveisEstacionamentoComputados
        .filter((n) => n.nome.toLowerCase().includes(palavraChave))
        .reduce((acc, n) => acc + n.totalPavimento, 0);
    const sobresolosPrefeitura = somaNiveisPorTipo("sobresolo");
    const subsolosPrefeitura = somaNiveisPorTipo("subsolo");
    // Térreo coberto = níveis de Estacionamento nomeados "térreo" (garagem/outros fora de qualquer
    // bloco) + pavimentos dos BLOCOS marcados como Térreo (área computável + não computável real do
    // pavimento térreo de cada torre — igual à planilha de referência, que soma as duas fontes).
    // Identificação por `tipo === "terreo"` (botão "Adicionar Térreo", nome travado) é o caminho
    // confiável — adivinhar pelo nome digitado é frágil (typo, sem acento, renomeado sem querer).
    // Mantém o nome como reforço só para pavimentos antigos, criados antes deste botão existir.
    const terreoNiveisPrefeitura = somaNiveisPorTipo("térreo") || somaNiveisPorTipo("terreo");
    const ehLajeTerreo = (l) => {
      if (l.tipo === "atico") return false;
      if (l.tipo === "terreo") return true;
      const nome = (l.nome || "").toLowerCase();
      return nome.includes("térreo") || nome.includes("terreo");
    };
    const terreoBlocosPrefeitura = blocosComputados.reduce(
      (acc, b) =>
        acc +
        b.lajesComputadas
          .filter(ehLajeTerreo)
          .reduce((accL, l) => accL + (l.computavelPavimentos + l.naoComputavelTabelaPavimentos) * b.multiplicadorBlocos, 0),
      0
    );
    const obrasComplementaresNum = paraNumero(obrasComplementares);
    const terreoObrasPrefeitura = terreoNiveisPrefeitura + terreoBlocosPrefeitura + obrasComplementaresNum;

    const aticoPrefeitura = blocosComputados.reduce(
      (acc, b) =>
        acc +
        b.lajesComputadas
          .filter((l) => l.tipo === "atico")
          .reduce((accL, l) => accL + l.totalPavimentosAtico * b.multiplicadorBlocos, 0),
      0
    );

    // Área não computável total do projeto = Não computável de todos os blocos (já incluindo o Ático
    // inteiro) + Obras complementares + o total geral do Quadro de Estacionamento (Garagem + Outros
    // dos níveis).
    const areaNaoComputavelTotalProjeto =
      blocosComputados.reduce((acc, b) => acc + b.totalNaoComputavelTabelaBloco, 0) +
      obrasComplementaresNum +
      totalGeralEstacionamento;

    // Área total de prefeitura = Área computável total + Área não computável total do projeto — a
    // mesma fórmula "oficial" da planilha de referência.
    const areaTotalPrefeitura = areaComputavelTotal + areaNaoComputavelTotalProjeto;

    // Pavimentos (computável + não computável) = o restante do Total depois de tirar Sobresolos,
    // Subsolos, Térreo coberto (+ obras complementares) e Ático — igual à planilha de referência, que
    // calcula essa linha "de trás para frente" (Total − as outras 4 linhas) em vez de somar os
    // pavimentos direto, exatamente para garantir que as 5 linhas sempre fechem com o Total.
    const pavimentosPrefeitura =
      areaTotalPrefeitura - sobresolosPrefeitura - subsolosPrefeitura - terreoObrasPrefeitura - aticoPrefeitura;

    const indicePrivativaPrefeitura = areaTotalPrefeitura > 0 ? areaPrivativaTotal / areaTotalPrefeitura : null;

    // --- Cota de Solidariedade ---
    // Gatilho de tamanho: abaixo de 20.000 m² de computável é opcional; acima, obrigatória.
    // O gatilho usa SEMPRE areaComputavelTotal (a mesma variável global do projeto, somada a partir
    // dos blocos/unidades/estacionamento) — nunca um valor parcial ou fixo.
    const LIMITE_COTA_SOLIDARIEDADE = 20000;
    const cotaSolidariedadeObrigatoria = areaComputavelTotal >= LIMITE_COTA_SOLIDARIEDADE;
    // A obrigatoriedade legal (área computável >= 20.000m²) sempre prevalece — mesmo que o usuário
    // tenha escolhido "Não" antes do projeto crescer e passar a exigir a Cota de Solidariedade.
    const cotaSolidariedadeAtiva = cotaSolidariedadeObrigatoria || cotaSolidariedade === "Sim";

    // --- CA máximo com benefícios (movido para antes da Cota de Solidariedade: o potencial
    // teórico por quinhão, calculado logo abaixo, precisa desse CA para existir) ---
    // CA máximo com benefícios = CA máximo da zona x (1 + Majoração/100) — sugestão automática,
    // mas o campo é editável e o valor digitado manualmente tem prioridade. O bônus fixo de +20%
    // é o benefício concedido especificamente pela Cota de Solidariedade (art. 112, Lei 16.050/2014
    // - PDE) — por isso só é sugerido automaticamente quando ela está ativa. Fora desse caso, o
    // campo fica em 0% por padrão: outros incentivos (fruição pública, térreo ativo, outorga
    // onerosa específica etc.) não são calculados automaticamente e devem ser digitados aqui pelo
    // usuário, sem herdar o bônus da Cota de Solidariedade indevidamente.
    const caMaximoZonaNum = paraNumero(caMaximoZona);
    const majoracaoDigitada = majoracaoCA.trim() !== "";
    const majoracaoNum = majoracaoDigitada
      ? paraNumero(majoracaoCA)
      : cotaSolidariedadeAtiva
      ? 20
      : 0;
    const caMaximoComBeneficiosCalculado = caMaximoZonaNum > 0 ? caMaximoZonaNum * (1 + majoracaoNum / 100) : null;
    const caMaximoComBeneficiosManualNum = paraNumero(caMaximoComBeneficiosManual);
    const caMaximoComBeneficios =
      caMaximoComBeneficiosManualNum > 0 ? caMaximoComBeneficiosManualNum : caMaximoComBeneficiosCalculado;

    // Área computável (com bônus) = Área do terreno x CA Total Resultante (potencial construtivo
    // teórico do terreno com o bônus da Cota de Solidariedade já embutido no CA).
    const areaComputavelComBonusCotaSolidariedade =
      cotaSolidariedadeAtiva && terreno > 0 && caMaximoComBeneficios > 0 ? terreno * caMaximoComBeneficios : null;

    // --- Potencial construtivo por uso (R2V / NR / HMP / HIS) ---
    // O potencial construtivo real de um projeto misto com Cota de Solidariedade não é um único
    // CA aplicado sobre o terreno inteiro: R2V e NR usam seus próprios quinhões (o terreno é
    // dividido entre eles) e HMP/HIS são bônus adicionais (25%/50% do CA básico da zona) aplicados
    // sobre o terreno total, somados por fora — cada trilha tem sua própria máxima e atingida.
    const quinhaoNaoResidencialNum = paraNumero(quinhaoNaoResidencial);
    const quinhaoResidencial =
      areaRemanescente !== null ? Math.max(areaRemanescente - quinhaoNaoResidencialNum, 0) : null;

    const caR2V = caMaximoComBeneficios;
    const majoracaoNRNum = paraNumero(majoracaoNR);
    const caNR = caR2V !== null ? caR2V + majoracaoNRNum : null;

    // HMP/HIS só recebem o bônus de +20% quando a Cota de Solidariedade é OBRIGATÓRIA (>=20.000m²
    // de computável); quando é apenas opcional, o bônus de 20% já foi "gasto" no CA do R2V/NR.
    const caHMP = caMaximoZonaNum > 0 ? caMaximoZonaNum * 0.25 * (cotaSolidariedadeObrigatoria ? 1.2 : 1) : null;
    const caHIS = caMaximoZonaNum > 0 ? caMaximoZonaNum * 0.5 * (cotaSolidariedadeObrigatoria ? 1.2 : 1) : null;

    const potencialR2VMaximo =
      quinhaoResidencial !== null && caR2V > 0 ? quinhaoResidencial * caR2V : null;
    const potencialNRMaximo =
      caNR !== null && caNR > 0 ? quinhaoNaoResidencialNum * caNR : null;
    const potencialHMPAtivo = aplicarBonusHMP === "Sim";
    const potencialHISAtivo = aplicarBonusHIS === "Sim";
    const potencialHMPMaximo = potencialHMPAtivo && terreno > 0 && caHMP !== null ? terreno * caHMP : null;
    const potencialHISMaximo = potencialHISAtivo && terreno > 0 && caHIS !== null ? terreno * caHIS : null;

    // Área Computável Total (potencial teórico) = soma das áreas computáveis máximas das 4 trilhas
    // base (quinhão x CA) — é essa soma, e não a área real já modelada nos pavimentos, que alimenta
    // a base de cálculo da Cota de Solidariedade (10%), do Benefício NR e do Benefício
    // empreendimento sem vagas abaixo: na planilha de referência, a Cota de Solidariedade é
    // dimensionada a partir do potencial construtivo teórico do terreno (zoneamento x quinhões),
    // não a partir do que já foi desenhado pavimento a pavimento.
    const potencialTeoricoTotal =
      (potencialR2VMaximo || 0) + (potencialNRMaximo || 0) + (potencialHMPMaximo || 0) + (potencialHISMaximo || 0);

    // Bônus "Residencial sem Vagas": trilha adicional e independente (5ª trilha) que soma +10% sobre
    // o potencial teórico das 4 trilhas base quando o projetista ativa o toggle (só disponível com a
    // Cota de Solidariedade ativa, mesmo instrumento do Plano Diretor). Propositalmente DIFERENTE do
    // "Benefício empreendimento sem vagas" mais abaixo, que continua sendo só um teto de referência
    // para área de circulação não computável e nunca soma no potencial construtível — este bônus
    // aqui É somado de fato no CA Resultante, na Área Computável Máxima Permitida e no Falta/Estoura.
    const residencialSemVagasAtivo = cotaSolidariedadeAtiva && residencialSemVagas === "Sim";
    const potencialSemVagasMaximo = residencialSemVagasAtivo ? potencialTeoricoTotal * 0.1 : 0;
    const caSemVagasEquivalente =
      residencialSemVagasAtivo && terreno > 0 ? potencialSemVagasMaximo / terreno : 0;

    // CA Resultante Total = soma dos CAs de todas as trilhas ativas (R2V/NR com bônus + HMP + HIS +
    // Residencial sem Vagas), igual à linha "CA Resultante" da planilha "Divisão por Terreno Virtual"
    // (ex: 4,80 + 1,00 + 2,00 = 7,80, sem contar o bônus sem vagas quando inativo).
    const caResultanteTotal =
      (caR2V || 0) +
      (potencialHMPAtivo && caHMP !== null ? caHMP : 0) +
      (potencialHISAtivo && caHIS !== null ? caHIS : 0) +
      caSemVagasEquivalente;

    // Contrapartida necessária = 10% da Área Computável Total (potencial teórico dos quinhões, ver
    // nota acima) — recalcula sozinha sempre que o terreno, os quinhões ou o CA mudarem.
    const contrapartidaHISNecessaria = cotaSolidariedadeAtiva ? potencialTeoricoTotal * 0.1 : 0;

    // Benefícios não computáveis do quadro "Divisão por Terreno Virtual" — mesma planilha de
    // referência (LUNI/AIMBERÊ): dois incentivos adicionais que acompanham a Cota de Solidariedade,
    // calculados sobre a mesma Área Computável Total (mesma base da contrapartida HIS acima).
    // "Benefício NR" = 20% da computável total (incentivo específico de uso Não Residencial).
    // "Benefício empreendimento sem vagas" = 10% da computável total — pode ser usado para
    // circulação não computável (é um teto de referência, não é lançado automaticamente em nenhum
    // campo — o usuário aloca a área de circulação normalmente no Pavimento, dentro desse limite).
    const beneficioNR = cotaSolidariedadeAtiva ? potencialTeoricoTotal * 0.2 : 0;
    const beneficioEmpreendimentoSemVagas = cotaSolidariedadeAtiva ? potencialTeoricoTotal * 0.1 : 0;

    // Soma a área privativa (construída) das unidades marcadas como HIS/HMP já alocadas nos
    // pavimentos, opcionalmente filtrando por uma categoria específica ("HIS" ou "HMP"). Usa a
    // privativa (não a computável) de propósito: unidades de HIS/HMP cadastradas na categoria
    // "HIS e HMP" são tratadas como incentivo não computável (não somam na área computável do
    // próprio empreendimento — esse é o benefício da Cota de Solidariedade), então sua
    // "computavelUnidade" fica zerada. A privativa é a única medida que reflete a área física
    // realmente construída para cumprir a cota.
    const somarAlocadoHisHmp = (categoriaAlvo) =>
      blocosComputados.reduce(
        (acc, bloco) =>
          acc +
          bloco.lajesComputadas.reduce((accLaje, laje) => {
            if (laje.tipo === "atico") return accLaje;
            return (
              accLaje +
              (laje.itens || []).reduce((accItem, item) => {
                const ref = resolverUnidadeItem(item, unidadesPorId, unidadesPorDescricaoGlobal);
                const contaComoHIS = unidadeEhCategoria(ref, "HIS");
                const contaComoHMP = unidadeEhCategoria(ref, "HMP");
                const bate = categoriaAlvo ? unidadeEhCategoria(ref, categoriaAlvo) : contaComoHIS || contaComoHMP;
                if (!bate) return accItem;
                return accItem + item.privativaItem * laje.quantidadePavimentos * bloco.multiplicadorBlocos;
              }, 0)
            );
          }, 0),
        0
      );
    const contrapartidaHISAlocada = somarAlocadoHisHmp(null);
    const contrapartidaHISFalta = contrapartidaHISNecessaria - contrapartidaHISAlocada;

    // Área de Fachada Ativa já alocada (privativa das unidades cadastradas na categoria fixa
    // "Fachada Ativa" do catálogo, que já é tratada como incentivo não computável — ver
    // CATEGORIAS_TABELAS_PADRAO). Usado só como leitura de referência na aba Benefícios.
    const areaFachadaAtivaAlocada = blocosComputados.reduce(
      (acc, bloco) =>
        acc +
        bloco.lajesComputadas.reduce((accLaje, laje) => {
          if (laje.tipo === "atico") return accLaje;
          return (
            accLaje +
            (laje.itens || []).reduce((accItem, item) => {
              const ref = resolverUnidadeItem(item, unidadesPorId, unidadesPorDescricaoGlobal);
              if (!ref || ref.tabela !== "fachadaAtiva") return accItem;
              return accItem + item.privativaItem * laje.quantidadePavimentos * bloco.multiplicadorBlocos;
            }, 0)
          );
        }, 0),
      0
    );
    // % atendido = já alocado ÷ exigido, sempre travado em 100% quando a exigência já foi cumprida
    // (evita mostrar "0,00 m²" no lugar de "Atendido", que parecia dizer que nada foi alocado).
    const percentualContrapartidaAtendida =
      contrapartidaHISNecessaria > 0
        ? Math.min((contrapartidaHISAlocada / contrapartidaHISNecessaria) * 100, 100)
        : 100;

    // --- Split da Cota (HIS x HMP) para a modalidade de Execução Física ---
    // % editável para HIS; HMP completa sempre para somar 100%.
    const splitHISNum = Math.min(Math.max(paraNumero(splitHISPercentual), 0), 100);
    const splitHMPNum = 100 - splitHISNum;
    const areaHISNecessaria = contrapartidaHISNecessaria * (splitHISNum / 100);
    const areaHMPNecessaria = contrapartidaHISNecessaria * (splitHMPNum / 100);
    const areaMediaUnidadeHISNum = paraNumero(areaMediaUnidadeHIS);
    const areaMediaUnidadeHMPNum = paraNumero(areaMediaUnidadeHMP);
    const unidadesHISNecessarias =
      areaMediaUnidadeHISNum > 0 ? Math.ceil(areaHISNecessaria / areaMediaUnidadeHISNum) : null;
    const unidadesHMPNecessarias =
      areaMediaUnidadeHMPNum > 0 ? Math.ceil(areaHMPNecessaria / areaMediaUnidadeHMPNum) : null;
    const contrapartidaAlocadaHIS = somarAlocadoHisHmp("HIS");
    const contrapartidaAlocadaHMP = somarAlocadoHisHmp("HMP");
    const faltaAlocarHIS = areaHISNecessaria - contrapartidaAlocadaHIS;
    const faltaAlocarHMP = areaHMPNecessaria - contrapartidaAlocadaHMP;
    const percentualAtendidoHIS =
      areaHISNecessaria > 0 ? Math.min((contrapartidaAlocadaHIS / areaHISNecessaria) * 100, 100) : 100;
    const percentualAtendidoHMP =
      areaHMPNecessaria > 0 ? Math.min((contrapartidaAlocadaHMP / areaHMPNecessaria) * 100, 100) : 100;

    // --- Pagamento em Recursos Financeiros (FUNDURB / Compensação) ---
    // Quando escolhida essa modalidade, o empreendimento mantém 100% do potencial construtivo
    // residencial (não sacrifica unidades para HIS físico) e quita a obrigação com um aporte em dinheiro.
    const pagamentoFundurbAtivo =
      cotaSolidariedadeAtiva && modalidadeCotaSolidariedade === "Pagamento em Recursos Financeiros (FUNDURB)";
    // Passo A: área da cota = 10% da área computável total (mesma base da contrapartida em HIS)
    const areaCotaFundurb = contrapartidaHISNecessaria;
    // Passo B: valor total = área da cota x valor de referência do m² (configurável)
    const valorReferenciaM2FundurbNum = paraNumero(valorReferenciaM2Fundurb);
    const valorTotalFundurb = pagamentoFundurbAtivo ? areaCotaFundurb * valorReferenciaM2FundurbNum : 0;

    // --- Total Vagas (linha do quadro de Estacionamento) ---
    const vinculadas = totalVagas;
    const pneCalculado = vinculadas > 0 ? Math.max(Math.floor(vinculadas * 0.02), 1) : 0;
    const motoCalculado = vinculadas > 0 ? Math.max(Math.floor(vinculadas * 0.05), 1) : 0;
    const pne = vagasPneManual.trim() !== "" ? paraNumero(vagasPneManual) : pneCalculado;
    const moto = vagasMotoManual.trim() !== "" ? paraNumero(vagasMotoManual) : motoCalculado;
    const bicicletaNum = paraNumero(vagasBicicleta);
    const descobertasNum = paraNumero(vagasDescobertas);
    const utiNum = paraNumero(vagasUti);
    const caminhaoNum = paraNumero(vagasCaminhao);
    const visitanteNum = paraNumero(vagasVisitante);
    const carWashNum = paraNumero(vagasCarWash);
    const eletricoNum = paraNumero(vagasEletrico);
    const extrasNum = paraNumero(vagasExtras);
    // Total = Vinculadas + PNE + UTI + Caminhão + Visitante + Car Wash + Elétrico + Extras (fórmula da planilha)
    const totalVagasGeral = vinculadas + pne + utiNum + caminhaoNum + visitanteNum + carWashNum + eletricoNum + extrasNum;
    const cobertasVagas = totalVagasGeral - descobertasNum;
    // Cota de garagem (m²/vaga) = Total Garagem ÷ (Cobertas - UTI - PNE)
    const baseCotaGaragem = cobertasVagas - utiNum - pne;
    const cotaGaragem = baseCotaGaragem !== 0 ? totalGaragemEstacionamento / baseCotaGaragem : 0;
    const estacionamentoTotalNecessario = cobertasVagas * cotaGaragem;
    const faltaEstouraGaragem = estacionamentoTotalNecessario - totalGaragemEstacionamento;

    // --- Subsolo máximo por pavimento: Doação = Área remanescente - Permeável do projeto ---
    const tpProjetoNumSubsolo = paraNumero(tpProjeto);
    const permeavelProjeto = areaRemanescente !== null ? areaRemanescente * tpProjetoNumSubsolo : null;
    const doacaoSubsoloMaximo = areaRemanescente !== null && permeavelProjeto !== null ? areaRemanescente - permeavelProjeto : null;
    // EMPREENDIMENTO!V4 = Área do terreno - Reserva de calçada
    const v4EmpreendimentoNum = terreno - paraNumero(reservaCalcada);
    const reservaSubsoloMaximo = permeavelProjeto !== null ? v4EmpreendimentoNum - permeavelProjeto : null;

    const indicePrivativaTerreno = terreno > 0 ? areaPrivativaTotal / terreno : null;
    const caUtilizado = terreno > 0 ? areaComputavelTotal / terreno : null;

    // Nº mínimo de unidades = arredondar para cima (Área Computável Residencial ÷ (CA máximo da zona × Cota-parte máxima))
    // (caMaximoZonaNum já foi calculado acima, antes da Cota de Solidariedade)
    const cotaParteMaximaNum = paraNumero(cotaParteMaxima);
    const nMinimoUnidades =
      cotaParteMaximaNum > 0 && caMaximoZonaNum > 0
        ? Math.ceil(areaComputavelTotal / (caMaximoZonaNum * cotaParteMaximaNum))
        : null;

    // Nº máximo de unidades (limite de adensamento) = arredondar para baixo (Área Computável Residencial ÷ (CA máximo da zona × Cota-parte mínima))
    const cotaParteMinimaNum = paraNumero(cotaParteMinima);
    const nMaximoUnidades =
      cotaParteMinimaNum > 0 && caMaximoZonaNum > 0
        ? Math.floor(areaComputavelTotal / (caMaximoZonaNum * cotaParteMinimaNum))
        : null;

    // Nº de unidades elegíveis para Cota-parte: por norma, só entram unidades do quinhão residencial
    // (R2V, qualquer área) e unidades HIS/HMP com área computável MAIOR que 30,00 m² — unidades
    // HIS/HMP de até 30 m², categorias de puro incentivo (Fachada Ativa, Incentivo) e o quinhão Não
    // Residencial (NR) ficam de fora da conta (mesma regra do rodapé "Cota-parte aplica-se apenas ao
    // quinhão e às unidades residenciais...", exibido na seção Cota-parte & Cota Ambiental).
    const numeroUnidadesElegiveisCotaParte = blocosComputados.reduce(
      (acc, bloco) =>
        acc +
        bloco.lajesComputadas.reduce((accLaje, laje) => {
          if (laje.tipo === "atico") return accLaje;
          return (
            accLaje +
            (laje.itens || []).reduce((accItem, item) => {
              const ref = resolverUnidadeItem(item, unidadesPorId, unidadesPorDescricaoGlobal);
              if (!ref) return accItem;
              const ehHISouHMP = unidadeEhCategoria(ref, "HIS") || unidadeEhCategoria(ref, "HMP");
              const elegivel = ehHISouHMP
                ? ref.computavelUnidade > 30
                : categoriaPorId[ref.tabela] && categoriaPorId[ref.tabela].quinhao === "residencial";
              if (!elegivel) return accItem;
              return accItem + item.qtd * laje.quantidadePavimentos * bloco.multiplicadorBlocos;
            }, 0)
          );
        }, 0),
      0
    );

    // Cota-parte real do projeto = Área útil do terreno (terreno − reserva de calçada) ÷ Número de
    // unidades elegíveis para cota-parte (ver acima) — prioriza as unidades já alocadas nos
    // pavimentos (dado real) e só usa o campo manual "Nº de unidades do projeto" como estimativa
    // enquanto o projeto ainda não tem pavimentos preenchidos. Auditada (soft warning) contra os
    // limites mínimo/máximo do Quadro 3 da zona — nunca bloqueia o preenchimento.
    const numeroUnidadesProjetoNum = paraNumero(numeroUnidadesProjeto);
    const numeroResidenciasParaCotaParte =
      numeroUnidadesElegiveisCotaParte > 0 ? numeroUnidadesElegiveisCotaParte : numeroUnidadesProjetoNum;
    const cotaParteReal =
      v4EmpreendimentoNum > 0 && numeroResidenciasParaCotaParte > 0
        ? v4EmpreendimentoNum / numeroResidenciasParaCotaParte
        : null;
    const cotaParteAbaixoMinima =
      cotaParteReal !== null && cotaParteMinimaNum > 0 && cotaParteReal < cotaParteMinimaNum;
    const cotaParteAcimaMaxima =
      cotaParteReal !== null && cotaParteMaximaNum > 0 && cotaParteReal > cotaParteMaximaNum;

    // Fator Social (Fs): calculado automaticamente, igual à planilha de referência — não é mais uma
    // seleção manual. Passo 1: cota-parte "de projeto" para fins de Fs = CEILING((CA utilizado ×
    // quinhão residencial) ÷ (CA máximo da zona × Nº de unidades elegíveis para cota-parte), 0,25),
    // com piso de 20 (mesmo mínimo normativo da cota-parte — nunca cai abaixo disso). Passo 2: Fs
    // cresce linearmente de 1,00 (cota-parte = 20) até 2,00 (cota-parte = 30) — +0,10 de Fs a cada
    // +1,00 m² de cota-parte — e salta para 3,00 quando a cota-parte ultrapassa 30 m² (mesma tabela
    // de lookup "cota parte × Fs" da planilha de referência).
    const cotaParteBaseFs =
      caUtilizado > 0 && quinhaoResidencial > 0 && caMaximoZonaNum > 0 && numeroUnidadesElegiveisCotaParte > 0
        ? Math.ceil((caUtilizado * quinhaoResidencial) / (caMaximoZonaNum * numeroUnidadesElegiveisCotaParte) / 0.25) *
          0.25
        : null;
    const cotaParteEfetivaFs = cotaParteBaseFs !== null ? Math.max(cotaParteBaseFs, 20) : null;
    const fsAutomatico =
      cotaParteEfetivaFs === null ? null : cotaParteEfetivaFs > 30 ? 3 : 1 + (cotaParteEfetivaFs - 20) * 0.1;

    // (CA máximo com benefícios, Área computável com bônus e Potencial construtivo por uso —
    // R2V/NR/HMP/HIS — já foram calculados acima, antes da Cota de Solidariedade.)

    // Atingida por quinhão: soma a área computável já alocada nos pavimentos, separada pela
    // categoria de uso (Residencial = quinhão residencial; categorias computáveis personalizadas
    // marcadas como "Não Residencial" = quinhão NR). Unidades marcadas como HIS/HMP (categoria da
    // unidade, não a tabela) são excluídas daqui mesmo quando estão numa categoria computável comum
    // (ex: "Residencial") — elas contam para as trilhas de bônus HMP/HIS abaixo, não para a trilha
    // base, senão a base ficaria com "atingida" inflada e apontaria estouro falso.
    const somarComputavelPorQuinhao = (quinhaoAlvo) =>
      blocosComputados.reduce(
        (acc, bloco) =>
          acc +
          bloco.lajesComputadas.reduce((accLaje, laje) => {
            if (laje.tipo === "atico") return accLaje;
            return (
              accLaje +
              (laje.itens || []).reduce((accItem, item) => {
                const ref = resolverUnidadeItem(item, unidadesPorId, unidadesPorDescricaoGlobal);
                const cat = ref ? categoriaPorId[ref.tabela] : null;
                if (!cat || cat.naoComputavel || cat.quinhao !== quinhaoAlvo) return accItem;
                if (unidadeEhCategoria(ref, "HIS") || unidadeEhCategoria(ref, "HMP")) return accItem;
                return accItem + item.computavelItem * laje.quantidadePavimentos * bloco.multiplicadorBlocos;
              }, 0)
            );
          }, 0),
        0
      );
    const potencialR2VAtingida = somarComputavelPorQuinhao("residencial");
    const potencialNRAtingida = somarComputavelPorQuinhao("naoResidencial");
    // Atingida das trilhas de bônus HMP/HIS: soma as unidades marcadas com essa categoria (categoria
    // da unidade — "HIS"/"HMP" —, não a tabela a que pertencem). Unidades em categorias não
    // computáveis (ex: "HIS e HMP", incentivo da Cota de Solidariedade) são medidas pela privativa,
    // já que sua computável é zerada por definição — a privativa é a única medida real do que foi
    // construído para consumir o bônus. Unidades HIS/HMP computáveis, embutidas numa categoria
    // computável comum (ex: "Residencial"), são medidas pela computável, para casar com a mesma
    // base retirada da trilha R2V/NR acima (senão a área ficaria contada em dobro).
    const somarTrilhaBonus = (categoriaAlvo) =>
      blocosComputados.reduce(
        (acc, bloco) =>
          acc +
          bloco.lajesComputadas.reduce((accLaje, laje) => {
            if (laje.tipo === "atico") return accLaje;
            return (
              accLaje +
              (laje.itens || []).reduce((accItem, item) => {
                const ref = resolverUnidadeItem(item, unidadesPorId, unidadesPorDescricaoGlobal);
                if (!unidadeEhCategoria(ref, categoriaAlvo)) return accItem;
                const cat = ref ? categoriaPorId[ref.tabela] : null;
                const medida = cat && !cat.naoComputavel ? item.computavelItem : item.privativaItem;
                return accItem + medida * laje.quantidadePavimentos * bloco.multiplicadorBlocos;
              }, 0)
            );
          }, 0),
        0
      );
    const potencialHMPAtingida = somarTrilhaBonus("HMP");
    const potencialHISAtingida = somarTrilhaBonus("HIS");

    const potencialR2VFalta = potencialR2VMaximo !== null ? potencialR2VMaximo - potencialR2VAtingida : null;
    const potencialNRFalta = potencialNRMaximo !== null ? potencialNRMaximo - potencialNRAtingida : null;
    const potencialHMPFalta = potencialHMPMaximo !== null ? potencialHMPMaximo - potencialHMPAtingida : null;
    const potencialHISFalta = potencialHISMaximo !== null ? potencialHISMaximo - potencialHISAtingida : null;

    const potencialPorUso = [
      { uso: "R2V (Residencial)", ca: caR2V, base: "Quinhão residencial", maximo: potencialR2VMaximo, atingida: potencialR2VAtingida, falta: potencialR2VFalta },
      // Linha NR só aparece quando o projeto realmente tem uso Não Residencial ativo — sem isso,
      // o quinhão NR é sempre 0 e a linha só mostrava traços/zeros à toa na tabela.
      ...(usoNaoResidencialAtivo === "Sim"
        ? [
            {
              uso: nomeUsoNR.trim() ? `NR Computável (${nomeUsoNR.trim()})` : "NR (Não Residencial)",
              ca: caNR,
              base: "Quinhão não residencial",
              maximo: potencialNRMaximo,
              atingida: potencialNRAtingida,
              falta: potencialNRFalta,
            },
          ]
        : []),
      { uso: "HMP (bônus)", ca: potencialHMPAtivo ? caHMP : null, base: "Terreno total", maximo: potencialHMPMaximo, atingida: potencialHMPAtivo ? potencialHMPAtingida : null, falta: potencialHMPFalta },
      { uso: "HIS (bônus)", ca: potencialHISAtivo ? caHIS : null, base: "Terreno total", maximo: potencialHISMaximo, atingida: potencialHISAtivo ? potencialHISAtingida : null, falta: potencialHISFalta },
      // Residencial sem Vagas: bônus de +10%, sem uma categoria de unidade própria para medir
      // "atingida" (o CA extra é consumido pelas próprias unidades residenciais já contadas em R2V),
      // por isso aparece na tabela só como referência de máxima, sem coluna Atingida/Falta.
      ...(residencialSemVagasAtivo
        ? [
            {
              uso: "Residencial sem Vagas (bônus)",
              ca: null,
              base: "10% do potencial teórico (R2V+NR+HMP+HIS)",
              maximo: potencialSemVagasMaximo,
              atingida: null,
              falta: null,
            },
          ]
        : []),
    ];

    // Computável máximo permitido = soma das máximas das 4 trilhas base (R2V + NR + HMP + HIS) + o
    // bônus Residencial sem Vagas quando ativo, cada uma com sua própria base de área (quinhão,
    // terreno total, ou percentual do potencial teórico).
    const computavelMaximoPermitido =
      [potencialR2VMaximo, potencialNRMaximo, potencialHMPMaximo, potencialHISMaximo]
        .filter((v) => v !== null)
        .reduce((acc, v) => acc + v, 0) + potencialSemVagasMaximo;
    // FALTA (ESTOURA) headline = Computável máximo permitido − Área computável total do projeto (a
    // mesma comparação global que a planilha real faz). Não é a soma das 4 "faltas" por trilha: a soma
    // por trilha pode divergir da área computável total real por dois motivos — áreas comuns
    // computáveis do pavimento (ex: circulação) não são atribuídas a nenhuma trilha específica, e
    // unidades de incentivo não computável (cota HIS/HMP) contam na trilha de bônus pela privativa,
    // mas não entram na área computável total do projeto. Ver "totalFaltaPotencialPorUso" para o
    // detalhamento por trilha (tabela "Potencial Construtivo por Uso").
    const faltaEstoura = computavelMaximoPermitido - areaComputavelTotal;
    const totalAtingidaPotencialPorUso = potencialPorUso
      .filter((l) => l.atingida !== null)
      .reduce((acc, l) => acc + l.atingida, 0);
    const totalFaltaPotencialPorUso = computavelMaximoPermitido - totalAtingidaPotencialPorUso;

    // TP (taxa de permeabilidade): redução TP = (TP projeto ÷ TP necessária) - 1
    const tpNecessariaNum = paraNumero(tpNecessaria);
    const tpProjetoNum = paraNumero(tpProjeto);
    const reducaoTP = tpNecessariaNum > 0 ? tpProjetoNum / tpNecessariaNum - 1 : null;

    return {
      blocosComputados,
      linhasGlobais,
      tipologiasGlobais,
      descricoesDuplicadas,
      niveisEstacionamentoComputados,
      totalGaragemEstacionamento,
      totalOutrosEstacionamento,
      totalComputavelEstacionamento,
      totalGeralEstacionamento,
      vinculadas,
      pne,
      pneCalculado,
      moto,
      motoCalculado,
      totalVagasGeral,
      cobertasVagas,
      cotaGaragem,
      estacionamentoTotalNecessario,
      faltaEstouraGaragem,
      doacaoSubsoloMaximo,
      reservaSubsoloMaximo,
      areaComputavelTotal,
      areaPrivativaTotal,
      totalVagas,
      totalUnidades,
      totalPavimentos,
      totalBlocosGeral,
      limiteTerracoPorPavimento,
      areaRemanescente,
      indicePrivativaTerreno,
      sobresolosPrefeitura,
      subsolosPrefeitura,
      terreoObrasPrefeitura,
      pavimentosPrefeitura,
      aticoPrefeitura,
      areaNaoComputavelTotalProjeto,
      areaTotalPrefeitura,
      indicePrivativaPrefeitura,
      caUtilizado,
      nMinimoUnidades,
      nMaximoUnidades,
      numeroResidenciasParaCotaParte,
      cotaParteReal,
      cotaParteAbaixoMinima,
      cotaParteAcimaMaxima,
      fsAutomatico,
      caMaximoComBeneficios,
      caMaximoComBeneficiosCalculado,
      areaComputavelComBonusCotaSolidariedade,
      caResultanteTotal,
      potencialTeoricoTotal,
      cotaSolidariedadeObrigatoria,
      cotaSolidariedadeAtiva,
      contrapartidaHISNecessaria,
      beneficioNR,
      beneficioEmpreendimentoSemVagas,
      contrapartidaHISAlocada,
      contrapartidaHISFalta,
      areaFachadaAtivaAlocada,
      percentualContrapartidaAtendida,
      splitHISNum,
      splitHMPNum,
      areaHISNecessaria,
      areaHMPNecessaria,
      unidadesHISNecessarias,
      unidadesHMPNecessarias,
      contrapartidaAlocadaHIS,
      contrapartidaAlocadaHMP,
      faltaAlocarHIS,
      faltaAlocarHMP,
      percentualAtendidoHIS,
      percentualAtendidoHMP,
      pagamentoFundurbAtivo,
      areaCotaFundurb,
      valorTotalFundurb,
      computavelMaximoPermitido,
      faltaEstoura,
      totalAtingidaPotencialPorUso,
      totalFaltaPotencialPorUso,
      reducaoTP,
      quinhaoResidencial,
      quinhaoNaoResidencialNum,
      caR2V,
      caNR,
      caHMP,
      caHIS,
      potencialHMPAtivo,
      potencialHISAtivo,
      residencialSemVagasAtivo,
      potencialSemVagasMaximo,
      potencialPorUso,
    };
  }, [
    blocos,
    unidadesGlobais,
    categoriasTabelas,
    niveisEstacionamento,
    cotaSolidariedade,
    modalidadeCotaSolidariedade,
    splitHISPercentual,
    areaMediaUnidadeHIS,
    areaMediaUnidadeHMP,
    valorReferenciaM2Fundurb,
    vagasBicicleta,
    vagasDescobertas,
    vagasUti,
    vagasCaminhao,
    vagasVisitante,
    vagasCarWash,
    vagasEletrico,
    vagasExtras,
    vagasPneManual,
    vagasMotoManual,
    obrasComplementares,
    areaTerreno,
    doacao,
    reservaCalcada,
    caMaximoZona,
    majoracaoCA,
    caMaximoComBeneficiosManual,
    cotaParteMaxima,
    cotaParteMinima,
    numeroUnidadesProjeto,
    tpNecessaria,
    tpProjeto,
    quinhaoNaoResidencial,
    majoracaoNR,
    nomeUsoNR,
    aplicarBonusHMP,
    aplicarBonusHIS,
    residencialSemVagas,
  ]);

  // Derivados só para exibição no relatório de Indicadores Gerais — não realimentam nenhum outro
  // cálculo. Igual à planilha de referência: a computável atingida "residencial" é TUDO que não é
  // NR (ou seja, R2V + HMP + HIS somados, já que os três são trilhas do quinhão residencial) — não
  // é só a trilha R2V sozinha, senão HMP/HIS ficam de fora da conta e o CA por quinhão vem menor
  // que o "CA total utilizado" real do projeto quando há unidades HMP/HIS.
  const linhaNRPotencial = agregados.potencialPorUso.find((l) => l.uso.startsWith("NR"));
  const computavelNaoResidencialAtingida = linhaNRPotencial ? linhaNRPotencial.atingida : 0;
  const computavelResidencialAtingida = agregados.areaComputavelTotal - computavelNaoResidencialAtingida;
  const caR2VUtilizadoPorQuinhao =
    agregados.quinhaoResidencial > 0 ? computavelResidencialAtingida / agregados.quinhaoResidencial : null;
  const caNRUtilizadoPorQuinhao =
    paraNumero(quinhaoNaoResidencial) > 0
      ? computavelNaoResidencialAtingida / paraNumero(quinhaoNaoResidencial)
      : null;
  const caResidencialPorTerrenoTotal =
    paraNumero(areaTerreno) > 0 ? computavelResidencialAtingida / paraNumero(areaTerreno) : null;
  const caNaoResidencialPorTerrenoTotal =
    paraNumero(areaTerreno) > 0 ? computavelNaoResidencialAtingida / paraNumero(areaTerreno) : null;

  // "HIS e HMP" é uma categoria dependente da Cota de Solidariedade — some/aparece sozinha por
  // padrão junto com ela, sem precisar de um interruptor próprio.
  useEffect(() => {
    if (agregados.cotaSolidariedadeAtiva) {
      setTabelasExpandidas((atual) => (atual.has("hisHmp") ? atual : new Set(atual).add("hisHmp")));
    }
  }, [agregados.cotaSolidariedadeAtiva]);

  // --- Exportar Indicadores Gerais ---
  // PDF: usa a caixa de impressão do próprio navegador (formatada para A4 via CSS @page),
  // que já oferece "Salvar como PDF" sem precisar de nenhuma biblioteca extra.
  const exportarPDF = () => window.print();

  // CSV: baixa os principais números da aba, prontos para abrir em Excel/Planilhas Google.
  const exportarCSV = () => {
    const linhas = [
      ["Indicador", "Valor"],
      ["Área do terreno (m²)", formatNumeroBR(paraNumero(areaTerreno))],
      ["Área remanescente (m²)", formatNumeroBR(agregados.areaRemanescente)],
      ["Área computável total (m²)", formatNumeroBR(agregados.areaComputavelTotal)],
      ["Área privativa total (m²)", formatNumeroBR(agregados.areaPrivativaTotal)],
      ["Área não computável total (m²)", formatNumeroBR(agregados.areaNaoComputavelTotalProjeto)],
      ["Área total de prefeitura (m²)", formatNumeroBR(agregados.areaTotalPrefeitura)],
      ["CA utilizado", formatNumeroBR(agregados.caUtilizado)],
      ["Índice Privativa/Prefeitura", formatNumeroBR(agregados.indicePrivativaPrefeitura)],
      [
        "Falta (Estoura) (m²)",
        agregados.faltaEstoura !== null ? formatNumeroBR(agregados.faltaEstoura) : "",
      ],
      ["Total de pavimentos", formatNumeroBR(agregados.totalPavimentos, 0)],
      ["Total de unidades", formatNumeroBR(agregados.totalUnidades, 0)],
      ["Total de vagas", formatNumeroBR(agregados.totalVagasGeral, 0)],
    ];
    const csv = linhas.map((linha) => linha.map((v) => `"${v}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomeProjeto.trim() || "estudo-viabilidade"}-indicadores.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 font-sans">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          .no-print { display: none !important; }
          body, .min-h-screen { background: #fff !important; }
          main { padding: 0 !important; }
        }
      `}</style>
      {/* Top bar */}
      <header className="no-print sticky top-0 z-30 flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 64 64" width="28" height="28" className="shrink-0">
            <rect x="10" y="10" width="44" height="44" fill="none" stroke="#239181" strokeWidth="6" />
            <rect x="22" y="22" width="20" height="20" fill="#239181" />
          </svg>
          <div className="min-w-0">
            <h1 className="truncate text-[19px] font-extrabold tracking-tight text-slate-800 leading-tight">
              Viabilize
            </h1>
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400 leading-tight">
              Estudo de Viabilidade Arquitetônica
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
            <Gauge size={15} className="text-blue-600" />
            <span className="whitespace-nowrap text-[12px] font-medium text-blue-600">
              Índice Privativa/Prefeitura
            </span>
            <span className="text-[14px] font-semibold text-blue-700">
              {agregados.indicePrivativaPrefeitura !== null
                ? formatNumeroBR(agregados.indicePrivativaPrefeitura)
                : "—"}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <span className="whitespace-nowrap text-[12px] font-medium text-slate-500">Falta (Estoura)</span>
            <span
              className={`text-[14px] font-semibold ${
                agregados.faltaEstoura === null
                  ? "text-slate-400"
                  : agregados.faltaEstoura < 0
                  ? "text-red-600"
                  : agregados.faltaEstoura === 0
                  ? "text-emerald-600"
                  : "text-slate-900"
              }`}
            >
              {formatNumeroBR(agregados.faltaEstoura)}
            </span>
          </div>
          <button
            onClick={() => setConfirmandoNovoProjeto(true)}
            title="Apaga todos os dados preenchidos e começa um estudo em branco"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-500 hover:border-red-300 hover:text-red-600"
          >
            <Trash2 size={14} />
            Novo projeto
          </button>
        </div>
      </header>

      {confirmandoNovoProjeto && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setConfirmandoNovoProjeto(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-semibold text-slate-800">Começar um novo projeto?</h2>
            <p className="mt-2 text-[13px] text-slate-500">
              Isso vai apagar todos os dados preenchidos neste estudo e não pode ser desfeito.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmandoNovoProjeto(false)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:border-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarNovoProjeto}
                className="rounded-md bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-red-700"
              >
                Apagar tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Faixa de identificação do estudo — horizontal, fixa (sticky) logo abaixo do cabeçalho */}
      <div className="no-print sticky top-[161px] z-20 flex flex-wrap gap-x-8 gap-y-2 border-b border-slate-200 bg-blue-50 px-4 py-3 sm:top-[71px] sm:px-8">
        <IdField label="Cliente" placeholder="Nome do cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        <IdField
          label="Projeto"
          placeholder="Ex: Residencial Jardins"
          value={nomeProjeto}
          onChange={(e) => setNomeProjeto(e.target.value)}
        />
        <IdField
          label="Arquiteto responsável"
          placeholder="Nome"
          value={arquitetoResponsavel}
          onChange={(e) => setArquitetoResponsavel(e.target.value)}
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-blue-600">
            Opção / Revisão
          </span>
          <div className="flex items-center gap-1">
            <input
              value={opcaoEstudo}
              onChange={(e) => setOpcaoEstudo(e.target.value)}
              placeholder="01"
              className="w-10 bg-transparent text-[14px] font-semibold text-slate-800 placeholder:text-slate-300 outline-none"
            />
            <span className="text-[14px] font-semibold text-slate-300">/</span>
            <input
              value={revisaoEstudo}
              onChange={(e) => setRevisaoEstudo(e.target.value)}
              placeholder="R0"
              className="w-10 bg-transparent text-[14px] font-semibold text-slate-800 placeholder:text-slate-300 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-5xl flex flex-col gap-6">
            {/* Seções do estudo — fixa (sticky) logo abaixo do cabeçalho enquanto rola a página */}
            <div className="no-print sticky top-[318px] z-20 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm sm:top-[135px]">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                Seções do estudo
              </p>
              <div className="flex gap-1 overflow-x-auto">
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-[84px] shrink-0 rounded-lg px-1.5 py-1.5 text-center text-[10.5px] leading-tight sm:w-[100px] sm:text-[11.5px] ${
                        isActive
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-500 border border-slate-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ---------------- ABA: TERRENO E ZONEAMENTO ---------------- */}
            {activeTab === "terreno" && (
              <>
                <SectionCard
                  title="Localização"
                  subtitle="Identificação e localização administrativa do terreno"
                  collapsible
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field
                        label="Local (endereço)"
                        placeholder="Rua, número, bairro"
                        value={localEndereco}
                        onChange={(e) => setLocalEndereco(e.target.value)}
                      />
                    </div>
                    <Field
                      label="Município"
                      placeholder="São Paulo"
                      value={municipio}
                      onChange={(e) => setMunicipio(e.target.value)}
                    />
                    <SelectField
                      label="Subprefeitura"
                      value={subprefeitura}
                      onChange={(e) => handleSubprefeituraChange(e.target.value)}
                      options={Object.keys(SUBPREFEITURAS_SP)}
                    />
                    <SelectField
                      label="Subdistrito"
                      value={subdistrito}
                      onChange={(e) => setSubdistrito(e.target.value)}
                      options={SUBPREFEITURAS_SP[subprefeitura] || []}
                      disabled={!subprefeitura}
                    />
                    <Field
                      label="Testada do terreno"
                      unit="m"
                      placeholder="0,00"
                      value={testadaTerreno}
                      onChange={(e) => setTestadaTerreno(e.target.value)}
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Áreas do terreno"
                  subtitle="Áreas totais, de reserva e quinhão residencial"
                  collapsible
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field
                      label="Área do terreno"
                      unit="m²"
                      placeholder="0,00"
                      value={areaTerreno}
                      onChange={(e) => setAreaTerreno(e.target.value)}
                    />
                    <Field
                      label="Reserva de calçada"
                      unit="m²"
                      placeholder="0,00"
                      value={reservaCalcada}
                      onChange={(e) => setReservaCalcada(e.target.value)}
                    />
                    <Field
                      label="Doação"
                      unit="m²"
                      placeholder="0,00"
                      value={doacao}
                      onChange={(e) => setDoacao(e.target.value)}
                    />
                    <Field
                      label="Área remanescente"
                      unit="m²"
                      value={formatNumeroBR(agregados.areaRemanescente)}
                      disabled
                    />
                    <Field
                      label="Quinhão residencial"
                      unit="m²"
                      value={agregados.quinhaoResidencial !== null ? formatNumeroBR(agregados.quinhaoResidencial) : "—"}
                      disabled
                    />
                  </div>
                  <p className="mt-3 text-[12px] text-slate-400">
                    Quinhão residencial = Área remanescente − Quinhão não residencial (módulo "Uso Não
                    Residencial (NR)", abaixo — ative-o se o projeto tiver uso comercial/NR).
                  </p>
                </SectionCard>

                <SectionCard
                  title="Parâmetros da zona"
                  subtitle="Índices urbanísticos aplicáveis conforme a legislação de zoneamento — Quadro 3, Lei nº 16.402/2016"
                  collapsible
                >
                  <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
                    <p className="text-[12px] text-blue-700">
                      {QUADRO_3[zona]
                        ? "Valores preenchidos automaticamente a partir do Quadro 3 da Lei nº 16.402/2016. Você pode ajustar manualmente se necessário."
                        : "Selecione uma zona para preencher automaticamente, ou digite os valores manualmente (algumas zonas especiais, como ZEP/ZEPEC/ZOE, seguem legislação específica e não têm parâmetros fixos no Quadro 3)."}
                    </p>
                    <button
                      onClick={() => preencherDoQuadro3(zona, areaTerreno)}
                      disabled={!QUADRO_3[zona]}
                      className="shrink-0 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-[12px] font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Atualizar do Quadro 3
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <SelectField
                      label="Zona"
                      value={zona}
                      onChange={(e) => handleZonaChange(e.target.value)}
                      options={ZONAS_SP}
                    />
                    <Field
                      label="Tipo de zona"
                      value={QUADRO_3[zona]?.tipo || "—"}
                      disabled
                    />
                    <Field
                      label="CA mínimo da zona"
                      placeholder={
                        QUADRO_3[zona] && QUADRO_3[zona].caMinimo === null ? "NA — não se aplica" : "0,00"
                      }
                      value={caMinimoZona}
                      onChange={(e) => setCaMinimoZona(e.target.value)}
                    />
                    <Field
                      label="CA básico da zona"
                      placeholder={
                        QUADRO_3[zona] && QUADRO_3[zona].caBasico === null ? "NA — não se aplica" : "0,00"
                      }
                      value={caBasicoZona}
                      onChange={(e) => setCaBasicoZona(e.target.value)}
                    />
                    <Field
                      label="CA máximo da zona"
                      placeholder={
                        QUADRO_3[zona] && QUADRO_3[zona].caMaximo === null ? "NA — não se aplica" : "0,00"
                      }
                      value={caMaximoZona}
                      onChange={(e) => setCaMaximoZona(e.target.value)}
                    />
                    <div>
                      <Field
                        label="Majoração CA (bônus urbanístico)"
                        unit="%"
                        placeholder={agregados.cotaSolidariedadeAtiva ? "20,00 (automático)" : "0,00"}
                        value={majoracaoCA}
                        onChange={(e) => setMajoracaoCA(e.target.value)}
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        {agregados.cotaSolidariedadeAtiva
                          ? "Preenchido automaticamente com 20% (bônus da Cota de Solidariedade, seção abaixo). Digite outro valor aqui para sobrescrever."
                          : "Sem Cota de Solidariedade ativa, não há bônus automático. Use este campo apenas para simular outros incentivos específicos (fruição pública, térreo ativo, outorga onerosa) — ele não deve herdar o bônus residencial da Cota de Solidariedade."}
                      </p>
                    </div>
                    <Field
                      label="CA máximo com benefícios"
                      placeholder={
                        agregados.caMaximoComBeneficiosCalculado !== null
                          ? `Sugestão: ${formatNumeroBR(agregados.caMaximoComBeneficiosCalculado)}`
                          : "0,00"
                      }
                      value={caMaximoComBeneficiosManual}
                      onChange={(e) => setCaMaximoComBeneficiosManual(e.target.value)}
                    />
                    <div>
                      <Field
                        label="TO máxima"
                        unit="%"
                        placeholder={
                          QUADRO_3[zona] &&
                          QUADRO_3[zona].to500 === null &&
                          QUADRO_3[zona].toMais500 === null
                            ? "NA — não se aplica"
                            : "0,00"
                        }
                        value={toMaximaZona}
                        onChange={(e) => setToMaximaZona(e.target.value)}
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Preenchida automaticamente conforme a testada/área do terreno, a partir das
                        colunas do Quadro 3: "T.O. para lotes até 500 m²" ou "T.O. para lotes igual ou
                        superior a 500 m²".
                      </p>
                    </div>
                    <Field
                      label="Gabarito máximo"
                      unit="m"
                      placeholder={
                        QUADRO_3[zona] && QUADRO_3[zona].gabarito === null ? "NA — não se aplica" : "0,00"
                      }
                      value={gabaritoMaximoZona}
                      onChange={(e) => setGabaritoMaximoZona(e.target.value)}
                    />
                    <Field
                      label="Cota Ambiental (QA exigido)"
                      placeholder="0,00"
                      value={cotaAmbiental}
                      onChange={(e) => setCotaAmbiental(e.target.value)}
                    />
                    <Field
                      label="TP necessária"
                      placeholder="0,00"
                      value={tpNecessaria}
                      onChange={(e) => setTpNecessaria(e.target.value)}
                    />
                    <Field
                      label="TP projeto"
                      placeholder="0,00"
                      value={tpProjeto}
                      onChange={(e) => setTpProjeto(e.target.value)}
                    />
                    <Field
                      label="Redução TP"
                      value={agregados.reducaoTP !== null ? formatNumeroBR(agregados.reducaoTP) : "calculado"}
                      disabled
                    />
                  </div>
                  <p className="mt-3 text-[12px] text-slate-400">
                    CA máximo com benefícios = CA máximo da zona × (1 + Majoração ÷ 100). Redução TP = (TP
                    projeto ÷ TP necessária) − 1.
                  </p>

                  {QUADRO_3[zona] && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[12px] font-medium text-slate-600">
                        Recuos mínimos (m) — {zona}
                      </p>
                      <p className="mt-1 text-[12px] text-slate-500">
                        Frente:{" "}
                        {QUADRO_3[zona].recuoFrente !== null ? `${QUADRO_3[zona].recuoFrente} m` : "não se aplica"}
                        {" · "}
                        Fundos/laterais (edificação até 10m):{" "}
                        {QUADRO_3[zona].recuoLatFundoAte10 !== null
                          ? `${QUADRO_3[zona].recuoLatFundoAte10} m`
                          : "não se aplica"}
                        {" · "}
                        Fundos/laterais (edificação acima de 10m):{" "}
                        {QUADRO_3[zona].recuoLatFundoAcima10 !== null
                          ? `${QUADRO_3[zona].recuoLatFundoAcima10} m`
                          : "não se aplica"}
                      </p>
                      {QUADRO_3[zona].notas.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                          {QUADRO_3[zona].notas.map((letra) => (
                            <p key={letra} className="text-[11px] text-amber-600">
                              ({letra}) {NOTAS_QUADRO_3[letra]}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Cota-parte e fator social"
                  subtitle="Parâmetros de fracionamento do solo, limite de adensamento e fator social"
                  collapsible
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field
                      label="Cota-parte máxima"
                      unit="m²"
                      placeholder={
                        QUADRO_3[zona] && QUADRO_3[zona].cotaParteMaxima === null
                          ? "NA — não se aplica"
                          : "0,00"
                      }
                      value={cotaParteMaxima}
                      onChange={(e) => setCotaParteMaxima(e.target.value)}
                    />
                    <Field
                      label="Nº mínimo de unidades"
                      value={
                        agregados.nMinimoUnidades !== null
                          ? formatNumeroBR(agregados.nMinimoUnidades)
                          : "calculado"
                      }
                      disabled
                    />
                    <Field
                      label="Cota-parte mínima"
                      unit="m²"
                      placeholder="0,00"
                      value={cotaParteMinima}
                      onChange={(e) => setCotaParteMinima(e.target.value)}
                    />
                    <Field
                      label="Nº máximo de unidades"
                      value={
                        agregados.nMaximoUnidades !== null
                          ? formatNumeroBR(agregados.nMaximoUnidades)
                          : "calculado"
                      }
                      disabled
                    />
                    <div className="flex flex-col gap-1.5">
                      <Field
                        label="Cota-parte real do projeto"
                        unit="m²"
                        value={
                          agregados.cotaParteReal !== null
                            ? formatNumeroBR(agregados.cotaParteReal)
                            : "calculado"
                        }
                        disabled
                      />
                      {(agregados.cotaParteAbaixoMinima || agregados.cotaParteAcimaMaxima) && (
                        <p
                          className="flex items-center gap-1 text-[10px] font-medium text-red-600"
                          title={`Cota-parte real (Área útil do terreno ÷ Nº total de unidades) fora dos limites do Quadro 3 da zona: mínima ${
                            cotaParteMinima || "—"
                          } m² e máxima ${cotaParteMaxima || "—"} m² por unidade.`}
                        >
                          <AlertTriangle size={11} className="shrink-0" />
                          {agregados.cotaParteAbaixoMinima
                            ? "abaixo da cota-parte mínima"
                            : "acima da cota-parte máxima"}
                        </p>
                      )}
                    </div>
                    <Field
                      label="Fator Social (Fs)"
                      value={agregados.fsAutomatico !== null ? formatNumeroBR(agregados.fsAutomatico) : "calculado"}
                      disabled
                    />
                    <Field
                      label="Nº de unidades do projeto (estimativa)"
                      placeholder="0"
                      value={numeroUnidadesProjeto}
                      numerico
                      onChange={(e) => setNumeroUnidadesProjeto(e.target.value)}
                    />
                  </div>
                  <p className="mt-3 text-[12px] text-slate-400">
                    Nº mínimo de unidades = arredondar para cima (Área computável residencial ÷ (CA máximo
                    da zona × Cota-parte máxima)). Nº máximo de unidades (limite de adensamento) =
                    arredondar para baixo (Área computável residencial ÷ (CA máximo da zona × Cota-parte
                    mínima)). Cota-parte real do projeto = Área útil do terreno (terreno − reserva de
                    calçada) ÷ Nº total de unidades — usa as unidades já alocadas nos pavimentos
                    (Dados do Empreendimento) e só recorre à estimativa manual acima enquanto nenhum
                    pavimento foi preenchido. Alerta em vermelho quando o valor sai dos limites do
                    Quadro 3 da zona (soft warning — não bloqueia o preenchimento).
                  </p>
                </SectionCard>

              </>
            )}

            {/* ---------------- ABA: BENEFÍCIOS ---------------- */}
            {activeTab === "beneficios" && (
              <>
                <SectionCard
                  title="Uso Não Residencial (NR)"
                  subtitle="Módulo opcional — ative apenas se o empreendimento tiver quinhão de terreno dedicado a uso comercial/não residencial"
                  collapsible
                >
                  <label className="flex max-w-xs flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-slate-500">
                      Este projeto tem uso Não Residencial?
                    </span>
                    <select
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      value={usoNaoResidencialAtivo}
                      onChange={(e) => setUsoNaoResidencialAtivo(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      <option value="Sim">Sim</option>
                      <option value="Não">Não</option>
                    </select>
                  </label>

                  {usoNaoResidencialAtivo === "Sim" && (
                    <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                      <Field
                        label="Quinhão não residencial (NR)"
                        unit="m²"
                        placeholder="0,00"
                        value={quinhaoNaoResidencial}
                        onChange={(e) => setQuinhaoNaoResidencial(e.target.value)}
                      />
                      <div>
                        <Field
                          label="Majoração CA (NR)"
                          placeholder="0,00"
                          value={majoracaoNR}
                          onChange={(e) => setMajoracaoNR(e.target.value)}
                        />
                        <p className="mt-1 text-[11px] text-slate-400">
                          Pontos de CA adicionados apenas ao uso Não Residencial, somados ao CA do R2V com
                          benefícios. Ver "Potencial Construtivo por Uso", na seção Cota de Solidariedade.
                        </p>
                      </div>
                      <div>
                        <Field
                          label="Uso específico (opcional)"
                          placeholder="Ex: Hotel, Comercial..."
                          value={nomeUsoNR}
                          onChange={(e) => setNomeUsoNR(e.target.value)}
                        />
                        <p className="mt-1 text-[11px] text-slate-400">
                          Apenas rotula a linha na tabela "Potencial Construtivo por Uso" (ex: "NR
                          Computável (Hotel)"). Não afeta nenhum cálculo.
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="mt-3 text-[12px] text-slate-400">
                    Quinhão residencial = Área remanescente − Quinhão não residencial. Ambos entram no
                    cálculo de potencial construtivo por uso, já que R2V e NR aplicam o CA sobre bases de
                    área diferentes.
                  </p>
                </SectionCard>

                <SectionCard
                  title="Cota de Solidariedade"
                  subtitle="Instrumento do Plano Diretor: destinação de área/unidades para HIS/HMP em troca de bônus de potencial construtivo"
                  collapsible
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-slate-500">
                        Haverá Cota de Solidariedade?
                      </span>
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={agregados.cotaSolidariedadeObrigatoria ? "Sim" : cotaSolidariedade}
                        onChange={(e) => setCotaSolidariedade(e.target.value)}
                        disabled={agregados.cotaSolidariedadeObrigatoria}
                      >
                        <option value="">Selecione...</option>
                        <option value="Sim">Sim</option>
                        <option value="Não">Não</option>
                      </select>
                    </label>
                    <div className="sm:col-span-2 flex items-end">
                      {agregados.cotaSolidariedadeObrigatoria ? (
                        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                          <strong>Obrigatória.</strong> A área computável total já atingiu 20.000 m², então a
                          Cota de Solidariedade passa a ser exigida por lei — não é mais opcional.
                        </p>
                      ) : (
                        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
                          Abaixo de 20.000 m² de área computável, é <strong>opcional</strong> — vale a pena
                          adotar para capturar o bônus de potencial construtivo (+20% de CA).
                        </p>
                      )}
                    </div>
                  </div>

                  {agregados.cotaSolidariedadeAtiva && (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                        Bônus de potencial construtivo
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[11px] text-slate-400">CA básico da zona</p>
                          <p className="text-[15px] font-semibold text-slate-800">
                            {formatNumeroBR(paraNumero(caMaximoZona))}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[11px] text-slate-400">Benefício (Cota Solidariedade)</p>
                          <p className="text-[15px] font-semibold text-slate-800">+20%</p>
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <p className="text-[11px] text-blue-600">CA resultante — R2V/NR</p>
                          <p className="text-[15px] font-semibold text-blue-700">
                            {formatNumeroBR(agregados.caMaximoComBeneficios)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <p className="text-[11px] text-blue-600">Área computável (com bônus) — R2V/NR</p>
                          <p className="text-[15px] font-semibold text-blue-700">
                            {agregados.areaComputavelComBonusCotaSolidariedade !== null
                              ? formatNumeroBR(agregados.areaComputavelComBonusCotaSolidariedade)
                              : "—"}{" "}
                            m²
                          </p>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-[11px] text-emerald-600">
                            CA Resultante Total (R2V/NR + HMP + HIS)
                          </p>
                          <p className="text-[15px] font-semibold text-emerald-700">
                            {formatNumeroBR(agregados.caResultanteTotal)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-[11px] text-emerald-600">
                            Área Computável Total (potencial teórico)
                          </p>
                          <p className="text-[15px] font-semibold text-emerald-700">
                            {formatNumeroBR(agregados.potencialTeoricoTotal)} m²
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">
                        <strong>CA resultante — R2V/NR</strong> e <strong>Área computável (com bônus) — R2V/NR</strong>{" "}
                        = CA básico da zona × 1,2 aplicado sobre o terreno inteiro, ignorando a divisão em
                        quinhões (referência rápida, igual ao "CA máximo com benefícios" da seção Parâmetros da
                        zona). <strong>CA Resultante Total</strong> e <strong>Área Computável Total (potencial
                        teórico)</strong> somam as 4 trilhas do quadro "Potencial Construtivo por Uso" abaixo
                        (R2V + NR sobre seus quinhões, HMP + HIS sobre o terreno total) — são esses dois valores,
                        e não os de cima, que alimentam a Contrapartida HIS, o Benefício NR e o Benefício
                        empreendimento sem vagas (10% / 20% / 10% da Área Computável Total). Para referência, a
                        área computável real do projeto (soma efetiva de blocos, unidades e estacionamento,
                        igual à do "Resumo do empreendimento") está em{" "}
                        <strong>{formatNumeroBR(agregados.areaComputavelTotal)} m²</strong>. O bônus de 20% é
                        aplicado automaticamente no campo "Majoração CA" (seção Parâmetros da zona, acima) —
                        você pode digitar outro valor lá para sobrescrever.
                      </p>

                      <p className="mb-3 mt-5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                        Outros benefícios não computáveis
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[11px] text-slate-400">Benefício NR (20% da computável total)</p>
                          <p className="text-[15px] font-semibold text-slate-800">
                            {formatNumeroBR(agregados.beneficioNR)} m²
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[11px] text-slate-400">
                            Benefício empreendimento sem vagas (10% da computável total)
                          </p>
                          <p className="text-[15px] font-semibold text-slate-800">
                            {formatNumeroBR(agregados.beneficioEmpreendimentoSemVagas)} m²
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">
                        Benefício NR = incentivo específico de uso Não Residencial. Benefício
                        empreendimento sem vagas = pode ser usado para circulação não computável (aloque a
                        área normalmente nos campos "Circulação" do Pavimento, respeitando esse teto). Os
                        dois são calculados sobre a mesma Área Computável Total usada na Contrapartida HIS
                        acima — mesmo quadro "Divisão por Terreno Virtual" da planilha de referência.
                      </p>

                      <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                        Modalidade de atendimento da contrapartida
                      </p>
                      <label className="flex max-w-md flex-col gap-1.5">
                        <select
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          value={modalidadeCotaSolidariedade}
                          onChange={(e) => setModalidadeCotaSolidariedade(e.target.value)}
                        >
                          <option value="">Selecione...</option>
                          <option value="Construção de HIS">Incorporar HIS/HMP</option>
                          <option value="Pagamento em Recursos Financeiros (FUNDURB)">
                            FUNDURB/COMPENSAÇÃO
                          </option>
                        </select>
                      </label>

                      {agregados.pagamentoFundurbAtivo ? (
                        <>
                          <p className="mb-3 mt-5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                            Contrapartida financeira (FUNDURB)
                          </p>
                          <p className="mb-3 text-[12px] text-slate-500">
                            Nessa modalidade, o empreendimento mantém 100% do potencial construtivo voltado
                            ao mix residencial — nenhuma unidade é sacrificada para construção física de HIS.
                            O VGV e o mix de unidades ficam intactos; a obrigação é quitada em dinheiro.
                          </p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] text-slate-400">Área da cota (10% do computável)</p>
                              <p className="text-[15px] font-semibold text-slate-800">
                                {formatNumeroBR(agregados.areaCotaFundurb)} m²
                              </p>
                            </div>
                            <Field
                              label="Valor de referência do m² (R$)"
                              placeholder="0,00"
                              numerico
                              value={valorReferenciaM2Fundurb}
                              onChange={(e) => setValorReferenciaM2Fundurb(e.target.value)}
                            />
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                              <p className="text-[11px] text-blue-600">Valor total FUNDURB</p>
                              <p className="text-[15px] font-semibold text-blue-700">
                                R$ {formatNumeroBR(agregados.valorTotalFundurb)}
                              </p>
                            </div>
                          </div>
                          <p className="mt-2 text-[11px] text-slate-400">
                            Valor Total FUNDURB = Área da cota × Valor de referência do m² — essa é a
                            despesa de contrapartida urbanística do empreendimento.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="mb-3 mt-5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                            Contrapartida social — total exigido
                          </p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] text-slate-400">Necessária (10% do computável)</p>
                              <p className="text-[15px] font-semibold text-slate-800">
                                {formatNumeroBR(agregados.contrapartidaHISNecessaria)} m²
                              </p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] text-slate-400">Já alocada (HIS + HMP)</p>
                              <p className="text-[15px] font-semibold text-slate-800">
                                {formatNumeroBR(agregados.contrapartidaHISAlocada)} m²
                              </p>
                            </div>
                            <div
                              className={`rounded-lg border p-3 ${
                                agregados.contrapartidaHISFalta > 0
                                  ? "border-red-200 bg-red-50"
                                  : "border-emerald-200 bg-emerald-50"
                              }`}
                            >
                              <p
                                className={`text-[11px] ${
                                  agregados.contrapartidaHISFalta > 0 ? "text-red-500" : "text-emerald-600"
                                }`}
                              >
                                {agregados.contrapartidaHISFalta > 0 ? "Ainda falta alocar" : "Atendida"}
                              </p>
                              <p
                                className={`text-[15px] font-semibold ${
                                  agregados.contrapartidaHISFalta > 0 ? "text-red-700" : "text-emerald-700"
                                }`}
                              >
                                {agregados.contrapartidaHISFalta > 0
                                  ? `${formatNumeroBR(agregados.contrapartidaHISFalta)} m²`
                                  : `${formatNumeroBR(agregados.percentualContrapartidaAtendida, 0)}%`}
                              </p>
                            </div>
                          </div>

                          <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                            Split da cota — HIS x HMP
                          </p>
                          <div
                            className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700"
                            title="Nota legal: Para que a área da Cota de Solidariedade seja considerada não computável no próprio lote, a destinação mínima de 10% deve ser feita exclusivamente em unidades HIS."
                          >
                            <strong>Nota legal:</strong> para que a área da Cota de Solidariedade seja
                            considerada não computável no próprio lote, a destinação mínima de 10% deve ser
                            feita exclusivamente em unidades HIS. O split abaixo já começa em 100% HIS / 0%
                            HMP por isso — ajuste livremente se quiser simular outros cenários (ex: parte em
                            HMP), a mudança não é bloqueada.
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Field
                              label="% destinado a HIS"
                              unit="%"
                              placeholder="100,00"
                              numerico
                              value={splitHISPercentual}
                              onChange={(e) => setSplitHISPercentual(e.target.value)}
                            />
                            <Field
                              label="% destinado a HMP"
                              unit="%"
                              value={formatNumeroBR(agregados.splitHMPNum)}
                              disabled
                            />
                            <Field
                              label="Área média por unidade HIS"
                              unit="m²"
                              placeholder="40,00"
                              numerico
                              value={areaMediaUnidadeHIS}
                              onChange={(e) => setAreaMediaUnidadeHIS(e.target.value)}
                            />
                            <Field
                              label="Área média por unidade HMP"
                              unit="m²"
                              placeholder="50,00"
                              numerico
                              value={areaMediaUnidadeHMP}
                              onChange={(e) => setAreaMediaUnidadeHMP(e.target.value)}
                            />
                          </div>
                          <p className="mt-2 text-[11px] text-slate-400">
                            HIS + HMP soma sempre 100%. A área média por unidade é usada só para estimar a
                            quantidade de unidades necessárias — ajuste conforme a tipologia do seu projeto.
                          </p>

                          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {/* Painel HIS */}
                            <div className="rounded-lg border border-slate-200 p-3">
                              <p className="mb-2 text-[12px] font-semibold text-slate-600">
                                HIS ({formatNumeroBR(agregados.splitHISNum, 0)}% da cota)
                              </p>
                              <div className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
                                <div>
                                  <p className="text-slate-400">Exigido</p>
                                  <p className="font-semibold text-slate-800">
                                    {formatNumeroBR(agregados.areaHISNecessaria)} m²
                                  </p>
                                </div>
                                <div>
                                  <p className="text-slate-400">Unidades necessárias</p>
                                  <p className="font-semibold text-slate-800">
                                    {agregados.unidadesHISNecessarias !== null
                                      ? formatNumeroBR(agregados.unidadesHISNecessarias, 0)
                                      : "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-slate-400">Já alocado</p>
                                  <p className="font-semibold text-slate-800">
                                    {formatNumeroBR(agregados.contrapartidaAlocadaHIS)} m²
                                  </p>
                                </div>
                                <div
                                  className={`rounded-md border px-2 py-1 ${
                                    agregados.faltaAlocarHIS > 0
                                      ? "border-red-200 bg-red-50"
                                      : "border-emerald-200 bg-emerald-50"
                                  }`}
                                >
                                  <p
                                    className={`text-[10px] ${
                                      agregados.faltaAlocarHIS > 0 ? "text-red-500" : "text-emerald-600"
                                    }`}
                                  >
                                    {agregados.faltaAlocarHIS > 0 ? "Falta alocar" : "Atendido"}
                                  </p>
                                  <p
                                    className={`text-[13px] font-semibold ${
                                      agregados.faltaAlocarHIS > 0 ? "text-red-700" : "text-emerald-700"
                                    }`}
                                  >
                                    {agregados.faltaAlocarHIS > 0
                                      ? `${formatNumeroBR(agregados.faltaAlocarHIS)} m²`
                                      : `${formatNumeroBR(agregados.percentualAtendidoHIS, 0)}%`}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Painel HMP */}
                            <div className="rounded-lg border border-slate-200 p-3">
                              <p className="mb-2 text-[12px] font-semibold text-slate-600">
                                HMP ({formatNumeroBR(agregados.splitHMPNum, 0)}% da cota)
                              </p>
                              <div className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
                                <div>
                                  <p className="text-slate-400">Exigido</p>
                                  <p className="font-semibold text-slate-800">
                                    {formatNumeroBR(agregados.areaHMPNecessaria)} m²
                                  </p>
                                </div>
                                <div>
                                  <p className="text-slate-400">Unidades necessárias</p>
                                  <p className="font-semibold text-slate-800">
                                    {agregados.unidadesHMPNecessarias !== null
                                      ? formatNumeroBR(agregados.unidadesHMPNecessarias, 0)
                                      : "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-slate-400">Já alocado</p>
                                  <p className="font-semibold text-slate-800">
                                    {formatNumeroBR(agregados.contrapartidaAlocadaHMP)} m²
                                  </p>
                                </div>
                                <div
                                  className={`rounded-md border px-2 py-1 ${
                                    agregados.faltaAlocarHMP > 0
                                      ? "border-red-200 bg-red-50"
                                      : "border-emerald-200 bg-emerald-50"
                                  }`}
                                >
                                  <p
                                    className={`text-[10px] ${
                                      agregados.faltaAlocarHMP > 0 ? "text-red-500" : "text-emerald-600"
                                    }`}
                                  >
                                    {agregados.faltaAlocarHMP > 0 ? "Falta alocar" : "Atendido"}
                                  </p>
                                  <p
                                    className={`text-[13px] font-semibold ${
                                      agregados.faltaAlocarHMP > 0 ? "text-red-700" : "text-emerald-700"
                                    }`}
                                  >
                                    {agregados.faltaAlocarHMP > 0
                                      ? `${formatNumeroBR(agregados.faltaAlocarHMP)} m²`
                                      : `${formatNumeroBR(agregados.percentualAtendidoHMP, 0)}%`}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                          <p className="mt-2 text-[11px] text-slate-400">
                            Cadastre as unidades na categoria "HIS e HMP" da aba "Resumo das Unidades",
                            marcando a coluna "Categoria" como HIS ou HMP conforme o caso, e aloque-as em
                            algum Pavimento — os painéis acima cruzam automaticamente essas alocações com o
                            que é exigido para cada categoria.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </SectionCard>

                {agregados.cotaSolidariedadeAtiva && (
                <SectionCard
                  title="Potencial Construtivo por Uso"
                  subtitle="R2V e NR usam seus próprios quinhões de terreno; HMP e HIS são bônus adicionais aplicados sobre o terreno total"
                  collapsible
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-slate-500">Aplicar bônus HMP?</span>
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={aplicarBonusHMP}
                        onChange={(e) => setAplicarBonusHMP(e.target.value)}
                      >
                        <option value="">Selecione...</option>
                        <option value="Sim">Sim</option>
                        <option value="Não">Não</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-slate-500">Aplicar bônus HIS?</span>
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={aplicarBonusHIS}
                        onChange={(e) => setAplicarBonusHIS(e.target.value)}
                      >
                        <option value="">Selecione...</option>
                        <option value="Sim">Sim</option>
                        <option value="Não">Não</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-2 text-[12px] text-slate-400">
                    HMP = 25% do CA básico da zona · HIS = 50% do CA básico da zona — ambos aplicados sobre o
                    terreno total, com +20% adicional quando a Cota de Solidariedade é obrigatória
                    (≥ 20.000 m² de computável).
                  </p>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[12px] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Uso</th>
                          <th className="py-2 pr-3 font-medium">CA aplicado</th>
                          <th className="py-2 pr-3 font-medium">Base de área</th>
                          <th className="py-2 pr-3 font-medium">Computável máxima</th>
                          <th className="py-2 pr-3 font-medium">Computável atingida</th>
                          <th className="py-2 font-medium">Falta (Estoura)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agregados.potencialPorUso.map((linha) => (
                          <tr key={linha.uso} className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-medium text-slate-700">{linha.uso}</td>
                            <td className="py-2 pr-3 font-mono">{linha.ca !== null ? formatNumeroBR(linha.ca) : "—"}</td>
                            <td className="py-2 pr-3 text-slate-500">{linha.base}</td>
                            <td className="py-2 pr-3 font-mono">
                              {linha.maximo !== null ? `${formatNumeroBR(linha.maximo)} m²` : "—"}
                            </td>
                            <td className="py-2 pr-3 font-mono">
                              {linha.atingida !== null ? `${formatNumeroBR(linha.atingida)} m²` : "—"}
                            </td>
                            <td
                              className={`py-2 font-mono font-semibold ${
                                linha.falta === null
                                  ? "text-slate-400"
                                  : linha.falta < 0
                                  ? "text-red-600"
                                  : "text-emerald-600"
                              }`}
                            >
                              {linha.falta !== null ? `${formatNumeroBR(linha.falta)} m²` : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr className="font-semibold text-slate-800">
                          <td className="py-2 pr-3" colSpan={3}>
                            Total
                          </td>
                          <td className="py-2 pr-3 font-mono">{formatNumeroBR(agregados.computavelMaximoPermitido)} m²</td>
                          <td className="py-2 pr-3 font-mono">
                            {formatNumeroBR(agregados.totalAtingidaPotencialPorUso)} m²
                          </td>
                          <td
                            className={
                              agregados.totalFaltaPotencialPorUso < 0
                                ? "py-2 font-mono text-red-600"
                                : "py-2 font-mono text-emerald-600"
                            }
                          >
                            {formatNumeroBR(agregados.totalFaltaPotencialPorUso)} m²
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-[12px] text-slate-400">
                    O "Falta (Estoura)" no topo da página compara diretamente Computável máximo permitido
                    × Área computável total do projeto (mesma conferência da planilha oficial) — por isso
                    pode não bater com o "Total" desta tabela, que é a soma das 4 trilhas individuais.
                    R2V e NR não podem faltar/estourar juntos: cada um tem seu próprio quinhão e seu
                    próprio limite. A "Computável atingida" de HMP/HIS usa a privativa das unidades
                    HIS/HMP quando a categoria é incentivo não computável (não entram na "Área computável
                    total" do projeto, mas consomem a trilha de bônus), por isso a soma da coluna Atingida
                    não é igual à área computável total do empreendimento.
                  </p>
                </SectionCard>
                )}

                {agregados.cotaSolidariedadeAtiva && (
                <SectionCard
                  title="Residencial sem Vagas"
                  subtitle="Bônus adicional de potencial construtivo — independente do teto de circulação não computável já existente"
                  collapsible
                >
                  <label className="flex max-w-xs flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-slate-500">
                      Ativar bônus Residencial sem Vagas?
                    </span>
                    <select
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      value={residencialSemVagas}
                      onChange={(e) => setResidencialSemVagas(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      <option value="Sim">Sim</option>
                      <option value="Não">Não</option>
                    </select>
                  </label>
                  {agregados.residencialSemVagasAtivo && (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-[11px] text-emerald-600">
                        Bônus aplicado (10% do potencial teórico R2V+NR+HMP+HIS)
                      </p>
                      <p className="text-[15px] font-semibold text-emerald-700">
                        {formatNumeroBR(agregados.potencialSemVagasMaximo)} m²
                      </p>
                    </div>
                  )}
                  <p className="mt-3 text-[12px] text-slate-400">
                    Quando ativado, soma automaticamente +10% na Área Computável Máxima Permitida, no
                    CA Resultante Total e no "Falta (Estoura)" do topo da página — uma 5ª trilha de
                    potencial construtivo, somada de fato (diferente do "Benefício empreendimento sem
                    vagas" da seção Cota de Solidariedade acima, que é só um teto de referência para
                    área de circulação não computável e nunca soma no potencial construtível).
                  </p>
                </SectionCard>
                )}

                <SectionCard
                  title="Fachada Ativa"
                  subtitle="Área do pavimento térreo destinada a comércio/serviços com fachada ativa"
                  collapsible
                >
                  <p className="text-[12px] text-slate-500">
                    Cadastre a área de fachada ativa como uma unidade na categoria{" "}
                    <strong>"Fachada Ativa"</strong> (aba "Resumo das Unidades") e aloque-a no pavimento
                    térreo (aba "Dados do Empreendimento"). Essa categoria já é tratada como{" "}
                    <strong>área não computável</strong> automaticamente — a metragem lançada ali não
                    consome o CA do empreendimento.
                  </p>
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <p className="text-[11px] text-blue-600">Área de Fachada Ativa já alocada</p>
                    <p className="text-[15px] font-semibold text-blue-700">
                      {formatNumeroBR(agregados.areaFachadaAtivaAlocada)} m²
                    </p>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ---------------- ABA: DADOS DO EMPREENDIMENTO ---------------- */}
            {activeTab === "empreendimento" && (
              <>
              <SectionCard
                title="Usos e blocos"
                subtitle="Cadastre cada uso/bloco do empreendimento com suas características construtivas"
              >
                <div className="flex flex-col gap-4">
                  {agregados.blocosComputados.map((bloco, i) => {
                    const minimizado = blocosMinimizados.has(bloco.id);
                    return (
                    <div
                      key={bloco.id}
                      className={`rounded-lg border bg-slate-50/60 p-5 transition-colors ${
                        itemArrastado?.tipo === "bloco" && itemArrastado.id === bloco.id
                          ? "border-blue-400 bg-blue-50/40"
                          : "border-slate-200"
                      }`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        soltarArrasto("bloco", bloco.id);
                      }}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex flex-1 items-center gap-2">
                          <button
                            onClick={() => toggleMinimizarBloco(bloco.id)}
                            className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-blue-300 hover:text-blue-600"
                            aria-label={minimizado ? "Expandir bloco" : "Minimizar bloco"}
                          >
                            <ChevronRight
                              size={15}
                              className={`transition-transform ${minimizado ? "" : "rotate-90"}`}
                            />
                          </button>
                          <div
                            draggable
                            onDragStart={() => iniciarArrasto("bloco", bloco.id)}
                            className="shrink-0 cursor-grab active:cursor-grabbing"
                            title="Arraste para reordenar"
                          >
                            <AlcaArrastar />
                          </div>
                          <input
                            className="w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            value={bloco.nome}
                            onChange={(e) => updateBloco(bloco.id, "nome", e.target.value)}
                            placeholder={`Uso / Bloco ${i + 1}`}
                          />
                        </div>
                        {blocos.length > 1 && (
                          <button
                            onClick={() => removeBloco(bloco.id)}
                            className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-red-500 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                            Remover
                          </button>
                        )}
                      </div>

                      {!minimizado && (
                      <>
                      <div className="mb-4 max-w-xs">
                        <Field
                          label="Quantidade de blocos"
                          placeholder="1"
                          value={bloco.quantidadeBlocos}
                          numerico
                          onChange={(e) => updateBloco(bloco.id, "quantidadeBlocos", e.target.value)}
                        />
                        <p className="mt-1 text-[11px] text-slate-400">
                          Quantas torres idênticas a esta existem no empreendimento. Os totais deste bloco
                          (pavimentos, unidades, computável, privativa e vagas) são multiplicados por este
                          valor no rodapé "Resumo do bloco" e nos Indicadores Gerais.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <SelectField
                          label="Uso"
                          value={bloco.uso}
                          onChange={(e) => updateBloco(bloco.id, "uso", e.target.value)}
                          options={[
                            "Comercial",
                            "Flat",
                            "Hotel",
                            "Institucional",
                            "Misto",
                            "Residencial",
                            "Vila",
                            "Serviços",
                          ]}
                        />
                        <Field
                          label="Escadas por bloco"
                          placeholder="1"
                          value={bloco.escadas}
                          numerico
                          onChange={(e) => updateBloco(bloco.id, "escadas", e.target.value)}
                        />
                        <SelectField
                          label="Tipo de escada"
                          value={bloco.tipoEscada}
                          onChange={(e) => updateBloco(bloco.id, "tipoEscada", e.target.value)}
                          options={["Aberta", "Ante-câmara", "Enclausurada", "Pressurizada"]}
                        />
                        <Field
                          label="Elevadores por bloco"
                          placeholder="1"
                          value={bloco.elevadores}
                          numerico
                          onChange={(e) => updateBloco(bloco.id, "elevadores", e.target.value)}
                        />
                      </div>

                      {/* ---- Pavimentos (lajes) deste bloco ---- */}
                      <div className="mt-6 border-t border-slate-200 pt-4">
                        <span className="text-[13px] font-semibold text-slate-600">
                          Pavimento
                        </span>
                        <p className="mt-0.5 text-[12px] text-slate-400">
                          Este bloco é um edifício composto por grupos de pavimentos (ex: Térreo,
                          Pavimento Tipo, Duplex/Penthouse, Ático, Cobertura). Cadastre cada grupo
                          separadamente — o título de cada um pode ser renomeado.
                        </p>

                        <button
                          onClick={() => addTerreo(bloco.id)}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-[13px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600"
                        >
                          <Plus size={15} />
                          Adicionar Térreo
                        </button>

                        <div className="mt-3 flex flex-col gap-4">
                          {bloco.lajesComputadas.map((laje, li) => {
                            const lajeMinimizada = lajesMinimizadas.has(laje.id);
                            const ehAtico = laje.tipo === "atico";
                            const ehTerreo = laje.tipo === "terreo";
                            const nomeBloqueado = ehAtico || ehTerreo;
                            return (
                            <div
                              key={laje.id}
                              className={`rounded-lg border bg-white p-4 transition-colors ${
                                itemArrastado?.tipo === "laje" &&
                                itemArrastado.id === laje.id &&
                                itemArrastado.blocoId === bloco.id
                                  ? "border-blue-400 bg-blue-50/40"
                                  : "border-slate-200"
                              }`}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                soltarArrasto("laje", laje.id, bloco.id);
                              }}
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div className="flex flex-1 items-center gap-2">
                                  <button
                                    onClick={() => toggleMinimizarLaje(laje.id)}
                                    className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-blue-300 hover:text-blue-600"
                                    aria-label={lajeMinimizada ? "Expandir pavimento" : "Minimizar pavimento"}
                                  >
                                    <ChevronRight
                                      size={14}
                                      className={`transition-transform ${lajeMinimizada ? "" : "rotate-90"}`}
                                    />
                                  </button>
                                  <div
                                    draggable
                                    onDragStart={() => iniciarArrasto("laje", laje.id, bloco.id)}
                                    className="shrink-0 cursor-grab active:cursor-grabbing"
                                    title="Arraste para reordenar"
                                  >
                                    <AlcaArrastar />
                                  </div>
                                  {nomeBloqueado ? (
                                    <span
                                      className="w-full max-w-xs rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-semibold text-slate-700"
                                      title="Nome fixo — identifica este pavimento para o Quadro de Áreas de Prefeitura"
                                    >
                                      {laje.nome}
                                    </span>
                                  ) : (
                                    <input
                                      className="w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                      value={laje.nome}
                                      onChange={(e) => updateLaje(bloco.id, laje.id, "nome", e.target.value)}
                                      placeholder={li === 0 ? "Ex: Pavimento Tipo" : `Pavimento ${li + 1}`}
                                    />
                                  )}
                                </div>
                                <button
                                  onClick={() => removeLaje(bloco.id, laje.id)}
                                  className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-red-500 hover:text-red-600"
                                >
                                  <Trash2 size={14} />
                                  Remover
                                </button>
                              </div>

                              {ehAtico ? (
                              <>
                              {!lajeMinimizada && (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Field
                                  label="Quantidade de pavimentos"
                                  placeholder="1"
                                  value={laje.quantidadePavimentos}
                                  numerico
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "quantidadePavimentos", e.target.value)
                                  }
                                />
                                <Field
                                  label="Áreas comuns computáveis"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.areasComunsComputaveis}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "areasComunsComputaveis", e.target.value)
                                  }
                                />
                                <Field
                                  label="Vazios"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.vazios}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "vazios", e.target.value)}
                                />
                                <Field
                                  label="Barrilete"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.barrilete}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "barrilete", e.target.value)}
                                />
                                <Field
                                  label="Casa de máquinas"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.casaDeMaquinas}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "casaDeMaquinas", e.target.value)
                                  }
                                />
                                <Field
                                  label="Reservatório superior"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.reservatorioSuperior}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "reservatorioSuperior", e.target.value)
                                  }
                                />
                                <Field
                                  label="Área técnica"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.areaTecnicaAtico}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "areaTecnicaAtico", e.target.value)
                                  }
                                />
                              </div>
                              )}

                              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                  <p className="text-[11px] text-slate-400">Áreas comuns não computáveis</p>
                                  <p className="text-[13px] font-semibold text-slate-700">
                                    {formatNumeroBR(laje.areasComunsNaoComputaveisAtico)} m²
                                  </p>
                                </div>
                                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                  <p className="text-[11px] text-slate-400">Pavimento sem vazios</p>
                                  <p className="text-[13px] font-semibold text-slate-700">
                                    {formatNumeroBR(laje.pavimentoSemVazios)} m²
                                  </p>
                                </div>
                                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                  <p className="text-[11px] text-slate-400">Pavimento com vazios</p>
                                  <p className="text-[13px] font-semibold text-slate-700">
                                    {formatNumeroBR(laje.pavimentoComVazios)} m²
                                  </p>
                                </div>
                                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                  <p className="text-[11px] text-slate-400">Total dos pavimentos</p>
                                  <p className="text-[13px] font-semibold text-blue-700">
                                    {formatNumeroBR(laje.totalPavimentosAtico)} m²
                                  </p>
                                </div>
                              </div>
                              </>
                              ) : (
                              <>
                              {!lajeMinimizada && (
                              <>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Field
                                  label="Quantidade de pavimentos"
                                  placeholder="1"
                                  value={laje.quantidadePavimentos}
                                  numerico
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "quantidadePavimentos", e.target.value)
                                  }
                                />
                                <div>
                                  <Field
                                    label="Vazios"
                                    unit="m²"
                                    placeholder="0,00"
                                    value={laje.vazios}
                                    onChange={(e) => updateLaje(bloco.id, laje.id, "vazios", e.target.value)}
                                  />
                                  <p className="mt-1 text-[10px] text-slate-400">
                                    Não entra em nenhuma soma de área computável ou não computável.
                                  </p>
                                </div>
                              </div>

                              <p className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-wide text-slate-700">
                                Computáveis
                              </p>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Field
                                  label="Circulação total"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.circulacaoTotal}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "circulacaoTotal", e.target.value)
                                  }
                                />
                                <Field
                                  label="Lazer R2V"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.lazerR2V}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "lazerR2V", e.target.value)}
                                />
                                <Field
                                  label="Lazer HMP"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.lazerHMP}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "lazerHMP", e.target.value)}
                                />
                                <Field
                                  label="Lazer HIS"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.lazerHIS}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "lazerHIS", e.target.value)}
                                />
                                <Field
                                  label="Terraço"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.terraco}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "terraco", e.target.value)}
                                />
                                <Field
                                  label="Outros"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.outros}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "outros", e.target.value)}
                                  labelEditable
                                  labelValue={laje.outrosNome}
                                  onLabelChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "outrosNome", e.target.value)
                                  }
                                />
                              </div>

                              <p className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-wide text-slate-700">
                                Não Computáveis
                              </p>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Field
                                  label="Circulação R"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.circulacaoR}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "circulacaoR", e.target.value)
                                  }
                                />
                                <Field
                                  label="Hall R"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.hallR}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "hallR", e.target.value)}
                                />
                                <Field
                                  label="Lazer R"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.lazerR}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "lazerR", e.target.value)}
                                />
                                <Field
                                  label="Terraço C. NR"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.terracoCNr}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "terracoCNr", e.target.value)
                                  }
                                />
                                <Field
                                  label="Escada NR"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.escadaNR}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "escadaNR", e.target.value)}
                                />
                                <Field
                                  label="Área técnica"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.areaTecnica}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "areaTecnica", e.target.value)
                                  }
                                />
                                <Field
                                  label="Outros"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.outrosNaoComputavel}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "outrosNaoComputavel", e.target.value)
                                  }
                                  labelEditable
                                  labelValue={laje.outrosNaoComputavelNome}
                                  onLabelChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "outrosNaoComputavelNome", e.target.value)
                                  }
                                />
                                <Field
                                  label="Terraço C. R"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.terracoCR}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "terracoCR", e.target.value)
                                  }
                                />
                              </div>

                              {/* Unidades computáveis alocadas neste pavimento (puxadas do Resumo das Unidades) */}
                              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[12px] font-medium text-slate-600">
                                  Unidades computáveis deste pavimento
                                </p>
                                {agregados.tipologiasGlobais.length === 0 ? (
                                  <p className="mt-1 text-[12px] text-amber-600">
                                    Cadastre tipologias na aba "Resumo das Unidades" para poder selecioná-las
                                    aqui.
                                  </p>
                                ) : (
                                  <div className="mt-2 flex flex-col gap-2">
                                    {laje.itens.map((item) => {
                                      // Referência efetiva: prioriza unidadeId; cai para descrição só em
                                      // alocações antigas ainda não resselecionadas (ver resolverUnidadeItem).
                                      const refAtual =
                                        agregados.linhasGlobais.find(
                                          (l) => String(l.id) === String(item.unidadeId)
                                        ) || agregados.linhasGlobais.find((l) => l.descricao === item.descricao);
                                      return (
                                      <div key={item.id} className="flex flex-wrap items-center gap-2">
                                        <select
                                          className="min-w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                                          value={refAtual ? String(refAtual.id) : ""}
                                          onChange={(e) => {
                                            const linha = agregados.linhasGlobais.find(
                                              (l) => String(l.id) === e.target.value
                                            );
                                            selecionarUnidadeItemPavimento(
                                              bloco.id,
                                              laje.id,
                                              item.id,
                                              e.target.value,
                                              linha ? linha.descricao : ""
                                            );
                                          }}
                                        >
                                          <option value="">Selecione a unidade...</option>
                                          {agregados.linhasGlobais
                                            .filter((l) => l.descricao.trim())
                                            .map((l) => (
                                              <option key={l.id} value={String(l.id)}>
                                                {l.descricao}
                                                {agregados.descricoesDuplicadas.has(l.descricao)
                                                  ? ` — ${formatNumeroBR(l.privativaUnidade)} m² priv.`
                                                  : ""}
                                              </option>
                                            ))}
                                        </select>
                                        <TableInput
                                          width="w-20"
                                          placeholder="Qtde."
                                          value={item.quantidade}
                                          numerico
                                          onChange={(e) =>
                                            updateItemUnidade(bloco.id, laje.id, item.id, "quantidade", e.target.value)
                                          }
                                        />
                                        {refAtual && refAtual.categoria ? (
                                          <span className="whitespace-nowrap rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                            {refAtual.categoria}
                                          </span>
                                        ) : null}
                                        {refAtual && agregados.descricoesDuplicadas.has(refAtual.descricao) && (
                                          <span
                                            className="whitespace-nowrap rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-600"
                                            title="Existe mais de uma unidade com esse nome no Resumo das Unidades — confira se esta é a certa."
                                          >
                                            nome duplicado
                                          </span>
                                        )}
                                        <span className="text-[12px] text-slate-400">
                                          Privativa: {formatNumeroBR(item.privativaItem)} m² · Vagas:{" "}
                                          {formatNumeroBR(item.vagasItem)}
                                        </span>
                                        <button
                                          onClick={() => removeItemUnidade(bloco.id, laje.id, item.id)}
                                          className="text-slate-300 hover:text-red-500"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                      );
                                    })}
                                    <button
                                      onClick={() => addItemUnidade(bloco.id, laje.id)}
                                      className="mt-1 flex w-fit items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-[12px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600"
                                    >
                                      <Plus size={13} />
                                      Adicionar uma unidade
                                    </button>
                                  </div>
                                )}
                              </div>
                              </>
                              )}

                              {/* Totais calculados desta laje — mesmo detalhamento da planilha (sempre visível, mesmo minimizado) */}
                              <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[820px] border-collapse text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-left text-[11px] text-slate-400">
                                      <th className="py-1.5 pr-3 font-medium"></th>
                                      <th className="py-1.5 pr-3 font-medium">Unidades</th>
                                      <th className="py-1.5 pr-3 font-medium">Computável</th>
                                      <th className="py-1.5 pr-3 font-medium">Hall Privativo</th>
                                      <th className="py-1.5 pr-3 font-medium">Terraço</th>
                                      <th className="py-1.5 pr-3 font-medium">Á. técnica</th>
                                      <th className="py-1.5 pr-3 font-medium">Floreira</th>
                                      <th className="py-1.5 pr-3 font-medium">Não computável</th>
                                      <th className="py-1.5 pr-3 font-medium">Descoberta</th>
                                      <th className="py-1.5 pr-3 font-medium">Depósito</th>
                                      <th className="py-1.5 pr-3 font-medium">Privativa</th>
                                      <th className="py-1.5 font-medium">Vagas</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr className="border-b border-slate-100 text-slate-600">
                                      <td className="py-1.5 pr-3 text-[12px] font-medium">Totais na laje</td>
                                      <td className="py-1.5 pr-3">{formatNumeroBR(laje.quantidadeUnidadesLaje)}</td>
                                      <td className="py-1.5 pr-3">{formatNumeroBR(laje.computavelLaje)}</td>
                                      <td className="py-1.5 pr-3">{formatNumeroBR(laje.hallPrivativoLaje)}</td>
                                      <td className="py-1.5 pr-3">{formatNumeroBR(laje.terracoDasUnidadesLaje)}</td>
                                      <td className="py-1.5 pr-3">{formatNumeroBR(laje.areaTecnicaTotalLaje)}</td>
                                      <td className="py-1.5 pr-3">{formatNumeroBR(laje.ornamentoDasUnidadesLaje)}</td>
                                      <td className="py-1.5 pr-3 font-medium text-slate-700">
                                        {formatNumeroBR(laje.naoComputavelTabelaLaje)}
                                      </td>
                                      <td className="py-1.5 pr-3">{formatNumeroBR(laje.descobertaDasUnidadesLaje)}</td>
                                      <td className="py-1.5 pr-3">{formatNumeroBR(laje.depositoDasUnidadesLaje)}</td>
                                      <td className="py-1.5 pr-3 font-semibold text-blue-700">
                                        {formatNumeroBR(laje.privativaLaje)}
                                      </td>
                                      <td className="py-1.5">{formatNumeroBR(laje.vagasLaje)}</td>
                                    </tr>
                                    <tr className="text-slate-800">
                                      <td className="py-1.5 pr-3 text-[12px] font-semibold">Totais dos pavimentos</td>
                                      <td className="py-1.5 pr-3 font-semibold">
                                        {formatNumeroBR(laje.quantidadeUnidadesPavimentos)}
                                      </td>
                                      <td className="py-1.5 pr-3 font-semibold">
                                        {formatNumeroBR(laje.computavelPavimentos)}
                                      </td>
                                      <td className="py-1.5 pr-3 font-semibold">
                                        {formatNumeroBR(laje.hallPrivativoPavimentos)}
                                      </td>
                                      <td className="py-1.5 pr-3 font-semibold">
                                        {formatNumeroBR(laje.terracoUnidadesPavimentos)}
                                      </td>
                                      <td className="py-1.5 pr-3 font-semibold">
                                        {formatNumeroBR(laje.areaTecnicaUnidadesPavimentos)}
                                      </td>
                                      <td className="py-1.5 pr-3 font-semibold">
                                        {formatNumeroBR(laje.ornamentoPavimentos)}
                                      </td>
                                      <td className="py-1.5 pr-3 font-semibold text-slate-700">
                                        {formatNumeroBR(laje.naoComputavelTabelaPavimentos)}
                                      </td>
                                      <td className="py-1.5 pr-3 font-semibold">
                                        {formatNumeroBR(laje.descobertaPavimentos)}
                                      </td>
                                      <td className="py-1.5 pr-3 font-semibold">
                                        {formatNumeroBR(laje.depositoPavimentos)}
                                      </td>
                                      <td className="py-1.5 pr-3 font-semibold text-blue-700">
                                        {formatNumeroBR(laje.privativaPavimentos)}
                                      </td>
                                      <td className="py-1.5 font-semibold">
                                        {formatNumeroBR(laje.vagasPavimentos)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                                <p className="mt-1 text-[10px] text-slate-400">
                                  Hall privativo é preenchido automaticamente a partir do Resumo das Unidades.
                                </p>
                              </div>

                              {/* Conferência Terraço/Pavimento — máximo permitido (5%) x utilizado */}
                              <div
                                className={`mt-3 inline-flex overflow-hidden rounded-md border ${
                                  laje.terracoExcedido ? "border-red-300" : "border-slate-200"
                                }`}
                              >
                                <div
                                  className={`px-3 py-2 text-[11px] font-medium ${
                                    laje.terracoExcedido ? "bg-red-50 text-red-500" : "bg-slate-50 text-slate-500"
                                  }`}
                                >
                                  Conferência Terraço/Pav.
                                </div>
                                <div className="flex divide-x divide-slate-200 border-l border-slate-200">
                                  <div className="px-3 py-2">
                                    <p className="text-[10px] text-slate-400">Máximo (5%)</p>
                                    <p className="text-[13px] font-semibold text-slate-700">
                                      {agregados.limiteTerracoPorPavimento !== null
                                        ? formatNumeroBR(agregados.limiteTerracoPorPavimento)
                                        : "—"}{" "}
                                      m²
                                    </p>
                                  </div>
                                  <div className="px-3 py-2">
                                    <p className={`text-[10px] ${laje.terracoExcedido ? "text-red-500" : "text-slate-400"}`}>
                                      Utilizado
                                    </p>
                                    <p
                                      className={`text-[13px] font-semibold ${
                                        laje.terracoExcedido ? "text-red-700" : "text-slate-700"
                                      }`}
                                    >
                                      {formatNumeroBR(laje.terracoUtilizado)} m²
                                    </p>
                                  </div>
                                </div>
                              </div>
                              </>
                              )}
                            </div>
                          );})}
                          <div className="flex gap-2">
                            <button
                              onClick={() => addLaje(bloco.id)}
                              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-[13px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600"
                            >
                              <Plus size={15} />
                              Adicionar pavimento
                            </button>
                            <button
                              onClick={() => addAtico(bloco.id)}
                              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-[13px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600"
                            >
                              <Plus size={15} />
                              Adicionar Ático
                            </button>
                          </div>
                        </div>
                      </div>
                      </>
                      )}
                    </div>
                  );})}
                  <button
                    onClick={addBloco}
                    className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600"
                  >
                    <Plus size={16} />
                    Adicionar uso / bloco
                  </button>

                  {/* Resumo dos blocos — um único rodapé, somando todos os usos/blocos do projeto */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                      Resumo dos blocos
                    </p>
                    <div className="mb-3 flex flex-wrap gap-4 text-[12px] text-slate-500">
                      <span>
                        Qtde. de pavimentos (sem ático):{" "}
                        <strong className="text-slate-800">
                          {formatNumeroBR(
                            agregados.blocosComputados.reduce(
                              (acc, b) => acc + b.totalPavimentosSemAticoBloco,
                              0
                            ),
                            0
                          )}
                        </strong>
                      </span>
                      <span>
                        Quantidade de blocos:{" "}
                        <strong className="text-slate-800">
                          {formatNumeroBR(
                            agregados.blocosComputados.reduce(
                              (acc, b) => acc + paraNumero(b.quantidadeBlocos),
                              0
                            ),
                            0
                          )}
                        </strong>
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-[11px] text-slate-400">
                            <th className="py-1.5 pr-3 font-medium">Uso / Bloco</th>
                            <th className="py-1.5 pr-3 font-medium">Unidades</th>
                            <th className="py-1.5 pr-3 font-medium">Computável</th>
                            <th className="py-1.5 pr-3 font-medium">Não computável</th>
                            <th className="py-1.5 pr-3 font-medium">Incentivo</th>
                            <th className="py-1.5 pr-3 font-medium">Terraço</th>
                            <th className="py-1.5 pr-3 font-medium">Á. técnica</th>
                            <th className="py-1.5 pr-3 font-medium">Floreira</th>
                            <th className="py-1.5 pr-3 font-medium">Descoberta</th>
                            <th className="py-1.5 pr-3 font-medium">Depósito</th>
                            <th className="py-1.5 pr-3 font-medium">Privativa</th>
                            <th className="py-1.5 font-medium">Vagas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agregados.blocosComputados.map((bloco) => (
                            <tr key={bloco.id} className="border-b border-slate-100 text-slate-600">
                              <td className="py-1.5 pr-3 font-medium text-slate-700">
                                {bloco.nomeExibicao}
                                {bloco.multiplicadorBlocos !== 1 && (
                                  <span className="ml-1.5 rounded-full bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                                    ×{formatNumeroBR(bloco.multiplicadorBlocos, 0)}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 pr-3">{formatNumeroBR(bloco.totalUnidadesBloco)}</td>
                              <td className="py-1.5 pr-3">{formatNumeroBR(bloco.totalComputavelLajesBloco)}</td>
                              <td className="py-1.5 pr-3 font-medium text-slate-700">
                                {formatNumeroBR(bloco.totalNaoComputavelTabelaBloco)}
                              </td>
                              <td className="py-1.5 pr-3">
                                {formatNumeroBR(bloco.totalIncentivoNaoComputavelBloco)}
                              </td>
                              <td className="py-1.5 pr-3">{formatNumeroBR(bloco.totalTerracoUnidadesBloco)}</td>
                              <td className="py-1.5 pr-3">
                                {formatNumeroBR(bloco.totalAreaTecnicaUnidadesBloco)}
                              </td>
                              <td className="py-1.5 pr-3">{formatNumeroBR(bloco.totalOrnamentoBloco)}</td>
                              <td className="py-1.5 pr-3">{formatNumeroBR(bloco.totalDescobertaBloco)}</td>
                              <td className="py-1.5 pr-3">{formatNumeroBR(bloco.totalDepositoBloco)}</td>
                              <td className="py-1.5 pr-3 font-semibold text-blue-700">
                                {formatNumeroBR(bloco.totalPrivativaLajesBloco)}
                              </td>
                              <td className="py-1.5">{formatNumeroBR(bloco.totalVagasLajesBloco)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-semibold text-slate-800">
                            <td className="pt-2 pr-3">Total geral</td>
                            <td className="pt-2 pr-3">{formatNumeroBR(agregados.totalUnidades)}</td>
                            <td className="pt-2 pr-3">{formatNumeroBR(agregados.areaComputavelTotal)}</td>
                            <td className="pt-2 pr-3">
                              {formatNumeroBR(
                                agregados.blocosComputados.reduce(
                                  (acc, b) => acc + b.totalNaoComputavelTabelaBloco,
                                  0
                                )
                              )}
                            </td>
                            <td className="pt-2 pr-3">
                              {formatNumeroBR(
                                agregados.blocosComputados.reduce(
                                  (acc, b) => acc + b.totalIncentivoNaoComputavelBloco,
                                  0
                                )
                              )}
                            </td>
                            <td className="pt-2 pr-3">
                              {formatNumeroBR(
                                agregados.blocosComputados.reduce((acc, b) => acc + b.totalTerracoUnidadesBloco, 0)
                              )}
                            </td>
                            <td className="pt-2 pr-3">
                              {formatNumeroBR(
                                agregados.blocosComputados.reduce(
                                  (acc, b) => acc + b.totalAreaTecnicaUnidadesBloco,
                                  0
                                )
                              )}
                            </td>
                            <td className="pt-2 pr-3">
                              {formatNumeroBR(
                                agregados.blocosComputados.reduce((acc, b) => acc + b.totalOrnamentoBloco, 0)
                              )}
                            </td>
                            <td className="pt-2 pr-3">
                              {formatNumeroBR(
                                agregados.blocosComputados.reduce((acc, b) => acc + b.totalDescobertaBloco, 0)
                              )}
                            </td>
                            <td className="pt-2 pr-3">
                              {formatNumeroBR(
                                agregados.blocosComputados.reduce((acc, b) => acc + b.totalDepositoBloco, 0)
                              )}
                            </td>
                            <td className="pt-2 pr-3 text-blue-700">
                              {formatNumeroBR(agregados.areaPrivativaTotal)}
                            </td>
                            <td className="pt-2">{formatNumeroBR(agregados.totalVagas)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="" subtitle="">
                <button
                  onClick={() => setEstacionamentoMinimizado((v) => !v)}
                  className="mb-1 flex w-full items-center gap-2 text-left"
                >
                  <ChevronRight
                    size={15}
                    className={`shrink-0 text-slate-400 transition-transform ${
                      estacionamentoMinimizado ? "" : "rotate-90"
                    }`}
                  />
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-800">
                      Estacionamento — Subsolos e Sobresolos
                    </h3>
                    <p className="text-[13px] text-slate-400">
                      Níveis de garagem do empreendimento (Sobresolo, Térreo, Subsolo...) — área não
                      computável (garagem/outros) e computável de cada nível
                    </p>
                  </div>
                </button>
                {!estacionamentoMinimizado && (
                <>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                  Total de vagas
                </p>
                <div className="mb-6 overflow-x-auto">
                  <table className="w-full min-w-[1100px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] text-slate-400">
                        <th className="py-1.5 pr-3 font-medium">Vinculadas</th>
                        <th className="py-1.5 pr-3 font-medium">Total</th>
                        <th className="py-1.5 pr-3 font-medium">M²/Vaga</th>
                        <th className="py-1.5 pr-3 font-medium">PNE</th>
                        <th className="py-1.5 pr-3 font-medium">Moto</th>
                        <th className="py-1.5 pr-3 font-medium">Bicicleta</th>
                        <th className="py-1.5 pr-3 font-medium">Descobertas</th>
                        <th className="py-1.5 pr-3 font-medium">Cobertas</th>
                        <th className="py-1.5 pr-3 font-medium">UTI</th>
                        <th className="py-1.5 pr-3 font-medium">Caminhão</th>
                        <th className="py-1.5 pr-3 font-medium">Visitante</th>
                        <th className="py-1.5 pr-3 font-medium">Car Wash</th>
                        <th className="py-1.5 pr-3 font-medium">Elétrico</th>
                        <th className="py-1.5 font-medium">Extras</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1.5 pr-3 font-semibold text-slate-700">
                          {formatNumeroBR(agregados.vinculadas)}
                        </td>
                        <td className="py-1.5 pr-3 font-semibold text-slate-700">
                          {formatNumeroBR(agregados.totalVagasGeral)}
                        </td>
                        <td className="py-1.5 pr-3 font-semibold text-blue-700">
                          {formatNumeroBR(agregados.cotaGaragem)}
                        </td>
                        <td className="py-1.5 pr-3">
                          <TableInput
                            width="w-16"
                            placeholder={formatNumeroBR(agregados.pneCalculado)}
                            numerico
                            value={vagasPneManual}
                            onChange={(e) => setVagasPneManual(e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <TableInput
                            width="w-16"
                            placeholder={formatNumeroBR(agregados.motoCalculado)}
                            numerico
                            value={vagasMotoManual}
                            onChange={(e) => setVagasMotoManual(e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <TableInput
                            width="w-16"
                            placeholder="0"
                            value={vagasBicicleta}
                            numerico
                            onChange={(e) => setVagasBicicleta(e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <TableInput
                            width="w-16"
                            placeholder="0"
                            value={vagasDescobertas}
                            numerico
                            onChange={(e) => setVagasDescobertas(e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 pr-3 font-semibold text-slate-700">
                          {formatNumeroBR(agregados.cobertasVagas)}
                        </td>
                        <td className="py-1.5 pr-3">
                          <TableInput
                            width="w-16"
                            placeholder="0"
                            value={vagasUti}
                            numerico
                            onChange={(e) => setVagasUti(e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <TableInput
                            width="w-16"
                            placeholder="0"
                            value={vagasCaminhao}
                            numerico
                            onChange={(e) => setVagasCaminhao(e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <TableInput
                            width="w-16"
                            placeholder="0"
                            value={vagasVisitante}
                            numerico
                            onChange={(e) => setVagasVisitante(e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <TableInput
                            width="w-16"
                            placeholder="0"
                            value={vagasCarWash}
                            numerico
                            onChange={(e) => setVagasCarWash(e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <TableInput
                            width="w-16"
                            placeholder="0"
                            value={vagasEletrico}
                            numerico
                            onChange={(e) => setVagasEletrico(e.target.value)}
                          />
                        </td>
                        <td className="py-1.5">
                          <TableInput
                            width="w-16"
                            placeholder="0"
                            value={vagasExtras}
                            numerico
                            onChange={(e) => setVagasExtras(e.target.value)}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Vinculadas vem do total de vagas alocado nas unidades (Resumo das Unidades). PNE e Moto
                    são calculados automaticamente (2% e 5% das vinculadas, mínimo 1). M²/Vaga é a "Cota de
                    garagem": Total Garagem ÷ (Cobertas − UTI − PNE).
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[12px] text-slate-400">
                        <th className="py-2 pr-3 font-medium">Nível</th>
                        <th className="py-2 pr-3 font-medium">Garagem (m²)</th>
                        <th className="py-2 pr-3 font-medium">Outros (m²)</th>
                        <th className="py-2 pr-3 font-medium">Computável R2V/HMP/HIS (m²)</th>
                        <th className="py-2 pr-3 font-medium">Total pavimento (m²)</th>
                        <th className="py-2 pr-3 font-medium">Observações</th>
                        <th className="py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {agregados.niveisEstacionamentoComputados.map((nivel) => (
                        <tr key={nivel.id} className="border-b border-slate-100">
                          <td className="py-1.5 pr-3">
                            <TableInput
                              width="w-32"
                              placeholder="Ex: 1º Subsolo"
                              value={nivel.nome}
                              onChange={(e) => updateNivelEstacionamento(nivel.id, "nome", e.target.value)}
                            />
                          </td>
                          <td className="py-1.5 pr-3">
                            <TableInput
                              width="w-24"
                              placeholder="0,00"
                              formatarM2
                              value={nivel.garagem}
                              onChange={(e) => updateNivelEstacionamento(nivel.id, "garagem", e.target.value)}
                            />
                          </td>
                          <td className="py-1.5 pr-3">
                            <TableInput
                              width="w-24"
                              placeholder="0,00"
                              formatarM2
                              value={nivel.outros}
                              onChange={(e) => updateNivelEstacionamento(nivel.id, "outros", e.target.value)}
                            />
                          </td>
                          <td className="py-1.5 pr-3">
                            <TableInput
                              width="w-24"
                              placeholder="0,00"
                              formatarM2
                              value={nivel.computavel}
                              onChange={(e) => updateNivelEstacionamento(nivel.id, "computavel", e.target.value)}
                            />
                          </td>
                          <td className="py-1.5 pr-3 font-semibold text-blue-700">
                            {formatNumeroBR(nivel.totalPavimento)}
                          </td>
                          <td className="py-1.5 pr-3">
                            <TableInput
                              width="w-32"
                              placeholder="Observações"
                              value={nivel.observacoes}
                              onChange={(e) => updateNivelEstacionamento(nivel.id, "observacoes", e.target.value)}
                            />
                          </td>
                          <td className="py-1.5">
                            <button
                              onClick={() => removeNivelEstacionamento(nivel.id)}
                              className="text-slate-300 hover:text-red-500"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {agregados.niveisEstacionamentoComputados.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-3 text-center text-[12px] text-slate-400">
                            Nenhum nível cadastrado ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {agregados.niveisEstacionamentoComputados.length > 0 && (
                      <tfoot>
                        <tr className="font-semibold text-slate-800">
                          <td className="pt-2 pr-3">Total</td>
                          <td className="pt-2 pr-3">{formatNumeroBR(agregados.totalGaragemEstacionamento)}</td>
                          <td className="pt-2 pr-3">{formatNumeroBR(agregados.totalOutrosEstacionamento)}</td>
                          <td className="pt-2 pr-3">{formatNumeroBR(agregados.totalComputavelEstacionamento)}</td>
                          <td className="pt-2 pr-3 text-blue-700">
                            {formatNumeroBR(agregados.totalGeralEstacionamento)}
                          </td>
                          <td className="pt-2" colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <button
                  onClick={addNivelEstacionamento}
                  className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600"
                >
                  <Plus size={16} />
                  Adicionar nível
                </button>
                <p className="mt-3 text-[12px] text-slate-400">
                  A coluna "Computável R2V/HMP/HIS" soma automaticamente no Computável total do projeto (CA
                  Utilizado e Falta/Estoura). Garagem e Outros contam apenas como área construída não
                  computável.
                </p>

                <div className="mt-6 max-w-xs">
                  <Field
                    label="Obras complementares"
                    unit="m²"
                    placeholder="0,00"
                    value={obrasComplementares}
                    onChange={(e) => setObrasComplementares(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Área construída fora dos blocos e dos níveis de Estacionamento acima (ex: guarita,
                    depósito de lixo externo). Soma no Térreo coberto e na Área não computável total do
                    Quadro de Áreas de Prefeitura (Indicadores Gerais).
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Total de vagas por bloco/uso */}
                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                      Total de vagas / bloco
                    </p>
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      {agregados.blocosComputados.length === 0 ? (
                        <p className="p-3 text-[12px] text-slate-400">Nenhum bloco cadastrado ainda.</p>
                      ) : (
                        agregados.blocosComputados.map((bloco, i) => (
                          <div
                            key={bloco.id}
                            className={`flex items-center justify-between px-3 py-2 text-[13px] ${
                              i % 2 === 0 ? "bg-slate-50" : "bg-white"
                            }`}
                          >
                            <span className="text-slate-600">{bloco.nomeExibicao}</span>
                            <span className="font-semibold text-slate-800">
                              {formatNumeroBR(bloco.totalVagasLajesBloco)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Cota de garagem por estacionamento */}
                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                      Cota de garagem por estacionamento
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] text-slate-400">Cota de garagem (m²/vaga)</p>
                        <p className="text-[16px] font-semibold text-slate-800">
                          {formatNumeroBR(agregados.cotaGaragem)} m²
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] text-slate-400">Estacionamento total necessário</p>
                        <p className="text-[16px] font-semibold text-slate-800">
                          {formatNumeroBR(agregados.estacionamentoTotalNecessario)} m²
                        </p>
                      </div>
                      <div
                        className={`col-span-2 rounded-lg border p-3 ${
                          agregados.faltaEstouraGaragem < 0
                            ? "border-red-200 bg-red-50"
                            : agregados.faltaEstouraGaragem === 0
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <p className="text-[11px] text-slate-400">Falta (Estoura)</p>
                        <p
                          className={`text-[16px] font-semibold ${
                            agregados.faltaEstouraGaragem < 0
                              ? "text-red-600"
                              : agregados.faltaEstouraGaragem === 0
                              ? "text-emerald-600"
                              : "text-slate-800"
                          }`}
                        >
                          {formatNumeroBR(agregados.faltaEstouraGaragem)} m²
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subsolo máximo por pavimento */}
                <div className="mt-6">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                    Subsolo máximo por pavimento
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[11px] text-slate-400">Doação</p>
                      <p className="text-[16px] font-semibold text-slate-800">
                        {agregados.doacaoSubsoloMaximo !== null
                          ? formatNumeroBR(agregados.doacaoSubsoloMaximo)
                          : "—"}{" "}
                        m²
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        Área remanescente − Permeável do projeto (Área remanescente × TP projeto)
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[11px] text-slate-400">Reserva</p>
                      <p className="text-[16px] font-semibold text-slate-800">
                        {agregados.reservaSubsoloMaximo !== null
                          ? formatNumeroBR(agregados.reservaSubsoloMaximo)
                          : "—"}{" "}
                        m²
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        (Área do terreno − Reserva de calçada) − Permeável do projeto
                      </p>
                    </div>
                  </div>
                </div>
                </>
                )}
              </SectionCard>
              </>
            )}

            {/* ---------------- ABA: RESUMO DAS UNIDADES ---------------- */}
            {activeTab === "areas" && (
              <div className="flex flex-col gap-6">
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[12px] text-blue-700">
                  Este é o catálogo único de tipologias do projeto. Qualquer unidade cadastrada aqui fica
                  disponível para ser alocada em qualquer Pavimento, de qualquer bloco, na aba{" "}
                  <button
                    onClick={() => setActiveTab("empreendimento")}
                    className="font-semibold underline underline-offset-2 hover:text-blue-800"
                  >
                    Dados do Empreendimento
                  </button>
                  .
                </div>

                <SectionCard title="" subtitle="">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                    Categorias de uso das unidades
                  </p>
                  <div className="flex flex-col gap-4">
                    {categoriasTabelas.map((categoria) => (
                      <TabelaUnidades
                        key={categoria.id}
                        linhasGlobais={agregados.linhasGlobais}
                        descricoesDuplicadas={agregados.descricoesDuplicadas}
                        categoria={categoria}
                        expandido={tabelasExpandidas.has(categoria.id)}
                        onToggle={() => toggleTabelaExpandida(categoria.id)}
                        onAdd={addUnidade}
                        onUpdate={updateUnidade}
                        onRemove={removeUnidade}
                        onRenameCategoria={renameCategoriaTabela}
                        onRemoveCategoria={removeCategoriaTabela}
                        onChangeTipo={updateCategoriaTabelaTipo}
                        onDragStartHandle={() => iniciarArrasto("categoria", categoria.id)}
                        onDropCard={() => soltarArrasto("categoria", categoria.id)}
                        arrastando={itemArrastado?.tipo === "categoria" && itemArrastado.id === categoria.id}
                      />
                    ))}
                    <button
                      onClick={addCategoriaTabela}
                      className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-[13px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600"
                    >
                      <Plus size={15} />
                      Adicionar categoria
                    </button>
                  </div>

                  <p className="mt-3 text-[12px] text-slate-400">
                    Estas linhas definem os dados por unidade. Os totais reais do empreendimento (privativa,
                    computável e vagas) aparecem em "Dados do Empreendimento", dentro de cada pavimento, e no
                    painel de Indicadores Gerais — de acordo com quantas vezes cada unidade for alocada.
                  </p>
                </SectionCard>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-[12px] font-medium text-slate-400">Total geral (todos os blocos)</p>
                  <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-[12px] text-slate-400">Privativa</p>
                      <p className="text-[16px] font-semibold text-blue-700">
                        {formatNumeroBR(agregados.areaPrivativaTotal)} m²
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] text-slate-400">Computável</p>
                      <p className="text-[16px] font-semibold text-slate-800">
                        {formatNumeroBR(agregados.areaComputavelTotal)} m²
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] text-slate-400">Vagas</p>
                      <p className="text-[16px] font-semibold text-slate-800">
                        {formatNumeroBR(agregados.totalVagas)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] text-slate-400">Unidades</p>
                      <p className="text-[16px] font-semibold text-slate-800">
                        {formatNumeroBR(agregados.totalUnidades)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- ABA: CUSTOS / TAXAS / OUTORGAS ---------------- */}
            {/* ---------------- ABA: INDICADORES GERAIS ---------------- */}
            {activeTab === "indicadores" && (
              <>
                <div className="no-print flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] text-slate-500">
                    Exporte esta página de indicadores para compartilhar ou arquivar o estudo.
                  </p>
                  <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                    <button
                      onClick={exportarCSV}
                      className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 sm:flex-none"
                    >
                      Exportar CSV
                    </button>
                    <button
                      onClick={exportarPDF}
                      className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-blue-700 sm:flex-none"
                    >
                      Exportar PDF (A4)
                    </button>
                  </div>
                </div>

                <SectionCard title="Identificação" subtitle="Dados do estudo">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                    <Kv texto label="Cliente" value={cliente.trim()} />
                    <Kv texto label="Nome do projeto" value={nomeProjeto.trim()} />
                    <Kv
                      label="Opção / Revisão"
                      value={
                        opcaoEstudo.trim() || revisaoEstudo.trim()
                          ? `${opcaoEstudo.trim() || "—"} / ${revisaoEstudo.trim() || "—"}`
                          : null
                      }
                    />
                    <Kv texto label="Arquiteto responsável" value={arquitetoResponsavel.trim()} />
                    <Kv label="Data" value={new Date().toLocaleDateString("pt-BR")} />
                  </div>
                </SectionCard>

                <SectionCard title="Terreno" subtitle="Local, zoneamento e parâmetros urbanísticos">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                    <Kv texto label="Local" value={localEndereco.trim()} />
                    <Kv texto label="Município" value={municipio.trim()} />
                    <Kv texto label="Subprefeitura" value={subprefeitura} />
                    <Kv texto label="Subdistrito" value={subdistrito} />
                    <Kv label="Área do terreno" value={`${formatNumeroBR(paraNumero(areaTerreno))} m²`} />
                    <Kv label="Reserva de calçada" value={`${formatNumeroBR(paraNumero(reservaCalcada))} m²`} />
                    <Kv label="Doação" value={paraNumero(doacao) > 0 ? `${formatNumeroBR(paraNumero(doacao))} m²` : null} />
                    <Kv
                      label="Área remanescente"
                      value={agregados.areaRemanescente !== null ? `${formatNumeroBR(agregados.areaRemanescente)} m²` : null}
                    />
                    <Kv
                      label="Quinhão residencial"
                      value={agregados.quinhaoResidencial !== null ? `${formatNumeroBR(agregados.quinhaoResidencial)} m²` : null}
                    />
                    <Kv
                      label="Quinhão não residencial"
                      value={paraNumero(quinhaoNaoResidencial) > 0 ? `${formatNumeroBR(paraNumero(quinhaoNaoResidencial))} m²` : null}
                    />
                    <Kv texto label="Zoneamento" value={zona} />
                    <Kv label="CA básico da zona" value={caBasicoZona ? formatNumeroBR(paraNumero(caBasicoZona)) : null} />
                    <Kv
                      label="CA máximo da zona (Quadro 3)"
                      value={caMaximoZona ? formatNumeroBR(paraNumero(caMaximoZona)) : null}
                    />
                    <Kv label="Majoração CA (NR)" value={paraNumero(majoracaoNR) > 0 ? formatNumeroBR(paraNumero(majoracaoNR)) : null} />
                    <Kv
                      label="CA máx. c/ benefícios"
                      value={agregados.caMaximoComBeneficios !== null ? formatNumeroBR(agregados.caMaximoComBeneficios, 4) : null}
                    />
                    <Kv label="TO máxima" value={toMaximaZona ? `${formatNumeroBR(paraNumero(toMaximaZona))}%` : null} />
                    <Kv label="Gabarito máximo" value={gabaritoMaximoZona ? `${formatNumeroBR(paraNumero(gabaritoMaximoZona))} m` : null} />
                    <Kv label="Testada do terreno" value={testadaTerreno ? `${formatNumeroBR(paraNumero(testadaTerreno))} m` : null} />
                  </div>
                </SectionCard>

                <SectionCard title="Cota-parte & Cota Ambiental" subtitle="Fracionamento do solo e taxa de permeabilidade">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                    <Kv label="Cota-parte mínima" value={cotaParteMinima ? `${formatNumeroBR(paraNumero(cotaParteMinima))} m²` : null} />
                    <Kv
                      label="Nº mín. de unidades"
                      value={agregados.nMinimoUnidades !== null ? formatNumeroBR(agregados.nMinimoUnidades, 0) : null}
                    />
                    <Kv
                      label="Cota-parte real do projeto"
                      value={agregados.cotaParteReal !== null ? `${formatNumeroBR(agregados.cotaParteReal)} m²` : null}
                      tone={agregados.cotaParteAbaixoMinima || agregados.cotaParteAcimaMaxima ? "red" : undefined}
                    />
                    <Kv label="Fs (fator social)" value={agregados.fsAutomatico !== null ? formatNumeroBR(agregados.fsAutomatico) : null} />
                    <Kv
                      label="Nº de unidades (cota-parte)"
                      value={
                        agregados.numeroResidenciasParaCotaParte > 0
                          ? formatNumeroBR(agregados.numeroResidenciasParaCotaParte, 0)
                          : null
                      }
                    />
                    <Kv label="Cota Ambiental (QA exigido)" value={cotaAmbiental ? formatNumeroBR(paraNumero(cotaAmbiental)) : null} />
                    <Kv label="TP necessária" value={tpNecessaria ? formatNumeroBR(paraNumero(tpNecessaria)) : null} />
                    <Kv label="TP projeto" value={tpProjeto ? formatNumeroBR(paraNumero(tpProjeto)) : null} />
                    <Kv label="Redução TP" value={agregados.reducaoTP !== null ? formatNumeroBR(agregados.reducaoTP) : null} />
                  </div>
                  <p className="mt-3 text-[11px] text-slate-400">
                    Cota-parte aplica-se apenas ao quinhão e às unidades residenciais: R2V (qualquer área) e HMP/HIS (área
                    computável superior a 30,00 m²). Redução TP = (TP projeto ÷ TP necessária) − 1.
                  </p>
                </SectionCard>

                <SectionCard title="Resumo do empreendimento" subtitle="CA e TO efetivamente utilizados pelo projeto">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                    <Kv texto label="Uso" value="RESIDENCIAL" />
                    <Kv texto label="Categoria de uso" value="R2V" />
                    <Kv label="CA total utilizado" value={agregados.caUtilizado !== null ? formatNumeroBR(agregados.caUtilizado) : null} />
                    <Kv label="TO utilizada" value={null} />
                    <Kv label="Total de blocos" value={agregados.totalBlocosGeral > 0 ? formatNumeroBR(agregados.totalBlocosGeral) : null} />
                    <Kv label="Total de vagas geral" value={agregados.totalVagas > 0 ? formatNumeroBR(agregados.totalVagas) : null} />
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        CA utilizado por quinhão
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Kv label="Residencial" value={caR2VUtilizadoPorQuinhao !== null ? formatNumeroBR(caR2VUtilizadoPorQuinhao) : null} />
                        <Kv label="Não residencial" value={caNRUtilizadoPorQuinhao !== null ? formatNumeroBR(caNRUtilizadoPorQuinhao) : null} />
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        CA total utilizado (por terreno total)
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        <Kv label="Residencial" value={caResidencialPorTerrenoTotal !== null ? formatNumeroBR(caResidencialPorTerrenoTotal) : null} />
                        <Kv label="Não residencial" value={caNaoResidencialPorTerrenoTotal !== null ? formatNumeroBR(caNaoResidencialPorTerrenoTotal) : null} />
                        <Kv label="Total" value={agregados.caUtilizado !== null ? formatNumeroBR(agregados.caUtilizado) : null} />
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Totais / Índices" subtitle="Privativa, computável e área de prefeitura consolidadas">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Privativa (m²)</p>
                      <div className="grid grid-cols-3 gap-3">
                        <Kv label="Residencial" value={formatNumeroBR(agregados.areaPrivativaTotal)} />
                        <Kv label="Não residencial" value={null} />
                        <Kv label="Privativa total" value={formatNumeroBR(agregados.areaPrivativaTotal)} />
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Computável (m²)</p>
                      <div className="grid grid-cols-3 gap-3">
                        <Kv label="Residencial" value={formatNumeroBR(agregados.areaComputavelTotal)} />
                        <Kv label="Não residencial" value={null} />
                        <Kv label="Computável total" value={formatNumeroBR(agregados.areaComputavelTotal)} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-[11px] text-blue-600">Prefeitura total</p>
                      <p className="text-[16px] font-semibold text-blue-700">{formatNumeroBR(agregados.areaTotalPrefeitura)} m²</p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-[11px] text-blue-600">Privativa / Terreno</p>
                      <p className="text-[16px] font-semibold text-blue-700">
                        {agregados.indicePrivativaTerreno !== null ? formatNumeroBR(agregados.indicePrivativaTerreno) : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-[11px] text-blue-600">Privativa / Prefeitura</p>
                      <p className="text-[16px] font-semibold text-blue-700">
                        {agregados.indicePrivativaPrefeitura !== null ? formatNumeroBR(agregados.indicePrivativaPrefeitura) : "—"}
                      </p>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Benefícios — Áreas computáveis"
                  subtitle="Cota de Solidariedade (opcional: se aplica ao CA do quadro R2V e NR)"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[12px] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Trilha</th>
                          <th className="py-2 pr-3 font-medium">CA máx.</th>
                          <th className="py-2 pr-3 font-medium">Computável máxima</th>
                          <th className="py-2 font-medium">Computável atingida</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agregados.potencialPorUso.map((linha) => (
                          <tr key={linha.uso} className="border-b border-slate-100">
                            <td className="py-1.5 pr-3 font-medium text-slate-700">{linha.uso}</td>
                            <td className="py-1.5 pr-3 font-mono">{linha.ca !== null ? formatNumeroBR(linha.ca) : "—"}</td>
                            <td className="py-1.5 pr-3 font-mono">{linha.maximo !== null ? `${formatNumeroBR(linha.maximo)} m²` : "—"}</td>
                            <td className="py-1.5 font-mono">{linha.atingida !== null ? `${formatNumeroBR(linha.atingida)} m²` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                <SectionCard title="Benefícios — Áreas não computáveis" subtitle="">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[12px] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Benefício</th>
                          <th className="py-2 pr-3 font-medium">Área máxima / mínima</th>
                          <th className="py-2 font-medium">Área atingida</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="py-1.5 pr-3 font-medium text-slate-700">Fachada Ativa</td>
                          <td className="py-1.5 pr-3 font-mono">—</td>
                          <td className="py-1.5 font-mono">{formatNumeroBR(agregados.areaFachadaAtivaAlocada)} m²</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1.5 pr-3 font-medium text-slate-700">NR Incentivo</td>
                          <td className="py-1.5 pr-3 font-mono">{agregados.beneficioNR > 0 ? `${formatNumeroBR(agregados.beneficioNR)} m²` : "—"}</td>
                          <td className="py-1.5 font-mono">—</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1.5 pr-3 font-medium text-slate-700">HIS Cota Solid. (mínima)</td>
                          <td className="py-1.5 pr-3 font-mono">
                            {agregados.contrapartidaHISNecessaria > 0 ? `${formatNumeroBR(agregados.contrapartidaHISNecessaria)} m²` : "—"}
                          </td>
                          <td className="py-1.5 font-mono">
                            {agregados.contrapartidaHISNecessaria > 0 ? `${formatNumeroBR(agregados.contrapartidaHISAlocada)} m²` : "—"}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-3 font-medium text-slate-700">Benefício Residencial sem Vagas</td>
                          <td className="py-1.5 pr-3 font-mono">
                            {agregados.potencialSemVagasMaximo > 0 ? `${formatNumeroBR(agregados.potencialSemVagasMaximo)} m²` : "—"}
                          </td>
                          <td className="py-1.5 font-mono">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                <SectionCard title="Tabela resumo de blocos" subtitle="Vai surgindo conforme os blocos forem preenchidos em Dados do Empreendimento">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[12px] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Bloco</th>
                          <th className="py-2 pr-3 font-medium">Uso</th>
                          <th className="py-2 pr-3 font-medium">Tipologia</th>
                          <th className="py-2 pr-3 font-medium">Unidades / bloco</th>
                          <th className="py-2 pr-3 font-medium">Unidades total</th>
                          <th className="py-2 pr-3 font-medium">Privativa / bloco</th>
                          <th className="py-2 pr-3 font-medium">Privativa total</th>
                          <th className="py-2 font-medium">Pavimentos (c/térreo s/ático)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agregados.blocosComputados.map((bloco) => {
                          const tipologias = new Set();
                          bloco.lajesComputadas.forEach((laje) => {
                            if (laje.tipo === "atico") return;
                            (laje.itens || []).forEach((item) => {
                              if (item.descricao) tipologias.add(item.descricao);
                            });
                          });
                          return (
                            <tr key={bloco.id} className="border-b border-slate-100">
                              <td className="py-1.5 pr-3 font-medium text-slate-700">{bloco.nomeExibicao}</td>
                              <td className="py-1.5 pr-3">{bloco.uso || "—"}</td>
                              <td className="py-1.5 pr-3">{tipologias.size ? Array.from(tipologias).join(" / ") : "—"}</td>
                              <td className="py-1.5 pr-3 font-mono">{formatNumeroBR(bloco.totalUnidadesBloco / bloco.multiplicadorBlocos)}</td>
                              <td className="py-1.5 pr-3 font-mono">{formatNumeroBR(bloco.totalUnidadesBloco)}</td>
                              <td className="py-1.5 pr-3 font-mono">{formatNumeroBR(bloco.totalPrivativaLajesBloco / bloco.multiplicadorBlocos)}</td>
                              <td className="py-1.5 pr-3 font-mono font-medium text-blue-700">{formatNumeroBR(bloco.totalPrivativaLajesBloco)}</td>
                              <td className="py-1.5 font-mono">{formatNumeroBR(bloco.totalPavimentosSemAticoBloco)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                <SectionCard title="Tabela resumo de unidades" subtitle="Catálogo de tipologias somado em todas as alocações do projeto">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[12px] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Descrição</th>
                          <th className="py-2 pr-3 font-medium">Privativa / unidade</th>
                          <th className="py-2 pr-3 font-medium">Vagas / unidade</th>
                          <th className="py-2 pr-3 font-medium">Quantidade total</th>
                          <th className="py-2 font-medium">Privativa total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(
                          agregados.blocosComputados
                            .flatMap((bloco) =>
                              bloco.lajesComputadas.flatMap((laje) =>
                                laje.itens.map((item) => ({
                                  item,
                                  qtdPavimentos: laje.quantidadePavimentos * bloco.multiplicadorBlocos,
                                }))
                              )
                            )
                            .reduce((acc, { item, qtdPavimentos }) => {
                              if (!item.descricao) return acc;
                              if (!acc[item.descricao]) {
                                acc[item.descricao] = { descricao: item.descricao, quantidade: 0, privativa: 0, vagas: 0 };
                              }
                              acc[item.descricao].quantidade += item.qtd * qtdPavimentos;
                              acc[item.descricao].privativa += item.privativaItem * qtdPavimentos;
                              acc[item.descricao].vagas += item.vagasItem * qtdPavimentos;
                              return acc;
                            }, {})
                        ).map((linha) => (
                          <tr key={linha.descricao} className="border-b border-slate-100">
                            <td className="py-1.5 pr-3 font-medium text-slate-700">{linha.descricao}</td>
                            <td className="py-1.5 pr-3 font-mono">
                              {linha.quantidade > 0 ? formatNumeroBR(linha.privativa / linha.quantidade) : "—"} m²
                            </td>
                            <td className="py-1.5 pr-3 font-mono">
                              {linha.quantidade > 0 && linha.vagas > 0 ? formatNumeroBR(linha.vagas / linha.quantidade) : "—"}
                            </td>
                            <td className="py-1.5 pr-3 font-mono">{formatNumeroBR(linha.quantidade, 0)}</td>
                            <td className="py-1.5 font-mono font-medium text-blue-700">{formatNumeroBR(linha.privativa)} m²</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {agregados.blocosComputados.every((bloco) =>
                      bloco.lajesComputadas.every((laje) => laje.itens.length === 0)
                    ) && (
                      <p className="mt-3 text-[12px] text-amber-600">
                        Ainda não há unidades alocadas em nenhum pavimento. Vá em "Dados do Empreendimento" →
                        Pavimento → "Adicionar uma unidade" para ver esta tabela preenchida.
                      </p>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="Quadro de áreas de prefeitura" subtitle="">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px] border-collapse text-sm">
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="py-1.5 pr-3 text-slate-700">Sobresolos</td>
                          <td className="py-1.5">{agregados.sobresolosPrefeitura > 0 ? `${formatNumeroBR(agregados.sobresolosPrefeitura)} m²` : "—"}</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1.5 pr-3 text-slate-700">Subsolos</td>
                          <td className="py-1.5">{agregados.subsolosPrefeitura > 0 ? `${formatNumeroBR(agregados.subsolosPrefeitura)} m²` : "—"}</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1.5 pr-3 text-slate-700">Térreo coberto + obras complementares</td>
                          <td className="py-1.5">{formatNumeroBR(agregados.terreoObrasPrefeitura)} m²</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1.5 pr-3 text-slate-700">Pavimentos (computável + não computável)</td>
                          <td className="py-1.5">{formatNumeroBR(agregados.pavimentosPrefeitura)} m²</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-3 text-slate-700">Ático</td>
                          <td className="py-1.5">{formatNumeroBR(agregados.aticoPrefeitura)} m²</td>
                        </tr>
                        <tr className="font-semibold text-slate-800">
                          <td className="pt-2 pr-3">Total</td>
                          <td className="pt-2">{formatNumeroBR(agregados.areaTotalPrefeitura)} m²</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}