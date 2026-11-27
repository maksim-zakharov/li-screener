import type {
  ChartData,
  ChartMetaInfo,
  ChartTemplate,
  ChartTemplateContent,
  IExternalSaveLoadAdapter,
  LineToolsAndGroupsLoadRequestContext,
  LineToolsAndGroupsLoadRequestType,
  LineToolsAndGroupsState,
  ResolutionString,
  StudyTemplateData,
  StudyTemplateMetaInfo,
} from '@/assets/charting_library'

const LAYOUT_KEY = 'li-screener.tv.chart-layout'
const LAYOUT_META_KEY = 'li-screener.tv.chart-meta'
const LINETOOLS_PREFIX = 'li-screener.tv.linetools:'
const STUDY_TEMPLATES_KEY = 'li-screener.tv.study-templates'
const DEFAULT_CHART_ID = 'li-screener-default'

interface PersistedLineTools {
  /** Тикер */
  symbol?: string
  /** id → state (null = удалён) */
  sources: [string, unknown][]
  /** id → group */
  groups: [string, unknown][]
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return fallback
    }
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn('TV save localStorage:', error)
  }
}

function lineToolsKey(layoutId: string | undefined, chartId: string | number, symbol?: string): string {
  const layout = (layoutId ?? 'default').trim() || 'default'
  const sym = symbol?.trim().toUpperCase() ?? ''
  return `${LINETOOLS_PREFIX}${layout}:${chartId}${sym ? `:${sym}` : ''}`
}

function serializeLineTools(state: LineToolsAndGroupsState): PersistedLineTools {
  const sources: [string, unknown][] = []
  const groups: [string, unknown][] = []
  if (state.sources) {
    for (const [id, value] of state.sources.entries()) {
      sources.push([String(id), value])
    }
  }
  if (state.groups) {
    for (const [id, value] of state.groups.entries()) {
      groups.push([String(id), value])
    }
  }
  return {
    symbol: state.symbol,
    sources,
    groups,
  }
}

function deserializeLineTools(raw: PersistedLineTools | null): Partial<LineToolsAndGroupsState> | null {
  if (!raw) {
    return null
  }
  const sources = new Map<string, unknown>()
  const groups = new Map<string, unknown>()
  for (const [id, value] of raw.sources ?? []) {
    sources.set(String(id), value)
  }
  for (const [id, value] of raw.groups ?? []) {
    groups.set(String(id), value)
  }
  if (sources.size === 0 && groups.size === 0) {
    return null
  }
  return {
    sources: sources as LineToolsAndGroupsState['sources'],
    groups: groups as LineToolsAndGroupsState['groups'],
    symbol: raw.symbol,
  }
}

/**
 * Save/load adapter: layout + рисунки в localStorage (переживают reload).
 */
export function createLocalChartSaveLoadAdapter(): IExternalSaveLoadAdapter {
  return {
    async getAllCharts(): Promise<ChartMetaInfo[]> {
      const meta = readJson<ChartMetaInfo | null>(LAYOUT_META_KEY, null)
      return meta ? [meta] : []
    },

    async removeChart(_id: string | number): Promise<void> {
      localStorage.removeItem(LAYOUT_KEY)
      localStorage.removeItem(LAYOUT_META_KEY)
    },

    async saveChart(chartData: ChartData): Promise<string | number> {
      const id = chartData.id != null && String(chartData.id) ? String(chartData.id) : DEFAULT_CHART_ID
      const content =
        typeof chartData.content === 'string' ? chartData.content : JSON.stringify(chartData.content ?? chartData)
      writeJson(LAYOUT_KEY, { id, content })
      const meta: ChartMetaInfo = {
        id,
        name: chartData.name || 'li-screener',
        symbol: chartData.symbol || '',
        resolution: (chartData.resolution || '15') as ResolutionString,
        timestamp: Date.now(),
      }
      writeJson(LAYOUT_META_KEY, meta)
      return id
    },

    async getChartContent(chartId: number | string): Promise<string> {
      const saved = readJson<{ id?: string; content?: string } | null>(LAYOUT_KEY, null)
      if (!saved?.content) {
        return ''
      }
      if (saved.id != null && String(saved.id) !== String(chartId) && String(chartId) !== DEFAULT_CHART_ID) {
        return saved.content
      }
      return saved.content
    },

    async getAllStudyTemplates(): Promise<StudyTemplateMetaInfo[]> {
      const all = readJson<Record<string, StudyTemplateData>>(STUDY_TEMPLATES_KEY, {})
      return Object.keys(all).map((name) => ({ name }))
    },

    async removeStudyTemplate(studyTemplateInfo: StudyTemplateMetaInfo): Promise<void> {
      const all = readJson<Record<string, StudyTemplateData>>(STUDY_TEMPLATES_KEY, {})
      delete all[studyTemplateInfo.name]
      writeJson(STUDY_TEMPLATES_KEY, all)
    },

    async saveStudyTemplate(studyTemplateData: StudyTemplateData): Promise<void> {
      const all = readJson<Record<string, StudyTemplateData>>(STUDY_TEMPLATES_KEY, {})
      all[studyTemplateData.name] = studyTemplateData
      writeJson(STUDY_TEMPLATES_KEY, all)
    },

    async getStudyTemplateContent(studyTemplateInfo: StudyTemplateMetaInfo): Promise<string> {
      const all = readJson<Record<string, StudyTemplateData>>(STUDY_TEMPLATES_KEY, {})
      return all[studyTemplateInfo.name]?.content ?? ''
    },

    async getDrawingTemplates(_toolName: string): Promise<string[]> {
      return []
    },

    async loadDrawingTemplate(_toolName: string, _templateName: string): Promise<string> {
      return ''
    },

    async removeDrawingTemplate(_toolName: string, _templateName: string): Promise<void> {
      // no-op
    },

    async saveDrawingTemplate(_toolName: string, _templateName: string, _content: string): Promise<void> {
      // no-op
    },

    async getChartTemplateContent(_templateName: string): Promise<ChartTemplate> {
      return null as unknown as ChartTemplate
    },

    async getAllChartTemplates(): Promise<string[]> {
      return []
    },

    async saveChartTemplate(_newName: string, _theme: ChartTemplateContent): Promise<void> {
      // no-op
    },

    async removeChartTemplate(_templateName: string): Promise<void> {
      // no-op
    },

    async saveLineToolsAndGroups(
      layoutId: string | undefined,
      chartId: string | number,
      state: LineToolsAndGroupsState,
    ): Promise<void> {
      const symbol = state.symbol?.trim()
      const key = lineToolsKey(layoutId, chartId, symbol)
      writeJson(key, serializeLineTools(state))
      // Дублируем без symbol — fallback при load без context.symbol
      if (symbol) {
        writeJson(lineToolsKey(layoutId, chartId), serializeLineTools(state))
      }
    },

    async loadLineToolsAndGroups(
      layoutId: string | undefined,
      chartId: string | number,
      _requestType: LineToolsAndGroupsLoadRequestType,
      requestContext: LineToolsAndGroupsLoadRequestContext,
    ): Promise<Partial<LineToolsAndGroupsState> | null> {
      const symbol = requestContext?.symbol?.trim()
      const keys = [lineToolsKey(layoutId, chartId, symbol), lineToolsKey(layoutId, chartId)].filter(
        (k, i, arr) => arr.indexOf(k) === i,
      )
      for (const key of keys) {
        const raw = readJson<PersistedLineTools | null>(key, null)
        const state = deserializeLineTools(raw)
        if (state) {
          return state
        }
      }
      return null
    },
  }
}
