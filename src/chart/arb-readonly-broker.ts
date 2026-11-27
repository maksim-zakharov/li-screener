import {
  ConnectionStatus,
  Side,
  type AccountId,
  type AccountManagerInfo,
  type AccountMetainfo,
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
  subscribeArbBrokerChartPositions,
  type ArbBrokerChartPosition,
} from '@/arbitrages/arb-broker-positions.store'

const ACCOUNT_ID = 'arb-readonly' as AccountId

const TRADE_DISABLED = 'С графика нельзя выставлять и отменять заявки'

/** Read-only Broker: только линии позиций, без торговли. */
export const ARB_READONLY_BROKER_CONFIG: SingleBrokerMetaInfo = {
  configFlags: {
    supportPositions: true,
    supportMultiposition: true,
    supportOrdersHistory: false,
    supportClosePosition: false,
    supportReversePosition: false,
    supportNativeReversePosition: false,
    /** Показ TP/SL линий на позиции (без редактирования с графика). */
    supportPositionBrackets: true,
    supportOrderBrackets: false,
    supportModifyOrderPrice: false,
    supportEditAmount: false,
    supportModifyBrackets: false,
    supportModifyPositionBrackets: false,
    supportPLUpdate: true,
    supportMarketOrders: false,
    supportLimitOrders: false,
    supportStopOrders: false,
    supportStopLimitOrders: false,
    showQuantityInsteadOfAmount: true,
  },
}

/**
 * Broker API только для отображения арб-позиций на графике.
 * place/modify/cancel — отклоняются.
 */
export class ArbReadonlyBroker implements IBrokerTerminal {
  private readonly _host: IBrokerConnectionAdapterHost
  private readonly _unsubscribe: () => void
  private readonly _published = new Map<string, Position>()
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
    /** Пустой массив — без пункта Trade в контекстном меню. */
    return []
  }

  /**
   * tradable=true — иначе TV может не рисовать линии позиций.
   * Реальный запрет — placeOrder / cancel / modify + disabled UI.
   */
  async isTradable(_symbol: string): Promise<IsTradableResult> {
    return { tradable: true }
  }

  async orders(): Promise<Order[]> {
    return []
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

  async modifyOrder(_order: Order): Promise<void> {
    throw new Error(TRADE_DISABLED)
  }

  async cancelOrder(_orderId: string): Promise<void> {
    throw new Error(TRADE_DISABLED)
  }

  async cancelOrders(_symbol: string, _side: Side | undefined, _ordersIds: string[]): Promise<void> {
    throw new Error(TRADE_DISABLED)
  }

  async closePosition(_positionId: string): Promise<void> {
    throw new Error(TRADE_DISABLED)
  }

  private _syncPositions(): void {
    if (this._destroyed) {
      return
    }
    const next = getArbBrokerChartPositions().map(toTvPosition)
    const nextIds = new Set(next.map((row) => row.id))

    for (const [id, prev] of this._published) {
      if (!nextIds.has(id)) {
        try {
          this._host.positionUpdate({ ...prev, qty: 0 })
        } catch (err) {
          console.warn('Arb broker: снятие позиции', id, err)
        }
        this._published.delete(id)
      }
    }

    for (const position of next) {
      this._published.set(position.id, position)
      try {
        this._host.positionUpdate(position)
        if (position.pl != null && Number.isFinite(position.pl)) {
          this._host.plUpdate(position.id, position.pl)
        }
      } catch (err) {
        console.warn('Arb broker: обновление позиции', position.id, err)
      }
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
