import React, { useState, useMemo } from "react";
import {
  MapPin,
  LandPlot,
  Building2,
  Rows3,
  FileText,
  Plus,
  Trash2,
  ChevronRight,
  Gauge,
  LayoutDashboard,
  Wallet,
} from "lucide-react";

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
// Abas: Terreno | Zoneamento | Empreendimento | Resumo das Unidades | Indicadores
// ------------------------------------------------------------------

const TABS = [
  { id: "terreno", label: "Dados do Terreno", icon: LandPlot },
  { id: "zoneamento", label: "Zoneamento", icon: MapPin },
  { id: "areas", label: "Resumo das Unidades", icon: Rows3 },
  { id: "empreendimento", label: "Dados do Empreendimento", icon: Building2 },
  { id: "custos", label: "Custos / Taxas / Outorgas", icon: Wallet },
  { id: "indicadores", label: "Indicadores Gerais", icon: LayoutDashboard },
];

const ZONAS_SP = [
  "ZC",
  "ZCa",
  "ZC-ZEIS",
  "ZCOR-1",
  "ZCOR-2",
  "ZCOR-3",
  "ZCORa",
  "ZDE-1",
  "ZDE-2",
  "ZEIS-1",
  "ZEIS-2",
  "ZEIS-3",
  "ZEIS-4",
  "ZEIS-5",
  "ZEM",
  "ZEMP",
  "ZEP",
  "ZEPAM",
  "ZEPEC",
  "ZER-1",
  "ZER-2",
  "ZERa",
  "ZM",
  "ZMa",
  "ZMIS",
  "ZMISa",
  "ZOE",
  "ZPDS",
  "ZPDSr",
  "ZPI-1",
  "ZPI-2",
  "ZPR",
  "ZEU",
  "ZEUa",
  "ZEUP",
  "ZEUPa",
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
  ZEU: { caMinimo: 0.5, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.7, gabarito: null, recuoFrente: null, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: 20, notas: ["j"] },
  ZEUa: { caMinimo: null, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.7, gabarito: null, recuoFrente: null, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: 40, notas: ["j"] },
  ZEUP: { caMinimo: 0.5, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["b", "j"] },
  ZEUPa: { caMinimo: 0.5, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.5, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["c", "j"] },
  ZEM: { caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: null, recuoFrente: null, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: 20, notas: ["d", "j"] },
  ZEMP: { caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: null, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: 40, notas: ["e", "j"] },
  ZC: { caMinimo: 0.3, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 48, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZCa: { caMinimo: null, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 20, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZC-ZEIS": { caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZCOR-1": { caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZCOR-2": { caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZCOR-3": { caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 15, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZCORa: { caMinimo: 0.5, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: null, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZM: { caMinimo: 0.3, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZMa: { caMinimo: null, caBasico: 1, caMaximo: 2, to500: 0.7, toMais500: 0.5, gabarito: 15, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZMIS: { caMinimo: 0.3, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 15, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  ZMISa: { caMinimo: 0.5, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: null, gabarito: null, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZEIS-1": { caMinimo: 0.5, caBasico: 1, caMaximo: 2.5, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["f", "j"] },
  "ZEIS-2": { caMinimo: 0.5, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: null, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["f", "j"] },
  "ZEIS-3": { caMinimo: 0.5, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["g", "j"] },
  "ZEIS-4": { caMinimo: null, caBasico: 1, caMaximo: 4, to500: 0.7, toMais500: 0.5, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["h", "j"] },
  "ZEIS-5": { caMinimo: 0.5, caBasico: 1, caMaximo: 4, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["f", "j"] },
  "ZDE-1": { caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZDE-2": { caMinimo: 0.5, caBasico: 1, caMaximo: 2, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  "ZPI-1": { caMinimo: 0.5, caBasico: 1, caMaximo: 1.5, to500: 0.85, toMais500: 0.7, gabarito: 28, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  "ZPI-2": { caMinimo: 0.05, caBasico: 1, caMaximo: 1.5, to500: null, toMais500: 0.3, gabarito: 20, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  ZPR: { caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  "ZER-1": { caMinimo: 0.5, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: 0.5, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZERa: { caMinimo: 0.5, caBasico: 1, caMaximo: 1, to500: 0.5, toMais500: null, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  ZPDS: { caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.35, toMais500: 0.2, gabarito: 15, recuoFrente: 20, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: ["j"] },
  ZPDSr: { caMinimo: 0.05, caBasico: 1, caMaximo: 1, to500: 0.15, toMais500: null, gabarito: 10, recuoFrente: 10, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
  ZEPAM: { caMinimo: 0.1, caBasico: 1, caMaximo: 1, to500: 0.1, toMais500: 0.1, gabarito: 10, recuoFrente: 5, recuoLatFundoAte10: 3, recuoLatFundoAcima10: 3, cotaParteMaxima: null, notas: [] },
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

// Categorias de uso para o Fator Social (Fs) — usado em cálculos de outorga onerosa
const FS_OPCOES = [
  { label: "Padrão (R2V/NR)", valor: 1 },
  { label: "Mercado Popular (HMP)", valor: 0.5 },
  { label: "Interesse Social (HIS)", valor: 0 },
];

function Field({ label, unit, placeholder, type = "text", value, onChange, numerico, ...props }) {
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
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-slate-500">{label}</span>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          data-nav-input="true"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
          {...props}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
            {unit}
          </span>
        )}
      </div>
    </label>
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

function SectionCard({ title, subtitle, children }) {
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
      <p className={`mt-1 text-[22px] font-semibold ${highlight ? "text-blue-700" : "text-slate-800"}`}>
        {value}
        {unit && <span className="ml-1 text-[13px] font-medium text-slate-400">{unit}</span>}
      </p>
      {reference && <p className="mt-0.5 text-[12px] text-slate-400">{reference}</p>}
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
      className={`${width} rounded-md border px-2 py-1.5 text-sm ${
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
  categoria,
  expandido,
  onToggle,
  onAdd,
  onUpdate,
  onRemove,
  onRenameCategoria,
  onRemoveCategoria,
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
    : "Área computável normal do empreendimento.";
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
                  <TableInput value={formatNumeroBR(u.privativaUnidade)} disabled />
                </td>
                <td className="py-1.5 pr-3">
                  <TableInput
                    value={
                      u.percentualTerracoPrivativa !== null ? formatNumeroBR(u.percentualTerracoPrivativa) : "—"
                    }
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

const categoriaTabelaVazia = () => ({
  id: "cat-" + Date.now() + Math.random(),
  nome: "Nova categoria",
  categoriaFixa: null,
  naoComputavel: true,
});

const CATEGORIAS_TABELAS_PADRAO = [
  { id: "incentivo", nome: "Incentivo", categoriaFixa: "Incentivo", naoComputavel: true },
  { id: "hisHmp", nome: "HIS e HMP", categoriaFixa: null, naoComputavel: true, opcoesCategoria: ["HIS", "HMP"] },
  { id: "fachadaAtiva", nome: "Fachada Ativa", categoriaFixa: "Fachada Ativa", naoComputavel: true },
  { id: "residencial", nome: "Residencial", categoriaFixa: null, naoComputavel: false },
];

const blocoVazio = () => ({
  id: Date.now() + Math.random(),
  nome: "",
  uso: "",
  quantidadeBlocos: "",
  escadas: "",
  tipoEscada: "",
  elevadores: "",
  lajes: [lajeVaziaFactory()],
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
    // Não computáveis
    circulacaoR: "",
    hallR: "",
    lazerR: "",
    terracoCNr: "",
    escadaNR: "",
    areaTecnica: "",
    outrosNaoComputavel: "",
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

const itemUnidadeVazio = () => ({ id: Date.now() + Math.random(), descricao: "", quantidade: "" });

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
  const [identificacaoAberta, setIdentificacaoAberta] = useState(false);

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
  const [subprefeitura, setSubprefeitura] = useState("");
  const [cotaSolidariedade, setCotaSolidariedade] = useState("");
  const [modalidadeCotaSolidariedade, setModalidadeCotaSolidariedade] = useState("");
  const [valorReferenciaM2Fundurb, setValorReferenciaM2Fundurb] = useState("");
  const [splitHISPercentual, setSplitHISPercentual] = useState("50");
  const [areaMediaUnidadeHIS, setAreaMediaUnidadeHIS] = useState("40");
  const [areaMediaUnidadeHMP, setAreaMediaUnidadeHMP] = useState("50");
  const [subdistrito, setSubdistrito] = useState("");

  const handleSubprefeituraChange = (nova) => {
    setSubprefeitura(nova);
    setSubdistrito(""); // reinicia o subdistrito, já que as opções mudam conforme a subprefeitura
  };

  // --- Zoneamento (usados como referência nos indicadores) ---
  const [zona, setZona] = useState("");
  const [caBasicoZona, setCaBasicoZona] = useState("");
  const [caMaximoZona, setCaMaximoZona] = useState("");
  const [majoracaoCA, setMajoracaoCA] = useState("");
  const [caMaximoComBeneficiosManual, setCaMaximoComBeneficiosManual] = useState("");
  const [tpNecessaria, setTpNecessaria] = useState("");
  const [tpProjeto, setTpProjeto] = useState("");
  const [cotaAmbiental, setCotaAmbiental] = useState("");
  const [cotaParteProjeto, setCotaParteProjeto] = useState("");
  const [numeroUnidadesProjeto, setNumeroUnidadesProjeto] = useState("");
  const [toMaximaZona, setToMaximaZona] = useState("");
  const [gabaritoMaximoZona, setGabaritoMaximoZona] = useState("");
  const [cotaParteMaxima, setCotaParteMaxima] = useState("");
  const [cotaParteMinima, setCotaParteMinima] = useState("");
  const [fsFatorSocial, setFsFatorSocial] = useState("");

  // Preenche automaticamente CA básico/máximo, TO, gabarito e cota-parte a partir do
  // Quadro 3 (Lei nº 16.402/2016) quando a zona é selecionada.
  const preencherDoQuadro3 = (zonaSelecionada, terrenoAtual) => {
    const dados = QUADRO_3[zonaSelecionada];
    if (!dados) return;
    const terrenoNum = paraNumero(terrenoAtual);
    const toEscolhido =
      terrenoNum > 0 && terrenoNum < 500 ? dados.to500 : dados.toMais500 ?? dados.to500;
    if (dados.caBasico !== null) setCaBasicoZona(formatNumeroBR(dados.caBasico));
    if (dados.caMaximo !== null) setCaMaximoZona(formatNumeroBR(dados.caMaximo));
    if (toEscolhido !== null && toEscolhido !== undefined) {
      setToMaximaZona(formatNumeroBR(toEscolhido * 100));
    }
    if (dados.gabarito !== null) setGabaritoMaximoZona(formatNumeroBR(dados.gabarito));
    if (dados.cotaParteMaxima !== null) setCotaParteMaxima(formatNumeroBR(dados.cotaParteMaxima));
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
  const addCategoriaTabela = () =>
    setCategoriasTabelas((lista) => [...lista, categoriaTabelaVazia()]);
  const renameCategoriaTabela = (catId, nome) =>
    setCategoriasTabelas((lista) => lista.map((c) => (c.id === catId ? { ...c, nome } : c)));
  const removeCategoriaTabela = (catId) =>
    setCategoriasTabelas((lista) => lista.filter((c) => c.id !== catId));
  const moverCategoriaParaPosicao = (idOrigem, idDestino) =>
    setCategoriasTabelas((lista) => moverParaPosicao(lista, idOrigem, idDestino));

  // Blocos minimizados (apenas controle visual, não afeta os dados)
  const [blocosMinimizados, setBlocosMinimizados] = useState(() => new Set());
  const [estacionamentoMinimizado, setEstacionamentoMinimizado] = useState(false);
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

  // Tabelas do Resumo das Unidades: por padrão começam minimizadas.
  // Guardamos as que estão EXPANDIDAS (chave = blocoId + tabela).
  const [tabelasExpandidas, setTabelasExpandidas] = useState(() => new Set());
  const toggleTabelaExpandida = (chave) =>
    setTabelasExpandidas((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

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

  // ------------------------------------------------------------------
  // AGREGADOS (calculados automaticamente — mesma lógica da planilha)
  // ------------------------------------------------------------------
  const agregados = useMemo(() => {
    const terreno = paraNumero(areaTerreno);
    const areaRemanescente = terreno > 0 ? terreno - paraNumero(doacao) : null;
    // Regra de negócio: o terraço de cada pavimento não pode ultrapassar 5% da área remanescente do terreno
    const limiteTerracoPorPavimento =
      areaRemanescente !== null && areaRemanescente > 0 ? areaRemanescente * 0.05 : null;

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
      // Só conta como área computável de fato quando a categoria da tabela não é "não computável"
      // (ex: Residencial). Incentivo, Fachada Ativa, HIS/HMP e categorias personalizadas marcadas como
      // "não computável" entram apenas na privativa.
      const contaComoComputavel = categoriaInfo ? !categoriaInfo.naoComputavel : true;
      return {
        ...u,
        privativaUnidade,
        computavelUnidade: contaComoComputavel ? computavel : 0,
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
      };
    };

    // As unidades computáveis alocadas no pavimento vêm do catálogo GLOBAL do Resumo das Unidades
    // (de qualquer bloco do projeto): privativa/computável/vagas são somados a partir da quantidade
    // preenchida aqui, multiplicados depois pela quantidade de pavimentos.
    const calcularLaje = (l, unidadesPorDescricaoGlobal) => {
      const itens = (l.unidadesNoPavimento || []).map((it) => {
        const ref = unidadesPorDescricaoGlobal[it.descricao];
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
    const unidadesPorDescricaoGlobal = Object.fromEntries(
      linhasGlobais.filter((l) => l.descricao.trim()).map((l) => [l.descricao, l])
    );

    // Com o catálogo global pronto, calcula os pavimentos de cada bloco.
    const blocosComputados = blocos.map((bloco, i) => {
      const nomeExibicao = bloco.nome.trim() || bloco.uso || `Uso / Bloco ${i + 1}`;

      const lajesComputadas = bloco.lajes.map((l) => calcularLaje(l, unidadesPorDescricaoGlobal));
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
      // pavimento + Hall Privativo/Terraço/Floreira/Área técnica vindos das unidades alocadas.
      // O Ático inteiro (Total dos pavimentos do Ático) entra aqui como área não computável.
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
    const totalAreaComum = blocosComputados.reduce((acc, b) => acc + b.totalAreaComumBloco, 0);
    const totalPrivativaLajes = areaPrivativaTotal;
    const totalVagasLajes = totalVagas;

    // --- Quadro de Áreas de Prefeitura ---
    // Sobresolos/Subsolos/Térreo vêm dos níveis cadastrados em Estacionamento (pelo nome do nível).
    const somaNiveisPorTipo = (palavraChave) =>
      niveisEstacionamentoComputados
        .filter((n) => n.nome.toLowerCase().includes(palavraChave))
        .reduce((acc, n) => acc + n.totalPavimento, 0);
    const sobresolosPrefeitura = somaNiveisPorTipo("sobresolo");
    const subsolosPrefeitura = somaNiveisPorTipo("subsolo");
    const terreoNiveisPrefeitura = somaNiveisPorTipo("térreo") || somaNiveisPorTipo("terreo");
    const obrasComplementaresNum = paraNumero(obrasComplementares);
    const terreoObrasPrefeitura = terreoNiveisPrefeitura + obrasComplementaresNum;

    // Pavimentos (computável + não computável) e Ático vêm dos blocos/pavimentos, sem repetir o Ático.
    // Cada laje é multiplicada pela "Quantidade de blocos" (torres idênticas) do seu próprio bloco.
    const pavimentosPrefeitura = blocosComputados.reduce(
      (acc, b) =>
        acc +
        b.lajesComputadas
          .filter((l) => l.tipo !== "atico")
          .reduce((accL, l) => accL + (l.computavelPavimentos + l.areasComunsNaoComputaveisPavimentos) * b.multiplicadorBlocos, 0),
      0
    );
    const aticoPrefeitura = blocosComputados.reduce(
      (acc, b) =>
        acc +
        b.lajesComputadas
          .filter((l) => l.tipo === "atico")
          .reduce((accL, l) => accL + l.totalPavimentosAtico * b.multiplicadorBlocos, 0),
      0
    );

    const areaTotalPrefeituraAntiga =
      sobresolosPrefeitura + subsolosPrefeitura + terreoObrasPrefeitura + pavimentosPrefeitura + aticoPrefeitura;

    // Área não computável total do projeto = Não computável de todos os blocos (já incluindo o Ático
    // inteiro) + o total geral do Quadro de Estacionamento (Garagem + Outros dos níveis).
    const areaNaoComputavelTotalProjeto =
      blocosComputados.reduce((acc, b) => acc + b.totalNaoComputavelTabelaBloco, 0) + totalGeralEstacionamento;

    // Área total de prefeitura = Área computável total + Área não computável total do projeto.
    const areaTotalPrefeitura = areaComputavelTotal + areaNaoComputavelTotalProjeto;

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

    // (Área computável com bônus é calculada mais abaixo, após o CA com benefícios estar pronto)

    // Contrapartida necessária = 10% da Área Computável Total, calculada dinamicamente sobre a
    // mesma variável global (recalcula sozinha sempre que a área computável do projeto mudar).
    const contrapartidaHISNecessaria = cotaSolidariedadeAtiva ? areaComputavelTotal * 0.1 : 0;

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

    // Soma a área (privativa) das unidades marcadas como HIS/HMP já alocadas nos pavimentos,
    // opcionalmente filtrando por uma categoria específica ("HIS" ou "HMP").
    const somarAlocadoHisHmp = (categoriaAlvo) =>
      blocosComputados.reduce(
        (acc, bloco) =>
          acc +
          bloco.lajesComputadas.reduce((accLaje, laje) => {
            if (laje.tipo === "atico") return accLaje;
            return (
              accLaje +
              (laje.itens || []).reduce((accItem, item) => {
                const ref = unidadesPorDescricaoGlobal[item.descricao];
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
    const caMaximoZonaNum = paraNumero(caMaximoZona);
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

    // CA máximo com benefícios = CA máximo da zona x (1 + Majoração/100) — sugestão automática,
    // mas o campo é editável e o valor digitado manualmente tem prioridade. Quando a Cota de
    // Solidariedade está ativa e a Majoração não foi digitada, aplica o bônus fixo de 20%.
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

    // FALTA (ESTOURA): Área computável máxima permitida (CA máx c/ benefícios x Área do terreno) - Área computável total
    // Objetivo é zerar esse valor. Negativo = estourou o CA; positivo = ainda há CA disponível.
    const computavelMaximoPermitido =
      terreno > 0 && caMaximoComBeneficios > 0 ? caMaximoComBeneficios * terreno : null;
    const faltaEstoura =
      computavelMaximoPermitido !== null ? computavelMaximoPermitido - areaComputavelTotal : null;

    // TP (taxa de permeabilidade): redução TP = (TP projeto ÷ TP necessária) - 1
    const tpNecessariaNum = paraNumero(tpNecessaria);
    const tpProjetoNum = paraNumero(tpProjeto);
    const reducaoTP = tpNecessariaNum > 0 ? tpProjetoNum / tpNecessariaNum - 1 : null;

    return {
      blocosComputados,
      linhasGlobais,
      tipologiasGlobais,
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
      totalAreaComum,
      totalPrivativaLajes,
      totalVagasLajes,
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
      caMaximoComBeneficios,
      caMaximoComBeneficiosCalculado,
      areaComputavelComBonusCotaSolidariedade,
      cotaSolidariedadeObrigatoria,
      cotaSolidariedadeAtiva,
      contrapartidaHISNecessaria,
      contrapartidaHISAlocada,
      contrapartidaHISFalta,
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
      pagamentoFundurbAtivo,
      areaCotaFundurb,
      valorTotalFundurb,
      computavelMaximoPermitido,
      faltaEstoura,
      reducaoTP,
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
    tpNecessaria,
    tpProjeto,
  ]);

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
      <header className="no-print flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <FileText size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold text-slate-800 leading-tight">
              Estudo Analítico de Viabilidade - v2
            </h1>
            <p className="truncate text-[12px] text-slate-400 leading-tight">
              São Paulo · Formulário + indicadores automáticos
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
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="no-print hidden w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-6 md:block">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Seções do estudo
          </p>
          <nav className="flex flex-col gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  }`}
                >
                  <Icon size={17} className={isActive ? "text-blue-600" : "text-slate-400"} />
                  {tab.label}
                  {isActive && <ChevronRight size={15} className="ml-auto text-blue-400" />}
                </button>
              );
            })}
          </nav>

        </aside>

        {/* Main content */}
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-5xl flex flex-col gap-6">
            {/* Mobile tabs */}
            <div className="no-print flex gap-2 overflow-x-auto md:hidden">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${
                    activeTab === tab.id
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-500 border border-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Identificação do estudo — visível em qualquer tamanho de tela */}
            <div className="rounded-lg border border-slate-200 bg-white">
              <button
                onClick={() => setIdentificacaoAberta((v) => !v)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                <ChevronRight
                  size={15}
                  className={`shrink-0 text-slate-400 transition-transform ${
                    identificacaoAberta ? "rotate-90" : ""
                  }`}
                />
                <span className="text-[13px] font-medium text-slate-600">Identificação do estudo</span>
                {!identificacaoAberta && (nomeProjeto || cliente) && (
                  <span className="ml-1 truncate text-[12px] text-slate-400">
                    — {[nomeProjeto, cliente].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
              {identificacaoAberta && (
                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label="Cliente"
                    placeholder="Nome do cliente"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                  />
                  <Field
                    label="Nome do projeto"
                    placeholder="Ex: Residencial Jardins"
                    value={nomeProjeto}
                    onChange={(e) => setNomeProjeto(e.target.value)}
                  />
                  <Field
                    label="Arquiteto responsável"
                    placeholder="Nome"
                    value={arquitetoResponsavel}
                    onChange={(e) => setArquitetoResponsavel(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Opção"
                      placeholder="01"
                      value={opcaoEstudo}
                      onChange={(e) => setOpcaoEstudo(e.target.value)}
                    />
                    <Field
                      label="Revisão"
                      placeholder="R0"
                      value={revisaoEstudo}
                      onChange={(e) => setRevisaoEstudo(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ---------------- ABA: DADOS DO TERRENO ---------------- */}
            {activeTab === "terreno" && (
              <>
                <SectionCard
                  title="Localização"
                  subtitle="Identificação e localização administrativa do terreno"
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
                  subtitle="Áreas totais, de reserva e quinhões (residencial / não residencial)"
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
                  </div>
                </SectionCard>

                <SectionCard
                  title="Cota de Solidariedade"
                  subtitle="Instrumento do Plano Diretor: destinação de área/unidades para HIS/HMP em troca de bônus de potencial construtivo"
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
                          <p className="text-[11px] text-blue-600">CA total resultante</p>
                          <p className="text-[15px] font-semibold text-blue-700">
                            {formatNumeroBR(agregados.caMaximoComBeneficios)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <p className="text-[11px] text-blue-600">Área computável (com bônus)</p>
                          <p className="text-[15px] font-semibold text-blue-700">
                            {agregados.areaComputavelComBonusCotaSolidariedade !== null
                              ? formatNumeroBR(agregados.areaComputavelComBonusCotaSolidariedade)
                              : "—"}{" "}
                            m²
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">
                        Área computável (com bônus) = Área do terreno × CA total resultante — o potencial
                        construtivo teórico permitido pela zona já com o bônus. Para referência, a Área
                        Computável Total real do projeto (soma efetiva de blocos, unidades e estacionamento,
                        igual à do "Resumo do empreendimento") está em{" "}
                        <strong>{formatNumeroBR(agregados.areaComputavelTotal)} m²</strong>. O bônus de 20% é
                        aplicado automaticamente no campo "Majoração CA" (aba Zoneamento) — você pode digitar
                        outro valor lá para sobrescrever.
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
                          <option value="Construção de HIS">Construção física de HIS no terreno</option>
                          <option value="Pagamento em Recursos Financeiros (FUNDURB)">
                            Pagamento em Recursos Financeiros (FUNDURB / Compensação)
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
                            Valor Total FUNDURB = Área da cota × Valor de referência do m². Esse valor é
                            lançado automaticamente na aba "Custos / Taxas / Outorgas" como uma despesa de
                            contrapartida urbanística.
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
                                {formatNumeroBR(Math.max(agregados.contrapartidaHISFalta, 0))} m²
                              </p>
                            </div>
                          </div>

                          <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                            Split da cota — HIS x HMP
                          </p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Field
                              label="% destinado a HIS"
                              unit="%"
                              placeholder="50,00"
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
                                    {formatNumeroBR(Math.max(agregados.faltaAlocarHIS, 0))} m²
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
                                    {formatNumeroBR(Math.max(agregados.faltaAlocarHMP, 0))} m²
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

                <SectionCard
                  title="Quadro de Áreas de Prefeitura"
                  subtitle="Área total construída considerada pela Prefeitura — Área computável total + Área não computável total"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Sobresolos" unit="m²" value={formatNumeroBR(agregados.sobresolosPrefeitura)} disabled />
                    <Field label="Subsolos" unit="m²" value={formatNumeroBR(agregados.subsolosPrefeitura)} disabled />
                    <Field
                      label="Obras complementares"
                      unit="m²"
                      placeholder="0,00"
                      value={obrasComplementares}
                      onChange={(e) => setObrasComplementares(e.target.value)}
                    />
                    <Field
                      label="Térreo coberto + Obras complementares"
                      unit="m²"
                      value={formatNumeroBR(agregados.terreoObrasPrefeitura)}
                      disabled
                    />
                    <Field
                      label="Pavimentos (Computável + Não Computável)"
                      unit="m²"
                      value={formatNumeroBR(agregados.pavimentosPrefeitura)}
                      disabled
                    />
                    <Field label="Ático" unit="m²" value={formatNumeroBR(agregados.aticoPrefeitura)} disabled />
                  </div>
                  <p className="mt-3 text-[11px] text-slate-400">
                    As linhas acima são só referência (de onde vêm as áreas de garagem/pavimentos/ático). O
                    "Total" abaixo usa a fórmula oficial: Área computável total + Área não computável total.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[11px] text-slate-400">Área computável total</p>
                      <p className="text-[15px] font-semibold text-slate-800">
                        {formatNumeroBR(agregados.areaComputavelTotal)} m²
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[11px] text-slate-400">Área não computável total</p>
                      <p className="text-[15px] font-semibold text-slate-800">
                        {formatNumeroBR(agregados.areaNaoComputavelTotalProjeto)} m²
                      </p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-[11px] text-blue-600">Total (Área de Prefeitura)</p>
                      <p className="text-[18px] font-semibold text-blue-700">
                        {formatNumeroBR(agregados.areaTotalPrefeitura)} m²
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] text-slate-400">
                    Área não computável total = Não computável de todos os blocos (Circulação, Hall, Lazer,
                    Terraço, Escada NR, Área técnica, Outros e o Ático inteiro) + Total geral do Quadro de
                    Estacionamento (Garagem + Outros dos níveis).
                  </p>
                </SectionCard>

                <SectionCard
                  title="Índices Privativa/Terreno e Privativa/Prefeitura"
                  subtitle="Somados automaticamente a partir do Resumo das Unidades — não são mais digitados"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field
                      label="Área do terreno"
                      unit="m²"
                      value={formatNumeroBR(paraNumero(areaTerreno))}
                      disabled
                    />
                    <Field
                      label="Área privativa total"
                      unit="m²"
                      value={formatNumeroBR(agregados.areaPrivativaTotal)}
                      disabled
                    />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-slate-500">Índice Privativa/Terreno</span>
                      <div className="flex h-[38px] items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3">
                        <Gauge size={16} className="text-blue-600" />
                        <span className="text-[15px] font-semibold text-blue-700">
                          {formatNumeroBR(agregados.indicePrivativaTerreno)}
                        </span>
                      </div>
                    </div>
                    <Field
                      label="Área total de prefeitura"
                      unit="m²"
                      value={formatNumeroBR(agregados.areaTotalPrefeitura)}
                      disabled
                    />
                    <Field
                      label="Área privativa total"
                      unit="m²"
                      value={formatNumeroBR(agregados.areaPrivativaTotal)}
                      disabled
                    />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-slate-500">Índice Privativa/Prefeitura</span>
                      <div className="flex h-[38px] items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3">
                        <Gauge size={16} className="text-blue-600" />
                        <span className="text-[15px] font-semibold text-blue-700">
                          {agregados.indicePrivativaPrefeitura !== null
                            ? formatNumeroBR(agregados.indicePrivativaPrefeitura)
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] text-slate-400">
                    Índice Privativa/Terreno = Área privativa total ÷ Área do terreno. Índice
                    Privativa/Prefeitura = Área privativa total ÷ Área total de prefeitura (Quadro de Áreas
                    de Prefeitura, acima). Preencha as unidades na aba "Resumo das Unidades" — os dois
                    índices são recalculados automaticamente.
                  </p>
                </SectionCard>
              </>
            )}

            {/* ---------------- ABA: ZONEAMENTO ---------------- */}
            {activeTab === "zoneamento" && (
              <>
                <SectionCard
                  title="Parâmetros da zona"
                  subtitle="Índices urbanísticos aplicáveis conforme a legislação de zoneamento — Quadro 3, Lei nº 16.402/2016"
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
                      label="CA básico da zona"
                      placeholder="0,00"
                      value={caBasicoZona}
                      onChange={(e) => setCaBasicoZona(e.target.value)}
                    />
                    <Field
                      label="CA máximo da zona"
                      placeholder="0,00"
                      value={caMaximoZona}
                      onChange={(e) => setCaMaximoZona(e.target.value)}
                    />
                    <div>
                      <Field
                        label="Majoração CA (não residencial)"
                        unit="%"
                        placeholder={agregados.cotaSolidariedadeAtiva ? "20,00 (automático)" : "0,00"}
                        value={majoracaoCA}
                        onChange={(e) => setMajoracaoCA(e.target.value)}
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        {agregados.cotaSolidariedadeAtiva
                          ? "Preenchido automaticamente com 20% (bônus da Cota de Solidariedade, aba Dados do Terreno). Digite outro valor aqui para sobrescrever."
                          : "Aplicável quando há benefício ou outorga onerosa."}
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
                    <Field
                      label="TO máxima"
                      unit="%"
                      placeholder="0,00"
                      value={toMaximaZona}
                      onChange={(e) => setToMaximaZona(e.target.value)}
                    />
                    <Field
                      label="Gabarito máximo"
                      unit="m"
                      placeholder="0,00"
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
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field
                      label="Cota-parte máxima"
                      unit="m²"
                      placeholder="0,00"
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
                    <Field
                      label="Cota-parte do projeto"
                      unit="m²"
                      placeholder="0,00"
                      value={cotaParteProjeto}
                      onChange={(e) => setCotaParteProjeto(e.target.value)}
                    />
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-slate-500">Categoria de Uso (Fs)</span>
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={fsFatorSocial}
                        onChange={(e) =>
                          setFsFatorSocial(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      >
                        <option value="">Selecione...</option>
                        {FS_OPCOES.map((op) => (
                          <option key={op.label} value={op.valor}>
                            {op.label} ({formatNumeroBR(op.valor)})
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label="Nº de unidades do projeto"
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
                    mínima)).
                  </p>
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

                        <div className="mt-3 flex flex-col gap-4">
                          {bloco.lajesComputadas.map((laje, li) => {
                            const lajeMinimizada = lajesMinimizadas.has(laje.id);
                            const ehAtico = laje.tipo === "atico";
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
                                  <input
                                    className="w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    value={laje.nome}
                                    onChange={(e) => updateLaje(bloco.id, laje.id, "nome", e.target.value)}
                                    placeholder={li === 0 ? "Ex: Pavimento Tipo" : `Pavimento ${li + 1}`}
                                  />
                                </div>
                                {bloco.lajesComputadas.length > 1 && (
                                  <button
                                    onClick={() => removeLaje(bloco.id, laje.id)}
                                    className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-red-500 hover:text-red-600"
                                  >
                                    <Trash2 size={14} />
                                    Remover
                                  </button>
                                )}
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

                              <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
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
                                />
                              </div>

                              <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                                Não Computáveis
                              </p>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Field
                                  label="Circulação R não computável"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.circulacaoR}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "circulacaoR", e.target.value)
                                  }
                                />
                                <Field
                                  label="Hall R não computável"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.hallR}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "hallR", e.target.value)}
                                />
                                <Field
                                  label="Lazer R não computável"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.lazerR}
                                  onChange={(e) => updateLaje(bloco.id, laje.id, "lazerR", e.target.value)}
                                />
                                <Field
                                  label="Terraço C. NR não computável"
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
                                  label="Área técnica não computável"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.areaTecnica}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "areaTecnica", e.target.value)
                                  }
                                />
                                <Field
                                  label="Outros não computável"
                                  unit="m²"
                                  placeholder="0,00"
                                  value={laje.outrosNaoComputavel}
                                  onChange={(e) =>
                                    updateLaje(bloco.id, laje.id, "outrosNaoComputavel", e.target.value)
                                  }
                                />
                                <Field
                                  label="Terraço C. R não computável"
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
                                    {laje.itens.map((item) => (
                                      <div key={item.id} className="flex flex-wrap items-center gap-2">
                                        <select
                                          className="min-w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                                          value={item.descricao}
                                          onChange={(e) =>
                                            updateItemUnidade(bloco.id, laje.id, item.id, "descricao", e.target.value)
                                          }
                                        >
                                          <option value="">Selecione a unidade...</option>
                                          {agregados.tipologiasGlobais.map((tp) => (
                                            <option key={tp} value={tp}>
                                              {tp}
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
                                        {item.descricao &&
                                          (() => {
                                            const ref = agregados.linhasGlobais.find(
                                              (l) => l.descricao === item.descricao
                                            );
                                            return ref && ref.categoria ? (
                                              <span className="whitespace-nowrap rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                                {ref.categoria}
                                              </span>
                                            ) : null;
                                          })()}
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
                                    ))}
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
                        categoria={categoria}
                        expandido={tabelasExpandidas.has(categoria.id)}
                        onToggle={() => toggleTabelaExpandida(categoria.id)}
                        onAdd={addUnidade}
                        onUpdate={updateUnidade}
                        onRemove={removeUnidade}
                        onRenameCategoria={renameCategoriaTabela}
                        onRemoveCategoria={removeCategoriaTabela}
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
            {activeTab === "custos" && (
              <div className="flex flex-col gap-6">
                <SectionCard
                  title="Custos / Taxas / Outorgas"
                  subtitle="Despesas de contrapartida urbanística lançadas automaticamente a partir das demais abas"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[12px] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Descrição</th>
                          <th className="py-2 pr-3 font-medium">Origem</th>
                          <th className="py-2 pr-3 font-medium">Base de cálculo</th>
                          <th className="py-2 font-medium">Valor (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agregados.pagamentoFundurbAtivo ? (
                          <tr className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-medium text-slate-700">
                              Contrapartida Cota de Solidariedade (FUNDURB)
                            </td>
                            <td className="py-2 pr-3 text-slate-500">Dados do Terreno → Cota de Solidariedade</td>
                            <td className="py-2 pr-3 text-slate-500">
                              {formatNumeroBR(agregados.areaCotaFundurb)} m² × R${" "}
                              {formatNumeroBR(paraNumero(valorReferenciaM2Fundurb))}/m²
                            </td>
                            <td className="py-2 font-semibold text-blue-700">
                              R$ {formatNumeroBR(agregados.valorTotalFundurb)}
                            </td>
                          </tr>
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-4 text-center text-[12px] text-slate-400">
                              Nenhum custo lançado ainda. Se o projeto adotar "Pagamento em Recursos
                              Financeiros (FUNDURB)" na Cota de Solidariedade (aba Dados do Terreno), a
                              despesa aparece aqui automaticamente.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {agregados.pagamentoFundurbAtivo && (
                        <tfoot>
                          <tr className="font-semibold text-slate-800">
                            <td colSpan={3} className="pt-2 pr-3 text-right">
                              Total de custos/outorgas
                            </td>
                            <td className="pt-2 text-blue-700">
                              R$ {formatNumeroBR(agregados.valorTotalFundurb)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  <p className="mt-3 text-[12px] text-slate-400">
                    Esse valor impacta o fluxo de custos do empreendimento, mas preserva integralmente o VGV
                    e o mix de unidades residenciais — nenhuma unidade é sacrificada para HIS físico quando
                    essa modalidade é escolhida.
                  </p>
                </SectionCard>
              </div>
            )}

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

                <SectionCard
                  title="Resumo do empreendimento"
                  subtitle="Agregados calculados automaticamente a partir das demais abas"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <MetricCard label="Área do terreno" value={formatNumeroBR(paraNumero(areaTerreno))} unit="m²" />
                    <MetricCard
                      label="Área remanescente"
                      value={formatNumeroBR(agregados.areaRemanescente)}
                      unit="m²"
                    />
                    <MetricCard
                      label="Área computável total"
                      value={formatNumeroBR(agregados.areaComputavelTotal)}
                      unit="m²"
                    />
                    <MetricCard
                      label="Área privativa total"
                      value={formatNumeroBR(agregados.areaPrivativaTotal)}
                      unit="m²"
                    />
                    <MetricCard
                      label="Área não computável total"
                      value={formatNumeroBR(agregados.areaNaoComputavelTotalProjeto)}
                      unit="m²"
                    />
                    <MetricCard
                      label="Área total de prefeitura"
                      value={formatNumeroBR(agregados.areaTotalPrefeitura)}
                      unit="m²"
                      reference="Computável + Não computável"
                    />
                    <MetricCard
                      label="CA utilizado"
                      value={formatNumeroBR(agregados.caUtilizado)}
                      reference={
                        caMaximoZona
                          ? `CA máximo da zona: ${formatNumeroBR(paraNumero(caMaximoZona))}`
                          : "Preencha o CA máximo na aba Zoneamento"
                      }
                    />
                    <MetricCard
                      label="Índice Privativa/Prefeitura"
                      value={
                        agregados.indicePrivativaPrefeitura !== null
                          ? formatNumeroBR(agregados.indicePrivativaPrefeitura)
                          : "—"
                      }
                      highlight
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Cota de Solidariedade"
                  subtitle={
                    agregados.cotaSolidariedadeAtiva
                      ? agregados.cotaSolidariedadeObrigatoria
                        ? "Obrigatória — área computável do projeto já ultrapassou 20.000 m²"
                        : "Ativa por escolha (opcional) — configurada em Dados do Terreno"
                      : "Inativa — projeto não está utilizando o instrumento"
                  }
                >
                  {agregados.cotaSolidariedadeAtiva ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <MetricCard
                        label="CA total com bônus"
                        value={formatNumeroBR(agregados.caMaximoComBeneficios)}
                        highlight
                      />
                      {agregados.pagamentoFundurbAtivo ? (
                        <>
                          <MetricCard
                            label="Área da cota (FUNDURB)"
                            value={formatNumeroBR(agregados.areaCotaFundurb)}
                            unit="m²"
                          />
                          <MetricCard
                            label="Valor de referência do m²"
                            value={`R$ ${formatNumeroBR(paraNumero(valorReferenciaM2Fundurb))}`}
                          />
                          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                            <p className="text-[12px] font-medium text-blue-600">Valor total FUNDURB</p>
                            <p className="mt-1 text-[22px] font-semibold text-blue-700">
                              R$ {formatNumeroBR(agregados.valorTotalFundurb)}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <MetricCard
                            label="Contrapartida HIS necessária"
                            value={formatNumeroBR(agregados.contrapartidaHISNecessaria)}
                            unit="m²"
                          />
                          <MetricCard
                            label="Contrapartida HIS alocada"
                            value={formatNumeroBR(agregados.contrapartidaHISAlocada)}
                            unit="m²"
                          />
                          <div
                            className={`rounded-xl border p-4 ${
                              agregados.contrapartidaHISFalta > 0
                                ? "border-red-200 bg-red-50"
                                : "border-emerald-200 bg-emerald-50"
                            }`}
                          >
                            <p className="text-[12px] font-medium text-slate-400">
                              {agregados.contrapartidaHISFalta > 0 ? "Falta alocar" : "Contrapartida atendida"}
                            </p>
                            <p
                              className={`mt-1 text-[22px] font-semibold ${
                                agregados.contrapartidaHISFalta > 0 ? "text-red-600" : "text-emerald-600"
                              }`}
                            >
                              {formatNumeroBR(Math.max(agregados.contrapartidaHISFalta, 0))}
                              <span className="ml-1 text-[13px] font-medium text-slate-400">m²</span>
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-[12px] text-slate-400">
                      Ative em "Dados do Terreno" → "Haverá Cota de Solidariedade?" para acompanhar o bônus
                      de CA e a contrapartida HIS/HMP aqui.
                    </p>
                  )}
                </SectionCard>

                <SectionCard
                  title="Falta (Estoura) — computável máxima do projeto"
                  subtitle="Objetivo: zerar esse valor. Negativo = estourou o CA máximo; positivo = ainda há CA disponível"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <MetricCard
                      label="Computável máximo permitido"
                      value={
                        agregados.computavelMaximoPermitido !== null
                          ? formatNumeroBR(agregados.computavelMaximoPermitido)
                          : "—"
                      }
                      unit="m²"
                      reference="CA máximo da zona × Área do terreno"
                    />
                    <MetricCard
                      label="Área computável total (utilizada)"
                      value={formatNumeroBR(agregados.areaComputavelTotal)}
                      unit="m²"
                    />
                    <div
                      className={`rounded-xl border p-4 ${
                        agregados.faltaEstoura === null
                          ? "border-slate-200 bg-white"
                          : agregados.faltaEstoura < 0
                          ? "border-red-200 bg-red-50"
                          : agregados.faltaEstoura === 0
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <p className="text-[12px] font-medium text-slate-400">Falta (Estoura)</p>
                      <p
                        className={`mt-1 text-[22px] font-semibold ${
                          agregados.faltaEstoura === null
                            ? "text-slate-800"
                            : agregados.faltaEstoura < 0
                            ? "text-red-600"
                            : agregados.faltaEstoura === 0
                            ? "text-emerald-600"
                            : "text-slate-900"
                        }`}
                      >
                        {formatNumeroBR(agregados.faltaEstoura)}
                        <span className="ml-1 text-[13px] font-medium text-slate-400">m²</span>
                      </p>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Blocos e Unidades" subtitle="Totais consolidados do empreendimento">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <MetricCard label="Total de pavimentos" value={formatNumeroBR(agregados.totalPavimentos)} />
                    <MetricCard label="Total de unidades" value={formatNumeroBR(agregados.totalUnidades)} />
                  </div>

                  <p className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                    Detalhamento por tipologia
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[12px] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Descrição (tipologia)</th>
                          <th className="py-2 pr-3 font-medium">Quantidade</th>
                          <th className="py-2 pr-3 font-medium">Computável (m²)</th>
                          <th className="py-2 pr-3 font-medium">Privativa (m²)</th>
                          <th className="py-2 font-medium">Vagas</th>
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
                                acc[item.descricao] = {
                                  descricao: item.descricao,
                                  quantidade: 0,
                                  computavel: 0,
                                  privativa: 0,
                                  vagas: 0,
                                };
                              }
                              // Quantidade real no projeto = (unidades por pavimento) x (nº de pavimentos do grupo)
                              acc[item.descricao].quantidade += item.qtd * qtdPavimentos;
                              acc[item.descricao].computavel += item.computavelItem * qtdPavimentos;
                              acc[item.descricao].privativa += item.privativaItem * qtdPavimentos;
                              acc[item.descricao].vagas += item.vagasItem * qtdPavimentos;
                              return acc;
                            }, {})
                        ).map((linha) => (
                          <tr key={linha.descricao} className="border-b border-slate-100">
                            <td className="py-1.5 pr-3 font-medium text-slate-700">{linha.descricao}</td>
                            <td className="py-1.5 pr-3">{formatNumeroBR(linha.quantidade)}</td>
                            <td className="py-1.5 pr-3">{formatNumeroBR(linha.computavel)}</td>
                            <td className="py-1.5 pr-3 font-medium text-blue-700">
                              {formatNumeroBR(linha.privativa)}
                            </td>
                            <td className="py-1.5">{formatNumeroBR(linha.vagas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {agregados.blocosComputados.every(
                      (bloco) => bloco.lajesComputadas.every((laje) => laje.itens.length === 0)
                    ) && (
                      <p className="mt-3 text-[12px] text-amber-600">
                        Ainda não há unidades alocadas em nenhum pavimento. Vá em "Dados do Empreendimento" →
                        Pavimento → "Adicionar uma unidade" para ver esta tabela preenchida.
                      </p>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Estacionamento — Subsolos e Sobresolos"
                  subtitle="Resumo dos níveis de garagem cadastrados em Dados do Empreendimento"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <MetricCard label="Total garagem" value={formatNumeroBR(agregados.totalGaragemEstacionamento)} unit="m²" />
                    <MetricCard label="Total outros" value={formatNumeroBR(agregados.totalOutrosEstacionamento)} unit="m²" />
                    <MetricCard
                      label="Total computável (R2V/HMP/HIS)"
                      value={formatNumeroBR(agregados.totalComputavelEstacionamento)}
                      unit="m²"
                    />
                    <MetricCard
                      label="Total geral dos níveis"
                      value={formatNumeroBR(agregados.totalGeralEstacionamento)}
                      unit="m²"
                      highlight
                    />
                    <MetricCard label="Cota de garagem (m²/vaga)" value={formatNumeroBR(agregados.cotaGaragem)} />
                    <MetricCard
                      label="Estacionamento necessário"
                      value={formatNumeroBR(agregados.estacionamentoTotalNecessario)}
                      unit="m²"
                    />
                    <MetricCard label="Total de vagas" value={formatNumeroBR(agregados.totalVagasGeral)} />
                    <div
                      className={`rounded-xl border p-4 ${
                        agregados.faltaEstouraGaragem < 0
                          ? "border-red-200 bg-red-50"
                          : agregados.faltaEstouraGaragem === 0
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <p className="text-[12px] font-medium text-slate-400">Falta (Estoura) — garagem</p>
                      <p
                        className={`mt-1 text-[22px] font-semibold ${
                          agregados.faltaEstouraGaragem < 0
                            ? "text-red-600"
                            : agregados.faltaEstouraGaragem === 0
                            ? "text-emerald-600"
                            : "text-slate-900"
                        }`}
                      >
                        {formatNumeroBR(agregados.faltaEstouraGaragem)}
                        <span className="ml-1 text-[13px] font-medium text-slate-400">m²</span>
                      </p>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Áreas comuns não computáveis (pavimentos)"
                  subtitle="Soma de Circulação R + Circulação NR + Hall R + Lazer R + Outros não computável, de todos os pavimentos"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <MetricCard label="Área comum total" value={formatNumeroBR(agregados.totalAreaComum)} unit="m²" />
                    <MetricCard
                      label="Terraço máximo por pavimento (5%)"
                      value={
                        agregados.limiteTerracoPorPavimento !== null
                          ? formatNumeroBR(agregados.limiteTerracoPorPavimento)
                          : "—"
                      }
                      unit="m²"
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Tabela de resumo de blocos"
                  subtitle="Vai surgindo conforme os blocos forem preenchidos em Dados do Empreendimento"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[12px] text-slate-400">
                          <th className="py-2 pr-3 font-medium">Bloco / Uso</th>
                          <th className="py-2 pr-3 font-medium">Pavimentos</th>
                          <th className="py-2 pr-3 font-medium">Unidades</th>
                          <th className="py-2 pr-3 font-medium">Computável (m²)</th>
                          <th className="py-2 pr-3 font-medium">Privativa (m²)</th>
                          <th className="py-2 font-medium">Vagas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agregados.blocosComputados.map((bloco) => (
                          <tr key={bloco.id} className="border-b border-slate-100">
                            <td className="py-1.5 pr-3 font-medium text-slate-700">{bloco.nomeExibicao}</td>
                            <td className="py-1.5 pr-3">{formatNumeroBR(bloco.totalPavimentosBloco)}</td>
                            <td className="py-1.5 pr-3">{formatNumeroBR(bloco.totalUnidadesBloco)}</td>
                            <td className="py-1.5 pr-3">{formatNumeroBR(bloco.totalComputavelLajesBloco)}</td>
                            <td className="py-1.5 pr-3 font-medium text-blue-700">
                              {formatNumeroBR(bloco.totalPrivativaLajesBloco)}
                            </td>
                            <td className="py-1.5">{formatNumeroBR(bloco.totalVagasLajesBloco)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-semibold text-slate-800">
                          <td className="pt-2 pr-3">Total geral</td>
                          <td className="pt-2 pr-3">{formatNumeroBR(agregados.totalPavimentos)}</td>
                          <td className="pt-2 pr-3">{formatNumeroBR(agregados.totalUnidades)}</td>
                          <td className="pt-2 pr-3">{formatNumeroBR(agregados.areaComputavelTotal)}</td>
                          <td className="pt-2 pr-3 text-blue-700">{formatNumeroBR(agregados.areaPrivativaTotal)}</td>
                          <td className="pt-2">{formatNumeroBR(agregados.totalVagas)}</td>
                        </tr>
                      </tfoot>
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