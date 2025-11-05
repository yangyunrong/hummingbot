import os  
from decimal import Decimal  
from typing import Dict, List  
from collections import deque  
  
import pandas_ta as ta  
from pydantic import Field  
  
from hummingbot.client.config.config_data_types import BaseClientModel  
from hummingbot.connector.connector_base import ConnectorBase  
from hummingbot.core.data_type.common import TradeType  
from hummingbot.data_feed.candles_feed.candles_factory import CandlesFactory  
from hummingbot.data_feed.candles_feed.data_types import CandlesConfig  
from hummingbot.strategy.script_strategy_base import ScriptStrategyBase  
from hummingbot.strategy_v2.executors.position_executor.data_types import (  
    PositionExecutorConfig,  
    TripleBarrierConfig  
)  
from hummingbot.strategy_v2.executors.position_executor.position_executor import PositionExecutor  
  
  
class MacdCrossoverConfig(BaseClientModel):  
    script_file_name: str = Field(default_factory=lambda: os.path.basename(__file__))  
    exchange: str = Field("gate_io_perpetual", json_schema_extra={  
        "prompt": "Exchange name (e.g., gate_io_perpetual, binance_perpetual)",  
        "prompt_on_new": True})  
    trading_pair: str = Field("XRP-USDT", json_schema_extra={  
        "prompt": "Trading pair (e.g., XRP-USDT)",  
        "prompt_on_new": True})  
    order_amount_xrp: Decimal = Field(Decimal("100"), json_schema_extra={  
        "prompt": "Order amount in XRP",  
        "prompt_on_new": True})  
    leverage: int = Field(5, json_schema_extra={  
        "prompt": "Leverage to use",  
        "prompt_on_new": True})  
    macd_fast_period: int = Field(12, json_schema_extra={  
        "prompt": "MACD fast period",  
        "prompt_on_new": True})  
    macd_slow_period: int = Field(26, json_schema_extra={  
        "prompt": "MACD slow period",  
        "prompt_on_new": True})  
    macd_signal_period: int = Field(9, json_schema_extra={  
        "prompt": "MACD signal period",  
        "prompt_on_new": True})  
    stop_loss_pct: Decimal = Field(Decimal("0.01"), json_schema_extra={  
        "prompt": "Stop loss percentage (e.g., 0.01 for 1%)",  
        "prompt_on_new": True})  
    take_profit_pct: Decimal = Field(Decimal("0.02"), json_schema_extra={  
        "prompt": "Take profit percentage (e.g., 0.02 for 2%)",  
        "prompt_on_new": True})  
    candle_interval: str = Field("3m", json_schema_extra={  
        "prompt": "Candle interval (e.g., 1m, 3m, 5m, 15m)",  
        "prompt_on_new": True})  
    max_records: int = Field(200, json_schema_extra={  
        "prompt": "Maximum candle records to keep",  
        "prompt_on_new": False})  
    time_limit: int = Field(3600, json_schema_extra={  
        "prompt": "Time limit for position in seconds (0 for no limit)",  
        "prompt_on_new": False})  
  
  
class MacdCrossoverStrategy(ScriptStrategyBase):  
    """  
    MACD Crossover Strategy for XRP-USDT  
    - Opens long position when MACD crosses above Signal line (Golden Cross)  
    - Opens short position when MACD crosses below Signal line (Death Cross)  
    - Uses PositionExecutor for stop loss and take profit management  
    - Orders are placed in XRP quantity  
    """  
  
    @classmethod  
    def init_markets(cls, config: MacdCrossoverConfig):  
        cls.markets = {config.exchange: {config.trading_pair}}  
  
    def __init__(self, connectors: Dict[str, ConnectorBase], config: MacdCrossoverConfig):  
        super().__init__(connectors)  
        self.config = config  
          
        # Initialize candles feed  
        self.candles = CandlesFactory.get_candle(  
            CandlesConfig(  
                connector=config.exchange,  
                trading_pair=config.trading_pair,  
                interval=config.candle_interval,  
                max_records=config.max_records  
            )  
        )  
        self.candles.start()  
          
        # Position management  
        self.max_executors = 1  
        self.active_executors: List[PositionExecutor] = []  
        self.stored_executors: deque = deque(maxlen=10)  
          
        # Leverage flag  
        self.set_leverage_flag = None  
  
    def on_tick(self):  
        """Main strategy logic executed on each tick"""  
        self.check_and_set_leverage()  
          
        # Only trade if we have available executor slots and candles are ready  
        if len(self.get_active_executors()) < self.max_executors and self.candles.ready:  
            signal = self.get_macd_signal()  
              
            if signal != 0 and self.is_margin_enough():  
                self.create_position(signal)  
          
        self.clean_and_store_executors()  
  
    def get_macd_signal(self) -> int:  
        """  
        Calculate MACD and detect crossover signals  
        Returns: 1 for golden cross (buy), -1 for death cross (sell), 0 for no signal  
        """  
        df = self.candles.candles_df.copy()  
          
        # Calculate MACD using pandas_ta  
        df.ta.macd(  
            fast=self.config.macd_fast_period,  
            slow=self.config.macd_slow_period,  
            signal=self.config.macd_signal_period,  
            append=True  
        )  
          
        # Get column names (pandas_ta naming convention)  
        macd_col = f"MACD_{self.config.macd_fast_period}_{self.config.macd_slow_period}_{self.config.macd_signal_period}"  
        signal_col = f"MACDs_{self.config.macd_fast_period}_{self.config.macd_slow_period}_{self.config.macd_signal_period}"  
          
        # Need at least 2 candles to detect crossover  
        if len(df) < 2:  
            return 0  
          
        macd_prev = df[macd_col].iloc[-2]  
        signal_prev = df[signal_col].iloc[-2]  
        macd_curr = df[macd_col].iloc[-1]  
        signal_curr = df[signal_col].iloc[-1]  
          
        # Golden Cross: MACD crosses above Signal  
        if macd_prev < signal_prev and macd_curr > signal_curr:  
            self.logger().info(f"Golden Cross detected! MACD: {macd_curr:.4f}, Signal: {signal_curr:.4f}")  
            return 1  
          
        # Death Cross: MACD crosses below Signal  
        elif macd_prev > signal_prev and macd_curr < signal_curr:  
            self.logger().info(f"Death Cross detected! MACD: {macd_curr:.4f}, Signal: {signal_curr:.4f}")  
            return -1  
          
        return 0  
  
    def create_position(self, signal: int):  
        """Create a new position based on signal"""  
        price = self.connectors[self.config.exchange].get_mid_price(self.config.trading_pair)  
        amount = self.config.order_amount_xrp  # Direct XRP quantity  
          
        side = TradeType.BUY if signal > 0 else TradeType.SELL  
          
        self.logger().info(  
            f"Creating {'LONG' if signal > 0 else 'SHORT'} position at {price:.4f} with {amount} XRP"  
        )  
          
        executor = PositionExecutor(  
            config=PositionExecutorConfig(  
                timestamp=self.current_timestamp,  
                trading_pair=self.config.trading_pair,  
                connector_name=self.config.exchange,  
                side=side,  
                entry_price=price,  
                amount=amount,  
                triple_barrier_config=TripleBarrierConfig(  
                    stop_loss=self.config.stop_loss_pct,  
                    take_profit=self.config.take_profit_pct,  
                    time_limit=self.config.time_limit if self.config.time_limit > 0 else None  
                )  
            ),  
            strategy=self  
        )  
          
        self.active_executors.append(executor)  
  
    def get_active_executors(self) -> List[PositionExecutor]:  
        """Get list of active (not closed) executors"""  
        return [executor for executor in self.active_executors if not executor.is_closed]  
  
    def clean_and_store_executors(self):  
        """Clean up closed executors and store them for reporting"""  
        for executor in self.active_executors:  
            if executor.is_closed:  
                self.stored_executors.append(executor)  
          
        self.active_executors = [e for e in self.active_executors if not e.is_closed]  
  
    def check_and_set_leverage(self):  
        """Set leverage if not already set"""  
        if self.set_leverage_flag is None:  
            connector = self.connectors[self.config.exchange]  
            if hasattr(connector, 'set_leverage'):  
                connector.set_leverage(self.config.trading_pair, self.config.leverage)  
                self.set_leverage_flag = True  
                self.logger().info(f"Leverage set to {self.config.leverage}x")  
  
    def is_margin_enough(self) -> bool:  
        """Check if there's enough margin to open a position"""  
        connector = self.connectors[self.config.exchange]  
        balance = connector.get_balance(self.config.trading_pair.split("-")[1])  # USDT balance  
        price = connector.get_mid_price(self.config.trading_pair)  
        required_margin = (self.config.order_amount_xrp * price) / self.config.leverage  
        return balance >= required_margin  
  
    async def on_stop(self):  
        """Cleanup when strategy stops"""  
        self.close_open_positions()  
        self.candles.stop()  
  
    def format_status(self) -> str:  
        """Format status display"""  
        if not self.candles.ready:  
            return "Waiting for candles data..."  
          
        df = self.candles.candles_df  
        lines = [  
            f"\n{'='*50}",  
            f"MACD Crossover Strategy Status",  
            f"{'='*50}",  
            f"Exchange: {self.config.exchange}",  
            f"Trading Pair: {self.config.trading_pair}",  
            f"Order Amount: {self.config.order_amount_xrp} XRP",  
            f"Leverage: {self.config.leverage}x",  
            f"Active Positions: {len(self.get_active_executors())}",  
            f"Candles Ready: {self.candles.ready}",  
            f"Latest Candle Time: {df.index[-1] if len(df) > 0 else 'N/A'}",  
            f"{'='*50}\n"  
        ]  
          
        return "\n".join(lines)