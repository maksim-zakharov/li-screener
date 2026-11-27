import {
  ConnectionStatus,
  OrderStatus,
  OrderType,
  ParentType,
  Side,
  type AccountId,
  type AccountManagerInfo,
  type AccountMetainfo,
  type BracketOrder,
  type Brackets,
  type Execution,
  type IBrokerConnectionAdapterHost,
  type IBrokerTerminal,
  type InstrumentInfo,
  type IsTradableResult,
  type Order,
  type PlaceOrderResult,
  type Position,
  type PreOrder,
  type SingleBrokerMetaInfo,
} from '@/assets/charting_library'
import {
  getArbBrokerChartPositions,
  patchArbBrokerPositionBrackets,
  subscribeArbBrokerChartPositions,
  type ArbBrokerChartPosition,
} from '@/arbitrages/arb-broker-positions.store'

const ACCOUNT_ID = 'arb-readonly' as AccountId

const TRADE_DISABLED = 'С графика нельзя выставлять и отменять заявки'

/** Broker: позиции + native TP/SL bracket-ордера; новые заявки с графика запрещены. */
export const ARB_READONLY_BROKER_CONFIG: SingleBrokerMetaInfo = {
  configFlags: {
    supportPositions: true,
    supportMultiposition: true,
    supportOrdersHistory: false,
    supportClosePosition: false,
    supportReversePosition: false,
    supportNativeReversePosition: false,
    /** Линии TP/SL: position + linked BracketOrder (orderUpdate). */
    supportPositionBrackets: true,
    supportOrderBrackets: false,
    supportStopLoss: true,
    supportTrailingStop: false,
    supportGuaranteedStop: false,
    /** Drag цены bracket-лимитки/стопа. */
    supportModifyOrderPrice: true,
    supportEditAmount: false,
    supportModifyBrackets: true,
    supportModifyPositionBrackets: true,
    supportPLUpdate: true,
    supportMarketOrders: false,
    /** Нужны, чтобы TV рисовал Working limit/stop bracket на графике. */
    supportLimitOrders: true,
    supportStopOrders: true,
    supportStopLimitOrders: false,
    showQuantityInsteadOfAmount: true,
  },
}

/**
 * Broker API: арб-позиции + синтетические TP/SL bracket-ордера.
 * placeOrder / close — отклоняются.
 */
export class ArbReadonlyBroker implements IBrokerTerminal {
  private readonly _host: IBrokerConnectionAdapterHost
  private readonly _unsubscribe: () => void
  private readonly _published = new Map<string, Position>()
  /** Bracket-ордера по id (`tp:` / `sl:` + positionId). */
  private readonly _brackets = new Map<string, BracketOrder>()
  private _destroyed = false

  constructor(host: IBrokerConnectionAdapterHost) {
    this._host = host
    this._unsubscribe = subscribeArbBrokerChartPositions(() => {
      this._syncPositions()
    })
    this._syncPositions()
  }

  destroy(): void {
    this._destroyed = true
    this._unsubscribe()
    this._published.clear()
    this._brackets.clear()
  }

  connectionStatus(): ConnectionStatus {
    return ConnectionStatus.Connected
  }

  async accountsMetainfo(): Promise<AccountMetainfo[]> {
    return [{ id: ACCOUNT_ID, name: 'Арбитраж (просмотр)' }]
  }

  currentAccount(): AccountId {
    return ACCOUNT_ID
  }

  async chartContextMenuActions(): Promise<[]> {
    return []
  }

  /**
   * tradable=true — иначе TV может не рисовать линии позиций.
   * Реальный запрет — placeOrder / close.
   */
  async isTradable(_symbol: string): Promise<IsTradableResult> {
    return { tradable: true }
  }

  async orders(): Promise<Order[]> {
    return [...this._brackets.values()]
  }

  async ordersHistory(): Promise<Order[]> {
    return []
  }

  async positions(): Promise<Position[]> {
    return getArbBrokerChartPositions().map(toTvPosition)
  }

  async executions(_symbol: string): Promise<Execution[]> {
    return []
  }

  async symbolInfo(symbol: string): Promise<InstrumentInfo> {
    return {
      qty: { min: 1, max: 1_000_000, step: 1, default: 1 },
      pipValue: 1,
      pipSize: 0.001,
      minTick: 0.001,
      description: symbol,
      brokerSymbol: symbol,
    }
  }

  accountManagerInfo(): AccountManagerInfo {
    return {
      accountTitle: 'Арбитраж',
      summary: [],
      orderColumns: [],
      pages: [],
    }
  }

  async placeOrder(_order: PreOrder): Promise<PlaceOrderResult> {
    throw new Error(TRADE_DISABLED)
  }

  /**
   * Drag линии TP/SL (как заявки) → цена в позе.
   */
  async modifyOrder(order: Order): Promise<void> {
    const parsed = parseBracketOrderId(String(order.id ?? ''))
    if (!parsed) {
      throw new Error(TRADE_DISABLED)
    }
    const price =
      parsed.kind === 'tp'
        ? resolveBracketPrice(order.limitPrice ?? order.price)
        : resolveBracketPrice(order.stopPrice ?? order.price)
    if (price == null) {
      throw new Error('Некорректная цена уровня')
    }
    const patch =
      parsed.kind === 'tp' ? { takeProfit: price } : { stopLoss: price }
    const updated = patchArbBrokerPositionBrackets(parsed.positionId, patch)
    if (!updated) {
      throw new Error('Позиция не найдена')
    }
    this._publishPositionAndBrackets(updated)
  }

  async cancelOrder(orderId: string): Promise<void> {
    const parsed = parseBracketOrderId(orderId)
    if (!parsed) {
      throw new Error(TRADE_DISABLED)
    }
    const patch =
      parsed.kind === 'tp' ? { takeProfit: null } : { stopLoss: null }
    const updated = patchArbBrokerPositionBrackets(parsed.positionId, patch)
    if (!updated) {
      this._cancelBracketOrder(orderId)
      return
    }
    this._publishPositionAndBrackets(updated)
  }

  async cancelOrders(_symbol: string, _side: Side | undefined, ordersIds: string[]): Promise<void> {
    for (const id of ordersIds) {
      await this.cancelOrder(id)
    }
  }

  async closePosition(_positionId: string): Promise<void> {
    throw new Error(TRADE_DISABLED)
  }

  /**
   * Drag / диалог TP·SL на линии позиции → поза + bracket orderUpdate.
   */
  async editPositionBrackets(positionId: string, brackets: Brackets): Promise<void> {
    const patch: { takeProfit?: number | null; stopLoss?: number | null } = {}
    if ('takeProfit' in brackets) {
      patch.takeProfit = resolveBracketPrice(brackets.takeProfit)
    }
    if ('stopLoss' in brackets) {
      patch.stopLoss = resolveBracketPrice(brackets.stopLoss)
    }
    if (!('takeProfit' in patch) && !('stopLoss' in patch)) {
      return
    }

    const updated = patchArbBrokerPositionBrackets(positionId, patch)
    if (!updated) {
      throw new Error('Позиция не найдена')
    }
    this._publishPositionAndBrackets(updated)
  }

  private _syncPositions(): void {
    if (this._destroyed) {
      return
    }
    const rows = getArbBrokerChartPositions()
    const next = rows.map(toTvPosition)
    const nextIds = new Set(next.map((row) => row.id))

    for (const [id, prev] of this._published) {
      if (!nextIds.has(id)) {
        this._clearBracketsForPosition(id)
        try {
          this._host.positionUpdate({ ...prev, qty: 0 })
        } catch (err) {
          console.warn('Arb broker: снятие позиции', id, err)
        }
        this._published.delete(id)
      }
    }

    for (const row of rows) {
      this._publishPositionAndBrackets(row)
    }
  }

  private _publishPositionAndBrackets(row: ArbBrokerChartPosition): void {
    if (this._destroyed) {
      return
    }
    const position = toTvPosition(row)
    this._published.set(position.id, position)
    try {
      this._host.positionUpdate(position)
      if (position.pl != null && Number.isFinite(position.pl)) {
        this._host.plUpdate(position.id, position.pl)
      }
    } catch (err) {
      console.warn('Arb broker: обновление позиции', position.id, err)
    }
    this._syncBracketsForPosition(row)
  }

  /**
   * По доке TV: после positionUpdate нужны Working BracketOrder с parentType=Position.
   */
  private _syncBracketsForPosition(row: ArbBrokerChartPosition): void {
    const position = toTvPosition(row)
    const exitSide = position.side === Side.Buy ? Side.Sell : Side.Buy
    const tpId = bracketOrderId(row.id, 'tp')
    const slId = bracketOrderId(row.id, 'sl')

    if (row.takeProfit != null && Number.isFinite(row.takeProfit) && row.takeProfit > 0) {
      const order: BracketOrder = {
        id: tpId,
        symbol: row.symbol,
        qty: position.qty,
        side: exitSide,
        type: OrderType.Limit,
        status: OrderStatus.Working,
        limitPrice: row.takeProfit,
        parentId: row.id,
        parentType: ParentType.Position,
      }
      this._brackets.set(tpId, order)
      try {
        this._host.orderUpdate(order)
      } catch (err) {
        console.warn('Arb broker: TP orderUpdate', tpId, err)
      }
    } else {
      this._cancelBracketOrder(tpId)
    }

    if (row.stopLoss != null && Number.isFinite(row.stopLoss) && row.stopLoss > 0) {
      const order: BracketOrder = {
        id: slId,
        symbol: row.symbol,
        qty: position.qty,
        side: exitSide,
        type: OrderType.Stop,
        status: OrderStatus.Working,
        stopPrice: row.stopLoss,
        parentId: row.id,
        parentType: ParentType.Position,
      }
      this._brackets.set(slId, order)
      try {
        this._host.orderUpdate(order)
      } catch (err) {
        console.warn('Arb broker: SL orderUpdate', slId, err)
      }
    } else {
      this._cancelBracketOrder(slId)
    }
  }

  private _clearBracketsForPosition(positionId: string): void {
    this._cancelBracketOrder(bracketOrderId(positionId, 'tp'))
    this._cancelBracketOrder(bracketOrderId(positionId, 'sl'))
  }

  private _cancelBracketOrder(orderId: string): void {
    const prev = this._brackets.get(orderId)
    if (!prev) {
      return
    }
    this._brackets.delete(orderId)
    try {
      this._host.orderUpdate({ ...prev, status: OrderStatus.Canceled })
    } catch (err) {
      console.warn('Arb broker: cancel bracket', orderId, err)
    }
  }
}

/** Фабрика для `broker_factory`. */
export function createArbReadonlyBroker(host: IBrokerConnectionAdapterHost): ArbReadonlyBroker {
  return new ArbReadonlyBroker(host)
}

function toTvPosition(row: ArbBrokerChartPosition): Position {
  return {
    id: row.id,
    symbol: row.symbol,
    qty: row.qty,
    side: row.side === 'sell' ? Side.Sell : Side.Buy,
    avgPrice: row.avgPrice,
    ...(row.pl != null && Number.isFinite(row.pl) ? { pl: row.pl } : {}),
    ...(row.takeProfit != null && Number.isFinite(row.takeProfit)
      ? { takeProfit: row.takeProfit }
      : {}),
    ...(row.stopLoss != null && Number.isFinite(row.stopLoss) ? { stopLoss: row.stopLoss } : {}),
  }
}

/** Цена уровня с графика: >0 или null (снять). */
function resolveBracketPrice(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value
}

function bracketOrderId(positionId: string, kind: 'tp' | 'sl'): string {
  return `${kind}:${positionId}`
}

function parseBracketOrderId(
  orderId: string,
): { kind: 'tp' | 'sl'; positionId: string } | null {
  if (orderId.startsWith('tp:')) {
    return { kind: 'tp', positionId: orderId.slice(3) }
  }
  if (orderId.startsWith('sl:')) {
    return { kind: 'sl', positionId: orderId.slice(3) }
  }
  return null
}
